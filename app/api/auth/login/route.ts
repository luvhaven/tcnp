import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/security/rate-limit'

const loginSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(4096),
})

export async function POST(request: Request) {
  if (!checkRateLimit(request, 'login', 10, 60_000).success) return NextResponse.json({ error: 'Too many attempts. Please wait a minute.' }, { status: 429 })
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const parsed = loginSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid email address and password.' }, { status: 400 })
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data)

    if (error || !data.user) {
      if (error && (!error.status || error.status >= 500)) return NextResponse.json({ error: 'Authentication is temporarily unavailable. Please retry.' }, { status: 503 })
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: profile, error: profileError } = await admin
      .from('users')
      .select('activation_status, role, is_active')
      .eq('id', data.user.id)
      .single()

    const isActive = profile?.activation_status === 'active' && profile?.is_active !== false
    if (profileError || !isActive) {
      await supabase.auth.signOut()
      const pending = profile?.activation_status === 'pending'
      return NextResponse.json(
        { error: pending ? 'Your account is awaiting admin approval.' : 'Security clearance denied: account is inactive or restricted.' },
        { status: 403 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[auth/login] Authentication service failure:', error)
    return NextResponse.json(
      { error: 'The authentication service is temporarily unavailable. Please try again shortly.' },
      { status: 503 }
    )
  }
}
