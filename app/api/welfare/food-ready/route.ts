import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { fetchActiveUnitMemberships, isCommandAuthority, unitAccess } from '@/lib/unit-access'

/**
 * Who may sound the alarm: Command and administrators (SQL is_admin()), the
 * head or a sub-lead of Welfare or November (Den), or a Welfare / Den member the
 * database says may work this programme (can_work_unit_programme, e.g. a Den
 * floor grant). Unit access comes from memberships, not users.role.
 */
const ALARM_UNITS = ['welfare', 'november_den'] as const

/**
 * Welfare "Food is Ready" alarm.
 * Broadcasts a high-priority notification to every officer participating in the
 * given program today (falls back to all active officers when the program has
 * no explicit assignments).
 */
export async function POST(req: NextRequest) {
    try {
        // One alarm per two minutes per IP — this is a loud broadcast
        const limitCheck = await checkRateLimit(req, 'welfare-food-ready', 1, 2 * 60 * 1000)
        if (!limitCheck.success) {
            return NextResponse.json({ error: 'Food alarm was just sent. Please wait before sending again.' }, { status: 429 })
        }

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const adminClient = createAdminClient()
        const db = adminClient as any

        const { data: profile } = await db.from('users').select('role, has_admin_access, full_name, activation_status, is_active').eq('id', user.id).single()
        if (!profile || profile.activation_status !== 'active' || profile.is_active === false) {
            return NextResponse.json({ error: 'Account is inactive or unavailable' }, { status: 403 })
        }
        const { program_id, note } = await req.json().catch(() => ({} as any))

        let allowed = isCommandAuthority(profile.role, profile.has_admin_access)
        if (!allowed) {
            const viewer = { role: profile.role, hasAdminAccess: profile.has_admin_access }
            const { memberships } = await fetchActiveUnitMemberships(supabase as any, user.id)
            allowed = ALARM_UNITS.some(slug => unitAccess(memberships, slug, viewer).canCoordinate)
            if (!allowed && program_id) {
                for (const slug of ALARM_UNITS) {
                    if (!unitAccess(memberships, slug, viewer).isMember) continue
                    const { data: canWork } = await (supabase as any).rpc('can_work_unit_programme', { unit_slug: slug, target_program: program_id })
                    if (canWork === true) { allowed = true; break }
                }
            }
        }
        if (!allowed) {
            return NextResponse.json({ error: 'Forbidden: Welfare or leadership access required' }, { status: 403 })
        }

        // Resolve recipients: program participants first, all active officers as fallback
        let recipientIds: string[] = []
        let programName: string | null = null

        if (program_id) {
            const { data: program } = await db.from('programs').select('name').eq('id', program_id).single()
            programName = program?.name ?? null

            const { data: assignments } = await db
                .from('current_title_assignments')
                .select('user_id')
                .eq('program_id', program_id)
            recipientIds = Array.from(new Set((assignments ?? []).map((a: any) => a.user_id).filter(Boolean)))
        }

        if (recipientIds.length === 0) {
            const { data: activeUsers } = await db
                .from('users')
                .select('id')
                .eq('is_active', true)
                .eq('is_directory_hidden', false)
            recipientIds = (activeUsers ?? []).map((u: any) => u.id)
        } else {
            const { data: visibleRecipients } = await db
                .from('users')
                .select('id')
                .in('id', recipientIds)
                .eq('is_directory_hidden', false)
            const visibleIds = new Set((visibleRecipients ?? []).map((u: any) => u.id))
            recipientIds = recipientIds.filter((id) => visibleIds.has(id))
        }

        if (recipientIds.length === 0) {
            return NextResponse.json({ error: 'No recipients found' }, { status: 400 })
        }

        const title = '🍽️ Food is Ready!'
        const message = [
            programName ? `${programName}:` : null,
            'Meals are now being served at the Lounge.',
            note ? `— ${note}` : null,
        ].filter(Boolean).join(' ')

        const rows = recipientIds.map((id) => ({
            user_id: id,
            title,
            message,
            type: 'alert',
            channel: 'push',
            metadata: { kind: 'food_ready', program_id: program_id ?? null, sent_by: user.id },
            is_read: false,
        }))

        // Insert in chunks to stay well under payload limits
        for (let i = 0; i < rows.length; i += 200) {
            const { error } = await db.from('notifications').insert(rows.slice(i, i + 200))
            if (error) throw error
        }

        return NextResponse.json({ success: true, recipients: recipientIds.length })
    } catch (err: any) {
        console.error('Error in welfare/food-ready route:', err)
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
    }
}
