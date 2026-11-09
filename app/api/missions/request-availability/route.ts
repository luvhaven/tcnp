import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { isMissionAudience } from '@/lib/mission-audiences'

const ALLOWED_ROLES = [
    'super_admin', 'dev_admin', 'admin', 'captain', 'vice_captain',
    'command', 'head_of_command', 'head_of_operations',
]

/**
 * Creates a mission availability request for a program and broadcasts a
 * high-priority notification to the selected audience, asking them to
 * confirm availability before the deadline.
 */
export async function POST(req: NextRequest) {
    try {
        const limitCheck = await checkRateLimit(req, 'mission-request', 3, 5 * 60 * 1000)
        if (!limitCheck.success) {
            return NextResponse.json({ error: 'Too many mission requests. Please wait a few minutes.' }, { status: 429 })
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
        if (profile.has_admin_access !== true && !ALLOWED_ROLES.includes(profile.role)) {
            return NextResponse.json({ error: 'Forbidden: Command or Admin access required' }, { status: 403 })
        }

        const { program_id, title, message, deadline, audience = 'all' } = await req.json()
        if (!program_id || !deadline) {
            return NextResponse.json({ error: 'program_id and deadline are required' }, { status: 400 })
        }
        if (!isMissionAudience(audience)) {
            return NextResponse.json({ error: 'Select a valid audience' }, { status: 400 })
        }
        const deadlineDate = new Date(deadline)
        if (isNaN(deadlineDate.getTime()) || deadlineDate <= new Date()) {
            return NextResponse.json({ error: 'Deadline must be a valid future date/time' }, { status: 400 })
        }

        const { data: program } = await db.from('programs').select('name').eq('id', program_id).single()
        if (!program) return NextResponse.json({ error: 'Program not found' }, { status: 404 })

        const requestTitle = title?.trim() || `Mission Request — ${program.name}`

        const { data: request, error: reqError } = await db
            .rpc('send_mission_availability_request', {
                target_program_id: program_id,
                request_title: requestTitle,
                request_message: message?.trim() || null,
                request_deadline: deadlineDate.toISOString(),
                sender_id: user.id,
                request_audience: audience,
                notification_message: `${program.name}: please confirm your availability to serve before ${deadlineDate.toLocaleString()}. Respond from your dashboard.`,
            })
            .single()
        if (reqError) throw reqError
        if (!request.request_id) {
            return NextResponse.json({ error: 'No active officers match this audience' }, { status: 400 })
        }

        return NextResponse.json({ success: true, request_id: request.request_id, recipients: request.recipients })
    } catch (err: any) {
        console.error('Error in missions/request-availability route:', err)
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
    }
}
