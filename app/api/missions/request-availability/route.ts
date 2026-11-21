import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { isMissionAudience } from '@/lib/mission-audiences'
import { isCommandAuthority } from '@/lib/unit-access'

/**
 * The deadline as officers read it: Lagos time, day-month order. The server
 * runs in UTC, so a bare toLocaleString() printed it an hour early and in
 * US order.
 */
function formatLagosDeadline(date: Date): string {
    return date.toLocaleString('en-GB', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' })
}

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
        // Command and administrators only (mirrors SQL is_admin()); no unit role grants this.
        if (!isCommandAuthority(profile.role, profile.has_admin_access)) {
            return NextResponse.json({ error: 'Forbidden: Command or Admin access required' }, { status: 403 })
        }

        const { program_id, title, message, deadline, audience = 'all', include_unset_gender = false } = await req.json()
        if (!program_id || !deadline) {
            return NextResponse.json({ error: 'program_id and deadline are required' }, { status: 400 })
        }
        if (!isMissionAudience(audience)) {
            return NextResponse.json({ error: 'Select a valid audience' }, { status: 400 })
        }
        if (typeof include_unset_gender !== 'boolean') {
            return NextResponse.json({ error: 'include_unset_gender must be true or false' }, { status: 400 })
        }
        // Only a Males / Females request can widen to officers with no gender
        // set. The parameter is sent only when used, so this route keeps
        // working against a database that predates it.
        const includeUnsetGender = include_unset_gender && (audience === 'male' || audience === 'female')
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
                ...(includeUnsetGender ? { include_unset_gender: true } : {}),
                notification_message: `${program.name}: please confirm your availability to serve before ${formatLagosDeadline(deadlineDate)}. Respond from your dashboard.`,
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
