const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

const loaded = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/profile-completion.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { module: loaded, exports: loaded.exports })
const { computeProfileCompletion, PROFILE_FIELD_SPECS } = loaded.exports
const filled = Object.fromEntries(PROFILE_FIELD_SPECS.map(spec => [spec.key, 'Filled']))

for (const role of ['captain', 'vice_captain']) {
  test(`${role} reaches full completion without a protocol team`, () => {
    const result = computeProfileCompletion({ ...filled, role, team: null })
    assert.equal(result.isComplete, true)
    assert.equal(result.percent, 100)
    assert.equal(result.missing.some(spec => spec.key === 'team'), false)
    assert.equal(result.totalCount, PROFILE_FIELD_SPECS.length - 1)
  })

  test(`${role} still needs the other required identity details`, () => {
    const result = computeProfileCompletion({ ...filled, role, team: null, phone: ' ' })
    assert.equal(result.isComplete, false)
    assert.deepEqual(Array.from(result.missingRequired, spec => spec.key), ['phone'])
  })
}

test('other roles and unknown roles still require a protocol team', () => {
  for (const role of ['command', 'admin', 'tango_oscar', null, undefined]) {
    const result = computeProfileCompletion({ ...filled, role, team: null })
    assert.equal(result.isComplete, false)
    assert.deepEqual(Array.from(result.missingRequired, spec => spec.key), ['team'])
  }
})
