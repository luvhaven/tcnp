/**
 * Pure helpers for Compliance inspections and recognitions. No React, no
 * Supabase: shared by the Compliance page components and the node tests.
 *
 * The score and outcome rules mirror compliance_inspection_prepare() in
 * supabase/migrations/20261116200000_compliance_inspections_recognitions.sql.
 * The database is the authority; this copy only drives the live preview.
 */

export type InspectionValue = 'pass' | 'fail' | 'na'
export type InspectionOutcome = 'compliant' | 'minor' | 'non_compliant'
export type InspectionChecklist = Partial<Record<InspectionItemKey, InspectionValue>>

/** SOP TCNP.01.02 Personal Grooming / Dress Code, as inspectable items. */
export const INSPECTION_ITEMS = [
  { key: 'haircut', label: 'Haircut / style', group: 'Grooming', hint: 'Decent haircut or style' },
  { key: 'manicure', label: 'Manicure & pedicure', group: 'Grooming', hint: 'Well manicured and pedicured' },
  { key: 'hygiene', label: 'Personal hygiene', group: 'Grooming', hint: 'Good personal hygiene' },
  { key: 'dress_code', label: 'Event dress code', group: 'Dress code', hint: 'As determined for this event' },
  { key: 'apparel_spec', label: 'Approved on-duty apparel', group: 'Dress code', hint: 'Same type and kind, by approved TCNP stylists' },
  { key: 'black_shoes', label: 'Black shoes', group: 'Dress code', hint: 'Comfortable black shoes' },
  { key: 'jewellery', label: 'No heavy jewellery', group: 'Dress code', hint: 'Heavy jewellery is unacceptable' },
  { key: 'makeup', label: 'Moderate make-up', group: 'Dress code', hint: 'Female POs; mark N/A otherwise' },
  { key: 'clean_apparel', label: 'Clean apparel', group: 'Dress code', hint: 'Apparel clean at all times' },
] as const

export type InspectionItemKey = (typeof INSPECTION_ITEMS)[number]['key']

export const INSPECTION_VALUES: readonly { value: InspectionValue; label: string }[] = [
  { value: 'pass', label: 'Pass' },
  { value: 'fail', label: 'Fail' },
  { value: 'na', label: 'N/A' },
]

/** A score at or above this (with at least one fail) is a minor finding. */
export const MINOR_THRESHOLD = 75

export const OUTCOME_META: Record<InspectionOutcome, { label: string; tone: string }> = {
  compliant: { label: 'Compliant', tone: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  minor: { label: 'Minor issues', tone: 'border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-200' },
  non_compliant: { label: 'Action needed', tone: 'border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300' },
}

const ITEM_KEYS = new Set<string>(INSPECTION_ITEMS.map((item) => item.key))
const VALUES = new Set<string>(['pass', 'fail', 'na'])

export function isInspectionValue(value: unknown): value is InspectionValue {
  return typeof value === 'string' && VALUES.has(value)
}

export function isInspectionOutcome(value: unknown): value is InspectionOutcome {
  return value === 'compliant' || value === 'minor' || value === 'non_compliant'
}

/** Keeps only known items with valid values (rows from the database or a draft). */
export function normalizeChecklist(raw: unknown): InspectionChecklist {
  const result: InspectionChecklist = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (ITEM_KEYS.has(key) && isInspectionValue(value)) result[key as InspectionItemKey] = value
  }
  return result
}

export type InspectionScore = {
  passes: number
  fails: number
  nas: number
  rated: number
  total: number
  /** Every item has a value. The dialog saves only a complete checklist. */
  complete: boolean
  /** null until at least one item is pass or fail. */
  score: number | null
  outcome: InspectionOutcome | null
}

export function scoreInspection(checklist: InspectionChecklist | null | undefined): InspectionScore {
  const clean = normalizeChecklist(checklist)
  let passes = 0
  let fails = 0
  let nas = 0
  for (const item of INSPECTION_ITEMS) {
    const value = clean[item.key]
    if (value === 'pass') passes += 1
    else if (value === 'fail') fails += 1
    else if (value === 'na') nas += 1
  }
  const rated = passes + fails + nas
  const judged = passes + fails
  // Same rounding as SQL round(x, 2).
  const score = judged === 0 ? null : Math.round((passes * 10000) / judged) / 100
  const outcome: InspectionOutcome | null =
    score === null ? null : fails === 0 ? 'compliant' : score >= MINOR_THRESHOLD ? 'minor' : 'non_compliant'
  return { passes, fails, nas, rated, total: INSPECTION_ITEMS.length, complete: rated === INSPECTION_ITEMS.length, score, outcome }
}

/** Why the checklist cannot be saved yet, or null when it can. */
export function checklistProblem(checklist: InspectionChecklist): string | null {
  const result = scoreInspection(checklist)
  if (!result.complete) {
    const left = result.total - result.rated
    return `Rate ${left} more item${left === 1 ? '' : 's'}`
  }
  if (result.score === null) return 'Mark at least one item as pass or fail'
  return null
}

export function allPassChecklist(): InspectionChecklist {
  const result: InspectionChecklist = {}
  for (const item of INSPECTION_ITEMS) result[item.key] = 'pass'
  return result
}

export function failedItemLabels(checklist: unknown): string[] {
  const clean = normalizeChecklist(checklist)
  return INSPECTION_ITEMS.filter((item) => clean[item.key] === 'fail').map((item) => item.label)
}

export function formatScore(score: number | string | null | undefined): string {
  if (score === null || score === undefined || score === '') return '—'
  const value = typeof score === 'string' ? Number(score) : score
  if (!Number.isFinite(value)) return '—'
  return `${Math.round(value)}%`
}

/** Today's calendar date in Lagos (the SQL default for inspected_on / awarded_on). */
export function lagosToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

// ───────────────────────── Page tabs ─────────────────────────

export const COMPLIANCE_TABS = ['outfits', 'grooming', 'inspections', 'recognition'] as const
export type ComplianceTab = (typeof COMPLIANCE_TABS)[number]

export function resolveComplianceTab(value: string | null | undefined): ComplianceTab {
  return (COMPLIANCE_TABS as readonly string[]).includes(value ?? '') ? (value as ComplianceTab) : 'outfits'
}

// ───────────────────────── Lists ─────────────────────────

export type InspectionRow = {
  id: string
  officer_id: string
  program_id: string | null
  inspected_on: string
  inspector_id: string | null
  checklist: unknown
  score: number | string
  outcome: InspectionOutcome
  notes: string | null
  follow_up_due: string | null
  acknowledged_at: string | null
  officer_comment: string | null
  created_at: string
  officer?: { full_name: string | null } | null
  inspector?: { full_name: string | null } | null
  programs?: { name: string } | null
}

export type InspectionFilters = {
  programId: string // 'all' | 'none' | uuid
  outcome: string // 'all' | 'open' (not compliant) | 'unacknowledged' | outcome
  search: string
}

export const DEFAULT_INSPECTION_FILTERS: InspectionFilters = { programId: 'all', outcome: 'all', search: '' }

export function filterInspections<T extends InspectionRow>(rows: readonly T[], filters: InspectionFilters): T[] {
  const needle = filters.search.trim().toLowerCase()
  return rows.filter((row) => {
    if (filters.programId === 'none' && row.program_id) return false
    if (filters.programId !== 'all' && filters.programId !== 'none' && row.program_id !== filters.programId) return false
    if (filters.outcome === 'open' && row.outcome === 'compliant') return false
    if (filters.outcome === 'unacknowledged' && (row.outcome === 'compliant' || row.acknowledged_at)) return false
    if (isInspectionOutcome(filters.outcome) && row.outcome !== filters.outcome) return false
    if (needle && !(row.officer?.full_name ?? '').toLowerCase().includes(needle)) return false
    return true
  })
}

export function summarizeInspections(rows: readonly Pick<InspectionRow, 'score' | 'outcome' | 'acknowledged_at'>[]) {
  const scores = rows.map((row) => Number(row.score)).filter((value) => Number.isFinite(value))
  const average = scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null
  return {
    total: rows.length,
    average,
    compliant: rows.filter((row) => row.outcome === 'compliant').length,
    awaitingAck: rows.filter((row) => row.outcome !== 'compliant' && !row.acknowledged_at).length,
  }
}

/** Active officers on the programme first, then everyone else, each by name. */
export function orderOfficersForProgramme<T extends { id: string; full_name: string | null }>(
  officers: readonly T[],
  onProgramme: ReadonlySet<string>,
): T[] {
  return [...officers].sort((a, b) => {
    const rank = Number(onProgramme.has(b.id)) - Number(onProgramme.has(a.id))
    if (rank !== 0) return rank
    return (a.full_name ?? '').localeCompare(b.full_name ?? '')
  })
}

// ───────────────────────── Recognitions ─────────────────────────

export const AWARD_TYPES = [
  { value: 'best_dressed', label: 'Best dressed' },
  { value: 'most_improved', label: 'Most improved' },
  { value: 'excellence', label: 'Excellence' },
  { value: 'commendation', label: 'Commendation' },
  { value: 'other', label: 'Other' },
] as const

export type AwardType = (typeof AWARD_TYPES)[number]['value']

export function awardTypeLabel(value: string | null | undefined): string {
  return AWARD_TYPES.find((type) => type.value === value)?.label ?? 'Recognition'
}

export const RECOGNITION_TITLE_RULE = 'Use 2 to 120 characters for the title, or leave it blank to use the award name.'

/** Mirrors compliance_recognitions_title_length; a blank title falls back to the award name. */
export function recognitionTitleProblem(title: string): string | null {
  const trimmed = title.trim()
  if (trimmed.length === 0) return null
  return trimmed.length < 2 || trimmed.length > 120 ? RECOGNITION_TITLE_RULE : null
}

export const AWARD_CATEGORY_STATUSES =['draft', 'open', 'judging', 'announced', 'closed'] as const
export const NOMINEE_STATUSES = ['nominated', 'shortlisted', 'winner', 'withdrawn'] as const

// ───────────────────────── Errors ─────────────────────────

/**
 * The sentence to show for a failed inspection or recognition write. Messages
 * raised by our own triggers (22023, and the self-inspection 42501) are
 * written for officers; anything else falls back to the caller's text.
 */
/** Officer-facing reasons for the check constraints on the compliance tables (23514). */
const CHECK_MESSAGES: readonly [constraint: string, text: string][] = [
  ['compliance_recognitions_title_length', RECOGNITION_TITLE_RULE],
  ['compliance_recognitions_citation_length', 'Keep the citation to 1000 characters.'],
  ['compliance_recognitions_award_type', 'Choose one of the listed awards.'],
  ['compliance_inspections_notes_length', 'Keep the notes to 2000 characters.'],
  ['compliance_inspections_comment_length', 'Keep the comment to 500 characters.'],
  ['compliance_inspections_follow_up_order', 'The re-check date cannot be before the inspection date.'],
]

export function complianceWriteMessage(error: unknown, fallback: string): string {
  const code = (error as { code?: string } | null)?.code
  const message = (error as { message?: string } | null)?.message ?? ''
  if (code === '23505' && message.includes('compliance_recognitions_one_per_nominee')) return 'This winner is already on the recognition wall.'
  if (code === '23505') return 'This officer already has an inspection for this programme on that date. Edit that one instead.'
  if (code === '23514') {
    return CHECK_MESSAGES.find(([constraint]) => message.includes(constraint))?.[1] ?? 'One of the values is not allowed. Check the form and try again.'
  }
  if (code === '22023' && message) return message
  if (code === '42501' && /^You cannot /.test(message)) return message
  if (code === '42501' || /row-level security/i.test(message)) return 'You do not have permission to do that.'
  return fallback
}

/** Missing table or function (migration not applied yet), not a network or permission failure. */
export function isNotProvisioned(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === 'PGRST205' || code === 'PGRST200' || code === 'PGRST202' || code === '42883'
}
