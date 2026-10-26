const STORAGE_KEY = 'tcnp-location-sharing'
let enabled: boolean | undefined
let revision = 0
const listeners = new Set<() => void>()

export function isLocationSharingEnabled(): boolean {
  if (typeof window === 'undefined') return false
  if (enabled === undefined) {
    try { enabled = window.localStorage.getItem(STORAGE_KEY) === 'on' }
    catch { enabled = false }
  }
  return enabled
}

function update(value: boolean) {
  if (value === enabled) return
  enabled = value
  revision += 1
  listeners.forEach(listener => listener())
}

export function setLocationSharingEnabled(value: boolean) {
  if (typeof window === 'undefined') return
  // Update memory even when browser storage is unavailable (e.g. private mode).
  try { window.localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off') } catch { /* session only */ }
  update(value)
}

function handleStorage(event: StorageEvent) {
  if (event.key === STORAGE_KEY || event.key === null) {
    update(event.newValue === 'on')
  }
}

function refreshPreference() {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
  try { update(window.localStorage.getItem(STORAGE_KEY) === 'on') } catch { /* Retain session preference when storage is blocked. */ }
}

export function subscribeToLocationSharing(listener: () => void) {
  if (listeners.size === 0) {
    refreshPreference()
    window.addEventListener('storage', handleStorage)
    window.addEventListener('focus', refreshPreference)
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', refreshPreference)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('focus', refreshPreference)
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', refreshPreference)
    }
  }
}

// A pending GPS/IP request from before a pause must stay invalid after resuming.
export function createLocationSharingGuard(): () => boolean {
  const wasEnabled = isLocationSharingEnabled()
  const startedAt = revision
  return () => wasEnabled && isLocationSharingEnabled() && startedAt === revision
}
