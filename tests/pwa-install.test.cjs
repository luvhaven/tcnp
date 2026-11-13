const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript')

/** Loads lib/pwa-install.ts against a fake browser whose clock the test controls. */
function load({ now = 60_000 } = {}) {
  const window = new EventTarget()
  window.setTimeout = setTimeout
  window.clearTimeout = clearTimeout
  window.matchMedia = () => ({ matches: false })
  const mod = { exports: {} }
  const source = ts.transpileModule(fs.readFileSync('lib/pwa-install.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const context = { module: mod, exports: mod.exports, window, Event, navigator: {}, performance: { now: () => now } }
  vm.runInNewContext(source, context)
  return { api: mod.exports, window, context }
}

function offer(outcome = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true })
  event.prompts = 0
  event.prompt = async () => { event.prompts++ }
  event.userChoice = Promise.resolve({ outcome })
  return event
}

test('an install offer that fires before any button exists is still used by the first click', async () => {
  const { api, window, context } = load()
  // The root layout runs this before the app's own code has loaded.
  vm.runInNewContext(api.INSTALL_BOOTSTRAP_SCRIPT, context)
  const event = offer()
  window.dispatchEvent(event)
  assert.equal(event.defaultPrevented, true, 'the browser mini-infobar is suppressed so our button owns the moment')
  assert.equal(api.hasInstallPrompt(), true)

  assert.equal(await api.requestInstall('desktop-chrome'), 'accepted')
  assert.equal(event.prompts, 1)
  assert.equal(api.wasInstalledThisSession(), true)
})

test('every control shares one offer, and a spent offer is never prompted twice', async () => {
  const { api, window } = load()
  let changes = 0
  const unsubscribe = api.subscribeToInstall(() => changes++)
  const event = offer('dismissed')
  window.dispatchEvent(event)
  assert.ok(changes >= 1, 'subscribers hear about the offer arriving')

  assert.equal(await api.requestInstall('android'), 'dismissed')
  assert.equal(api.hasInstallPrompt(), false)
  assert.equal(api.wasInstalledThisSession(), false)
  // Chrome does not re-offer after a dismissal, so the second click explains the manual route.
  assert.equal(await api.requestInstall('android'), 'show-instructions')
  assert.equal(event.prompts, 1)
  unsubscribe()
})

test('instructions are the answer only where the device cannot install on request', async () => {
  for (const platform of ['ios', 'mac-safari', 'desktop-other', 'in-app']) {
    // Even seconds after load, these never wait for an offer that cannot come.
    const { api } = load({ now: 500 })
    const started = Date.now()
    assert.equal(await api.requestInstall(platform), 'show-instructions')
    assert.ok(Date.now() - started < 200, `${platform} answers immediately`)
  }
})

test('a click that beats the offer waits for it instead of showing instructions', async () => {
  const { api, window } = load({ now: 1_000 })
  const event = offer()
  const pending = api.requestInstall('desktop-chrome')
  setTimeout(() => window.dispatchEvent(event), 50)
  assert.equal(await pending, 'accepted')
  assert.equal(event.prompts, 1)
})

test('long after load a missing offer is not waited for', async () => {
  const { api } = load({ now: 60_000 })
  const started = Date.now()
  assert.equal(await api.requestInstall('desktop-chrome'), 'show-instructions')
  assert.ok(Date.now() - started < 200)
})

test('a browser that rejects the prompt falls back to instructions rather than failing silently', async () => {
  const { api, window } = load()
  api.ensureInstallListeners()
  const event = offer()
  event.prompt = async () => { throw new Error('NotAllowedError') }
  window.dispatchEvent(event)
  assert.equal(await api.requestInstall('android'), 'show-instructions')
})

test('devices are sorted into the route that actually works for them', () => {
  const { api } = load()
  const cases = [
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36', '', 0, 'android'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1', 'iPhone', 5, 'ios'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 CriOS/126.0 Mobile/15E148 Safari/604.1', 'iPhone', 5, 'ios'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15', 'MacIntel', 5, 'ios'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15', 'MacIntel', 0, 'mac-safari'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 Edg/131.0', 'Win32', 0, 'desktop-chrome'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0', 'Win32', 0, 'desktop-other'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 330.0', 'iPhone', 5, 'in-app'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A; wv) AppleWebKit/537.36 Version/4.0 Chrome/131.0 Mobile Safari/537.36', '', 0, 'in-app'],
  ]
  for (const [userAgent, platform, touch, expected] of cases) assert.equal(api.detectPlatform(userAgent, platform, touch), expected, userAgent)
  assert.equal(api.offersNativeInstall('android'), true)
  assert.equal(api.offersNativeInstall('desktop-chrome'), true)
  assert.equal(api.offersNativeInstall('ios'), false)
})
