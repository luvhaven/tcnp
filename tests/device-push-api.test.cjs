const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const { timingSafeEqual } = require('node:crypto')
function load(file, imports) {
  const mod = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, { module: mod, exports: mod.exports, require: name => imports[name], Buffer, URL, Response, console })
  return mod.exports
}
const json = (data, options) => Response.json(data, options)
const key = size => Buffer.alloc(size).toString('base64url')
const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/one', keys: { p256dh: key(65), auth: key(16) } }
const request = (body = subscription, origin = 'https://tcnp.vercel.app') => new Request('https://tcnp.vercel.app/api/notifications/devices', { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
test('device enrollment validates account, origin, endpoint, keys and session ownership', async () => {
  const writes = []
  const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }), upsert: async value => { writes.push(value); return {} } }) }
  const profile = { id: 'signed-in-officer' }
  let caller = { db, profile, auth: { auth: { getSession: async () => ({ data: { session: { access_token: `a.${Buffer.from(JSON.stringify({ session_id: '10000000-0000-4000-8000-000000000004' })).toString('base64url')}.c` } } }) } } }
  const validation = load('lib/push-validation.ts', {})
  const route = load('app/api/notifications/devices/route.ts', {
    'next/server': { NextResponse: { json } }, '@/lib/chat-server': { getChatCaller: async () => caller, chatError: (error, status) => json({ error }, { status }), CHAT_PRIVATE_HEADERS: { 'Cache-Control': 'private, no-store' } },
    '@/lib/push-validation': validation, '@/lib/security/rate-limit': { checkRateLimit: async () => ({ success: true }) },
  })
  assert.equal((await route.POST(request(subscription, 'https://attacker.example'))).status, 403)
  assert.equal((await route.POST(request({ ...subscription, endpoint: 'https://127.0.0.1/' }))).status, 400)
  assert.equal((await route.POST(request({ ...subscription, keys: { auth: 'bad', p256dh: 'bad' } }))).status, 400)
  assert.equal(writes.length, 0)
  const result = await route.POST(request({ ...subscription, user_id: 'forged-officer' }))
  assert.equal(result.status, 200); assert.equal(writes[0].user_id, profile.id)
  assert.equal(writes[0].session_id, '10000000-0000-4000-8000-000000000004')
  caller = { error: json({ error: 'Sign in' }, { status: 401 }) }
  assert.equal((await route.POST(request())).status, 401)
})
test('public device config never includes private signing key or dispatcher token', async () => {
  const route = load('app/api/notifications/devices/route.ts', {
    'next/server': { NextResponse: { json } }, '@/lib/chat-server': { getChatCaller: async () => ({ profile: { id: 'officer' }, db: { rpc: async () => ({ data: { publicKey: 'public', privateKey: 'secret', dispatchSecret: 'token' } }) } }), CHAT_PRIVATE_HEADERS: { 'Cache-Control': 'private, no-store' } },
    '@/lib/push-validation': {}, '@/lib/security/rate-limit': {},
  })
  const response = await route.GET()
  assert.deepEqual(await response.json(), { ready: true, publicKey: 'public', userId: 'officer' })
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
})
test('dispatcher requires secret, sends generic payload, and expires rejected subscriptions', async () => {
  const calls = [], sent = [], deleted = []
  const config = { dispatchSecret: 'valid-secret', publicKey: 'public', privateKey: 'private', subject: 'https://tcnp.vercel.app' }
  const db = {
    rpc: async (name, args) => { calls.push({ name, args }); return { data: name === 'get_device_push_config' ? config : name === 'claim_notification_push' ? [{ id: 'job', lease_id: 'lease', notification_id: 'notice', subscription_id: 'device', attempts: 1 }] : null } },
    from: table => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === 'device_push_subscriptions' ? { id: 'device', user_id: 'officer', ...subscription, p256dh: key(65), auth_key: key(16) } : table === 'notifications' ? { id: 'notice', user_id: 'officer', title: 'Sensitive name', metadata: { url: '/chat?programId=program' } } : { is_active: true, activation_status: 'active' } }) }) }), delete: () => ({ eq: async (_, id) => { deleted.push(id); return {} } }) }),
  }
  let expired = false
  const route = load('app/api/notifications/dispatch/route.ts', {
    'node:crypto': { timingSafeEqual }, '@/lib/supabase/admin': { createAdminClient: () => db }, '@/lib/push-validation': load('lib/push-validation.ts', {}),
    'web-push': { sendNotification: async (_, payload) => { sent.push(JSON.parse(payload)); if (expired) throw { statusCode: 410 } } },
  })
  const req = token => new Request('https://tcnp.vercel.app/api/notifications/dispatch', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
  assert.equal((await route.POST(req('wrong'))).status, 401)
  assert.equal(calls.some(call => call.name === 'claim_notification_push'), false)
  assert.equal((await route.POST(req('valid-secret'))).status, 200)
  assert.equal(sent[0].title, 'TCNP'); assert.equal(JSON.stringify(sent[0]).includes('Sensitive name'), false)
  assert.equal(sent[0].url, '/chat?programId=program')
  expired = true
  await route.POST(req('valid-secret'))
  assert.deepEqual(deleted, ['device'])
  assert.equal(calls.filter(call => call.name === 'settle_notification_push').at(-1).args.retry_seconds, null)
})
