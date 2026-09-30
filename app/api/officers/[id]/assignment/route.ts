import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPlatformAdministrator } from '@/lib/utils'

const OSCAR_UNITS = [
  'Command',
  'Alpha Oscar',
  'Compliance Oscar',
  'November (Den)',
  'November (Nest)',
  'Serial Oscar',
  'Tango Oscar',
  'Victor Oscar',
  'Welfare Oscar',
]
const PROTOCOL_TEAMS = ['strength', 'wisdom', 'swift']

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: caller, error: callerError } = await supabase
      .from('users')
      .select('role, activation_status, is_active')
      .eq('id', user.id)
      .maybeSingle()

    if (callerError || !caller || caller.activation_status !== 'active' || caller.is_active === false) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!isPlatformAdministrator(caller.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { oscar, team } = body
    if (typeof oscar !== 'string' || !OSCAR_UNITS.includes(oscar)) {
      return NextResponse.json({ error: 'Invalid Oscar unit' }, { status: 400 })
    }
    if (team !== null && (typeof team !== 'string' || !PROTOCOL_TEAMS.includes(team))) {
      return NextResponse.json({ error: 'Invalid Protocol team' }, { status: 400 })
    }

    const { id } = await context.params
    const adminClient = createAdminClient()
    const { data: target, error: targetError } = await adminClient
      .from('users')
      .select('id, is_directory_hidden')
      .eq('id', id)
      .maybeSingle()
    if (targetError || !target || (target.is_directory_hidden && id !== user.id)) {
      return NextResponse.json({ error: 'Officer not found' }, { status: 404 })
    }
    const { data: officer, error } = await adminClient
      .from('users')
      .update({ oscar, team, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, oscar, team')
      .maybeSingle()

    if (error) {
      console.error('Officer assignment update failed:', error)
      return NextResponse.json({ error: 'Failed to update officer assignment' }, { status: 500 })
    }
    if (!officer) return NextResponse.json({ error: 'Officer not found' }, { status: 404 })

    return NextResponse.json({ officer })
  } catch (error) {
    console.error('Unexpected error updating officer assignment:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
