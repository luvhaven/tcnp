import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/types/supabase'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: currentUser } = await (supabase as any)
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    const role = (currentUser as { role?: string } | null)?.role

    if (!role || !['admin', 'super_admin'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { officerId, isActive } = body as { officerId?: string; isActive?: boolean }

    if (!officerId || typeof isActive !== 'boolean') {
      return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })
    }

    const newStatus = isActive ? 'deactivated' : 'active'

    const { error } = await (adminClient as any)
      .from('users')
      .update({
        is_active: !isActive,
        activation_status: newStatus,
      } as Database['public']['Tables']['users']['Update'])
      .eq('id', officerId)

    if (error) {
      console.error('Error toggling officer activation:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, activation_status: newStatus, is_active: !isActive })
  } catch (error: any) {
    console.error('Unexpected error in /api/officers/toggle-activation:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
