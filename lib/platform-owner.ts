export const PERMANENT_OWNER_EMAIL = 'doriazowan@gmail.com'

export function isPermanentOwnerEmail(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase() === PERMANENT_OWNER_EMAIL
}

export function formatPlatformRole(role: string, viewerIsPermanentOwner = false): string {
  const visibleRole = role === 'super_admin' && !viewerIsPermanentOwner ? 'admin' : role
  return visibleRole.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}
