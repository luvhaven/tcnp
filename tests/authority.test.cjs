const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const moduleUnderTest = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/utils.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: moduleUnderTest.exports, module: moduleUnderTest, require })
const { isPlatformAdministrator, platformAuthorityRank, isUnitHeadRole } = moduleUnderTest.exports
test('only platform administrator roles have platform administration', () => {
  for (const role of ['admin', 'dev_admin', 'super_admin']) assert.equal(isPlatformAdministrator(role), true)
  for (const role of [null, undefined, '', 'delta_oscar', 'head_victor_oscar', 'captain', 'command']) assert.equal(isPlatformAdministrator(role), false)
})
test('super admin outranks admin; operational leadership does not', () => {
  assert.ok(platformAuthorityRank('super_admin') > platformAuthorityRank('admin'))
  assert.ok(platformAuthorityRank('admin') > platformAuthorityRank('captain'))
})
test('a unit head role does not by itself grant another unit head authority', () => {
  assert.equal(isUnitHeadRole('victor', 'head_victor_oscar'), true)
  assert.equal(isUnitHeadRole('training', 'head_victor_oscar'), false)
})
