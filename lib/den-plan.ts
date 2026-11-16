/**
 * November (Den) — programme plan and readiness. Dependency-free so
 * tests/den-plan.test.cjs can load it directly. The numbers come from
 * public.den_programme_summary().
 */

export type DenPlanStatus = 'planning' | 'ready' | 'live' | 'completed' | 'archived'

export const DEN_PLAN_STATUS_LABEL: Record<DenPlanStatus, string> = {
  planning: 'Planning',
  ready: 'Ready',
  live: 'Live',
  completed: 'Completed',
  archived: 'Archived',
}

/** Statuses a coordinator can set; archiving is the Team Lead's alone. */
export function denPlanStatusOptions(canArchive: boolean, current?: DenPlanStatus | null): DenPlanStatus[] {
  const base: DenPlanStatus[] = ['planning', 'ready', 'live', 'completed']
  return canArchive || current === 'archived' ? [...base, 'archived'] : base
}

export type DenPlan = {
  id: string
  status: DenPlanStatus
  expected_guests: number | null
  service_notes: string | null
  updated_at: string
}

export type DenProgrammeSummary = {
  guests: number
  guests_profiled: number
  entourage: number
  team_on_programme: number
  floor_access: number
  pending_additions: number
  locations: number
  menus: number
  menus_with_vendor: number
  /** Stage 2 counts. Optional so a summary from before that migration still scores. */
  tasks?: number
  tasks_done?: number
  tasks_overdue?: number
  checklist_items?: number
  checklist_items_done?: number
  shifts?: number
  shifts_covered?: number
  plan: DenPlan | null
}

export type ReadinessCheck = {
  key: 'plan' | 'team' | 'floor' | 'location' | 'menus' | 'vendor' | 'guests' | 'tasks' | 'checklists' | 'roster'
  label: string
  /** 0..1 — how much of this check is met. */
  progress: number
  detail: string
  weight: number
  /** The Den tab where this is fixed. */
  tab: 'plan' | 'overview' | 'locations' | 'service' | 'guests' | 'work' | 'roster'
}

const ratio = (done: number, total: number) => (total > 0 ? Math.min(1, Math.max(0, done / total)) : 0)
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/**
 * The readiness checks for one programme, in the order the work is done.
 * Weights add up to 100.
 */
export function readinessChecks(summary: DenProgrammeSummary): ReadinessCheck[] {
  const guests = summary.guests
  const tasks = summary.tasks ?? 0
  const tasksDone = summary.tasks_done ?? 0
  const tasksOverdue = summary.tasks_overdue ?? 0
  const items = summary.checklist_items ?? 0
  const itemsDone = summary.checklist_items_done ?? 0
  const shifts = summary.shifts ?? 0
  const shiftsCovered = summary.shifts_covered ?? 0
  return [
    {
      key: 'plan', weight: 5, tab: 'plan',
      label: 'Den plan opened',
      progress: summary.plan ? 1 : 0,
      detail: summary.plan ? 'The plan for this programme is open' : 'No Den plan for this programme yet',
    },
    {
      key: 'team', weight: 15, tab: 'overview',
      label: 'Officers on the programme',
      progress: summary.team_on_programme > 0 ? 1 : 0,
      detail: summary.team_on_programme > 0
        ? `${plural(summary.team_on_programme, 'Den officer', 'Den officers')} added`
          + (summary.pending_additions > 0 ? `, ${summary.pending_additions} awaiting approval` : '')
        : summary.pending_additions > 0
          ? `${plural(summary.pending_additions, 'addition', 'additions')} awaiting approval`
          : 'No Den officer has been added to this programme',
    },
    {
      key: 'floor', weight: 5, tab: 'overview',
      label: 'Floor access given',
      progress: summary.floor_access > 0 ? 1 : 0,
      detail: summary.floor_access > 0
        ? `${plural(summary.floor_access, 'officer', 'officers')} can publish menus and take orders`
        : 'Nobody on the programme has floor access yet',
    },
    {
      key: 'location', weight: 10, tab: 'locations',
      label: 'Den location set',
      progress: summary.locations > 0 ? 1 : 0,
      detail: summary.locations > 0
        ? `${plural(summary.locations, 'Den location', 'Den locations')} linked to this programme`
        : 'No Den location is linked to this programme',
    },
    {
      key: 'menus', weight: 15, tab: 'service',
      label: 'Menus published',
      progress: summary.menus > 0 ? 1 : 0,
      detail: summary.menus > 0 ? `${plural(summary.menus, 'menu', 'menus')} published` : 'No menu published for this programme',
    },
    {
      key: 'vendor', weight: 10, tab: 'service',
      label: 'Vendors assigned',
      progress: ratio(summary.menus_with_vendor, summary.menus),
      detail: summary.menus === 0
        ? 'Publish a menu, then name its vendor'
        : `${summary.menus_with_vendor} of ${plural(summary.menus, 'menu', 'menus')} have a vendor`,
    },
    {
      key: 'guests', weight: 10, tab: 'guests',
      label: 'Guest preferences known',
      progress: ratio(summary.guests_profiled, guests),
      detail: guests === 0
        ? 'No guests are on this programme yet'
        : `${summary.guests_profiled} of ${plural(guests, 'guest', 'guests')} have dietary or preference details`,
    },
    {
      key: 'tasks', weight: 15, tab: 'work',
      label: 'Tasks completed',
      progress: ratio(tasksDone, tasks),
      detail: tasks === 0
        ? 'No tasks have been set for this programme'
        : `${tasksDone} of ${plural(tasks, 'task', 'tasks')} done` + (tasksOverdue > 0 ? `, ${tasksOverdue} overdue` : ''),
    },
    {
      key: 'checklists', weight: 10, tab: 'work',
      label: 'Checklists completed',
      progress: ratio(itemsDone, items),
      detail: items === 0
        ? 'No checklist is running for this programme'
        : `${itemsDone} of ${plural(items, 'checklist item', 'checklist items')} ticked`,
    },
    {
      key: 'roster', weight: 5, tab: 'roster',
      label: 'Roster covered',
      progress: ratio(shiftsCovered, shifts),
      detail: shifts === 0
        ? 'No shifts have been set for this programme'
        : `${shiftsCovered} of ${plural(shifts, 'shift', 'shifts')} fully covered`,
    },
  ]
}

/** 0–100, weighted. A check that is half met counts for half its weight. */
export function readinessScore(checks: readonly ReadinessCheck[]): number {
  const total = checks.reduce((sum, check) => sum + check.weight, 0)
  if (total === 0) return 0
  const earned = checks.reduce((sum, check) => sum + check.weight * Math.min(1, Math.max(0, check.progress)), 0)
  return Math.round((earned / total) * 100)
}

export function readinessTone(score: number): 'destructive' | 'warning' | 'success' {
  return score >= 80 ? 'success' : score >= 40 ? 'warning' : 'destructive'
}

export const DEN_GUEST_NOTE_CATEGORIES = ['preference', 'dietary', 'allergy', 'service', 'lesson'] as const

export type DenGuestNoteCategory = (typeof DEN_GUEST_NOTE_CATEGORIES)[number]

export const DEN_GUEST_NOTE_LABEL: Record<DenGuestNoteCategory, string> = {
  preference: 'Preference',
  dietary: 'Dietary',
  allergy: 'Allergy',
  service: 'Service',
  lesson: 'Lesson learned',
}

export type DenGuest = {
  id: string
  title: string | null
  full_name: string
  profile_photo_url: string | null
  organization: string | null
  position: string | null
  is_first_time: boolean
  past_invites_count: number
  entourage: number
  dietary_restrictions: string | null
  food_preferences: string | null
  water_temperature: string | null
  special_requirements: string | null
  arrival_date: string | null
  departure_date: string | null
  note_count: number
}

/** A guest counts as a first-timer only when nothing says otherwise. */
export function isReturningGuest(guest: Pick<DenGuest, 'is_first_time' | 'past_invites_count'>, visits = 0): boolean {
  return !guest.is_first_time || guest.past_invites_count > 0 || visits > 1
}

/** Whether the Den knows anything useful about how to host this guest. */
export function hasHospitalityProfile(guest: Pick<DenGuest, 'dietary_restrictions' | 'food_preferences' | 'note_count'>): boolean {
  return Boolean(guest.dietary_restrictions || guest.food_preferences || guest.note_count > 0)
}

export const DEN_PLAN_KEY = ['den', 'plan'] as const
export const DEN_GUESTS_KEY = ['den', 'guests'] as const
