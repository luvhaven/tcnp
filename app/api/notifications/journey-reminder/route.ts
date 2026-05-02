import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { journey_id, type } = await req.json() as { journey_id: string; type: string }
    if (!journey_id || !type) {
      return NextResponse.json({ error: 'journey_id and type are required' }, { status: 400 })
    }

    const adminClient = createAdminClient()

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
