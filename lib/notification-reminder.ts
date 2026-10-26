export const NOTIFICATION_REMINDER_KEY = 'tcnp-notification-dismissed-session'

/** Cosmetic reminder identity only; authorization always stays on the server. */
export function notificationReminderSession(session: { user: { id: string }; access_token: string } | null, fallback: string): string | null {
  if (!session?.user?.id) return null
  try {
    const body = JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    if (typeof body.session_id === 'string' && body.session_id) return `${session.user.id}:${body.session_id}`
  } catch { /* A missing claim must not turn dismissal into a permanent opt-out. */ }
  return `${session.user.id}:temporary:${fallback}`
}

export function shouldShowNotificationReminder(options: {
  session: string | null; dismissedSession: string | null; disabled: boolean
  permission: NotificationPermission | 'unsupported'; connected: boolean
}): boolean {
  if (!options.session || options.disabled || options.dismissedSession === options.session) return false
  return options.permission !== 'granted' || !options.connected
}
