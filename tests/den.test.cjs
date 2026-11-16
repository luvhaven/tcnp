const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const mod = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/den.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText, { exports: mod.exports, module: mod, require })
const { isDenOfficer, legacyDenAccessLevel, normalizeDenAccessLevel, compareDenMembers, resolveDenTab, describeProgrammeStanding, hasFloorAccessFor, resolveDenProgramme } = mod.exports

const migration = fs.readFileSync('supabase/migrations/20261115120000_november_den_unit_foundation.sql', 'utf8')

test('a Den officer is recognised by the Oscar they registered under, whatever their role', () => {
  assert.equal(isDenOfficer('viewer', 'November (Den)'), true)
  assert.equal(isDenOfficer('delta_oscar', 'November Oscar (Den)'), true)
  assert.equal(isDenOfficer('noscar_den', null), true)
  assert.equal(isDenOfficer('head_noscar_den', null), true)
})

test('other units and look-alike words are not Den', () => {
  assert.equal(isDenOfficer('viewer', 'November (Nest)'), false)
  assert.equal(isDenOfficer('noscar_nest', 'November Oscar (Nest)'), false)
  assert.equal(isDenOfficer('november_oscar', 'November Oscar'), false)
  assert.equal(isDenOfficer('viewer', 'November Garden'), false)
  assert.equal(isDenOfficer('viewer', 'Den'), false)
  assert.equal(isDenOfficer(null, null), false)
})

test('only the head role or a Head Den Oscar leads the unit', () => {
  assert.equal(legacyDenAccessLevel('head_noscar_den', 'November (Den)'), 'head')
  assert.equal(legacyDenAccessLevel('viewer', 'Head November Oscar (Den)'), 'head')
  assert.equal(legacyDenAccessLevel('viewer', 'November (Den)'), 'member')
  assert.equal(legacyDenAccessLevel('admin', 'November (Den)'), 'member')
  assert.equal(legacyDenAccessLevel('viewer', 'Head November Oscar (Nest)'), 'member')
})

test('membership levels outside the three known ones are ignored', () => {
  assert.equal(normalizeDenAccessLevel('sub_lead'), 'sub_lead')
  assert.equal(normalizeDenAccessLevel('owner'), null)
  assert.equal(normalizeDenAccessLevel(null), null)
})

test('the team list reads leads first, then by name', () => {
  const sorted = [
    { level: 'member', full_name: 'Bola' },
    { level: 'sub_lead', full_name: 'Zainab' },
    { level: 'member', full_name: 'Ada' },
    { level: 'head', full_name: 'Musa' },
  ].sort(compareDenMembers).map(member => member.full_name)
  assert.deepEqual(sorted, ['Musa', 'Zainab', 'Ada', 'Bola'])
})

test('an unknown or unavailable tab falls back to the overview', () => {
  assert.equal(resolveDenTab('vendors'), 'vendors')
  assert.equal(resolveDenTab(['service', 'vendors']), 'service')
  assert.equal(resolveDenTab('inventory'), 'inventory')
  assert.equal(resolveDenTab('not-a-tab'), 'overview')
  assert.equal(resolveDenTab(undefined), 'overview')
  assert.equal(resolveDenTab('guests', ['overview', 'service', 'vendors', 'locations']), 'overview')
})

test('the migration registers Den without touching roles or admin authority', () => {
  assert.match(migration, /INSERT INTO public\.units[\s\S]*'november_den'/)
  assert.match(migration, /CHECK \(access_level IN \('member', 'sub_lead', 'head'\)\)/)
  // Platform admins pass the new coordination check exactly as they pass can_manage_unit.
  assert.match(migration, /FUNCTION public\.can_coordinate_unit[\s\S]*SELECT public\.is_platform_admin\(\) OR EXISTS/)
  assert.doesNotMatch(migration, /UPDATE public\.users/i)
  assert.doesNotMatch(migration, /ALTER TYPE/i)
  assert.doesNotMatch(migration, /DROP POLICY IF EXISTS (?!unit_memberships_peer_select)/)
})

test('the migration keeps every existing unit in the membership bridge', () => {
  for (const slug of ['alpha', 'command', 'compliance', 'november_nest', 'november_den', 'tango', 'training', 'victor', 'welfare']) {
    assert.match(migration, new RegExp(`unit_record\\.slug = '${slug}'`), `sync trigger lost ${slug}`)
    assert.match(migration, new RegExp(`target_unit_slug = '${slug}'`), `head detection lost ${slug}`)
  }
})

test('Den members get floor access by adding policies, never by loosening existing ones', () => {
  const floor = fs.readFileSync('supabase/migrations/20261115130000_november_den_member_floor_access.sql', 'utf8')
  const created = [...floor.matchAll(/CREATE POLICY (\w+)/g)].map(match => match[1])
  assert.equal(created.length, 6)
  for (const name of created) assert.match(name, /_den_member_(insert|update)$/)
  // Only its own policies are dropped, deleting is not granted, and nothing else is altered.
  for (const dropped of floor.matchAll(/DROP POLICY IF EXISTS (\w+)/g)) assert.ok(created.includes(dropped[1]))
  assert.doesNotMatch(floor, /FOR (DELETE|ALL)/)
  assert.doesNotMatch(floor, /ALTER |UPDATE public\.|CREATE OR REPLACE/)
  assert.equal((floor.match(/is_unit_member\('november_den'\)/g) || []).length, 9)
})

test('availability is an offer; only an added officer is on the programme', () => {
  const standing = (a, l, p) => describeProgrammeStanding({ accepted_availability: a, on_officers_list: l, pending_approval: p }).state
  assert.equal(standing(true, false, false), 'available')
  assert.equal(standing(false, false, false), 'not_available')
  assert.equal(standing(false, false, true), 'pending')
  assert.equal(standing(true, true, false), 'on_programme')
  // Once added, nothing else matters — including a stale pending flag.
  assert.equal(standing(false, true, true), 'on_programme')
  assert.equal(describeProgrammeStanding(undefined).state, 'not_available')
})

test('floor actions show only for a programme the officer was granted', () => {
  assert.equal(hasFloorAccessFor(['p1'], 'p1'), true)
  assert.equal(hasFloorAccessFor(['p1'], 'p2'), false)
  assert.equal(hasFloorAccessFor(['p1'], 'all'), true)
  assert.equal(hasFloorAccessFor([], 'all'), false)
})

test('the programme-grant migration withdraws blanket access and needs both conditions', () => {
  const grants = fs.readFileSync('supabase/migrations/20261115140000_november_den_programme_floor_grants.sql', 'utf8')
  const blanket = fs.readFileSync('supabase/migrations/20261115130000_november_den_member_floor_access.sql', 'utf8')
  // Every policy the blanket migration created is dropped again.
  for (const [, name] of blanket.matchAll(/CREATE POLICY (\w+)/g)) {
    assert.match(grants, new RegExp(`DROP POLICY IF EXISTS ${name} `), `${name} is still in force`)
  }
  // Access = unit member AND active for the programme AND granted by the head.
  const access = grants.match(/FUNCTION public\.has_den_floor_access[\s\S]*?\$\$;/)[0]
  assert.match(access, /is_unit_member\('november_den'\)/)
  assert.match(access, /is_program_active_officer\(auth\.uid\(\), target_program\)/)
  assert.match(access, /den_floor_grants/)
  // Only the Den head (or a platform admin) grants, and only to an active officer.
  const insert = grants.match(/CREATE POLICY den_floor_grants_insert[\s\S]*?;/)[0]
  assert.match(insert, /can_manage_unit\('november_den'\)/)
  assert.match(insert, /is_program_active_officer\(user_id, program_id\)/)
  assert.match(insert, /granted_by = auth\.uid\(\)/)
  // Vendors go back to role-based access; nothing new is granted on them, and no deletes anywhere.
  assert.doesNotMatch(grants, /CREATE POLICY \w+ ON public\.vendors/)
  assert.doesNotMatch(grants, /FOR (DELETE|ALL) TO authenticated\s+USING \(public\.has_den_floor_access/)
  assert.doesNotMatch(grants, /UPDATE public\.users|ALTER TYPE/i)
})

test('an officer on the signup default role can still be added to a programme through their Oscar', () => {
  const route = fs.readFileSync('app/api/admin/bulk-assign-program/route.ts', 'utf8')
  assert.match(route, /roleToTitleMap\[u\.role\] \?\? roleToTitleMap\[oscarToRole\(u\.oscar\) \?\? ''\]/)
  assert.match(route, /select\('id, current_title_id, role, oscar, is_active, activation_status'\)/)
  // Still platform administrators only: who may add officers is unchanged.
  assert.match(route, /isPlatformAdministrator\(role, currentUser\?\.has_admin_access\)/)
})

test('the page opens on the one programme being worked on, unless the officer chose otherwise', () => {
  const one = [{ id: 'a', status: 'planning' }, { id: 'old', status: 'completed' }]
  const two = [{ id: 'a', status: 'planning' }, { id: 'b', status: 'active' }]
  assert.equal(resolveDenProgramme(null, one), 'a')
  assert.equal(resolveDenProgramme(null, two), 'all')
  assert.equal(resolveDenProgramme(null, []), 'all')
  // An explicit choice always wins, including "all".
  assert.equal(resolveDenProgramme('all', one), 'all')
  assert.equal(resolveDenProgramme('old', one), 'old')
  assert.equal(resolveDenProgramme('b', two), 'b')
})

test('a link to a programme that no longer exists falls back instead of showing nothing', () => {
  const one = [{ id: 'a', status: 'active' }]
  assert.equal(resolveDenProgramme('deleted', one), 'a')
  assert.equal(resolveDenProgramme('deleted', []), 'all')
  // While the list is still loading, a requested programme is trusted rather than flashing "all".
  assert.equal(resolveDenProgramme('from-link', [], false), 'from-link')
  assert.equal(resolveDenProgramme(null, [], false), 'all')
})
