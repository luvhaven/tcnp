import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { isExecutiveRole, isPlatformAdministrator, OFFICER_TEAMS, platformAuthorityRank } from '@/lib/utils'
import { OFFICER_ROLE_OPTIONS } from '@/lib/officer-directory'
import { isPermanentOwnerEmail } from '@/lib/platform-owner'

export async function POST(request: Request) {
    try {
        const supabase = await createClient()
        const adminClient = createAdminClient()
        const db = adminClient as any

        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { data: currentUser } = await db
            .from('users')
            .select('role, has_admin_access')
            .eq('id', user.id)
            .eq('activation_status', 'active')
            .or('is_active.is.null,is_active.eq.true')
            .single()

        const currentRole = (currentUser as { role?: string } | null)?.role

        if (!isPlatformAdministrator(currentRole, currentUser?.has_admin_access)) {
            return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
        }

        // Get request body
        const body = await request.json()
        const { id, password, full_name, phone, role, photo_url, team, is_team_head, has_admin_access } = body
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : undefined

        if (!id) {
            return NextResponse.json({ error: 'Missing user ID' }, { status: 400 })
        }

        const { data: targetUser } = await db
            .from('users')
            .select('role, email, is_directory_hidden, has_admin_access')
            .eq('id', id)
            .single()

        if (!targetUser) {
            return NextResponse.json({ error: 'Officer not found' }, { status: 404 })
        }

        const targetRole = (targetUser as { role?: string }).role
        const desiredRole = role ?? targetRole
        const desiredAdminAccess = has_admin_access ?? (targetUser.has_admin_access || targetRole === 'admin')
        if ((role !== undefined && role !== targetRole && !OFFICER_ROLE_OPTIONS.some(option => option.value === role)) ||
            (has_admin_access !== undefined && typeof has_admin_access !== 'boolean') ||
            (body.email !== undefined && !email)) {
            return NextResponse.json({ error: 'Check the email, officer role and additional access level' }, { status: 400 })
        }
        if (targetRole === 'admin' && desiredRole === 'admin' && has_admin_access === false) {
            return NextResponse.json({ error: 'Select an officer role before removing legacy Admin access' }, { status: 400 })
        }
        const targetIsPermanentOwner = isPermanentOwnerEmail((targetUser as { email?: string }).email)
        if ((targetUser as { is_directory_hidden?: boolean }).is_directory_hidden && id !== user.id) {
            return NextResponse.json({ error: 'Officer not found' }, { status: 404 })
        }
        if (targetRole === 'super_admin' && !targetIsPermanentOwner) {
            return NextResponse.json({ error: 'Only the permanent platform owner may hold Super Admin' }, { status: 403 })
        }
        if (targetIsPermanentOwner && (
            id !== user.id ||
            !isPermanentOwnerEmail(email ?? (targetUser as { email?: string }).email) ||
            desiredRole !== 'super_admin'
        )) {
            return NextResponse.json({ error: 'The permanent owner identity and authority cannot be changed' }, { status: 403 })
        }
        if (desiredRole === 'super_admin' && !targetIsPermanentOwner) {
            return NextResponse.json({ error: 'Only the permanent platform owner may hold Super Admin' }, { status: 403 })
        }
        if (currentRole !== 'super_admin' && (
            platformAuthorityRank(targetRole, targetUser.has_admin_access) >= 80 ||
            platformAuthorityRank(desiredRole, desiredAdminAccess) >= 80
        )) {
            return NextResponse.json({ error: 'Only Super Admin can manage administrator accounts' }, { status: 403 })
        }
        if (id === user.id && (desiredRole !== currentRole || desiredAdminAccess !== targetUser.has_admin_access)) {
            return NextResponse.json({ error: 'You cannot change your own authority level' }, { status: 403 })
        }

        if (team && !OFFICER_TEAMS.some(option => option.value === team)) {
            return NextResponse.json({ error: 'Invalid team' }, { status: 400 })
        }

        // Only write fields the caller actually sent: a role-only change must not
        // wipe the officer's phone or rewrite their login metadata.
        const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key)
        const metadata: Record<string, unknown> = {}
        if (has('full_name')) metadata.full_name = full_name
        if (has('phone')) metadata.phone = phone
        if (desiredRole !== targetRole) metadata.role = desiredRole

        const authUpdates: any = {}
        if (email && email !== targetUser.email) {
            const { data: duplicate, error: lookupError } = await db.from('users')
                .select('id').ilike('email', email.replace(/[\\%_]/g, '\\$&')).neq('id', id).limit(1)
            if (lookupError) return NextResponse.json({ error: 'Could not verify the email address' }, { status: 500 })
            if (duplicate?.length) return NextResponse.json({ error: 'An account already uses this email address.' }, { status: 409 })
            authUpdates.email = email
        }
        if (Object.keys(metadata).length > 0) {
            const { data: existing } = await adminClient.auth.admin.getUserById(id)
            authUpdates.user_metadata = { ...(existing?.user?.user_metadata ?? {}), ...metadata }
        }

        if (password && password.trim() !== '') {
            authUpdates.password = password
        }

        if (Object.keys(authUpdates).length > 0) {
            const { error: authError } = await adminClient.auth.admin.updateUserById(id, authUpdates)
            if (authError) {
                if (authError.code === 'email_exists' || authError.code === 'user_already_exists') {
                    return NextResponse.json({ error: 'An account already uses this email address.' }, { status: 409 })
                }
                console.error('Auth update error:', authError)
                return NextResponse.json({ error: authError.message }, { status: 400 })
            }
        }

        // Update users table
        const userUpdates: any = { updated_at: new Date().toISOString() }
        if (has('email') && email) userUpdates.email = email
        if (has('full_name')) userUpdates.full_name = full_name
        if (has('phone')) userUpdates.phone = phone || null
        if (desiredRole !== targetRole) {
            userUpdates.role = desiredRole
            userUpdates.oscar = isExecutiveRole(desiredRole) ? 'Executive' : desiredRole === 'viewer' ? null : desiredRole
        }
        if ((has_admin_access !== undefined || desiredRole !== targetRole) && desiredAdminAccess !== targetUser.has_admin_access) {
            userUpdates.has_admin_access = desiredAdminAccess
        }

        if (photo_url !== undefined) {
            userUpdates.photo_url = photo_url
        }

        if (team !== undefined) {
            userUpdates.team = team || null
            userUpdates.is_team_head = team ? is_team_head === true : false
        }

        const { error: userError } = await db
            .from('users')
            .update(userUpdates)
            .eq('id', id)

        if (userError) {
            if (userError.code === '23505') {
                return NextResponse.json({ error: 'An account already uses this email address.' }, { status: 409 })
            }
            console.error('User table update error:', userError)
            return NextResponse.json({ error: userError.message }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            user: {
                id,
                email,
                full_name,
                role
            }
        })

    } catch (error: any) {
        console.error('Unexpected error:', error)
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
    }
}
