import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Daily 06:00 UTC / 07:00 Africa-Lagos birthday reminder.
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 })
  }

  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = createAdminClient() as any
    const { data, error } = await admin.rpc('enqueue_daily_birthday_reminders')
    if (error) throw error

    return NextResponse.json({
      success: true,
      notifications_created: Number(data ?? 0),
      timezone: 'Africa/Lagos',
    })
  } catch (error: any) {
    console.error('welfare birthday cron failed', error)
    return NextResponse.json({ error: error.message || 'Birthday reminder job failed' }, { status: 500 })
  }
}
