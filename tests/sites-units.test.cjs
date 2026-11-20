// Den, Nest, Welfare, Serial and Training on the one unit-access rule:
// every button mirrors the RLS policy that judges its write.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function compile(file, imports = {}, globals = {}) {
  const mod = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2021 },
  }).outputText, { module: mod, exports: mod.exports, require: name => imports[name] || require(name), console, ...globals })
  return mod.exports
}

const access = compile('lib/unit-access.ts')
const site = compile('lib/site-unit-permissions.ts', { './unit-access': access })

// Viewers built with the real client mirror (lib/unit-access.ts).
const at = (slug, level, role = 'viewer', hasAdminAccess = false) =>
  access.unitAccess(level ? [{ slug, access_level: level, status: 'active' }] : [], slug, { role, hasAdminAccess })
const officer = (memberships, role = 'viewer', hasAdminAccess = false) => ({
  den: access.unitAccess(memberships, 'november_den', { role, hasAdminAccess }),
  nest: access.unitAccess(memberships, 'november_nest', { role, hasAdminAccess }),
  welfare: access.unitAccess(memberships, 'welfare', { role, hasAdminAccess }),
  serial: access.unitAccess(memberships, 'serial', { role, hasAdminAccess }),
  training: access.unitAccess(memberships, 'training', { role, hasAdminAccess }),
})
const m = (slug, access_level) => ({ slug, access_level, status: 'active' })

const PEOPLE = {
  admin: officer([], 'super_admin'),
  command: officer([], 'command'),
  headOfCommand: officer([], 'head_of_command', true),
  noUnit: officer([]),
  denViewer: officer([m('november_den', 'member')]),
  noscarDen: officer([m('november_den', 'member')], 'noscar_den'),
  denSubLead: officer([m('november_den', 'sub_lead')]),
  denHead: officer([m('november_den', 'head')], 'head_noscar_den'),
  nestViewer: officer([m('november_nest', 'member')]),
  nestHead: officer([m('november_nest', 'head')], 'head_noscar_nest'),
  welfareViewer: officer([m('welfare', 'member')]),
  welfareHead: officer([m('welfare', 'head')], 'head_welfare_oscar'),
  serialViewer: officer([m('serial', 'member')]),
  serialSubLead: officer([m('serial', 'sub_lead')]),
  serialHead: officer([m('serial', 'head')], 'head_serial_oscar'),
  trainingHead: officer([m('training', 'head')]),
  trainingViewer: officer([m('training', 'member')]),
}

test('Den: vendors mirror can_edit_vendors(), deletes need a head, the noscar_den role grants nothing extra', () => {
  const editors = Object.entries(PEOPLE).filter(([, who]) => site.canEditVendors(who)).map(([name]) => name).sort()
  assert.deepEqual(editors, ['admin', 'command', 'denHead', 'denSubLead', 'headOfCommand', 'nestHead', 'welfareHead'])
  const deleters = Object.entries(PEOPLE).filter(([, who]) => site.canDeleteVendors(who)).map(([name]) => name).sort()
  assert.deepEqual(deleters, ['admin', 'command', 'denHead', 'headOfCommand', 'nestHead', 'welfareHead'])
  assert.equal(site.canEditVendors(PEOPLE.noscarDen), false, 'the old canManageWelfare role path is gone')
})

test('Den: menus and orders open to programme work only when the database says so', () => {
  const { denViewer, noscarDen, denSubLead, nestViewer, nestHead, welfareViewer, command } = PEOPLE
  for (const who of [denViewer, noscarDen, nestViewer, welfareViewer]) {
    assert.equal(site.canEditMenus(who, {}), false)
    assert.equal(site.canTakeMealOrders(who, {}), false)
  }
  // Den floor grant / unit grant on the selected programme (can_work_unit_programme).
  assert.equal(site.canEditMenus(denViewer, { den: true }), true)
  assert.equal(site.canTakeMealOrders(denViewer, { den: true }), true)
  assert.equal(site.canEditMenus(welfareViewer, { welfare: true }), true)
  assert.equal(site.canTakeMealOrders(nestViewer, { nest: true }), true)
  // program_menus has no Nest programme work; papa_meal_orders has no Welfare one.
  assert.equal(site.canEditMenus(nestViewer, { nest: true }), false)
  assert.equal(site.canTakeMealOrders(welfareViewer, { welfare: true }), false)
  // Coordinators and Command need no programme answer.
  assert.equal(site.canEditMenus(denSubLead, {}), true)
  assert.equal(site.canTakeMealOrders(denSubLead, {}), true)
  assert.equal(site.canTakeMealOrders(nestHead, {}), true)
  assert.equal(site.canEditMenus(nestHead, {}), true)
  assert.equal(site.canEditMenus(command, {}), true)
  // Programme workers may edit menus but not delete them (delete is head-only).
  assert.equal(site.canDeleteMenus(denViewer), false)
  assert.equal(site.canDeleteMenus(denSubLead), false)
  assert.equal(site.canDeleteMenus(PEOPLE.denHead), true)
})

test('Den and Nest locations: heads plus Command; postings keep their own short Command list', () => {
  assert.equal(site.canManageDenLocations(PEOPLE.denHead.den), true)
  assert.equal(site.canManageDenLocations(PEOPLE.command.den), true)
  assert.equal(site.canManageDenLocations(PEOPLE.noscarDen.den), false)
  assert.equal(site.canManageDenLocations(PEOPLE.nestHead.den), false)
  assert.equal(site.canManageHotels(PEOPLE.nestHead.nest), true)
  assert.equal(site.canManageHotels(PEOPLE.denHead.nest), false, 'the Den head no longer writes hotel rows')
  assert.equal(site.canManageHotels(PEOPLE.nestViewer.nest), false)
  assert.equal(site.canManageHotels(PEOPLE.command.nest), true)

  // Postings are scoped by the site's unit: hotels by Nest, lounges by Den.
  const post = (name, role, unit, work = false) => site.canManagePostings(role, PEOPLE[name][unit], work)
  for (const unit of ['nest', 'den']) {
    assert.equal(post('admin', 'super_admin', unit), true)
    assert.equal(post('headOfCommand', 'head_of_command', unit), true)
    assert.equal(post('command', 'command', unit), false, "'command' is not in the noscar_assignments list")
  }
  assert.equal(post('denSubLead', 'viewer', 'den'), true)
  assert.equal(post('denSubLead', 'viewer', 'nest'), false, 'a Den sub-lead does not staff Nest hotels')
  assert.equal(post('nestHead', 'head_noscar_nest', 'nest'), true)
  assert.equal(post('nestHead', 'head_noscar_nest', 'den'), false, 'the Nest head does not staff Den lounges')
  assert.equal(post('noscarDen', 'noscar_den', 'den'), false)
  assert.equal(post('nestViewer', 'viewer', 'nest'), false)
  assert.equal(post('nestViewer', 'viewer', 'nest', true), true, 'Nest work on the programme posts at hotels')
  // The caller passes only its own unit's work, so a Den floor grant never
  // reaches a hotel: the Nest page passes nest work, the Den page den work.
  assert.equal(post('denViewer', 'viewer', 'nest', false), false)
  const vice = officer([], 'vice_captain')
  assert.equal(site.canManagePostings('vice_captain', vice.nest, false), true, 'platform admins pass can_coordinate_unit')
  assert.equal(site.canManagePostings('vice_captain', vice.den, false), true)
})

test('Nest: comfort checks are Nest-only, guest experiences head-only, accommodation by policy', () => {
  assert.equal(site.canLogComfortCheck(PEOPLE.nestViewer.nest), true)
  assert.equal(site.canLogComfortCheck(PEOPLE.command.nest), true)
  assert.equal(site.canLogComfortCheck(PEOPLE.denViewer.nest), false, 'Den members no longer log Nest comfort checks')
  assert.equal(site.canLogComfortCheck(PEOPLE.denHead.nest), false)
  assert.equal(site.canEditGuestExperiences(PEOPLE.nestHead.nest), true)
  assert.equal(site.canEditGuestExperiences(PEOPLE.admin.nest), true)
  assert.equal(site.canEditGuestExperiences(PEOPLE.command.nest), false, 'hospitality_places is can_manage_unit only')
  assert.equal(site.canEditGuestExperiences(PEOPLE.nestViewer.nest), false)
  assert.equal(site.canEditAccommodations(PEOPLE.nestViewer.nest, {}), false)
  assert.equal(site.canEditAccommodations(PEOPLE.nestViewer.nest, { nest: true }), true)
  assert.equal(site.canEditAccommodations(PEOPLE.command.nest, {}), true)
  assert.equal(site.canDeleteAccommodations(PEOPLE.nestViewer.nest), false)
  assert.equal(site.canDeleteAccommodations(PEOPLE.nestHead.nest), true)
})

test('briefing config comes from the level, never from the role', () => {
  assert.equal(site.briefingConfigKey('november_den', PEOPLE.denViewer.den), 'noscar_den')
  assert.equal(site.briefingConfigKey('november_den', PEOPLE.noscarDen.den), 'noscar_den')
  assert.equal(site.briefingConfigKey('november_den', PEOPLE.denSubLead.den), 'head_noscar_den')
  assert.equal(site.briefingConfigKey('november_den', PEOPLE.admin.den), 'head_noscar_den')
  assert.equal(site.briefingConfigKey('november_den', PEOPLE.command.den), null)
  assert.equal(site.briefingConfigKey('november_nest', PEOPLE.nestViewer.nest), 'noscar_nest')
  assert.equal(site.briefingConfigKey('november_nest', PEOPLE.nestHead.nest), 'head_noscar_nest')
  assert.equal(site.briefingConfigKey('november_nest', PEOPLE.denHead.nest), null)
  // The keys exist in the briefing config (what the role-update API accepts).
  const fields = fs.readFileSync('lib/constants/papaBriefingFields.ts', 'utf8')
  for (const key of ['noscar_den', 'head_noscar_den', 'noscar_nest', 'head_noscar_nest']) assert.match(fields, new RegExp(`\\n  ${key}: \\{`))
})

test('Welfare: food alarm follows the food-ready route, directory and operations need the head', () => {
  const alarm = (who, work = {}) => site.canSoundFoodAlarm(who, work)
  assert.equal(alarm(PEOPLE.command), true)
  assert.equal(alarm(PEOPLE.welfareHead), true)
  assert.equal(alarm(PEOPLE.denSubLead), true)
  assert.equal(alarm(PEOPLE.noscarDen), false, 'the noscar_den role no longer sounds the alarm')
  assert.equal(alarm(PEOPLE.welfareViewer), false)
  assert.equal(alarm(PEOPLE.welfareViewer, { welfare: true }), true)
  assert.equal(alarm(PEOPLE.denViewer, { den: true }), true)
  assert.equal(alarm(PEOPLE.nestHead), false)
  assert.equal(site.mayBeFoodAlarmWorker(PEOPLE.welfareViewer), true)
  assert.equal(site.mayBeFoodAlarmWorker(PEOPLE.noUnit), false)
  assert.equal(site.canSeeWelfareDirectory(PEOPLE.welfareHead.welfare), true)
  assert.equal(site.canSeeWelfareDirectory(PEOPLE.admin.welfare), true)
  assert.equal(site.canSeeWelfareDirectory(PEOPLE.command.welfare), false, 'get_welfare_directory_safe returns nothing to non-managers')
  assert.equal(site.canSeeWelfareDirectory(PEOPLE.welfareViewer.welfare), false)
  assert.equal(site.canManageWelfareOperations(PEOPLE.welfareHead.welfare), true)
  assert.equal(site.canManageWelfareOperations(PEOPLE.welfareViewer.welfare), false)

  // The route applies the same rule (kept in step with lib/site-unit-permissions).
  const route = fs.readFileSync('app/api/welfare/food-ready/route.ts', 'utf8')
  assert.match(route, /ALARM_UNITS = \['welfare', 'november_den'\]/)
  assert.match(route, /isCommandAuthority\(profile\.role, profile\.has_admin_access\)/)
  assert.match(route, /can_work_unit_programme/)
})

test('Serial: a viewer member reads and uploads; edits own; coordinators edit all; head deletes', () => {
  const asset = { uploaded_by: 'me' }
  const theirs = { uploaded_by: 'someone-else' }
  const viewer = site.serialPermissions(PEOPLE.serialViewer.serial, 'me')
  assert.equal(viewer.canView, true, 'a Serial viewer is no longer refused')
  assert.equal(viewer.canUpload, true)
  assert.equal(viewer.canEditAsset(asset), true)
  assert.equal(viewer.canEditAsset(theirs), false)
  assert.equal(viewer.canDelete, false)
  const sub = site.serialPermissions(PEOPLE.serialSubLead.serial, 'me')
  assert.equal(sub.canEditAsset(theirs), true)
  assert.equal(sub.canDelete, false)
  const head = site.serialPermissions(PEOPLE.serialHead.serial, 'me')
  assert.equal(head.canDelete, true)
  const command = site.serialPermissions(PEOPLE.command.serial, 'me')
  assert.equal(command.canView && command.canDelete && command.canEditAsset(theirs), true)
  const outsider = site.serialPermissions(PEOPLE.denHead.serial, 'me')
  assert.equal(outsider.canView || outsider.canUpload || outsider.canDelete || outsider.canEditAsset(asset), false)
  assert.equal(site.serialPermissions(PEOPLE.serialViewer.serial, null).canEditAsset({ uploaded_by: null }), false)
})

test('Serial signed URLs: distinct sorted paths, batched, failed rows left out', () => {
  assert.deepEqual(Array.from(site.serialStoragePaths([{ storage_path: 'b' }, { storage_path: 'a' }, { storage_path: 'b' }, { storage_path: null }])), ['a', 'b'])
  assert.deepEqual(Array.from(site.chunk([1, 2, 3, 4, 5], 2), part => Array.from(part)), [[1, 2], [3, 4], [5]])
  const map = site.signedUrlMap([
    { path: 'a', signedUrl: 'https://signed/a', error: null },
    { path: 'b', signedUrl: null, error: 'Object not found' },
    { path: null, signedUrl: 'x', error: null },
  ])
  assert.deepEqual({ ...map }, { a: 'https://signed/a' })
  assert.ok(site.SERIAL_SIGNED_URL_REFRESH_MS < site.SERIAL_SIGNED_URL_SECONDS * 1000, 'URLs are re-signed before they expire')
  assert.equal(site.SERIAL_SIGNED_URL_BATCH, 100)
})

test('Training: every write is can_manage_unit(training)', () => {
  assert.equal(site.canManageTraining(PEOPLE.trainingHead.training), true)
  assert.equal(site.canManageTraining(PEOPLE.admin.training), true)
  assert.equal(site.canManageTraining(PEOPLE.trainingViewer.training), false)
  assert.equal(site.canManageTraining(PEOPLE.command.training), false, 'Training policies do not include Command')
})

test('programme notice says when a member is not active on the programme', () => {
  const base = { work: 'take orders', granter: 'the Den head', canWork: false }
  const viewer = PEOPLE.denViewer.den
  assert.match(site.programmeWorkNotice({ ...base, access: viewer, programmeSelected: true, activeOnProgramme: false }), /not active on this programme yet/)
  assert.match(site.programmeWorkNotice({ ...base, access: viewer, programmeSelected: true, activeOnProgramme: true }), /the Den head has not given you/)
  assert.match(site.programmeWorkNotice({ ...base, access: viewer, programmeSelected: false, activeOnProgramme: null }), /Choose a programme/)
  assert.equal(site.programmeWorkNotice({ ...base, access: viewer, programmeSelected: true, activeOnProgramme: null }), null, 'nothing while unknown')
  assert.equal(site.programmeWorkNotice({ ...base, access: viewer, programmeSelected: true, activeOnProgramme: true, canWork: true }), null)
  assert.equal(site.programmeWorkNotice({ ...base, access: PEOPLE.denSubLead.den, programmeSelected: true, activeOnProgramme: false }), null)
  assert.equal(site.programmeWorkNotice({ ...base, access: PEOPLE.command.den, programmeSelected: true, activeOnProgramme: false }), null)
  assert.equal(site.programmeWorkNotice({ ...base, access: PEOPLE.noUnit.den, programmeSelected: true, activeOnProgramme: false }), null)
  // The work check and the standing check answer separately.
  assert.equal(site.programmeWorkNotice({ ...base, access: viewer, programmeSelected: true, activeOnProgramme: true, workLoading: true }), null, 'no blame while the work check is loading')
  const failed = site.programmeWorkNotice({ ...base, access: viewer, programmeSelected: true, activeOnProgramme: true, workFailed: true })
  assert.match(failed, /Could not check your programme work/)
  assert.doesNotMatch(failed, /has not given you/)
  assert.equal(site.programmeWorkNotice({ ...base, access: viewer, programmeSelected: true, activeOnProgramme: true, canWork: true, workFailed: true }), null)
})

test('the Den team label follows the role-only head rule, never Oscar text', () => {
  const team = compile('hooks/useDenTeam.ts', {
    '@tanstack/react-query': { useQuery: () => ({}) },
    '@/lib/supabase/client': { createClient: () => ({}) },
    '@/lib/den': compile('lib/den.ts'),
  })
  assert.equal(team.denLevelWithoutMembership('head_noscar_den'), 'head')
  assert.equal(team.denLevelWithoutMembership('viewer'), 'member')
  assert.equal(team.denLevelWithoutMembership('noscar_den'), 'member')
  const source = fs.readFileSync('hooks/useDenTeam.ts', 'utf8')
  assert.doesNotMatch(source, /legacyDenAccessLevel/)
  assert.match(source, /levels\.has\(user\.id\) \|\| isDenOfficer/, 'curated members are listed too')
})

const OWNED = [
  'app/(dashboard)/den/DenClient.tsx',
  'hooks/useDenTeam.ts',
  'app/(dashboard)/nests/NestsClient.tsx',
  'components/nests/GuestExperiences.tsx',
  'components/nests/ComfortChecklist.tsx',
  'components/nests/PapaAccommodations.tsx',
  'components/den/DenMenus.tsx',
  'components/den/DenLocations.tsx',
  'components/den/VendorDirectory.tsx',
  'app/(dashboard)/welfare/page.tsx',
  'components/welfare/WelfareOperations.tsx',
  'app/(dashboard)/serial/page.tsx',
  'app/(dashboard)/training/page.tsx',
  'components/training/TrainingOperations.tsx',
]

test('the site pages take no permission from role helpers or Oscar text', () => {
  const deprecated = /canManageNoscarDen|canManageNoscarNest|canManageNests|canManageWelfare\(|canAccessWelfareDirectory|canAccessSierra|canManageSierra|effectiveOscarRole|isUnitHeadRole|BRIEFING_ROLES|isAdmin\(currentUser\.oscar\)/
  for (const file of OWNED) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), deprecated, file)
  const serial = fs.readFileSync('app/(dashboard)/serial/page.tsx', 'utf8')
  assert.doesNotMatch(serial, /getPublicUrl/, 'serial-media is private')
  assert.match(serial, /createSignedUrls\(batch, SERIAL_SIGNED_URL_SECONDS\)/)
  assert.match(serial, /refetchInterval: SERIAL_SIGNED_URL_REFRESH_MS/)
  assert.ok(serial.includes('queryKey: ["serial-media-urls", storagePaths]'), 'signed URLs sit outside the asset-list prefix')
  assert.ok(!serial.includes('["serial-media", "signed-urls"'))
  const training = fs.readFileSync('app/(dashboard)/training/page.tsx', 'utf8')
  assert.match(training, /training\.loadFailed && \(/)
  const den = fs.readFileSync('app/(dashboard)/den/DenClient.tsx', 'utf8')
  assert.match(den, /useCanWorkUnitProgramme\("november_den"/)
  assert.match(den, /denUnit\.loadFailed/)
  const nests = fs.readFileSync('app/(dashboard)/nests/NestsClient.tsx', 'utf8')
  assert.match(nests, /canLog=\{canLogComfort\}/)
  assert.doesNotMatch(nests, /role=\{resolvedRole/)
  assert.ok(!nests.includes("useUnitAccess('november_den')"), 'hotel postings take no Den access')
  assert.ok(nests.includes('canManagePostings(currentUser?.role, nestAccess,'))
  assert.ok(den.includes('canManagePostings(role, denUnit,'))
  const lounges = fs.readFileSync('components/den/DenLocations.tsx', 'utf8')
  assert.ok(!lounges.includes('className="h-8 w-8'), 'every location button is 44px on phones')
})

let JSDOM
try { ({ JSDOM } = require(process.env.FORM_DOM_RUNTIME || path.resolve('.next/form-ui-qa/node_modules/jsdom'))) } catch {}

test('ComfortChecklist: a non-Nest officer sees the last check but cannot log one', { skip: !JSDOM }, async t => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://tcnp.example/nests', pretendToBeVisual: true })
  const previous = new Map()
  for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'MutationObserver', 'getComputedStyle', 'IS_REACT_ACT_ENVIRONMENT']) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'window' ? dom.window : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] })
  }
  const React = require('react'), { act } = React, { createRoot } = require('react-dom/client')
  const inserts = []
  const query = { select: () => query, eq: () => query, order: () => query, limit: () => query,
    maybeSingle: async () => ({ data: { performed_at: '2026-11-16T08:00:00Z', performed_by_name: 'Nest Officer', checks: Array(17).fill(false), all_passed: false } }),
    single: async () => ({ data: { full_name: 'Me' } }),
    insert: rows => { inserts.push(rows); return Promise.resolve({ error: null }) } }
  const supabase = { from: () => query, auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) } }
  const passthrough = tag => ({ children, ...props }) => React.createElement(tag, props, children)
  const imports = {
    '@/lib/supabase/client': { createClient: () => supabase },
    '@/components/ui/card': { Card: passthrough('div'), CardContent: passthrough('div'), CardHeader: passthrough('div'), CardTitle: passthrough('h3') },
    '@/components/ui/button': { Button: ({ children, ...props }) => React.createElement('button', props, children) },
    '@/components/ui/badge': { Badge: passthrough('span') },
    '@/lib/notify': { notifyError: () => {}, UserFacingError: Error },
    '@/lib/utils': { cn: (...parts) => parts.filter(Boolean).join(' ') },
    sonner: { toast: { success: () => {} } },
  }
  const ComfortChecklist = compile('components/nests/ComfortChecklist.tsx', imports, { window: dom.window, document }).default
  const root = createRoot(document.getElementById('root'))
  t.after(async () => {
    await act(async () => root.unmount())
    dom.window.close()
    for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name] }
  })

  await act(async () => root.render(React.createElement(ComfortChecklist, { nestId: 'n1', nestName: 'Hotel', canLog: false })))
  assert.ok(document.body.textContent.includes('Last checked by Nest Officer'))
  assert.ok(document.body.textContent.includes('Only November (Nest) officers log comfort checks.'))
  assert.ok(![...document.querySelectorAll('button')].some(node => node.textContent.includes('Log Comfort Check')))
  const items = [...document.querySelectorAll('button[aria-pressed]')]
  assert.equal(items.length, 17)
  assert.ok(items.every(node => node.disabled), 'items are read-only')

  await act(async () => root.render(React.createElement(ComfortChecklist, { nestId: 'n1', nestName: 'Hotel', canLog: true })))
  const item = document.querySelector('button[aria-pressed]')
  await act(async () => item.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  const log = [...document.querySelectorAll('button')].find(node => node.textContent.includes('Log Comfort Check'))
  assert.ok(log && !log.disabled)
  await act(async () => log.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  assert.equal(inserts.length, 1)
  assert.equal(inserts[0][0].performed_by, 'me', 'a check is always logged as the signed-in officer')
})
