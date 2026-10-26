import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPlatformAdministrator } from '@/lib/utils'

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
            .eq('activation_status', 'active')
            .or('is_active.is.null,is_active.eq.true')
            .single()

        const role = (currentUser as { role?: string } | null)?.role

        if (!role || !isPlatformAdministrator(role)) {
            return NextResponse.json({ error: 'Forbidden: platform administrator access required' }, { status: 403 })
        }

        const body = await request.json()
        const { officer_ids, program_id } = body as { officer_ids?: string[], program_id?: string }

        if (!officer_ids || !Array.isArray(officer_ids) || officer_ids.length === 0 || typeof program_id !== 'string' || !program_id) {
            return NextResponse.json({ error: 'Missing or invalid officer_ids' }, { status: 400 })
        }

        const uniqueOfficerIds = [...new Set(officer_ids.filter((id): id is string => typeof id === 'string' && id.length > 0))]
        if (uniqueOfficerIds.length === 0) {
            return NextResponse.json({ error: 'No valid officers were selected' }, { status: 400 })
        }
        const { data: program, error: programError } = await (adminClient as any).from('programs').select('status').eq('id', program_id).maybeSingle()
        if (programError) return NextResponse.json({ error: 'Could not verify program' }, { status: 500 })
        if (!program) return NextResponse.json({ error: 'Program not found' }, { status: 404 })
        if (!['active', 'planning'].includes(program.status)) return NextResponse.json({ error: 'Select an active or planning program' }, { status: 409 })
        const isProgramActive = program.status === 'active'

        const { data: existingAssignments, error: assignmentLookupError } = await (adminClient as any)
            .from('current_title_assignments')
            .select('user_id')
            .eq('program_id', program_id)
            .eq('is_active', true)
            .in('user_id', uniqueOfficerIds)
        if (assignmentLookupError) {
            console.error('Failed to check existing program assignments:', assignmentLookupError)
            return NextResponse.json({ error: 'Could not verify existing program assignments' }, { status: 500 })
        }
        const alreadyAssignedIds = new Set((existingAssignments || []).map((assignment: { user_id: string }) => assignment.user_id))
        const pendingOfficerIds = uniqueOfficerIds.filter(id => !alreadyAssignedIds.has(id))
        if (pendingOfficerIds.length === 0) {
            return NextResponse.json({
                success: true,
                assigned_count: 0,
                already_assigned_count: alreadyAssignedIds.size,
                already_assigned_ids: [...alreadyAssignedIds],
            })
        }

        // Load available official titles to map fallbacks
        const { data: titles, error: titlesError } = await (adminClient as any).from('official_titles').select('*')
        if (titlesError) return NextResponse.json({ error: 'Could not verify officer titles' }, { status: 500 })

        // Load selected users
        const { data: usersData, error: usersError } = await (adminClient as any)
            .from('users')
            .select('id, current_title_id, role, is_active, activation_status')
            .in('id', pendingOfficerIds)
        if (usersError) {
            console.error('Failed to load selected officers:', usersError)
            return NextResponse.json({ error: 'Could not load the selected officers' }, { status: 500 })
        }

        const loadedUsers = usersData || []
        if (loadedUsers.length === 0) {
            return NextResponse.json({ error: 'None of the selected officers could be found' }, { status: 404 })
        }

        // Deactivated or suspended accounts are never assigned (or reactivated) from here;
        // reactivation goes through the officer edit flow. Pending accounts may still be
        // activated below when the program is live.
        const isPending = (u: { activation_status?: string | null }) => u.activation_status === 'pending'
        const isActive = (u: { is_active?: boolean | null; activation_status?: string | null }) =>
            u.is_active !== false && u.activation_status === 'active'
        const mappedUsers = loadedUsers.filter((u: any) => isActive(u) || isPending(u))
        const inactiveIds: string[] = loadedUsers.filter((u: any) => !isActive(u) && !isPending(u)).map((u: any) => u.id)

        const roleToTitleMap: Record<string, string> = {
            'alpha_oscar': 'ALPHA_OSCAR',
            'head_alpha_oscar': 'ALPHA_OSCAR_LEAD',
            'tango_oscar': 'TANGO_OSCAR',
            'head_tango_oscar': 'TANGO_OSCAR_LEAD',
            'victor_oscar': 'VICTOR_OSCAR',
            'head_victor_oscar': 'VICTOR_OSCAR_LEAD',
            'delta_oscar': 'DELTA_OSCAR',
            'echo_oscar': 'ECHO_OSCAR',
            'head_echo_oscar': 'ECHO_OSCAR_LEAD',
            'november_oscar': 'NOVEMBER_OSCAR',
            'noscar_den': 'NOVEMBER_DEN',
            'head_noscar_den': 'NOVEMBER_DEN_LEAD',
            'noscar_nest': 'NOVEMBER_OSCAR',
            'head_noscar_nest': 'NOVEMBER_OSCAR_LEAD',
            'hospitality_oscar': 'NOVEMBER_OSCAR',
            'head_hospitality_oscar': 'NOVEMBER_OSCAR_LEAD',
            'serial_oscar': 'SERIAL_OSCAR',
            'head_serial_oscar': 'SERIAL_OSCAR_LEAD',
            'compliance_oscar': 'COMPLIANCE_OSCAR',
            'head_compliance_oscar': 'COMPLIANCE_OSCAR_LEAD',
            'welfare_oscar': 'WELFARE_OSCAR',
            'head_welfare_oscar': 'WELFARE_OSCAR_LEAD',
            'training_oscar': 'TRAINING_OSCAR',
            'head_training_oscar': 'TRAINING_OSCAR_LEAD',
            'captain': 'CAPTAIN',
            'vice_captain': 'VICE_CAPTAIN',
            'head_of_command': 'HEAD_OF_COMMAND',
            'head_of_operations': 'HEAD_OF_OPERATIONS',
            'command': 'COMMAND',
            'admin': 'ADMIN'
        }

        let assignedCount = 0
        const assignedIds: string[] = []
        const failedIds: string[] = []
        for (const u of mappedUsers) {
            let titleCode: string | null = null

            // Attempt to resolve best title
            if (u.current_title_id && titles) {
                const existing = titles.find((t: any) => t.id === u.current_title_id);
                if (existing) titleCode = existing.code;
            }
            if (!titleCode) {
                const mappedCode = roleToTitleMap[u.role]
                if (mappedCode && titles && titles.some((t: any) => t.code === mappedCode)) {
                    titleCode = mappedCode
                }
            }

            // Never assign the first arbitrary database title to an unmapped role.
            if (!titleCode) { failedIds.push(u.id); continue }

            // Execute assignment via RPC
            const { error: rpcError } = await (adminClient as any).rpc('assign_title', {
                p_user_id: u.id,
                p_title_code: titleCode,
                p_program_id: program_id || null,
                p_assigned_by: user.id
            })

            if (rpcError) {
                console.error(`Failed to assign title [${titleCode}] to user ${u.id}:`, rpcError)
                failedIds.push(u.id)
                continue
            }

            // Keep the directory pointer in sync across deployed assign_title versions.
            const updates: any = {}
            if (titles) {
                const matchedRecord = titles.find((t: any) => t.code === titleCode)
                if (matchedRecord) {
                    updates.current_title_id = matchedRecord.id
                    updates.unit = matchedRecord.unit
                }
            }

            // Auto-activate pending accounts when the program is live
            if (isProgramActive && isPending(u)) {
                updates.is_active = true
                updates.activation_status = 'active'
            }

            if (Object.keys(updates).length > 0) {
                const { error: updateError } = await (adminClient as any)
                    .from('users')
                    .update(updates)
                    .eq('id', u.id)
                if (updateError) { failedIds.push(u.id); continue }
            }
            assignedCount += 1
            assignedIds.push(u.id)
        }

        return NextResponse.json({
            success: failedIds.length === 0,
            assigned_count: assignedCount,
            assigned_ids: assignedIds,
            already_assigned_count: alreadyAssignedIds.size,
            already_assigned_ids: [...alreadyAssignedIds],
            failed_count: failedIds.length,
            failed_ids: failedIds,
            inactive_count: inactiveIds.length,
            inactive_ids: inactiveIds,
        }, { status: failedIds.length > 0 ? 207 : 200 })
    } catch (error: any) {
        console.error('Unexpected error in bulk-assign-program:', error)
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
    }
}
