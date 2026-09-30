import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdmin } from '@/lib/utils'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Only admins/captains/command can assign DOs
    const { data: currentUser } = await supabase
      .from('users')
      .select('role, activation_status, is_active')
      .eq('id', user.id)
      .single()

    if (!currentUser || currentUser.activation_status !== 'active' || currentUser.is_active === false) {
      return NextResponse.json({ error: 'Account is inactive or unavailable' }, { status: 403 })
    }
    if (!isAdmin(currentUser.role)) {
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

    if (officers.some(o => !o.user_id || typeof o.is_lead !== 'boolean')) {
      return NextResponse.json({ error: 'Each officer needs a user_id and is_lead value' }, { status: 400 })
    }
    if (officers.length > 0 && officers.filter(o => o.is_lead).length !== 1) {
      return NextResponse.json({ error: 'Select exactly one team lead' }, { status: 400 })
    }
    if (new Set(officers.map(o => o.user_id)).size !== officers.length) {
      return NextResponse.json({ error: 'An officer can only be assigned once' }, { status: 400 })
    }

    const { error: replaceError } = await (supabase as any).rpc('replace_journey_duty_officers', {
      target_journey_id: journey_id,
      assignments: officers,
    })
    if (replaceError) throw replaceError

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

    const { data: currentUser } = await supabase
      .from('users')
      .select('role, activation_status, is_active')
      .eq('id', user.id)
      .single()
    if (!currentUser || currentUser.activation_status !== 'active' || currentUser.is_active === false) {
      return NextResponse.json({ error: 'Account is inactive or unavailable' }, { status: 403 })
    }
    const canManage = !!currentUser && isAdmin(currentUser.role)
    if (!canManage) {
      const { data: ownAssignment, error: assignmentError } = await (supabase as any)
        .from('journey_duty_officers')
        .select('status')
        .eq('journey_id', journeyId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (assignmentError) throw assignmentError
      if (!ownAssignment || !['pending', 'acknowledged'].includes(ownAssignment.status ?? 'acknowledged')) {
        return NextResponse.json({ error: 'You are not assigned to this journey' }, { status: 403 })
      }
    }

    const adminClient = createAdminClient()

    const { data, error } = await (adminClient as any)
      .from('journey_duty_officers')
      .select('id, user_id, is_lead, status, acknowledged_at, created_at, users:user_id!inner(full_name, role, oscar, photo_url, is_directory_hidden)')
      .eq('journey_id', journeyId)
      .eq('users.is_directory_hidden', false)
      .order('is_lead', { ascending: false })

    if (error) throw error
    return NextResponse.json({ duty_officers: data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
