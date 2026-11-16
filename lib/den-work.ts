/**
 * November (Den) — tasks, checklists and roster rules. Dependency-free so
 * tests/den-work.test.cjs can load it directly.
 */

export type DenTaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled'

export const DEN_TASK_STATUS_LABEL: Record<DenTaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
  cancelled: 'Cancelled',
}

/** What an assignee may set on their own task (public.den_set_my_task_status). */
export const DEN_MY_TASK_STATUSES: DenTaskStatus[] = ['todo', 'in_progress', 'blocked', 'done']

export type DenTask = {
  id: string
  project_id: string
  title: string
  description: string | null
  assigned_to: string | null
  due_at: string | null
  status: DenTaskStatus
  completed_at: string | null
  created_at: string
}

export function isTaskOpen(task: Pick<DenTask, 'status'>): boolean {
  return task.status !== 'done' && task.status !== 'cancelled'
}

export function isTaskOverdue(task: Pick<DenTask, 'status' | 'due_at'>, now: Date = new Date()): boolean {
  return isTaskOpen(task) && Boolean(task.due_at) && new Date(task.due_at as string).getTime() < now.getTime()
}

const STATUS_ORDER: Record<DenTaskStatus, number> = { blocked: 0, in_progress: 1, todo: 2, done: 3, cancelled: 4 }

/**
 * The order a task list is worked in: overdue first, then blocked, in
 * progress and to do — each by nearest deadline, undated last — then finished.
 */
export function compareDenTasks(a: DenTask, b: DenTask, now: Date = new Date()): number {
  const overdue = Number(isTaskOverdue(b, now)) - Number(isTaskOverdue(a, now))
  if (overdue !== 0) return overdue
  const status = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
  if (status !== 0) return status
  const dueA = a.due_at ? new Date(a.due_at).getTime() : Number.POSITIVE_INFINITY
  const dueB = b.due_at ? new Date(b.due_at).getTime() : Number.POSITIVE_INFINITY
  if (dueA !== dueB) return dueA - dueB
  return a.title.localeCompare(b.title)
}

/** One checklist item per non-empty line; duplicates and stray bullets removed. */
export function parseChecklistItems(text: string): string[] {
  const seen = new Set<string>()
  const items: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const label = line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()
    const key = label.toLowerCase()
    if (label && !seen.has(key)) {
      seen.add(key)
      items.push(label)
    }
  }
  return items
}

export function checklistProgress(items: readonly { done_at: string | null }[]): { done: number; total: number; complete: boolean } {
  const done = items.filter(item => item.done_at).length
  return { done, total: items.length, complete: items.length > 0 && done === items.length }
}

export type DenShift = {
  id: string
  program_id: string
  title: string
  starts_at: string
  ends_at: string
  nest_id: string | null
  officers_needed: number
  notes: string | null
}

/** How many more officers a shift needs. Zero means it is covered. */
export function shiftGap(shift: Pick<DenShift, 'officers_needed'>, assigned: number): number {
  return Math.max(0, shift.officers_needed - assigned)
}

/**
 * Officers who are on two shifts that overlap in time, with the pair of
 * shifts each is double-booked on. Shifts that merely touch (one ends as the
 * next starts) do not clash.
 */
export function findShiftClashes(
  shifts: readonly Pick<DenShift, 'id' | 'starts_at' | 'ends_at'>[],
  members: readonly { shift_id: string; user_id: string }[],
): { user_id: string; shift_ids: [string, string] }[] {
  const byId = new Map(shifts.map(shift => [shift.id, shift]))
  const byUser = new Map<string, string[]>()
  for (const member of members) {
    if (!byId.has(member.shift_id)) continue
    byUser.set(member.user_id, [...(byUser.get(member.user_id) ?? []), member.shift_id])
  }
  const clashes: { user_id: string; shift_ids: [string, string] }[] = []
  for (const [userId, shiftIds] of byUser) {
    for (let i = 0; i < shiftIds.length; i += 1) {
      for (let j = i + 1; j < shiftIds.length; j += 1) {
        const a = byId.get(shiftIds[i])!
        const b = byId.get(shiftIds[j])!
        if (new Date(a.starts_at) < new Date(b.ends_at) && new Date(b.starts_at) < new Date(a.ends_at)) {
          clashes.push({ user_id: userId, shift_ids: [a.id, b.id] })
        }
      }
    }
  }
  return clashes
}

/** `<input type="datetime-local">` value for an ISO timestamp, in the device's own time zone. */
export function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** The reverse: a datetime-local value back to ISO, or null when empty or invalid. */
export function fromLocalInputValue(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export const DEN_WORK_KEY = ['den', 'work'] as const
export const DEN_ROSTER_KEY = ['den', 'roster'] as const
export const DEN_MY_WORK_KEY = ['den', 'my-work'] as const

export type DenProgrammeTeamMember = {
  user_id: string
  full_name: string | null
  photo_url: string | null
  access_level: string
  on_programme: boolean
}
