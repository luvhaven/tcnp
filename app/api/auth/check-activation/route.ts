import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/auth/check-activation
 *
 * Accepts an optional { access_token } in the request body.
 * When present, authenticates via token (iOS Safari ITP bypass).
 * Falls back to cookie-based session for desktop browsers.
 *
 * Returns: { status: 'active' | 'pending' | 'inactive' | 'deactivated' }
 */
export async function POST(request: Request) {
    try {
        // --- 1. Parse body (may be empty on desktop) ---
        let access_token: string | null = null
        try {
            const body = await request.json()
            access_token = body?.access_token ?? null
        } catch {
            // body may be empty — that's fine
        }

        const url = process.env.NEXT_PUBLIC_SUPABASE_URL
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!url || !serviceKey) {
            return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
        }

        let userId: string | null = null

        // --- 2a. Token path: client sends access_token in body (iOS Safari safe) ---
        if (access_token) {
            const adminClient = createClient(url, serviceKey, {
                auth: { autoRefreshToken: false, persistSession: false }
            })
            const { data: { user }, error } = await adminClient.auth.getUser(access_token)
            if (error || !user) {
                return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
            }
            userId = user.id
        } else {
            // --- 2b. Cookie path: desktop browsers where cookies are reliable ---
            const supabase = await createServerClient()
            const { data: { user }, error } = await supabase.auth.getUser()
            if (error || !user) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
            }
            userId = user.id
        }

        // --- 3. Super admin bypass ---
        if (!userId) {
            return NextResponse.json({ error: 'Could not resolve user' }, { status: 401 })
        }

        // --- 4. Read activation_status using service role (bypasses RLS) ---
        const adminClient = createClient(url, serviceKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        })

        // Super-admin bypass by email
        const { data: userRow, error: dbError } = await adminClient
            .from('users')
            .select('activation_status, is_active, email')
            .eq('id', userId)
            .single()

        if (dbError || !userRow) {
            console.error('[check-activation] DB lookup failed:', dbError)
            return NextResponse.json({ error: 'User record not found.' }, { status: 404 })
        }

        // Super admin email bypass
        if (userRow.email === 'doriazowan@gmail.com') {
            return NextResponse.json({ status: 'active' })
        }

        // The status field may be 'active', 'inactive', 'pending', or legacy 'deactivated'
        const status = userRow.activation_status as string
        return NextResponse.json({ status })

    } catch (err: any) {
        console.error('[check-activation] Unexpected error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
