import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
    try {
        const supabase = await createClient()

        // Verify the requesting user
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { new_password } = body

        if (!new_password) {
            return NextResponse.json({ error: 'Missing new password' }, { status: 400 })
        }

        // Attempt to update the user's password directly via their own token
        const { error: updateError } = await supabase.auth.updateUser({
            password: new_password
        })

        if (updateError) {
            console.error("Auth password update error:", updateError)
            return NextResponse.json({ error: updateError.message }, { status: 400 })
        }

        // Now update password_last_changed track
        const adminClient = createAdminClient()
        const { error: dbError } = await (adminClient as any)
            .from('users')
            .update({ password_last_changed: new Date().toISOString() })
            .eq('id', user.id)

        if (dbError) {
            console.error("DB update error:", dbError)
            return NextResponse.json({ error: dbError.message }, { status: 500 })
        }

        return NextResponse.json({ success: true, message: 'Password updated successfully' })

    } catch (error: any) {
        console.error('Unexpected error:', error)
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
    }
}
