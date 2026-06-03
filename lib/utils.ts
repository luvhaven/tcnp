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

  // Tango Oscar — Transport
  if (['to', 'tango', 'tango_oscar', 'tango oscar'].includes(norm)) return 'tango_oscar'
  // Echo Oscar — Equipment / AV
  if (['eo', 'echo', 'echo_oscar', 'echo oscar'].includes(norm)) return 'echo_oscar'
  // Victor Oscar — Venue / Theatre
  if (['vo', 'victor', 'victor_oscar', 'victor oscar'].includes(norm)) return 'victor_oscar'
  // November Oscar — Nests / Hotels
  if (['no', 'november', 'november_oscar', 'november oscar'].includes(norm)) return 'november_oscar'
  // Alpha Oscar — Eagle Squares / Airports
  if (['ao', 'alpha', 'alpha_oscar', 'alpha oscar'].includes(norm)) return 'alpha_oscar'
  // Head variants
  if (norm.includes('head_tango') || norm.includes('head tango')) return 'head_tango_oscar'
  if (norm.includes('head_echo') || norm.includes('head echo')) return 'head_echo_oscar'
  if (norm.includes('head_victor') || norm.includes('head victor')) return 'head_victor_oscar'
  if (norm.includes('head_november') || norm.includes('head november') || norm.includes('head_noscar')) return 'november_oscar'
  if (norm.includes('head_alpha') || norm.includes('head alpha')) return 'head_alpha_oscar'

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
 * Check if a user role is an admin
 */
export function isAdmin(role: string | null | undefined): boolean {
  if (!role) return false
  return ['admin', 'dev_admin', 'super_admin', 'captain', 'head_of_operations', 'head_of_command', 'command'].includes(role)
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
 */
export function canManagePapas(role: string | null | undefined, oscar?: string | null): boolean {
  if (!role) return false
  if (isAdmin(role)) return true
  const effective = effectiveOscarRole(role, oscar)
  return ['head_tango_oscar'].includes(effective ?? '')
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
 * Check if a user can manage NOscar (hotels/nests).
 */
export function canManageNOscar(role: string | null | undefined, oscar?: string | null): boolean {
  if (!role) return false
  if (isAdmin(role)) return true
  const effective = effectiveOscarRole(role, oscar)
  return ['november_oscar'].includes(effective ?? '')
}

/**
 * Alias for canManageNOscar for compatibility.
 */
export function canManageNests(role: string | null | undefined, oscar?: string | null): boolean {
  return canManageNOscar(role, oscar)
}

/**
 * Alias for canManageCheetahs for compatibility.
 */
export function canManageFleet(role: string | null | undefined, oscar?: string | null): boolean {
  return canManageCheetahs(role, oscar)
}

/**
 * Check if a user can manage Eagles (tracking/operations).
 */
export function canManageEagles(role: string | null | undefined, oscar?: string | null): boolean {
  if (!role) return false
  if (isAdmin(role)) return true
  const effective = effectiveOscarRole(role, oscar)
  return ['delta_oscar', 'tango_oscar', 'head_tango_oscar'].includes(effective ?? '')
}

