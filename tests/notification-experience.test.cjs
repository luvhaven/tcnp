const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')
function compile(file, imports = {}, globals = {}) {
 const mod = { exports: {} }
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2020 } }).outputText, { module: mod, exports: mod.exports, require: name => imports[name] || require(name), console, ...globals })
 return mod.exports
}
test('push uses device sound and vibration in background, stays silent in foreground, and protects account ownership', async () => {
 const handlers = {}, shown = [], messages = [], navigations = [], closed = []
 let foreground = false, owner = 'officer', failClients = false
 const self = { location: { origin: 'https://tcnp.example' }, addEventListener: (type, fn) => handlers[type] = fn, registration: { showNotification: async (title, options) => shown.push({ title, ...options }) }, clients: {
  matchAll: async () => { if (failClients) throw Error('unavailable'); return [{ url: 'https://tcnp.example/chat', focused: foreground, visibilityState: foreground ? 'visible' : 'hidden', postMessage: value => messages.push(value), navigate: async url => navigations.push(url), focus: async () => {} }] }, openWindow: async url => navigations.push(url),
 } }
 vm.runInNewContext(fs.readFileSync('public/notification-worker.js', 'utf8'), { self, URL, caches: { open: async () => ({ match: async () => owner ? new Response(owner) : undefined }) } })
 const payload = { targetUserId: 'officer', notificationId: 'notice-one', url: '/chat?programId=program', tag: 'notice-one', critical: false }
 async function push(changes = {}) { let pending; handlers.push({ data: { json: () => ({ ...payload, ...changes }) }, waitUntil: work => pending = work }); await pending }
 await push()
 assert.equal(shown[0].silent, false)
 assert.deepEqual(Array.from(shown[0].vibrate), [45,70,90])
 assert.equal(shown[0].requireInteraction, false)
 assert.equal(shown[0].badge, '/notification-badge.png')
 assert.equal(shown[0].data.notificationId, 'notice-one')
 assert.equal(shown[0].body.includes('new update'), true)
 assert.equal(messages.length, 0)
 foreground = true
 await push()
 assert.equal(shown[1].silent, true)
 assert.equal('vibrate' in shown[1], false, 'silent and vibrate cannot be combined')
 assert.equal(messages[0].type, 'TCNP_NOTIFICATION')
 assert.equal(messages[0].notificationId, 'notice-one')
 foreground = false
 await push({ critical: true })
 assert.deepEqual(Array.from(shown[2].vibrate), [200,100,200,100,400])
 owner = 'another-officer'
 await push(); assert.equal(shown.length, 3)
 owner = 'officer'; failClients = true
 await push({ url: 'https://attacker.example/secret' })
 assert.equal(shown[3].data.url, '/dashboard')
 assert.equal(shown[3].silent, false, 'client lookup failure must not prevent background delivery')
 failClients = false
 let pending
 handlers.notificationclick({ notification: { data: shown[0].data, close: () => closed.push(true) }, waitUntil: work => pending = work })
 await pending
 assert.deepEqual(navigations, ['https://tcnp.example/chat?programId=program'])
 assert.equal(closed.length, 1)
})
test('custom tones schedule short composed audio, and mute prevents all their oscillators', () => {
 const tones = [], local = new Map()
 class Context {
  state = 'running'; currentTime = 1; destination = {}
  createOscillator() { const osc = { frequency: {}, connect() {}, start(at) { tones.push({ frequency: osc.frequency.value, at, type: osc.type }) }, stop() {} }; return osc }
  createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} } }
  suspend() { this.state = 'suspended'; return Promise.resolve() }
 }
 const { audioManager: audio } = compile('lib/audio/AudioManager.ts', {}, { window: { AudioContext: Context, addEventListener() {} }, localStorage: { getItem: key => local.get(key), setItem: (key,value) => local.set(key,value) } })
 for (const [tone, count] of [['signature',4],['soft',2],['clear',3]]) {
  tones.length = 0; audio.playChime(`notification_${tone}`)
  assert.equal(tones.length, count)
  assert.ok(tones.every(note => note.frequency > 500 && note.at <= 1.28))
 }
 audio.setMuted(true); tones.length = 0
 audio.playChime('notification_signature'); audio.playChime('notification_soft'); audio.playChime('notification_clear')
 assert.equal(tones.length, 0)
})
let JSDOM
try { ({ JSDOM } = require(process.env.FORM_DOM_RUNTIME || path.resolve('.next/form-ui-qa/node_modules/jsdom'))) } catch {}
test('real notification banner, inbox and feedback controls work together without deleting or duplicating updates', { skip: !JSDOM }, async t => {
 const dom = new JSDOM('<!doctype html><html><body><button id="before">Before</button><div id="root"></div></body></html>', { url: 'https://tcnp.example', pretendToBeVisual: true })
 dom.window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} })
 dom.window.document.hasFocus = () => documentHasFocus
 const previous = new Map()
 for (const name of ['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT']) {
  previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'window' ? dom.window : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] })
 }
 const React = require('react'), { act } = React, { createRoot } = require('react-dom/client')
 let documentHasFocus = true, rows = [], writeError = null, sounds = [], vibrations = [], routes = [], muted = false
 const systemAlerts = []
 const audioListeners = new Set(), toastListeners = new Set(), toasts = new Map(), channels = [], errors = [], workerHandlers = {}
 Object.defineProperty(navigator, 'vibrate', { configurable: true, value: () => true })
 Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { addEventListener: (type, fn) => workerHandlers[type] = fn, removeEventListener: type => delete workerHandlers[type] } })
 const audio = { subscribe: fn => { audioListeners.add(fn); return () => audioListeners.delete(fn) }, getMuted: () => muted, playChime: tone => { if (!muted) sounds.push(tone) }, vibrate: pattern => vibrations.push(pattern) }
 const toast = { custom: (render, options) => { toasts.set(options.id, { render, options }); toastListeners.forEach(fn => fn()); return options.id }, dismiss: id => { toasts.delete(id); toastListeners.forEach(fn => fn()) }, error: message => errors.push(message) }
 const db = { auth: { getUser: async () => ({ data: { user: { id: 'officer' } } }) }, from: () => {
  const filters = {}; let writing = false
  const chain = { select: () => chain, eq: (key,value) => { filters[key] = value; return chain }, order: () => chain, limit: async () => ({ data: rows }), maybeSingle: async () => ({ data: rows.find(row => Object.entries(filters).every(([key,value]) => row[key] === value)) }), update: () => { writing = true; return chain }, then: resolve => resolve({ error: writing ? writeError : null }) }
  return chain
 }, channel: name => { const callbacks = { name }; const channel = { on: (_, filter, fn) => { callbacks[filter.event] = fn; return channel }, subscribe: () => { channels.push(callbacks); return channel } }; return channel }, removeChannel() {} }
 const cache = new Map()
 const motionTags = new Map()
 const motion = new Proxy({}, { get(_, tag) {
  if (!motionTags.has(tag)) motionTags.set(tag, React.forwardRef(({ children, initial, animate, exit, transition, layout, layoutId, ...props }, ref) => React.createElement(tag, { ...props, ref }, children)))
  return motionTags.get(tag)
 } })
 const imports = new Proxy({}, { get(_, name) {
  // jsdom has no layout/animation engine; exercise actual React UI and events.
  if (name === 'framer-motion') return { motion, AnimatePresence: ({ children }) => children }
  if (name === '@/lib/supabase/client') return { createClient: () => db }
  if (name === '@/lib/realtime/topic') return { uniqueTopic: value => value }
  if (name === 'next/navigation') return { useRouter: () => router, usePathname: () => '/chat' }
  if (name === '@/lib/device-push') return { devicePushConnected: async () => false }
  if (name === '@/lib/services/system-notification') return { showSystemNotification: async (title, options) => systemAlerts.push({ title, ...options }) }
  if (name === 'sonner') return { toast }
  if (name === '@/lib/utils') return { cn: require('clsx').clsx }
  if (name === '@/lib/audio/AudioManager') return { audioManager: audio }
  if (name.startsWith('@/')) return load(`${name.slice(2)}${name.includes('notification-presentation') ? '.tsx' : name === '@/hooks/useNotifications' || name === '@/lib/notification-feedback' ? '.ts' : '.tsx'}`)
 } })
 const globals = { URLSearchParams, window: dom.window, document, navigator, localStorage: dom.window.localStorage, Event: dom.window.Event }
 function load(file) { if (!cache.has(file)) cache.set(file, compile(file, imports, globals)); return cache.get(file) }
 const router = { push: url => routes.push(url) }
 const Center = load('components/notifications/NotificationCenter.tsx').default
 const Feedback = load('components/notifications/NotificationFeedbackControl.tsx').NotificationFeedbackControl
 const { presentNotification } = load('lib/notification-presentation.tsx')
 const { useChatNotifications } = load('hooks/useChatNotifications.ts')
 function ChatListener() { useChatNotifications('officer'); return null }
 function BannerHost() {
  React.useSyncExternalStore(fn => { toastListeners.add(fn); return () => toastListeners.delete(fn) }, () => [...toasts.keys()].join(','))
  return [...toasts].map(([id, value]) => React.createElement('div', { key: id }, value.render(id)))
 }
 const root = createRoot(document.getElementById('root'))
 t.after(async () => { await act(async () => root.unmount()); dom.window.close(); for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name] } })
 await act(async () => root.render(React.createElement(React.Fragment, null, React.createElement(Center), React.createElement(Feedback), React.createElement(BannerHost), React.createElement(ChatListener))))
 const button = label => [...document.querySelectorAll('button')].find(node => node.getAttribute('aria-label') === label || node.textContent === label)
 const base = { id: 'notice-one', user_id: 'officer', title: 'Added to Program chat', message: 'You can now join the program.', type: 'chat', metadata: { url: '/chat?programId=program' }, created_at: new Date().toISOString(), is_read: false }
 await t.test('new alert appears at top, sounds once, and hiding its banner retains the unread bell entry', async () => {
  rows = [base]
  document.getElementById('before').focus()
  await act(async () => channels.find(channel => channel.name === 'notifications:officer').INSERT({ new: base }))
  assert.equal(sounds.length, 1); assert.equal(vibrations.length, 1)
  assert.equal(document.activeElement.id, 'before', 'arrival must not steal focus')
  assert.equal(document.querySelectorAll('[data-notification-banner]').length, 1)
  assert.equal([...toasts.values()][0].options.duration, 6500)
  await act(async () => channels.find(channel => channel.name === 'notifications:officer').INSERT({ new: base }))
  assert.equal(sounds.length, 1); assert.equal(toasts.size, 1)
  await act(async () => button('Hide notification banner').click())
  assert.equal(toasts.size, 0)
  await act(async () => button('Notifications (1 unread)').click())
  assert.ok(document.getElementById('notification-panel').textContent.includes(base.title))
  assert.equal(button('Notifications (1 unread)').getAttribute('aria-expanded'), 'true')
 })
 await t.test('failed read writes retain the unread entry; Escape returns keyboard focus to the bell', async () => {
  writeError = Error('offline')
  await act(async () => button('Mark all read').click())
  assert.ok(button('Notifications (1 unread)'))
  assert.ok(errors.includes('Failed to mark notifications as read'))
  await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' })))
  assert.ok(!document.getElementById('notification-panel'))
  assert.equal(document.activeElement.id, 'notification-bell')
 })
 await t.test('tone selection persists and preview respects mute and vibration preferences', async () => {
  const select = document.getElementById('notification-tone')
  await act(async () => { select.value = 'soft'; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })) })
  await act(async () => button('Preview sound').click())
  assert.equal(sounds.at(-1), 'notification_soft')
  assert.equal(JSON.parse(dom.window.localStorage.getItem('tcnp-notification-feedback')).tone, 'soft')
  await act(async () => document.getElementById('notification-vibration').click())
  const before = vibrations.length
  await act(async () => button('Preview sound').click())
  assert.equal(vibrations.length, before)
  await act(async () => { muted = true; audioListeners.forEach(fn => fn()) })
  assert.equal(button('Preview sound').disabled, true)
 })
 await t.test('hidden/unfocused tabs do not play a competing foreground cue or queue stale banners', async () => {
  documentHasFocus = false
  await act(async () => channels.find(channel => channel.name === 'notifications:officer').INSERT({ new: { ...base, id: 'notice-background' } }))
  assert.equal(toasts.size, 0)
  documentHasFocus = true
  await act(async () => presentNotification({ id: 'fresh-click', title: 'Fresh update', message: 'Open the program.', onOpen: () => routes.push('/chat?programId=program') }))
  await act(async () => document.querySelector('[data-notification-banner] button').click())
  assert.equal(routes.at(-1), '/chat?programId=program')
  assert.equal(toasts.size, 0)
 })
 await t.test('push fallback reads only the signed-in user row and deduplicates against realtime', async () => {
  rows = [{ ...base, id: 'push-fallback' }]
  await act(async () => workerHandlers.message({ data: { type: 'TCNP_NOTIFICATION', notificationId: 'push-fallback' } }))
  assert.equal(toasts.size, 1)
  await act(async () => channels.find(channel => channel.name === 'notifications:officer').INSERT({ new: rows[0] }))
  assert.equal(toasts.size, 1)
  await act(async () => button('Hide notification banner').click())
  rows = [{ ...base, id: 'another-user', user_id: 'someone-else' }]
  await act(async () => workerHandlers.message({ data: { type: 'TCNP_NOTIFICATION', notificationId: 'another-user' } }))
  assert.equal(toasts.size, 0)
 })
 await t.test('chat-page foreground suppresses routine noise, background still alerts, and mentions share a delivery key', async () => {
  const message = { id: 'chat-one', sender_id: 'other-officer', content: 'Hello team', mentions: [], program_id: 'program' }
  await act(async () => channels.find(channel => channel.name === 'global-chat-notify').INSERT({ new: message }))
  assert.equal(toasts.size, 0)
  documentHasFocus = false
  await act(async () => channels.find(channel => channel.name === 'global-chat-notify').INSERT({ new: message }))
  assert.equal(systemAlerts.length, 1)
  assert.ok(systemAlerts[0].onClickUrl.includes('programId=program'))
  documentHasFocus = true
  await act(async () => channels.find(channel => channel.name === 'global-chat-notify').INSERT({ new: { ...message, mentions: ['officer'] } }))
  assert.equal(toasts.size, 1)
  await act(async () => channels.find(channel => channel.name === 'notifications:officer').INSERT({ new: { ...base, id: 'stored-mention', metadata: { message_id: 'chat-one', kind: 'mention', url: '/chat?programId=program' } } }))
  assert.equal(toasts.size, 1)
 })
})

