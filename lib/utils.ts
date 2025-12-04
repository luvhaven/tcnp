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
