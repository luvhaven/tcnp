import { createClient } from '@/lib/supabase/client'

/**
 * Hand a signed-in officer who has forgotten their current password over to
 * the sign-in page's admin-approved reset flow. The email travels in
 * sessionStorage (never the URL) and is consumed once by the login page.
 */
export const RESET_PREFILL_KEY = 'tcnp_reset_prefill'

export async function startForgotPasswordFlow() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  try {
    sessionStorage.setItem(RESET_PREFILL_KEY, JSON.stringify({ email: user?.email ?? '', timestamp: Date.now() }))
  } catch { /* The officer can still type their email on the reset form. */ }
  await supabase.auth.signOut().catch(() => undefined)
  window.location.replace('/login')
}

/** Returns the pre-filled reset email once (and clears it), or null. */
export function consumeResetPrefill(): string | null {
  try {
    const raw = sessionStorage.getItem(RESET_PREFILL_KEY)
    if (!raw) return null
    sessionStorage.removeItem(RESET_PREFILL_KEY)
    const parsed = JSON.parse(raw)
    if (!parsed?.timestamp || Date.now() - parsed.timestamp > 10 * 60 * 1000) return null
    return typeof parsed.email === 'string' ? parsed.email : ''
  } catch {
    return null
  }
}
