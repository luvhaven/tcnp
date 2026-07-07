import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/security/rate-limit'

const ALLOWED_ROLES = [
    'super_admin', 'dev_admin', 'admin', 'captain', 'vice_captain',
    'command', 'head_of_command', 'head_of_operations',
    'welfare_oscar', 'head_welfare_oscar',
    'november_oscar', 'noscar_den', 'head_noscar_den',
]

/**
 * Welfare "Food is Ready" alarm.
 * Broadcasts a high-priority notification to every officer participating in the
 * given program today (falls back to all active officers when the program has
 * no explicit assignments).
 */
export async function POST(req: NextRequest) {
    try {
        // One alarm per two minutes per IP — this is a loud broadcast
        const limitCheck = checkRateLimit(req, 'welfare-food-ready', 1, 2 * 60 * 1000)
        if (!limitCheck.success) {
            return NextResponse.json({ error: 'Food alarm was just sent. Please wait before sending again.' }, { status: 429 })
        }

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const adminClient = createAdminClient()
        const db = adminClient as any

        const { data: profile } = await db.from('users').select('role, full_name').eq('id', user.id).single()
        if (!profile?.role || !ALLOWED_ROLES.includes(profile.role)) {
            return NextResponse.json({ error: 'Forbidden: Welfare or leadership access required' }, { status: 403 })
        }

        const { program_id, note } = await req.json().catch(() => ({} as any))

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
            recipientIds = (activeUsers ?? []).map((u: any) => u.id)
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
