const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const crypto = require('node:crypto')
const ts = require('typescript')

function load(file, imports = {}, globals = {}) {
  const mod = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, {
    module: mod, exports: mod.exports, require: name => imports[name] ?? require(name), Response, Request, URL, Date, console, ...globals,
  })
  return mod.exports
}
const tokens = load('lib/location-device-token.ts', { 'node:crypto': crypto })

test('device tokens are random, prefixed, and only their hash is kept', () => {
  const a = tokens.newDeviceToken(), b = tokens.newDeviceToken()
  assert.notEqual(a.token, b.token)
  assert.equal(tokens.validDeviceToken(a.token), true)
  assert.match(a.hash, /^[0-9a-f]{64}$/)
  assert.equal(a.hash, crypto.createHash('sha256').update(a.token).digest('hex'))
  assert.equal(a.hash.includes(a.token.slice(9)), false)
  for (const bad of ['', 'tcnp_loc_short', 'other_' + 'a'.repeat(43), a.token + ' ', null]) assert.equal(tokens.validDeviceToken(bad), false, String(bad))
  for (const bad of ['short', 'has space in it!', '../../etc/passwd', 'x'.repeat(65), 12345678]) assert.equal(tokens.validDeviceId(bad), false, String(bad))
  assert.equal(tokens.validDeviceId('a94c4005-ae30-4f03-accf-095e100f31ea'), true)
})

test('a position from the phone is cleaned before it reaches the database', () => {
  const fix = tokens.parseDeviceFix({ latitude: 6.48914, longitude: 3.36351, accuracy: 7, heading: -1, speed: -1, batteryLevel: 54.6, recordedAt: 1 })
  assert.equal(fix.heading, null, '-1 means unknown on phones'); assert.equal(fix.speed, null); assert.equal(fix.batteryLevel, 55)
  for (const bad of [null, {}, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: 181 }, { latitude: '6.4', longitude: 3 }, { latitude: NaN, longitude: 3 }]) {
    assert.equal(tokens.parseDeviceFix(bad), null, JSON.stringify(bad))
  }
})

function ingestRoute(result) {
  const calls = []
  const route = load('app/api/location/ingest/route.ts', {
    '@/lib/supabase/admin': { createAdminClient: () => ({ rpc: async (name, args) => { calls.push([name, args]); return typeof result === 'function' ? result() : result } }) },
    '@/lib/security/rate-limit': { rateLimit: () => ({ success: true }) },
    '@/lib/location-device-token': tokens,
  })
  const send = (token, body) => route.POST(new Request('https://tcnp.example/api/location/ingest', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
  }))
  return { send, calls }
}
const position = { latitude: 6.5, longitude: 3.3, accuracy: 5, speed: 2, batteryLevel: 80, recordedAt: Date.now() }

test('the upload address needs a device token and tells the app when to stop', async () => {
  const { token, hash } = tokens.newDeviceToken()
  let r = ingestRoute({ data: 'ok' })
  let response = await r.send(null, position)
  assert.equal(response.status, 401); assert.equal((await response.json()).stop, true); assert.equal(r.calls.length, 0)

  response = await r.send(token, position)
  assert.equal(response.status, 200)
  assert.equal(r.calls[0][0], 'ingest_device_location')
  assert.equal(r.calls[0][1].p_token_hash, hash, 'the database is given the hash, never the token')
  assert.equal(JSON.stringify(r.calls[0][1]).includes(token), false)
  assert.equal(r.calls[0][1].p_battery_level, 80)

  response = await r.send(token, { latitude: 999, longitude: 3 })
  assert.equal(response.status, 400)

  // A position held back by a dead signal is dropped, not shown as current.
  response = await r.send(token, { ...position, recordedAt: Date.now() - 11 * 60 * 1000 })
  assert.equal(response.status, 200); assert.equal((await response.json()).ignored, 'stale'); assert.equal(r.calls.length, 1)

  r = ingestRoute({ data: 'invalid' }); response = await r.send(token, position)
  assert.equal(response.status, 401); assert.equal((await response.json()).stop, true)
  r = ingestRoute({ data: 'sharing_off' }); response = await r.send(token, position)
  assert.equal(response.status, 409); assert.equal((await response.json()).stop, true)
  r = ingestRoute({ error: { message: 'down' } }); response = await r.send(token, position)
  assert.equal(response.status, 503); assert.equal((await response.json()).stop, undefined, 'a server fault must not end tracking')
})

test('only the signed-in officer, from TCNP itself, can connect or disconnect a device', async () => {
  const calls = []
  let user = { id: 'officer-1' }
  const route = load('app/api/location/device-token/route.ts', {
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user }, error: user ? null : { message: 'none' } }) } }) },
    '@/lib/supabase/admin': { createAdminClient: () => ({ rpc: async (name, args) => { calls.push([name, args]); return { data: 1, error: null } } }) },
    '@/lib/security/rate-limit': { checkRateLimit: async () => ({ success: true }) },
    '@/lib/location-device-token': tokens,
  })
  const call = (method, body, origin = 'https://tcnp.example') => route[method](new Request('https://tcnp.example/api/location/device-token', { method, headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
  const device = { deviceId: 'a94c4005-ae30-4f03-accf-095e100f31ea', platform: 'android' }

  assert.equal((await call('POST', device, 'https://attacker.example')).status, 403)
  assert.equal((await call('POST', { deviceId: 'x' })).status, 400)
  const issued = await call('POST', { ...device, userId: 'someone-else' })
  assert.equal(issued.status, 200)
  const { token } = await issued.json()
  assert.equal(tokens.validDeviceToken(token), true)
  assert.equal(calls[0][0], 'issue_location_device_token')
  assert.equal(calls[0][1].p_user_id, 'officer-1', 'the officer comes from the session, never the request body')
  assert.equal(calls[0][1].p_token_hash, tokens.hashDeviceToken(token))
  assert.equal((await call('DELETE', device)).status, 200)
  assert.equal(calls[1][0], 'revoke_location_device_tokens'); assert.equal(calls[1][1].p_device_id, device.deviceId)
  user = null
  assert.equal((await call('POST', device)).status, 401)
})

/** The web side of the bridge, with a simulated native app answering it. */
function shell({ native = true, running = false, permission = 'always' } = {}) {
  const sent = [], events = [], fetches = []
  const state = { running, permission, lastSentAt: null, deviceId: 'a94c4005-ae30-4f03-accf-095e100f31ea', platform: 'android' }
  const listeners = new Map()
  const window = {
    location: { origin: 'https://tcnp.example' },
    addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type),
    dispatchEvent: event => { events.push(event); listeners.get(event.type)?.(event) },
  }
  if (native) window.ReactNativeWebView = { postMessage(raw) {
    const message = JSON.parse(raw); sent.push(message)
    const answer = extra => queueMicrotask(() => window.__tcnpNativeReceive(JSON.stringify({ id: message.id, ...extra })))
    if (message.type === 'location:status') answer({ status: { ...state } })
    if (message.type === 'location:request-permission') answer({ permission: state.permission })
    if (message.type === 'location:start') { state.running = true; state.token = message.token; answer({ status: { ...state } }) }
    if (message.type === 'location:stop') state.running = false
  } }
  const bridge = load('lib/native-shell.ts', {}, {
    window, setTimeout, clearTimeout, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail } },
    fetch: async (url, options) => { fetches.push({ url, ...options }); return Response.json(options.method === 'POST' ? { token: 'tcnp_loc_' + 'a'.repeat(43) } : { ok: true }) },
  })
  return { bridge, sent, events, fetches, state, window }
}

test('in an ordinary browser or Home Screen app the bridge does nothing', async () => {
  const s = shell({ native: false })
  assert.equal(s.bridge.isNativeShell(), false)
  s.bridge.postToNative({ type: 'location:stop' })
  await s.bridge.stopNativeTracking()
  await assert.rejects(s.bridge.ensureNativeTracking(), /Not running inside the TCNP app/)
  assert.equal(s.fetches.length, 0)
})

test('inside the app, starting gets a device token and hands it to the app; stopping gives it up', async () => {
  const s = shell()
  assert.equal(s.bridge.isNativeShell(), true)
  const status = await s.bridge.ensureNativeTracking()
  assert.equal(status.running, true)
  assert.equal(s.fetches[0].method, 'POST'); assert.equal(JSON.parse(s.fetches[0].body).deviceId, s.state.deviceId)
  const start = s.sent.find(m => m.type === 'location:start')
  assert.equal(start.token, s.state.token)
  assert.equal(start.ingestUrl, 'https://tcnp.example/api/location/ingest')

  // Already running (app reopened): no new token is issued.
  await s.bridge.ensureNativeTracking()
  assert.equal(s.fetches.length, 1)

  await s.bridge.stopNativeTracking()
  assert.equal(s.state.running, false)
  assert.equal(s.fetches[1].method, 'DELETE')
  // Session already gone (expired sign-out): stop the app without a server call.
  await s.bridge.stopNativeTracking({ revoke: false })
  assert.equal(s.fetches.length, 2)
})

test('status pushed by the app reaches the screen, and unknown messages are ignored', () => {
  const s = shell()
  const seen = []
  const stop = s.bridge.subscribeToNativeLocation(status => seen.push(status))
  s.window.__tcnpNativeReceive({ type: 'location:status', status: { running: true, lastSentAt: 5 } })
  s.window.__tcnpNativeReceive('not json'); s.window.__tcnpNativeReceive({ type: 'something-else' }); s.window.__tcnpNativeReceive(null)
  assert.deepEqual(seen, [{ running: true, lastSentAt: 5 }])
  stop()
})

test('the Home Screen app keeps its own tracker; only the native app swaps it', () => {
  const layout = fs.readFileSync('app/(dashboard)/layout.tsx', 'utf8')
  assert.match(layout, /const nativeShell = isClient && isNativeShell\(\)/)
  assert.match(layout, /\{nativeShell \? <NativeLocationTracker \/> : <LocationTracker \/>\}/)
  assert.match(layout, /canMountTracker && !insideApp && <ErrorBoundary><NotificationPermissionBanner \/>/)
  const toggle = fs.readFileSync('lib/location-toggle.ts', 'utf8')
  assert.match(toggle, /if \(isNativeShell\(\)\) \{[\s\S]*?requestNativeLocationPermission\(\)[\s\S]*?return\s*\}\s*if \(typeof navigator === 'undefined' \|\| !navigator\.geolocation\)/, 'the browser path is untouched after the native branch')
  assert.match(fs.readFileSync('components/layout/header.tsx', 'utf8'), /stopNativeTracking\(\)\)\.catch\(\(\) => undefined\)\s*await supabase\.auth\.signOut\(\)/)
  assert.match(fs.readFileSync('tsconfig.json', 'utf8'), /"mobile"/)
  assert.match(fs.readFileSync('.vercelignore', 'utf8'), /^mobile$/m)
})
