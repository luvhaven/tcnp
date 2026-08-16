import { createClient } from '@supabase/supabase-js'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { isAdmin, effectiveOscarRole } from '@/lib/utils'

export async function DELETE(request: Request) {
    // Enforce strict rate limit (20 deletes per IP per minute)
    const limitCheck = checkRateLimit(request, 'admin-delete', 20, 60000)
    if (!limitCheck.success) {
        return NextResponse.json({ error: 'Rate limit exceeded for admin operations.' }, { status: 429 })
    }

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
        .select('role, oscar')
        .eq('id', user.id)
        .single()

    const isAllowed = callerData && (isAdmin(callerData.role) || isAdmin(effectiveOscarRole(callerData.role, callerData.oscar)))
    if (!isAllowed) {
        return NextResponse.json({ error: 'Forbidden: insufficient permissions' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const targetUserId = searchParams.get('id')
    if (!targetUserId) {
        return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    if (targetUserId === user.id) {
        return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
    }

    // 4. Service role client — bypasses all RLS + can delete auth users
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 5. Get target user details before deletion (for the audit log)
    const { data: targetUser } = await supabaseAdmin
        .from('users')
        .select('email, full_name, role, oscar')
        .eq('id', targetUserId)
        .single()

    // 6. Guard: prevent deleting dev_admin accounts unless caller is also dev_admin
    if (targetUser?.role === 'dev_admin' && callerData.role !== 'dev_admin') {
        return NextResponse.json({ error: 'Cannot delete a developer admin account' }, { status: 403 })
    }

    // 7. Cascade cleanup — nullify or delete all rows referencing this user to prevent FK violations
    try {
        // Nullify single DO assignments on journeys
        await supabaseAdmin.from('journeys').update({ assigned_duty_officer_id: null }).eq('assigned_duty_officer_id', targetUserId)
        await supabaseAdmin.from('journeys').update({ assigned_do_id: null }).eq('assigned_do_id', targetUserId)
        await supabaseAdmin.from('journeys').update({ created_by: null }).eq('created_by', targetUserId)
        await supabaseAdmin.from('journeys').update({ deleted_by: null }).eq('deleted_by', targetUserId)

        // Nullify journey events
        await supabaseAdmin.from('journey_events').update({ triggered_by: null }).eq('triggered_by', targetUserId)

        // Nullify incidents
        await supabaseAdmin.from('incidents').update({ reported_by: null }).eq('reported_by', targetUserId)
        await supabaseAdmin.from('incidents').update({ resolved_by: null }).eq('resolved_by', targetUserId)
        await supabaseAdmin.from('incidents').update({ created_by: null }).eq('created_by', targetUserId)

        // Nullify papas
        await supabaseAdmin.from('papas').update({ created_by: null }).eq('created_by', targetUserId)
        await supabaseAdmin.from('papas').update({ deleted_by: null }).eq('deleted_by', targetUserId)

        // Nullify title assignments assigned_by
        await supabaseAdmin.from('title_assignments').update({ assigned_by: null }).eq('assigned_by', targetUserId)

        // Nullify users created_by
        await supabaseAdmin.from('users').update({ created_by: null }).eq('created_by', targetUserId)

        // Nullify checklist logs
        await supabaseAdmin.from('cheetah_flower_logs').update({ performed_by: null }).eq('performed_by', targetUserId)
        await supabaseAdmin.from('nest_comfort_logs').update({ performed_by: null }).eq('performed_by', targetUserId)
        await supabaseAdmin.from('eo_checklist_logs').update({ performed_by: null }).eq('performed_by', targetUserId)
        await supabaseAdmin.from('den_checklist_logs').update({ performed_by: null }).eq('performed_by', targetUserId)
        await supabaseAdmin.from('do_feedback_forms').update({ submitted_by: null }).eq('submitted_by', targetUserId)
    } catch (nullifyErr) {
        console.warn('[delete-user] Non-fatal error while nullifying references:', nullifyErr)
    }

    // Direct dependent table deletions (user-owned rows)
    const tablesToDelete: Array<{ table: string; column: string }> = [
        { table: 'journey_duty_officers', column: 'user_id' },
        { table: 'journey_assignments', column: 'officer_id' },
        { table: 'title_assignments', column: 'user_id' },
        { table: 'noscar_assignments', column: 'user_id' },
        { table: 'user_locations', column: 'user_id' },
        { table: 'protocol_officer_locations', column: 'user_id' },
        { table: 'vehicle_locations', column: 'user_id' },
        { table: 'push_subscriptions', column: 'user_id' },
        { table: 'message_reactions', column: 'user_id' },
        { table: 'notifications', column: 'user_id' },
        { table: 'chat_messages', column: 'sender_id' },
        { table: 'telemetry_data', column: 'user_id' },
        { table: 'mission_responses', column: 'user_id' },
        { table: 'settings', column: 'user_id' },
    ]

    for (const { table, column } of tablesToDelete) {
        try {
            await supabaseAdmin.from(table).delete().eq(column, targetUserId)
        } catch (delErr) {
            console.warn(`[delete-user] Non-fatal error deleting from ${table}:`, delErr)
        }
    }

    // 8. Delete from the public users profile table
    const { error: userDeleteError } = await supabaseAdmin.from('users').delete().eq('id', targetUserId)
    if (userDeleteError) {
        console.error('[delete-user] Public user delete failed:', userDeleteError)
        return NextResponse.json({ error: `Failed to delete officer profile: ${userDeleteError.message}` }, { status: 500 })
    }

    // 9. Delete the auth user (Supabase Auth)
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId)

    if (authDeleteError) {
        // If user already didn't exist in Auth, treat as successful cleanup
        if (!authDeleteError.message?.toLowerCase().includes('not found') && !authDeleteError.message?.toLowerCase().includes('does not exist')) {
            console.error('[delete-user] Auth delete failed:', authDeleteError)
            return NextResponse.json({ error: `Failed to delete authentication record: ${authDeleteError.message}` }, { status: 500 })
        }
    }

    // 10. Write audit log
    try {
        await supabaseAdmin.from('audit_logs').insert({
            user_id: user.id,
            action: 'delete',
            target_type: 'users',
            target_id: targetUserId,
            description: `Deleted officer ${targetUser?.full_name || targetUser?.email || targetUserId}`,
            changes: { before: targetUser, after: null },
            metadata: { method: 'api', endpoint: '/api/admin/delete-user' }
        })
    } catch (auditErr) {
        console.warn('[delete-user] Non-fatal error writing audit log:', auditErr)
    }

    return NextResponse.json({ success: true })
}

