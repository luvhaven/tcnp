import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPlatformAdministrator } from '@/lib/utils'

export async function GET(request: Request) {
  try {
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: caller, error: callerError } = await supabase
      .from('users')
      .select('role, activation_status, is_active')
      .eq('id', user.id)
      .single()

    if (callerError || !caller || caller.activation_status !== 'active' || caller.is_active === false) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!isPlatformAdministrator(caller.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const adminClient = createAdminClient()
    const db = adminClient as any

    const { data: requests, error: fetchError } = await db
      .from('password_reset_requests')
      .select(`
        id,
        user_id,
        email,
        status,
        reset_token,
        requested_at,
        approved_at,
        approved_by,
        rejected_at,
        rejected_by,
        rejection_reason,
        completed_at,
        expires_at,
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
      .order('requested_at', { ascending: false })
      .limit(50)

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
