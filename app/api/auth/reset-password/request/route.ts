import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit'
import {
  generateResetToken,
  hashResetToken,
  RESET_TOKEN_TTL_MS,
  setResetCookie,
} from '@/lib/security/reset-token'
import * as Sentry from '@sentry/nextjs'

const requestSchema = z.object({
  email: z.string().trim().email().transform((v) => v.toLowerCase()),
})

const SUBMITTED_MESSAGE =
  'If this email belongs to an active account, administrators have been asked to approve a reset. Keep this page open.'

// Every outcome looks the same to the caller, so the endpoint cannot be used to discover
// which emails have accounts or what state they are in. The browser always receives a
// fresh cookie token; when no request was recorded it simply never matches anything.
function submittedResponse(token: string) {
  const response = NextResponse.json({ success: true, status: 'pending', message: SUBMITTED_MESSAGE })
  setResetCookie(response, token)
  return response
}

export async function POST(request: NextRequest) {
  try {
    const rateCheck = await checkRateLimit(request, 'auth-reset-request', 5, 10 * 60 * 1000)
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

    // 1. Find user in database. Stored emails may carry uppercase letters, so match
    // case-insensitively (escaping LIKE wildcards so "_" or "%" stay literal).
    const { data: user, error: userError } = await db
      .from('users')
      .select('id, full_name, email, role, is_active, activation_status, oscar, unit')
      .ilike('email', email.replace(/[\\%_]/g, '\\$&'))
      .maybeSingle()

    if (userError) {
      console.error('[reset-password/request] Error looking up user:', userError)
      return NextResponse.json({ error: 'Unable to process reset request at this time.' }, { status: 500 })
    }

    const resetToken = generateResetToken()

    if (!user || user.activation_status !== 'active' || user.is_active === false) {
      return submittedResponse(resetToken)
    }

    // A new request supersedes any open one, so only the newest browser can finish a reset.
    const nowIso = new Date().toISOString()
    await db
      .from('password_reset_requests')
      .update({ status: 'expired', updated_at: nowIso })
      .eq('user_id', user.id)
      .in('status', ['pending', 'approved'])

    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString()

    // Capture client metadata so administrators can judge whether the request is genuine
    const ip = getClientIp(request.headers)
    const userAgent = request.headers.get('user-agent') || null

    const { data: newRequest, error: insertError } = await db
      .from('password_reset_requests')
      .insert({
        user_id: user.id,
        email: user.email,
        status: 'pending',
        reset_token: hashResetToken(resetToken),
        expires_at: expiresAt,
        ip_address: ip,
        user_agent: userAgent,
      })
      .select('id')
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
        message: `${user.full_name || user.email} requested a password reset. Confirm it with them directly before approving (Officers > Resets).`,
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
          ip_address: ip,
          user_agent: userAgent,
        },
      }))

      const { error: notifError } = await db.from('notifications').insert(notifications)
      if (notifError) {
        console.error('[reset-password/request] Notification insert error:', notifError)
      }
    }

    // Tell the account owner, so a reset they did not ask for gets reported.
    const { error: ownerNotifError } = await db.from('notifications').insert({
      user_id: user.id,
      title: 'Password reset requested',
      message: 'A password reset was requested for your account. If this was not you, contact Command Center immediately.',
      type: 'alert',
      channel: 'push',
      status: 'pending',
      metadata: { kind: 'password_reset_requested_for_you', request_id: newRequest.id },
    })
    if (ownerNotifError) {
      console.error('[reset-password/request] Owner notification error:', ownerNotifError)
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

    return submittedResponse(resetToken)
  } catch (err: any) {
    console.error('[reset-password/request] Unexpected error:', err)
    Sentry.captureException(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
