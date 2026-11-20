const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const COMPONENT = 'components/eagles/AOArrivalTimeline.tsx'
const PAGE = 'app/(dashboard)/alpha/page.tsx'
const MIGRATION = 'supabase/migrations/20261116190000_alpha_arrival_timelines.sql'

function compile(file, imports = {}, globals = {}) {
  const mod = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2020 },
  }).outputText, { module: mod, exports: mod.exports, require: name => (name in imports ? imports[name] : require(name)), console, setInterval, clearInterval, setTimeout, clearTimeout, URL, ...globals })
  return mod.exports
}
// Values built inside the vm context carry its prototypes; compare as JSON.
const deepEq = (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message)

// The pure helpers, with every import stubbed except the shared programme-work
// wording (tickBlockReason uses it).
const sitePermissions = compile('lib/site-unit-permissions.ts', new Proxy({}, { has: () => true, get: (_, name) => (name.startsWith('@/') ? {} : require(name)) }))
const stubImports = new Proxy({}, { has: () => true, get: (_, name) => name === '@/lib/supabase/client' ? { createClient: () => ({}) } : name === '@/lib/site-unit-permissions' ? sitePermissions : {} })
const logic = compile(COMPONENT, stubImports)
const migration = fs.readFileSync(MIGRATION, 'utf8')
const now = new Date('2026-11-20T12:00:00Z')
const item = overrides => ({
  id: 'i', timeline_id: 't', milestone_key: 't_minus_2h', offset_minutes: -120, label: 'Task', owner: 'AO', sop_ref: 'TCNP.01.04',
  position: 1, done_at: null, done_by: null, note: null, note_by: null, note_at: null, ...overrides,
})
const access = overrides => ({ loadFailed: false, isMember: false, isCommand: false, isCommandMember: false, canCoordinate: false, ...overrides })

test('a task is due at ETA + its offset, and nothing is due without an ETA', () => {
  assert.equal(logic.itemDueAt('2026-11-21T10:00:00Z', -120).toISOString(), '2026-11-21T08:00:00.000Z')
  assert.equal(logic.itemDueAt('2026-11-21T10:00:00Z', 0).toISOString(), '2026-11-21T10:00:00.000Z')
  assert.equal(logic.itemDueAt(null, -120), null)
  assert.equal(logic.itemDueAt('not a date', -120), null)
})

test('task state: done wins, then overdue, due within the hour, upcoming, or waiting for an ETA', () => {
  assert.equal(logic.itemState(item({ done_at: '2026-11-19T00:00:00Z' }), '2026-11-20T13:00:00Z', now), 'done')
  assert.equal(logic.itemState(item(), '2026-11-20T13:00:00Z', now), 'overdue') // due 11:00
  assert.equal(logic.itemState(item(), '2026-11-20T14:30:00Z', now), 'due_soon') // due 12:30
  assert.equal(logic.itemState(item(), '2026-11-21T10:00:00Z', now), 'upcoming')
  assert.equal(logic.itemState(item(), null, now), 'no_eta')
})

test('tasks are grouped in SOP order with progress and overdue counts', () => {
  const eta = '2026-11-20T13:00:00Z'
  const groups = logic.groupByMilestone([
    item({ id: 'landing', milestone_key: 'on_landing', offset_minutes: 0, position: 14 }),
    item({ id: 'b', position: 9 }),
    item({ id: 'a', position: 8, done_at: 'x' }),
    item({ id: 'week', milestone_key: 't_minus_1w', offset_minutes: -10080, position: 1 }),
  ], eta, now)
  deepEq(groups.map(group => [group.key, group.items.map(entry => entry.id), group.done, group.overdue, group.complete]), [
    ['t_minus_1w', ['week'], 0, 1, false],
    ['t_minus_2h', ['a', 'b'], 1, 1, false],
    ['on_landing', ['landing'], 0, 0, false],
  ])
  assert.equal(groups[1].dueAt.toISOString(), '2026-11-20T11:00:00.000Z')
  deepEq(logic.defaultOpenMilestones(groups), ['t_minus_1w', 't_minus_2h'])
  deepEq(logic.groupByMilestone([], eta, now), [])
})

test('relative due times read naturally', () => {
  assert.equal(logic.relativeDue(new Date('2026-11-20T15:00:00Z'), now), 'in 3 h')
  assert.equal(logic.relativeDue(new Date('2026-11-20T11:30:00Z'), now), '30 min ago')
  assert.equal(logic.relativeDue(new Date('2026-11-25T12:00:00Z'), now), 'in 5 d')
  assert.equal(logic.relativeDue(now, now), 'now')
  assert.equal(logic.relativeDue(null, now), 'needs an ETA')
})

test('who may tick mirrors can_tick_alpha_timeline(): Command, coordinators, or programme work', () => {
  assert.equal(logic.canTickTimeline(access({ isCommand: true }), false), true)
  assert.equal(logic.canTickTimeline(access({ isMember: true, canCoordinate: true }), false), true)
  assert.equal(logic.canTickTimeline(access({ isMember: true }), true), true)
  assert.equal(logic.canTickTimeline(access({ isMember: true }), false), false)
  assert.equal(logic.canTickTimeline(access({ isCommandMember: true }), false), false)
})

test('an officer who cannot tick is told why, in words they can act on', () => {
  assert.equal(logic.tickBlockReason(access({ isCommand: true }), false, true), null)
  // Not active yet: the head cannot fix that (availability request / Command).
  assert.match(logic.tickBlockReason(access({ isMember: true }), false, true, false), /not active on this programme yet, so you can view but not tick these tasks\. Ask Command/)
  // Active but not given the work: the head can.
  assert.equal(logic.tickBlockReason(access({ isMember: true }), false, true, true), 'You are active on this programme, but your Alpha head has not given you this work yet.')
  // Standing unknown: say what is needed without guessing which part is missing.
  assert.match(logic.tickBlockReason(access({ isMember: true }), false, true), /active on this programme and have been given this work/)
  assert.match(logic.tickBlockReason(access({ isCommandMember: true }), false, true), /Command can follow/)
  assert.match(logic.tickBlockReason(access({}), false, true), /Only Alpha officers/)
  assert.match(logic.tickBlockReason(access({ loadFailed: true }), false, true), /couldn't confirm/)
  assert.match(logic.tickBlockReason(access({ isMember: true }), false, false), /Choose a programme/)
})

test('an optimistic tick keeps the first officer, and an untick clears it', () => {
  const me = { id: 'me', full_name: 'Me' }
  const items = [item({ id: 'a' }), item({ id: 'b', done_at: '2026-11-20T10:00:00Z', done_by: 'other', done_by_user: { full_name: 'Other' } })]
  const ticked = logic.applyTick(items, 'a', true, me, '2026-11-20T12:00:00Z')
  deepEq([ticked[0].done_at, ticked[0].done_by, ticked[0].done_by_user.full_name], ['2026-11-20T12:00:00Z', 'me', 'Me'])
  assert.equal(logic.applyTick(items, 'b', true, me, 'x')[1].done_by, 'other')
  const cleared = logic.applyTick(items, 'b', false, me, 'x')[1]
  deepEq([cleared.done_at, cleared.done_by], [null, null])
  assert.equal(ticked[1], items[1], 'other rows are left alone')
})

test('the milestones match the SOP arrival routine and the seeded tasks', () => {
  deepEq(logic.ALPHA_MILESTONES.map(m => [m.key, m.offsetMinutes]), [
    ['t_minus_2w', -20160], ['t_minus_1w', -10080], ['t_minus_24h', -1440], ['t_minus_12h', -720], ['t_minus_6h', -360],
    ['t_minus_2h', -120], ['t_minus_1h', -60], ['on_landing', 0],
  ])
  const seeds = [...migration.matchAll(/\('(t_minus_\w+|on_landing)',\s*(-?\d+),\s*'((?:[^']|'')+)',\s*'([^']+)',\s*'(TCNP\.01\.0[467])',\s*(\d+)\)/g)]
  assert.equal(logic.SEEDED_TASK_COUNT, 17)
  assert.equal(seeds.length, logic.SEEDED_TASK_COUNT, 'SEEDED_TASK_COUNT matches the seed')
  for (const [, key, offset] of seeds) {
    assert.equal(logic.ALPHA_MILESTONES.find(m => m.key === key).offsetMinutes, Number(offset), key)
  }
  deepEq(seeds.map(seed => Number(seed[6])), Array.from({ length: logic.SEEDED_TASK_COUNT }, (_, i) => i + 1))
  assert.equal(new Set(seeds.map(seed => seed[1])).size, logic.ALPHA_MILESTONES.length, 'every milestone has at least one task')
  assert.equal(seeds.filter(seed => seed[5] === 'TCNP.01.07').length, 2, 'the HOD-AO visa and immigration checks')
  // The milestone CHECK covers every milestone.
  const check = migration.match(/CHECK \(milestone_key IN \(([\s\S]*?)\)\)/)[1]
  for (const m of logic.ALPHA_MILESTONES) assert.ok(check.includes(`'${m.key}'`), m.key)
  const sop = fs.readFileSync('app/(dashboard)/sop/page.tsx', 'utf8')
  for (const phrase of ['1 week before arrival', 'SSS & FAAN', 'Cheetah(s) are available at least 24hrs', 'Eagle Square ODS 12hrs and again 6hrs', 'at least 2hrs to ETA', '1hr to ETA', 'bag/baggage tagging', 'emergency contact lists', 'Cheetah parking and pick-up points']) {
    assert.ok(sop.includes(phrase), `SOP still says: ${phrase}`)
  }
})

test('the copy is built from the milestones and the seed count, so it cannot drift', () => {
  assert.equal(logic.milestoneSummary(), '2 weeks, 1 week, 24 hours, 12 hours, 6 hours, 2 hours and 1 hour out, and on landing')
  assert.equal(logic.milestoneSummary([{ label: '1 hour out', offsetMinutes: -60 }]), '1 hour out')
  const component = fs.readFileSync(COMPONENT, 'utf8')
  assert.ok(!/\b14 SOP\b|1 week, 24h/.test(component), 'no hard-coded task count or milestone list')
  assert.match(component, /\{SEEDED_TASK_COUNT\} SOP arrival tasks/)
})

test('ETA lines, Eagle Square labels and realtime deletes', () => {
  assert.equal(logic.etaSummary({ eta: null, eta_source: 'none' }, now), 'No ETA yet')
  assert.match(logic.etaSummary({ eta: '2026-11-20T15:00:00Z', eta_source: 'itinerary' }, now), /^ETA .+ \(in 3 h\)$/)
  assert.equal(logic.eagleSquareLabel({ name: 'Nnamdi Azikiwe International', code: 'ABV' }), 'Nnamdi Azikiwe International (ABV)')
  assert.equal(logic.eagleSquareLabel({ name: 'Kaduna', code: null }), 'Kaduna')
  assert.equal(logic.eagleSquareLabel(null), null)
  assert.equal(logic.isTimelineDeleteFor({ old: { id: 'tl-1' } }, 'tl-1'), true)
  assert.equal(logic.isTimelineDeleteFor({ old: { id: 'tl-2' } }, 'tl-1'), false)
  assert.equal(logic.isTimelineDeleteFor({ old: {} }, 'tl-1'), false)
  assert.equal(logic.isTimelineDeleteFor({ old: { id: 'tl-1' } }, null), false)
})

test('the migration follows the one rule and the migration conventions', () => {
  assert.ok(!/^\s*(BEGIN|COMMIT)\s*;/im.test(migration))
  assert.match(migration, /SELECT public\.is_admin\(\) OR public\.is_unit_member\('alpha'\) OR public\.is_unit_member\('command'\)/)
  assert.match(migration, /public\.is_admin\(\)\s+OR public\.can_coordinate_unit\('alpha'\)\s+OR public\.can_work_unit_programme\('alpha', target_program\)/)
  const coordinate = migration.match(/USING \(public\.can_coordinate_unit\('alpha'\) OR public\.is_admin\(\)\)/g) || []
  assert.equal(coordinate.length, 2, 'both tables: edit/delete is the Alpha coordinators or admin/Command')
  assert.equal((migration.match(/ENABLE ROW LEVEL SECURITY/g) || []).length, 3)
  const definers = migration.match(/SECURITY DEFINER\s+SET search_path = public, pg_temp/g) || []
  assert.equal(definers.length, (migration.match(/SECURITY DEFINER/g) || []).length, 'every definer pins search_path')
  for (const fn of ['can_read_alpha_timelines()', 'can_tick_alpha_timeline(uuid)', 'alpha_arrival_board(uuid)', 'alpha_start_arrival_timeline(uuid, uuid)', 'alpha_tick_timeline_item(uuid, boolean, text)']) {
    assert.ok(migration.includes(`REVOKE ALL ON FUNCTION public.${fn} FROM PUBLIC, anon;`), fn)
    assert.ok(migration.includes(`GRANT EXECUTE ON FUNCTION public.${fn} TO authenticated, service_role;`), fn)
  }
  assert.ok(migration.includes('REVOKE ALL ON FUNCTION public.alpha_send_timeline_overdue() FROM PUBLIC, anon, authenticated;'))
  assert.ok(migration.includes("'kind', 'alpha_timeline_overdue'"))
  assert.ok(migration.includes("SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'tcnp-alpha-timeline-overdue'"))
  assert.ok(!/passport|phone|email/i.test(migration.match(/RETURNS TABLE \(\s*papa_id[\s\S]*?\)/)[0]), 'the board never returns contact or passport details')
  assert.ok(!migration.includes("'restricted'"), 'one ETA rule: every reader gets it (Command members read itineraries anyway)')
  // Who ticked and when is written only by the tick RPC.
  assert.match(migration, /BEFORE INSERT OR UPDATE ON public\.alpha_arrival_timeline_items\s+FOR EACH ROW EXECUTE FUNCTION public\.alpha_timeline_items_guard_audit\(\)/)
  assert.match(migration, /PERFORM set_config\('tcnp\.alpha_tick', 'on', true\);\s+UPDATE public\.alpha_arrival_timeline_items/)
  assert.match(migration, /RETURNING \* INTO result;\s+PERFORM set_config\('tcnp\.alpha_tick', '', true\);/)
})

test('the Alpha page reads unit access from membership, not role or Oscar text', () => {
  const page = fs.readFileSync(PAGE, 'utf8')
  for (const gone of ['alphaRoleFor', 'canManageEagles', 'effectiveOscarRole', 'oscarToRole', ".includes('alpha')"]) assert.ok(!page.includes(gone), gone)
  assert.match(page, /useUnitAccess\('alpha'\)/)
  assert.match(page, /const canManageSquares = alpha\.canManage \|\| alpha\.isCommand/)
  const component = fs.readFileSync(COMPONENT, 'utf8')
  assert.ok(!component.includes('reload resets'))
  assert.ok(!component.includes('papaNme'))
})

// ───────────────────────── jsdom ─────────────────────────

let JSDOM
try { ({ JSDOM } = require(process.env.FORM_DOM_RUNTIME || path.resolve('.next/form-ui-qa/node_modules/jsdom'))) } catch {}

function setupDom(t, url) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url, pretendToBeVisual: true })
  const previous = new Map()
  for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Event', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'MutationObserver', 'Node', 'CustomEvent', 'IS_REACT_ACT_ENVIRONMENT']) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'window' ? dom.window : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] })
  }
  dom.restore = () => {
    dom.window.close()
    for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name] }
  }
  return dom
}

function makeImports(React, overrides, confirmAnswer = () => true) {
  const cache = new Map()
  const selectAPI = {
    Select: ({ children, value, onValueChange }) => {
      const items = React.Children.toArray(children)
      const trigger = items.find(entry => entry.type === selectAPI.SelectTrigger)
      return React.createElement('select', { id: trigger?.props.id, 'aria-label': trigger?.props['aria-label'], value: value ?? '', onChange: event => onValueChange(event.target.value) }, children)
    },
    SelectTrigger: () => null, SelectValue: () => null, SelectContent: ({ children }) => children,
    SelectItem: ({ children, value }) => React.createElement('option', { value }, children),
  }
  const TabsCtx = React.createContext({ value: '', onValueChange: () => {} })
  const tabsAPI = {
    Tabs: ({ value, onValueChange, children }) => React.createElement(TabsCtx.Provider, { value: { value, onValueChange } }, React.createElement('div', null, children)),
    TabsList: ({ children }) => React.createElement('div', { role: 'tablist' }, children),
    TabsTrigger: ({ value, children }) => { const ctx = React.useContext(TabsCtx); return React.createElement('button', { role: 'tab', 'aria-selected': ctx.value === value, onClick: () => ctx.onValueChange(value) }, children) },
    TabsContent: ({ value, children }) => { const ctx = React.useContext(TabsCtx); return ctx.value === value ? React.createElement('div', { role: 'tabpanel', 'data-tab': value }, children) : null },
  }
  const dialogAPI = {
    Dialog: ({ open, children }) => (open ? React.createElement('div', { role: 'dialog' }, children) : null),
    DialogContent: ({ children }) => children, DialogHeader: ({ children }) => children,
    DialogTitle: ({ children }) => React.createElement('h2', null, children), DialogDescription: ({ children }) => React.createElement('p', null, children),
  }
  const imports = new Proxy({}, {
    has: () => true,
    get(_, name) {
      if (name in overrides) return overrides[name]
      if (name === '@/components/ui/select') return selectAPI
      if (name === '@/components/ui/tabs') return tabsAPI
      if (name === '@/components/ui/dialog') return dialogAPI
      if (name === 'sonner') return { toast: { success() {}, error() {}, info() {} } }
      if (name === '@/components/providers/ConfirmProvider') return { useConfirm: () => async options => confirmAnswer(options) }
      if (typeof name === 'string' && name.startsWith('@/')) {
        const base = name.slice(2)
        const file = [`${base}.tsx`, `${base}.ts`].find(candidate => fs.existsSync(candidate))
        if (!cache.has(file)) cache.set(file, compile(file, imports))
        return cache.get(file)
      }
      return require(name)
    },
  })
  return imports
}

function fakeSupabase({ board, timeline, items }) {
  const calls = []
  const result = (table, filters) => {
    if (table === 'programs') return { data: [{ id: 'prog', name: 'Men’s Conference', status: 'planning', start_date: '2026-11-09' }], error: null }
    if (table === 'alpha_arrival_timelines') return { data: timeline, error: null }
    if (table === 'alpha_arrival_timeline_items') return { data: items(), error: null }
    if (table === 'eagle_squares') return { data: [], error: null }
    return { data: [], error: null, filters }
  }
  const client = {
    calls,
    from(table) {
      const filters = {}
      const builder = {
        select: () => builder, order: () => builder, update: patch => { calls.push(['update', table, patch]); return builder }, delete: () => { calls.push(['delete', table]); return builder },
        eq: (key, value) => { filters[key] = value; return builder },
        maybeSingle: async () => result(table, filters),
        then: (resolve, reject) => Promise.resolve(result(table, filters)).then(resolve, reject),
      }
      return builder
    },
    rpc: async (name, args) => {
      calls.push(['rpc', name, args])
      if (name === 'alpha_arrival_board') return { data: board(), error: null }
      if (name === 'alpha_tick_timeline_item') return client.tickResponse ? client.tickResponse(args) : { data: null, error: null }
      return { data: 'new-timeline', error: null }
    },
    channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel },
    removeChannel: async () => {},
  }
  return client
}

const boardRow = overrides => ({
  papa_id: 'papa-1', full_name: 'Gabriel Ogbeche', title: 'Rev.', flight_number: 'TR123', arrival_city: 'Lagos',
  eta: '2026-11-20T13:00:00Z', eta_source: 'itinerary', timeline_id: 'tl-1', items_total: 2, items_done: 0, items_overdue: 1, next_due_at: null, ...overrides,
})

async function renderTimeline(t, { accessValue, canWork = false, board, items = () => [], confirmAnswer, timeline = { id: 'tl-1', program_id: 'prog', papa_id: 'papa-1', eagle_square_id: 'sq-1', eta_override: null, notes: 'Gate B', eagle_square: { name: 'Nnamdi Azikiwe International', code: 'ABV' } } }) {
  const dom = setupDom(t, 'https://tcnp.example/alpha?tab=timeline')
  const React = require('react'), { act } = React, { createRoot } = require('react-dom/client'), { QueryClient, QueryClientProvider } = require('@tanstack/react-query')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } })
  const supabase = fakeSupabase({ board, timeline, items })
  const errors = []
  const imports = makeImports(React, {
    '@/lib/supabase/client': { createClient: () => supabase },
    '@/hooks/useCurrentUser': { useCurrentUser: () => ({ data: { id: 'me', full_name: 'Officer Me' } }) },
    '@/hooks/useUnitAccess': { useCanWorkUnitProgramme: () => ({ canWork, isLoading: false, loadFailed: false }) },
    '@/lib/notify': { notifyError: (_, message) => errors.push(message) },
  }, confirmAnswer)
  const Component = compile(COMPONENT, imports).default
  const root = createRoot(document.getElementById('root'))
  t.after(async () => { await act(async () => root.unmount()); queryClient.clear(); dom.restore() })
  const selections = []
  await act(async () => root.render(React.createElement(QueryClientProvider, { client: queryClient },
    React.createElement(Component, { access: accessValue, onSelectionChange: selection => selections.push(selection) }))))
  const settle = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setTimeout(resolve, 0)) })
  await settle()
  const button = label => [...document.querySelectorAll('button')].find(node => node.getAttribute('aria-label') === label || node.textContent.trim() === label)
  return { dom, act, settle, button, supabase, errors, selections, text: () => document.body.textContent }
}

test('timeline card: a member not on the programme can read but is told why they cannot tick', { skip: !JSDOM }, async t => {
  const ui = await renderTimeline(t, {
    accessValue: access({ isMember: true }),
    board: () => [boardRow()],
    items: () => [item({ id: 'a', timeline_id: 'tl-1', label: 'At least two AOs at the Eagle Square', position: 8 })],
  })
  assert.ok(ui.text().includes('Rev. Gabriel Ogbeche'))
  assert.ok(ui.text().includes('1 overdue'))
  await ui.act(async () => ui.button('Open the arrival timeline for Rev. Gabriel Ogbeche').click())
  await ui.settle()
  deepEq(ui.selections.at(-1), { programme: 'prog', papa: 'papa-1' })
  assert.ok(ui.text().includes('At least two AOs at the Eagle Square'))
  assert.ok(ui.text().includes('Gate B'))
  assert.ok(ui.text().includes('Eagle Square: Nnamdi Azikiwe International (ABV)'), 'the AOs see which square they are at')
  assert.ok(ui.text().includes('You are not active on this programme yet, so you can view but not tick these tasks. Ask Command to add you to the programme.'))
  const tick = ui.button('Tick: At least two AOs at the Eagle Square')
  assert.ok(tick.disabled, 'the tick button is off for them')
  assert.ok(!ui.button('Edit the timeline for Rev. Gabriel Ogbeche'), 'members get no edit controls')
})

test('timeline card: a programme worker ticks optimistically and a failed tick rolls back', { skip: !JSDOM }, async t => {
  let release
  const ui = await renderTimeline(t, {
    accessValue: access({ isMember: true }),
    canWork: true,
    board: () => [boardRow()],
    items: () => [item({ id: 'a', timeline_id: 'tl-1', label: 'Confirm the actual ETA with the airline authorities', position: 9 })],
  })
  await ui.act(async () => ui.button('Open the arrival timeline for Rev. Gabriel Ogbeche').click())
  await ui.settle()
  ui.supabase.tickResponse = () => new Promise(resolve => { release = resolve })
  await ui.act(async () => ui.button('Tick: Confirm the actual ETA with the airline authorities').click())
  await ui.settle()
  assert.ok(ui.text().includes('Ticked by Officer Me'), 'shown at once, before the server answers')
  deepEq(ui.supabase.calls.find(call => call[1] === 'alpha_tick_timeline_item')[2], { target_item: 'a', is_done: true, item_note: null })
  await ui.act(async () => release({ data: null, error: { code: '42501', message: 'denied' } }))
  await ui.settle()
  assert.ok(!ui.text().includes('Ticked by Officer Me'), 'rolled back after the refusal')
  deepEq(ui.errors, ['Could not update the task'])
})

test('timeline card: no timeline yet offers "Start timeline" to the head, who also gets edit controls', { skip: !JSDOM }, async t => {
  let started = false
  const ui = await renderTimeline(t, {
    accessValue: access({ isMember: true, canCoordinate: true }),
    board: () => [boardRow({ timeline_id: started ? 'tl-1' : null, items_total: 0, items_overdue: 0, eta: null, eta_source: 'none' })],
  })
  assert.ok(ui.text().includes('Not started'))
  assert.ok(ui.text().includes('No ETA yet'))
  await ui.act(async () => ui.button('Open the arrival timeline for Rev. Gabriel Ogbeche').click())
  await ui.settle()
  assert.ok(ui.text().includes('No timeline for Rev. Gabriel Ogbeche yet'))
  assert.ok(ui.text().includes('Starting it adds the 17 SOP arrival tasks'))
  assert.ok(ui.text().includes('counted back from the ETA: 2 weeks, 1 week,'))
  started = true
  await ui.act(async () => ui.button('Start timeline').click())
  await ui.settle()
  deepEq(ui.supabase.calls.find(call => call[1] === 'alpha_start_arrival_timeline')[2], { target_program: 'prog', target_papa: 'papa-1' })
  assert.ok(ui.button('Edit the timeline for Rev. Gabriel Ogbeche'), 'the head can edit once it exists')
  assert.ok(ui.button('Delete the timeline for Rev. Gabriel Ogbeche'))
})

test('timeline card: unticking asks first, and saying no leaves the tick alone', { skip: !JSDOM }, async t => {
  const asked = []
  let answer = false
  const ui = await renderTimeline(t, {
    accessValue: access({ isMember: true, canCoordinate: true }),
    board: () => [boardRow()],
    confirmAnswer: options => { asked.push(options); return answer },
    items: () => [item({ id: 'a', timeline_id: 'tl-1', label: 'Radios working', done_at: '2026-11-20T10:00:00Z', done_by: 'other', done_by_user: { full_name: 'Officer Ada' } }), item({ id: 'b', timeline_id: 'tl-1', label: 'Still open', position: 2 })],
  })
  await ui.act(async () => ui.button('Open the arrival timeline for Rev. Gabriel Ogbeche').click())
  await ui.settle()
  await ui.act(async () => ui.button('Untick: Radios working').click())
  await ui.settle()
  assert.equal(asked.length, 1)
  assert.match(asked[0].message, /Officer Ada's tick and its time are cleared/)
  assert.ok(!ui.supabase.calls.some(call => call[1] === 'alpha_tick_timeline_item'), 'no untick without a yes')
  assert.ok(ui.text().includes('Ticked by Officer Ada'))
  answer = true
  await ui.act(async () => ui.button('Untick: Radios working').click())
  await ui.settle()
  deepEq(ui.supabase.calls.find(call => call[1] === 'alpha_tick_timeline_item')[2], { target_item: 'a', is_done: false, item_note: null })
})

test('timeline card: a Command-unit viewer reads without a Start button', { skip: !JSDOM }, async t => {
  const ui = await renderTimeline(t, {
    accessValue: access({ isCommandMember: true }),
    board: () => [boardRow({ timeline_id: null })],
  })
  await ui.act(async () => ui.button('Open the arrival timeline for Rev. Gabriel Ogbeche').click())
  await ui.settle()
  assert.ok(!ui.button('Start timeline'))
  assert.ok(ui.text().includes('Command can follow these timelines.'))
})

async function renderPage(t, { url, alphaAccess, commandAccess = {} }) {
  const dom = setupDom(t, url)
  const React = require('react'), { act } = React, { createRoot } = require('react-dom/client'), { QueryClient, QueryClientProvider } = require('@tanstack/react-query')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const seen = { briefingRole: null, timelineProps: null }
  const unit = values => ({ loadFailed: false, isLoading: false, isPlatformAdmin: false, isCommand: false, isMember: false, isSubLead: false, isHead: false, canCoordinate: false, canManage: false, ...values })
  // Like Next's router: a soft navigation re-renders the mounted page with the new search params.
  const addressListeners = new Set()
  const subscribe = listener => { addressListeners.add(listener); return () => addressListeners.delete(listener) }
  const navigate = href => act(async () => { dom.window.history.pushState(null, '', href); for (const listener of addressListeners) listener() })
  const imports = makeImports(React, {
    'next/navigation': { useSearchParams: () => new URL(React.useSyncExternalStore(subscribe, () => dom.window.location.href)).searchParams },
    '@/lib/supabase/client': { createClient: () => fakeSupabase({ board: () => [], timeline: null, items: () => [] }) },
    '@/hooks/useUnitAccess': { useUnitAccess: slug => unit(slug === 'alpha' ? alphaAccess : commandAccess) },
    '@/hooks/useDashboardDeletions': { useReloadOnDeletion: () => {} },
    '@/components/papas/PapaBriefingsSection': { __esModule: true, default: ({ role }) => { seen.briefingRole = role; return React.createElement('div', null, 'briefings:' + role) } },
    '@/components/eagles/AOArrivalTimeline': { __esModule: true, default: props => { seen.timelineProps = props; return React.createElement('div', null, 'timeline-card') } },
    '@/components/eagles/FlightSearch': { __esModule: true, default: () => null },
    '@/components/aviation/PapaFlightMonitor': { __esModule: true, default: () => null },
    '@/lib/notify': { notifyError() {} },
  })
  const Page = compile(PAGE, imports, { window: dom.window }).default
  const root = createRoot(document.getElementById('root'))
  t.after(async () => { await act(async () => root.unmount()); queryClient.clear(); dom.restore() })
  await act(async () => root.render(React.createElement(QueryClientProvider, { client: queryClient }, React.createElement(Page))))
  await act(async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setTimeout(resolve, 0)) })
  const clickTab = label => act(async () => [...document.querySelectorAll('[role="tab"]')].find(node => node.textContent === label).click())
  return { seen, dom, clickTab, navigate, text: () => document.body.textContent, addAirport: () => [...document.querySelectorAll('button')].some(node => node.textContent.includes('Add Airport')) }
}

test('Alpha page: ?tab=timeline opens the timeline for an Alpha member with read-only briefings and no Eagle Square edits', { skip: !JSDOM }, async t => {
  const page = await renderPage(t, { url: 'https://tcnp.example/alpha?tab=timeline&programme=prog&papa=papa-1', alphaAccess: { isMember: true } })
  assert.equal(page.seen.briefingRole, 'alpha_oscar')
  assert.ok(page.text().includes('timeline-card'))
  assert.equal(page.seen.timelineProps.initialProgrammeId, 'prog')
  assert.equal(page.seen.timelineProps.initialPapaId, 'papa-1')
  deepEq(page.seen.timelineProps.access, { loadFailed: false, isMember: true, isCommand: false, isCommandMember: false, canCoordinate: false })
  await page.clickTab('Eagle Squares')
  assert.equal(new URL(page.dom.window.location.href).searchParams.get('tab'), null, 'the default tab leaves the address bar clean')
  assert.ok(!page.text().includes('timeline-card'))
  assert.equal(page.addAirport(), false)
  await page.clickTab('Arrival Timeline')
  assert.equal(new URL(page.dom.window.location.href).searchParams.get('tab'), 'timeline')
})

test('Alpha page: a notification tap or back/forward that changes ?tab= moves the mounted page with it', { skip: !JSDOM }, async t => {
  const page = await renderPage(t, { url: 'https://tcnp.example/alpha', alphaAccess: { isMember: true, isHead: true, canCoordinate: true, canManage: true } })
  assert.ok(page.addAirport(), 'starts on Eagle Squares')
  assert.ok(!page.text().includes('timeline-card'))
  await page.navigate('/alpha?tab=timeline')
  assert.ok(page.text().includes('timeline-card'), 'the overdue notification opens the timeline')
  await page.navigate('/alpha?tab=tracking')
  assert.ok(!page.text().includes('timeline-card'))
  assert.equal(page.addAirport(), false)
  await page.navigate('/alpha')
  assert.ok(page.addAirport(), 'back to Eagle Squares')
  await page.clickTab('Arrival Timeline')
  assert.ok(page.text().includes('timeline-card'), 'an in-page tab click still works')
})

test('Alpha page: the head gets the editable briefing and Eagle Square controls', { skip: !JSDOM }, async t => {
  const head = await renderPage(t, { url: 'https://tcnp.example/alpha', alphaAccess: { isMember: true, isHead: true, canCoordinate: true, canManage: true } })
  assert.equal(head.seen.briefingRole, 'head_alpha_oscar')
  assert.equal(head.addAirport(), true)
})

test('Alpha page: Command (not an Alpha member) manages squares and sees the timeline, without an Alpha briefing', { skip: !JSDOM }, async t => {
  const command = await renderPage(t, { url: 'https://tcnp.example/alpha?tab=timeline', alphaAccess: { isCommand: true } })
  assert.equal(command.seen.briefingRole, null)
  assert.ok(command.text().includes('timeline-card'))
  await command.clickTab('Eagle Squares')
  assert.equal(command.addAirport(), true)
})

test('Alpha page: an officer outside Alpha and Command gets no timeline tab, even from the address bar', { skip: !JSDOM }, async t => {
  const outsider = await renderPage(t, { url: 'https://tcnp.example/alpha?tab=timeline', alphaAccess: {} })
  assert.ok(!outsider.text().includes('Arrival Timeline'))
  assert.ok(!outsider.text().includes('timeline-card'))
  assert.equal(outsider.addAirport(), false)
  assert.equal(outsider.seen.briefingRole, null)
})
