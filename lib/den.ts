/**
 * November (Den) — shared, dependency-free rules.
 *
 * Kept free of imports so the node test runner can load it directly
 * (see tests/den.test.cjs) and so the SQL in
 * supabase/migrations/20261115120000_november_den_unit_foundation.sql has one
 * TypeScript mirror to stay in step with.
 */

export const DEN_UNIT_SLUG = 'november_den'

export const DEN_ROLES = ['noscar_den', 'head_noscar_den'] as const

export type DenAccessLevel = 'member' | 'sub_lead' | 'head'

export const DEN_ACCESS_LABEL: Record<DenAccessLevel, string> = {
  head: 'Team Lead',
  sub_lead: 'Sub-Team Lead',
  member: 'Team Member',
}

const DEN_ACCESS_ORDER: Record<DenAccessLevel, number> = { head: 0, sub_lead: 1, member: 2 }

/**
 * Mirrors public.legacy_matches_november_den(). Most Den officers keep the
 * signup default role and are identified by the Oscar they registered under,
 * so the role alone is not enough.
 */
export function isDenOfficer(role: string | null | undefined, oscar: string | null | undefined): boolean {
  const normalizedRole = (role ?? '').toLowerCase()
  if (normalizedRole.includes('noscar_den')) return true
  const normalizedOscar = (oscar ?? '').toLowerCase()
  return /\bden\b/.test(normalizedOscar)
    && (normalizedOscar.includes('november') || normalizedOscar.includes('noscar'))
}

/** Mirrors the Den clause of public.legacy_unit_access_level(). */
export function legacyDenAccessLevel(role: string | null | undefined, oscar: string | null | undefined): DenAccessLevel {
  if ((role ?? '').toLowerCase() === 'head_noscar_den') return 'head'
  const normalizedOscar = (oscar ?? '').toLowerCase()
  return normalizedOscar.includes('head') && isDenOfficer(null, oscar) ? 'head' : 'member'
}

export function normalizeDenAccessLevel(value: string | null | undefined): DenAccessLevel | null {
  return value === 'head' || value === 'sub_lead' || value === 'member' ? value : null
}

/** Leads first, then by name — the order a team list is read in. */
export function compareDenMembers(
  a: { level: DenAccessLevel; full_name: string | null },
  b: { level: DenAccessLevel; full_name: string | null },
): number {
  return DEN_ACCESS_ORDER[a.level] - DEN_ACCESS_ORDER[b.level]
    || (a.full_name ?? '').localeCompare(b.full_name ?? '')
}

export const DEN_TABS = ['overview', 'dashboard', 'plan', 'work', 'roster', 'guests', 'service', 'vendors', 'inventory', 'locations', 'repository', 'reports'] as const

export type DenTab = (typeof DEN_TABS)[number]

/** Any unknown or unavailable `?tab=` value lands on the overview. */
export function resolveDenTab(value: string | string[] | null | undefined, available: readonly DenTab[] = DEN_TABS): DenTab {
  const candidate = Array.isArray(value) ? value[0] : value
  return available.includes(candidate as DenTab) ? (candidate as DenTab) : 'overview'
}

/** React Query prefix for everything derived from den_floor_grants. */
export const DEN_FLOOR_GRANTS_KEY = ['den', 'floor-grants'] as const

/** One row of public.den_floor_candidates(). */
export type DenFloorCandidate = {
  user_id: string
  accepted_availability: boolean
  on_officers_list: boolean
  pending_approval: boolean
  granted: boolean
}

export type ProgrammeStanding = 'on_programme' | 'pending' | 'available' | 'not_available'

/**
 * Where a Den officer stands for one programme, and so what the head can do
 * next. Being available is an offer; only an officer who has been added is on
 * the programme (public.is_program_active_officer).
 */
export function describeProgrammeStanding(
  candidate: Pick<DenFloorCandidate, 'accepted_availability' | 'on_officers_list' | 'pending_approval'> | null | undefined,
): { state: ProgrammeStanding; label: string } {
  if (candidate?.on_officers_list) return { state: 'on_programme', label: 'On this programme' }
  if (candidate?.pending_approval) return { state: 'pending', label: 'Waiting for leadership to approve the addition' }
  if (candidate?.accepted_availability) return { state: 'available', label: 'Available for this programme' }
  return { state: 'not_available', label: 'Has not indicated availability' }
}

/**
 * Whether the page should offer floor actions. With no programme chosen, any
 * grant is enough to show them; the database still checks each programme.
 */
export function hasFloorAccessFor(grantedProgramIds: readonly string[], selectedProgram: string): boolean {
  return selectedProgram === 'all' ? grantedProgramIds.length > 0 : grantedProgramIds.includes(selectedProgram)
}
