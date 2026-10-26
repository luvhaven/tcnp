const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')
function compile(file, imports = {}, globals = {}, suffix = '') {
 const mod = { exports: {} }
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8') + suffix, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2020 } }).outputText, { module: mod, exports: mod.exports, require: name => imports[name] || require(name), ...globals })
 return mod.exports
}
test('theme resolution and first-paint script agree for saved, device and legacy choices', () => {
 const theme = compile('lib/theme.ts')
 for (const saved of [null, 'light', 'dark', 'auto', 'system', 'invalid']) for (const dark of [false, true]) {
  const root = { classList: { toggle: (_, value) => root.dark = value }, style: {} }
  vm.runInNewContext(theme.THEME_BOOTSTRAP_SCRIPT, { localStorage: { getItem: () => saved }, document: { documentElement: root }, window: { matchMedia: () => ({ matches: dark }) } })
  assert.equal(root.dark, theme.resolveTheme(theme.normalizeTheme(saved), dark) === 'dark')
  assert.equal(root.style.colorScheme, root.dark ? 'dark' : 'light')
 }
 const root = { classList: { toggle: (_, value) => root.dark = value }, style: {} }
 vm.runInNewContext(theme.THEME_BOOTSTRAP_SCRIPT, { localStorage: { getItem: () => { throw Error('blocked') } }, document: { documentElement: root }, window: {} })
 assert.equal(root.dark, false)
})
let JSDOM
try { ({ JSDOM } = require(process.env.FORM_DOM_RUNTIME || path.resolve('.next/form-ui-qa/node_modules/jsdom'))) } catch {}
test('Settings and the actual profile theme control share a stable, working preference', { skip: !JSDOM }, async t => {
 const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://tcnp.example' })
 const previous = new Map()
 for (const name of ['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT']) {
  previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'window' ? dom.window : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] })
 }
 const React = require('react'), { act } = React, { createRoot } = require('react-dom/client')
 let darkDevice = true
 const mediaListeners = new Set()
 dom.window.matchMedia = () => ({ matches: darkDevice, addEventListener: (_, callback) => mediaListeners.add(callback), removeEventListener: (_, callback) => mediaListeners.delete(callback) })
 const globals = { window: dom.window, document, localStorage: dom.window.localStorage, Event: dom.window.Event }
 const cache = new Map(), primitives = {}
 const load = file => {
  if (!cache.has(file)) cache.set(file, compile(file, new Proxy({}, { get(_, name) {
   if (name === '@/lib/theme') return load('lib/theme.ts')
   if (name === '@/components/theme/ThemeProvider') return load('components/theme/ThemeProvider.tsx')
   if (name === '@/lib/audio/AudioManager') return load('lib/audio/AudioManager.ts')
   if (name === '@/lib/utils') return { cn: require('clsx').clsx }
   if (name === '@/components/ui/button') return load('components/ui/button.tsx')
   if (name === '@/components/ui/card') return load('components/ui/card.tsx')
   if (name === '@/components/ui/label') return load('components/ui/label.tsx')
   if (name === '@/components/ui/switch') return load('components/ui/switch.tsx')
   if (name === 'next/link') return { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) }
   if (name === '@/components/notifications/DeviceNotificationControl') return { DeviceNotificationControl: () => { primitives.notifications = true; return React.createElement('div', { 'data-control': 'notifications' }) } }
   if (name === '@/components/tracking/LocationSharingControl') return { LocationSharingControl: () => { primitives.location = true; return React.createElement('div', { 'data-control': 'location' }) } }
   // Other header dependencies are not used by its standalone theme control.
   if (file === 'components/layout/header.tsx' && !['react','react/jsx-runtime','lucide-react'].includes(name)) return {}
  } }), globals, file === 'components/layout/header.tsx' ? '\nexports.ThemeSegmented = ThemeSegmented' : ''))
  return cache.get(file)
 }
 const { ThemeProvider, useTheme } = load('components/theme/ThemeProvider.tsx')
 const Settings = load('app/(dashboard)/settings/page.tsx').default
 const HeaderTheme = load('components/layout/header.tsx').ThemeSegmented
 const audio = load('lib/audio/AudioManager.ts').audioManager
 let setter, notifications = 0
 const unsubscribe = audio.subscribe(() => notifications++)
 function Probe() { setter = useTheme().setTheme; return null }
 const root = createRoot(document.getElementById('root'))
 const render = async (settings = true) => act(async () => root.render(React.createElement(ThemeProvider, null, React.createElement(Probe), React.createElement(HeaderTheme), settings && React.createElement(Settings))))
 const click = async label => { const button = [...document.querySelectorAll('button')].find(node => node.getAttribute('aria-label') === label || node.textContent === label); assert.ok(button, label); await act(async () => button.click()) }
 const pressed = label => [...document.querySelectorAll('button')].find(node => node.textContent === label).getAttribute('aria-pressed')
 t.after(async () => { unsubscribe(); await act(async () => root.unmount()); dom.window.close(); for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name] } })
 await t.test('opening Settings preserves the chosen light theme despite a dark device', async () => {
  dom.window.localStorage.setItem('tcnp-theme', 'light')
  await render(false)
  const original = setter
  await render()
  assert.equal(document.documentElement.classList.contains('dark'), false)
  assert.equal(pressed('Light'), 'true')
  assert.equal(setter, original)
  assert.ok(primitives.notifications && primitives.location)
 })
 await t.test('profile and Settings changes synchronize in both directions and survive navigation', async () => {
  const original = setter
  await click('Dark')
  assert.equal(document.documentElement.classList.contains('dark'), true)
  assert.equal(document.querySelector('[aria-label="Dark mode"]').getAttribute('aria-pressed'), 'true')
  await click('Light mode')
  assert.equal(pressed('Light'), 'true')
  assert.equal(document.documentElement.classList.contains('dark'), false)
  assert.equal(setter, original)
  await render(false); await render()
  assert.equal(pressed('Light'), 'true')
  assert.equal(dom.window.localStorage.getItem('tcnp-theme'), 'light')
 })
 await t.test('Follow device reacts to OS changes; an explicit profile choice overrides it', async () => {
  await click('Follow device')
  assert.equal(document.documentElement.classList.contains('dark'), true)
  assert.equal(document.querySelector('[aria-label="Dark mode"]').getAttribute('aria-pressed'), 'true')
  darkDevice = false
  await act(async () => mediaListeners.forEach(callback => callback()))
  assert.equal(document.documentElement.classList.contains('dark'), false)
  await click('Dark mode')
  assert.equal(pressed('Dark'), 'true')
  assert.equal(document.documentElement.classList.contains('dark'), true)
 })
 await t.test('other-tab storage updates synchronize the page and profile control', async () => {
  dom.window.localStorage.setItem('tcnp-theme', 'light')
  await act(async () => dom.window.dispatchEvent(new dom.window.StorageEvent('storage', { key: 'tcnp-theme', newValue: 'light' })))
  assert.equal(pressed('Light'), 'true')
  assert.equal(document.documentElement.classList.contains('dark'), false)
 })
 await t.test('mute affects the shared engine and unsupported controls cannot be changed', async () => {
  const sound = document.getElementById('app-sounds')
  await act(async () => sound.click())
  assert.equal(audio.muted, true)
  assert.equal(sound.getAttribute('aria-checked'), 'false')
  await act(async () => audio.setMuted(false))
  assert.equal(sound.getAttribute('aria-checked'), 'true')
  assert.equal(notifications, 2)
  assert.equal(document.querySelectorAll('fieldset[disabled] input:disabled').length, 7)
  assert.equal(document.querySelector('a[href="/profile"]').textContent, 'My profile')
  assert.equal(document.querySelector('a[href="/change-password"]').textContent, 'Change password')
 })
 await t.test('a full or blocked preference store does not break either switch', async () => {
  const storage = dom.window.Storage.prototype.setItem
  dom.window.Storage.prototype.setItem = () => { throw Error('quota exceeded') }
  try {
   await click('Dark mode')
   assert.equal(pressed('Dark'), 'true')
   await click('Light')
   assert.equal(document.documentElement.classList.contains('dark'), false)
   await act(async () => audio.setMuted(true))
   assert.equal(document.getElementById('app-sounds').getAttribute('aria-checked'), 'false')
  } finally { dom.window.Storage.prototype.setItem = storage }
 })
})
