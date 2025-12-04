import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Check if a user role is an admin
 */
export function isAdmin(role: string | null | undefined): boolean {
  if (!role) return false
  return ['admin', 'dev_admin'].includes(role)
}

/**
 * Check if a user can manage a journey
 * Admins, HOC, and HOP can manage all journeys
 * DOs can only manage journeys they're assigned to
 */
export function canManageJourney(role: string | null | undefined, isAssignedDO: boolean = false): boolean {
  if (!role) return false

  // Admins, HOC, and HOP can manage all journeys
  if (['admin', 'dev_admin', 'head_of_command', 'head_of_operations'].includes(role)) {
    return true
  }

  // DOs can only manage journeys they're assigned to
  if (role === 'delta_oscar' && isAssignedDO) {
    return true
  }

  return false
}

/**
 * Check if a user can manage Papas (guest ministers)
 */
export function canManagePapas(role: string | null | undefined): boolean {
  if (!role) return false
  return ['admin', 'dev_admin', 'head_of_command', 'head_of_operations', 'head_tango_oscar'].includes(role)
}

/**
 * Check if a user can manage Cheetahs (vehicles)
 */
export function canManageCheetahs(role: string | null | undefined): boolean {
  if (!role) return false
  return ['admin', 'dev_admin', 'head_of_command', 'head_of_operations', 'tango_oscar', 'head_tango_oscar'].includes(role)
}

/**
 * Check if a user can manage NOscar (hotels/nests)
 */
export function canManageNOscar(role: string | null | undefined): boolean {
  if (!role) return false
  return ['admin', 'dev_admin', 'head_of_command', 'head_of_operations', 'november_oscar'].includes(role)
}

/**
 * Check if a user can manage Nests (hotels/accommodation)
 * Alias for canManageNOscar for compatibility
 */
export function canManageNests(role: string | null | undefined): boolean {
  return canManageNOscar(role)
}

/**
 * Check if a user can manage Fleet (vehicles/cheetahs)
 * Alias for canManageCheetahs for compatibility
 */
export function canManageFleet(role: string | null | undefined): boolean {
  return canManageCheetahs(role)
}
