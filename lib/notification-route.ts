/**
 * Notification types and routing shared by the in-app bell (hooks/useNotifications)
 * and the device push sender (app/api/notifications/dispatch), so tapping a push
 * opens the same page as clicking the notification in the app.
 */

export type NotificationType =
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | 'broken_arrow'
  | 'call_sign'
  | 'chat'
  | 'announcement'
  | 'birthday_reminder'
  | 'alert'
  | 'reminder'

export interface AppNotification {
  id: string
  user_id: string
  title: string
  message: string
  type: NotificationType
  is_read: boolean
  created_at: string
  journey_id?: string | null
  metadata?: { kind?: string; program_id?: string; request_id?: string; [key: string]: unknown } | null
}

/**
 * Where clicking a notification should take the user. Kept alongside
 * resolveChimeKey since both classify a notification by kind/type — the
 * single source of truth for "what is this notification about".
 */
export function resolveNotificationRoute(n: AppNotification): string | null {
  const url = n.metadata?.url
  if (typeof url === 'string' && url.startsWith('/chat?') && !/[\\\r\n]/.test(url)) return url
  const kind = n.metadata?.kind
  if (kind === 'password_reset_request') return '/officers?tab=resets'
  if (kind === 'food_ready') return '/welfare'
  if (kind === 'birthday_0700' || n.type === 'birthday_reminder') return '/welfare'
  if (kind === 'mission_request') return '/dashboard'
  if (kind === 'mention') return '/chat'
  if (kind === 'announcement' || n.type === 'announcement') {
    const category = String(n.metadata?.category || '').toLowerCase()
    if (category === 'training' || category === 'recruitment') return '/training'
    if (category === 'birthday' || category === 'wedding' || category === 'welfare') return '/welfare'
    return '/dashboard'
  }
  if (n.journey_id) return `/journeys?highlight=${n.journey_id}`
  if (n.type === 'chat') return '/chat'
  if (n.type === 'broken_arrow') return '/incidents'
  if (n.type === 'call_sign') return '/operations-monitor'
  return null
}
