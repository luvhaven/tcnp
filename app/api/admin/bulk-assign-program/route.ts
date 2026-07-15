import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
            .single()

        const role = (currentUser as { role?: string } | null)?.role

        if (!role || !['super_admin', 'dev_admin', 'admin', 'head_of_command'].includes(role)) {
            return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
        }

        const body = await request.json()
        const { officer_ids, program_id } = body as { officer_ids?: string[], program_id?: string }

        if (!officer_ids || !Array.isArray(officer_ids) || officer_ids.length === 0) {
            return NextResponse.json({ error: 'Missing or invalid officer_ids' }, { status: 400 })
        }

        // Load available official titles to map fallbacks
        const { data: titles } = await (adminClient as any).from('official_titles').select('*')
        const fallbackTitleCode = titles && titles.length > 0 ? titles[0].code : 'COMMAND'

        // Load selected users
        const { data: usersData } = await (adminClient as any)
            .from('users')
            .select('id, current_title_id, role, is_active, activation_status')
            .in('id', officer_ids)

        const mappedUsers = usersData || []

        // Fetch the program to ensure auto-activation happens if it is active
        let isProgramActive = false
        if (program_id) {
            const { data: prog } = await (adminClient as any).from('programs').select('status').eq('id', program_id).single()
            if (prog && prog.status === 'active') isProgramActive = true
        }

        const roleToTitleMap: Record<string, string> = {
            'alpha_oscar': 'ALPHA_OSCAR',
            'tango_oscar': 'TANGO_OSCAR',
            'victor_oscar': 'VICTOR_OSCAR',
            'delta_oscar': 'DELTA_OSCAR',
            'echo_oscar': 'ECHO_OSCAR',
            'november_oscar': 'NOVEMBER_OSCAR',
            'noscar_den': 'NOVEMBER_OSCAR',
            'head_noscar_den': 'HEAD_NOVEMBER_OSCAR',
            'noscar_nest': 'NOVEMBER_OSCAR',
            'head_noscar_nest': 'HEAD_NOVEMBER_OSCAR',
            'captain': 'CAPTAIN',
            'vice_captain': 'VICE_CAPTAIN'
        }

        for (const u of mappedUsers) {
            let titleCode = fallbackTitleCode

            // Attempt to resolve best title
            if (u.current_title_id && titles) {
                const existing = titles.find((t: any) => t.id === u.current_title_id);
                if (existing) titleCode = existing.code;
            } else {
                const mappedCode = roleToTitleMap[u.role]
                if (mappedCode && titles && titles.some((t: any) => t.code === mappedCode)) {
                    titleCode = mappedCode
                }
            }

            // Execute assignment via RPC
            const { error: rpcError } = await (adminClient as any).rpc('assign_title', {
                p_user_id: u.id,
                p_title_code: titleCode,
                p_program_id: program_id || null,
                p_assigned_by: user.id
            })

            if (rpcError) {
                console.error(`Failed to assign title [${titleCode}] to user ${u.id}:`, rpcError)
                continue // Skip to next, do not crash the entire batch
            }

            // Manually sync `current_title_id` & `unit` because `assign_title` RPC 
            // skips it when a program is explicitly assigned (`p_program_id != null`)
            const updates: any = {}
            if (titles) {
                const matchedRecord = titles.find((t: any) => t.code === titleCode)
                if (matchedRecord) {
                    updates.current_title_id = matchedRecord.id
                    updates.unit = matchedRecord.unit
                }
            }

            // Auto-Activate if program is active AND user is inactive/pending
            if (isProgramActive && (!u.is_active || u.activation_status === 'pending')) {
                updates.is_active = true
                updates.activation_status = 'active'
            }

            if (Object.keys(updates).length > 0) {
                await (adminClient as any)
                    .from('users')
                    .update(updates)
                    .eq('id', u.id)
            }
        }

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Unexpected error in bulk-assign-program:', error)
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
    }
}
