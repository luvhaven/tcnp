import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPlatformAdministrator } from '@/lib/utils'

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: caller, error: callerError } = await supabase
      .from('users')
      .select('id, full_name, email, role, activation_status, is_active')
      .eq('id', user.id)
      .single()

    if (callerError || !caller || caller.activation_status !== 'active' || caller.is_active === false) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!isPlatformAdministrator(caller.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { requestId, reason } = body

    if (!requestId) {
      return NextResponse.json({ error: 'Missing requestId' }, { status: 400 })
    }

    const adminClient = createAdminClient()
    const db = adminClient as any

    const { data: resetReq, error: reqError } = await db
      .from('password_reset_requests')
      .select('*')
      .eq('id', requestId)
      .single()

    if (reqError || !resetReq) {
      return NextResponse.json({ error: 'Reset request not found' }, { status: 404 })
    }

    if (resetReq.status === 'completed') {
      return NextResponse.json({ error: 'Cannot reject an already completed request.' }, { status: 400 })
    }

    const nowIso = new Date().toISOString()
    const { error: updateError } = await db
      .from('password_reset_requests')
      .update({
        status: 'rejected',
        rejected_at: nowIso,
        rejected_by: caller.id,
        rejection_reason: reason?.trim() || null,
        updated_at: nowIso,
      })
      .eq('id', requestId)

    if (updateError) {
      console.error('[admin/password-resets/reject] Update error:', updateError)
      return NextResponse.json({ error: 'Failed to reject request' }, { status: 500 })
    }

    // Broadcast to the user's waiting screen channel
    try {
      const userChannel = adminClient.channel(`password-reset:${requestId}`)
      await userChannel.subscribe()
      await userChannel.send({
        type: 'broadcast',
        event: 'status_changed',
        payload: {
          requestId,
          status: 'rejected',
          reason: reason?.trim() || undefined,
        },
      })
      await adminClient.removeChannel(userChannel)
    } catch (broadcastErr) {
      console.warn('[admin/password-resets/reject] User broadcast error:', broadcastErr)
    }

    // Broadcast to admin dashboard channel
    try {
      const adminChannel = adminClient.channel('admin-password-resets')
      await adminChannel.subscribe()
      await adminChannel.send({
        type: 'broadcast',
        event: 'request_updated',
        payload: {
          requestId,
          status: 'rejected',
          rejectedBy: caller.full_name || caller.email,
        },
      })
      await adminClient.removeChannel(adminChannel)
    } catch (adminBroadcastErr) {
      console.warn('[admin/password-resets/reject] Admin broadcast error:', adminBroadcastErr)
    }

    // Insert audit log
    try {
      await db.from('audit_logs').insert({
        user_id: caller.id,
        user_email: caller.email,
        user_role: caller.role,
        action: 'password_reset_rejected',
        entity_type: 'password_reset_request',
        entity_id: requestId,
        target_id: resetReq.user_id,
        status: 'success',
        description: `Admin rejected password reset for ${resetReq.email}${reason ? `: ${reason}` : ''}`,
      })
    } catch (auditErr) {
      console.warn('[admin/password-resets/reject] Audit log error:', auditErr)
    }

    return NextResponse.json({
      success: true,
      message: `Password reset request for ${resetReq.email} was rejected.`,
    })
  } catch (err: any) {
    console.error('[admin/password-resets/reject] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
