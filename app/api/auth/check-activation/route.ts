import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/auth/check-activation
 * 
 * Uses the admin client (bypasses RLS) to read the activation_status 
 * of the currently authenticated user.
 * 
 * Returns:
 *   { status: 'active' | 'pending' | 'deactivated' }
 * 
 * If the user is not logged in or not found, returns 403.
 */
export async function POST() {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Super admin bypass — always active
        if (user.email === 'doriazowan@gmail.com') {
            return NextResponse.json({ status: 'active' })
        }

        // Use admin client so RLS on the `users` table does NOT block the read
        const adminClient = createAdminClient()
        const { data: dbUser, error: dbError } = await (adminClient as any)
            .from('users')
            .select('activation_status, is_active')
            .eq('id', user.id)
            .single()

        if (dbError || !dbUser) {
            console.error('[check-activation] DB lookup failed:', dbError)
            return NextResponse.json({ error: 'User record not found.' }, { status: 404 })
        }

        return NextResponse.json({ status: dbUser.activation_status as string })
    } catch (err: any) {
        console.error('[check-activation] Unexpected error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
