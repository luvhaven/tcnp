const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

/** Exercise the real client library against a simulated browser. */
function device(options = {}) {
  const data = new Map(), storage = new Map(), calls = [], notifications = [], events = []
  const cache = { put: async (key, value) => data.set(key, await value.text()), match: async key => data.has(key) ? new Response(data.get(key)) : undefined, delete: async key => data.delete(key) }
  const caches = { open: async () => { if (options.storageBlocked) throw Error('Storage unavailable'); return cache } }
  let permission = options.permission || 'default', subscribed = null, registered = false, legacy = true, subscribeFailures = options.subscribeFailures || 0
  const makeSub = endpoint => ({ endpoint, options: { applicationServerKey: null }, toJSON: () => ({ endpoint, keys: { p256dh: 'key', auth: 'auth' } }), unsubscribe: async () => { subscribed = null; return true } })
  const worker = { state: 'activated', addEventListener() {}, removeEventListener() {} }
  const reg = {
    scope: 'https://tcnp.vercel.app/notifications/', active: options.installing ? null : worker, installing: options.installing ? worker : null, update: async () => {},
    pushManager: {
      getSubscription: async () => subscribed,
      subscribe: async () => {
        calls.push('subscribe')
        if (options.subscribeNever) return new Promise(() => {})
        if (subscribeFailures-- > 0) throw Object.assign(new Error('Registration failed - push service error'), { name: 'AbortError' })
        subscribed = makeSub('https://fcm.googleapis.com/new'); return subscribed
      },
    },
    showNotification: async (title, payload) => notifications.push({ title, ...payload }),
  }
  const oldReg = { scope: 'https://tcnp.vercel.app/', pushManager: { getSubscription: async () => legacy ? { endpoint: 'https://fcm.googleapis.com/old', unsubscribe: async () => { legacy = false; return true } } : null } }
  const serviceWorker = {
    register: async (script, opts) => {
      calls.push({ script, ...opts }); registered = true
      if (options.installing) setTimeout(() => { reg.active = worker; reg.installing = null }, 5)
      return reg
    },
    getRegistration: async path => path === '/notifications/' ? (registered ? reg : oldReg) : oldReg,
    getRegistrations: async () => registered ? [reg, oldReg] : [oldReg],
  }
  const Notification = { get permission() { return permission }, requestPermission() { calls.push('permission'); permission = options.deny ? 'denied' : 'granted'; return Promise.resolve(permission) } }
  let fetchFailures = options.fetchFailures || 0
  const fetch = async (_, opts) => {
    calls.push({ method: opts.method, body: opts.body })
    if (fetchFailures-- > 0) throw Object.assign(new Error('Fetch is aborted'), { name: 'AbortError' })
    if (options.postFails && opts.method === 'POST') return Response.json({ error: 'Try again shortly' }, { status: 400 })
    return Response.json(opts.method === 'GET' ? { ready: true, publicKey: Buffer.alloc(65, 1).toString('base64url'), userId: 'officer' } : { ok: true, userId: 'officer' })
  }
  const window = { isSecureContext: true, Notification, PushManager: function () {}, dispatchEvent: event => events.push(event.type), matchMedia: () => ({ matches: false }) }
  const navigator = { serviceWorker, userAgent: options.userAgent || 'Mozilla/5.0 (Windows NT 10.0) Chrome/130', maxTouchPoints: 0, standalone: options.standalone }
  const mod = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/device-push.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    module: mod, exports: mod.exports, window, navigator, Notification, caches, fetch, document: { visibilityState: 'visible' },
    localStorage: { getItem: key => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 20)), clearTimeout, AbortController, Response, Uint8Array, URL, Event, atob,
  })
  return { api: mod.exports, calls, notifications, data, storage, events, get legacy() { return legacy } }
}

test('Enable asks permission inside the tap, enrols, marks the account and stays connected across reloads', async () => {
  const d = device()
  const setup = d.api.enableDevicePush()
  assert.equal(d.calls[0], 'permission', 'browser permission must be requested synchronously within the tap')
  await setup
  const registration = d.calls.find(call => call.script)
  assert.equal(registration.script, '/notification-worker.js')
  assert.equal(registration.scope, '/notifications/')
  assert.equal(d.data.get('/__tcnp_push_owner__'), 'officer')
  assert.equal(await d.api.devicePushConnected(), true)
  assert.ok(d.events.includes('tcnp-push-change'))
  // Connected state is persisted, not held in memory.
  assert.match(d.storage.get('tcnp-device-push-state'), /fcm\.googleapis\.com\/new/)
  await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(d.legacy, false, 'old root-worker subscription is retired')
  await d.api.sendDeviceNotificationTest()
  assert.equal(d.notifications[0].title, 'TCNP notifications are on')
  await d.api.disconnectDevicePush()
  assert.equal(await d.api.devicePushConnected(), false)
  assert.equal(d.data.has('/__tcnp_push_owner__'), false)
  assert.equal(d.api.pushDisabled(), true)
})

test('an aborted or dropped request is retried instead of showing "Fetch is aborted"', async () => {
  const d = device({ fetchFailures: 2 })
  await d.api.enableDevicePush()
  assert.equal(await d.api.devicePushConnected(), true)
})

test('a flaky push service registration is retried once', async () => {
  const d = device({ subscribeFailures: 1 })
  await d.api.enableDevicePush()
  assert.equal(d.calls.filter(call => call === 'subscribe').length, 2)
  assert.equal(await d.api.devicePushConnected(), true)
})

test('first-time installation waits for the worker to activate', async () => {
  const d = device({ installing: true })
  await d.api.enableDevicePush()
  assert.equal(await d.api.devicePushConnected(), true)
})

test('permission refusal is actionable and does not register a worker or claim enabled', async () => {
  const d = device({ deny: true })
  await assert.rejects(d.api.enableDevicePush(), /blocked/)
  assert.equal(d.calls.some(call => call.script), false)
  assert.equal(await d.api.devicePushConnected(), false)
})

test('iPhone Safari outside the Home Screen app gets install guidance, not a failure', async () => {
  const d = device({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Safari/604.1' })
  assert.equal(d.api.pushSupport(), 'ios-install')
  await assert.rejects(d.api.enableDevicePush(), /Add to Home Screen/)
  assert.equal(d.calls.includes('permission'), false)
  const installed = device({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)', standalone: true })
  assert.equal(installed.api.pushSupport(), 'supported')
})

test('server rejection never produces a connected marker', async () => {
  const d = device({ postFails: true })
  await assert.rejects(d.api.enableDevicePush(), /Try again shortly/)
  assert.equal(d.data.has('/__tcnp_push_owner__'), false)
  assert.equal(await d.api.devicePushConnected(), false)
})

test('blocked site storage does not stop a device from enrolling', async () => {
  const d = device({ storageBlocked: true })
  await d.api.enableDevicePush()
  assert.equal(await d.api.devicePushConnected(), true)
})

test('a stalled push service fails with a clear message and can be retried', async () => {
  const d = device({ subscribeNever: true })
  await assert.rejects(d.api.enableDevicePush(), /Could not reach the device notification service/)
  assert.equal(await d.api.devicePushConnected(), false)
})

test('logout during setup cancels enrolment', async () => {
  const d = device({ installing: true })
  const connecting = d.api.enableDevicePush()
  await d.api.disconnectDevicePush(false)
  await assert.rejects(connecting, /cancelled/)
  assert.equal(d.data.has('/__tcnp_push_owner__'), false)
  assert.equal(await d.api.devicePushConnected(), false)
})

test('an already-allowed device re-links silently without a prompt', async () => {
  const d = device({ permission: 'granted' })
  assert.equal(await d.api.resumeDevicePush(), true)
  assert.equal(d.calls.includes('permission'), false)
  assert.equal(await d.api.devicePushConnected(), true)
})
