import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { OFFICER_TEAMS } from '@/lib/utils'

const VALID_TEAMS: readonly string[] = OFFICER_TEAMS.map(team => team.value)

/**
 * Lets an officer who is not yet in a protocol team pick one.
 * `team` is a privileged column the browser cannot write (guard_user_self_privileged_columns),
 * so the first choice goes through here; moving between teams stays with team heads and admins.
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        let body: { team?: unknown }
        try {
            body = await req.json()
        } catch {
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
        }
        const team = typeof body.team === 'string' ? body.team : ''
        if (!VALID_TEAMS.includes(team)) {
            return NextResponse.json({ error: 'Choose one of the listed teams' }, { status: 400 })
        }

        const db = createAdminClient() as any
        const { data: me } = await db
            .from('users')
            .select('team, activation_status, is_active')
            .eq('id', user.id)
            .single()

        if (!me || me.activation_status !== 'active' || me.is_active === false) {
            return NextResponse.json({ error: 'Account is inactive or unavailable' }, { status: 403 })
        }
        if (me.team) {
            return NextResponse.json({ error: 'You are already in a team. Ask your team head or an admin to move you.' }, { status: 409 })
        }

        // `.is('team', null)` keeps two quick taps from switching teams.
        const { data: updated, error } = await db
            .from('users')
            .update({ team, updated_at: new Date().toISOString() })
            .eq('id', user.id)
            .is('team', null)
            .select('team')
            .maybeSingle()

        if (error) {
            console.error('[teams/join] update failed:', error)
            return NextResponse.json({ error: 'Could not join the team. Please try again.' }, { status: 500 })
        }
        if (!updated) {
            return NextResponse.json({ error: 'You are already in a team.' }, { status: 409 })
        }

        return NextResponse.json({ success: true, team: updated.team })
    } catch (err) {
        console.error('[teams/join] unexpected error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
