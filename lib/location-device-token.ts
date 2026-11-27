import { createHash, randomBytes } from 'node:crypto'

/**
 * Credentials for the native app's background location uploads
 * (supabase/migrations/20261127100000_location_device_tokens.sql).
 *
 * The token is shown to the device once and never stored: the database keeps
 * only its SHA-256 hash.
 */
export const DEVICE_TOKEN_PREFIX = 'tcnp_loc_'

export function hashDeviceToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function newDeviceToken(): { token: string; hash: string } {
  const token = DEVICE_TOKEN_PREFIX + randomBytes(32).toString('base64url')
  return { token, hash: hashDeviceToken(token) }
}

/** A device id is chosen by the app; accept only a short, plain identifier. */
export function validDeviceId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value)
}

export function validDeviceToken(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(DEVICE_TOKEN_PREFIX) && /^[A-Za-z0-9_-]{40,80}$/.test(value)
}

export type DeviceFix = {
  latitude: number
  longitude: number
  accuracy: number | null
  altitude: number | null
  heading: number | null
  speed: number | null
  batteryLevel: number | null
  recordedAt: number | null
}

const finite = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null

/** Returns the cleaned fix, or null when the body is not a usable position. */
export function parseDeviceFix(body: unknown): DeviceFix | null {
  if (!body || typeof body !== 'object') return null
  const input = body as Record<string, unknown>
  const latitude = finite(input.latitude), longitude = finite(input.longitude)
  if (latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null
  const battery = finite(input.batteryLevel)
  const heading = finite(input.heading), speed = finite(input.speed), accuracy = finite(input.accuracy)
  return {
    latitude,
    longitude,
    accuracy: accuracy !== null && accuracy >= 0 ? accuracy : null,
    altitude: finite(input.altitude),
    // Phones report -1 for "unknown" heading and speed.
    heading: heading !== null && heading >= 0 && heading <= 360 ? heading : null,
    speed: speed !== null && speed >= 0 ? speed : null,
    batteryLevel: battery !== null && battery >= 0 && battery <= 100 ? Math.round(battery) : null,
    recordedAt: finite(input.recordedAt),
  }
}

/** A position held back by a dead signal is not sent as if it were current. */
export const MAX_FIX_AGE_MS = 10 * 60 * 1000
