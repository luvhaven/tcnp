import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Maps the `users.oscar` short string (e.g. "TO", "EO") to a canonical role key.
 * The `oscar` column is the permanent unit membership of a protocol officer.
 * It is authoritative for feature access even when `role` is temporarily set to
 * `delta_oscar` due to a DO assignment.
 */
const UNIT_OSCAR_ROLE_KEYS: ReadonlySet<string> = new Set([
  'alpha_oscar', 'head_alpha_oscar',
  'tango_oscar', 'head_tango_oscar',
  'victor_oscar', 'head_victor_oscar',
  'echo_oscar', 'head_echo_oscar',
  'november_oscar', 'noscar_den', 'head_noscar_den', 'noscar_nest', 'head_noscar_nest',
  'serial_oscar', 'head_serial_oscar',
  'compliance_oscar', 'head_compliance_oscar',
  'welfare_oscar', 'head_welfare_oscar',
  'training_oscar', 'head_training_oscar',
  'delta_oscar',
])

/** Unit values a new officer may pick at signup (mirrors the signup form). */
export const SIGNUP_OSCAR_OPTIONS = [
  'Command',
  'Alpha Oscar',
  'Compliance Oscar',
  'November (Den)',
  'November (Nest)',
  'Serial Oscar',
  'Tango Oscar',
  'Training Oscar',
  'Victor Oscar',
  'Welfare Oscar',
] as const

/**
 * Use for labels and signup mapping only.
 * @deprecated as a permission source: unit access comes from unit_memberships
 *   (`useUnitAccess(slug)` / `unitAccess()` in lib/unit-access.ts).
 */
export function oscarToRole(oscar: string | null | undefined): string | null {
  if (!oscar) return null
  const norm = oscar.trim().toLowerCase()

  // Head variants first (so "Head Serial Oscar" doesn't match the base unit)
  if (norm.includes('head_tango') || norm.includes('head tango')) return 'head_tango_oscar'
  if (norm.includes('head_echo') || norm.includes('head echo')) return 'head_echo_oscar'
  if (norm.includes('head_victor') || norm.includes('head victor')) return 'head_victor_oscar'
  if (norm.includes('head_november') || norm.includes('head november') || norm.includes('head_noscar') || norm.includes('head noscar')) {
    if (norm.includes('den') || norm.includes('theatre') || norm.includes('theater')) return 'head_noscar_den'
    if (norm.includes('nest')) return 'head_noscar_nest'
    return 'november_oscar' // legacy umbrella head, sub-unit not specified
  }
  if (norm.includes('head_alpha') || norm.includes('head alpha')) return 'head_alpha_oscar'
  if (norm.includes('head_sierra') || norm.includes('head sierra') || norm.includes('head_serial') || norm.includes('head serial')) return 'head_serial_oscar'
  if (norm.includes('head_compliance') || norm.includes('head compliance')) return 'head_compliance_oscar'
  if (norm.includes('head_welfare') || norm.includes('head welfare')) return 'head_welfare_oscar'
  if (norm.includes('head_training') || norm.includes('head training')) return 'head_training_oscar'
  if (norm.includes('head_hospitality') || norm.includes('head hospitality')) return 'head_noscar_nest'

  // Tango Oscar — Transport
  if (['to', 'tango', 'tango_oscar', 'tango oscar'].includes(norm)) return 'tango_oscar'
  // Echo Oscar — Equipment / AV (legacy — no longer a standalone unit, kept for old data)
  if (['eo', 'echo', 'echo_oscar', 'echo oscar'].includes(norm)) return 'echo_oscar'
  // Victor Oscar — Venue / Theatre
  if (['vo', 'victor', 'victor_oscar', 'victor oscar'].includes(norm)) return 'victor_oscar'
  // November — split into Den (private lounge / menus) and Nest (accommodation / guest experience).
  // Theatre spellings are retained only as aliases for older stored profile values.
  if (norm.includes('november') && (norm.includes('den') || norm.includes('theatre') || norm.includes('theater'))) return 'noscar_den'
  if (norm.includes('november') && norm.includes('nest')) return 'noscar_nest'
  if (['no', 'november', 'november_oscar', 'november oscar'].includes(norm)) return 'november_oscar'
  // Alpha Oscar — Eagle Squares / Airports
  if (['ao', 'alpha', 'alpha_oscar', 'alpha oscar'].includes(norm)) return 'alpha_oscar'
  // Serial Oscar — Social Media (also matches legacy 'Sierra' values)
  if (['so', 'sierra', 'sierra_oscar', 'sierra oscar', 'serial', 'serial_oscar', 'serial oscar'].includes(norm)) return 'serial_oscar'
  // Compliance Oscar — Grooming / Dress code
  if (['co', 'compliance', 'compliance_oscar', 'compliance oscar'].includes(norm)) return 'compliance_oscar'
  // Welfare Oscar — Meals / Officer welfare
  if (['wo', 'welfare', 'welfare_oscar', 'welfare oscar'].includes(norm)) return 'welfare_oscar'
  // Training Oscar — Training schedules / SOP
  if (['training', 'training_oscar', 'training oscar'].includes(norm)) return 'training_oscar'
  // Legacy Hospitality profile values resolve to November (Nest); Hospitality is not a standalone Oscar.
  if (['ho', 'hospitality', 'hospitality_oscar', 'hospitality oscar'].includes(norm)) return 'noscar_nest'
  // Command — HQ/leadership staff (not a phonetic Oscar, but selectable at signup/profile)
  if (['command', 'command centre', 'command center'].includes(norm)) return 'command'

  // Fallback: a stored unit role key passes through. Platform and leadership
  // roles (admins, captain, command staff) never come from the oscar column.
  if (UNIT_OSCAR_ROLE_KEYS.has(norm)) return norm

  return null
}

/**
 * Resolves the effective base Oscar role, considering both the permanent `oscar`
 * column and the `role` column. When a user is assigned as DO (`role=delta_oscar`),
 * this returns their base Oscar role so that original permissions are preserved.
 * @deprecated as a permission source (a viewer stays 'viewer' here, so unit members are
 *   refused). Keep it for Delta display only; use `useUnitAccess(slug)` for unit permissions.
 */
export function effectiveOscarRole(role: string | null | undefined, oscar: string | null | undefined): string | null {
  const fromOscar = oscarToRole(oscar)
  // If their role is already a specific Oscar (not delta_oscar), use the role
  if (role && role !== 'delta_oscar') return role
  // If they are a DO, fall back to the permanent oscar column
  return fromOscar ?? role ?? null
}

/**
 * Check if a user role is an admin / leadership role (Super Admin, Dev Admin, Admin, Captain, Vice Captain, Command, HOC, HOP)
 * Note: this counts the client-only hod / hop ranks; SQL is_admin() does not. For a check
 *   that matches the database exactly use `isCommandAuthority()` from lib/unit-access.ts.
 */
export function isAdmin(role: string | null | undefined, hasAdminAccess?: boolean | null): boolean {
  return platformAuthorityRank(role, hasAdminAccess) >= 60
}

/** Normalize legacy profile display values to the current unit names. */
export function normalizeOscarLabel(oscar: string | null | undefined): string | null {
  if (!oscar?.trim()) return null
  const value = oscar.trim()
  const norm = value.toLowerCase()
  const isHead = norm.includes('head')

  if (norm.includes('hospitality') || ['ho', 'hospitality_oscar'].includes(norm)) {
    return isHead ? 'Head, November (Nest)' : 'November (Nest)'
  }
  if ((norm.includes('november') || norm.includes('noscar')) && (norm.includes('theatre') || norm.includes('theater'))) {
    return isHead ? 'Head, November (Den)' : 'November (Den)'
  }
  if (norm.includes('november') || norm.includes('noscar')) {
    if (norm.includes('den')) return isHead ? 'Head, November (Den)' : 'November (Den)'
    if (norm.includes('nest')) return isHead ? 'Head, November (Nest)' : 'November (Nest)'
  }
  return value
}

/** Roles with cross-workspace access even without an additional grant. */
export const PLATFORM_ADMIN_ROLES = [
  'super_admin', 'dev_admin', 'admin', 'captain', 'vice_captain',
] as const

export const PLATFORM_ACCESS_FILTER = `role.in.(${PLATFORM_ADMIN_ROLES.join(',')}),has_admin_access.eq.true`

export function hasAdminPrivilege(role: string | null | undefined, hasAdminAccess?: boolean | null): boolean {
  return hasAdminAccess === true || role === 'admin' || role === 'dev_admin' || role === 'super_admin'
}

/** Executive and Admin share operational access. Owner authority remains separate. */
export function platformAuthorityRank(role: string | null | undefined, hasAdminAccess?: boolean | null): number {
  if (role === 'super_admin') return 100
  if (hasAdminPrivilege(role, hasAdminAccess) || isExecutiveRole(role)) return 80
  switch (role) {
    case 'head_of_command':
    case 'head_of_operations':
    case 'command':
    case 'hod':
    case 'hop':
      return 60
    default:
      return 0
  }
}

export function isSuperAdmin(role: string | null | undefined): boolean {
  return role === 'super_admin'
}

export function isPlatformAdministrator(role: string | null | undefined, hasAdminAccess?: boolean | null): boolean {
  return platformAuthorityRank(role, hasAdminAccess) >= 80
}

/** Display identity is separate from Admin authority. */
export function isExecutiveRole(role: string | null | undefined): boolean {
  return role === 'captain' || role === 'vice_captain'
}

export function privilegedAccessLabel(role: string | null | undefined, hasAdminAccess?: boolean | null): string {
  return isExecutiveRole(role) ? 'Executive access' : hasAdminPrivilege(role, hasAdminAccess) ? 'Admin' : ''
}

/**
 * @deprecated Unit permission from role/Oscar text. Use `useUnitAccess(slug)` (hooks/useUnitAccess.ts)
 *   or `unitAccess()` (lib/unit-access.ts): membership is the only source of unit access.
 */
export function isUnitHeadRole(
  unit: 'alpha' | 'command' | 'compliance' | 'november_nest' | 'november_den' | 'tango' | 'training' | 'victor' | 'welfare',
  role: string | null | undefined,
  oscar?: string | null,
): boolean {
  const resolved = effectiveOscarRole(role, oscar) ?? ''
  const normalizedOscar = (oscar ?? '').toLowerCase()
  const expected: Record<typeof unit, string[]> = {
    alpha: ['head_alpha_oscar'],
    command: ['head_of_command'],
    compliance: ['head_compliance_oscar'],
    november_nest: ['head_noscar_nest'],
    november_den: ['head_noscar_den'],
    tango: ['head_tango_oscar'],
    training: ['head_training_oscar'],
    victor: ['head_victor_oscar'],
    welfare: ['head_welfare_oscar'],
  }
  return expected[unit].includes(resolved)
    || normalizedOscar.includes(`head ${unit.replace('_', ' ')}`)
    || normalizedOscar.includes(`head_${unit}`)
}

/**
 * Which unit heads may approve a self-registration, keyed by the member role
 * the applicant's chosen Oscar resolves to. Legacy umbrella "November Oscar"
 * signups can be approved by either November sub-unit head.
 */
const SIGNUP_APPROVER_HEADS: Record<string, string[]> = {
  alpha_oscar: ['head_alpha_oscar'],
  tango_oscar: ['head_tango_oscar'],
  victor_oscar: ['head_victor_oscar'],
  noscar_den: ['head_noscar_den'],
  noscar_nest: ['head_noscar_nest'],
  november_oscar: ['head_noscar_den', 'head_noscar_nest'],
  serial_oscar: ['head_serial_oscar'],
  compliance_oscar: ['head_compliance_oscar'],
  welfare_oscar: ['head_welfare_oscar'],
  training_oscar: ['head_training_oscar'],
  command: ['head_of_command'],
}

const SIGNUP_APPROVER_HEAD_ROLES = new Set(Object.values(SIGNUP_APPROVER_HEADS).flat())

/**
 * Unit-head roles a caller holds, from their ROLE only. The Oscar is a display
 * label and never makes a head (the same rule as SQL legacy_unit_access_level):
 * a head demoted to viewer or Delta Oscar keeps their unit Oscar but cannot
 * approve signups through it.
 */
function heldUnitHeadRoles(role: string | null | undefined): string[] {
  return role && SIGNUP_APPROVER_HEAD_ROLES.has(role) ? [role] : []
}

/**
 * One active unit membership (the shape lib/unit-access.ts reads). Declared
 * structurally so this file keeps no imports.
 */
export type SignupApproverMembership = { slug: string; access_level: string; status?: string | null }

/** Units the caller heads, from active membership rows only. */
export function headedUnitSlugs(memberships: readonly SignupApproverMembership[] | null | undefined): string[] {
  return Array.from(new Set((memberships ?? [])
    .filter(row => row.access_level === 'head' && (row.status == null || row.status === 'active'))
    .map(row => row.slug)
    .filter(Boolean)))
}

/**
 * True when the caller can approve or decline at least some pending signups:
 * a platform admin, or the head of any unit.
 *
 * Pass `memberships` (the caller's active unit memberships, from
 * fetchActiveUnitMemberships / useMyUnitMemberships) whenever you have them:
 * headship then comes from an active head membership row, the same rule as SQL
 * can_decide_signup(), so a curated head row counts and a head role whose row
 * was removed does not. Without them it falls back to the head ROLE (the legacy
 * sync trigger gives every head role a head row, so the two agree live). The
 * `oscar` argument is ignored: Oscar text never makes a head.
 */
export function canApproveSignups(
  role: string | null | undefined,
  _oscar?: string | null,
  hasAdminAccess?: boolean | null,
  memberships?: readonly SignupApproverMembership[] | null,
): boolean {
  if (isPlatformAdministrator(role, hasAdminAccess)) return true
  if (memberships) return headedUnitSlugs(memberships).length > 0
  return heldUnitHeadRoles(role).length > 0
}

/**
 * Client/server mirror of SQL can_decide_signup(): a platform admin decides
 * every signup; otherwise the caller must head one of the applicant's units.
 * `applicantUnitSlugs` are the units the applicant's own role and Oscar name
 * (the legacy-synced rows, 'inactive' while the signup is pending; curated
 * rows a head added never count, and a Command applicant is ['command'] only).
 * An applicant with no unit can only be decided by an admin. The database
 * re-checks on every decision.
 */
export function canDecideSignup(
  caller: { role?: string | null; hasAdminAccess?: boolean | null; memberships?: readonly SignupApproverMembership[] | null },
  applicantUnitSlugs: readonly string[] | null | undefined,
): boolean {
  if (isPlatformAdministrator(caller.role, caller.hasAdminAccess)) return true
  const headed = new Set(headedUnitSlugs(caller.memberships))
  return (applicantUnitSlugs ?? []).some(slug => headed.has(slug))
}

/** Shown at login and signup to a person whose signup was declined. */
export const SIGNUP_DECLINED_MESSAGE = 'Your sign-up was not approved. Contact your unit head.'

/** How far back the Approvals page lists declined signups. */
export const SIGNUP_DECLINED_WINDOW_DAYS = 30

export const SIGNUP_DECLINE_REASON_MIN = 3
export const SIGNUP_DECLINE_REASON_MAX = 500

export type SignupDecision = 'approve' | 'decline' | 'reopen'

/**
 * Validates a decision request body for /api/officers/signup-approvals.
 * A body without `decision` is an approval (older clients send only officerId).
 */
export function parseSignupDecision(body: unknown):
  | { officerId: string; decision: SignupDecision; reason: string | null }
  | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Invalid request' }
  const { officerId, decision = 'approve', reason } = body as { officerId?: unknown; decision?: unknown; reason?: unknown }
  if (typeof officerId !== 'string' || !officerId.trim()) return { error: 'officerId is required' }
  if (decision !== 'approve' && decision !== 'decline' && decision !== 'reopen') return { error: 'decision must be approve, decline or reopen' }
  if (reason != null && typeof reason !== 'string') return { error: 'reason must be text' }
  const cleanReason = typeof reason === 'string' ? reason.trim() : ''
  if (decision === 'decline' && cleanReason.length < SIGNUP_DECLINE_REASON_MIN) {
    return { error: `Give a reason (at least ${SIGNUP_DECLINE_REASON_MIN} characters) to decline a signup` }
  }
  if (cleanReason.length > SIGNUP_DECLINE_REASON_MAX) return { error: `Keep the reason under ${SIGNUP_DECLINE_REASON_MAX} characters` }
  if (cleanReason && cleanReason.length < SIGNUP_DECLINE_REASON_MIN) return { error: `Give a reason of at least ${SIGNUP_DECLINE_REASON_MIN} characters, or leave it empty` }
  return { officerId: officerId.trim(), decision, reason: cleanReason || null }
}

/**
 * HTTP status for an error from the decide_signup() RPC. Its messages for these
 * codes are written for the approver and can be shown as they are; anything
 * else gets a generic message.
 */
export function signupDecisionErrorStatus(code: string | null | undefined): { status: number; userFacing: boolean } {
  switch (code) {
    case '42501': return { status: 403, userFacing: true }
    case 'P0002': return { status: 404, userFacing: true }
    case '55000': return { status: 409, userFacing: true }
    case '22023': return { status: 400, userFacing: true }
    // The function does not exist yet: the migration has not been applied.
    case '42883':
    case 'PGRST202': return { status: 503, userFacing: false }
    default: return { status: 500, userFacing: false }
  }
}

/**
 * Admins approve any signup. A unit head (by head role) approves only signups whose
 * chosen Oscar belongs to their own unit. `callerOscar` is ignored; see canApproveSignups.
 * @deprecated Role-based. Use canDecideSignup() with the caller's memberships and the
 *   applicant's unit membership rows (the API does).
 */
export function canApproveSignupFor(
  callerRole: string | null | undefined,
  _callerOscar: string | null | undefined,
  applicantOscar: string | null | undefined,
  hasAdminAccess?: boolean | null,
): boolean {
  if (isPlatformAdministrator(callerRole, hasAdminAccess)) return true
  const applicantUnit = oscarToRole(applicantOscar)
  if (!applicantUnit) return false
  const allowedHeads = SIGNUP_APPROVER_HEADS[applicantUnit] ?? []
  return heldUnitHeadRoles(callerRole).some(r => allowedHeads.includes(r))
}

/**
 * Check if a user can view an officer's full profile (personal info, titles and duty history).
 * Admins, Captain, Vice Captain, Command leadership, and Head of Welfare have full access.
 */
export function canViewOfficerFullProfile(role: string | null | undefined, oscar?: string | null | undefined, hasAdminAccess?: boolean | null): boolean {
  if (!role) return false
  if (isAdmin(role, hasAdminAccess)) return true
  const effective = effectiveOscarRole(role, oscar)
  if (effective && isAdmin(effective)) return true
  return ['head_welfare_oscar'].includes(effective ?? '')
}

/**
 * Check if a user can view Live Tracking / Command maps.
 * Exclusively for admins, active command, Captain, Vice Captain, and Head of Operations.
 * The role decides; the `_oscar` argument is ignored (users.oscar is a display
 * label and never grants a permission). It stays in the signature so existing
 * callers keep compiling; pass `null`.
 */
export function canViewLiveTracking(role: string | null | undefined, _oscar?: string | null | undefined, hasAdminAccess?: boolean | null): boolean {
  if (!role) return false
  return isAdmin(role, hasAdminAccess)
}

/**
 * Check if a user can access Command Centre.
 * Exclusively for Admin and Command roles. The role decides; the `_oscar`
 * argument is ignored (an Oscar reading "Command" grants nothing). It stays in
 * the signature so existing callers keep compiling; pass `null`.
 */
export function canAccessCommandCentre(role: string | null | undefined, _oscar?: string | null | undefined, hasAdminAccess?: boolean | null): boolean {
  if (isPlatformAdministrator(role, hasAdminAccess)) return true
  if (!role) return false
  return ['super_admin', 'dev_admin', 'admin', 'command', 'head_of_command'].includes(role)
}


/**
 * Check if a user can manage a journey.
 * Admins and HOC/HOP can manage all journeys.
 * DOs (or anyone assigned to a journey) can manage their assigned journeys.
 */
export function canManageJourney(role: string | null | undefined, isAssignedDO: boolean = false): boolean {
  if (!role) return false
  if (isAdmin(role)) return true
  // Any officer who was assigned as DO for this journey can manage it
  if (isAssignedDO) return true
  return false
}

/**
 * Check if a user can manage Papas (guest ministers).
 * Command Centre owns the Papa roster (create/edit/delete) — other units
 * only need read access to the Papas they work with at their own stage
 * (enforced via RLS: Alpha sees flight-linked Papas, Tango sees Papas with
 * an assigned cheetah, November sees Papas with a nest, Victor sees Papas
 * with a theatre, Delta sees Papas assigned to them).
 */
export function canManagePapas(role: string | null | undefined, hasAdminAccess?: boolean | null): boolean {
  return isAdmin(role, hasAdminAccess)
}

/**
 * Check if a user can manage Cheetahs (vehicles).
 * Tango Oscars own this page regardless of whether they are assigned as DO.
 * @deprecated Unit permission from role/Oscar text. Use `useUnitAccess(slug)` (hooks/useUnitAccess.ts)
 *   or `unitAccess()` (lib/unit-access.ts): membership is the only source of unit access.
 */
export function canManageCheetahs(role: string | null | undefined, oscar?: string | null, hasAdminAccess?: boolean | null): boolean {
  if (!role) return false
  if (isAdmin(role, hasAdminAccess)) return true
  const effective = effectiveOscarRole(role, oscar)
  return ['tango_oscar', 'head_tango_oscar'].includes(effective ?? '')
}

/**
 * Check if a user can manage NOscar (hotels/nests) in general — either
 * sub-unit (Den or Nest), or a legacy officer still on the umbrella role.
 * @deprecated Unit permission from role/Oscar text. Use `useUnitAccess(slug)` (hooks/useUnitAccess.ts)
 *   or `unitAccess()` (lib/unit-access.ts): membership is the only source of unit access.
 */
export function canManageNOscar(role: string | null | undefined, oscar?: string | null, hasAdminAccess?: boolean | null): boolean {
  if (!role) return false
  if (isAdmin(role, hasAdminAccess)) return true
  const effective = effectiveOscarRole(role, oscar)
  return ['november_oscar', 'noscar_den', 'head_noscar_den', 'noscar_nest', 'head_noscar_nest'].includes(effective ?? '')
}

/**
 * Check if a user can manage the November (Nest) page — hotel locations
 * and Papa accommodations. Legacy `november_oscar` officers (not yet split
 * into a specific sub-unit) retain access to both Den and Nest.
 * @deprecated Unit permission from role/Oscar text. Use `useUnitAccess(slug)` (hooks/useUnitAccess.ts)
 *   or `unitAccess()` (lib/unit-access.ts): membership is the only source of unit access.
 */
export function canManageNoscarNest(role: string | null | undefined, oscar?: string | null, hasAdminAccess?: boolean | null): boolean {
  if (!role) return false
  if (isAdmin(role, hasAdminAccess)) return true
  const effective = effectiveOscarRole(role, oscar)
  return ['november_oscar', 'noscar_nest', 'head_noscar_nest'].includes(effective ?? '')
}

/**
 * Check if a user can manage the November (Den) page — private lounge
 * locations and Lounge/Den menus. Legacy `november_oscar` officers (not yet
 * split into a specific sub-unit) retain access to both Den and Nest.
 * @deprecated Unit permission from role/Oscar text. Use `useUnitAccess(slug)` (hooks/useUnitAccess.ts)
 *   or `unitAccess()` (lib/unit-access.ts): membership is the only source of unit access.
 */
export function canManageNoscarDen(role: string | null | undefined, oscar?: string | null, hasAdminAccess?: boolean | null): boolean {
  if (!role) return false
  if (isAdmin(role, hasAdminAccess)) return true
  const effective = effectiveOscarRole(role, oscar)
  return ['november_oscar', 'noscar_den', 'head_noscar_den'].includes(effective ?? '')
}

/**
 * Check if a user can manage Theatres (venues).
 * Victor Oscars own this page.
 * @deprecated Unit permission from role/Oscar text. Use `useUnitAccess(slug)` (hooks/useUnitAccess.ts)
 *   or `unitAccess()` (lib/unit-access.ts): membership is the only source of unit access.
 */
export function canManageVenues(role: string | null | undefined, oscar?: string | null, hasAdminAccess?: boolean | null): boolean {
  if (!role) return false
  if (isAdmin(role, hasAdminAccess)) return true
  const effective = effectiveOscarRole(role, oscar)
  return ['victor_oscar', 'head_victor_oscar'].includes(effective ?? '')
}

/**
 * Alias for canManageNoscarNest for compatibility.
 * @deprecated Unit permission from role/Oscar text. Use `useUnitAccess(slug)` (hooks/useUnitAccess.ts)
 *   or `unitAccess()` (lib/unit-access.ts): membership is the only source of unit access.
 */
export function canManageNests(role: string | null | undefined, oscar?: string | null, hasAdminAccess?: boolean | null): boolean {
  return canManageNoscarNest(role, oscar, hasAdminAccess)
}

/**
 * Alias for canManageCheetahs for compatibility.
 * @deprecated Unit permission from role/Oscar text. Use `useUnitAccess(slug)` (hooks/useUnitAccess.ts)
 *   or `unitAccess()` (lib/unit-access.ts): membership is the only source of unit access.
 */
export function canManageFleet(role: string | null | undefined, oscar?: string | null, hasAdminAccess?: boolean | null): boolean {
  return canManageCheetahs(role, oscar, hasAdminAccess)
}

/**
 * Check if a user can manage Eagles (aircraft/airport operations).
 * Per SOP TCNP.01.06, Eagle Square/airport operations are Alpha Oscar's
 * domain — Tango Oscar owns vehicles (Cheetahs), a separate domain.
 * @deprecated Unit permission from role/Oscar text. Use `useUnitAccess(slug)` (hooks/useUnitAccess.ts)
 *   or `unitAccess()` (lib/unit-access.ts): membership is the only source of unit access.
 */
export function canManageEagles(role: string | null | undefined, oscar?: string | null, hasAdminAccess?: boolean | null): boolean {
  if (!role) return false
  if (isAdmin(role, hasAdminAccess)) return true
  const effective = effectiveOscarRole(role, oscar)
  return ['alpha_oscar', 'head_alpha_oscar', 'delta_oscar'].includes(effective ?? '')
}

/**
 * Serial — Social Media unit. Members can contribute; head + leadership manage.
 * @deprecated Unit permission from role/Oscar text. Use `useUnitAccess(slug)` (hooks/useUnitAccess.ts)
 *   or `unitAccess()` (lib/unit-access.ts): membership is the only source of unit access.
 */
export function canAccessSierra(role: string | null | undefined, oscar?: string | null, hasAdminAccess?: boolean | null): boolean {
  if (!role) return false
  if (isAdmin(role, hasAdminAccess)) return true
  const effective = effectiveOscarRole(role, oscar)
  return ['serial_oscar', 'head_serial_oscar', 'sierra_oscar', 'head_sierra_oscar'].includes(effective ?? '')
}

/**
 * @deprecated Unit permission from role/Oscar text. Use `useUnitAccess(slug)` (hooks/useUnitAccess.ts)
 *   or `unitAccess()` (lib/unit-access.ts): membership is the only source of unit access.
 */
export function canManageSierra(role: string | null | undefined, oscar?: string | null, hasAdminAccess?: boolean | null): boolean {
  if (!role) return false
  if (isAdmin(role, hasAdminAccess)) return true
  const effective = effectiveOscarRole(role, oscar)
  return ['serial_oscar', 'head_serial_oscar', 'sierra_oscar', 'head_sierra_oscar'].includes(effective ?? '')
}

/**
 * Compliance — grooming and dress code. Everyone can view; unit + leadership edit.
 * @deprecated Unit permission from role/Oscar text. Use `useUnitAccess(slug)` (hooks/useUnitAccess.ts)
 *   or `unitAccess()` (lib/unit-access.ts): membership is the only source of unit access.
 */
export function canManageCompliance(role: string | null | undefined, oscar?: string | null, hasAdminAccess?: boolean | null): boolean {
  if (!role) return false
  if (isAdmin(role, hasAdminAccess)) return true
  const effective = effectiveOscarRole(role, oscar)
  return ['compliance_oscar', 'head_compliance_oscar'].includes(effective ?? '')
}

/**
 * Welfare — meals and officer welfare. Everyone can view menus; unit + leadership edit.
 * @deprecated Unit permission from role/Oscar text. Use `useUnitAccess(slug)` (hooks/useUnitAccess.ts)
 *   or `unitAccess()` (lib/unit-access.ts): membership is the only source of unit access.
 */
export function canManageWelfare(role: string | null | undefined, oscar?: string | null, hasAdminAccess?: boolean | null): boolean {
  if (!role) return false
  if (isAdmin(role, hasAdminAccess)) return true
  const effective = effectiveOscarRole(role, oscar)
  return ['welfare_oscar', 'head_welfare_oscar', 'november_oscar', 'noscar_den', 'head_noscar_den'].includes(effective ?? '')
}

/**
 * Officer welfare directory (names, approved contact details and birthdays)
 * is a Head-of-Welfare responsibility specifically — NOT
 * extended to rank-and-file Welfare Oscars, per the "sufficient, not more"
 * access principle. Admins/command already see this via the users table.
 * @deprecated Unit permission from role/Oscar text. Use `useUnitAccess(slug)` (hooks/useUnitAccess.ts)
 *   or `unitAccess()` (lib/unit-access.ts): membership is the only source of unit access.
 */
export function canAccessWelfareDirectory(role: string | null | undefined, oscar?: string | null, hasAdminAccess?: boolean | null): boolean {
  if (!role) return false
  if (isAdmin(role, hasAdminAccess)) return true
  const effective = effectiveOscarRole(role, oscar)
  return effective === 'head_welfare_oscar'
}

/**
 * Finance — leadership only.
 */
export function canAccessFinance(role: string | null | undefined, hasAdminAccess?: boolean | null): boolean {
  return isAdmin(role, hasAdminAccess)
}

/**
 * Victor seat arrangements — head of Victor + leadership create; unit + DOs view.
 * @deprecated Unit permission from role/Oscar text. Use `useUnitAccess(slug)` (hooks/useUnitAccess.ts)
 *   or `unitAccess()` (lib/unit-access.ts): membership is the only source of unit access.
 */
export function canManageSeatArrangements(role: string | null | undefined, oscar?: string | null, hasAdminAccess?: boolean | null): boolean {
  if (!role) return false
  if (isAdmin(role, hasAdminAccess)) return true
  const effective = effectiveOscarRole(role, oscar)
  return ['head_victor_oscar'].includes(effective ?? '')
}

/**
 * Team chat moderation — admins and the head of the officer's own team.
 */
export function canModerateTeamChat(role: string | null | undefined, isTeamHead?: boolean | null): boolean {
  if (isAdmin(role)) return true
  return isTeamHead === true
}

/** Officer teams */
export const OFFICER_TEAMS = [
  { value: 'strength', label: 'Team Strength' },
  { value: 'wisdom', label: 'Team Wisdom' },
  { value: 'swift', label: 'Team Swift' },
] as const

export type OfficerTeam = (typeof OFFICER_TEAMS)[number]['value']

/** Administrators and senior leadership can chat without joining a team. */
export function getAccessibleTeamChats(role: string | null | undefined, assignedTeam?: string | null, hasAdminAccess?: boolean | null) {
  if (isPlatformAdministrator(role, hasAdminAccess)) return OFFICER_TEAMS
  return OFFICER_TEAMS.filter(team => team.value === assignedTeam)
}

