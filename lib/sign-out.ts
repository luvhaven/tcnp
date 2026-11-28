import { createClient } from '@/lib/supabase/client'

/**
 * Signs this device out. One routine for every "Log out" control (the header's
 * profile menu and the phone "More" menu), so none of them can forget a step:
 * mark the officer offline, drop this device's push subscription, stop the
 * native app's background location, then end the session.
 *
 * Nothing before the sign-out itself is allowed to block it.
 */
export async function signOutOfTcnp(userId: string | null | undefined): Promise<void> {
  const supabase = createClient()
  if (userId) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 1500)
    try {
      await supabase.from('users').update({ is_online: false, last_seen: new Date().toISOString() }).eq('id', userId).abortSignal(controller.signal)
    } catch { /* Presence must never prevent signing out. */ }
    finally { clearTimeout(timeout) }
  }
  await import('@/lib/device-push').then(m => m.disconnectDevicePush(false)).catch(() => undefined)
  // Native app: stop background location for this officer before the session ends.
  await import('@/lib/native-shell').then(m => m.stopNativeTracking()).catch(() => undefined)
  await supabase.auth.signOut()
}

/** Window events that let the phone "More" menu drive the notification inbox. */
export const OPEN_NOTIFICATIONS_EVENT = 'tcnp-open-notifications'
export const UNREAD_NOTIFICATIONS_EVENT = 'tcnp-unread-notifications'
