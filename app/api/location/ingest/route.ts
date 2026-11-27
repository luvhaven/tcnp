import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/security/rate-limit'
import { MAX_FIX_AGE_MS, hashDeviceToken, parseDeviceFix, validDeviceToken } from '@/lib/location-device-token'

export const runtime = 'nodejs'

const headers = { 'Cache-Control': 'no-store' }
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers })

/**
 * One position from the native TCNP app, sent while the app is in the
 * background or the phone is locked. There is no session here: the request
 * carries the device token issued by /api/location/device-token, which can
 * only publish a position for the officer it was issued to.
 *
 * `stop: true` tells the app to end background tracking: the token is no
 * longer valid, or the officer has switched location sharing off.
 */
export async function POST(request: Request) {
  const authorization = request.headers.get('authorization') || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!validDeviceToken(token)) return reply({ error: 'Missing device token.', stop: true }, 401)
  const hash = hashDeviceToken(token)

  // A phone sends a position every 10 to 15 seconds; anything faster is a fault.
  if (!rateLimit(`location-ingest:${hash}`, 30, 60_000).success) return reply({ error: 'Too many updates.' }, 429)

  const fix = parseDeviceFix(await request.json().catch(() => null))
  if (!fix) return reply({ error: 'Invalid location.' }, 400)
  if (fix.recordedAt !== null && Date.now() - fix.recordedAt > MAX_FIX_AGE_MS) return reply({ ok: true, ignored: 'stale' })

  const { data, error } = await (createAdminClient() as any).rpc('ingest_device_location', {
    p_token_hash: hash,
    p_latitude: fix.latitude,
    p_longitude: fix.longitude,
    p_accuracy: fix.accuracy,
    p_altitude: fix.altitude,
    p_heading: fix.heading,
    p_speed: fix.speed,
    p_battery_level: fix.batteryLevel,
  })
  if (error) return reply({ error: 'Could not record the location. It will be retried.' }, 503)
  if (data === 'invalid') return reply({ error: 'This device is no longer connected.', stop: true }, 401)
  if (data === 'sharing_off') return reply({ error: 'Location sharing is off.', stop: true }, 409)
  return reply({ ok: true })
}
