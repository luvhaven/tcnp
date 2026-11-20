// Unit tasks and programme grants for every unit:
// supabase/migrations/20261116171500_unit_programme_grants.sql,
// supabase/migrations/20261116203000_unit_task_notifications.sql,
// components/units/{UnitProgrammeTeam,UnitTasks,MyUnitTasksCard}.tsx and
// lib/notification-route.ts. The SQL itself is exercised by the trial runner
// (trial-tasks.sql); these tests cover the client logic and the file contracts.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')

function compile(file, imports = {}, globals = {}) {
  const mod = { exports: {} }
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2020 } }).outputText
  vm.runInNewContext(source, { module: mod, exports: mod.exports, require: name => (name in imports ? imports[name] : require(name)), console, ...globals })
  return mod.exports
}
// Values built inside a vm context carry its prototypes; compare as JSON.
const same = (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message)

const routes = compile('lib/notification-route.ts')
const denWork = compile('lib/den-work.ts')
const stub = new Proxy({}, { get: () => () => null })
const pureImports = new Proxy({}, {
  has: () => true,
  get(_, name) {
    if (name === '@/lib/den-work') return denWork
    if (name === '@/lib/notification-route') return routes
    if (typeof name === 'string' && (name.startsWith('@/') || name === 'sonner' || name === 'next/link' || name === '@tanstack/react-query')) return stub
    return require(name)
  },
})
const team = compile('components/units/UnitProgrammeTeam.tsx', pureImports)
const tasks = compile('components/units/UnitTasks.tsx', new Proxy({}, { has: () => true, get: (_, name) => name === '@/components/units/UnitProgrammeTeam' ? team : pureImports[name] }))
const mine = compile('components/units/MyUnitTasksCard.tsx', pureImports)

const grantsSql = fs.readFileSync('supabase/migrations/20261116171500_unit_programme_grants.sql', 'utf8')
const tasksSql = fs.readFileSync('supabase/migrations/20261116203000_unit_task_notifications.sql', 'utf8')

// ── Notification routing ──

const route = (kind, extra = {}) => routes.resolveNotificationRoute({ id: 'n', user_id: 'u', title: 't', message: 'm', type: 'info', is_read: false, created_at: '', metadata: { kind, ...extra } })

test('unit task and programme-team notifications open the unit they came from, on its Tasks or Programme team tab', () => {
  const expected = {
    alpha: '/alpha', tango: '/tango', victor: '/victor', november_nest: '/nests', november_den: '/den?tab=work',
    compliance: '/compliance', welfare: '/welfare', training: '/training', serial: '/serial', command: '/command', echo: '/echo',
  }
  same(routes.UNIT_PAGE_ROUTES, expected)
  // Pages with their own Tasks and Programme team tabs (?tab=tasks / ?tab=team).
  const tabbed = { alpha: '/alpha', tango: '/tango', victor: '/victor', november_nest: '/nests', compliance: '/compliance', welfare: '/welfare', training: '/training', serial: '/serial', echo: '/echo' }
  // The Den keeps its Work tab and its Floor access (overview); Command has no such tabs.
  const own = {
    tasks: { november_den: '/den?tab=work', command: '/command' },
    team: { november_den: '/den', command: '/command' },
  }
  const cases = [['unit_task_assigned', 'tasks'], ['unit_task_status', 'tasks'], ['unit_task_reminder', 'tasks'], ['unit_programme_grant', 'team']]
  for (const [kind, tab] of cases) {
    for (const [slug, page] of Object.entries(tabbed)) assert.equal(route(kind, { unit_slug: slug }), `${page}?tab=${tab}`, `${kind} ${slug}`)
    for (const [slug, url] of Object.entries(own[tab])) assert.equal(route(kind, { unit_slug: slug }), url, `${kind} ${slug}`)
    // A missing or unknown unit still lands somewhere useful.
    assert.equal(route(kind, {}), '/my-operations')
    assert.equal(route(kind, { unit_slug: 'toString' }), '/my-operations', 'no prototype keys')
    assert.equal(route(kind, { unit_slug: 'hasOwnProperty' }), '/my-operations', 'no prototype keys')
  }
})

test('each unit page offers the Tasks and Programme team tabs the notifications open', () => {
  const pages = {
    alpha: 'app/(dashboard)/alpha/page.tsx',
    tango: 'components/tango/TangoOperations.tsx',
    victor: 'app/(dashboard)/victor/TheatresClient.tsx',
    november_nest: 'app/(dashboard)/nests/NestsClient.tsx',
    compliance: 'app/(dashboard)/compliance/page.tsx',
    welfare: 'app/(dashboard)/welfare/page.tsx',
    training: 'app/(dashboard)/training/page.tsx',
    serial: 'app/(dashboard)/serial/page.tsx',
    echo: 'app/(dashboard)/echo/page.tsx',
  }
  for (const [slug, file] of Object.entries(pages)) {
    const page = fs.readFileSync(file, 'utf8')
    assert.match(page, /<TabsTrigger\s+value="tasks"/, `${file} has a Tasks tab`)
    assert.match(page, /<TabsTrigger\s+value="team"/, `${file} has a Programme team tab`)
    assert.match(page, new RegExp(`<UnitTasks unitSlug="${slug}"`), `${file} shows ${slug} tasks`)
    assert.match(page, new RegExp(`<UnitProgrammeTeam unitSlug="${slug}"`), `${file} shows the ${slug} programme team`)
    assert.match(page, /useSearchParams\(\)|useAddressTab\(/, `${file} reads ?tab=`)
  }
  assert.match(fs.readFileSync('app/(dashboard)/my-operations/page.tsx', 'utf8'), /<MyUnitTasksCard\b/)
})

test('the other new kinds route as the design lists', () => {
  assert.equal(route('compliance_inspection'), '/compliance?tab=inspections')
  assert.equal(route('compliance_recognition'), '/compliance?tab=recognition')
  assert.equal(route('signup_declined'), null)
  assert.equal(route('tango_licence_expiring'), '/tango?tab=drivers')
  assert.equal(route('alpha_timeline_overdue'), '/alpha?tab=timeline')
  // With the programme and Papa, it opens that Papa's timeline on the right programme.
  const prog = '11111111-1111-4111-8111-111111111111', papa = '22222222-2222-4222-8222-222222222222'
  assert.equal(route('alpha_timeline_overdue', { program_id: prog, papa_id: papa }), `/alpha?tab=timeline&programme=${prog}&papa=${papa}`)
  assert.equal(route('alpha_timeline_overdue', { program_id: prog, papa_id: 'x&y' }), '/alpha?tab=timeline', 'only ids go in the address')
  // A programme-team grant opens the programme the officer was added to.
  assert.equal(route('unit_programme_grant', { unit_slug: 'tango', program_id: prog }), `/tango?tab=team&programme=${prog}`)
  assert.equal(route('unit_programme_grant', { unit_slug: 'november_den', program_id: prog }), `/den?programme=${prog}`)
  assert.equal(route('unit_programme_grant', { unit_slug: 'tango', program_id: 'not-an-id' }), '/tango?tab=team')
  // Existing Den kinds are unchanged.
  assert.equal(route('den_task_assigned'), '/den?tab=work')
  assert.equal(route('den_task_reminder'), '/den?tab=work')
})

test('device text for the new kinds says what to do and never repeats names or titles', () => {
  const kinds = ['unit_task_assigned', 'unit_task_status', 'unit_task_reminder', 'unit_programme_grant', 'den_task_assigned', 'den_task_reminder',
    'compliance_inspection', 'compliance_recognition', 'tango_licence_expiring', 'alpha_timeline_overdue']
  for (const kind of kinds) {
    const text = routes.describeNotificationForDevice({ type: 'info', journey_id: null, metadata: { kind, unit_slug: 'compliance', officer: 'Officer Sensitive', title: 'Secret task' } })
    assert.notEqual(text.title, 'New update', kind)
    assert.ok(text.title.length <= 80 && text.body.length <= 200, kind)
    assert.match(text.body, /Open/, kind)
    assert.equal(/Sensitive|Secret/.test(JSON.stringify(text)), false, kind)
  }
  assert.equal(routes.pushUrgency({ type: 'info', metadata: { kind: 'unit_task_assigned' } }), 'high')
  assert.equal(routes.pushUrgency({ type: 'info', metadata: { kind: 'compliance_recognition' } }), 'normal')
})

test('every notification kind the migrations send has a route', () => {
  const sent = new Set([...`${grantsSql}\n${tasksSql}`.matchAll(/'((?:unit|den)_[a-z_]+)'/g)].map(match => match[1])
    .filter(kind => /_(assigned|status|reminder|grant)$/.test(kind)))
  same([...sent].sort(), ['den_task_assigned', 'den_task_reminder', 'unit_programme_grant', 'unit_task_assigned', 'unit_task_reminder', 'unit_task_status'])
  for (const kind of sent) assert.ok(route(kind, { unit_slug: 'tango' }), kind)
})

// ── Programme team logic ──

const row = overrides => ({ user_id: 'u', full_name: 'Officer', photo_url: null, access_level: 'member', on_programme: false, granted: false, grant_id: null, can_work: false, ...overrides })

test('a member works a programme only when active on it AND (a lead OR granted), as can_work_unit_programme', () => {
  assert.equal(team.programmeWorkState(row({ on_programme: true, granted: true })), 'working')
  assert.equal(team.programmeWorkState(row({ access_level: 'head', on_programme: true })), 'working')
  assert.equal(team.programmeWorkState(row({ access_level: 'sub_lead', on_programme: true })), 'working')
  assert.equal(team.programmeWorkState(row({ access_level: 'head' })), 'lead_not_active')
  assert.equal(team.programmeWorkState(row({ granted: true })), 'granted_not_active')
  assert.equal(team.programmeWorkState(row({ on_programme: true })), 'active_needs_grant')
  assert.equal(team.programmeWorkState(row({})), 'not_active')
  for (const state of ['working', 'lead_not_active', 'granted_not_active', 'active_needs_grant', 'not_active']) assert.ok(team.PROGRAMME_WORK_LABEL[state])
})

test('the summary counts who is active and who is on the team; leads are never offered a grant', () => {
  same(team.summariseProgrammeTeam([row({ access_level: 'head', on_programme: true }), row({ granted: true }), row({ on_programme: true }), row({})]),
    { members: 4, active: 2, working: 1, granted: 1 })
  same(team.summariseProgrammeTeam([row({}), row({ granted: true })]).active, 0)
  assert.equal(team.canOfferGrant(row({ access_level: 'head' })), false)
  assert.equal(team.canOfferGrant(row({ access_level: 'sub_lead' })), false)
  assert.equal(team.canOfferGrant(row({})), true)
})

test('programmes being planned or run are offered first', () => {
  same(team.sortProgrammes([{ id: '1', name: 'Zeta', status: 'planning' }, { id: '2', name: 'Alpha', status: 'completed' }, { id: '3', name: 'Beta', status: 'active' }]).map(p => p.id), ['3', '1', '2'])
})

// ── Task logic ──

const task = overrides => ({ id: 't', project_id: 'p', title: 'Task', description: null, assigned_to: null, due_at: null, status: 'todo', completed_at: null, created_at: '', project: null, ...overrides })

test('coordinators edit and move any task; members move only their own; others only read', () => {
  const lead = { userId: 'lead', canCoordinate: true, isMember: true }
  const member = { userId: 'me', canCoordinate: false, isMember: true }
  same(tasks.taskPermissions(task({ assigned_to: 'someone' }), lead), { changeStatus: true, edit: true, viaRpc: false })
  same(tasks.taskPermissions(task({ assigned_to: 'me' }), member), { changeStatus: true, edit: false, viaRpc: true })
  same(tasks.taskPermissions(task({ assigned_to: 'someone' }), member), { changeStatus: false, edit: false, viaRpc: false })
  same(tasks.taskPermissions(task({ assigned_to: 'me', status: 'cancelled' }), member), { changeStatus: false, edit: false, viaRpc: false })
  // Command reads every unit's tasks but is not a member: it moves nothing, even one assigned to it.
  same(tasks.taskPermissions(task({ assigned_to: 'cmd' }), { userId: 'cmd', canCoordinate: false, isMember: false }), { changeStatus: false, edit: false, viaRpc: false })
  same(tasks.taskPermissions(task({ assigned_to: null }), { userId: null, canCoordinate: false, isMember: true }), { changeStatus: false, edit: false, viaRpc: false })
})

test('a programme task can only be offered to leads and officers active on the programme', () => {
  const members = [
    { user_id: 'c', full_name: 'Cara', access_level: 'member' },
    { user_id: 'a', full_name: 'Ade', access_level: 'member' },
    { user_id: 'h', full_name: 'Bola', access_level: 'head' },
  ]
  const programmeTeam = [row({ user_id: 'a', on_programme: true }), row({ user_id: 'c' }), row({ user_id: 'h', access_level: 'head' })]
  same(tasks.assignableMembers(members, programmeTeam).map(m => m.user_id), ['a', 'h'])
  same(tasks.assignableMembers(members, null).map(m => m.user_id), ['a', 'h', 'c'], 'initiatives: any member, by name')
  same(tasks.assignableMembers(members, []).map(m => m.user_id), [], 'nobody active yet')
})

test('closed projects are not offered and counts ignore removed work', () => {
  same(tasks.openProjects([{ id: '1', title: 'B', project_type: 'other', program_id: null, status: 'planning' }, { id: '2', title: 'A', project_type: 'visit', program_id: null, status: 'completed' }, { id: '3', title: 'A2', project_type: 'programme_operation', program_id: 'p', status: 'in_progress' }]).map(p => p.id), ['3', '1'])
  const now = new Date('2026-11-20T12:00:00Z')
  same(tasks.taskCounts([task({ due_at: '2026-11-20T11:00:00Z' }), task({ status: 'done' }), task({ status: 'blocked' })], now), { open: 2, done: 1, overdue: 1 })
})

test('my tasks are grouped by unit, the unit with overdue work first, each linking to its page', () => {
  const now = new Date('2026-11-20T12:00:00Z')
  const project = (slug, name) => ({ title: 'P', program_id: null, unit: { slug, name }, program: null })
  const groups = mine.groupMyTasks([
    task({ id: '1', title: 'Later', due_at: '2026-11-25T00:00:00Z', project: project('compliance', 'Compliance Oscar') }),
    task({ id: '2', title: 'Late', due_at: '2026-11-19T00:00:00Z', project: project('tango', 'Tango Oscar') }),
    task({ id: '3', title: 'Soon', due_at: '2026-11-21T00:00:00Z', project: project('compliance', 'Compliance Oscar') }),
    task({ id: '4', title: 'Den', project: project('november_den', 'November (Den)') }),
    task({ id: '5', title: 'Orphan', project: null }),
  ], { now, excludeUnits: ['november_den'] })
  same(groups.map(g => [g.slug, g.route, g.overdue, g.tasks.map(t => t.id)]), [
    ['tango', '/tango?tab=tasks', 1, ['2']],
    ['compliance', '/compliance?tab=tasks', 0, ['3', '1']],
  ])
  same(mine.groupMyTasks([task({ project: project('mystery', 'Mystery') })], { now })[0].route, '/my-operations')
})

test('the components call the RPCs by the names and parameters the migrations define', () => {
  const source = name => fs.readFileSync(`components/units/${name}.tsx`, 'utf8')
  assert.match(source('UnitTasks'), /rpc\("unit_set_my_task_status", \{ task: task\.id, new_status: status \}\)/)
  assert.match(source('MyUnitTasksCard'), /rpc\("unit_set_my_task_status", \{ task: task\.id, new_status: "done" \}\)/)
  assert.match(source('UnitTasks'), /rpc\("unit_ensure_programme_project", \{ unit_slug: unitSlug, target_program: programId \}\)/)
  assert.match(source('UnitProgrammeTeam'), /rpc\("unit_set_programme_grant", \{\s*unit_slug: unitSlug, target_program: programId, target_user: row\.user_id, granted,/)
  assert.match(source('UnitProgrammeTeam'), /rpc\("unit_programme_team", \{ unit_slug: unitSlug, target_program: programId \}\)/)
  assert.match(tasksSql, /FUNCTION public\.unit_set_my_task_status\(task uuid, new_status text\)/)
  assert.match(tasksSql, /FUNCTION public\.unit_ensure_programme_project\(unit_slug text, target_program uuid\)/)
  assert.match(grantsSql, /FUNCTION public\.unit_set_programme_grant\(unit_slug text, target_program uuid, target_user uuid, granted boolean\)/)
  assert.match(grantsSql, /FUNCTION public\.unit_programme_team\(unit_slug text, target_program uuid\)/)
  // Compliance's existing call uses the same parameter names.
  assert.match(fs.readFileSync('components/compliance/ComplianceInitiatives.tsx', 'utf8'), /rpc\("unit_set_my_task_status", \{\s*task: task\.id,\s*new_status:/)
})

// ── Migration contracts ──

test('the migrations follow the build rules', () => {
  for (const [name, sql] of [['grants', grantsSql], ['tasks', tasksSql]]) {
    const body = sql.replace(/--.*$/gm, '')
    assert.doesNotMatch(body, /^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im, `${name}: no transaction control`)
    const definers = [...body.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\([^)]*\)[\s\S]*?\$\$;/g)]
    assert.ok(definers.length > 0)
    for (const [text, fn] of definers) {
      if (/SECURITY DEFINER/.test(text)) assert.match(text, /SET search_path = public, pg_temp/, `${name}: ${fn} search_path`)
      if (!/RETURNS trigger/.test(text)) assert.match(body, new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon`), `${name}: ${fn} revoked from PUBLIC/anon`)
    }
  }
  assert.match(grantsSql, /ALTER TABLE public\.unit_programme_grants ENABLE ROW LEVEL SECURITY/)
  assert.match(grantsSql, /CREATE UNIQUE INDEX IF NOT EXISTS unit_programme_grants_one_open\s+ON public\.unit_programme_grants\(unit_id, program_id, user_id\) WHERE revoked_at IS NULL/)
  assert.doesNotMatch(grantsSql, /FOR DELETE/, 'grants are history, never deleted')
})

test('can_work_unit_programme keeps its signature and adds the grant without dropping the Den floor grant', () => {
  const fn = grantsSql.slice(grantsSql.indexOf('CREATE OR REPLACE FUNCTION public.can_work_unit_programme'))
  const body = fn.slice(0, fn.indexOf('$$;'))
  assert.match(body, /can_work_unit_programme\(unit_slug text, target_program uuid\)\s+RETURNS boolean/)
  assert.match(body, /public\.is_platform_admin\(\)/)
  assert.match(body, /public\.is_unit_member\(unit_slug\)/)
  assert.match(body, /public\.is_program_active_officer\(auth\.uid\(\), target_program\)/)
  assert.match(body, /public\.can_coordinate_unit\(unit_slug\)/)
  assert.match(body, /public\.has_unit_programme_grant\(unit_slug, target_program\)/)
  assert.match(body, /unit_slug = 'november_den' AND public\.has_den_floor_access\(target_program\)/)
})

test('task notifications replace the Den trigger once, keep the Den kinds, and the browser can only notify itself', () => {
  assert.match(tasksSql, /DROP TRIGGER IF EXISTS unit_tasks_notify_den_assignment ON public\.unit_tasks;/)
  assert.match(tasksSql, /CREATE TRIGGER unit_tasks_notify_assignment\s+AFTER INSERT OR UPDATE OF assigned_to ON public\.unit_tasks/)
  assert.match(tasksSql, /WHEN owning_slug = 'november_den' THEN 'den_task_assigned' ELSE 'unit_task_assigned'/)
  assert.match(tasksSql, /WHEN due\.unit_slug = 'november_den' THEN 'den_task_reminder' ELSE 'unit_task_reminder'/)
  assert.match(tasksSql, /cron\.unschedule\(jobid\) FROM cron\.job WHERE jobname IN \('tcnp-den-task-reminders', 'tcnp-unit-task-reminders'\)/)
  assert.match(tasksSql, /DROP POLICY IF EXISTS notifications_insert_all ON public\.notifications;/)
  assert.match(tasksSql, /CREATE POLICY notifications_insert_own ON public\.notifications\s+FOR INSERT TO authenticated\s+WITH CHECK \(user_id = \(SELECT auth\.uid\(\)\) AND \(SELECT public\.is_active_member\(\)\)\);/, 'same as 20261019150000: deactivated accounts cannot notify')
  // The only browser insert into notifications is for the caller themself.
  const tracker = fs.readFileSync('components/tracking/LocationTracker.tsx', 'utf8')
  assert.match(tracker, /from\('notifications'\)\.insert\(\{\s*user_id: user\.id,/)
})

test('one assignee rule for every task: a member of the owning unit, re-checked when the task moves', () => {
  const fn = tasksSql.slice(tasksSql.indexOf('CREATE OR REPLACE FUNCTION public.guard_unit_task_assignee'))
  const body = fn.slice(0, fn.indexOf('$$;'))
  assert.match(body, /NEW\.project_id IS NOT DISTINCT FROM OLD\.project_id/, 'a project move is checked too')
  assert.match(body, /public\.unit_member_can_take_task\(owning_slug, NEW\.assigned_to\)/, 'initiative tasks need a member')
  assert.match(body, /public\.den_can_take_programme_work\(NEW\.assigned_to, task_program\)/, 'the Den keeps its programme rule')
  assert.match(body, /public\.unit_can_take_programme_work\(owning_slug, NEW\.assigned_to, task_program\)/)
  assert.match(tasksSql, /DROP TRIGGER IF EXISTS unit_tasks_guard_den_assignee ON public\.unit_tasks;/, 'one guard, not two')
  assert.match(tasksSql, /CREATE TRIGGER unit_tasks_guard_programme_assignee\s+BEFORE INSERT OR UPDATE OF assigned_to, project_id ON public\.unit_tasks/)
  // Reminders only chase people who can still see and close the task.
  const reminders = tasksSql.slice(tasksSql.indexOf('CREATE OR REPLACE FUNCTION public.unit_send_task_reminders'))
  assert.match(reminders.slice(0, reminders.indexOf('claimed AS')), /membership\.user_id = target\.assigned_to\s+AND membership\.status = 'active'/)
})

test('grants: double taps cannot fail, the server owns the dates, and a grant ends with the membership', () => {
  const setter = grantsSql.slice(grantsSql.indexOf('CREATE OR REPLACE FUNCTION public.unit_set_programme_grant'))
  assert.match(setter, /ON CONFLICT \(unit_id, program_id, user_id\) WHERE revoked_at IS NULL DO NOTHING/)
  assert.match(setter, /IF granted IS NULL OR target_user IS NULL THEN/)
  const guard = grantsSql.slice(grantsSql.indexOf('CREATE OR REPLACE FUNCTION public.guard_unit_programme_grant'))
  assert.match(guard, /NEW\.revoked_at := now\(\);/)
  assert.match(guard, /NEW\.created_at := now\(\);/)
  assert.match(grantsSql, /CREATE CONSTRAINT TRIGGER unit_memberships_revoke_programme_grants\s+AFTER UPDATE OR DELETE ON public\.unit_memberships\s+DEFERRABLE INITIALLY DEFERRED/)
  // Den floor grants are only shown to those den_floor_grants_select shows them to.
  assert.match(grantsSql, /membership\.user_id = auth\.uid\(\) OR public\.can_manage_unit\('november_den'\) OR public\.is_admin\(\)/)
})

test('only a programme grant can be removed here; a Den floor grant is labelled and left to the Den', () => {
  assert.equal(team.grantAction({ access_level: 'member', granted: true, grant_id: 'g' }), 'remove')
  assert.equal(team.grantAction({ access_level: 'member', granted: true, grant_id: null }), 'den_floor')
  assert.equal(team.grantAction({ access_level: 'member', granted: false, grant_id: null }), 'add')
  assert.equal(team.grantAction({ access_level: 'head', granted: false, grant_id: null }), null)
  assert.equal(team.grantAction({ access_level: 'sub_lead', granted: true, grant_id: 'g' }), null)
})

test('editing keeps the current owner visible even when they no longer qualify', () => {
  const list = [{ user_id: 'a', full_name: 'Ann', access_level: 'member' }]
  same(tasks.assigneeOptions(list, 'a', 'Ann'), list, 'already offered: unchanged')
  same(tasks.assigneeOptions(list, null, ''), list)
  same(tasks.assigneeOptions(list, 'gone', 'Gone Officer'), [{ user_id: 'gone', full_name: 'Gone Officer', access_level: 'member', stale: true }, ...list])
})

// ── The programme team panel, rendered ──

let JSDOM
try { ({ JSDOM } = require(process.env.FORM_DOM_RUNTIME || path.resolve('.next/form-ui-qa/node_modules/jsdom'))) } catch {}

async function renderTeam(t, { access, rows }) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://tcnp.example/compliance', pretendToBeVisual: true })
  const previous = new Map()
  for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Event', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'MutationObserver', 'Node', 'CustomEvent', 'IS_REACT_ACT_ENVIRONMENT']) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'window' ? dom.window : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] })
  }
  const React = require('react'), { act } = React, { createRoot } = require('react-dom/client'), { QueryClient, QueryClientProvider } = require('@tanstack/react-query')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } })
  const calls = [], messages = []
  const supabase = {
    from: () => { const query = { select: () => query, order: async () => ({ data: [{ id: 'prog', name: 'Easter Convention', status: 'planning' }], error: null }) }; return query },
    rpc: async (name, args) => { calls.push({ name, args }); return name === 'unit_programme_team' ? { data: rows, error: null } : { data: 'grant-id', error: null } },
  }
  const selectAPI = {
    Select: ({ children, value, onValueChange }) => { const items = React.Children.toArray(children); const trigger = items.find(item => item.type === selectAPI.SelectTrigger); return React.createElement('select', { id: trigger?.props.id, 'aria-label': trigger?.props['aria-label'], value, onChange: event => onValueChange(event.target.value) }, React.createElement('option', { value: '' }, ''), children) },
    SelectTrigger: () => null, SelectValue: () => null, SelectContent: ({ children }) => children,
    SelectItem: ({ children, value }) => React.createElement('option', { value }, children),
  }
  const cache = new Map()
  const imports = new Proxy({}, {
    has: () => true,
    get(_, name) {
      if (name === '@/lib/supabase/client') return { createClient: () => supabase }
      if (name === '@/hooks/useUnitAccess') return { useUnitAccess: () => ({ currentUser: { id: 'me' }, isLoading: false, loadFailed: false, isPlatformAdmin: false, isCommand: false, isMember: true, isSubLead: false, isHead: false, canCoordinate: false, canManage: false, ...access }) }
      if (name === '@/lib/notify') return { notifyError: (_, message) => messages.push(message), UserFacingError: Error }
      if (name === 'sonner') return { toast: { success: message => messages.push(message) } }
      if (name === '@/components/providers/ConfirmProvider') return { useConfirm: () => async () => true }
      if (name === '@/components/ui/select') return selectAPI
      if (name.startsWith('@/')) return load(`${name.slice(2)}${name.startsWith('@/components/') ? '.tsx' : '.ts'}`)
      return require(name)
    },
  })
  function load(file) { if (!cache.has(file)) cache.set(file, compile(file, imports, { window: dom.window, document: dom.window.document })); return cache.get(file) }
  const Panel = load('components/units/UnitProgrammeTeam.tsx').default
  const root = createRoot(dom.window.document.getElementById('root'))
  t.after(async () => { await act(async () => root.unmount()); queryClient.clear(); dom.window.close(); for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name] } })
  await act(async () => root.render(React.createElement(QueryClientProvider, { client: queryClient }, React.createElement(Panel, { unitSlug: 'compliance' }))))
  const document = dom.window.document
  const choose = async value => act(async () => { const select = document.querySelector('select[aria-label="Choose a programme"]'); select.value = value; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })) })
  const flush = async () => { for (let i = 0; i < 5; i += 1) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) }) }
  await flush()
  return { document, choose, flush, calls, messages, act, dom }
}

test('the head sees an explanation when nobody is active yet, and can still add a member to the team', { skip: !JSDOM }, async t => {
  const rows = [row({ user_id: 'head', full_name: 'Head Officer', access_level: 'head' }), row({ user_id: 'm1', full_name: 'Member One' })]
  const view = await renderTeam(t, { access: { isHead: true, canManage: true, canCoordinate: true }, rows })
  assert.match(view.document.body.textContent, /Choose a programme/)
  await view.choose('prog'); await view.flush()
  const text = view.document.body.textContent
  assert.match(text, /Nobody in this unit is active on Easter Convention yet/)
  assert.match(text, /You can still add members to the team now/)
  assert.match(text, /Leads the unit\. Not active on this programme yet/)
  const add = view.document.querySelector('button[aria-label="Add Member One to the programme team"]')
  assert.ok(add, 'grant button for the plain member')
  assert.equal(view.document.querySelector('button[aria-label="Add Head Officer to the programme team"]'), null, 'leads are not offered a grant')
  await view.act(async () => add.click()); await view.flush()
  same(view.calls.find(call => call.name === 'unit_set_programme_grant').args, { unit_slug: 'compliance', target_program: 'prog', target_user: 'm1', granted: true })
  assert.ok(view.messages.some(message => /can start once they are active/.test(message)))
})

test('a plain member sees who is on the team but gets no grant controls', { skip: !JSDOM }, async t => {
  const rows = [row({ user_id: 'm1', full_name: 'Member One', on_programme: true, granted: true, grant_id: 'g' }), row({ user_id: 'me', full_name: 'Me Myself', on_programme: true })]
  const view = await renderTeam(t, { access: {}, rows })
  await view.choose('prog'); await view.flush()
  const text = view.document.body.textContent
  assert.match(text, /1 on the team/)
  assert.match(text, /Me Myself \(you\)/)
  assert.match(text, /Active on the programme\. Not on the team/)
  assert.doesNotMatch(text, /Nobody in this unit is active/)
  assert.equal(view.document.querySelectorAll('button[aria-label*="programme team"]').length, 0)
})

test('someone outside the unit is told it is members only and nothing is fetched', { skip: !JSDOM }, async t => {
  const view = await renderTeam(t, { access: { isMember: false }, rows: [] })
  assert.match(view.document.body.textContent, /Members only/)
  assert.equal(view.calls.length, 0)
})

test('a Den floor grant shows a label for the head instead of a Remove that would do nothing', { skip: !JSDOM }, async t => {
  const rows = [
    row({ user_id: 'f1', full_name: 'Floor Officer', on_programme: true, granted: true, grant_id: null, can_work: true }),
    row({ user_id: 'g1', full_name: 'Granted Officer', on_programme: true, granted: true, grant_id: 'g', can_work: true }),
  ]
  const view = await renderTeam(t, { access: { isHead: true, canManage: true, canCoordinate: true }, rows })
  await view.choose('prog'); await view.flush()
  assert.equal(view.document.querySelector('button[aria-label="Remove Floor Officer from the programme team"]'), null)
  assert.equal(view.document.querySelector('button[aria-label="Add Floor Officer to the programme team"]'), null)
  assert.match(view.document.body.textContent, /Granted on the Den floor\. Change it in Floor access\./)
  assert.ok(view.document.querySelector('button[aria-label="Remove Granted Officer from the programme team"]'))
})
