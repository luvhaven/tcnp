/**
 * Programme additions — rules shared by the API route, the Den page and the
 * approvals page. Dependency-free so tests/program-additions.test.cjs can load
 * it directly. The SQL mirror is
 * supabase/migrations/20261115150000_programme_addition_requests.sql.
 */

/** Units whose head may add their own officers to a programme through this flow. */
export const ADDITION_UNITS = {
  november_den: { label: 'November (Den)', memberTitle: 'NOVEMBER_DEN', headTitle: 'NOVEMBER_DEN_LEAD', page: '/den' },
} as const

export type AdditionUnit = keyof typeof ADDITION_UNITS

export function isAdditionUnit(value: unknown): value is AdditionUnit {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ADDITION_UNITS, value)
}

/** Display name for a stored unit slug, tolerating slugs this build does not know. */
export function additionUnitLabel(value: unknown, fallback = 'the unit'): string {
  return isAdditionUnit(value) ? ADDITION_UNITS[value].label : typeof value === 'string' && value ? value : fallback
}

const PLATFORM_ADMIN_ROLES = ['super_admin', 'dev_admin', 'admin', 'captain', 'vice_captain']

/**
 * Executives, admins and the Head of Command. Mirrors
 * public.can_approve_program_additions().
 */
export function canApproveProgramAdditions(role: string | null | undefined, hasAdminAccess?: boolean | null): boolean {
  return hasAdminAccess === true || PLATFORM_ADMIN_ROLES.includes(role ?? '') || role === 'head_of_command'
}

export type AdditionOutcome = 'added' | 'pending'

/**
 * What happens when someone adds an officer to a programme:
 *   - an approver's own addition always takes effect;
 *   - a unit head's addition takes effect only if the officer accepted the
 *     programme's availability request, otherwise it waits for approval.
 */
export function additionOutcome(input: { callerCanApprove: boolean; officerAcceptedAvailability: boolean }): AdditionOutcome {
  return input.callerCanApprove || input.officerAcceptedAvailability ? 'added' : 'pending'
}

/** A programme can take additions only while it is being planned or running. */
export function programAcceptsAdditions(status: string | null | undefined): boolean {
  return status === 'planning' || status === 'active'
}

export type PendingAddition = {
  id: string
  unit_slug: string
  unit_label: string
  reason: string | null
  created_at: string
  program: { id: string; name: string }
  officer: { id: string; full_name: string | null; photo_url: string | null; oscar: string | null }
  requested_by_name: string | null
}

export const PROGRAM_ADDITIONS_KEY = ['program-additions'] as const
