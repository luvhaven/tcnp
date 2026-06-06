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

    // Step 1: Get all title assignments for this program
    const { data: assignments, error: assignError } = await (adminClient as any)
      .from('current_title_assignments')
      .select('user_id, full_name, title_name, title_code, unit')
      .eq('program_id', programId)
      .eq('is_active', true)

    if (assignError) {
      console.error('by-program assignments error:', assignError)
      return NextResponse.json({ error: assignError.message }, { status: 500 })
    }

    if (!assignments || assignments.length === 0) {
      return NextResponse.json({ officers: [] })
    }

    // Step 2: Get user details for those user_ids
    const userIds = assignments.map((a: any) => a.user_id).filter(Boolean)
    const { data: usersData, error: usersError } = await (adminClient as any)
      .from('users')
      .select('id, role, oscar, photo_url, activation_status')
      .in('id', userIds)

    if (usersError) {
      console.error('by-program users error:', usersError)
      return NextResponse.json({ error: usersError.message }, { status: 500 })
    }

    // Step 3: Build a lookup map
    const userMap: Record<string, any> = {}
    for (const u of (usersData || [])) {
      userMap[u.id] = u
    }

    // Step 4: Merge and filter out pure admin/command roles
    const officers = assignments
      .map((a: any) => {
        const u = userMap[a.user_id]
        if (!u) return null
        return {
          id: a.user_id,
          full_name: a.full_name,
          role: u.role,
          oscar: u.oscar,
          photo_url: u.photo_url,
          title_name: a.title_name,
          title_code: a.title_code,
          unit: a.unit,
        }
      })
      .filter(Boolean)
      // Sort by name
      .sort((a: any, b: any) => (a.full_name ?? '').localeCompare(b.full_name ?? ''))

    return NextResponse.json({ officers })
  } catch (err: any) {
    console.error('Error in /api/officers/by-program:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
