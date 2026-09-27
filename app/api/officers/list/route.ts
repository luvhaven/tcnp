import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPlatformAdministrator } from '@/lib/utils'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Directory data includes contact and profile information. Keep the
    // service-role read behind an active platform-administrator check.
    const { data: caller, error: callerError } = await supabase
      .from('users')
      .select('role, activation_status, is_active')
      .eq('id', user.id)
      .maybeSingle()

    if (callerError || !caller || caller.activation_status !== 'active' || caller.is_active === false) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!isPlatformAdministrator(caller.role)) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
    }

    const adminClient = createAdminClient()

    // Fetch all officers via admin client (bypasses RLS)
    const { data: officers, error } = await adminClient
      .from('users')
      .select('id, full_name, email, phone, role, oscar, activation_status, unit, current_title_id, last_seen, created_at, photo_url, team, is_team_head, date_of_birth, gender, address, city, bio, profile_completed_at, updated_at')
      .order('full_name')

    if (error) {
      console.error('Error loading officers (admin client):', error)
      return NextResponse.json({ error: 'Failed to load officers' }, { status: 500 })
    }

    // Fetch officers that have an active title assignment in a planning/active program
    // This defines "active" correctly: assigned to an open program
    const { data: activeAssignments } = await adminClient
      .from('current_title_assignments')
      .select(`
        user_id,
        programs:program_id (
          id,
          status
        )
      `)

    // Build a Set of user IDs that are active (in a planning or active program)
    const activeUserIds = new Set<string>()
    if (activeAssignments) {
      for (const assignment of activeAssignments as any[]) {
        const program = assignment.programs
        if (program && ['planning', 'active'].includes(program.status)) {
          activeUserIds.add(assignment.user_id)
        }
      }
    }

    // Compute is_online: last_seen within the last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()

    // Map officers with computed is_active and is_online
    const enrichedOfficers = (officers || []).map((officer: any) => ({
      ...officer,
      is_active: activeUserIds.has(officer.id),
      is_online: officer.last_seen != null && officer.last_seen >= fiveMinutesAgo,
    }))

    return NextResponse.json({ officers: enrichedOfficers }, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error: any) {
    console.error('Unexpected error in /api/officers/list:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
