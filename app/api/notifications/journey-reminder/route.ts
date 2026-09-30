import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, rateLimit } from '@/lib/security/rate-limit'

export async function POST(req: NextRequest) {
  try {
    const limitCheck = checkRateLimit(req, 'journey-reminder', 120, 60_000)
    if (!limitCheck.success) {
      return NextResponse.json({ error: 'Too many reminder requests. Please wait a minute.' }, { status: 429 })
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('activation_status, is_active')
      .eq('id', user.id)
      .single()
    if (profileError || !profile || profile.activation_status !== 'active' || profile.is_active === false) {
      return NextResponse.json({ error: 'Account is inactive or unavailable' }, { status: 403 })
    }
    const accountLimit = rateLimit(`journey-reminder-user:${user.id}`, 12, 60_000)
    if (!accountLimit.success) {
      return NextResponse.json({ error: 'Too many reminders for this account. Please wait a minute.' }, { status: 429 })
    }

    const body = await req.json().catch(() => null) as { journey_id?: string; type?: string } | null
    const journey_id = body?.journey_id
    const type = body?.type
    if (!journey_id || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(journey_id)
      || !type || !new RegExp(`^${journey_id}:(dep|arr):(15|5)$`, 'i').test(type)) {
      return NextResponse.json({ error: 'journey_id and type are required' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // This endpoint uses service credentials for notification insertion, so
    // verify that the signed-in officer is actually assigned to this journey.
    const [journeyResult, dutyResult] = await Promise.all([
      adminClient.from('journeys').select('assigned_duty_officer_id').eq('id', journey_id).maybeSingle(),
      adminClient.from('journey_duty_officers').select('status').eq('journey_id', journey_id).eq('user_id', user.id).maybeSingle(),
    ])
    if (journeyResult.error || dutyResult.error) throw journeyResult.error ?? dutyResult.error
    const isPrimaryOfficer = journeyResult.data?.assigned_duty_officer_id === user.id
    const dutyStatus = dutyResult.data?.status
    const isActiveDutyOfficer = Boolean(dutyResult.data && ['pending', 'acknowledged'].includes(dutyStatus ?? 'acknowledged'))
    if (!isPrimaryOfficer && !isActiveDutyOfficer) {
      return NextResponse.json({ error: 'You are not assigned to this journey' }, { status: 403 })
    }

    const { data: existingReminder, error: reminderError } = await (adminClient as any)
      .from('notifications')
      .select('id')
      .eq('user_id', user.id)
      .eq('journey_id', journey_id)
      .contains('metadata', { reminder_key: type })
      .limit(1)
      .maybeSingle()
    if (reminderError) throw reminderError
    if (existingReminder) return NextResponse.json({ success: true, duplicate: true })

    // Fetch journey details
    const { data: journey } = await adminClient
      .from('journeys')
      .select('origin, destination, scheduled_departure, scheduled_arrival, papa_id')
      .eq('id', journey_id)
      .single()

    let papaName = 'Your assignment'
    if (journey?.papa_id) {
      const { data: papa } = await adminClient
        .from('papas')
        .select('full_name, title')
        .eq('id', journey.papa_id)
        .single()
      if (papa) papaName = `${papa.title ?? ''} ${papa.full_name}`.trim()
    }

    const isArrival = type.includes('arr')
    const isUrgent = type.includes(':5')
    const minutesLeft = isUrgent ? 5 : 15

    const title = isArrival
      ? `${isUrgent ? '🚨' : '⏰'} Arriving in ${minutesLeft} minutes`
      : `${isUrgent ? '🚨' : '⏰'} Departing in ${minutesLeft} minutes`

    const message = `${papaName}: ${journey?.origin ?? ''} → ${journey?.destination ?? ''}`

    await (adminClient as any).from('notifications').insert({
      user_id: user.id,
      title,
      message,
      type: 'reminder',
      channel: 'push',
      journey_id,
      metadata: { reminder_key: type, is_arrival: isArrival, minutes_left: minutesLeft },
      is_read: false,
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Error in journey-reminder route:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
