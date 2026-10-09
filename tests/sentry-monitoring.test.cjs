const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

const mod = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/monitoring/sentry-shared.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: mod.exports, module: mod, process, RegExp })

const { redactUrl, isNextNavigationSignal, DATA_COLLECTION, SECRET_PARAMS, resolveDsn, FALLBACK_DSN } = mod.exports

test('error reports never carry a Supabase session token', () => {
  // Supabase returns these in the URL fragment after a magic link or OAuth
  // callback, and that URL lands in Sentry breadcrumbs.
  assert.equal(
    redactUrl('https://app.tcnp.org/login#access_token=eyJhbGc.secret&expires_in=3600'),
    'https://app.tcnp.org/login#access_token=[REDACTED]&expires_in=3600',
  )
  assert.equal(
    redactUrl('/auth/callback?code=abc123&refresh_token=zzz&next=/dashboard'),
    '/auth/callback?code=[REDACTED]&refresh_token=[REDACTED]&next=/dashboard',
  )
  // Casing varies between providers.
  assert.equal(redactUrl('/x?Access_Token=abc'), '/x?Access_Token=[REDACTED]')
})

test('redaction leaves ordinary debugging context intact', () => {
  const url = '/journeys?program=123&status=active'
  assert.equal(redactUrl(url), url)
  assert.equal(redactUrl(''), '')
})

test('redaction covers every parameter the deny list names', () => {
  for (const param of SECRET_PARAMS) {
    assert.equal(redactUrl(`/x?${param}=leaked`), `/x?${param}=[REDACTED]`)
  }
})

test('App Router redirects are not reported as errors', () => {
  // proxy.ts redirects unauthenticated navigations on every single request.
  // Reporting these would bury real failures and burn the error quota.
  assert.equal(isNextNavigationSignal({ digest: 'NEXT_REDIRECT;replace;/login;307;' }), true)
  assert.equal(isNextNavigationSignal({ digest: 'NEXT_NOT_FOUND' }), true)
  assert.equal(isNextNavigationSignal(new Error('NEXT_REDIRECT')), true)
})

test('real failures are still reported', () => {
  assert.equal(isNextNavigationSignal(new Error('Cannot read properties of undefined')), false)
  assert.equal(isNextNavigationSignal({ digest: 'abc123' }), false)
  assert.equal(isNextNavigationSignal(null), false)
  assert.equal(isNextNavigationSignal(undefined), false)
  assert.equal(isNextNavigationSignal('NEXT_REDIRECT'), false)
})

test('SDK is not allowed to auto-collect officer data', () => {
  // SDK v11 replaced `sendDefaultPii` with `dataCollection` AND inverted the
  // defaults: cookies, headers and request bodies are collected unless
  // disabled. If any of these flip back on, session cookies and journey
  // payloads start leaving the device.
  assert.equal(DATA_COLLECTION.cookies, false)
  assert.equal(DATA_COLLECTION.httpHeaders, false)
  assert.equal(DATA_COLLECTION.httpBodies.length, 0)
  assert.equal(DATA_COLLECTION.userInfo, false)
  assert.equal(DATA_COLLECTION.stackFrameVariables, false)
  assert.equal(DATA_COLLECTION.databaseQueryData, false)
  // Query params are kept for debugging, with secrets denied.
  assert.equal(
    JSON.stringify(DATA_COLLECTION.urlQueryParams.deny),
    JSON.stringify(SECRET_PARAMS),
  )
})

test('the environment DSN always wins over the committed fallback', () => {
  // The fallback exists only for deployments where nobody can set env vars.
  // If it ever shadowed the env var, staging errors would land in the wrong
  // project and nobody would notice.
  assert.equal(resolveDsn('https://env@o1.ingest.de.sentry.io/1'), 'https://env@o1.ingest.de.sentry.io/1')
})

test('no DSN anywhere leaves the SDK inert', () => {
  assert.equal(FALLBACK_DSN, '', 'commit the DSN deliberately, not by accident')
  assert.equal(resolveDsn(undefined), undefined)
  assert.equal(resolveDsn(''), undefined)
  // A var set to whitespace in a dashboard must not count as configured.
  assert.equal(resolveDsn('   '), undefined)
})
