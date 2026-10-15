import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/security/rate-limit'

export async function GET(request: Request) {
  try {
    const rateCheck = checkRateLimit(request, 'auth-reset-status', 120, 60 * 1000)
    if (!rateCheck.success) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')?.trim()

    if (!token || token.length < 16) {
      return NextResponse.json({ error: 'Invalid or missing reset token.' }, { status: 400 })
    }

    const adminClient = createAdminClient()
    const db = adminClient as any

    const { data: resetReq, error } = await db
      .from('password_reset_requests')
      .select('id, status, email, expires_at, rejection_reason')
      .eq('reset_token', token)
      .maybeSingle()

    if (error || !resetReq) {
      return NextResponse.json({ error: 'Reset request not found or expired.' }, { status: 404 })
    }

    // Check expiration
    const isExpired = new Date(resetReq.expires_at) < new Date()
    if (isExpired && (resetReq.status === 'pending' || resetReq.status === 'approved')) {
      await db
        .from('password_reset_requests')
        .update({ status: 'expired' })
        .eq('id', resetReq.id)

      return NextResponse.json({
        status: 'expired',
        email: resetReq.email,
        message: 'This reset request has expired. Please submit a new request.'
      })
    }

    return NextResponse.json({
      status: resetReq.status,
      requestId: resetReq.id,
      email: resetReq.email,
      rejectionReason: resetReq.rejection_reason || undefined
    })
  } catch (err: any) {
    console.error('[reset-password/status] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
