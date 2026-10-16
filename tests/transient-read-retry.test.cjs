const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

// error-utils.ts has no imports, so it transpiles and runs standalone.
const mod = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/supabase/error-utils.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: mod.exports, module: mod, console, JSON, Object, Error, Promise, setTimeout, Math })

const { isTransientNetworkError, retryTransientRead } = mod.exports

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

/** Records the backoff delays asked for, without ever sleeping. */
function recordingWait(log) {
  return (ms) => { log.push(ms); return Promise.resolve() }
}

test('a read whose connection dropped is retried and can still succeed', async () => {
  // The dashboard loader is a plain effect, so React Query never sees it. Before
  // this, one dropped packet became a visible error for a read that would have
  // worked a second later — TCNP-A, dashboard_stage auth_user, still firing on
  // a release that already had the React Query retry.
  const delays = []
  let calls = 0
  const value = await retryTransientRead(async () => {
    calls += 1
    if (calls < 3) throw new TypeError('Load failed')
    return 'loaded'
  }, { wait: recordingWait(delays) })

  assert.equal(value, 'loaded')
  assert.equal(calls, 3)
  assert.deepEqual(delays, [1000, 2000], 'backoff must widen between attempts')
})

test('an answered failure is never retried', async () => {
  // Asking again cannot change a permission denial; retrying only triples the
  // load and delays the error the user needs to see.
  let calls = 0
  const denied = { code: '42501', message: 'permission denied for table users' }
  await assert.rejects(
    () => retryTransientRead(async () => { calls += 1; throw denied }, { wait: recordingWait([]) }),
    (err) => err === denied,
  )
  assert.equal(calls, 1, 'must fail on the first answer')
})

test('a connection that stays dead gives up and reports', async () => {
  const delays = []
  let calls = 0
  await assert.rejects(
    () => retryTransientRead(async () => {
      calls += 1
      throw new TypeError('Failed to fetch')
    }, { wait: recordingWait(delays) }),
    /Failed to fetch/,
  )
  assert.equal(calls, 3, 'three attempts, then surface the failure')
  assert.equal(delays.length, 2, 'no pointless wait after the final attempt')
})

test('a read that works first time is not delayed at all', async () => {
  const delays = []
  assert.equal(await retryTransientRead(async () => 'ok', { wait: recordingWait(delays) }), 'ok')
  assert.deepEqual(delays, [])
})
