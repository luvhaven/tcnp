import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { newDeviceToken, validDeviceId } from '@/lib/location-device-token'

export const runtime = 'nodejs'

const headers = { 'Cache-Control': 'private, no-store' }
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers })

/**
 * The signed-in officer asks for (POST) or gives up (DELETE) the credential the
 * native TCNP app uses to keep sending their location while it is in the
 * background. Called by the web screens running inside the app, so it is
 * authenticated by the normal session cookie and limited to the same origin.
 */
async function caller(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return { error: reply({ error: 'Open TCNP to manage location sharing.' }, 403) }
  const db = await createClient()
  const { data: { user }, error } = await db.auth.getUser()
  if (error || !user) return { error: reply({ error: 'Sign in to manage your location sharing.' }, 401) }
  const body = await request.json().catch(() => null)
  if (!validDeviceId(body?.deviceId)) return { error: reply({ error: 'This device could not be identified. Reopen TCNP and try again.' }, 400) }
  return { user, deviceId: body.deviceId as string, platform: typeof body?.platform === 'string' ? body.platform : null }
}

export async function POST(request: Request) {
  const auth = await caller(request)
  if ('error' in auth) return auth.error
  if (!(await checkRateLimit(request, 'location-device-token', 20, 60_000)).success) return reply({ error: 'Please wait a moment before trying again.' }, 429)
  const { token, hash } = newDeviceToken()
  const { error } = await (createAdminClient() as any).rpc('issue_location_device_token', {
    p_user_id: auth.user.id, p_device_id: auth.deviceId, p_token_hash: hash, p_platform: auth.platform,
  })
  if (error) return reply({ error: 'Could not connect this device for location sharing. Please retry.' }, 503)
  return reply({ token, userId: auth.user.id })
}

export async function DELETE(request: Request) {
  const auth = await caller(request)
  if ('error' in auth) return auth.error
  const { error } = await (createAdminClient() as any).rpc('revoke_location_device_tokens', { p_user_id: auth.user.id, p_device_id: auth.deviceId })
  return error ? reply({ error: 'Could not disconnect this device. Please retry.' }, 503) : reply({ ok: true })
}
