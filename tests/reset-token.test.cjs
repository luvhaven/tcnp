const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

const mod = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/security/reset-token.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: mod.exports, module: mod, require, process })

const {
  generateResetToken,
  hashResetToken,
  readResetToken,
  setResetCookie,
  clearResetCookie,
  RESET_COOKIE_NAME,
} = mod.exports

function requestWithCookie(value) {
  return { cookies: { get: (name) => (name === RESET_COOKIE_NAME && value !== undefined ? { value } : undefined) } }
}

function recordingResponse() {
  const set = []
  return { set, cookies: { set: (...args) => set.push(args) } }
}

test('tokens are 64 hex characters and never repeat', () => {
  const a = generateResetToken()
  const b = generateResetToken()
  assert.match(a, /^[a-f0-9]{64}$/)
  assert.notEqual(a, b)
})

test('the stored digest is not the token and is stable', () => {
  const token = generateResetToken()
  assert.notEqual(hashResetToken(token), token)
  assert.equal(hashResetToken(token), hashResetToken(token))
  assert.match(hashResetToken(token), /^[a-f0-9]{64}$/)
})

test('only a well-formed cookie token is read back', () => {
  const token = generateResetToken()
  assert.equal(readResetToken(requestWithCookie(token)), token)
  assert.equal(readResetToken(requestWithCookie(undefined)), null)
  assert.equal(readResetToken(requestWithCookie('short')), null)
  assert.equal(readResetToken(requestWithCookie(hashResetToken(token).toUpperCase())), null)
})

test('the cookie is httpOnly, strict and scoped to the reset routes', () => {
  const response = recordingResponse()
  setResetCookie(response, 'abc')
  const [name, value, options] = response.set[0]
  assert.equal(name, RESET_COOKIE_NAME)
  assert.equal(value, 'abc')
  assert.equal(options.httpOnly, true)
  assert.equal(options.sameSite, 'strict')
  assert.equal(options.path, '/api/auth/reset-password')
  assert.ok(options.maxAge > 0)
})

test('clearing the cookie expires it on the same path', () => {
  const response = recordingResponse()
  clearResetCookie(response)
  const [, value, options] = response.set[0]
  assert.equal(value, '')
  assert.equal(options.maxAge, 0)
  assert.equal(options.path, '/api/auth/reset-password')
})
