const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

/** Exercise the actual client-to-worker protocol against the shipped worker. */
function device(options = {}) {
  const data = new Map(), storage = new Map(), handlers = {}, calls = [], notifications = [], progress = [], timers = new Set()
  const cache = { put: async (key, value) => data.set(key, await value.text()), match: async key => data.has(key) ? new Response(data.get(key)) : undefined, delete: async key => data.delete(key) }
  const caches = { open: async () => { if (options.storageBlocked) throw Error('Storage unavailable'); return cache } }
  let permission = options.permission || 'default', subscribed = null, registered = false, legacy = true
  const fakeSubscription = { endpoint: 'https://fcm.googleapis.com/new', toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/new', keys: { p256dh: 'key', auth: 'auth' } }), unsubscribe: async () => { subscribed = null; return true } }
  const worker = { state: options.installing ? 'installing' : 'activated', addEventListener: (_, fn) => { worker.changed = fn }, removeEventListener: () => { worker.changed = null }, postMessage(message, ports) { let pending; handlers.message({ data: message, ports, waitUntil: promise => { pending = promise } }); void pending } }
  const reg = { scope: 'https://tcnp.vercel.app/notifications/', active: options.installing ? null : worker, installing: options.installing ? worker : null, pushManager: {
    getSubscription: async () => subscribed,
    subscribe: async () => { calls.push('subscribe'); if (options.subscribeNever) return new Promise(() => {}); subscribed = fakeSubscription; return subscribed },
  }, showNotification: async (title, payload) => notifications.push({ title, ...payload }) }
  const oldReg = { scope: 'https://tcnp.vercel.app/', active: { postMessage() { throw Error('Old app worker cannot acknowledge notifications') } }, pushManager: { getSubscription: async () => legacy ? { endpoint: 'https://fcm.googleapis.com/old', unsubscribe: async () => { legacy = false; return true } } : null } }
  const self = { location: { origin: 'https://tcnp.vercel.app' }, registration: reg, addEventListener: (type, handler) => { handlers[type] = handler }, skipWaiting: async () => {} }
  vm.runInNewContext(fs.readFileSync('public/notification-worker.js', 'utf8'), { self, caches, Response, URL })
  class Channel {
    constructor() {
      this.port1 = { closed: false, close() { this.closed = true } }
      this.port2 = { postMessage: message => queueMicrotask(() => { if (!this.port1.closed) this.port1.onmessage?.({ data: message }) }) }
    }
  }
  const serviceWorker = {
    get ready() { throw Error('Must not wait for the stale root worker') },
    register: async (script, opts) => {
      calls.push({ script, ...opts }); registered = true
      if (options.installing) setTimeout(() => { worker.state = 'activated'; reg.active = worker; reg.installing = null; worker.changed?.() }, 0)
      return reg
    },
    getRegistration: async path => path === '/notifications/' && registered ? reg : oldReg,
    getRegistrations: async () => registered ? [reg, oldReg] : [oldReg],
  }
  const Notification = { get permission() { return permission }, requestPermission() { calls.push('permission'); permission = options.deny ? 'denied' : 'granted'; return Promise.resolve(permission) } }
  const window = {
    isSecureContext: true, Notification, PushManager: function () {}, dispatchEvent() {},
    setTimeout(fn, delay) { const id = setTimeout(() => { timers.delete(id); fn() }, Math.min(delay, 100)); timers.add(id); return id },
    clearTimeout(id) { timers.delete(id); clearTimeout(id) },
  }
  const mod = { exports: {} }
  const config = { ready: true, publicKey: Buffer.alloc(65, 1).toString('base64url'), userId: 'officer' }
  const fetch = async (_, opts) => {
    calls.push({ method: opts.method, body: opts.body })
    if (options.postFails && opts.method === 'POST') return Response.json({ error: 'Try again shortly' }, { status: 503 })
    return Response.json(opts.method === 'GET' ? config : { ok: true })
  }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/device-push.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    module: mod, exports: mod.exports, window, navigator: { serviceWorker }, Notification, caches, fetch,
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    MessageChannel: Channel, AbortSignal, Response, Uint8Array, URL, Event, atob,
  })
  return { api: mod.exports, config, calls, notifications, data, timers, progress, cache, get legacy() { return legacy } }
}

test('Windows enable completes against a stale app worker, binds the account and retires only legacy push', async () => {
  const d = device()
  const setup = d.api.connectDevicePush(d.config, true, message => d.progress.push(message))
  assert.equal(d.calls[0], 'permission', 'browser permission must stay within the click gesture')
  await setup
  assert.equal(d.calls.find(call => call.script)?.script, '/notification-worker.js')
  assert.equal(d.calls.find(call => call.script)?.scope, '/notifications/')
  assert.equal(d.calls.find(call => call.script)?.updateViaCache, 'none')
  assert.equal(d.data.get('/__tcnp_push_owner__'), 'officer')
  assert.equal(d.legacy, false)
  assert.equal(await d.api.devicePushConnected(), true)
  assert.equal(d.timers.size, 0, 'all successful operation timers must be cleared')
  await d.api.sendDeviceNotificationTest()
  assert.equal(d.notifications[0].title, 'TCNP notifications enabled')
  await d.api.disconnectDevicePush()
  assert.equal(await d.api.devicePushConnected(), false)
  assert.equal(d.data.has('/__tcnp_push_owner__'), false)
})
test('first-time installation waits for activation without relying on the root registration', async () => {
  const d = device({ installing: true })
  await d.api.connectDevicePush(d.config, true)
  assert.equal(await d.api.devicePushConnected(), true)
  assert.equal(d.timers.size, 0)
})
test('permission refusal is actionable and does not register a worker or claim enabled', async () => {
  const d = device({ deny: true })
  await assert.rejects(d.api.connectDevicePush(d.config, true), /blocked.*site settings/)
  assert.equal(d.calls.some(call => call.script), false)
  assert.equal(await d.api.devicePushConnected(), false)
})
test('a stalled Windows push service times out and allows a clean retry', async () => {
  const options = { subscribeNever: true }
  const d = device(options)
  await assert.rejects(d.api.connectDevicePush(d.config, true), /Could not reach the browser notification service/)
  assert.equal(d.data.has('/__tcnp_push_owner__'), false)
  assert.equal(await d.api.devicePushConnected(), false)
  assert.equal(d.timers.size, 0)
  options.subscribeNever = false
  await d.api.connectDevicePush(d.config, true)
  assert.equal(await d.api.devicePushConnected(), true)
})
test('blocked storage and server enrollment failure never produce a success marker', async () => {
  for (const options of [{ storageBlocked: true }, { postFails: true }]) {
    const d = device(options)
    await assert.rejects(d.api.connectDevicePush(d.config, true), /storage is blocked|Try again shortly/)
    assert.equal(d.data.has('/__tcnp_push_owner__'), false)
    assert.equal(await d.api.devicePushConnected(), false)
    assert.equal(d.timers.size, 0)
  }
})
test('logout during an installation cancels enrollment instead of restoring account ownership', async () => {
  const d = device({ installing: true })
  const connecting = d.api.connectDevicePush(d.config, true)
  await d.api.disconnectDevicePush(false)
  await assert.rejects(connecting, /cancelled/)
  assert.equal(d.data.has('/__tcnp_push_owner__'), false)
  assert.equal(d.calls.some(call => call.method === 'POST'), false)
})
