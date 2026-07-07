import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/security/rate-limit'

const ALLOWED_ROLES = [
    'super_admin', 'dev_admin', 'admin', 'captain', 'vice_captain',
    'command', 'head_of_command', 'head_of_operations',
]

/**
 * Creates a mission availability request for a program and broadcasts a
 * high-priority notification to every officer on the platform, asking them to
 * confirm availability before the deadline.
 */
export async function POST(req: NextRequest) {
    try {
        const limitCheck = checkRateLimit(req, 'mission-request', 3, 5 * 60 * 1000)
        if (!limitCheck.success) {
            return NextResponse.json({ error: 'Too many mission requests. Please wait a few minutes.' }, { status: 429 })
        }

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const adminClient = createAdminClient()
        const db = adminClient as any

        const { data: profile } = await db.from('users').select('role, full_name').eq('id', user.id).single()
        if (!profile?.role || !ALLOWED_ROLES.includes(profile.role)) {
            return NextResponse.json({ error: 'Forbidden: Command or Admin access required' }, { status: 403 })
        }

        const { program_id, title, message, deadline } = await req.json()
        if (!program_id || !deadline) {
            return NextResponse.json({ error: 'program_id and deadline are required' }, { status: 400 })
        }
        const deadlineDate = new Date(deadline)
        if (isNaN(deadlineDate.getTime()) || deadlineDate <= new Date()) {
            return NextResponse.json({ error: 'Deadline must be a valid future date/time' }, { status: 400 })
        }

        const { data: program } = await db.from('programs').select('name').eq('id', program_id).single()
        if (!program) return NextResponse.json({ error: 'Program not found' }, { status: 404 })

        const requestTitle = title?.trim() || `Mission Request — ${program.name}`

        const { data: request, error: reqError } = await db
            .from('mission_requests')
            .insert({
                program_id,
                title: requestTitle,
                message: message?.trim() || null,
                deadline: deadlineDate.toISOString(),
                created_by: user.id,
            })
            .select('id')
            .single()
        if (reqError) throw reqError

        // Broadcast to every active officer
        const { data: officers } = await db.from('users').select('id').eq('is_active', true)
        const recipientIds: string[] = (officers ?? []).map((o: any) => o.id)

        const rows = recipientIds.map((id) => ({
            user_id: id,
            title: `🎖️ ${requestTitle}`,
            message: `${program.name}: please confirm your availability to serve before ${deadlineDate.toLocaleString()}. Respond from your dashboard.`,
            type: 'alert',
            channel: 'push',
            metadata: { kind: 'mission_request', request_id: request.id, program_id },
            is_read: false,
        }))

        for (let i = 0; i < rows.length; i += 200) {
            const { error } = await db.from('notifications').insert(rows.slice(i, i + 200))
            if (error) throw error
        }

        return NextResponse.json({ success: true, request_id: request.id, recipients: recipientIds.length })
    } catch (err: any) {
        console.error('Error in missions/request-availability route:', err)
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
    }
}
