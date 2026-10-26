const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
function load(file) {
  const mod = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: mod, exports: mod.exports, Buffer, URL })
  return mod.exports
}
test('push endpoints cannot become SSRF targets and keys are checked', () => {
  const { validPushEndpoint: valid, validPushKey, safeNotificationUrl } = load('lib/push-validation.ts')
  for (const value of ['https://fcm.googleapis.com/fcm/send/abc','https://updates.push.services.mozilla.com/wpush/v2/a','https://web.push.apple.com/a','https://wns2-db5p.notify.windows.com/a']) assert.equal(valid(value), true, value)
  for (const value of ['https://127.0.0.1/a','https://169.254.169.254/','http://fcm.googleapis.com/a','https://fcm.googleapis.com.evil.com/a','https://fcm.googleapis.com:444/a','https://user@fcm.googleapis.com/a','https://evil.com/.push.apple.com','https://fcm.googleapis.com/a#x']) assert.equal(valid(value), false, value)
  assert.equal(validPushKey(Buffer.alloc(65).toString('base64url'), 65), true)
  assert.equal(validPushKey('abc', 65), false)
  for (const value of ['//evil.com','/\\evil.com','https://evil.com']) assert.equal(safeNotificationUrl(value), '/dashboard')
})
test('DO reason choices respect theatre and return destination', () => {
  const { dutyCompletionReasons: reasons } = load('lib/duty-workflow.ts')
  assert.equal(reasons({ destination: 'Theatre' }).length, 0)
  assert.deepEqual(Array.from(reasons({ destination: 'Theatre' }, 'nest')), ['nest_settled'])
  assert.deepEqual(Array.from(reasons({ destination: 'Theatre' }, 'eagle_square')), ['flight_departed','flight_landed'])
  assert.deepEqual(Array.from(reasons({ destination: 'Nest', assigned_theatre_id: 'previous-theatre' })), ['nest_settled'])
})
test('closed-app worker protects shared devices and routes notification clicks', async () => {
  const handlers = {}, shown = [], navigated = [], stored = new Map()
  const cache = { put: async (key, response) => stored.set(key, await response.text()), delete: async key => stored.delete(key), match: async key => stored.has(key) ? new Response(stored.get(key)) : undefined }
  const self = { location: { origin: 'https://tcnp.vercel.app' }, addEventListener: (name, fn) => { handlers[name] = fn }, registration: { showNotification: async (title, options) => shown.push({ title, ...options }) }, clients: { matchAll: async () => [], openWindow: async url => navigated.push(url) } }
  vm.runInNewContext(fs.readFileSync('worker/index.js', 'utf8'), { self, caches: { open: async () => cache }, Response, URL })
  async function event(name, data) { let pending; handlers[name]({ ...data, waitUntil: p => { pending = p } }); await pending }
  const push = targetUserId => event('push', { data: { json: () => ({ targetUserId, tag: 'one', url: '/chat?programId=abc' }) } })
  await push('officer-a'); assert.equal(shown.length, 0)
  await event('message', { data: { type: 'TCNP_PUSH_OWNER', userId: 'officer-a' }, ports: [] })
  await push('officer-b'); assert.equal(shown.length, 0)
  await push('officer-a'); assert.equal(shown.length, 1); assert.equal(shown[0].data.url, '/chat?programId=abc')
  await event('notificationclick', { notification: { data: shown[0].data, close() {} } })
  assert.equal(navigated[0], 'https://tcnp.vercel.app/chat?programId=abc')
  await event('message', { data: { type: 'TCNP_PUSH_OWNER', userId: null }, ports: [] })
  await push('officer-a'); assert.equal(shown.length, 1)
})
