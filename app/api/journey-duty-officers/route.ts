import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Only admins/captains/command can assign DOs
    const { data: currentUser } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    const adminRoles = ['super_admin', 'dev_admin', 'admin', 'captain', 'head_of_command', 'head_of_operations', 'command']
    if (!currentUser || !adminRoles.includes(currentUser.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { journey_id, officers } = body as {
      journey_id: string
      officers: Array<{ user_id: string; is_lead: boolean }>
    }

    if (!journey_id || !Array.isArray(officers)) {
      return NextResponse.json({ error: 'journey_id and officers[] are required' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // Remove existing DO assignments for this journey
    await (adminClient as any).from('journey_duty_officers').delete().eq('journey_id', journey_id)

    // Insert new assignments
    if (officers.length > 0) {
      const rows = officers.map(o => ({
        journey_id,
        user_id: o.user_id,
        is_lead: o.is_lead,
      }))

      const { error: insertError } = await (adminClient as any)
        .from('journey_duty_officers')
        .insert(rows)

      if (insertError) throw insertError
    }

    // Mirror team lead to journeys.assigned_duty_officer_id for backwards compat
    const lead = officers.find(o => o.is_lead)
    if (lead) {
      await (adminClient as any)
        .from('journeys')
        .update({ assigned_duty_officer_id: lead.user_id, assigned_do_id: lead.user_id })
        .eq('id', journey_id)
    } else if (officers.length === 0) {
      await (adminClient as any)
        .from('journeys')
        .update({ assigned_duty_officer_id: null, assigned_do_id: null })
        .eq('id', journey_id)
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Error in /api/journey-duty-officers:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const journeyId = req.nextUrl.searchParams.get('journey_id')
    if (!journeyId) return NextResponse.json({ error: 'journey_id required' }, { status: 400 })

    const adminClient = createAdminClient()

    const { data, error } = await (adminClient as any)
      .from('journey_duty_officers')
      .select('id, user_id, is_lead, created_at, users:user_id(full_name, role, oscar, photo_url)')
      .eq('journey_id', journeyId)
      .order('is_lead', { ascending: false })

    if (error) throw error
    return NextResponse.json({ duty_officers: data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
