const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

/**
 * Loads lib/notify.ts with sonner and Sentry stubbed out, and a controllable
 * navigator, so each test can see exactly what the user would be shown and
 * what would be reported.
 */
function load({ onLine = true, nodeEnv = 'production' } = {}) {
  const toasts = []
  const reports = []
  const stubs = {
    sonner: { toast: { error: (message, opts) => toasts.push({ message, opts }) } },
    '@sentry/nextjs': { captureException: (error, ctx) => reports.push({ error, ctx }) },
  }
  const mod = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/notify.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, {
    exports: mod.exports,
    module: mod,
    require: (name) => {
      if (!(name in stubs)) throw new Error(`unexpected import ${name}`)
      return stubs[name]
    },
    navigator: { onLine },
    process: { env: { NODE_ENV: nodeEnv } },
    console,
    Error,
    TypeError,
    String,
    Object,
  })
  return { ...mod.exports, toasts, reports }
}

test('Postgres constraint codes become plain sentences', () => {
  const { friendlyErrorMessage, FRIENDLY_MESSAGES } = load()
  assert.equal(friendlyErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint "x"' }, 'f'), FRIENDLY_MESSAGES.duplicate)
  assert.equal(friendlyErrorMessage({ code: '23503', message: 'update or delete violates foreign key' }, 'f'), FRIENDLY_MESSAGES['in-use'])
  assert.equal(friendlyErrorMessage({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, 'f'), FRIENDLY_MESSAGES['not-found'])
})

test('permission failures say so, whether by code or RLS message', () => {
  const { friendlyErrorMessage } = load()
  const expected = "You don't have permission to do that."
  assert.equal(friendlyErrorMessage({ code: '42501', message: 'permission denied for table officers' }, 'f'), expected)
  assert.equal(friendlyErrorMessage({ message: 'new row violates row-level security policy for table "journeys"' }, 'f'), expected)
})

test('network failures in every browser read as offline', () => {
  const { classifyError } = load()
  assert.equal(classifyError(new TypeError('Failed to fetch')), 'offline') // Chromium
  assert.equal(classifyError(new TypeError('Load failed')), 'offline') // Safari
  assert.equal(classifyError(new TypeError('NetworkError when attempting to fetch resource.')), 'offline') // Firefox
})

test('a browser that reports itself offline wins over whatever the error says', () => {
  const { classifyError } = load({ onLine: false })
  assert.equal(classifyError(new Error('something odd')), 'offline')
})

test('a TypeError from a code bug is not mistaken for the network', () => {
  const { classifyError } = load()
  assert.equal(classifyError(new TypeError("Cannot read properties of undefined (reading 'id')")), 'unknown')
})

test('an expired JWT asks the user to sign in again', () => {
  const { friendlyErrorMessage } = load()
  assert.equal(friendlyErrorMessage({ message: 'JWT expired', code: 'PGRST301' }, 'f'), 'Your session expired, please sign in again.')
  assert.equal(friendlyErrorMessage({ message: 'JWT expired' }, 'f'), 'Your session expired, please sign in again.')
})

test('unknown errors show the fallback, never the raw text, and are reported once', () => {
  const { notifyError, toasts, reports } = load()
  const raw = { code: 'XX000', message: 'internal: relation "secret_table" leaked detail' }
  const shown = notifyError(raw, 'Failed to save officer')
  assert.equal(shown, 'Failed to save officer')
  assert.equal(toasts.length, 1)
  assert.equal(toasts[0].message, 'Failed to save officer')
  assert.ok(!toasts[0].message.includes('secret_table'))
  assert.equal(reports.length, 1)
  assert.equal(reports[0].ctx.tags['supabase.code'], 'XX000')
})

test('expected failures are not reported to Sentry', () => {
  const { notifyError, reports } = load()
  notifyError({ code: '23505' }, 'f')
  notifyError(new TypeError('Failed to fetch'), 'f')
  notifyError({ code: '42501' }, 'f')
  assert.equal(reports.length, 0)
})

test('the same message reuses one toast id so repeats replace rather than stack', () => {
  const { notifyError, toasts } = load()
  notifyError(new TypeError('Failed to fetch'), 'a')
  notifyError(new TypeError('Load failed'), 'b')
  notifyError({ message: 'boom' }, 'Failed to load')
  assert.equal(toasts[0].opts.id, toasts[1].opts.id)
  assert.notEqual(toasts[0].opts.id, toasts[2].opts.id)
})

test('strings, null and undefined are tolerated', () => {
  const { notifyError, toasts } = load()
  assert.doesNotThrow(() => notifyError(null, 'x'))
  assert.doesNotThrow(() => notifyError(undefined, 'y'))
  assert.doesNotThrow(() => notifyError('Failed to fetch', 'z'))
  assert.deepEqual(toasts.map(t => t.message), ['x', 'y', 'You appear to be offline. Check your connection and try again.'])
})

test('report: false suppresses Sentry for errors the caller already captured', () => {
  const { notifyError, reports } = load()
  notifyError(new Error('boom'), 'f', { report: false })
  assert.equal(reports.length, 0)
})

test('a UserFacingError is shown verbatim and never reported', () => {
  const { notifyError, UserFacingError, toasts, reports } = load()
  notifyError(new UserFacingError('Choose a Papa and enter the room number'), 'Room could not be added')
  assert.equal(toasts[0].message, 'Choose a Papa and enter the room number')
  assert.equal(reports.length, 0)
})

test("Supabase Auth's own validation messages are shown, its 401s are not", () => {
  const { friendlyErrorMessage } = load()
  const weak = { name: 'AuthApiError', status: 422, message: 'Password should be at least 6 characters.' }
  assert.equal(friendlyErrorMessage(weak, 'f'), weak.message)
  assert.equal(friendlyErrorMessage({ name: 'AuthApiError', status: 401, message: 'JWT expired' }, 'f'), 'Your session expired, please sign in again.')
})
