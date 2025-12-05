import { createClient } from '@supabase/supabase-js'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function DELETE(request: Request) {
    const cookieStore = cookies()

    // 1. Create authenticated client to check permissions
    const supabaseAuth = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) {
                    return cookieStore.get(name)?.value
                },
                set(name: string, value: string, options: CookieOptions) {
                    cookieStore.set({ name, value, ...options })
                },
                remove(name: string, options: CookieOptions) {
                    cookieStore.set({ name, value: '', ...options })
                },
            },
        }
    )

    // 2. Get current user
    const { data: { user } } = await supabaseAuth.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 3. Check admin permissions
    const { data: userRole } = await supabaseAuth
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

    const isAdmin = userRole && ['super_admin', 'admin', 'dev_admin', 'head_of_command'].includes(userRole.role)

    if (!isAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const targetUserId = searchParams.get('id')

    if (!targetUserId) {
        return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    // 4. Create admin client for the actual deletion (service role)
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 5. Get target user details before deletion for the log
    const { data: targetUser } = await supabaseAdmin
        .from('users')
        .select('email, full_name')
        .eq('id', targetUserId)
        .single()

    // 6. Delete user
    const { error } = await supabaseAdmin.auth.admin.deleteUser(targetUserId)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // 7. Explicitly create audit log entry
    // We use the service role client but explicitly set the user_id to the actual actor
    await supabaseAdmin.from('audit_logs').insert({
        user_id: user.id, // The actor
        action: 'delete',
        target_type: 'users',
        target_id: targetUserId,
        description: `Deleted user ${targetUser?.full_name || targetUser?.email || targetUserId}`,
        changes: {
            before: targetUser,
            after: null
        },
        metadata: {
            method: 'api',
            endpoint: '/api/admin/delete-user'
        }
    })

    return NextResponse.json({ success: true })
}
