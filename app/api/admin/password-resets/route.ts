import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPlatformAdministrator } from '@/lib/utils'

/** A pending or approved request whose expiry has passed is shown as expired. */
function markExpired<T extends { status: string; expires_at: string | null }>(row: T, now: number = Date.now()): T {
  if ((row.status === 'pending' || row.status === 'approved') && row.expires_at && new Date(row.expires_at).getTime() < now) {
    return { ...row, status: 'expired' }
  }
  return row
}

export async function GET(request: Request) {
  try {
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: caller, error: callerError } = await supabase
      .from('users')
      .select('role, has_admin_access, activation_status, is_active')
      .eq('id', user.id)
      .single()

    if (callerError || !caller || caller.activation_status !== 'active' || caller.is_active === false) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!isPlatformAdministrator(caller.role, caller.has_admin_access)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const adminClient = createAdminClient()
    const db = adminClient as any

    // A pending or approved request past its expiry can never be used. Record
    // it as expired so it stops showing as awaiting action. If that write
    // fails, the rows are still reported as expired below.
    const nowIso = new Date().toISOString()
    const { error: expireError } = await db
      .from('password_reset_requests')
      .update({ status: 'expired', updated_at: nowIso })
      .in('status', ['pending', 'approved'])
      .lt('expires_at', nowIso)
    if (expireError) console.warn('[admin/password-resets] Could not mark expired requests:', expireError)

    // Pending requests are never capped; only the history is limited.
    const base = () => db
      .from('password_reset_requests')
      .select(`
        id,
        user_id,
        email,
        status,
        requested_at,
        approved_at,
        approved_by,
        rejected_at,
        rejected_by,
        rejection_reason,
        completed_at,
        expires_at,
        ip_address,
        user_agent,
        created_at,
        user:users!password_reset_requests_user_id_fkey(
          id,
          full_name,
          email,
          role,
          unit,
          oscar,
          photo_url
        )
      `)
    const [pending, history] = await Promise.all([
      base().in('status', ['pending', 'approved']).order('requested_at', { ascending: false }),
      base().not('status', 'in', '(pending,approved)').order('requested_at', { ascending: false }).limit(50),
    ])
    const fetchError = pending.error || history.error
    const requests = [...(pending.data || []), ...(history.data || [])].map(row => markExpired(row))

    if (fetchError) {
      console.error('[admin/password-resets] Error fetching requests:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch reset requests' }, { status: 500 })
    }

    return NextResponse.json({ requests: requests || [] })
  } catch (err: any) {
    console.error('[admin/password-resets] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
