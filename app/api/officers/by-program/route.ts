import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const programId = req.nextUrl.searchParams.get('program_id')
    if (!programId) return NextResponse.json({ error: 'program_id is required' }, { status: 400 })

    const adminClient = createAdminClient()

    // Fetch all users assigned to this program via current_title_assignments
    const { data: assignments, error } = await adminClient
      .from('current_title_assignments')
      .select('user_id, full_name, title_name, title_code, unit')
      .eq('program_id', programId)
      .eq('is_active', true)

    if (error) throw error

    if (!assignments || assignments.length === 0) {
      return NextResponse.json({ officers: [] })
    }

    // Get unique user IDs (exclude captain role)
    const userIds = [...new Set(assignments.map((a: any) => a.user_id))]

    const { data: users, error: usersError } = await adminClient
      .from('users')
      .select('id, full_name, role, oscar, activation_status, photo_url')
      .in('id', userIds)
      // Captains are admin heads, not DOs
      .not('role', 'in', '(captain,super_admin,dev_admin,admin)')
      .eq('activation_status', 'active')
      .order('full_name')

    if (usersError) throw usersError

    // Merge title info from assignments
    const officers = (users || []).map((u: any) => {
      const assignment = assignments.find((a: any) => a.user_id === u.id)
      return {
        ...u,
        title_name: assignment?.title_name ?? null,
        title_code: assignment?.title_code ?? null,
        unit: assignment?.unit ?? null,
      }
    })

    return NextResponse.json({ officers })
  } catch (err: any) {
    console.error('Error in /api/officers/by-program:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
