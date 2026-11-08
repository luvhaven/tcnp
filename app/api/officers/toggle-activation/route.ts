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
      .select('role, activation_status, is_active')
      .eq('id', user.id)
      .single()

    if (callerError || !callerRow) {
      return NextResponse.json({ error: 'Could not verify caller role' }, { status: 403 })
    }

    if (callerRow.activation_status !== 'active' || callerRow.is_active === false) {
      return NextResponse.json({ error: 'Account is inactive or unavailable' }, { status: 403 })
    }

    if (!isPlatformAdministrator(callerRow.role)) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
    }

    // 2. Parse body
    const body = await request.json()
    // `active` is the desired state (idempotent). `isActive` is the legacy
    // "current state, please flip it" field, kept for older clients.
    const { officerId, active, isActive } = body as { officerId?: string; active?: boolean; isActive?: boolean }
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
      .select('role, email, is_directory_hidden')
      .eq('id', officerId)
      .single()

    if (!target) {
      return NextResponse.json({ error: 'Officer not found' }, { status: 404 })
    }
    if (target.is_directory_hidden) return NextResponse.json({ error: 'Officer not found' }, { status: 404 })
    if (target.role === 'super_admin' || isPermanentOwnerEmail(target.email)) {
      return NextResponse.json({ error: 'The permanent owner account cannot be deactivated' }, { status: 403 })
    }
    if (platformAuthorityRank(target.role) >= 80 && callerRow.role !== 'super_admin') {
      return NextResponse.json({ error: 'Only Super Admin can change an administrator account' }, { status: 403 })
    }
    const newIsActive = desired
    const newStatus = newIsActive ? 'active' : 'inactive'

    const { data: updated, error: updateError } = await adminClient
      .from('users')
      .update({ is_active: newIsActive, activation_status: newStatus })
      .eq('id', officerId)
      .select('id, is_active, activation_status')
      .single()

    if (updateError) {
      console.error('[toggle-activation] DB update error:', updateError)
      // If the column does not accept 'inactive', fall back to a status-only update
      if (updateError.message?.includes('invalid input value') || updateError.code === '22P02') {
        // Try without activation_status update
        const { data: fallback, error: fallbackError } = await adminClient
          .from('users')
          .update({ is_active: newIsActive })
          .eq('id', officerId)
          .select('id, is_active, activation_status')
          .single()

        if (fallbackError) {
          console.error('[toggle-activation] Fallback update error:', fallbackError)
          return NextResponse.json({ error: fallbackError.message }, { status: 500 })
        }

        return NextResponse.json({
          success: true,
          is_active: fallback.is_active,
          activation_status: fallback.activation_status ?? (newIsActive ? 'active' : 'pending'),
        })
      }

      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // A deactivated officer must not keep using a session issued before.
    if (!newIsActive) {
      const { error: signOutError } = await adminClient.auth.admin.signOut(officerId, 'global')
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
