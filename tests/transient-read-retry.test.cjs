const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

// error-utils.ts has no imports, so it transpiles and runs standalone.
const mod = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/supabase/error-utils.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: mod.exports, module: mod, console, JSON, Object, Error })

const { isTransientNetworkError } = mod.exports

test('the transport failures seen in production are retryable', () => {
  // TCNP-2: Supabase reads failing from Nigerian mobile networks. Each engine
  // words this differently and none carry a status code.
  assert.equal(isTransientNetworkError({ code: '', message: 'TypeError: Load failed (swyvftqciilslyzfdoli.supabase.co)' }), true)
  assert.equal(isTransientNetworkError(new TypeError('Failed to fetch')), true)
  assert.equal(isTransientNetworkError({ message: 'NetworkError when attempting to fetch resource.' }), true)
})

test('an answered request is never retried, however it failed', () => {
  // Asking again cannot change any of these answers; retrying would just
  // triple the load and delay the error the user needs to see.
  assert.equal(isTransientNetworkError({ code: '42501', message: 'permission denied for table users' }), false)
  assert.equal(isTransientNetworkError({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }), false)
  assert.equal(isTransientNetworkError({ code: '23505', message: 'duplicate key value violates unique constraint' }), false)
})

test('a request that already spent its deadline is not retried', () => {
  // Retrying a 15s timeout twice more leaves the user on a skeleton for 45s.
  assert.equal(
    isTransientNetworkError(new Error('TCNP_SUPABASE_REQUEST_TIMEOUT: Supabase did not respond within 15000ms.')),
    false,
  )
})

test('malformed and empty failures are not mistaken for transport failures', () => {
  assert.equal(isTransientNetworkError(null), false)
  assert.equal(isTransientNetworkError(undefined), false)
  assert.equal(isTransientNetworkError({}), false)
  assert.equal(isTransientNetworkError('something went wrong'), false)
})
