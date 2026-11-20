const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

// Load a TypeScript module with "@/..." imports resolved to other loaded modules.
const cache = {}
function load(file) {
  if (cache[file]) return cache[file]
  const mod = { exports: {} }
  cache[file] = mod.exports
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const localRequire = (name) => {
    if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => key })
    if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`)
    return require(name)
  }
  vm.runInNewContext(source, { exports: mod.exports, module: mod, require: localRequire })
  cache[file] = mod.exports
  return mod.exports
}

const { getVisibleNav } = load('components/layout/nav-config.ts')
const hrefs = (...args) => getVisibleNav(...args).map(item => item.href)

test('Den and Serial are reachable through unit membership alone', () => {
  assert.ok(hrefs('viewer', 'November (Den)', ['november_den']).includes('/den'))
  assert.ok(hrefs('viewer', null, ['serial']).includes('/serial'))
  assert.ok(!hrefs('viewer', null, []).includes('/den'))
})

test('unit pages come from membership only, never from the role or the Oscar label', () => {
  // A role or Oscar alone no longer shows a unit page...
  assert.ok(!hrefs('tango_oscar', 'Tango Oscar', []).includes('/tango'))
  assert.ok(!hrefs('viewer', 'Victor Oscar', []).includes('/victor'))
  assert.ok(!hrefs('head_alpha_oscar', 'Alpha Oscar', []).includes('/alpha'))
  // ...the membership row does, whatever the role.
  assert.ok(hrefs('tango_oscar', 'Tango Oscar', ['tango']).includes('/tango'))
  assert.ok(hrefs('viewer', 'Victor Oscar', ['victor']).includes('/victor'))
  // A membership in one unit shows that unit only.
  const victor = hrefs('viewer', 'Victor Oscar', ['victor'])
  for (const href of ['/alpha', '/tango', '/nests', '/den', '/serial']) assert.ok(!victor.includes(href), href)
  // Echo members get the Echo page from their membership.
  assert.ok(hrefs('viewer', null, ['echo']).includes('/echo'))
  assert.ok(!victor.includes('/echo'), 'other units do not see Echo')
})

test('Command membership does not open the Command Centre link', () => {
  // command/page.tsx admits Admin and Command roles only, so a Command
  // member with the viewer role would be bounced; the link is not shown.
  assert.ok(!hrefs('viewer', 'Command', ['command']).includes('/command'))
  assert.ok(hrefs('command', 'Command', ['command']).includes('/command'))
  assert.ok(hrefs('admin', null, []).includes('/command'))
})

test('the SOP manual is in everyone\'s navigation', () => {
  assert.ok(hrefs('viewer', null, []).includes('/sop'))
  assert.ok(hrefs(null, null, []).includes('/sop'))
})

test('Officers is offered only to those the page admits', () => {
  assert.ok(hrefs('admin', null, []).includes('/officers'))
  assert.ok(hrefs('viewer', null, [], true).includes('/officers'))
  // Command and the heads of operations used to see a link that bounced them to the dashboard.
  for (const role of ['command', 'head_of_command', 'head_of_operations']) {
    assert.ok(!hrefs(role, null, []).includes('/officers'), role)
  }
})

test('the Head of Command sees Approvals for programme additions', () => {
  assert.ok(hrefs('head_of_command', null, []).includes('/approvals'))
  assert.ok(!hrefs('viewer', 'November (Den)', []).includes('/approvals'))
})

test('the Approvals link follows the Approvals page gate, so it never bounces', () => {
  // approvals/page.tsx admits platform admins, Command (isCommandAuthority:
  // is_admin() roles or admin access) and unit heads by MEMBERSHIP.
  for (const role of ['command', 'head_of_command', 'head_of_operations', 'captain', 'vice_captain']) {
    assert.ok(hrefs(role, null, []).includes('/approvals'), role)
  }
  // 'hop' is not a Command role in SQL is_admin(), so the page sends it away.
  assert.ok(!hrefs('hop', null, []).includes('/approvals'))
  assert.ok(hrefs('command', null, [], true).includes('/approvals'))
  // A curated head (head membership row, plain role) sees it.
  assert.ok(hrefs('viewer', null, ['tango'], false, [{ slug: 'tango', access_level: 'head', status: 'active' }]).includes('/approvals'))
  // With memberships known, headship comes from the row, not the role: a head
  // role whose head row was removed is not shown the link.
  assert.ok(!hrefs('head_tango_oscar', null, ['tango'], false, [{ slug: 'tango', access_level: 'member', status: 'active' }]).includes('/approvals'))
  // Before the rows load (undefined) the head role still counts, as on the page.
  assert.ok(hrefs('head_tango_oscar', null, ['tango'], false, undefined).includes('/approvals'))
  // A plain member, and a "Head ..." Oscar label, see nothing.
  assert.ok(!hrefs('viewer', null, ['tango'], false, [{ slug: 'tango', access_level: 'member', status: 'active' }]).includes('/approvals'))
  assert.ok(!hrefs('viewer', 'Head Tango Oscar', [], false, []).includes('/approvals'))
})

test('the nav link and the Approvals page use the same three checks', () => {
  const { canApproveSignups } = load('lib/utils.ts')
  const { isCommandAuthority } = load('lib/unit-access.ts')
  const { canApproveProgramAdditions } = load('lib/program-additions.ts')
  const pageGate = (role, admin, rows) => canApproveSignups(role, null, admin, rows)
    || isCommandAuthority(role, admin) || canApproveProgramAdditions(role, admin)
  const roles = ['viewer', 'delta_oscar', 'tango_oscar', 'head_tango_oscar', 'head_victor_oscar', 'command',
    'head_of_command', 'head_of_operations', 'hod', 'hop', 'captain', 'vice_captain', 'admin', 'super_admin', 'dev_admin']
  const rowSets = [undefined, [], [{ slug: 'alpha', access_level: 'head', status: 'active' }],
    [{ slug: 'alpha', access_level: 'sub_lead', status: 'active' }], [{ slug: 'alpha', access_level: 'head', status: 'inactive' }]]
  for (const role of roles) for (const admin of [false, true]) for (const rows of rowSets) {
    assert.equal(hrefs(role, null, [], admin, rows).includes('/approvals'), pageGate(role, admin, rows), `${role} ${admin} ${JSON.stringify(rows)}`)
  }
  const page = fs.readFileSync('app/(dashboard)/approvals/page.tsx', 'utf8')
  assert.match(page, /canApproveSignups\(caller\.role, null, caller\.has_admin_access, membershipError \? undefined : memberships\)/)
  assert.match(page, /isCommandAuthority\(caller\.role, caller\.has_admin_access\)/)
  assert.match(page, /canApproveProgramAdditions\(caller\.role, caller\.has_admin_access\)/)
})

test('sidebar and BottomNav pass head memberships to getVisibleNav, and never the Oscar', () => {
  for (const file of ['components/layout/sidebar.tsx', 'components/layout/BottomNav.tsx']) {
    const source = fs.readFileSync(file, 'utf8')
    assert.match(source, /getVisibleNav\(currentUser\?\.role \?\? null, null, unitSlugs, currentUser\?\.has_admin_access \?\? undefined, navMemberships\)/, file)
    assert.match(source, /const navMemberships = membershipsLoading \|\| membershipsFailed \? undefined : memberships/, file)
    assert.doesNotMatch(source, /currentUser\?\.oscar/, file)
  }
})

test('an Oscar label never opens the Command Centre link', () => {
  assert.ok(!hrefs('delta_oscar', 'Command', []).includes('/command'))
  assert.ok(!hrefs('viewer', 'Head of Command', ['command']).includes('/command'))
})

test('Journeys is listed for leadership', () => {
  assert.ok(hrefs('admin', null, []).includes('/journeys'))
})
