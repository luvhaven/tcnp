/**
 * November (Den) — dashboard maths. Dependency-free apart from the readiness
 * rules, so tests/den-analytics.test.cjs can load it. The numbers come from
 * public.den_analytics().
 */
import type { DenProgrammeSummary } from '@/lib/den-plan'

export type DenAnalytics = {
  generated_at: string
  operational: {
    programmes_active: number
    programmes_completed: number
    open_tasks: number
    overdue_tasks: number
    tasks_done: number
    programmes: {
      id: string
      name: string
      start_date: string | null
      end_date: string | null
      plan_status: string
      summary: DenProgrammeSummary | null
    }[]
  }
  team: {
    members: number
    participating: number
    officers: {
      user_id: string
      full_name: string | null
      access_level: string
      tasks_assigned: number
      tasks_done: number
      tasks_overdue: number
      shifts: number
      programmes: number
    }[]
  }
  inventory: {
    items: number
    out_of_stock: number
    low_stock: number
    reorder: { id: string; name: string; unit: string; quantity: number; reorder_level: number }[]
    weekly_usage: { week_start: string; used: number }[]
    top_used: { name: string; unit: string; used: number }[]
  }
  reporting: {
    programmes_reported: number
    field_reports: number
    lessons_logged: number
    repository_items: number
    outstanding: { program_id: string; program_name: string; end_date: string | null; has_draft: boolean }[]
  }
}

/** A whole-number percentage, or null when there is nothing to take a share of. */
export function percent(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null
  return Math.round(Math.min(1, Math.max(0, part / whole)) * 100)
}

/** "75%" or a dash — a rate with nothing behind it is not 0%, it is unknown. */
export function percentLabel(part: number, whole: number): string {
  const value = percent(part, whole)
  return value == null ? '—' : `${value}%`
}

/** Officers who carry work, busiest first; those with nothing assigned are left out. */
export function teamWorkload(officers: DenAnalytics['team']['officers']) {
  return officers
    .filter(officer => officer.tasks_assigned > 0 || officer.shifts > 0)
    .map(officer => ({
      name: officer.full_name ?? 'Officer',
      done: Number(officer.tasks_done),
      open: Math.max(0, Number(officer.tasks_assigned) - Number(officer.tasks_done)),
      overdue: Number(officer.tasks_overdue),
      shifts: Number(officer.shifts),
    }))
    .sort((a, b) => (b.done + b.open) - (a.done + a.open) || b.shifts - a.shifts || a.name.localeCompare(b.name))
}

/** Weekly usage as chart points with a short label, oldest first. */
export function usageSeries(weekly: DenAnalytics['inventory']['weekly_usage']) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return [...weekly]
    .sort((a, b) => a.week_start.localeCompare(b.week_start))
    .map(point => {
      const [, month, day] = point.week_start.slice(0, 10).split('-').map(Number)
      return { label: `${day} ${months[(month || 1) - 1]}`, used: Math.round(Number(point.used) * 100) / 100 }
    })
}

/**
 * Whether usage is rising or falling: the last four weeks against the four
 * before. Null when there was no usage in either period.
 */
export function usageTrend(weekly: DenAnalytics['inventory']['weekly_usage']): { direction: 'up' | 'down' | 'flat'; change: number | null } | null {
  const points = usageSeries(weekly)
  if (points.length < 2) return null
  const half = Math.floor(points.length / 2)
  const earlier = points.slice(0, points.length - half).reduce((sum, point) => sum + point.used, 0)
  const recent = points.slice(points.length - half).reduce((sum, point) => sum + point.used, 0)
  if (earlier === 0 && recent === 0) return null
  if (earlier === 0) return { direction: 'up', change: null }
  const change = Math.round(((recent - earlier) / earlier) * 100)
  return { direction: change > 5 ? 'up' : change < -5 ? 'down' : 'flat', change }
}

export const DEN_ANALYTICS_KEY = ['den', 'analytics'] as const
