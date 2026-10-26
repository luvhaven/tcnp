import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/security/rate-limit'

const headers = { 'Cache-Control': 'private, no-store' }
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers })
async function caller() {
  const db = await createClient()
  const { data: { user }, error } = await db.auth.getUser()
  return error || !user ? null : { db: db as any, user }
}
export async function GET() {
  const auth = await caller()
  if (!auth) return reply({ error: 'Sign in to manage your location sharing.' }, 401)
  const { data, error } = await auth.db.rpc('location_sharing_is_enabled', { target_user_id: auth.user.id })
  return error ? reply({ error: 'Could not check location sharing. Please retry.' }, 503) : reply({ enabled: data === true, userId: auth.user.id })
}
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: 'Open TCNP to manage location sharing.' }, 403)
  const auth = await caller()
  if (!auth) return reply({ error: 'Sign in to manage your location sharing.' }, 401)
  const body = await request.json().catch(() => null)
  if (typeof body?.enabled !== 'boolean') return reply({ error: 'Choose whether to share your location.' }, 400)
  // Never rate-limit an authenticated privacy opt-out because other officers
  // behind the same network have been enabling their devices.
  if (body.enabled && !(await checkRateLimit(request, 'location-sharing', 40, 60_000)).success) return reply({ error: 'Please wait a moment before trying again.' }, 429)
  if (body.userId && body.userId !== auth.user.id) return reply({ error: 'Your signed-in account changed. Please retry.' }, 409)
  const { data, error } = await auth.db.rpc('set_location_sharing', { sharing_enabled: body.enabled })
  return error ? reply({ error: 'Could not update location sharing on the server. Please retry.' }, 503) : reply({ enabled: data === true, userId: auth.user.id })
}
