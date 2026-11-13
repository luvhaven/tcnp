import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/types/supabase'
import { NextResponse } from 'next/server'
import { isPlatformAdministrator, platformAuthorityRank, isExecutiveRole, OFFICER_TEAMS } from '@/lib/utils'
import { OFFICER_ROLE_OPTIONS, adminNeedsOscar, ADMIN_NEEDS_OSCAR_MESSAGE } from '@/lib/officer-directory'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()
    const db = adminClient as any

    // Platform account administration is deliberately narrower than legacy
    // operational leadership. Unit heads manage memberships in their workspace.
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: currentUser } = await db
      .from('users')
      .select('role, has_admin_access')
      .eq('id', user.id)
      .eq('activation_status', 'active')
      .or('is_active.is.null,is_active.eq.true')
      .single()

    const currentRole = (currentUser as { role?: string } | null)?.role

    if (!isPlatformAdministrator(currentRole, currentUser?.has_admin_access)) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
    }

    // Get request body
    const body = await request.json()
    const { password, full_name, phone, role, photo_url, team, is_team_head, has_admin_access = false } = body
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''

    if (!email || !password || !full_name || !role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!OFFICER_ROLE_OPTIONS.some(option => option.value === role) || typeof has_admin_access !== 'boolean') {
      return NextResponse.json({ error: 'Select a valid officer role and additional access level' }, { status: 400 })
    }

    if (adminNeedsOscar(role, has_admin_access)) {
      return NextResponse.json({ error: ADMIN_NEEDS_OSCAR_MESSAGE }, { status: 400 })
    }

    if (platformAuthorityRank(role, has_admin_access) >= 80 && currentRole !== 'super_admin') {
      return NextResponse.json({ error: 'Only Super Admin can assign Admin access or Executive roles' }, { status: 403 })
    }

    if (team && !OFFICER_TEAMS.some(option => option.value === team)) {
      return NextResponse.json({ error: 'Invalid team' }, { status: 400 })
    }

    // Create user via Supabase Admin API (bypasses email confirmation)
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name,
        phone,
        role
      }
    })

    if (authError) {
      if (authError.code === 'email_exists' || authError.code === 'user_already_exists') {
        return NextResponse.json({ error: 'An account already uses this email address.' }, { status: 409 })
      }
      console.error('Auth error:', authError)
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    if (!authData.user) {
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
    }

    const oscar = isExecutiveRole(role) ? 'Executive' : role === 'viewer' ? null : role

    // Insert into users table using the admin client (bypasses RLS, but route is already admin-guarded)
    const insertData: any = {
      id: authData.user.id,
      email,
      full_name,
      phone: phone || null,
      oscar,
      role,
      has_admin_access,
      activation_status: 'pending',
      is_active: false,
      created_by: user.id
    }

    // Only add photo_url if provided (for backwards compatibility)
    if (photo_url) {
      insertData.photo_url = photo_url
    }

    if (team) {
      insertData.team = team
      insertData.is_team_head = is_team_head === true
    }

    const { error: userError } = await db
      .from('users')
      .insert([insertData] as Database['public']['Tables']['users']['Insert'][])

    if (userError) {
      console.error('User table error:', userError)
      // Try to clean up auth user if users table insert fails
      await adminClient.auth.admin.deleteUser(authData.user.id)
      if (userError.code === '23505') {
        return NextResponse.json({ error: 'An account already uses this email address.' }, { status: 409 })
      }
      return NextResponse.json({ error: userError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      user: {
        id: authData.user.id,
        email,
        full_name,
        role,
        oscar
      }
    })

  } catch (error: any) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
