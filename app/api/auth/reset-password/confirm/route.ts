import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/security/rate-limit'
import * as Sentry from '@sentry/nextjs'

const confirmSchema = z.object({
  token: z.string().min(16),
  newPassword: z.string().min(6, 'Password must be at least 6 characters').max(4096),
})

export async function POST(request: Request) {
  try {
    const rateCheck = checkRateLimit(request, 'auth-reset-confirm', 6, 5 * 60 * 1000)
    if (!rateCheck.success) {
      return NextResponse.json({ error: 'Too many attempts. Please wait a few minutes.' }, { status: 429 })
    }

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
    }

    const parsed = confirmSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid input.' }, { status: 400 })
    }

    const { token, newPassword } = parsed.data
    const adminClient = createAdminClient()
    const db = adminClient as any

    // 1. Fetch reset request
    const { data: resetReq, error: reqError } = await db
      .from('password_reset_requests')
      .select('id, user_id, email, status, expires_at')
      .eq('reset_token', token)
      .maybeSingle()

    if (reqError || !resetReq) {
      return NextResponse.json({ error: 'Reset request not found or invalid.' }, { status: 404 })
    }

    if (resetReq.status === 'completed') {
      return NextResponse.json(
        { error: 'This reset request has already been used. Please sign in or request a new reset.' },
        { status: 400 }
      )
    }

    if (resetReq.status !== 'approved') {
      return NextResponse.json(
        { error: `This reset request is currently ${resetReq.status}. Only approved requests can reset password.` },
        { status: 403 }
      )
    }

    if (new Date(resetReq.expires_at) < new Date()) {
      await db
        .from('password_reset_requests')
        .update({ status: 'expired' })
        .eq('id', resetReq.id)

      return NextResponse.json(
        { error: 'This reset request has expired. Please submit a new request.' },
        { status: 410 }
      )
    }

    // 2. Update user's password in Supabase Auth
    const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(resetReq.user_id, {
      password: newPassword,
    })

    if (authUpdateError) {
      console.error('[reset-password/confirm] Supabase auth update error:', authUpdateError)
      return NextResponse.json(
        { error: authUpdateError.message || 'Failed to update password. Please try again.' },
        { status: 500 }
      )
    }

    // 3. Mark request completed & update users table
    const nowIso = new Date().toISOString()
    await db
      .from('password_reset_requests')
      .update({
        status: 'completed',
        completed_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', resetReq.id)

    await db
      .from('users')
      .update({
        password_last_changed: nowIso,
        updated_at: nowIso,
      })
      .eq('id', resetReq.user_id)

    // 4. Log in audit_logs
    try {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || null
      const userAgent = request.headers.get('user-agent') || null

      await db.from('audit_logs').insert({
        user_id: resetReq.user_id,
        user_email: resetReq.email,
        action: 'password_reset_completed',
        entity_type: 'user',
        entity_id: resetReq.user_id,
        status: 'success',
        description: 'User successfully completed password reset with administrator approval.',
        ip_address: ip,
        user_agent: userAgent,
      })
    } catch (auditErr) {
      console.warn('[reset-password/confirm] Failed to log audit event:', auditErr)
    }

    return NextResponse.json({
      success: true,
      message: 'Password reset successfully. You can now sign in with your new password.',
    })
  } catch (err: any) {
    console.error('[reset-password/confirm] Unexpected error:', err)
    Sentry.captureException(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
