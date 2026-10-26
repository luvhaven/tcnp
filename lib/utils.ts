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
 */
export function isAdmin(role: string | null | undefined): boolean {
  if (!role) return false
  return ['admin', 'dev_admin', 'super_admin', 'captain', 'vice_captain', 'head_of_operations', 'head_of_command', 'command', 'hod', 'hop'].includes(role)
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

/** These roles have full Admin privileges while keeping their own role names. */
export const PLATFORM_ADMIN_ROLES = [
  'super_admin', 'dev_admin', 'admin', 'head_of_command', 'captain', 'vice_captain',
] as const

/** Super Admin retains owner authority above the Admin and leadership tier. */
export function platformAuthorityRank(role: string | null | undefined): number {
  if (role && (PLATFORM_ADMIN_ROLES as readonly string[]).includes(role)) {
    return role === 'super_admin' ? 100 : 80
  }
  switch (role) {
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

export function isPlatformAdministrator(role: string | null | undefined): boolean {
  return platformAuthorityRank(role) >= 80
}

/** Display identity is separate from Admin authority. */
export function isExecutiveRole(role: string | null | undefined): boolean {
  return role === 'captain' || role === 'vice_captain'
}

export function privilegedAccessLabel(role: string | null | undefined): string {
  return isExecutiveRole(role) ? 'Executive access' : isPlatformAdministrator(role) ? 'Admin' : ''
}

export function isUnitHeadRole(
  unit: 'alpha' | 'command' | 'compliance' | 'november_nest' | 'tango' | 'training' | 'victor' | 'welfare',
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

/** Unit-head roles a caller holds, from either their role or their permanent Oscar. */
function heldUnitHeadRoles(role: string | null | undefined, oscar: string | null | undefined): string[] {
  return [role, oscarToRole(oscar)].filter((r): r is string => !!r && SIGNUP_APPROVER_HEAD_ROLES.has(r))
}

/** True when the caller can approve at least some pending signups (admin or a unit head). */
export function canApproveSignups(role: string | null | undefined, oscar?: string | null): boolean {
  return isPlatformAdministrator(role) || heldUnitHeadRoles(role, oscar).length > 0
}

/**
 * Admins approve any signup. A unit head approves only signups whose chosen
 * Oscar belongs to their own unit.
 */
export function canApproveSignupFor(
  callerRole: string | null | undefined,
  callerOscar: string | null | undefined,
  applicantOscar: string | null | undefined,
): boolean {
  if (isPlatformAdministrator(callerRole)) return true
  const applicantUnit = oscarToRole(applicantOscar)
  if (!applicantUnit) return false
  const allowedHeads = SIGNUP_APPROVER_HEADS[applicantUnit] ?? []
  return heldUnitHeadRoles(callerRole, callerOscar).some(r => allowedHeads.includes(r))
}

/**
 * Check if a user can view an officer's full profile (personal info, titles and duty history).
 * Admins, Captain, Vice Captain, Command leadership, and Head of Welfare have full access.
 */
export function canViewOfficerFullProfile(role: string | null | undefined, oscar?: string | null | undefined): boolean {
  if (!role) return false
  if (isAdmin(role)) return true
  const effective = effectiveOscarRole(role, oscar)
  if (effective && isAdmin(effective)) return true
  return ['head_welfare_oscar'].includes(effective ?? '')
}

/**
 * Check if a user can view Live Tracking / Command maps.
 * Exclusively for admins, active command, Captain, Vice Captain, and Head of Operations.
 */
export function canViewLiveTracking(role: string | null | undefined, oscar?: string | null | undefined): boolean {
  if (!role) return false
  if (isAdmin(role)) return true
  const effective = effectiveOscarRole(role, oscar)
  if (effective && isAdmin(effective)) return true
  return false
}

/**
 * Check if a user can access Command Centre.
 * Exclusively for Admin and Command roles.
 */
export function canAccessCommandCentre(role: string | null | undefined, oscar?: string | null | undefined): boolean {
  if (isPlatformAdministrator(role)) return true
  if (!role) return false
  const effective = effectiveOscarRole(role, oscar) || role
  return ['super_admin', 'dev_admin', 'admin', 'command', 'head_of_command'].includes(effective)
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
export function canManagePapas(role: string | null | undefined): boolean {
  return isAdmin(role)
}

/**
 * Check if a user can manage Cheetahs (vehicles).
 * Tango Oscars own this page regardless of whether they are assigned as DO.
 */
export function canManageCheetahs(role: string | null | undefined, oscar?: string | null): boolean {
  if (!role) return false
  if (isAdmin(role)) return true
  const effective = effectiveOscarRole(role, oscar)
  return ['tango_oscar', 'head_tango_oscar'].includes(effective ?? '')
}

/**
 * Check if a user can manage NOscar (hotels/nests) in general — either
 * sub-unit (Den or Nest), or a legacy officer still on the umbrella role.
 */
export function canManageNOscar(role: string | null | undefined, oscar?: string | null): boolean {
  if (!role) return false
  if (isAdmin(role)) return true
  const effective = effectiveOscarRole(role, oscar)
  return ['november_oscar', 'noscar_den', 'head_noscar_den', 'noscar_nest', 'head_noscar_nest'].includes(effective ?? '')
}

/**
 * Check if a user can manage the November (Nest) page — hotel locations
 * and Papa accommodations. Legacy `november_oscar` officers (not yet split
 * into a specific sub-unit) retain access to both Den and Nest.
 */
export function canManageNoscarNest(role: string | null | undefined, oscar?: string | null): boolean {
  if (!role) return false
  if (isAdmin(role)) return true
  const effective = effectiveOscarRole(role, oscar)
  return ['november_oscar', 'noscar_nest', 'head_noscar_nest'].includes(effective ?? '')
}

/**
 * Check if a user can manage the November (Den) page — private lounge
 * locations and Lounge/Den menus. Legacy `november_oscar` officers (not yet
 * split into a specific sub-unit) retain access to both Den and Nest.
 */
export function canManageNoscarDen(role: string | null | undefined, oscar?: string | null): boolean {
  if (!role) return false
  if (isAdmin(role)) return true
  const effective = effectiveOscarRole(role, oscar)
  return ['november_oscar', 'noscar_den', 'head_noscar_den'].includes(effective ?? '')
}

/**
 * Check if a user can manage Theatres (venues).
 * Victor Oscars own this page.
 */
export function canManageVenues(role: string | null | undefined, oscar?: string | null): boolean {
  if (!role) return false
  if (isAdmin(role)) return true
  const effective = effectiveOscarRole(role, oscar)
  return ['victor_oscar', 'head_victor_oscar'].includes(effective ?? '')
}

/**
 * Alias for canManageNoscarNest for compatibility.
 */
export function canManageNests(role: string | null | undefined, oscar?: string | null): boolean {
  return canManageNoscarNest(role, oscar)
}

/**
 * Alias for canManageCheetahs for compatibility.
 */
export function canManageFleet(role: string | null | undefined, oscar?: string | null): boolean {
  return canManageCheetahs(role, oscar)
}

/**
 * Check if a user can manage Eagles (aircraft/airport operations).
 * Per SOP TCNP.01.06, Eagle Square/airport operations are Alpha Oscar's
 * domain — Tango Oscar owns vehicles (Cheetahs), a separate domain.
 */
export function canManageEagles(role: string | null | undefined, oscar?: string | null): boolean {
  if (!role) return false
  if (isAdmin(role)) return true
  const effective = effectiveOscarRole(role, oscar)
  return ['alpha_oscar', 'head_alpha_oscar', 'delta_oscar'].includes(effective ?? '')
}

/**
 * Serial — Social Media unit. Members can contribute; head + leadership manage.
 */
export function canAccessSierra(role: string | null | undefined, oscar?: string | null): boolean {
  if (!role) return false
  if (isAdmin(role)) return true
  const effective = effectiveOscarRole(role, oscar)
  return ['serial_oscar', 'head_serial_oscar', 'sierra_oscar', 'head_sierra_oscar'].includes(effective ?? '')
}

export function canManageSierra(role: string | null | undefined, oscar?: string | null): boolean {
  if (!role) return false
  if (isAdmin(role)) return true
  const effective = effectiveOscarRole(role, oscar)
  return ['serial_oscar', 'head_serial_oscar', 'sierra_oscar', 'head_sierra_oscar'].includes(effective ?? '')
}

/**
 * Compliance — grooming and dress code. Everyone can view; unit + leadership edit.
 */
export function canManageCompliance(role: string | null | undefined, oscar?: string | null): boolean {
  if (!role) return false
  if (isAdmin(role)) return true
  const effective = effectiveOscarRole(role, oscar)
  return ['compliance_oscar', 'head_compliance_oscar'].includes(effective ?? '')
}

/**
 * Welfare — meals and officer welfare. Everyone can view menus; unit + leadership edit.
 */
export function canManageWelfare(role: string | null | undefined, oscar?: string | null): boolean {
  if (!role) return false
  if (isAdmin(role)) return true
  const effective = effectiveOscarRole(role, oscar)
  return ['welfare_oscar', 'head_welfare_oscar', 'november_oscar', 'noscar_den', 'head_noscar_den'].includes(effective ?? '')
}

/**
 * Officer welfare directory (names, approved contact details and birthdays)
 * is a Head-of-Welfare responsibility specifically — NOT
 * extended to rank-and-file Welfare Oscars, per the "sufficient, not more"
 * access principle. Admins/command already see this via the users table.
 */
export function canAccessWelfareDirectory(role: string | null | undefined, oscar?: string | null): boolean {
  if (!role) return false
  if (isAdmin(role)) return true
  const effective = effectiveOscarRole(role, oscar)
  return effective === 'head_welfare_oscar'
}

/**
 * Finance — leadership only.
 */
export function canAccessFinance(role: string | null | undefined): boolean {
  return isAdmin(role)
}

/**
 * Victor seat arrangements — head of Victor + leadership create; unit + DOs view.
 */
export function canManageSeatArrangements(role: string | null | undefined, oscar?: string | null): boolean {
  if (!role) return false
  if (isAdmin(role)) return true
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
export function getAccessibleTeamChats(role: string | null | undefined, assignedTeam?: string | null) {
  if (isPlatformAdministrator(role)) return OFFICER_TEAMS
  return OFFICER_TEAMS.filter(team => team.value === assignedTeam)
}

