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

    // An officer is eligible to be a DO for this program if they are either
    // (a) formally assigned a title for it, or (b) marked themselves
    // available in a mission-availability request tied to it — so an admin
    // isn't blocked on remembering to run the bulk-assign step for someone
    // who already said yes. Either way, eligibility is scoped to THIS
    // program only, never "any officer in the system."
    const [assignmentsRes, requestsRes] = await Promise.all([
      (adminClient as any)
        .from('current_title_assignments')
        .select('user_id, full_name, title_name, title_code, unit')
        .eq('program_id', programId)
        .eq('is_active', true),
      (adminClient as any)
        .from('mission_requests')
        .select('id')
        .eq('program_id', programId),
    ])

    if (assignmentsRes.error) {
      console.error('by-program assignments error:', assignmentsRes.error)
      return NextResponse.json({ error: assignmentsRes.error.message }, { status: 500 })
    }
    const assignments = assignmentsRes.data || []

    let availableUserIds: string[] = []
    const requestIds = (requestsRes.data || []).map((r: any) => r.id)
    if (requestIds.length > 0) {
      const { data: responses, error: responsesError } = await (adminClient as any)
        .from('mission_responses')
        .select('user_id')
        .in('request_id', requestIds)
        .eq('response', 'yes')
      if (responsesError) {
        console.error('by-program mission_responses error:', responsesError)
      } else {
        availableUserIds = (responses || []).map((r: any) => r.user_id).filter(Boolean)
      }
    }

    // Build a lookup of title-assignment metadata by user id
    const titleByUser: Record<string, any> = {}
    for (const a of assignments) {
      if (a.user_id) titleByUser[a.user_id] = a
    }

    const eligibleUserIds = Array.from(new Set([
      ...assignments.map((a: any) => a.user_id).filter(Boolean),
      ...availableUserIds,
    ]))

    if (eligibleUserIds.length === 0) {
      return NextResponse.json({ officers: [] })
    }

    const { data: usersData, error: usersError } = await (adminClient as any)
      .from('users')
      .select('id, full_name, role, oscar, photo_url, activation_status')
      .in('id', eligibleUserIds)
      .eq('activation_status', 'active')

    if (usersError) {
      console.error('by-program users error:', usersError)
      return NextResponse.json({ error: usersError.message }, { status: 500 })
    }

    const officers = (usersData || [])
      .map((u: any) => {
        const title = titleByUser[u.id]
        return {
          id: u.id,
          full_name: title?.full_name || u.full_name,
          role: u.role,
          oscar: u.oscar,
          photo_url: u.photo_url,
          title_name: title?.title_name ?? null,
          title_code: title?.title_code ?? null,
          unit: title?.unit ?? null,
          is_available_only: !title, // marked available but not yet formally title-assigned
        }
      })
      .sort((a: any, b: any) => (a.full_name ?? '').localeCompare(b.full_name ?? ''))

    return NextResponse.json({ officers })
  } catch (err: any) {
    console.error('Error in /api/officers/by-program:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
