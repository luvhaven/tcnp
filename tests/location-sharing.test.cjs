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

function tracker(initial = 'on') {
  const p = preference(initial)
  const slots = []
  let cursor = 0
  let pendingEffects = []
  const requests = []
  const watches = new Map()
  const clearedWatches = []
  const timers = new Map()
  const intervals = new Map()
  const writes = []
  let nextId = 1
  let fetchImpl = async () => ({ json: async () => ({ latitude: 6, longitude: 3 }) })
  const react = {
    useState(initialValue) {
      const index = cursor++
      if (!(index in slots)) slots[index] = initialValue
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value }]
    },
    useRef(value) {
      const index = cursor++
      if (!(index in slots)) slots[index] = { current: value }
      return slots[index]
    },
    useCallback(callback) { return callback },
    useEffect(effect, deps) {
      const index = cursor++
      const old = slots[index]
      if (!old || deps.some((value, i) => value !== old.deps[i])) {
        pendingEffects.push(() => {
          old?.cleanup?.()
          slots[index] = { deps, cleanup: effect() }
        })
      }
    },
  }
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'officer' } } }) },
    rpc: async (...args) => { writes.push(args); return {} },
  }
  const navigator = {
    userAgent: 'desktop', platform: 'test',
    geolocation: {
      getCurrentPosition: (success, error) => requests.push({ success, error }),
      watchPosition: (success, error) => { const id = nextId++; watches.set(id, { success, error }); return id },
      clearWatch: id => { clearedWatches.push(id); watches.delete(id) },
    },
  }
  const toast = Object.assign(() => {}, { warning() {}, error() {} })
  const { useLocationTracking } = compile('hooks/useLocationTracking.ts', {
    window: p.window, navigator, console: { log() {}, warn() {}, error() {} },
    fetch: (...args) => fetchImpl(...args),
    setTimeout: callback => { const id = nextId++; timers.set(id, callback); return id },
    clearTimeout: id => timers.delete(id),
    setInterval: callback => { const id = nextId++; intervals.set(id, callback); return id },
    clearInterval: id => intervals.delete(id),
    require(name) {
      if (name === 'react') return react
      if (name === '@/lib/location-sharing') return p.store
      if (name === '@/hooks/useLocationSharing') return { useLocationSharing: () => ({ enabled: p.store.isLocationSharingEnabled() }) }
      if (name === '@/lib/supabase/client') return { createClient: () => supabase }
      if (name === '@/lib/utils/devLogger') return { devLog: { warn() {} } }
      if (name === 'sonner') return { toast }
      throw Error(`Unexpected import ${name}`)
    },
  })
  function render() {
    cursor = 0
    const api = useLocationTracking()
    const effects = pendingEffects
    pendingEffects = []
    effects.forEach(effect => effect())
    return api
  }
  return { ...p, render, requests, watches, clearedWatches, timers, intervals, writes, setFetch: value => { fetchImpl = value } }
}

const position = { coords: { latitude: 6.5, longitude: 3.4, accuracy: 10 }, timestamp: 1 }
async function settle() { for (let i = 0; i < 15; i++) await Promise.resolve() }

test('a saved opt-out prevents automatic and explicit location requests', async () => {
  const t = tracker('off')
  const api = t.render()
  await api.startTracking()
  assert.equal(await api.requestPermission(), false)
  assert.equal(t.timers.size, 0)
  assert.equal(t.requests.length, 0)
  assert.equal(t.watches.size, 0)
  assert.equal(t.writes.length, 0)
})

test('a new device never starts a GPS request, watch or upload before opting in', async () => {
  const t = tracker(null)
  t.render()
  await settle()
  assert.equal(t.requests.length, 0)
  assert.equal(t.watches.size, 0)
  assert.equal(t.timers.size, 0)
  assert.equal(t.writes.length, 0)
})

test('the dashboard tracker clears its actual GPS watch and rejects late uploads when switched off', async () => {
  const p = preference('on')
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
      if (name === 'sonner') return { toast: Object.assign(() => {}, { error() {} }) }
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

test('pausing active sharing clears GPS watches and periodic updates and ignores late positions', async () => {
  const t = tracker()
  const api = t.render()
  const starting = api.startTracking()
  t.requests[0].success(position)
  await starting
  await settle()
  const oldWatch = [...t.watches.values()][0]
  assert.equal(t.watches.size, 1)
  assert.equal(t.intervals.size, 1)
  const writesBeforePause = t.writes.length
  t.store.setLocationSharingEnabled(false)
  t.render()
  assert.equal(t.watches.size, 0)
  assert.equal(t.clearedWatches.length, 1)
  assert.equal(t.intervals.size, 0)
  assert.equal(t.timers.size, 0)
  oldWatch.success(position)
  await settle()
  assert.equal(t.writes.length, writesBeforePause)
  assert.equal(t.render().isTracking, false)
  assert.equal(t.render().location, null)
})

test('a pending GPS result cannot restart sharing after an off/on cycle', async () => {
  const t = tracker()
  const api = t.render()
  const starting = api.startTracking()
  t.store.setLocationSharingEnabled(false)
  t.render()
  t.store.setLocationSharingEnabled(true)
  t.render()
  t.requests[0].success(position)
  await starting
  await settle()
  assert.equal(t.writes.length, 0)
  assert.equal(t.watches.size, 0)
  const fresh = t.render().startTracking()
  t.requests[1].success(position)
  await fresh
  await settle()
  assert.equal(t.watches.size, 1)
  assert.ok(t.writes.length > 0)
})

test('pausing while a network fallback is pending prevents its location upload', async () => {
  const t = tracker()
  let resolveFetch
  t.setFetch(() => new Promise(resolve => { resolveFetch = resolve }))
  const api = t.render()
  const starting = api.startTracking()
  t.requests[0].error({ code: 2, POSITION_UNAVAILABLE: 2, PERMISSION_DENIED: 1 })
  await settle()
  assert.equal(typeof resolveFetch, 'function')
  t.store.setLocationSharingEnabled(false)
  t.render()
  resolveFetch({ json: async () => ({ latitude: 6, longitude: 3 }) })
  await starting
  await settle()
  assert.equal(t.writes.length, 0)
  assert.equal(t.watches.size, 0)
})
