import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { isPlatformAdministrator, platformAuthorityRank } from '@/lib/utils'

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
    // 1. Verify caller is authenticated and is an admin
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: callerRow, error: callerError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (callerError || !callerRow) {
      return NextResponse.json({ error: 'Could not verify caller role' }, { status: 403 })
    }

    if (!isPlatformAdministrator(callerRow.role)) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
    }

    // 2. Parse body
    const body = await request.json()
    const { officerId, isActive } = body as { officerId?: string; isActive?: boolean }

    if (!officerId || typeof isActive !== 'boolean') {
      return NextResponse.json({ error: 'Missing or invalid fields: officerId and isActive (boolean) required' }, { status: 400 })
    }

    // 3. Perform update using service role to bypass RLS entirely
    const adminClient = buildAdminClient()
    const { data: target } = await adminClient
      .from('users')
      .select('role')
      .eq('id', officerId)
      .single()

    if (!target) {
      return NextResponse.json({ error: 'Officer not found' }, { status: 404 })
    }
    if (platformAuthorityRank(target.role) >= 80 && callerRow.role !== 'super_admin') {
      return NextResponse.json({ error: 'Only Super Admin can change an administrator account' }, { status: 403 })
    }
    const newIsActive = !isActive
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
