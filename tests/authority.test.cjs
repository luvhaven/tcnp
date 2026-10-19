const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const moduleUnderTest = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/utils.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: moduleUnderTest.exports, module: moduleUnderTest, require })
const { isPlatformAdministrator, platformAuthorityRank, isUnitHeadRole, canApproveSignups, canApproveSignupFor } = moduleUnderTest.exports
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
test('admins approve any signup; unit heads approve only their own unit', () => {
  assert.equal(canApproveSignupFor('admin', null, 'Tango Oscar'), true)
  assert.equal(canApproveSignupFor('super_admin', null, null), true)
  assert.equal(canApproveSignupFor('head_tango_oscar', null, 'Tango Oscar'), true)
  assert.equal(canApproveSignupFor('head_tango_oscar', null, 'Victor Oscar'), false)
  assert.equal(canApproveSignupFor('delta_oscar', 'Head Tango Oscar', 'Tango Oscar'), true)
  assert.equal(canApproveSignupFor('head_noscar_nest', null, 'November (Nest)'), true)
  assert.equal(canApproveSignupFor('head_noscar_nest', null, 'November (Den)'), false)
  assert.equal(canApproveSignupFor('head_of_command', null, 'Command'), true)
  assert.equal(canApproveSignupFor('tango_oscar', 'Tango Oscar', 'Tango Oscar'), false)
  assert.equal(canApproveSignupFor('captain', null, 'Tango Oscar'), false)
})
test('only admins and unit heads can open signup approvals', () => {
  for (const role of ['admin', 'head_welfare_oscar', 'head_serial_oscar']) assert.equal(canApproveSignups(role, null), true)
  for (const role of ['viewer', 'tango_oscar', 'captain', null]) assert.equal(canApproveSignups(role, null), false)
})
