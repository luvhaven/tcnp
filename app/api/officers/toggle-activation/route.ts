import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { isPlatformAdministrator, platformAuthorityRank } from '@/lib/utils'
import { isPermanentOwnerEmail } from '@/lib/platform-owner'

// Build the hardened service-role client right here to avoid any wrapper issues
function buildAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env vars are missing')
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  })
}

export async function POST(request: Request) {
  try {
    // 1. Verify caller is authenticated, active, and is an admin
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: callerRow, error: callerError } = await supabase
      .from('users')
      .select('role, has_admin_access, activation_status, is_active')
      .eq('id', user.id)
      .single()

    if (callerError || !callerRow) {
      return NextResponse.json({ error: 'Could not verify caller role' }, { status: 403 })
    }

    if (callerRow.activation_status !== 'active' || callerRow.is_active === false) {
      return NextResponse.json({ error: 'Account is inactive or unavailable' }, { status: 403 })
    }

    if (!isPlatformAdministrator(callerRow.role, callerRow.has_admin_access)) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
    }

    // 2. Parse body
    const body = await request.json()
    // `active` is the desired state (idempotent). `isActive` is the legacy
    // "current state, please flip it" field, kept for older clients.
    const { officerId, active, isActive, overrideDecline } = body as {
      officerId?: string; active?: boolean; isActive?: boolean; overrideDecline?: boolean
    }
    const desired = typeof active === 'boolean' ? active : typeof isActive === 'boolean' ? !isActive : null

    if (!officerId || desired === null) {
      return NextResponse.json({ error: 'Missing or invalid fields: officerId and active (boolean) required' }, { status: 400 })
    }
    if (officerId === user.id) {
      return NextResponse.json({ error: 'You cannot change your own account status' }, { status: 403 })
    }

    // 3. Perform update using service role to bypass RLS entirely
    const adminClient = buildAdminClient()
    const { data: target } = await adminClient
      .from('users')
      .select('role, has_admin_access, email, is_directory_hidden, activation_status')
      .eq('id', officerId)
      .single()

    if (!target) {
      return NextResponse.json({ error: 'Officer not found' }, { status: 404 })
    }
    if (target.is_directory_hidden) return NextResponse.json({ error: 'Officer not found' }, { status: 404 })
    if (target.role === 'super_admin' || isPermanentOwnerEmail(target.email)) {
      return NextResponse.json({ error: 'The permanent owner account cannot be deactivated' }, { status: 403 })
    }
    if (platformAuthorityRank(target.role, target.has_admin_access) >= 80 && callerRow.role !== 'super_admin') {
      return NextResponse.json({ error: 'Only Super Admin can change an administrator account' }, { status: 403 })
    }
    const newIsActive = desired
    // users_activation_status_check allows pending | active | deactivated | declined;
    // the old 'inactive' value violated it, so every deactivation failed with a 500.
    const newStatus = newIsActive ? 'active' : 'deactivated'
    const previousStatus = target.activation_status

    // Every way out of the signup flow leaves a signup_decisions row, so the
    // deactivate toggle does not touch signups that were never approved:
    // - a declined account is already inactive; overwriting it with
    //   'deactivated' would drop it from the Declined list and break Reopen;
    // - a pending signup must be declined (with a reason) on Approvals.
    if (!newIsActive && previousStatus === 'declined') {
      return NextResponse.json({ success: true, is_active: false, activation_status: 'declined' })
    }
    if (!newIsActive && previousStatus === 'pending') {
      return NextResponse.json(
        { error: 'This signup is still pending. Decline it on the Approvals page so the reason is recorded.' },
        { status: 409 },
      )
    }

    // A declined signup was turned down on purpose, with a reason. One tap on
    // Activate must not silently override that: send the admin to Approvals
    // (Reopen, then decide), unless the client confirmed it with the reason
    // in front of the admin and says so with overrideDecline: true.
    if (newIsActive && previousStatus === 'declined' && overrideDecline !== true) {
      const { data: lastDecline } = await (adminClient as any)
        .from('signup_decisions')
        .select('reason')
        .eq('user_id', officerId)
        .eq('decision', 'declined')
        .order('decided_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const reason = typeof lastDecline?.reason === 'string' ? lastDecline.reason : null
      return NextResponse.json(
        {
          error: `This sign-up was declined${reason ? ` (reason: ${reason})` : ''}. Reopen it on the Approvals page and decide it there.`,
          code: 'signup_declined',
          reason,
        },
        { status: 409 },
      )
    }

    const { data: updated, error: updateError } = await adminClient
      .from('users')
      .update({ is_active: newIsActive, activation_status: newStatus })
      .eq('id', officerId)
      .select('id, is_active, activation_status')
      .single()

    if (updateError) {
      console.error('[toggle-activation] DB update error:', updateError)
      return NextResponse.json({ error: 'Could not update this officer’s status' }, { status: 500 })
    }

    // Activating a pending or declined signup from the Officers page is an
    // approval: record it in the signup audit like the Approvals page does.
    if (newIsActive && (previousStatus === 'pending' || previousStatus === 'declined')) {
      const { error: auditError } = await (adminClient as any)
        .from('signup_decisions')
        .insert({ user_id: officerId, decision: 'approved', decided_by: user.id })
      if (auditError) console.warn('[toggle-activation] Could not record the signup approval:', auditError.message)
    }

    // A deactivated officer must not keep using a session issued before.
    // (auth.admin.signOut() takes the user's own JWT, not a user id.)
    if (!newIsActive) {
      const { error: signOutError } = await (adminClient as any).rpc('revoke_user_sessions', { target_user: officerId })
      if (signOutError) console.warn('[toggle-activation] Could not revoke sessions:', signOutError.message)
    }

    return NextResponse.json({
      success: true,
      is_active: updated.is_active,
      activation_status: updated.activation_status,
    })
  } catch (error: any) {
    console.error('[toggle-activation] Unexpected error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
