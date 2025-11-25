import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await adminClient
      .from('users')
      .select('id, full_name, email, phone, role, is_active, oscar, activation_status, unit, current_title_id, is_online, last_seen')
      .order('full_name')

    if (error) {
      console.error('Error loading officers (admin client):', error)
      return NextResponse.json({ error: 'Failed to load officers' }, { status: 500 })
    }

    return NextResponse.json({ officers: data ?? [] })
  } catch (error: any) {
    console.error('Unexpected error in /api/officers/list:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
