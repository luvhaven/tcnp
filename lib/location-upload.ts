import { createClient } from '@/lib/supabase/client'
import { createLocationSharingGuard } from '@/lib/location-sharing'

/**
 * Single path for publishing this device's position.
 *
 * - Sends a stable per-device id so the server keeps one live pin per phone:
 *   when a shared phone changes hands, the previous officer's pin there is
 *   retired instead of showing two people at the same spot.
 * - Coalesces: only one upload is in flight; newer fixes replace the queued one.
 * - On a poor network a stuck request times out and the latest unsent fix is
 *   retried in the background, so the map catches up when signal returns.
 */

export type LocationFix = {
  latitude: number
  longitude: number
  accuracy?: number | null
  altitude?: number | null
  heading?: number | null
  speed?: number | null
  batteryLevel?: number | null
}

const DEVICE_KEY = 'tcnp-device-id'
const UPLOAD_TIMEOUT_MS = 12000
const RETRY_MS = 15000

let deviceId: string | null = null
let deviceParamSupported = true
let inFlight = false
let pending: { userId: string; fix: LocationFix } | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null

export function getDeviceId(): string {
  if (deviceId) return deviceId
  try {
    deviceId = window.localStorage.getItem(DEVICE_KEY)
    if (!deviceId) {
      deviceId = crypto.randomUUID()
      window.localStorage.setItem(DEVICE_KEY, deviceId)
    }
  } catch {
    deviceId = deviceId || `session-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
  return deviceId
}

function isMissingDeviceParam(error: any) {
  // PostgREST answers PGRST202 when the database has not been migrated to the
  // device-aware upsert_user_location yet; fall back to the original signature.
  return error?.code === 'PGRST202' || /p_device_id/.test(String(error?.message ?? ''))
}

function isNetworkError(error: any) {
  const message = String(error?.message ?? error ?? '')
  return error?.name === 'AbortError' || /fetch|network|timed? ?out|load failed|abort/i.test(message)
}

async function send(userId: string, fix: LocationFix) {
  const supabase = createClient() as any
  const params: Record<string, unknown> = {
    p_user_id: userId,
    p_latitude: fix.latitude,
    p_longitude: fix.longitude,
    p_accuracy: fix.accuracy ?? null,
    p_altitude: fix.altitude ?? null,
    p_heading: fix.heading ?? null,
    p_speed: fix.speed ?? null,
    p_battery_level: fix.batteryLevel ?? null,
  }
  const call = (body: Record<string, unknown>) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS)
    return supabase.rpc('upsert_user_location', body).abortSignal(controller.signal)
      .then((result: any) => { clearTimeout(timer); return result }, (error: any) => { clearTimeout(timer); throw error })
  }

  if (deviceParamSupported) {
    const { error } = await call({ ...params, p_device_id: getDeviceId() })
    if (!error) return
    if (!isMissingDeviceParam(error)) throw error
    deviceParamSupported = false
  }
  const { error } = await call(params)
  if (error) throw error
}

function scheduleRetry() {
  if (retryTimer || typeof window === 'undefined') return
  retryTimer = setTimeout(() => {
    retryTimer = null
    void drain()
  }, RETRY_MS)
}

async function drain() {
  if (inFlight || !pending) return
  const job = pending
  pending = null
  const canShare = createLocationSharingGuard()
  if (!canShare()) return
  inFlight = true
  try {
    await send(job.userId, job.fix)
  } catch (error) {
    if (isNetworkError(error) && canShare()) {
      // Keep the newest position: a fresher fix that arrived meanwhile wins.
      if (!pending) pending = job
      scheduleRetry()
    } else {
      console.warn('📍 Location update failed (non-fatal):', (error as any)?.message ?? error)
    }
  } finally {
    inFlight = false
  }
  if (pending) void drain()
}

/** Queue this device's latest fix for upload. Resolves once it has been handed to the uploader. */
export function publishLocation(userId: string, fix: LocationFix) {
  pending = { userId, fix }
  void drain()
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void drain() })
}
