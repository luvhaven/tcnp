/**
 * What the live map tells an officer about their own location sharing.
 *
 * The map does not run a GPS watch itself (the app-wide LocationTracker does),
 * so it only says "Broadcasting" when it can see proof: this officer's own pin
 * was updated recently. Sharing switched on is not proof. On iOS the tracker
 * waits for the next tap before asking, and Safari may not report permission
 * at all, so in those cases nothing has been sent yet.
 */

export type GeolocationPermissionState = 'granted' | 'denied' | 'prompt' | 'unknown'

export type BroadcastStatus =
  /** A fix from this device reached the map recently. */
  | 'live'
  /** The browser blocked location for this site. */
  | 'blocked'
  /** Allowed, but no recent fix has arrived yet. */
  | 'finding'
  /** Not decided yet (or the browser cannot say): the officer needs to tap. */
  | 'waiting'

/** A pin older than this no longer counts as live (matches the map's "Offline"). */
export const LIVE_FIX_MAX_AGE_MS = 10 * 60 * 1000

export function broadcastStatus({
  permission,
  ownUpdatedAt,
  now = Date.now(),
}: {
  permission: GeolocationPermissionState
  ownUpdatedAt: string | null | undefined
  now?: number
}): BroadcastStatus {
  if (permission === 'denied') return 'blocked'
  const updated = ownUpdatedAt ? new Date(ownUpdatedAt).getTime() : NaN
  if (Number.isFinite(updated) && now - updated < LIVE_FIX_MAX_AGE_MS) return 'live'
  return permission === 'granted' ? 'finding' : 'waiting'
}
