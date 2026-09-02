import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 })
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = createAdminClient() as any
    const { data, error } = await admin.rpc('dispatch_due_announcements')
    if (error) throw error
    return NextResponse.json({ success: true, notifications_created: Number(data ?? 0) })
  } catch (error: any) {
    console.error('announcement dispatch cron failed', error)
    return NextResponse.json({ error: error.message || 'Announcement dispatch failed' }, { status: 500 })
  }
}
