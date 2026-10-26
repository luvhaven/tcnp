/** A cached map response must never redraw this device's opted-out officer. */
export function visibleSharedLocations<T extends { user_id: string }>(locations: T[], ownUserId: string | null | undefined, sharingEnabled: boolean): T[] {
  if (!ownUserId) return []
  return !sharingEnabled ? locations.filter(location => location.user_id !== ownUserId) : locations
}
