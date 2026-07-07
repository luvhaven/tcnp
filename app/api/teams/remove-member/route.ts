import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ADMIN_ROLES = [
    'super_admin', 'dev_admin', 'admin', 'captain', 'vice_captain',
    'command', 'head_of_command', 'head_of_operations',
]

/**
 * Removes an officer from their protocol team (sets team to null).
 * Allowed: platform admins, or the head of the same team.
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const adminClient = createAdminClient()
        const db = adminClient as any

        const { data: me } = await db.from('users').select('role, team, is_team_head').eq('id', user.id).single()
        if (!me) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

        const { user_id } = await req.json()
        if (!user_id) return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
        if (user_id === user.id) return NextResponse.json({ error: 'You cannot remove yourself from your own team here' }, { status: 400 })

        const { data: target } = await db.from('users').select('id, team, full_name').eq('id', user_id).single()
        if (!target?.team) return NextResponse.json({ error: 'Officer is not in a team' }, { status: 400 })

        const isPlatformAdmin = ADMIN_ROLES.includes(me.role ?? '')
        const isSameTeamHead = me.is_team_head === true && me.team === target.team
        if (!isPlatformAdmin && !isSameTeamHead) {
            return NextResponse.json({ error: 'Forbidden: team head or admin access required' }, { status: 403 })
        }

        const { error } = await db.from('users').update({ team: null, is_team_head: false, updated_at: new Date().toISOString() }).eq('id', user_id)
        if (error) throw error

        return NextResponse.json({ success: true })
    } catch (err: any) {
        console.error('Error in teams/remove-member route:', err)
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
    }
}
