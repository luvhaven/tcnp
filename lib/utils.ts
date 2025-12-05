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
  return ['admin', 'dev_admin', 'super_admin', 'captain', 'head_of_operations', 'head_of_command', 'command'].includes(role)
}

/**
 * Check if a user can manage a journey
 * Admins, HOC, and HOP can manage all journeys
 * DOs can only manage journeys they're assigned to
 */
export function canManageJourney(role: string | null | undefined, isAssignedDO: boolean = false): boolean {
  if (!role) return false

  // Admins can manage all journeys
  if (isAdmin(role)) {
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
  if (isAdmin(role)) return true
  return ['head_tango_oscar'].includes(role)
}

/**
 * Check if a user can manage Cheetahs (vehicles)
 */
export function canManageCheetahs(role: string | null | undefined): boolean {
  if (!role) return false
  if (isAdmin(role)) return true
  return ['tango_oscar', 'head_tango_oscar'].includes(role)
}

/**
 * Check if a user can manage NOscar (hotels/nests)
 */
export function canManageNOscar(role: string | null | undefined): boolean {
  if (!role) return false
  if (isAdmin(role)) return true
  return ['november_oscar'].includes(role)
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
