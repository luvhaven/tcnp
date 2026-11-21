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
  | 'assignment'

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
 * Each unit's own page. November (Den) work lives on the Den's Work tab.
 */
export const UNIT_PAGE_ROUTES: Readonly<Record<string, string>> = {
  alpha: '/alpha',
  tango: '/tango',
  victor: '/victor',
  november_nest: '/nests',
  november_den: '/den?tab=work',
  compliance: '/compliance',
  welfare: '/welfare',
  training: '/training',
  serial: '/serial',
  command: '/command',
  echo: '/echo',
}

/** The unit's page for a unit slug, or null for an unknown or missing slug. */
export function unitPageRoute(slug: unknown): string | null {
  if (typeof slug !== 'string') return null
  return Object.prototype.hasOwnProperty.call(UNIT_PAGE_ROUTES, slug) ? UNIT_PAGE_ROUTES[slug] : null
}

/** The tab on a unit page that holds its tasks ('tasks') or its programme team ('team'). */
export type UnitWorkTab = 'tasks' | 'team'

/**
 * Units whose page has no Tasks or Programme team tab of its own. The Den
 * keeps its own Work tab (tasks) and Floor access on its overview (team);
 * Command opens its page.
 */
const UNIT_WORK_TAB_OVERRIDES: Readonly<Record<string, Readonly<Record<UnitWorkTab, string>>>> = {
  november_den: { tasks: '/den?tab=work', team: '/den' },
  command: { tasks: '/command', team: '/command' },
}

/** The unit page's Tasks or Programme team tab for a unit slug, or null for an unknown or missing slug. */
export function unitWorkRoute(slug: unknown, tab: UnitWorkTab): string | null {
  const page = unitPageRoute(slug)
  if (!page) return null
  const override = Object.prototype.hasOwnProperty.call(UNIT_WORK_TAB_OVERRIDES, slug as string) ? UNIT_WORK_TAB_OVERRIDES[slug as string] : null
  return override ? override[tab] : `${page}?tab=${tab}`
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A metadata id that is safe to put in a route's query string. */
function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

/** Unit task and programme-team notifications, which carry metadata.unit_slug. */
const UNIT_TASK_KINDS = new Set(['unit_task_assigned', 'unit_task_status', 'unit_task_reminder'])

/**
 * Where clicking a notification should take the user. Kept alongside
 * resolveChimeKey since both classify a notification by kind/type — the
 * single source of truth for "what is this notification about".
 */
export function resolveNotificationRoute(n: AppNotification): string | null {
  const url = n.metadata?.url
  if (typeof url === 'string' && url.startsWith('/chat?') && !/[\\\r\n]/.test(url)) return url
  const kind = n.metadata?.kind
  // An unknown unit still lands somewhere useful rather than nowhere.
  if (typeof kind === 'string' && UNIT_TASK_KINDS.has(kind)) return unitWorkRoute(n.metadata?.unit_slug, 'tasks') ?? '/my-operations'
  if (kind === 'unit_programme_grant') {
    const team = unitWorkRoute(n.metadata?.unit_slug, 'team')
    if (!team) return '/my-operations'
    // Open the programme they were added to (UnitProgrammeTeam reads ?programme=).
    const programme = n.metadata?.program_id
    return isUuid(programme) ? `${team}${team.includes('?') ? '&' : '?'}programme=${programme}` : team
  }
  if (kind === 'compliance_inspection') return '/compliance?tab=inspections'
  if (kind === 'compliance_recognition') return '/compliance?tab=recognition'
  // A declined applicant has no account to open; nothing to route to.
  if (kind === 'signup_declined') return null
  // An approved officer's first stop is their profile, to add a headshot.
  if (kind === 'signup_approved') return '/profile'
  // A Duty Officer assignment opens the officer's own work, not the Journeys
  // planning page (which is for leadership).
  if (kind === 'do_assignment' || n.type === 'assignment') return '/my-operations'
  if (kind === 'tango_licence_expiring') return '/tango?tab=drivers'
  if (kind === 'alpha_timeline_overdue') {
    // Open that Papa's timeline on the right programme (alpha/page reads ?programme=&papa=).
    const { program_id: programme, papa_id: papa } = n.metadata ?? {}
    return isUuid(programme) && isUuid(papa)
      ? `/alpha?tab=timeline&programme=${programme}&papa=${papa}`
      : '/alpha?tab=timeline'
  }
  if (kind === 'password_reset_request') return '/officers?tab=resets'
  // Someone asked to reset this officer's password. If it was not them, the
  // first thing to do is change it.
  if (kind === 'password_reset_requested_for_you') return '/change-password'
  // An officer's location or battery alert (notify_location_offline) for Command.
  if (kind === 'location_offline') return '/tracking/live'
  if (kind === 'food_ready') return '/welfare'
  if (kind === 'program_addition_request') return '/approvals'
  if (kind === 'den_task_assigned' || kind === 'den_task_reminder') return '/den?tab=work'
  if (kind === 'den_shift_assigned') return '/den?tab=roster'
  if (kind === 'den_low_stock') return '/den?tab=inventory'
  if (kind === 'program_addition_decided') return n.metadata?.unit_slug === 'november_den' ? '/den' : '/my-operations'
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
  if (kind === 'location_offline') return { title: 'Officer location offline', body: "An officer's location stopped updating or their battery is nearly flat. Open Live Tracking to check on them." }
  if (kind === 'password_reset_requested_for_you') return { title: 'Password reset requested', body: 'Someone asked to reset your password. If it was not you, open TCNP, change your password and tell Command.' }
  if (kind === 'signup_approved') return { title: 'Account approved', body: 'Your TCNP account has been approved. Sign in and add your headshot to your profile.' }
  if (kind === 'do_assignment' || n.type === 'assignment') return { title: 'New duty assignment', body: 'You have been assigned as a Duty Officer. Open My Operations to see the journey and acknowledge it.' }
  if (kind === 'password_reset_request') return { title: 'Password reset awaiting approval', body: 'An officer has asked to reset their password. Review the request and approve or reject it.' }
  if (kind === 'birthday_0700' || n.type === 'birthday_reminder') return { title: 'Birthday today', body: 'An officer is celebrating today. Open Welfare to see who and send your wishes.' }
  if (kind === 'den_task_assigned' || kind === 'unit_task_assigned') return { title: 'New task for you', body: 'Your unit has given you a task. Open TCNP to see what it is and when it is due.' }
  if (kind === 'den_task_reminder' || kind === 'unit_task_reminder') return { title: 'Task due', body: 'One of your tasks is due soon or overdue. Open TCNP to finish it or update its status.' }
  if (kind === 'unit_task_status') return { title: 'Task update', body: 'A task you set has been marked done or blocked. Open TCNP to review it.' }
  if (kind === 'unit_programme_grant') return { title: 'Added to a programme team', body: 'Your unit head has added you to a programme team. Open TCNP to see the programme.' }
  if (kind === 'compliance_inspection') return { title: 'Compliance inspection', body: 'You have a new compliance inspection result. Open Compliance to read and acknowledge it.' }
  if (kind === 'compliance_recognition') return { title: 'You have been recognised', body: 'Compliance has recognised you. Open Compliance to see it.' }
  if (kind === 'tango_licence_expiring') return { title: 'Driver licence expiring', body: 'A driver licence is about to expire. Open Tango to review the driver list.' }
  if (kind === 'alpha_timeline_overdue') return { title: 'Arrival step overdue', body: 'An arrival timeline step is overdue. Open Alpha to check the timeline.' }
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

/**
 * How hard the push service should try to wake the device. "high" is delivered
 * immediately even when a phone is dozing, which is what makes a message app
 * buzz the moment something arrives; "normal" may be held back to save
 * battery. Operational notifications need an officer now. Greetings and
 * general notices can wait a few minutes.
 */
export function pushUrgency(n: Pick<AppNotification, 'type' | 'metadata'>): 'high' | 'normal' {
  const kind = n.metadata?.kind
  if (kind === 'birthday_0700' || n.type === 'birthday_reminder') return 'normal'
  if (kind === 'announcement' || n.type === 'announcement') return 'normal'
  if (kind === 'compliance_recognition' || kind === 'unit_programme_grant') return 'normal'
  if (n.type === 'info' && !kind && !n.metadata?.url) return 'normal'
  return 'high'
}
