const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

const SOURCE = ts.transpileModule(
  fs.readFileSync('lib/services/notificationService.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText

/**
 * Evaluate the module against a chosen set of browser globals.
 * `globals` is what the environment provides — crucially, whether the
 * Notification API exists at all.
 */
function loadIn(globals) {
  const mod = { exports: {} }
  const context = {
    module: mod,
    exports: mod.exports,
    // The module imports AudioManager; it is irrelevant to construction.
    require: () => ({ audioManager: { play: () => {} } }),
    console: { warn() {}, error() {}, log() {} },
    Promise, Object, Error, setTimeout, clearTimeout,
    ...globals,
  }
  vm.runInNewContext(SOURCE, context)
  return mod.exports
}

test('importing the module does not throw on iOS Safari', () => {
  // The actual production crash: a normal iOS Safari tab has `window` but no
  // `Notification` — the API is exposed only to installed PWAs. The singleton
  // is built at module scope, so an unguarded read threw a ReferenceError on
  // IMPORT, taking out every route that pulls this in (chat, my-operations,
  // my-assignments, the permission banner) through the error boundary.
  const windowWithoutNotification = {}
  assert.doesNotThrow(() => {
    loadIn({ window: windowWithoutNotification })
  }, 'module must import cleanly where the Notification API is absent')
})

test('the service still reads permission where the API exists', () => {
  // The guard must not become a blanket opt-out: on browsers that do support
  // notifications, the stored permission still has to be picked up.
  const api = { permission: 'granted' }
  const exports = loadIn({
    window: { Notification: api },
    Notification: api,
  })
  const service = exports.NotificationService.getInstance()
  assert.equal(service.permission, 'granted')
})

test('server-side rendering has no window at all and must survive', () => {
  assert.doesNotThrow(() => loadIn({}))
})

test('requesting permission is refused rather than thrown where unsupported', () => {
  const exports = loadIn({ window: {} })
  return exports.notificationService.requestPermission().then((granted) => {
    assert.equal(granted, false)
  })
})
