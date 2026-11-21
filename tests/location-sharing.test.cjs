const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function compile(path, globals) {
  const loaded = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { module: loaded, exports: loaded.exports, ...globals })
  return loaded.exports
}

function preference(initial = 'on', storageBlocked = false) {
  const values = new Map([['tcnp-location-sharing', initial]])
  const events = new Map()
  const window = {
    location: { protocol: 'https:', hostname: 'example.test' },
    localStorage: {
      getItem: key => { if (storageBlocked) throw Error('Unavailable'); return values.get(key) ?? null },
      setItem: (key, value) => { if (storageBlocked) throw Error('Unavailable'); values.set(key, value) },
      removeItem: key => { if (storageBlocked) throw Error('Unavailable'); values.delete(key) },
    },
    addEventListener: (type, callback) => events.set(type, callback),
    removeEventListener: type => events.delete(type),
  }
  return { store: compile('lib/location-sharing.ts', { window }), window, values, events }
}

test('location sharing is safe during server rendering', () => {
  const store = compile('lib/location-sharing.ts', {})
  assert.equal(store.isLocationSharingEnabled(), false)
  assert.doesNotThrow(() => store.setLocationSharingEnabled(true))
})

test('fresh signups and unavailable storage default to location off without an opt-in', () => {
  for (const initial of [null, '', 'invalid']) assert.equal(preference(initial).store.isLocationSharingEnabled(), false)
  assert.equal(preference(null, true).store.isLocationSharingEnabled(), false)
  const p = preference('on')
  p.store.subscribeToLocationSharing(() => {})
  p.events.get('storage')({ key: null, newValue: null })
  assert.equal(p.store.isLocationSharingEnabled(), false)
})

function toggleDevice(config = {}) {
  const p = preference('off')
  const requests = [], errors = [], readyEvents = []
  const serverRequests = []
  let serverEnabled = false, failServer = false
  let releaseOn
  p.window.dispatchEvent = event => readyEvents.push(event.type)
  const navigator = { geolocation: { getCurrentPosition: (success, error) => requests.push({ success, error }) } }
  const toggleModule = compile('lib/location-toggle.ts', {
    window: p.window, navigator, Event: class { constructor(type) { this.type = type } },
    AbortSignal,
    fetch: async (_, options) => {
      serverRequests.push(options)
      if (failServer) throw Error('Offline')
      if (options.method === 'POST' && JSON.parse(options.body).enabled === true && config.holdOn) await new Promise(resolve => { releaseOn = resolve })
      if (options.method === 'POST') serverEnabled = JSON.parse(options.body).enabled
      return { ok: true, json: async () => ({ enabled: serverEnabled, userId: 'officer' }) }
    },
    require: name => { assert.equal(name, '@/lib/location-sharing'); return p.store },
  })
  toggleModule.setLocationSharingUser('officer')
  return { ...p, requests, errors, readyEvents, serverRequests, toggleModule, setOffline: value => { failServer = value }, releaseOn: () => releaseOn?.(), serverEnabled: () => serverEnabled, toggle: value => toggleModule.toggleLocationSharing(value, message => errors.push(message)) }
}

test('the profile toggle requests GPS synchronously on opt-in and stays off after denial', async () => {
  const p = toggleDevice()
  assert.equal(p.requests.length, 0)
  p.toggle(true)
  assert.equal(p.requests.length, 1)
  assert.equal(p.store.isLocationSharingEnabled(), false)
  assert.equal(p.toggleModule.getLocationSharingStatus().pending, true)
  p.requests[0].error({ code: 1 })
  await settle()
  assert.equal(p.store.isLocationSharingEnabled(), false)
  assert.match(p.errors[0], /blocked/)
})

test('a successful toggle wakes the tracker, but delayed results cannot undo off or a newer opt-in', async () => {
  const p = toggleDevice()
  p.toggle(true)
  p.requests[0].success({})
  await settle()
  assert.deepEqual(p.readyEvents, ['tcnp-location-ready'])
  p.toggle(false)
  assert.equal(p.store.isLocationSharingEnabled(), false)
  p.toggle(true)
  p.requests[0].error({ code: 1 })
  assert.equal(p.store.isLocationSharingEnabled(), false)
  assert.equal(p.toggleModule.getLocationSharingStatus().requested, true)
  p.toggle(false)
  p.requests[1].success({})
  await settle()
  assert.equal(p.store.isLocationSharingEnabled(), false)
  assert.equal(p.readyEvents.length, 1)
})

test('off unpublishes on the server and retries a failed privacy change after reconnect', async () => {
  const p = toggleDevice()
  p.toggle(true); p.requests[0].success({}); await settle()
  assert.equal(p.serverEnabled(), true)
  p.setOffline(true)
  p.toggle(false)
  assert.equal(p.store.isLocationSharingEnabled(), false)
  await settle()
  assert.match(p.toggleModule.getLocationSharingStatus().error, /could not be removed/)
  assert.equal(p.values.get('tcnp-location-unpublish-pending'), 'officer')
  p.setOffline(false)
  await p.toggleModule.refreshLocationSharing()
  assert.equal(p.serverEnabled(), false)
  assert.equal(p.toggleModule.getLocationSharingStatus().error, null)
  assert.equal(p.values.has('tcnp-location-unpublish-pending'), false)
})

test('off wins over an already-running enable request and never starts its delayed GPS watcher', async () => {
  const p = toggleDevice({ holdOn: true })
  p.toggle(true); p.requests[0].success({}); await settle()
  assert.equal(p.serverRequests.length, 1)
  p.toggle(false)
  assert.equal(p.store.isLocationSharingEnabled(), false)
  p.releaseOn()
  await settle()
  assert.equal(p.serverEnabled(), false)
  assert.deepEqual(p.serverRequests.filter(request => request.method === 'POST').map(request => JSON.parse(request.body).enabled), [true, false])
  assert.equal(p.readyEvents.length, 0)
})

test('a server opt-out stops another device locally without silently enabling it again', async () => {
  const p = toggleDevice()
  p.toggle(true); p.requests[0].success({}); await settle()
  p.store.setLocationSharingEnabled(false)
  p.toggle(false); await settle()
  p.store.setLocationSharingEnabled(true)
  await p.toggleModule.refreshLocationSharing()
  assert.equal(p.store.isLocationSharingEnabled(), false)
  assert.equal(p.serverEnabled(), false)
})

test('a phone whose account shares but whose own switch is off is told, never silently enabled', async () => {
  // A reinstalled iPhone Home Screen app gets fresh storage: the account still
  // says "share", this phone says off. The map would show a frozen pin.
  const p = toggleDevice()
  p.toggle(true); p.requests[0].success({}); await settle()
  assert.equal(p.toggleModule.getServerSharing(), true)
  p.store.setLocationSharingEnabled(false)
  const seen = []
  p.toggleModule.subscribeToServerSharing(() => seen.push(p.toggleModule.getServerSharing()))
  await p.toggleModule.refreshLocationSharing()
  assert.equal(p.toggleModule.getServerSharing(), true, 'the mismatch is visible to the resume prompt')
  assert.equal(p.store.isLocationSharingEnabled(), false, 'but the phone is not opted in without a tap')
  p.toggle(false); await settle()
  assert.equal(p.toggleModule.getServerSharing(), false)
  assert.deepEqual(seen, [false])
  p.toggleModule.setLocationSharingUser('another-officer')
  assert.equal(p.toggleModule.getServerSharing(), null, 'a new sign-in forgets the previous account')
})

test('a rejected upload makes the phone re-check sharing instead of failing silently', () => {
  const upload = fs.readFileSync('lib/location-upload.ts', 'utf8')
  assert.match(upload, /window\.dispatchEvent\(new Event\('tcnp-location-rejected'\)\)/)
  const sync = fs.readFileSync('components/tracking/LocationSharingSync.tsx', 'utf8')
  assert.match(sync, /addEventListener\('tcnp-location-rejected', sync\)/)
  assert.match(sync, /removeEventListener\('tcnp-location-rejected', sync\)/)
})

test('a saved opt-out survives reloads and synchronizes subscribers', () => {
  const p = preference('off')
  assert.equal(p.store.isLocationSharingEnabled(), false)
  let notifications = 0
  const unsubscribe = p.store.subscribeToLocationSharing(() => notifications++)
  p.store.setLocationSharingEnabled(true)
  assert.equal(p.values.get('tcnp-location-sharing'), 'on')
  assert.equal(notifications, 1)
  p.events.get('storage')({ key: 'tcnp-location-sharing', newValue: 'off' })
  assert.equal(p.store.isLocationSharingEnabled(), false)
  assert.equal(notifications, 2)
  unsubscribe()
  assert.equal(p.events.has('storage'), false)
})

test('turning sharing off invalidates old callbacks even after turning it back on', () => {
  const { store } = preference()
  const oldRequest = store.createLocationSharingGuard()
  assert.equal(oldRequest(), true)
  store.setLocationSharingEnabled(false)
  assert.equal(oldRequest(), false)
  store.setLocationSharingEnabled(true)
  assert.equal(oldRequest(), false)
  assert.equal(store.createLocationSharingGuard()(), true)
})

test('the off switch works when local storage is unavailable', () => {
  const { store } = preference('on', true)
  store.setLocationSharingEnabled(false)
  assert.equal(store.isLocationSharingEnabled(), false)
})

test('resubscribing and returning to a background tab refreshes a changed device preference', () => {
  const p = preference('on')
  assert.equal(p.store.isLocationSharingEnabled(), true)
  const unsubscribe = p.store.subscribeToLocationSharing(() => {})
  unsubscribe()
  p.values.set('tcnp-location-sharing', 'off')
  let notified = 0
  const stop = p.store.subscribeToLocationSharing(() => notified++)
  assert.equal(p.store.isLocationSharingEnabled(), false)
  p.values.set('tcnp-location-sharing', 'on')
  p.events.get('focus')()
  assert.equal(p.store.isLocationSharingEnabled(), true)
  assert.equal(notified, 1)
  stop()
  assert.equal(p.events.has('focus'), false)
})

const position = { coords: { latitude: 6.5, longitude: 3.4, accuracy: 10 }, timestamp: 1 }
async function settle() { for (let i = 0; i < 15; i++) await Promise.resolve() }

test('the dashboard tracker clears its actual GPS watch and rejects late uploads when switched off', async () => {
  const p = preference('on')
  p.window.setInterval = () => 0; p.window.clearInterval = () => {}
  const slots = [], pending = [], requests = [], writes = [], cleared = []
  const watches = new Map()
  let cursor = 0
  const react = {
    useState(value) { const i = cursor++; if (!(i in slots)) slots[i] = value; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next }] },
    useRef(value) { const i = cursor++; if (!(i in slots)) slots[i] = { current: value }; return slots[i] },
    useEffect(effect, deps) { const i = cursor++; if (!slots[i] || deps.some((v, n) => v !== slots[i].deps[n])) pending.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: effect() } }) },
  }
  const navigator = { userAgent: 'iPhone', platform: 'iPhone', geolocation: {
    getCurrentPosition: (success, error) => requests.push({ success, error }),
    watchPosition: (success, error) => { watches.set(1, { success, error }); return 1 },
    clearWatch: id => { cleared.push(id); watches.delete(id) },
  } }
  const { LocationTracker } = compile('components/tracking/LocationTracker.tsx', {
    window: p.window, navigator, console: { log() {}, warn() {} }, setTimeout, clearTimeout,
    document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    require(name) {
      if (name === 'react') return react
      if (name === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null }
      if (name === '@/hooks/useIsClient') return { useIsClient: () => true }
      if (name === '@/lib/location-sharing') return p.store
      if (name === '@/lib/supabase/client') return { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'officer' } } }) }, rpc: async (...args) => { writes.push(args); return {} } }) }
      if (name === '@/lib/location-upload') return { publishLocation: (userId, fix) => writes.push(['upsert_user_location', { p_user_id: userId, ...fix }]) }
      if (name === 'sonner') return { toast: Object.assign(() => {}, { error() {} }) }
      if (name === '@/lib/keep-awake') return { createKeepAwake: () => ({ enable() {}, disable() {}, isHeld: () => false }) }
      if (name === '@/components/tracking/PocketModeScreen') return { PocketModeScreen: () => null }
      throw Error(`Unexpected import ${name}`)
    },
  })
  LocationTracker()
  pending.splice(0).forEach(fn => fn())
  await settle()
  assert.equal(requests.length, 1)
  requests[0].success(position)
  await settle()
  assert.equal(watches.size, 1)
  const late = watches.get(1).success
  const writesBefore = writes.length
  p.store.setLocationSharingEnabled(false)
  // Dashboard unmounts this component when the dropdown switch goes off.
  slots.forEach(slot => slot?.cleanup?.())
  assert.equal(watches.size, 0)
  assert.deepEqual(cleared, [1])
  await late(position)
  await settle()
  assert.equal(writes.length, writesBefore)
})
