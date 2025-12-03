import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function DELETE(request: Request) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('id')

    if (!userId) {
        return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    // Delete user from Auth (this cascades to public.users)
    const { error } = await supabase.auth.admin.deleteUser(userId)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
