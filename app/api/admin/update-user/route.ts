import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { isPlatformAdministrator, platformAuthorityRank } from '@/lib/utils'

export async function POST(request: Request) {
    try {
        const supabase = await createClient()
        const adminClient = createAdminClient()
        const db = adminClient as any

        // Verify platform authority. Operational leaders manage programmes,
        // while unit heads manage their own membership lists.
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { data: currentUser } = await db
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single()

        const currentRole = (currentUser as { role?: string } | null)?.role

        if (!isPlatformAdministrator(currentRole)) {
            return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
        }

        // Get request body
        const body = await request.json()
        const { id, email, password, full_name, phone, role, photo_url, team, is_team_head } = body

        if (!id) {
            return NextResponse.json({ error: 'Missing user ID' }, { status: 400 })
        }

        const { data: targetUser } = await db
            .from('users')
            .select('role')
            .eq('id', id)
            .single()

        if (!targetUser) {
            return NextResponse.json({ error: 'Officer not found' }, { status: 404 })
        }

        const targetRole = (targetUser as { role?: string }).role
        const desiredRole = role || targetRole
        if (currentRole !== 'super_admin' && (
            platformAuthorityRank(targetRole) >= 80 || platformAuthorityRank(desiredRole) >= 80
        )) {
            return NextResponse.json({ error: 'Only Super Admin can manage administrator accounts' }, { status: 403 })
        }
        if (id === user.id && desiredRole !== currentRole) {
            return NextResponse.json({ error: 'You cannot change your own authority level' }, { status: 403 })
        }

        if (team !== undefined && team !== null && team !== '' && !['strength', 'wisdom', 'swift'].includes(team)) {
            return NextResponse.json({ error: 'Invalid team' }, { status: 400 })
        }

        // Prepare auth updates
        const authUpdates: any = {
            email,
            user_metadata: {
                full_name,
                phone,
                role
            }
        }

        if (password && password.trim() !== '') {
            authUpdates.password = password
        }

        // Update user via Supabase Admin API
        const { data: authData, error: authError } = await adminClient.auth.admin.updateUserById(
            id,
            authUpdates
        )

        if (authError) {
            console.error('Auth update error:', authError)
            return NextResponse.json({ error: authError.message }, { status: 400 })
        }

        // Update users table
        const userUpdates: any = {
            email,
            full_name,
            phone: phone || null,
            role,
            updated_at: new Date().toISOString()
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
