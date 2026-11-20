const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function load(file) {
  const mod = { exports: {} }
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  }).outputText
  vm.runInNewContext(source, { exports: mod.exports, module: mod, require, Promise })
  return mod.exports
}

const {
  unitAccess,
  canWorkUnitProgramme,
  memberUnitSlugs,
  isCommandAuthority,
  isPlatformAdminAuthority,
  fetchActiveUnitMemberships,
  plainUnitOscar,
  unitOscarLabelForRole,
  UNIT_SLUGS,
} = load('lib/unit-access.ts')
const { oscarToRole } = load('lib/utils.ts')

const den = [{ slug: 'november_den', access_level: 'member' }]
const plain = (value) => JSON.parse(JSON.stringify(value))

test('a viewer who is a member of a unit is treated like any other member', () => {
  const viewer = unitAccess(den, 'november_den', { role: 'viewer' })
  const roleMember = unitAccess(den, 'november_den', { role: 'noscar_den' })
  assert.deepEqual(plain(viewer), plain(roleMember))
  assert.equal(viewer.isMember, true)
  assert.equal(viewer.canCoordinate, false)
  assert.equal(viewer.canManage, false)
})

test('a unit role without a membership row grants nothing', () => {
  for (const role of ['tango_oscar', 'head_tango_oscar', 'victor_oscar', 'noscar_den']) {
    const access = unitAccess([], 'tango', { role })
    assert.equal(access.isMember, false, role)
    assert.equal(access.canManage, false, role)
    assert.equal(access.canCoordinate, false, role)
  }
})

test('membership in one unit gives nothing in another', () => {
  const access = unitAccess([{ slug: 'victor', access_level: 'head' }], 'tango', { role: 'head_victor_oscar' })
  assert.equal(access.isMember, false)
  assert.equal(access.canManage, false)
})

test('levels: sub-lead coordinates, head coordinates and manages', () => {
  const sub = unitAccess([{ slug: 'welfare', access_level: 'sub_lead' }], 'welfare', { role: 'viewer' })
  assert.deepEqual([sub.isMember, sub.isSubLead, sub.isHead, sub.canCoordinate, sub.canManage], [true, true, false, true, false])
  const head = unitAccess([{ slug: 'welfare', access_level: 'head' }], 'welfare', { role: 'head_welfare_oscar' })
  assert.deepEqual([head.isMember, head.isSubLead, head.isHead, head.canCoordinate, head.canManage], [true, false, true, true, true])
})

test('rows that are not active are ignored', () => {
  const access = unitAccess([{ slug: 'tango', access_level: 'head', status: 'inactive' }], 'tango', { role: 'head_tango_oscar' })
  assert.equal(access.isMember, false)
  assert.equal(access.isHead, false)
})

test('platform administrators coordinate and manage every unit', () => {
  for (const viewer of [{ role: 'super_admin' }, { role: 'admin' }, { role: 'dev_admin' }, { role: 'captain' }, { role: 'vice_captain' }, { role: 'viewer', hasAdminAccess: true }]) {
    const access = unitAccess([], 'serial', viewer)
    assert.equal(access.isPlatformAdmin, true, viewer.role)
    assert.equal(access.isCommand, true, viewer.role)
    assert.equal(access.canManage, true, viewer.role)
    assert.equal(access.canCoordinate, true, viewer.role)
    assert.equal(access.isMember, false, viewer.role)
  }
})

test('Command keeps oversight (isCommand) but does not manage units', () => {
  for (const role of ['command', 'head_of_command', 'head_of_operations']) {
    const access = unitAccess([], 'tango', { role })
    assert.equal(access.isCommand, true, role)
    assert.equal(access.isPlatformAdmin, false, role)
    assert.equal(access.canManage, false, role)
  }
})

test('isCommand mirrors SQL is_admin(): hod and hop are not Command in the database', () => {
  assert.equal(isCommandAuthority('hod'), false)
  assert.equal(isCommandAuthority('hop'), false)
  assert.equal(isCommandAuthority('viewer'), false)
  assert.equal(isCommandAuthority('viewer', true), true)
  assert.equal(isCommandAuthority(null), false)
  assert.equal(isPlatformAdminAuthority('command'), false)
  assert.equal(isPlatformAdminAuthority('head_of_command', true), true)
})

test('programme work needs membership, the programme, and coordination or a grant', () => {
  const member = unitAccess(den, 'november_den', { role: 'viewer' })
  assert.equal(canWorkUnitProgramme(member, { activeOnProgramme: true }), false)
  assert.equal(canWorkUnitProgramme(member, { activeOnProgramme: true, hasGrant: true }), true)
  assert.equal(canWorkUnitProgramme(member, { activeOnProgramme: false, hasGrant: true }), false)
  const head = unitAccess([{ slug: 'november_den', access_level: 'head' }], 'november_den', { role: 'viewer' })
  assert.equal(canWorkUnitProgramme(head, { activeOnProgramme: true }), true)
  assert.equal(canWorkUnitProgramme(head, { activeOnProgramme: false }), false)
  const outsider = unitAccess([], 'november_den', { role: 'viewer' })
  assert.equal(canWorkUnitProgramme(outsider, { activeOnProgramme: true, hasGrant: true }), false)
  const admin = unitAccess([], 'november_den', { role: 'admin' })
  assert.equal(canWorkUnitProgramme(admin, { activeOnProgramme: false }), true)
})

test('memberUnitSlugs lists active units once', () => {
  assert.deepEqual(plain(memberUnitSlugs([
    { slug: 'serial', access_level: 'member' },
    { slug: 'serial', access_level: 'member' },
    { slug: 'tango', access_level: 'member', status: 'inactive' },
    { slug: 'echo', access_level: 'head', status: 'active' },
  ])), ['serial', 'echo'])
  assert.deepEqual(plain(memberUnitSlugs(null)), [])
})

test('serial and echo are units', () => {
  assert.ok(UNIT_SLUGS.includes('serial'))
  assert.ok(UNIT_SLUGS.includes('echo'))
})

test('fetchActiveUnitMemberships reads active rows in active units and reports errors', async () => {
  const calls = []
  const client = (result) => ({
    from(table) {
      calls.push(['from', table])
      const chain = {
        select(columns) { calls.push(['select', columns]); return chain },
        eq(column, value) { calls.push(['eq', column, value]); return chain },
        then(resolve) { resolve(result) },
      }
      return chain
    },
  })
  const ok = await fetchActiveUnitMemberships(client({ data: [
    { access_level: 'head', status: 'active', units: { slug: 'serial' } },
    { access_level: 'member', status: 'active', units: null },
  ], error: null }), 'user-1')
  assert.deepEqual(plain(ok.memberships), [{ slug: 'serial', access_level: 'head', status: 'active' }])
  assert.equal(ok.error, null)
  assert.deepEqual(calls.filter(call => call[0] === 'eq').map(call => call.slice(1)), [
    ['user_id', 'user-1'], ['status', 'active'], ['units.is_active', true],
  ])
  const failed = await fetchActiveUnitMemberships(client({ data: null, error: { message: 'boom' } }), 'user-1')
  assert.deepEqual(plain(failed.memberships), [])
  assert.ok(failed.error)
})

test('useUnitAccess has no role or Oscar fallback and exposes loadFailed', () => {
  const source = fs.readFileSync('hooks/useUnitAccess.ts', 'utf8')
  assert.doesNotMatch(source, /isUnitHeadRole|oscarToRole|effectiveOscarRole/)
  assert.match(source, /loadFailed/)
  assert.match(source, /'unit-access', 'my-memberships'/)
})

test('the sidebar and the bottom bar share the memberships hook', () => {
  for (const file of ['components/layout/sidebar.tsx', 'components/layout/BottomNav.tsx']) {
    const source = fs.readFileSync(file, 'utf8')
    assert.match(source, /useMyUnitMemberships\(\)/, file)
    assert.match(source, /getVisibleNav\([^)]*unitSlugs/, file)
  }
})

test('admin user routes keep a viewer\'s unit Oscar but never a head marker', () => {
  const update = fs.readFileSync('app/api/admin/update-user/route.ts', 'utf8')
  assert.doesNotMatch(update, /desiredRole === 'viewer' \? null/)
  assert.match(update, /OSCAR_KEEPING_ROLES = new Set\(\['viewer', 'delta_oscar'\]\)/)
  assert.match(update, /plainUnitOscar\(\(targetUser/)
  assert.match(update, /plainUnitOscar\(requestedOscar, oscarToRole\)/)
  assert.match(update, /unitOscarLabelForRole\(desiredRole\)/)
  const create = fs.readFileSync('app/api/admin/create-user/route.ts', 'utf8')
  assert.match(create, /plainUnitOscar\(requestedOscar, oscarToRole\)/)
  assert.match(create, /unitOscarLabelForRole\(role\)/)
})

test('unit Oscar labels: a role key becomes the plain unit label', () => {
  assert.equal(unitOscarLabelForRole('head_alpha_oscar'), 'Alpha Oscar')
  assert.equal(unitOscarLabelForRole('alpha_oscar'), 'Alpha Oscar')
  assert.equal(unitOscarLabelForRole('head_of_command'), 'Command')
  assert.equal(unitOscarLabelForRole('head_noscar_den'), 'November (Den)')
  assert.equal(unitOscarLabelForRole('head_sierra_oscar'), 'Serial Oscar')
  assert.equal(unitOscarLabelForRole('viewer'), null)
  assert.equal(unitOscarLabelForRole('head_of_operations'), null)
  assert.equal(unitOscarLabelForRole(null), null)
})

test('plainUnitOscar keeps the unit and drops any head marker', () => {
  const plainOscar = (value) => plainUnitOscar(value, oscarToRole)
  assert.equal(plainOscar('head_alpha_oscar'), 'Alpha Oscar')
  assert.equal(plainOscar('head_of_command'), 'Command')
  assert.equal(plainOscar('Head of Command'), 'Command')
  assert.equal(plainOscar('Head Tango Oscar'), 'Tango Oscar')
  assert.equal(plainOscar('Head, Victor Oscar'), 'Victor Oscar')
  assert.equal(plainOscar('Head November Oscar (Den)'), 'November (Den)')
  assert.equal(plainOscar('Head, November (Nest)'), 'November (Nest)')
  assert.equal(plainOscar('Head, Training Oscar'), 'Training Oscar')
  assert.equal(plainOscar('head_serial_oscar'), 'Serial Oscar')
  // Labels without a head marker are kept as they are.
  assert.equal(plainOscar('Alpha Oscar'), 'Alpha Oscar')
  assert.equal(plainOscar('November (Den)'), 'November (Den)')
  assert.equal(plainOscar('OSCAR-EF-COMMAND'), 'OSCAR-EF-COMMAND')
  // A head marker naming no unit is left alone (it grants nothing anywhere).
  assert.equal(plainOscar('Head of Operations'), 'Head of Operations')
  assert.equal(plainOscar('  '), null)
  assert.equal(plainOscar(null), null)
  for (const value of ['head_alpha_oscar', 'Head Tango Oscar', 'head_of_command', 'Head, Welfare Oscar']) {
    assert.doesNotMatch(plainOscar(value), /head/i, value)
  }
})

test('the memberships hook keeps its last good rows when a refetch fails', () => {
  const source = fs.readFileSync('hooks/useUnitAccess.ts', 'utf8')
  assert.match(source, /memberships: query\.data \?\? NO_MEMBERSHIPS/)
  assert.match(source, /loadFailed: query\.isError && query\.data === undefined/)
  assert.doesNotMatch(source, /retry: 1/)
  assert.doesNotMatch(source, /query\.isError \? NO_MEMBERSHIPS/)
})

test('the migration keeps Command on cheetahs and takes headship from the role only', () => {
  const sql = fs.readFileSync('supabase/migrations/20261116170000_unit_access_single_rule.sql', 'utf8')
  assert.match(sql, /CREATE POLICY cheetahs_command_manage ON public\.cheetahs\s+FOR ALL TO authenticated\s+USING \(public\.is_admin\(\)\)\s+WITH CHECK \(public\.is_admin\(\)\)/)
  const level = sql.slice(
    sql.indexOf('CREATE OR REPLACE FUNCTION public.legacy_unit_access_level'),
    sql.indexOf('CREATE OR REPLACE FUNCTION public.rebuild_legacy_unit_memberships'),
  )
  assert.doesNotMatch(level, /coalesce\(target_oscar/)
  assert.match(sql, /'serial-media', 'serial-media', false,/)
  assert.match(sql, /DROP POLICY IF EXISTS "Authenticated users can delete VIP photos" ON storage\.objects;/)
  const accommodations = sql.slice(
    sql.indexOf('CREATE POLICY papa_accommodations_select'),
    sql.indexOf('DROP POLICY IF EXISTS papa_accommodations_write'),
  )
  assert.doesNotMatch(accommodations, /is_unit_member\('november_den'\)/)
})

test('unit API routes read memberships, not unit role lists', () => {
  for (const file of [
    'app/api/papas/[id]/role-update/route.ts',
    'app/api/flights/route.ts',
    'app/api/welfare/food-ready/route.ts',
  ]) {
    const source = fs.readFileSync(file, 'utf8')
    assert.match(source, /fetchActiveUnitMemberships\(supabase/, file)
    assert.doesNotMatch(source, /effectiveOscarRole|canManageEagles|'welfare_oscar'|'noscar_den'/, file)
  }
  for (const file of ['app/api/journey-duty-officers/route.ts', 'app/api/missions/request-availability/route.ts']) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /effectiveOscarRole|ALLOWED_ROLES/, file)
  }
})
