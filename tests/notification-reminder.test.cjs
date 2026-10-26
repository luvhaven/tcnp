const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')
function compile(file, imports = {}, globals = {}) {
 const mod = { exports: {} }
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, { module: mod, exports: mod.exports, require: name => imports[name] || require(name), atob, ...globals })
 return mod.exports
}
const session = (id, tokenVersion = 1) => ({ user: { id: 'officer' }, access_token: `header.${Buffer.from(JSON.stringify({ session_id: id, version: tokenVersion })).toString('base64url')}.signature` })
test('notification reminder is scoped to a login, not a permanent browser dismissal or token refresh', () => {
 const { notificationReminderSession: key, shouldShowNotificationReminder: show } = compile('lib/notification-reminder.ts')
 const first = key(session('login-one'), 'fallback'), second = key(session('login-two'), 'fallback')
 assert.equal(key(session('login-one', 2), 'other-fallback'), first)
 assert.notEqual(first, second)
 const options = { session: first, dismissedSession: first, disabled: false, permission: 'default', connected: false }
 assert.equal(show(options), false)
 assert.equal(show({ ...options, session: second }), true)
 assert.equal(show({ ...options, dismissedSession: null, disabled: true }), false)
 assert.equal(show({ ...options, session: null }), false)
 assert.equal(show({ ...options, dismissedSession: null, permission: 'granted', connected: true }), false)
 assert.equal(show({ ...options, dismissedSession: null, permission: 'granted', connected: false }), true)
 assert.equal(show({ ...options, dismissedSession: null, permission: 'denied' }), true)
 assert.equal(show({ ...options, dismissedSession: null, permission: 'unsupported' }), true)
 assert.notEqual(key({ user: { id: 'officer' }, access_token: 'invalid' }, 'mount-one'), key({ user: { id: 'officer' }, access_token: 'invalid' }, 'mount-two'))
})

let JSDOM
try { ({ JSDOM } = require(process.env.FORM_DOM_RUNTIME || path.resolve('.next/form-ui-qa/node_modules/jsdom'))) } catch {}
test('actual login reminder returns after a new login and opens native permission only from Enable', { skip: !JSDOM }, async t => {
 const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://tcnp.example' })
 const saved = new Map()
 for (const name of ['window','document','navigator','HTMLElement','Notification','IS_REACT_ACT_ENVIRONMENT']) {
  saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'window' ? dom.window : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] })
 }
 const React = require('react'), { act } = React, { createRoot } = require('react-dom/client')
 let root = createRoot(document.getElementById('root'))
 let activeSession = session('login-one'), permission = 'default', connected = false, disabled = false, supported = true, nativeRequests = 0, testNotifications = 0
 const Notification = { get permission() { return permission } }
 let notificationApi = Notification
 let cryptoApi = require('node:crypto').webcrypto
 const reminders = compile('lib/notification-reminder.ts')
 const cache = new Map()
 const push = {
  pushSupported: () => supported, pushDisabled: () => disabled, devicePushConnected: async () => connected,
  getPushConfig: async () => ({ ready: true, publicKey: 'public', userId: 'officer' }),
  connectDevicePush: async (_, ask, onProgress) => {
   if (ask) { nativeRequests++; permission = 'granted' }
   onProgress?.('Connecting this device…')
   connected = true
   dom.window.dispatchEvent(new dom.window.Event('tcnp-push-change'))
  },
  disconnectDevicePush: async () => { disabled = true; connected = false },
  sendDeviceNotificationTest: async () => { testNotifications++ },
 }
 const originalTimeout = dom.window.setTimeout.bind(dom.window)
 dom.window.setTimeout = (callback, delay, ...args) => originalTimeout(callback, Math.min(delay, 5), ...args)
 function load(file) {
  if (!cache.has(file)) cache.set(file, compile(file, new Proxy({}, { get(_, name) {
   if (name === './DeviceNotificationControl') return load('components/notifications/DeviceNotificationControl.tsx')
   if (name === '@/components/ui/button') return load('components/ui/button.tsx')
   if (name === '@/lib/utils') return { cn: require('clsx').clsx }
   if (name === '@/lib/device-push') return push
   if (name === '@/lib/notification-reminder') return reminders
   if (name === '@/lib/supabase/client') return { createClient: () => ({ auth: { getSession: async () => ({ data: { session: activeSession } }) } }) }
  } }), { window: dom.window, document, navigator: dom.window.navigator, Notification: notificationApi, localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage, crypto: cryptoApi }))
  return cache.get(file)
 }
 const Banner = load('components/notifications/NotificationPermissionBanner.tsx').default
 const wrapper = () => document.querySelector('section[aria-label="Device notifications"]').parentElement
 const visible = () => wrapper().className !== 'hidden'
 const button = text => Array.from(document.querySelectorAll('button')).find(node => node.textContent.includes(text))
 async function mount(Component = Banner) {
  await act(async () => root.unmount())
  root = createRoot(document.getElementById('root'))
  await act(async () => root.render(React.createElement(Component)))
  await act(async () => new Promise(resolve => setTimeout(resolve, 20)))
 }
 t.after(async () => { await act(async () => root.unmount()); dom.window.close(); for (const [name, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name] } })
 await t.test('the old permanent Dismiss flag no longer suppresses an undecided login', async () => {
  dom.window.localStorage.setItem('notification-banner-dismissed', 'true')
  await mount()
  assert.equal(visible(), true)
  assert.equal(nativeRequests, 0)
  assert.equal(dom.window.localStorage.getItem('notification-banner-dismissed'), null)
 })
 await t.test('Not now hides this login, survives a reload, and returns for the next login', async () => {
  await act(async () => button('Not now').click())
  assert.equal(visible(), false)
  await mount()
  assert.equal(visible(), false)
  activeSession = session('login-two')
  await mount()
  assert.equal(visible(), true)
 })
 await t.test('Enable calls the native-permission path, confirms setup and hides the reminder', async () => {
  await act(async () => button('Enable on this device').click())
  assert.equal(nativeRequests, 1)
  assert.equal(testNotifications, 1)
  assert.equal(connected, true)
  assert.equal(visible(), false)
 })
 await t.test('already-authorized devices reconnect without a redundant native prompt', async () => {
  await mount()
  assert.equal(visible(), false)
  assert.equal(nativeRequests, 1)
 })
 await t.test('blocked permission shows recovery guidance instead of silently disappearing', async () => {
  permission = 'denied'; connected = false; activeSession = session('login-three')
  await mount()
  assert.equal(visible(), true)
  assert.match(wrapper().textContent, /blocked in this browser.*site settings/)
  assert.equal(nativeRequests, 1)
 })
 await t.test('an explicit device opt-out is respected on a later login', async () => {
  disabled = true; permission = 'default'; activeSession = session('login-four')
  await mount()
  assert.equal(visible(), false)
  assert.equal(nativeRequests, 1)
 })
 await t.test('a browser without the Notification API safely displays Home Screen/support guidance', async () => {
  disabled = false; supported = false; notificationApi = undefined; cryptoApi = {}; activeSession = session('login-five')
  cache.clear()
  const UnsupportedBanner = load('components/notifications/NotificationPermissionBanner.tsx').default
  await mount(UnsupportedBanner)
  assert.equal(visible(), true)
  assert.match(wrapper().textContent, /Home Screen/)
  assert.equal(nativeRequests, 1)
 })
})
