const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const mod = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/safe-destination.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: mod.exports, module: mod, URL })
const { safeDestination } = mod.exports
test('login preserves internal page, query and fragment', () => {
  assert.equal(safeDestination('/my-operations?program=123#next'), '/my-operations?program=123#next')
})
test('login rejects external, malformed and authentication-loop destinations', () => {
  for (const value of [null, '', '//evil.com', 'https://evil.com', '/\\evil.com', '/login', '/api/auth/login', '/hello\nworld']) {
    assert.equal(safeDestination(value), '/dashboard')
  }
})
