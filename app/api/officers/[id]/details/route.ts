import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'Officer ID is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const adminClient = createAdminClient()
    const db = adminClient as any

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch officer user details
    const { data: officer, error: officerError } = await db
      .from('users')
      .select('*')
      .eq('id', id)
      .single()

    if (officerError || !officer) {
      return NextResponse.json({ error: 'Officer not found' }, { status: 404 })
    }

    // Fetch all title assignments (past and present) with title & program names
    const { data: titleAssignments, error: titleError } = await db
      .from('title_assignments')
      .select(`
        id,
        is_active,
        assigned_at,
        created_at,
        notes,
        official_titles:title_id (
          id,
          code,
          name,
          unit,
          is_team_lead
        ),
        programs:program_id (
          id,
          name,
          status,
          start_date,
          end_date
        ),
        assigned_by_user:assigned_by (
          id,
          full_name,
          email
        )
      `)
      .eq('user_id', id)
      .order('created_at', { ascending: false })

    if (titleError) {
      console.warn('Error fetching title assignments for officer:', titleError)
    }

    // Fetch Duty Officer (DO) journey assignments
    const { data: dutyAssignments, error: dutyError } = await db
      .from('journey_duty_officers')
      .select(`
        id,
        journey_id,
        is_lead,
        status,
        acknowledged_at,
        created_at,
        journeys:journey_id (
          id,
          status,
          origin,
          destination,
          scheduled_departure,
          scheduled_arrival,
          etd,
          eta,
          papas:papa_id (
            id,
            full_name,
            title
          ),
          programs:program_id (
            id,
            name
          )
        )
      `)
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .limit(10)

    if (dutyError) {
      console.warn('Error fetching duty assignments for officer:', dutyError)
    }

    return NextResponse.json({
      officer,
      titleAssignments: titleAssignments || [],
      dutyAssignments: dutyAssignments || []
    })
  } catch (error: any) {
    console.error('Error in /api/officers/[id]/details:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
