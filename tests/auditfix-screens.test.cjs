// Audit fixes in the screens group: notification routes, the My Ops badge,
// nav gates, expired resets, the availability deadline and audience gaps,
// unit page seeds and the journey edit save.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

const cache = {}
function load(file) {
  if (cache[file]) return cache[file]
  const mod = { exports: {} }
  cache[file] = mod.exports
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const stub = new Proxy(function () {}, { get: (_, key) => (key === '__esModule' ? false : stub), apply: () => stub })
  const localRequire = (name) => {
    if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => key })
    if (name === '@/lib/supabase/client') return { createClient: () => ({}) }
    if (name.startsWith('@/')) {
      const base = name.slice(2)
      for (const candidate of [`${base}.ts`, `${base}.tsx`]) if (fs.existsSync(candidate)) return load(candidate)
      return stub
    }
    try { return require(name) } catch { return stub }
  }
  vm.runInNewContext(source, { exports: mod.exports, module: mod, require: localRequire, console })
  cache[file] = mod.exports
  return mod.exports
}

const read = file => fs.readFileSync(file, 'utf8')

function compileSource(source) {
  const mod = { exports: {} }
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText
  vm.runInNewContext(js, { exports: mod.exports, module: mod })
  return mod.exports
}

test('notification routes: approval, DO assignment and a reset requested for you', () => {
  const { resolveNotificationRoute: route, describeNotificationForDevice: describe } = load('lib/notification-route.ts')
  assert.equal(route({ type: 'info', metadata: { kind: 'signup_approved' } }), '/profile')
  assert.equal(route({ type: 'assignment', journey_id: 'j-1', metadata: { kind: 'do_assignment' } }), '/my-operations')
  // Rows written before notify_do_assignment carried a kind still open My Operations.
  assert.equal(route({ type: 'assignment', journey_id: 'j-1', metadata: { is_lead: true } }), '/my-operations')
  // Other journey notifications keep the leadership deep link.
  assert.equal(route({ type: 'info', journey_id: 'j-1' }), '/journeys?highlight=j-1')
  assert.equal(route({ type: 'alert', metadata: { kind: 'password_reset_requested_for_you' } }), '/change-password')
  assert.match(describe({ type: 'alert', metadata: { kind: 'password_reset_requested_for_you' } }).title, /Password reset requested/)
  assert.match(describe({ type: 'assignment', journey_id: 'j-1' }).body, /My Operations/)
  assert.match(describe({ type: 'info', metadata: { kind: 'signup_approved' } }).title, /approved/)
  assert.equal(route({ type: 'alert', metadata: { kind: 'location_offline', reason: 'battery_critical' } }), '/tracking/live')
  assert.match(describe({ type: 'alert', metadata: { kind: 'location_offline' } }).body, /Live Tracking/)
})

test('the My Ops badge counts unit, Den and DO work, and My Operations clears it', () => {
  const { myOpsWorkFilter, MY_OPS_WORK_KINDS, isMyOpsWorkNotification: isWork, resolveNotificationRoute: route } = load('lib/notification-route.ts')
  for (const kind of ['unit_task_assigned', 'unit_task_reminder', 'den_task_assigned', 'den_task_reminder', 'den_shift_assigned', 'do_assignment']) {
    assert.ok(MY_OPS_WORK_KINDS.includes(kind), kind)
  }
  assert.equal(
    myOpsWorkFilter(),
    'type.eq.assignment,metadata->>kind.in.(do_assignment,unit_task_assigned,unit_task_reminder,den_task_assigned,den_task_reminder,den_shift_assigned),and(type.eq.reminder,metadata->>kind.is.null)',
  )
  // Journey reminders (no kind) and work kinds are My Ops work.
  assert.equal(isWork({ type: 'reminder', metadata: { reminder_key: 'dep:15' } }), true)
  assert.equal(isWork({ type: 'reminder', metadata: null }), true)
  assert.equal(isWork({ type: 'assignment', metadata: { is_lead: true } }), true)
  assert.equal(isWork({ type: 'reminder', metadata: { kind: 'unit_task_reminder' } }), true)
  assert.equal(isWork({ type: 'warning', metadata: { kind: 'den_task_reminder' } }), true)
  // A Tango licence reminder routes to Tango, so My Operations must not clear it.
  const licence = { type: 'reminder', metadata: { kind: 'tango_licence_expiring' } }
  assert.equal(isWork(licence), false)
  assert.notEqual(route(licence), '/my-operations')
  assert.equal(isWork({ type: 'info', metadata: { kind: 'mission_request' } }), false)
  const hook = read('hooks/useUnreadAssignments.ts')
  assert.match(hook, /\.or\(myOpsWorkFilter\(\)\)/)
  assert.doesNotMatch(hook, /\.in\('type', \['assignment', 'reminder'\]\)/)
  assert.match(hook, /update\(\{ is_read: true \}\)/)
  assert.match(read('app/(dashboard)/my-operations/page.tsx'), /markMyOpsWorkRead\(createClient\(\), userId\)/)
})

test('nav: Settings for everyone; the Audit Log only for platform admins and Command', () => {
  const { getVisibleNav, canReadAuditLogs } = load('components/layout/nav-config.ts')
  const hrefs = (...args) => getVisibleNav(...args).map(item => item.href)
  assert.ok(hrefs('viewer', null, []).includes('/settings'))
  assert.ok(hrefs('delta_oscar', null, ['tango']).includes('/settings'))
  assert.ok(hrefs(null, null, []).includes('/settings'))
  for (const role of ['admin', 'super_admin', 'captain', 'command', 'head_of_command', 'head_of_operations']) {
    assert.equal(canReadAuditLogs(role), true, role)
    assert.ok(hrefs(role).includes('/audit-logs'), role)
  }
  for (const role of ['hod', 'hop', 'viewer', 'delta_oscar']) {
    assert.equal(canReadAuditLogs(role), false, role)
    assert.ok(!hrefs(role).includes('/audit-logs'), role)
  }
  assert.equal(canReadAuditLogs('viewer', true), true, 'the admin grant counts')
  assert.match(read('app/(dashboard)/audit-logs/page.tsx'), /canReadAuditLogs\(userData\.role, userData\.has_admin_access\)/)
  assert.match(read('app/(dashboard)/after-op-reports/page.tsx'), /const isUserAdmin = isCommandAuthority\(userRole\)/)
})

test('a failed profile read is a failed unit-access load, and the unit retry re-reads it', () => {
  const source = read('hooks/useUnitAccess.ts')
  assert.match(source, /const userFailed = userError && !currentUser/)
  assert.match(source, /loadFailed: \(query\.isError && query\.data === undefined\) \|\| userFailed/)
  assert.match(source, /queryKey: \['unit-access', 'profile-retry'\]/)
})

test('expired password resets are shown and treated as expired', () => {
  const list = read('app/api/admin/password-resets/route.ts')
  assert.match(list, /\.update\(\{ status: 'expired', updated_at: nowIso \}\)\s*\.in\('status', \['pending', 'approved'\]\)\s*\.lt\('expires_at', nowIso\)/)
  assert.match(list, /\.map\(row => markExpired\(row\)\)/)
  const fnSource = list.slice(list.indexOf('function markExpired'), list.indexOf('export async function GET'))
  const { markExpired } = compileSource(`${fnSource}
module.exports = { markExpired }`)
  const now = Date.parse('2026-11-20T12:00:00Z')
  assert.equal(markExpired({ status: 'approved', expires_at: '2026-11-16T00:00:00Z' }, now).status, 'expired')
  assert.equal(markExpired({ status: 'pending', expires_at: '2026-11-21T00:00:00Z' }, now).status, 'pending')
  assert.equal(markExpired({ status: 'completed', expires_at: '2026-11-01T00:00:00Z' }, now).status, 'completed')
  const approve = read('app/api/admin/password-resets/approve/route.ts')
  const expiryCheck = approve.indexOf("This request expired; ask the officer to request again.")
  assert.ok(expiryCheck > 0)
  assert.ok(expiryCheck < approve.indexOf("status: 'approved',"), 'checked before approving')
})

test('the availability deadline is written in Lagos time, day first', () => {
  const route = read('app/api/missions/request-availability/route.ts')
  assert.match(route, /before \$\{formatLagosDeadline\(deadlineDate\)\}/)
  assert.doesNotMatch(route, /deadlineDate\.toLocaleString\(\)/)
  assert.equal(
    new Date('2026-11-15T19:00:00Z').toLocaleString('en-GB', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' }),
    '15 Nov 2026, 20:00',
  )
  assert.match(route, /\.\.\.\(includeUnsetGender \? \{ include_unset_gender: true \} : \{\}\)/, 'only sent when used')
})

test('a Males / Females request shows how many officers have no gender', () => {
  const { parseAudienceGapCount, isGenderAudience } = load('components/missions/MissionAvailability.tsx')
  assert.equal(isGenderAudience('male'), true)
  assert.equal(isGenderAudience('female'), true)
  assert.equal(isGenderAudience('all'), false)
  assert.equal(parseAudienceGapCount(19), 19)
  assert.equal(parseAudienceGapCount('4'), 4)
  assert.equal(parseAudienceGapCount([{ no_gender: 3 }]), 3)
  assert.equal(parseAudienceGapCount({ missing_gender: 2 }), 2)
  assert.equal(parseAudienceGapCount(null), 0)
  assert.equal(parseAudienceGapCount({ other: 5 }), 0)
  assert.equal(parseAudienceGapCount(-1), 0)
  const source = read('components/missions/MissionAvailability.tsx')
  assert.match(source, /rpc\("get_mission_audience_gaps", \{\s*program: programId,\s*audience,\s*\}\)/)
  // An open request can reach officers it missed (add_mission_request_recipients).
  assert.match(source, /rpc\("add_mission_request_recipients", \{\s*target_request_id: latestRequest\.id,/)
  assert.match(source, /latestRequest\.status === "open" && latestRequest\.audience && new Date\(latestRequest\.deadline\)\.getTime\(\) > Date\.now\(\)/)
})

test('location loss and critical battery alert Command through the RPC', () => {
  const tracker = read('components/tracking/LocationTracker.tsx')
  assert.match(tracker, /rpc\('notify_location_offline', \{\s*reason: type === 'LOCATION_LOSS' \? 'location_lost' : 'battery_critical',/)
  assert.match(tracker, /level < BATTERY_CRITICAL_PERCENT/)
  assert.match(tracker, /const BATTERY_CRITICAL_PERCENT = 15/)
  assert.match(tracker, /hasSentBatteryAlertThisSession\(\)/)
  // One alert per loss: playAlert only makes the sound.
  assert.equal((tracker.match(/sendAdminAlert\('LOCATION_LOSS'\)/g) || []).length, 1)
  assert.match(tracker, /if \(wasTracking && hasEverTrackedRef\.current\)/)
  // The battery alert is only marked sent after the RPC succeeds, re-checks
  // when tracking starts, and notices the charger being unplugged.
  assert.match(tracker, /sendAdminAlert\('BATTERY_CRITICAL'\)\.then\(sent => \{[\s\S]*?if \(sent\) \{\s*batteryAlertSentRef\.current = true\s*markBatteryAlertSent\(\)/)
  assert.doesNotMatch(tracker, /batteryAlertSentRef\.current = true\s*markBatteryAlertSent\(\)\s*void sendAdminAlert/)
  assert.match(tracker, /if \(error\) throw error\s*return true/)
  assert.match(tracker, /addEventListener\('chargingchange', updateBattery\)/)
  assert.match(tracker, /if \(isTracking\) batteryCheckRef\.current\?\.\(\)/)
})

test('unit pages: a failed server read seeds nothing, and Den has its own cache key', () => {
  const den = read('app/(dashboard)/den/DenClient.tsx')
  assert.match(den, /queryKey: \["nests", "den"\]/)
  assert.match(den, /\.eq\("type", "den"\)/)
  assert.match(den, /initialData: initialDensError \? undefined : initialDens/)
  assert.match(den, /if \(seenUrl\.tab !== urlTab\) setRequestedTab\(urlTab\)/)
  const pairs = [
    ['app/(dashboard)/den/page.tsx', /initialDensError=\{Boolean\(densError\)\}/],
    ['app/(dashboard)/nests/page.tsx', /initialNestsError=\{Boolean\(nestsError\)\}/],
    ['app/(dashboard)/nests/NestsClient.tsx', /initialData: initialNestsError \? undefined : initialNests/],
    ['app/(dashboard)/papas/page.tsx', /initialPapasError=\{Boolean\(papasError\)\}/],
    ['app/(dashboard)/papas/PapasClient.tsx', /initialData: initialPapasError \? undefined : initialPapas/],
    ['app/(dashboard)/tango/page.tsx', /initialCheetahsError=\{Boolean\(cheetahsError\)\}/],
    ['app/(dashboard)/tango/CheetahsClient.tsx', /initialData: initialCheetahsError \? undefined : initialCheetahs/],
    ['app/(dashboard)/programs/page.tsx', /initialTheatresError=\{Boolean\(theatresRes\.error\)\}/],
    ['app/(dashboard)/programs/ProgramsClient.tsx', /initialData: initialTheatresError \? undefined : initialTheatres/],
  ]
  for (const [file, pattern] of pairs) assert.match(read(file), pattern, file)
})

test('Nest postings list Nest members by membership, not by role alone', () => {
  const nests = read('app/(dashboard)/nests/NestsClient.tsx')
  assert.match(nests, /queryKey: \['unit-access', 'nest', 'posting-officers'\]/)
  assert.match(nests, /\.eq\('units\.slug', 'november_nest'\)/)
  assert.match(nests, /filter\.push\(`id\.in\.\(\$\{memberIds\.join\(','\)\}\)`\)/)
  assert.doesNotMatch(nests, /\.in\('role', \['november_oscar'/)
})

test('editing a journey reports failed Papa and DO saves and can clear every DO', () => {
  const journeys = read('app/(dashboard)/journeys/JourneysClient.tsx')
  const update = journeys.slice(journeys.indexOf('const handleUpdateJourney'), journeys.indexOf('const handleCallSign'))
  assert.match(update, /const \{ error: deleteError \} = await/)
  assert.match(update, /if \(deleteError\) throw deleteError/)
  assert.match(update, /if \(insertError\) throw insertError/)
  assert.match(update, /if \(!response\.ok\) throw new Error/)
  assert.match(update, /if \(doListTouched \|\| selectedDOs\.length > 0\)/)
  assert.match(update, /toast\.warning\(`Journey updated, but/)
  // Raw selects are 16px on phones so iOS does not zoom in on focus.
  assert.doesNotMatch(journeys, /<select[^>]*px-3 py-2 text-sm ring-offset/)
})
