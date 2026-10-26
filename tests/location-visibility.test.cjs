const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), ts = require('typescript')
function load(file, imports, globals = {}) {
 const mod = { exports: {} }
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, { module: mod, exports: mod.exports, require: name => imports[name] || require(name), Response, URL, console, ...globals })
 return mod.exports
}
test('cached and delayed map rows cannot expose the opted-out officer or an unknown viewer', () => {
 const { visibleSharedLocations: visible } = load('lib/location-visibility.ts', {})
 const rows = [{ user_id: 'self' }, { user_id: 'other' }]
 assert.deepEqual(Array.from(visible(rows, 'self', false)), [rows[1]])
 assert.deepEqual(Array.from(visible(rows, 'self', true)), rows)
 assert.equal(visible(rows, undefined, false).length, 0)
})
test('location privacy API requires authentication, same origin and the current account; off bypasses the enable rate limit', async () => {
 let user = { id: 'self' }, enabled = true
 const calls = []
 const route = load('app/api/location-sharing/route.ts', {
  '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) }, rpc: async (name, args) => { calls.push({ name, args }); if (name === 'set_location_sharing') enabled = args.sharing_enabled; return { data: enabled } } }) },
  '@/lib/security/rate-limit': { checkRateLimit: async () => ({ success: false }) },
 })
 const req = (body, origin = 'https://tcnp.example') => new Request('https://tcnp.example/api/location-sharing', { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
 assert.equal((await route.POST(req({ enabled: false }, 'https://attacker.example'))).status, 403)
 assert.equal((await route.POST(req({ enabled: false, userId: 'victim' }))).status, 409)
 assert.equal((await route.POST(req({ enabled: 'false' }))).status, 400)
 assert.equal(calls.length, 0)
 assert.equal((await route.POST(req({ enabled: true, userId: 'self' }))).status, 429)
 const result = await route.POST(req({ enabled: false, userId: 'self' }))
 assert.equal(result.status, 200)
 assert.deepEqual(await result.json(), { enabled: false, userId: 'self' })
 assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))), { name: 'set_location_sharing', args: { sharing_enabled: false } })
 assert.equal((await route.GET()).headers.get('cache-control'), 'private, no-store')
 user = null
 assert.equal((await route.POST(req({ enabled: false }))).status, 401)
 assert.equal((await route.GET()).status, 401)
})

let JSDOM
try { ({ JSDOM } = require(process.env.FORM_DOM_RUNTIME || path.resolve('.next/form-ui-qa/node_modules/jsdom'))) } catch {}
test('actual Live Tracking removes the self marker immediately and cannot restore it from an older map request', { skip: !JSDOM }, async t => {
 const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://tcnp.example', pretendToBeVisual: true })
 const previous = new Map()
 for (const name of ['window','document','navigator','HTMLElement','IS_REACT_ACT_ENVIRONMENT']) {
  previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'window' ? dom.window : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] })
 }
 const React = require('react'), { act } = React, { createRoot } = require('react-dom/client')
 const root = createRoot(document.getElementById('root'))
 const cache = new Map(), callbacks = []
 let sharing = true, holdNext = false, staleResolve
 const row = user_id => ({ user_id, full_name: user_id === 'self' ? 'Self Officer' : 'Peer Officer', role: 'delta_oscar', oscar: 'Delta', latitude: 6.5, longitude: 3.4, accuracy: 10, updated_at: new Date().toISOString() })
 const original = [row('self'), row('peer')]
 let serverRows = original
 const db = {
  rpc: async () => { if (holdNext) { holdNext = false; const snapshot = [...serverRows]; return new Promise(resolve => { staleResolve = () => resolve({ data: snapshot }) }) } return { data: [...serverRows] } },
  from: () => ({ select: () => ({ not: async () => ({ data: [] }), order: async () => ({ data: [] }) }) }),
  channel: () => ({ on(_, filter, callback) { if (filter.table === 'user_locations') callbacks.push(callback); return this }, subscribe() { return this } }), removeChannel: async () => {},
 }
 const primitive = tag => ({ children, ...props }) => React.createElement(tag, props, children)
 const render = () => root.render(React.createElement(LiveTrackingMap))
 const imports = {
  '@/lib/supabase/client': { createClient: () => db },
  '@/hooks/useCurrentUser': { useCurrentUser: () => ({ data: { id: 'self' } }) },
  '@/hooks/useLocationSharing': { useLocationSharing: () => ({ enabled: sharing, checked: sharing, pending: false, error: null, setEnabled(value) { sharing = value; serverRows = value ? serverRows : [original[1]]; render() } }) },
  '@/hooks/useLocationTracking': { useLocationTracking: () => ({ permissionStatus: 'granted', isTracking: sharing }) },
  '@/lib/location-sharing': { isLocationSharingEnabled: () => sharing },
  '@/lib/location-visibility': load('lib/location-visibility.ts', {}),
  '@/lib/utils': { cn: require('clsx').clsx },
  '@/components/ErrorBoundary': { ErrorBoundary: ({ children }) => children },
  '@/components/ui/switch': { Switch: ({ checked, onCheckedChange, ...props }) => React.createElement('button', { ...props, type: 'button', role: 'switch', 'aria-checked': checked, onClick: () => onCheckedChange(!checked) }) },
  '@/components/ui/select': { Select: ({ children }) => React.createElement('div', null, children), SelectTrigger: primitive('button'), SelectValue: ({ placeholder }) => React.createElement('span', null, placeholder), SelectContent: primitive('div'), SelectItem: ({ children }) => React.createElement('span', null, children) },
  'next/dynamic': { __esModule: true, default: () => ({ locations }) => React.createElement('div', { id: 'map-markers' }, locations.map(location => React.createElement('span', { key: location.user_id, 'data-marker-user': location.user_id }, location.full_name))) },
  'leaflet/dist/leaflet.css': {}, 'sonner': { toast: { success() {}, error() {} } },
 }
 function component(file) {
  if (!cache.has(file)) cache.set(file, load(file, new Proxy(imports, { get(target, name) {
   if (name in target) return target[name]
   if (typeof name === 'string' && name.startsWith('@/components/ui/')) return component(name.replace('@/', '') + '.tsx')
   if (name === '@/lib/constants/call-signs') return component('lib/constants/call-signs.ts')
  } }), { window: dom.window, document, navigator: dom.window.navigator, setInterval, clearInterval, fetch: async () => ({ ok: true, json: async () => ({ available: false }) }) }))
  return cache.get(file)
 }
 const LiveTrackingMap = component('components/tracking/LiveTrackingMap.tsx').default
 t.after(async () => { await act(async () => root.unmount()); dom.window.close(); for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name] } })
 await act(async () => render())
 assert.ok(document.querySelector('[data-marker-user="self"]'))
 assert.ok(document.querySelector('[data-marker-user="peer"]'))
 holdNext = true
 await act(async () => document.querySelector('button[aria-label="Refresh map"]').click())
 assert.equal(typeof staleResolve, 'function')
 await act(async () => document.getElementById('map-location-sharing').click())
 assert.equal(document.querySelector('[data-marker-user="self"]'), null)
 assert.ok(document.querySelector('[data-marker-user="peer"]'))
 await act(async () => staleResolve())
 assert.equal(document.querySelector('[data-marker-user="self"]'), null)
 await act(async () => document.getElementById('map-location-sharing').click())
 assert.equal(document.querySelector('[data-marker-user="self"]'), null, 're-enabling must not resurrect a cached last-known position')
 serverRows = original
 await act(async () => callbacks[0]())
 assert.ok(document.querySelector('[data-marker-user="self"]'), 'a fresh published fix can appear after enabling')
})
