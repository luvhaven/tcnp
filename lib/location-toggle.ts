import { createLocationSharingGuard, isLocationSharingEnabled, setLocationSharingEnabled } from '@/lib/location-sharing'

const PENDING_KEY = 'tcnp-location-unpublish-pending'
const IDLE = { pending: false, requested: false, error: null as string | null }
let status = IDLE
let intent = 0
let currentUserId: string | null = null
let pendingOff = false
let queue: Promise<unknown> = Promise.resolve()
const listeners = new Set<() => void>()
export const getLocationSharingStatus = () => status
export const getServerLocationSharingStatus = () => IDLE
export function subscribeToLocationSharingStatus(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
function updateStatus(next: typeof status) { status = next; listeners.forEach(listener => listener()) }
function markPendingOff(value: boolean) {
  pendingOff = value
  try {
    if (value && currentUserId) window.localStorage.setItem(PENDING_KEY, currentUserId)
    else if (!value && window.localStorage.getItem(PENDING_KEY) === currentUserId) window.localStorage.removeItem(PENDING_KEY)
  } catch { /* Retry remains available for this session. */ }
}
export function setLocationSharingUser(userId: string) {
  if (currentUserId === userId) return
  const unboundPendingOff = !currentUserId && pendingOff
  if (currentUserId) { intent++; setLocationSharingEnabled(false); updateStatus(IDLE) }
  currentUserId = userId
  try { pendingOff = unboundPendingOff || window.localStorage.getItem(PENDING_KEY) === userId } catch {}
  if (pendingOff) markPendingOff(true)
}
async function serverRequest(method: 'GET' | 'POST', enabled?: boolean, userId = currentUserId) {
  const response = await fetch('/api/location-sharing', { method, cache: 'no-store', headers: { 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: JSON.stringify({ enabled, userId }) } : {}), signal: AbortSignal.timeout(10000) })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Could not update location sharing. Please retry.')
  return body as { enabled: boolean; userId: string }
}
function saveChoice(enabled: boolean) {
  const owner = currentUserId
  const work = queue.catch(() => undefined).then(() => serverRequest('POST', enabled, owner))
  queue = work
  return work
}
const OFF_ERROR = 'Tracking has stopped on this device, but your shared map position could not be removed. Retry to hide it from other users.'
async function unpublish(version: number, onError: (message: string) => void) {
  try {
    await saveChoice(false)
    if (version !== intent) return
    markPendingOff(false)
    updateStatus(IDLE)
  } catch {
    if (version !== intent) return
    updateStatus({ pending: false, requested: false, error: OFF_ERROR })
    onError(OFF_ERROR)
  }
}
/** Explicit switch action: stop locally first; only show a confirmed server opt-in. */
export function toggleLocationSharing(value: boolean, onError: (message: string) => void) {
  const version = ++intent
  if (!value) {
    setLocationSharingEnabled(false)
    markPendingOff(true)
    updateStatus({ pending: true, requested: false, error: null })
    void unpublish(version, onError)
    return
  }
  updateStatus({ pending: true, requested: true, error: null })
  const fail = (message: string) => {
    if (version !== intent) return
    setLocationSharingEnabled(false)
    markPendingOff(true)
    updateStatus({ pending: true, requested: false, error: null })
    onError(message)
    // A denied/unavailable GPS request must not leave an earlier pin published.
    void unpublish(version, () => onError(OFF_ERROR))
  }
  if (typeof navigator === 'undefined' || !navigator.geolocation) { fail('Location is unavailable on this device.'); return }
  try {
    // This native request stays in the switch's click gesture, including Safari.
    navigator.geolocation.getCurrentPosition(
      async () => {
        if (version !== intent) return
        try {
          await saveChoice(true)
          if (version !== intent) return
          markPendingOff(false)
          setLocationSharingEnabled(true)
          updateStatus(IDLE)
          if (createLocationSharingGuard()()) window.dispatchEvent(new Event('tcnp-location-ready'))
        } catch (error) {
          fail(error instanceof Error ? error.message : 'Could not start location sharing. Check your connection and try again.')
        }
      },
      error => fail(error.code === 1
        ? 'Location is blocked. Allow location for TCNP in your browser or device settings, then turn tracking on again.'
        : 'Could not get your location. Check device location is on, then try again.'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  } catch { fail('Location could not start. Check your browser location settings and try again.') }
}
/** Resume a failed opt-out on reconnect; never opt a device in from a background refresh. */
export async function refreshLocationSharing() {
  const version = intent
  if (status.pending) return
  if (pendingOff) {
    updateStatus({ pending: true, requested: false, error: null })
    await unpublish(version, () => {})
    if (pendingOff || version !== intent) return
  }
  try {
    const remote = await serverRequest('GET')
    if (version !== intent || (currentUserId && remote.userId !== currentUserId)) return
    if (!currentUserId) setLocationSharingUser(remote.userId)
    if (!remote.enabled && isLocationSharingEnabled()) setLocationSharingEnabled(false)
  } catch { /* A failed check never enables sharing; the server still rejects opted-out uploads. */ }
}
