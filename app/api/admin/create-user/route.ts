import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/types/supabase'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()
    const db = adminClient as any

    // Verify the requesting user is admin or dev_admin
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: currentUser } = await db
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    const currentRole = (currentUser as { role?: string } | null)?.role

    if (!currentRole || !['admin', 'dev_admin'].includes(currentRole)) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
    }

    // Get request body
    const body = await request.json()
    const { email, password, full_name, phone, role, photo_url } = body

    if (!email || !password || !full_name || !role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
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
      console.error('Auth error:', authError)
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    if (!authData.user) {
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
    }

    // Generate OSCAR
    const generateOscar = (fullName: string, userRole: string) => {
      if (!fullName) return null
      const initials = fullName.split(' ').map(n => n[0]).join('').toUpperCase()
      const roleCode = userRole.toUpperCase().replace('_', '-')
      return `OSCAR-${initials}-${roleCode}`
    }

    const oscar = generateOscar(full_name, role)

    // Insert into users table using the admin client (bypasses RLS, but route is already admin-guarded)
    const insertData: any = {
      id: authData.user.id,
      email,
      full_name,
      phone: phone || null,
      oscar,
      role,
      activation_status: 'active',
      is_active: true,
      created_by: user.id
    }

    // Only add photo_url if provided (for backwards compatibility)
    if (photo_url) {
      insertData.photo_url = photo_url
    }

    const { error: userError } = await db
      .from('users')
      .insert([insertData] as Database['public']['Tables']['users']['Insert'][])

    if (userError) {
      console.error('User table error:', userError)
      // Try to clean up auth user if users table insert fails
      await adminClient.auth.admin.deleteUser(authData.user.id)
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
