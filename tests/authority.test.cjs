const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const moduleUnderTest = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/utils.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: moduleUnderTest.exports, module: moduleUnderTest, require })
const { isPlatformAdministrator, platformAuthorityRank, canApproveSignups, canDecideSignup, canAccessCommandCentre, canViewLiveTracking, PLATFORM_ADMIN_ROLES } = moduleUnderTest.exports
const head = (slug) => ({ slug, access_level: 'head', status: 'active' })
const member = (slug) => ({ slug, access_level: 'member', status: 'active' })
test('only platform administrator roles have platform administration', () => {
  for (const role of PLATFORM_ADMIN_ROLES) assert.equal(isPlatformAdministrator(role), true, role)
  for (const role of [null, undefined, '', 'delta_oscar', 'head_victor_oscar', 'head_of_operations', 'command']) assert.equal(isPlatformAdministrator(role), false, role)
})
test('executives have cross-workspace authority; the Head of Command needs an explicit grant', () => {
  assert.ok(platformAuthorityRank('super_admin') > platformAuthorityRank('admin'))
  for (const role of ['captain', 'vice_captain']) {
    assert.equal(platformAuthorityRank(role), platformAuthorityRank('admin'))
    assert.equal(canAccessCommandCentre(role), true)
    assert.equal(canDecideSignup({ role }, ['tango']), true)
    assert.equal(canDecideSignup({ role }, ['victor']), true)
  }
  assert.equal(isPlatformAdministrator('head_of_command'), false)
  assert.equal(canDecideSignup({ role: 'head_of_command', memberships: [head('command')] }, ['victor']), false)
  assert.equal(isPlatformAdministrator('head_of_command', true), true)
  assert.equal(canDecideSignup({ role: 'tango_oscar', hasAdminAccess: true, memberships: [member('tango')] }, ['victor']), true)
})
test('admins decide any signup; unit heads decide only their own unit, by membership', () => {
  assert.equal(canDecideSignup({ role: 'admin' }, ['tango']), true)
  assert.equal(canDecideSignup({ role: 'super_admin' }, []), true)
  assert.equal(canDecideSignup({ role: 'head_tango_oscar', memberships: [head('tango')] }, ['tango']), true)
  assert.equal(canDecideSignup({ role: 'head_tango_oscar', memberships: [head('tango')] }, ['victor']), false)
  // Headship comes from an active head membership only: a head role whose row was
  // removed, or a plain member, decides nothing.
  assert.equal(canDecideSignup({ role: 'head_tango_oscar', memberships: [] }, ['tango']), false)
  assert.equal(canDecideSignup({ role: 'tango_oscar', memberships: [member('tango')] }, ['tango']), false)
  assert.equal(canApproveSignups('viewer', 'head_alpha_oscar'), false)
  assert.equal(canDecideSignup({ role: 'head_noscar_nest', memberships: [head('november_nest')] }, ['november_nest']), true)
  assert.equal(canDecideSignup({ role: 'head_noscar_nest', memberships: [head('november_nest')] }, ['november_den']), false)
  assert.equal(canDecideSignup({ role: 'head_of_command', memberships: [head('command')] }, ['command']), true)
})
test('only admins and unit heads can open signup approvals', () => {
  for (const role of ['admin', 'head_welfare_oscar', 'head_serial_oscar', 'captain', 'vice_captain', 'head_of_command']) assert.equal(canApproveSignups(role, null), true)
  for (const role of ['viewer', 'tango_oscar', 'command', null]) assert.equal(canApproveSignups(role, null), false)
})

test('an Oscar label never grants Command Centre or Live Tracking', () => {
  assert.equal(canAccessCommandCentre('delta_oscar', 'Command', false), false)
  assert.equal(canAccessCommandCentre('viewer', 'Head of Command', false), false)
  assert.equal(canAccessCommandCentre('viewer', 'admin', false), false)
  assert.equal(canViewLiveTracking('delta_oscar', 'Command', false), false)
  assert.equal(canViewLiveTracking('viewer', 'Head of Operations', false), false)
  // Admin and Command are unchanged.
  for (const role of ['super_admin', 'dev_admin', 'admin', 'command', 'head_of_command', 'captain', 'vice_captain']) {
    assert.equal(canAccessCommandCentre(role, null, false), true, role)
  }
  for (const role of ['super_admin', 'admin', 'command', 'head_of_command', 'head_of_operations', 'captain']) {
    assert.equal(canViewLiveTracking(role, null, false), true, role)
  }
  assert.equal(canAccessCommandCentre('delta_oscar', null, true), true)
  assert.equal(canViewLiveTracking('delta_oscar', null, true), true)
})
