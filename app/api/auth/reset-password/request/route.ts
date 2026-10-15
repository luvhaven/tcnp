import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { randomBytes } from 'crypto'
import * as Sentry from '@sentry/nextjs'

const requestSchema = z.object({
  email: z.string().trim().email().transform((v) => v.toLowerCase()),
})

export async function POST(request: Request) {
  try {
    const rateCheck = checkRateLimit(request, 'auth-reset-request', 5, 10 * 60 * 1000)
    if (!rateCheck.success) {
      return NextResponse.json(
        { error: 'Too many reset requests. Please wait a few minutes before trying again.' },
        { status: 429 }
      )
    }

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
    }

    const parsed = requestSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
    }

    const email = parsed.data.email
    const adminClient = createAdminClient()
    const db = adminClient as any

    // 1. Find user in database
    const { data: user, error: userError } = await db
      .from('users')
      .select('id, full_name, email, role, is_active, activation_status, oscar, unit')
      .eq('email', email)
      .maybeSingle()

    if (userError) {
      console.error('[reset-password/request] Error looking up user:', userError)
      return NextResponse.json({ error: 'Unable to process reset request at this time.' }, { status: 500 })
    }

    if (!user) {
      return NextResponse.json(
        { error: 'No account found matching this email address. Please verify your email or request access.' },
        { status: 404 }
      )
    }

    if (user.activation_status === 'pending') {
      return NextResponse.json(
        { error: 'This account is pending initial admin approval. You cannot reset password yet.' },
        { status: 403 }
      )
    }

    if (user.is_active === false || user.activation_status === 'deactivated') {
      return NextResponse.json(
        { error: 'This account has been deactivated. Please contact Command Center.' },
        { status: 403 }
      )
    }

    // 2. Check for an active existing request within the last hour
    const nowIso = new Date().toISOString()
    const { data: existingRequest } = await db
      .from('password_reset_requests')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['pending', 'approved'])
      .gt('expires_at', nowIso)
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingRequest) {
      return NextResponse.json({
        success: true,
        requestId: existingRequest.id,
        resetToken: existingRequest.reset_token,
        status: existingRequest.status,
        email: user.email,
        message: existingRequest.status === 'approved'
          ? 'Your reset request has been approved! You can now set your new password.'
          : 'A reset request is already active and awaiting administrator approval.'
      })
    }

    // 3. Generate a secure reset token
    const resetToken = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() // 2 hours

    // Capture client metadata if available
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || null
    const userAgent = request.headers.get('user-agent') || null

    const { data: newRequest, error: insertError } = await db
      .from('password_reset_requests')
      .insert({
        user_id: user.id,
        email: user.email,
        status: 'pending',
        reset_token: resetToken,
        expires_at: expiresAt,
        ip_address: ip,
        user_agent: userAgent,
      })
      .select('id, status, reset_token, email')
      .single()

    if (insertError || !newRequest) {
      console.error('[reset-password/request] Failed to insert request:', insertError)
      return NextResponse.json({ error: 'Failed to record reset request. Please retry.' }, { status: 500 })
    }

    // 4. Notify all active platform administrators
    const { data: admins } = await db
      .from('users')
      .select('id, full_name, email')
      .in('role', ['admin', 'super_admin', 'dev_admin'])
      .eq('is_active', true)
      .eq('activation_status', 'active')

    if (admins && admins.length > 0) {
      const notifications = admins.map((admin: { id: string }) => ({
        user_id: admin.id,
        title: 'Password Reset Request',
        message: `${user.full_name || user.email} requested a password reset. Review in Officers > Resets.`,
        type: 'alert',
        channel: 'push',
        status: 'pending',
        metadata: {
          kind: 'password_reset_request',
          request_id: newRequest.id,
          target_user_id: user.id,
          email: user.email,
          full_name: user.full_name,
          oscar: user.oscar,
          unit: user.unit,
        },
      }))

      const { error: notifError } = await db.from('notifications').insert(notifications)
      if (notifError) {
        console.error('[reset-password/request] Notification insert error:', notifError)
      }
    }

    // 5. Broadcast to admin channel for any active admin dashboard tabs
    try {
      const channel = adminClient.channel('admin-password-resets')
      await channel.subscribe()
      await channel.send({
        type: 'broadcast',
        event: 'new_request',
        payload: {
          requestId: newRequest.id,
          user_id: user.id,
          email: user.email,
          full_name: user.full_name,
        },
      })
      await adminClient.removeChannel(channel)
    } catch (broadcastErr) {
      console.warn('[reset-password/request] Broadcast error:', broadcastErr)
    }

    return NextResponse.json({
      success: true,
      requestId: newRequest.id,
      resetToken: newRequest.reset_token,
      status: 'pending',
      email: user.email,
      message: 'Reset request submitted to administrators.',
    })
  } catch (err: any) {
    console.error('[reset-password/request] Unexpected error:', err)
    Sentry.captureException(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
