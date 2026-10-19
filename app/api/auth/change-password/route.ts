import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const bodySchema = z.object({
    current_password: z.string().min(1).max(4096),
    new_password: z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password must be at most 72 characters'),
})

export async function POST(request: Request) {
    try {
        const limitCheck = checkRateLimit(request, 'auth-change-password', 5, 5 * 60 * 1000)
        if (!limitCheck.success) {
            return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 })
        }

        const supabase = await createClient()

        // Verify the requesting user
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const parsed = bodySchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) {
            const message = parsed.error.issues[0]?.message
            return NextResponse.json({ error: message && message !== 'Required' ? message : 'Current and new password are required' }, { status: 400 })
        }
        const { current_password, new_password } = parsed.data
        if (current_password === new_password) {
            return NextResponse.json({ error: 'New password must be different from the current one' }, { status: 400 })
        }

        // Re-authenticate with the current password on a throwaway client, so a
        // hijacked session alone cannot change the password.
        const verifier = createSupabaseClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
        )
        const { data: verified, error: verifyError } = await verifier.auth.signInWithPassword({
            email: user.email,
            password: current_password,
        })
        if (verifyError || verified.user?.id !== user.id) {
            return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
        }
        // Drop the extra session the check created.
        await verifier.auth.signOut({ scope: 'local' }).catch(() => undefined)

        const { error: updateError } = await supabase.auth.updateUser({
            password: new_password
        })

        if (updateError) {
            console.error('Auth password update error:', updateError)
            const message = updateError.code === 'weak_password'
                ? 'Password is too weak. Choose a longer or less common password.'
                : updateError.code === 'same_password'
                    ? 'New password must be different from the current one'
                    : 'Could not update password'
            return NextResponse.json({ error: message }, { status: 400 })
        }

        // Now update password_last_changed track
        const adminClient = createAdminClient()
        const { error: dbError } = await (adminClient as any)
            .from('users')
            .update({ password_last_changed: new Date().toISOString() })
            .eq('id', user.id)

        if (dbError) {
            // The password itself changed; only the rotation timestamp failed.
            console.error('DB update error:', dbError)
        }

        return NextResponse.json({ success: true, message: 'Password updated successfully' })

    } catch (error) {
        console.error('Unexpected error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
