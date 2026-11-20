import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { restoreProgramChatAccess } from '@/lib/chat-room-restore'
import {
    ADDITION_UNITS,
    additionOutcome,
    additionUnitLabel,
    canApproveProgramAdditions,
    isAdditionUnit,
    programAcceptsAdditions,
    type AdditionUnit,
    type PendingAddition,
} from '@/lib/program-additions'

/**
 * Adding a unit's officers to a programme.
 *
 *   GET    pending additions the caller may see (approvers: all; a unit head: their unit's)
 *   POST   add an officer — immediate, or pending approval (see additionOutcome)
 *   PATCH  approve / reject (approvers) or cancel (the unit head) a pending addition
 *
 * Executives, admins and the Head of Command keep their existing ways of
 * adding officers; this route adds a path for unit heads and never narrows
 * theirs. All writes use the service client after the caller is verified.
 */

type Caller = { id: string; fullName: string | null; canApprove: boolean; headOf: Set<string> }

async function resolveCaller(db: any): Promise<Caller | NextResponse> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await db
        .from('users')
        .select('role, has_admin_access, full_name, activation_status, is_active')
        .eq('id', user.id)
        .maybeSingle()
    if (!profile || profile.activation_status !== 'active' || profile.is_active === false) {
        return NextResponse.json({ error: 'Account is inactive or unavailable' }, { status: 403 })
    }

    const { data: headships } = await db
        .from('unit_memberships')
        .select('units!inner(slug, is_active)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .eq('access_level', 'head')
    const headOf = new Set<string>(
        (headships ?? []).filter((row: any) => row.units?.is_active !== false).map((row: any) => row.units.slug),
    )

    return {
        id: user.id,
        fullName: profile.full_name ?? null,
        canApprove: canApproveProgramAdditions(profile.role, profile.has_admin_access),
        headOf,
    }
}

async function notify(db: any, userIds: string[], title: string, message: string, metadata: Record<string, unknown>) {
    const unique = [...new Set(userIds.filter(Boolean))]
    if (unique.length === 0) return
    const { error } = await db.from('notifications').insert(unique.map(id => ({
        user_id: id, title, message, type: 'info', channel: 'push', metadata, is_read: false,
    })))
    // The addition itself has already been recorded; a failed notice must not undo it.
    if (error) console.error('program-additions: could not send notifications:', error)
}

async function approverIds(db: any): Promise<string[]> {
    const { data } = await db
        .from('users')
        .select('id')
        .eq('is_active', true)
        .eq('activation_status', 'active')
        .or('role.in.(super_admin,dev_admin,admin,captain,vice_captain,head_of_command),has_admin_access.eq.true')
    return (data ?? []).map((row: { id: string }) => row.id)
}

/** Puts the officer on the programme's officers list through the same RPC the programme roster uses. */
async function assignToProgram(db: any, input: { userId: string; programId: string; titleCode: string; assignedBy: string }) {
    const { error } = await db.rpc('assign_title', {
        p_user_id: input.userId,
        p_title_code: input.titleCode,
        p_program_id: input.programId,
        p_assigned_by: input.assignedBy,
    })
    return error
}

export async function GET() {
    try {
        const db = createAdminClient() as any
        const caller = await resolveCaller(db)
        if (caller instanceof NextResponse) return caller
        if (!caller.canApprove && caller.headOf.size === 0) {
            return NextResponse.json({ pending: [], canDecide: false })
        }

        let query = db
            .from('program_addition_requests')
            .select('id, unit_slug, reason, created_at, program_id, user_id, requested_by')
            .eq('status', 'pending')
            .order('created_at', { ascending: true })
        if (!caller.canApprove) query = query.in('unit_slug', [...caller.headOf])
        const { data: rows, error } = await query
        if (error) throw error

        const userIds = [...new Set((rows ?? []).flatMap((row: any) => [row.user_id, row.requested_by]).filter(Boolean))]
        const programIds = [...new Set((rows ?? []).map((row: any) => row.program_id))]
        const [{ data: users }, { data: programs }] = await Promise.all([
            userIds.length ? db.from('users').select('id, full_name, photo_url, oscar').in('id', userIds) : { data: [] },
            programIds.length ? db.from('programs').select('id, name').in('id', programIds) : { data: [] },
        ])
        const userById = new Map<string, any>((users ?? []).map((user: any) => [user.id, user]))
        const programById = new Map<string, any>((programs ?? []).map((program: any) => [program.id, program]))

        const pending: PendingAddition[] = (rows ?? []).map((row: any) => ({
            id: row.id,
            unit_slug: row.unit_slug,
            unit_label: additionUnitLabel(row.unit_slug),
            reason: row.reason,
            created_at: row.created_at,
            program: { id: row.program_id, name: programById.get(row.program_id)?.name ?? 'Programme' },
            officer: {
                id: row.user_id,
                full_name: userById.get(row.user_id)?.full_name ?? null,
                photo_url: userById.get(row.user_id)?.photo_url ?? null,
                oscar: userById.get(row.user_id)?.oscar ?? null,
            },
            requested_by_name: userById.get(row.requested_by)?.full_name ?? null,
        }))

        return NextResponse.json({ pending, canDecide: caller.canApprove })
    } catch (err) {
        console.error('Error in program-additions GET:', err)
        return NextResponse.json({ error: 'Could not load pending additions' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const db = createAdminClient() as any
        const caller = await resolveCaller(db)
        if (caller instanceof NextResponse) return caller

        const body = await request.json().catch(() => ({}))
        const programId = typeof body.program_id === 'string' ? body.program_id : ''
        const userId = typeof body.user_id === 'string' ? body.user_id : ''
        const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
        const unit = body.unit_slug
        if (!programId || !userId || !isAdditionUnit(unit)) {
            return NextResponse.json({ error: 'A programme, an officer and a unit are required' }, { status: 400 })
        }
        const unitSlug: AdditionUnit = unit

        if (!caller.canApprove && !caller.headOf.has(unitSlug)) {
            return NextResponse.json({ error: `Only the head of ${ADDITION_UNITS[unitSlug].label} or leadership can add its officers to a programme` }, { status: 403 })
        }

        const { data: program } = await db.from('programs').select('id, name, status').eq('id', programId).maybeSingle()
        if (!program) return NextResponse.json({ error: 'Programme not found' }, { status: 404 })
        if (!programAcceptsAdditions(program.status)) {
            return NextResponse.json({ error: 'Officers can only be added to a programme that is in planning or active' }, { status: 409 })
        }

        // The officer must be an active member of the unit they are being added for.
        const { data: membership } = await db
            .from('unit_memberships')
            .select('access_level, units!inner(slug), users!unit_memberships_user_id_fkey!inner(id, full_name, is_active, activation_status, current_title_id)')
            .eq('user_id', userId)
            .eq('status', 'active')
            .eq('units.slug', unitSlug)
            .maybeSingle()
        const officer = membership?.users
        if (!officer || officer.is_active === false || officer.activation_status !== 'active') {
            return NextResponse.json({ error: `This officer is not an active member of ${ADDITION_UNITS[unitSlug].label}` }, { status: 409 })
        }

        const { data: existing } = await db
            .from('title_assignments')
            .select('id')
            .eq('program_id', programId)
            .eq('user_id', userId)
            .eq('is_active', true)
            .limit(1)
        if (existing?.length) {
            // Already on the programme: a lead adding them again still puts them back
            // in the programme chat if an admin had removed them from it.
            const restored = await restoreProgramChatAccess(db, programId, [userId]).catch((restoreError: unknown) => {
                console.error('program-additions: could not restore programme chat access:', restoreError)
                return [] as string[]
            })
            return NextResponse.json({ outcome: 'added', already: true, chat_restored: restored.length > 0 })
        }

        const { data: openRequest } = await db
            .from('program_addition_requests')
            .select('id')
            .eq('program_id', programId)
            .eq('user_id', userId)
            .eq('status', 'pending')
            .maybeSingle()
        if (openRequest && !caller.canApprove) return NextResponse.json({ outcome: 'pending', already: true })

        const { data: availability } = await db
            .from('mission_responses')
            .select('id, mission_requests!inner(program_id)')
            .eq('user_id', userId)
            .eq('response', 'yes')
            .eq('mission_requests.program_id', programId)
            .limit(1)
        const acceptedAvailability = Boolean(availability?.length)

        // Keep the title the officer already holds; otherwise the unit's own title.
        let titleCode: string = membership.access_level === 'head' ? ADDITION_UNITS[unitSlug].headTitle : ADDITION_UNITS[unitSlug].memberTitle
        if (officer.current_title_id) {
            const { data: currentTitle } = await db.from('official_titles').select('code').eq('id', officer.current_title_id).maybeSingle()
            if (currentTitle?.code) titleCode = currentTitle.code
        }

        const outcome = additionOutcome({ callerCanApprove: caller.canApprove, officerAcceptedAvailability: acceptedAvailability })
        const officerName = officer.full_name ?? 'An officer'

        if (outcome === 'pending') {
            if (!reason) return NextResponse.json({ error: 'Say why this officer is needed, so an approver can decide' }, { status: 400 })
            const { data: created, error } = await db.from('program_addition_requests').insert([{
                program_id: programId, user_id: userId, unit_slug: unitSlug, title_code: titleCode,
                had_availability: false, reason, status: 'pending', requested_by: caller.id,
            }]).select('id').single()
            if (error) {
                if (error.code === '23505') return NextResponse.json({ outcome: 'pending', already: true })
                throw error
            }
            await notify(db, (await approverIds(db)).filter(id => id !== caller.id),
                'Programme addition needs approval',
                `${caller.fullName ?? 'A unit head'} wants to add ${officerName} (${ADDITION_UNITS[unitSlug].label}) to ${program.name}. They had not indicated availability.`,
                { kind: 'program_addition_request', request_id: created.id, program_id: programId, unit_slug: unitSlug })
            return NextResponse.json({ outcome: 'pending' })
        }

        const assignError = await assignToProgram(db, { userId, programId, titleCode, assignedBy: caller.id })
        if (assignError) {
            console.error('program-additions: assign_title failed:', assignError)
            return NextResponse.json({ error: assignError.message?.includes('Maximum positions') ? 'This programme already has the maximum number of officers for that title' : 'Could not add this officer to the programme' }, { status: 409 })
        }

        // An approver adding directly settles any request that was waiting on them.
        if (openRequest) {
            await db.from('program_addition_requests')
                .update({ status: 'approved', decided_by: caller.id, decided_at: new Date().toISOString() })
                .eq('id', openRequest.id)
        } else {
            await db.from('program_addition_requests').insert([{
                program_id: programId, user_id: userId, unit_slug: unitSlug, title_code: titleCode,
                had_availability: acceptedAvailability, reason: reason || null, status: 'approved',
                requested_by: caller.id, decided_by: caller.canApprove ? caller.id : null, decided_at: new Date().toISOString(),
            }])
        }
        if (userId !== caller.id) {
            await notify(db, [userId], `You are on ${program.name}`,
                `You have been added to ${program.name} with ${ADDITION_UNITS[unitSlug].label}.`,
                { kind: 'program_addition_decided', program_id: programId, unit_slug: unitSlug, decision: 'approved' })
        }
        return NextResponse.json({ outcome: 'added' })
    } catch (err) {
        console.error('Error in program-additions POST:', err)
        return NextResponse.json({ error: 'Could not add this officer to the programme' }, { status: 500 })
    }
}

export async function PATCH(request: Request) {
    try {
        const db = createAdminClient() as any
        const caller = await resolveCaller(db)
        if (caller instanceof NextResponse) return caller

        const body = await request.json().catch(() => ({}))
        const requestId = typeof body.request_id === 'string' ? body.request_id : ''
        const decision = body.decision
        const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : ''
        if (!requestId || !['approve', 'reject', 'cancel'].includes(decision)) {
            return NextResponse.json({ error: 'A request and a decision are required' }, { status: 400 })
        }

        const { data: addition } = await db.from('program_addition_requests').select('*').eq('id', requestId).maybeSingle()
        if (!addition) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
        if (addition.status !== 'pending') return NextResponse.json({ error: 'This request has already been decided' }, { status: 409 })

        if (decision === 'cancel') {
            if (!caller.canApprove && !caller.headOf.has(addition.unit_slug)) {
                return NextResponse.json({ error: 'Only the unit head or leadership can withdraw this request' }, { status: 403 })
            }
        } else if (!caller.canApprove) {
            // A unit head can ask; only an executive, an admin or the Head of Command decides.
            return NextResponse.json({ error: 'Only an executive, an admin or the Head of Command can decide this request' }, { status: 403 })
        }

        const { data: program } = await db.from('programs').select('name, status').eq('id', addition.program_id).maybeSingle()
        const programName = program?.name ?? 'the programme'

        if (decision === 'approve') {
            if (!programAcceptsAdditions(program?.status)) {
                return NextResponse.json({ error: 'This programme is no longer in planning or active' }, { status: 409 })
            }
            const assignError = await assignToProgram(db, {
                userId: addition.user_id, programId: addition.program_id, titleCode: addition.title_code, assignedBy: caller.id,
            })
            if (assignError) {
                console.error('program-additions: assign_title failed on approval:', assignError)
                return NextResponse.json({ error: 'Could not add this officer to the programme' }, { status: 409 })
            }
        }

        const status = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'cancelled'
        // The status filter makes a second, simultaneous decision a no-op.
        const { data: updated, error } = await db.from('program_addition_requests')
            .update({ status, decided_by: caller.id, decided_at: new Date().toISOString(), decision_note: note || null })
            .eq('id', requestId)
            .eq('status', 'pending')
            .select('id')
        if (error) throw error
        if (!updated?.length) return NextResponse.json({ error: 'This request has already been decided' }, { status: 409 })

        if (decision !== 'cancel') {
            const unitLabel = additionUnitLabel(addition.unit_slug, 'your unit')
            const { data: officer } = await db.from('users').select('full_name').eq('id', addition.user_id).maybeSingle()
            const officerName = officer?.full_name ?? 'The officer'
            const metadata = { kind: 'program_addition_decided', request_id: requestId, program_id: addition.program_id, unit_slug: addition.unit_slug, decision: status }
            if (addition.requested_by && addition.requested_by !== caller.id) {
                await notify(db, [addition.requested_by],
                    decision === 'approve' ? 'Programme addition approved' : 'Programme addition declined',
                    decision === 'approve'
                        ? `${officerName} is now on ${programName}.`
                        : `${officerName} was not added to ${programName}.${note ? ` Note: ${note}` : ''}`,
                    metadata)
            }
            if (decision === 'approve') {
                await notify(db, [addition.user_id], `You are on ${programName}`,
                    `You have been added to ${programName} with ${unitLabel}.`, metadata)
            }
        }

        return NextResponse.json({ status })
    } catch (err) {
        console.error('Error in program-additions PATCH:', err)
        return NextResponse.json({ error: 'Could not update this request' }, { status: 500 })
    }
}
