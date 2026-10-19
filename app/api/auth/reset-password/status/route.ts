import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { hashResetToken, readResetToken } from '@/lib/security/reset-token'

export async function GET(request: NextRequest) {
  try {
    const rateCheck = checkRateLimit(request, 'auth-reset-status', 120, 60 * 1000)
    if (!rateCheck.success) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const token = readResetToken(request)
    if (!token) {
      return NextResponse.json({ status: 'none' })
    }

    const adminClient = createAdminClient()
    const db = adminClient as any

    const { data: resetReq, error } = await db
      .from('password_reset_requests')
      .select('id, status, expires_at, rejection_reason')
      .eq('reset_token', hashResetToken(token))
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: 'Unable to check reset status.' }, { status: 500 })
    }

    // No recorded request behind this cookie (unknown or inactive email): look exactly like
    // a request still waiting for an administrator, so status checks reveal nothing.
    if (!resetReq) {
      return NextResponse.json({ status: 'pending' })
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
        message: 'This reset request has expired. Please submit a new request.'
      })
    }

    return NextResponse.json({
      status: resetReq.status,
      rejectionReason: resetReq.rejection_reason || undefined
    })
  } catch (err: any) {
    console.error('[reset-password/status] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
