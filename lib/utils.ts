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
  if (norm.includes('head_hospitality') || norm.includes('head hospitality')) return 'head_hospitality_oscar'

  // Tango Oscar — Transport
  if (['to', 'tango', 'tango_oscar', 'tango oscar'].includes(norm)) return 'tango_oscar'
  // Echo Oscar — Equipment / AV (legacy — no longer a standalone unit, kept for old data)
  if (['eo', 'echo', 'echo_oscar', 'echo oscar'].includes(norm)) return 'echo_oscar'
  // Victor Oscar — Venue / Theatre
  if (['vo', 'victor', 'victor_oscar', 'victor oscar'].includes(norm)) return 'victor_oscar'
  // November Oscar — split into Theatre/Den (private lounge / menus) and Nest (hotels) sub-units
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
  // Hospitality Oscar — Papa experiences
  if (['ho', 'hospitality', 'hospitality_oscar', 'hospitality oscar'].includes(norm)) return 'hospitality_oscar'
  // Command — HQ/leadership staff (not a phonetic Oscar, but selectable at signup/profile)
  if (['command', 'command centre', 'command center'].includes(norm)) return 'command'

  // Fallback: if the oscar string already looks like a role key, return as-is
  if (norm.includes('_oscar') || norm.includes('_admin') || norm.includes('captain')) return norm

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

/**
 * Check if a user can view an officer's full profile (including emergency contacts, personal info, titles and duty history).
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
 * Check if a user can manage the November (Theatre) page — private lounge
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
 * Officer welfare directory (names, contacts, birthdays, emergency contacts
 * for every officer) is a Head-of-Welfare responsibility specifically — NOT
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
 * Hospitality — places and experiences for Papas.
 */
export function canManageHospitality(role: string | null | undefined, oscar?: string | null): boolean {
  if (!role) return false
  if (isAdmin(role)) return true
  const effective = effectiveOscarRole(role, oscar)
  return ['hospitality_oscar', 'head_hospitality_oscar'].includes(effective ?? '')
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

