import { NextResponse } from 'next/server'
import { getChatCaller, chatError, CHAT_PRIVATE_HEADERS } from '@/lib/chat-server'
import { validPushEndpoint, validPushKey } from '@/lib/push-validation'
import { checkRateLimit } from '@/lib/security/rate-limit'

export const runtime = 'nodejs'
export async function GET() {
  const caller = await getChatCaller()
  if ('error' in caller) return caller.error
  const { data, error } = await caller.db.rpc('get_device_push_config')
  return NextResponse.json({ ready: !error && Boolean(data?.publicKey), publicKey: data?.publicKey ?? null, userId: caller.profile.id }, { headers: CHAT_PRIVATE_HEADERS })
}
async function change(request: Request, remove: boolean) {
  // Cookie authentication is same-origin only; reject cross-site registration and deletion.
  if (request.headers.get('origin') !== new URL(request.url).origin) return chatError('Open TCNP to manage device notifications.', 403)
  if (!(await checkRateLimit(request, 'push-device', 30, 60_000)).success) return chatError('Please wait before trying again.', 429)
  const caller = await getChatCaller()
  if ('error' in caller) return caller.error
  const body = await request.json().catch(() => null)
  if (!validPushEndpoint(body?.endpoint)) return chatError('Invalid notification subscription.', 400)
  if (remove) {
    const { error } = await caller.db.from('device_push_subscriptions').delete().eq('endpoint', body.endpoint).eq('user_id', caller.profile.id)
    return error ? chatError('Could not disconnect notifications. Please retry.', 503) : NextResponse.json({ ok: true }, { headers: CHAT_PRIVATE_HEADERS })
  }
  if (!validPushKey(body?.keys?.p256dh, 65) || !validPushKey(body?.keys?.auth, 16)) return chatError('Invalid notification keys.', 400)
  // getUser above validates the JWT before its session claim is used.
  const { data: { session } } = await caller.auth.auth.getSession()
  let sessionId: string | undefined
  try { sessionId = JSON.parse(Buffer.from(session!.access_token.split('.')[1], 'base64url').toString()).session_id } catch {}
  if (!sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) return chatError('Sign in again to enable device notifications.', 401)
  const { data: existing, error: readError } = await caller.db.from('device_push_subscriptions').select('p256dh,auth_key').eq('endpoint', body.endpoint).maybeSingle()
  if (readError) return chatError('Device notifications are being set up. Please retry shortly.', 503)
  if (existing && (existing.p256dh !== body.keys.p256dh || existing.auth_key !== body.keys.auth)) return chatError('Refresh your device notification subscription.', 409)
  const { error } = await caller.db.from('device_push_subscriptions').upsert({ endpoint: body.endpoint, user_id: caller.profile.id, session_id: sessionId, p256dh: body.keys.p256dh, auth_key: body.keys.auth, updated_at: new Date().toISOString() }, { onConflict: 'endpoint' })
  return error ? chatError('Could not enable device notifications. Please retry.', 503) : NextResponse.json({ ok: true }, { headers: CHAT_PRIVATE_HEADERS })
}
export const POST = (request: Request) => change(request, false)
export const DELETE = (request: Request) => change(request, true)
