// Operations pages on the one unit-access rule: unit scope comes from active
// unit_memberships, leadership from the role / admin grant, never Oscar text.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function load(file) {
  const mod = { exports: {} }
  // Every import is stubbed: only the pure helpers are exercised here.
  const stub = new Proxy(function () {}, { get: () => stub, apply: () => stub })
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports: mod.exports, module: mod, require: () => stub, console })
  return mod.exports
}

const { journeyInUnitScope, isOwnAssignment } = load('hooks/useMyOperations.ts')

const ME = 'user-1'
const base = {
  duty_officers: [], assigned_duty_officer_id: null, program_id: 'prog-1',
  origin: 'Hotel', destination: 'Venue',
  assigned_eagle_square_id: null, assigned_theatre_id: null, assigned_nest_id: null,
}
const eagle = { ...base, assigned_eagle_square_id: 'eagle-1' }
const theatre = { ...base, assigned_theatre_id: 'theatre-1' }
const nestByName = { ...base, destination: 'Grand Nest' }
const plain = { ...base }
const noProgramme = { ...base, program_id: null }

test('an officer always sees journeys they are assigned to as DO', () => {
  const mine = { ...plain, program_id: null, duty_officers: [{ user_id: ME, is_lead: true, status: 'acknowledged', users: null }] }
  for (const units of [[], ['alpha'], ['victor'], ['compliance']]) assert.equal(journeyInUnitScope(mine, units, ME), true, String(units))
  // A rejected DO row is not an assignment, even if the legacy lead column names them.
  const rejected = { ...mine, assigned_duty_officer_id: ME, duty_officers: [{ user_id: ME, is_lead: true, status: 'rejected', users: null }] }
  assert.equal(isOwnAssignment(rejected, ME), false)
  assert.equal(journeyInUnitScope(rejected, ['alpha'], ME), false)
  assert.equal(journeyInUnitScope({ ...plain, assigned_duty_officer_id: ME }, ['alpha'], ME), true)
})

test('unit scope comes from membership slugs', () => {
  // Alpha: eagle-square stage only.
  assert.equal(journeyInUnitScope(eagle, ['alpha'], ME), true)
  assert.equal(journeyInUnitScope({ ...plain, origin: 'Eagle Square 2' }, ['alpha'], ME), true)
  assert.equal(journeyInUnitScope(theatre, ['alpha'], ME), false)
  // Tango oversees every active journey.
  for (const j of [eagle, theatre, plain, noProgramme]) assert.equal(journeyInUnitScope(j, ['tango'], ME), true)
  // Victor: theatre stage.
  assert.equal(journeyInUnitScope(theatre, ['victor'], ME), true)
  assert.equal(journeyInUnitScope(eagle, ['victor'], ME), false)
  // November Den and Nest: nest or theatre stage.
  for (const slug of ['november_den', 'november_nest']) {
    assert.equal(journeyInUnitScope(nestByName, [slug], ME), true, slug)
    assert.equal(journeyInUnitScope(theatre, [slug], ME), true, slug)
    assert.equal(journeyInUnitScope(eagle, [slug], ME), false, slug)
  }
})

test('several units give the union of their stages', () => {
  assert.equal(journeyInUnitScope(eagle, ['victor', 'alpha'], ME), true)
  assert.equal(journeyInUnitScope(theatre, ['victor', 'alpha'], ME), true)
  assert.equal(journeyInUnitScope(nestByName, ['victor', 'alpha'], ME), false)
})

test('officers in no stage unit get the programme feed', () => {
  for (const units of [[], ['compliance'], ['welfare', 'serial'], ['command']]) {
    assert.equal(journeyInUnitScope(plain, units, ME), true, String(units))
    assert.equal(journeyInUnitScope(noProgramme, units, ME), false, String(units))
  }
  // A stage unit narrows the feed: an Alpha member no longer gets every programme journey.
  assert.equal(journeyInUnitScope(plain, ['alpha', 'compliance'], ME), false)
})

const read = (file) => fs.readFileSync(file, 'utf8')
const OWNED = [
  'hooks/useMyOperations.ts',
  'app/(dashboard)/journeys/JourneysClient.tsx',
  'components/operations/JourneyStatusTable.tsx',
  'app/(dashboard)/incidents/page.tsx',
  'app/(dashboard)/audit-logs/page.tsx',
  'app/(dashboard)/my-operations/page.tsx',
  'app/(dashboard)/programs/ProgramsClient.tsx',
  'app/(dashboard)/tracking/live/page.tsx',
  'app/(dashboard)/dashboard/page.tsx',
  'app/(dashboard)/echo/page.tsx',
  'components/tracking/LocationEnforcer.tsx',
]

test('operations pages take no permission from Oscar text or unit role keys', () => {
  for (const file of OWNED) {
    const source = read(file)
    assert.doesNotMatch(source, /effectiveOscarRole|oscarToRole|isUnitHeadRole|journeyMatchesRole|getUnitActionForRole/, file)
    // Echo names its briefing config keys ('echo_oscar' / 'head_echo_oscar'), chosen from the Echo level.
    const withoutBriefingKeys = file.endsWith('echo/page.tsx')
      ? source.replace("echoUnit.isHead || echoUnit.isSubLead ? 'head_echo_oscar' : echoUnit.isMember ? 'echo_oscar' : null", '')
      : source
    assert.doesNotMatch(withoutBriefingKeys, /'(head_)?(tango|alpha|victor|echo|serial|sierra)_oscar'|'(head_)?noscar_(den|nest)'/, file)
  }
})

test('the live map and its My Operations link apply the same leadership check without the Oscar', () => {
  for (const file of ['app/(dashboard)/tracking/live/page.tsx', 'app/(dashboard)/my-operations/page.tsx']) {
    assert.match(read(file), /canViewLiveTracking\(currentUser\.role, null, currentUser\.has_admin_access\)/, file)
  }
})

test('My Operations reads unit scope from the officer\'s own memberships', () => {
  const source = read('hooks/useMyOperations.ts')
  assert.match(source, /fetchActiveUnitMemberships\(supabase as any, user\.id\)/)
  assert.match(source, /memberUnitSlugs\(membershipRes\.memberships\)/)
  assert.match(source, /journeyInUnitScope\(j, unitSlugs, user\.id\)/)
  assert.match(source, /const isAdminUser = isAdmin\(role, userData\?\.has_admin_access\)/)
})

test('journey powers stay with leadership and the assigned DO', () => {
  const client = read('app/(dashboard)/journeys/JourneysClient.tsx')
  assert.match(client, /canManageJourney\(resolvedRole, journey\.assigned_do_id === resolvedUserId\)/)
  assert.match(client, /function journeyAuthorityRole\(/)
  const monitor = read('components/operations/JourneyStatusTable.tsx')
  assert.match(monitor, /userRole === 'delta_oscar'/)
  assert.match(monitor, /const isLeadership = Boolean\(currentUser && isAdmin\(currentUser\.role, currentUser\.has_admin_access\)\)/)
})

test('mission requests use the same Command check as the API', () => {
  const client = read('app/(dashboard)/programs/ProgramsClient.tsx')
  const api = read('app/api/missions/request-availability/route.ts')
  assert.match(client, /isCommandAuthority\(currentUser\.role, currentUser\.has_admin_access\)/)
  assert.match(api, /isCommandAuthority\(profile\.role, profile\.has_admin_access\)/)
  assert.doesNotMatch(client, /MISSION_REQUEST_ROLES/)
})

test('dashboard unit shortcut and Echo controls come from membership', () => {
  const dashboard = read('app/(dashboard)/dashboard/page.tsx')
  assert.match(dashboard, /getUnitActionForUnits\(memberUnitSlugs\(unitMemberships\)\)/)
  const echo = read('app/(dashboard)/echo/page.tsx')
  assert.match(echo, /useUnitAccess\('echo'\)/)
  assert.match(echo, /const canManage = roleCanManage \|\| echoUnit\.canCoordinate/)
})

test('the location prompt reads cached memberships and stays dismissible on a failed read', () => {
  const enforcer = read('components/tracking/LocationEnforcer.tsx')
  assert.match(enforcer, /useMyUnitMemberships\(\)/)
  assert.doesNotMatch(enforcer, /fetchActiveUnitMemberships|from\('users'\)/)
  const { locationPromptSkippable } = load('components/tracking/LocationEnforcer.tsx')
  const ready = { isLoading: false, loadFailed: false }
  assert.equal(locationPromptSkippable('delta_oscar', [], ready), false)
  assert.equal(locationPromptSkippable('delta_oscar', ['tango'], ready), true)
  assert.equal(locationPromptSkippable('admin', [], ready), true)
  assert.equal(locationPromptSkippable(null, [], ready), true)
  // A membership read that never succeeded (or is still loading) must not block a Tango officer.
  assert.equal(locationPromptSkippable('delta_oscar', [], { isLoading: false, loadFailed: true }), true)
  assert.equal(locationPromptSkippable('delta_oscar', [], { isLoading: true, loadFailed: false }), true)
})

test('Command Centre, its dashboard links and the live map ignore Oscar text', () => {
  for (const file of ['app/(dashboard)/command/page.tsx', 'app/(dashboard)/dashboard/page.tsx']) {
    const source = read(file)
    assert.doesNotMatch(source, /canAccessCommandCentre\([^)]*\.oscar/, file)
    assert.match(source, /canAccessCommandCentre\(currentUser\.role, null, currentUser\.has_admin_access\)/, file)
  }
  const command = read('app/(dashboard)/command/page.tsx')
  // The Live Tracking tile and button only show when /tracking/live would open.
  assert.match(command, /const canOpenLiveMap = Boolean\(currentUser && canViewLiveTracking\(currentUser\.role, null, currentUser\.has_admin_access\)\)/)
  assert.match(command, /\{canOpenLiveMap && \(/)
  assert.match(command, /modules\.map\(/)
  assert.doesNotMatch(command, /MODULES\.map\(/)

  const { canAccessCommandCentre, canViewLiveTracking } = load('lib/utils.ts')
  // How the pages call it: a DO or viewer whose Oscar reads "Command" is not let in.
  for (const role of ['delta_oscar', 'viewer']) {
    assert.equal(canAccessCommandCentre(role, null, false), false, role)
    assert.equal(canViewLiveTracking(role, null, false), false, role)
  }
  // Every role the Command Centre admits can also open the live map (no bounce).
  for (const role of ['super_admin', 'dev_admin', 'admin', 'command', 'head_of_command', 'captain', 'vice_captain']) {
    if (canAccessCommandCentre(role, null, false)) assert.equal(canViewLiveTracking(role, null, false), true, role)
  }
  assert.equal(canAccessCommandCentre('delta_oscar', null, true), canViewLiveTracking('delta_oscar', null, true))
})

test('the Journeys call-sign dialog updates journeys.status directly, not the broken RPC', () => {
  const client = read('app/(dashboard)/journeys/JourneysClient.tsx')
  assert.doesNotMatch(client, /rpc\('update_journey_call_sign'/)
  assert.match(client, /\.update\(\{ status: newStatus, current_status: newStatus, status_updated_at: now, updated_at: now \}\)/)
  assert.match(client, /if \(!updated \|\| updated\.length === 0\)/)
  // journey_events.event_type is the Title-case call_sign enum.
  assert.match(client, /CALL_SIGN_KEY_TO_DB_ENUM\[newStatus as CallSignKey\]/)
  assert.doesNotMatch(client, /event_type: newStatus/)
})
