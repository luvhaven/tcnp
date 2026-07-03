import { createClient } from '@supabase/supabase-js'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function DELETE(request: Request) {
    const cookieStore = await cookies()

    // 1. Create authenticated client to check caller's permissions
    const supabaseAuth = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) { return cookieStore.get(name)?.value },
                set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }) },
                remove(name: string, options: CookieOptions) { cookieStore.set({ name, value: '', ...options }) },
            },
        }
    )

    // 2. Get caller identity
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 3. Check caller has sufficient permissions
    const { data: callerData } = await supabaseAuth
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

    const ALLOWED_ROLES = ['super_admin', 'admin', 'dev_admin', 'head_of_command', 'command', 'captain', 'vice_captain', 'hod', 'hop']
    const isAllowed = callerData && ALLOWED_ROLES.includes(callerData.role)
    if (!isAllowed) {
        return NextResponse.json({ error: 'Forbidden: insufficient permissions' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const targetUserId = searchParams.get('id')
    if (!targetUserId) {
        return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    // 4. Service role client — bypasses all RLS + can delete auth users
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 5. Get target user details before deletion (for the audit log)
    const { data: targetUser } = await supabaseAdmin
        .from('users')
        .select('email, full_name, role')
        .eq('id', targetUserId)
        .single()

    // 6. Guard: prevent deleting dev_admin accounts
    if (targetUser?.role === 'dev_admin') {
        return NextResponse.json({ error: 'Cannot delete a super admin account' }, { status: 403 })
    }

    // 7. Cascade cleanup — delete all rows referencing this user to prevent FK violations
    // These are fire-and-forget; we don't hard-fail on errors since tables may not all exist
    const tables: Array<{ table: string; column: string }> = [
        { table: 'journey_assignments', column: 'officer_id' },
        { table: 'user_locations', column: 'user_id' },
        { table: 'user_program_assignments', column: 'user_id' },
        { table: 'officer_titles', column: 'user_id' },
        { table: 'notifications', column: 'user_id' },
        { table: 'chat_messages', column: 'sender_id' },
        { table: 'telemetry_data', column: 'user_id' },
        { table: 'cheetah_flower_logs', column: 'performed_by' },
        { table: 'nest_comfort_logs', column: 'performed_by' },
        { table: 'eo_checklist_logs', column: 'performed_by' },
        { table: 'den_checklist_logs', column: 'performed_by' },
        { table: 'do_feedback_forms', column: 'submitted_by' },
    ]

    for (const { table, column } of tables) {
        try {
            await supabaseAdmin.from(table).delete().eq(column, targetUserId)
        } catch (_) {
            // Table may not exist or FK already cleared – continue
        }
    }

    // 8. Delete from the public users profile table first
    await supabaseAdmin.from('users').delete().eq('id', targetUserId)

    // 9. Delete the auth user (Supabase Auth)
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId)

    if (authDeleteError) {
        console.error('[delete-user] Auth delete failed:', authDeleteError)
        return NextResponse.json({ error: authDeleteError.message }, { status: 500 })
    }

    // 10. Write audit log
    await supabaseAdmin.from('audit_logs').insert({
        user_id: user.id,
        action: 'delete',
        target_type: 'users',
        target_id: targetUserId,
        description: `Deleted officer ${targetUser?.full_name || targetUser?.email || targetUserId}`,
        changes: { before: targetUser, after: null },
        metadata: { method: 'api', endpoint: '/api/admin/delete-user' }
    })

    return NextResponse.json({ success: true })
}
