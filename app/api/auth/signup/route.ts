import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/types/supabase'
import { NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/security/rate-limit'

export async function POST(request: Request) {
    try {
        // Enforce strict rate limit (5 signups per IP per 5 minutes)
        const limitCheck = checkRateLimit(request, 'auth-signup', 5, 5 * 60 * 1000)
        if (!limitCheck.success) {
            return NextResponse.json({ error: 'Too many signup attempts. Please try again later.' }, { status: 429 })
        }
        const adminClient = createAdminClient()
        const db = adminClient as any

        const body = await request.json()
        const { email, password, full_name, phone, role, oscar: custom_oscar, team } = body

        if (!email || !password || !full_name || !role) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        const VALID_TEAMS = ['strength', 'wisdom', 'swift']
        if (team && !VALID_TEAMS.includes(team)) {
            return NextResponse.json({ error: 'Invalid team selection' }, { status: 400 })
        }

        // Create user via Supabase Admin API
        const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
            email,
            password,
            email_confirm: true, // Auto-confirm email
            user_metadata: {
                full_name,
                phone,
                role
            }
        })

        if (authError) {
            console.error('Auth error:', authError)
            return NextResponse.json({ error: authError.message }, { status: 400 })
        }

        if (!authData.user) {
            return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
        }

        // Generate OSCAR fallback if not provided manually
        const generateOscar = (fullName: string, userRole: string) => {
            if (!fullName) return null
            const initials = fullName.split(' ').map(n => n[0]).join('').toUpperCase()
            const roleCode = userRole.toUpperCase().replace('_', '-')
            return `OSCAR-${initials}-${roleCode}`
        }

        const oscar = custom_oscar || generateOscar(full_name, role)

        const insertData: any = {
            id: authData.user.id,
            email,
            full_name,
            phone: phone || null,
            oscar,
            role,
            team: team || null,
            activation_status: 'pending', // Pending Admin Approval
            is_active: false,
            created_by: authData.user.id
        }

        const { error: userError } = await db
            .from('users')
            .insert([insertData] as Database['public']['Tables']['users']['Insert'][])

        if (userError) {
            console.error('User table error:', userError)
            await adminClient.auth.admin.deleteUser(authData.user.id)
            return NextResponse.json({ error: userError.message }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            message: 'Signup successful. Your account is pending admin approval.',
            user: {
                id: authData.user.id,
                email,
                full_name,
                role,
                oscar
            }
        })

    } catch (error: any) {
        console.error('Unexpected error:', error)
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
    }
}
