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

/**
 * The title and body a device (lock screen, notification tray) shows for a
 * notification. It says what happened and what the officer is expected to do,
 * so they can decide whether to open the app without unlocking it first.
 *
 * It is built only from the notification's type and kind, never from its own
 * title or message: those can carry a Papa's name, an officer's name or a
 * message someone wrote, and a push travels through third-party push services
 * and sits on lock screens. The full text is shown once the app is open.
 */
export function describeNotificationForDevice(
  n: Pick<AppNotification, 'type' | 'metadata' | 'journey_id'>,
): { title: string; body: string } {
  const kind = n.metadata?.kind
  const url = n.metadata?.url
  if (n.type === 'broken_arrow') return { title: 'Emergency: Broken Arrow', body: 'An officer has signalled distress. Open TCNP now and respond.' }
  if (kind === 'mission_request') return { title: 'Availability request', body: 'Leadership is asking who can serve. Open TCNP and confirm whether you are available.' }
  if (kind === 'food_ready') return { title: 'Food is ready', body: 'Welfare has called mealtime. Head to the serving point.' }
  if (kind === 'mention') return { title: 'You were mentioned in chat', body: 'Someone needs your attention. Open the conversation to read and reply.' }
  if (kind === 'password_reset_request') return { title: 'Password reset awaiting approval', body: 'An officer has asked to reset their password. Review the request and approve or reject it.' }
  if (kind === 'birthday_0700' || n.type === 'birthday_reminder') return { title: 'Birthday today', body: 'An officer is celebrating today. Open Welfare to see who and send your wishes.' }
  if (kind === 'announcement' || n.type === 'announcement') {
    const category = String(n.metadata?.category || '').toLowerCase()
    if (category === 'training' || category === 'recruitment') return { title: 'Training announcement', body: 'There is a new training notice. Open Training to read the details and what is required of you.' }
    if (category === 'birthday' || category === 'wedding' || category === 'welfare') return { title: 'Welfare announcement', body: 'Welfare has shared news about an officer. Open Welfare to read it.' }
    return { title: 'New announcement', body: 'Leadership has posted a notice for you. Open TCNP to read it.' }
  }
  if ((typeof url === 'string' && url.startsWith('/chat?')) || n.type === 'chat') return { title: 'Chat update', body: 'There is new activity in one of your conversations. Open it to read and reply.' }
  if (n.type === 'call_sign') return { title: 'Journey call sign', body: 'A journey has reported a new status. Open Operations Monitor to follow it.' }
  if (n.journey_id) return { title: 'Journey update', body: 'A journey you are part of has changed. Open it to review the details and act.' }
  if (n.type === 'reminder') return { title: 'Reminder', body: 'Something on your schedule is due. Open TCNP to see what needs doing.' }
  if (n.type === 'alert' || n.type === 'warning' || n.type === 'error') return { title: 'Action needed', body: 'An alert needs your attention. Open TCNP to review it and respond.' }
  return { title: 'New update', body: 'You have a new update. Open TCNP to view it.' }
}
