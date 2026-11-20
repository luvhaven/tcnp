// Victor Routine Check (SOP TCNP.01.09): pure logic, the migration's shape,
// and jsdom renders of the check card and the SOP page's unit documents.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function compile(file, imports = {}, globals = {}) {
  const mod = { exports: {} }
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2020 },
  }).outputText
  vm.runInNewContext(source, { module: mod, exports: mod.exports, require: name => imports[name] || require(name), console, Promise, ...globals })
  return mod.exports
}
const plain = value => JSON.parse(JSON.stringify(value))
const stub = new Proxy({}, { get: () => () => null })

// The pure helpers need none of the component's runtime imports.
const routine = compile('components/theatre/DenChecklist.tsx', new Proxy({}, { get: (_, name) => (String(name).startsWith('@/') ? stub : undefined) }))

const at = (dayOffset, hour, minute = 0) => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hour, minute).toISOString()
}

test('the list is the manual\'s 11 routine-check items plus the protocol lounge and a safety item', () => {
  const items = plain(routine.VICTOR_ROUTINE_ITEMS)
  assert.equal(items.length, 13)
  assert.deepEqual(items.slice(0, 11).map(item => item.source), Array.from({ length: 11 }, (_, i) => `TCNP.01.09 #${i + 1}`))
  assert.ok(items.some(item => item.key === 'protocol_lounge' && item.source === 'Event Routines'))
  assert.ok(items.some(item => item.key === 'exits_safe' && /exits/i.test(item.label)))
  assert.ok(!items.some(item => /lighting|air-conditioning/i.test(item.label)), 'lighting is Echo\'s job, AC is not in the SOP')
  assert.equal(new Set(items.map(item => item.key)).size, items.length, 'keys are unique')
  assert.ok(items.some(item => /HOP/.test(item.label)) && items.some(item => /Tango Uniform/.test(item.label)) && items.some(item => /Echo/.test(item.label)))
})

test('round labels: Pre-operation, then Round N; old fixed slots are not rounds', () => {
  assert.equal(routine.roundLabel(1), 'Pre-operation')
  assert.equal(routine.roundLabel(4), 'Round 4')
  assert.equal(routine.roundNumber('Pre-operation'), 1)
  assert.equal(routine.roundNumber(' round 7 '), 7)
  assert.equal(routine.roundNumber('Round 1'), null)
  assert.equal(routine.roundNumber('Pre-Program (Morning)'), null)
  assert.deepEqual(plain(routine.roundOptions([])), ['Pre-operation', 'Round 2', 'Round 3', 'Round 4'])
  assert.deepEqual(plain(routine.roundOptions(['Pre-operation', 'Round 2', 'Round 3', 'Round 4'])).at(-1), 'Round 5')
  assert.equal(plain(routine.roundOptions(['Round 9'])).length, 10)
})

test('N of 4 minimum rounds counts distinct rounds today for this programme only', () => {
  const logs = [
    { session: 'Pre-operation', performed_at: at(0, 7), program_id: 'p1' },
    { session: 'Pre-operation', performed_at: at(0, 8), program_id: 'p1' }, // a recheck counts once
    { session: 'Round 2', performed_at: at(0, 10), program_id: 'p1' },
    { session: 'Round 3', performed_at: at(0, 11), program_id: 'p2' }, // another programme
    { session: 'Round 4', performed_at: at(-1, 23, 30), program_id: 'p1' }, // yesterday, local time
    { session: 'Round 4', performed_at: 'not a date', program_id: 'p1' },
    { session: 'Pre-Program (Morning)', performed_at: at(0, 6), program_id: null }, // old row, no programme
  ]
  const summary = plain(routine.summariseRounds(logs, 'p1'))
  assert.deepEqual(summary.rounds, ['Pre-operation', 'Round 2'])
  assert.equal(summary.count, 2)
  assert.equal(summary.complete, false)
  assert.equal(summary.nextRound, 'Round 3')
  assert.equal(routine.summariseRounds(logs, null).count, 0)

  const full = ['Pre-operation', 'Round 2', 'Round 3', 'Round 4'].map((session, i) => ({ session, performed_at: at(0, 7 + i), program_id: 'p1' }))
  const done = plain(routine.summariseRounds(full, 'p1'))
  assert.equal(done.complete, true)
  assert.equal(done.nextRound, 'Round 5')
  // A gap is offered first.
  assert.equal(routine.summariseRounds([full[0], full[2]], 'p1').nextRound, 'Round 2')
  // Just after local midnight belongs to today.
  assert.equal(routine.summariseRounds([{ session: 'Round 2', performed_at: at(0, 0, 5), program_id: 'p1' }], 'p1').count, 1)
})

test('checks are stored as labelled snapshots and old boolean rows still read', () => {
  const snapshot = plain(routine.buildChecksSnapshot({ oscar_seats: true, exits_safe: true, bogus: true }))
  assert.equal(snapshot.length, 13)
  assert.deepEqual(snapshot[0], { key: 'oscar_seats', label: 'Seats are available for all Oscars', done: true })
  assert.equal(snapshot.filter(item => item.done).length, 2)
  assert.ok(snapshot.every(item => typeof item.label === 'string' && item.label.length > 0))

  const legacy = plain(routine.normaliseChecks([true, false]))
  assert.deepEqual(legacy, [
    { label: 'All seats and rows are well-arranged and accessible', done: true },
    { label: 'Entry points and aisles are clear and unobstructed', done: false },
  ])
  assert.deepEqual(plain(routine.normaliseChecks([{ label: 'X', done: 'yes' }, 7])), [{ label: 'X', done: false }, { label: 'Item 2', done: false }])
  assert.deepEqual(plain(routine.normaliseChecks({ not: 'an array' })), [])
  assert.match(routine.formatLocalTime(at(0, 9)), /^Today /)
  assert.equal(routine.formatLocalTime('nope'), 'Time unknown')
})

test('programme default: today\'s programme at this theatre, never a finished one', () => {
  const now = new Date(2026, 10, 16, 9)
  const ids = list => plain(list).map(p => p.id)
  const programmes = [
    { id: 'next-month', status: 'planning', theatre_id: 'T', start_date: '2026-12-14', end_date: '2026-12-16' },
    { id: 'today', status: 'active', theatre_id: null, start_date: '2026-11-15', end_date: '2026-11-17' },
    { id: 'done', status: 'completed', theatre_id: 'T', start_date: '2026-11-16', end_date: '2026-11-16' },
    { id: 'old', status: 'archived', theatre_id: 'T', start_date: '2026-01-01', end_date: null },
    { id: 'elsewhere-today', status: 'active', theatre_id: 'X', start_date: '2026-11-16', end_date: null },
    { id: 'next-week', status: 'planning', theatre_id: 'T', start_date: '2026-11-23', end_date: null },
    { id: 'past', status: 'planning', theatre_id: 'T', start_date: '2026-10-01', end_date: '2026-10-02' },
  ]
  const ranked = ids(routine.rankProgrammes(programmes, 'T', new Set(['today']), now))
  assert.deepEqual(ranked, ['today', 'next-week', 'next-month', 'past', 'elsewhere-today'])
  assert.ok(!ranked.includes('done') && !ranked.includes('old'), 'completed and archived programmes are not offered')
  // Nothing at this theatre today: the nearest upcoming one here beats one running elsewhere.
  assert.equal(ids(routine.rankProgrammes(programmes.filter(p => p.id !== 'today'), 'T', new Set(), now))[0], 'next-week')
  // An 'active' programme here outranks a planned one even when its dates were not kept up to date.
  const stale = [{ id: 'plan', status: 'planning', theatre_id: 'T', start_date: '2026-11-20' }, { id: 'act', status: 'active', theatre_id: 'T', start_date: '2026-11-01', end_date: '2026-11-02' }]
  assert.equal(ids(routine.rankProgrammes(stale, 'T', new Set(), now))[0], 'act')
  // Running today: active before planning.
  const both = [{ id: 'p', status: 'planning', theatre_id: 'T', start_date: '2026-11-16' }, { id: 'a', status: 'active', theatre_id: 'T', start_date: '2026-11-16' }]
  assert.equal(ids(routine.rankProgrammes(both, 'T', new Set(), now))[0], 'a')
  assert.equal(routine.localDateKey(now), '2026-11-16')
  assert.equal(routine.programmeTiming({ start_date: '2026-11-16', end_date: null }, '2026-11-16'), 'today')
  assert.equal(routine.programmeTiming({ start_date: null }, '2026-11-16'), 'undated')
  assert.deepEqual([...routine.CLOSED_PROGRAMME_STATUSES].sort(), ['archived', 'completed'])
})

test('the migration hardens the insert policy, narrows reads and keeps old rows', () => {
  const sql = fs.readFileSync('supabase/migrations/20261116180000_victor_routine_checks.sql', 'utf8')
  assert.match(sql, /ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES public\.programs\(id\) ON DELETE SET NULL/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS notes text/)
  assert.match(sql, /CREATE POLICY den_logs_victor_insert[\s\S]*?TO authenticated[\s\S]*?performed_by = \(SELECT auth\.uid\(\)\)\s+AND \(public\.is_admin\(\) OR public\.is_unit_member\('victor'\)\)/)
  assert.match(sql, /DROP POLICY IF EXISTS "Authenticated can read den logs"/)
  assert.match(sql, /CREATE POLICY den_logs_victor_select[\s\S]*?public\.is_admin\(\)\s+OR public\.is_unit_member\('victor'\)/)
  assert.doesNotMatch(sql, /is_victor_oscar|\bBEGIN;|\bCOMMIT;/)
  assert.doesNotMatch(sql, /FOR (UPDATE|DELETE|ALL)/, 'a logged round is never edited')
  assert.match(sql, /SECURITY DEFINER\s+SET search_path = public, pg_temp/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.den_checklist_logs_stamp\(\) FROM PUBLIC, anon, authenticated/)
  assert.match(sql, /NOT VALID/, 'shape checks bind new rows only, so old rows stay as they are')
  assert.match(sql, /FOREIGN KEY \(theatre_id\)\s+REFERENCES public\.theatres\(id\) ON DELETE RESTRICT/, 'deleting a venue never erases its rounds')
  // The trigger's routine list is the component's list, key for key.
  const block = /routine-keys:start([\s\S]*?)routine-keys:end/.exec(sql)
  assert.ok(block, 'the trigger lists the routine keys')
  const sqlKeys = [...block[1].matchAll(/'([a-z_]+)'/g)].map(match => match[1])
  assert.deepEqual(sqlKeys, plain(routine.VICTOR_ROUTINE_ITEMS).map(item => item.key))
})

test('Victor pages read access from membership, not role or Oscar text', () => {
  const theatres = fs.readFileSync('app/(dashboard)/victor/TheatresClient.tsx', 'utf8')
  assert.doesNotMatch(theatres, /effectiveOscarRole|expandedDen|role=\{?['"]viewer/)
  assert.match(theatres, /useUnitAccess\('victor'\)/)
  assert.match(theatres, /<DenChecklist[\s\S]*?theatreId=\{selectedTheatre\.id\}/)
  const ops = fs.readFileSync('components/victor/VictorOperations.tsx', 'utf8')
  assert.doesNotMatch(ops, /rpc\("can_manage_unit"/)
  assert.match(ops, /useUnitAccess\("victor"\)/)
  const sop = fs.readFileSync('app/(dashboard)/sop/page.tsx', 'utf8')
  assert.doesNotMatch(sop, /effectiveOscarRole|d\.oscar === effective/)
})

// ─── jsdom renders ───────────────────────────────────────────────────────────
let JSDOM
try { ({ JSDOM } = require(process.env.FORM_DOM_RUNTIME || path.resolve('.next/form-ui-qa/node_modules/jsdom'))) } catch {}

function setupDom(url) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url, pretendToBeVisual: true })
  const previous = new Map()
  for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'Event', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'MutationObserver', 'Node', 'CustomEvent', 'IS_REACT_ACT_ENVIRONMENT']) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'window' ? dom.window : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] })
  }
  const restore = () => {
    dom.window.close()
    for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name] }
  }
  return { dom, restore }
}

function selectAPI(React) {
  const api = {
    Select: ({ children, value, onValueChange }) => {
      const items = React.Children.toArray(children)
      const trigger = items.find(item => item.type === api.SelectTrigger)
      return React.createElement('select', { id: trigger?.props.id, 'aria-label': trigger?.props['aria-label'], value, onChange: event => onValueChange(event.target.value) }, children)
    },
    SelectTrigger: () => null, SelectValue: () => null, SelectContent: ({ children }) => children,
    SelectItem: ({ children, value }) => React.createElement('option', { value }, children),
  }
  return api
}

/** A thenable Supabase query builder that records filters and inserts. */
function fakeSupabase(tables, writes) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'vv' } } }) },
    from(table) {
      const state = { table, filters: [] }
      const result = () => tables[table]?.(state) ?? { data: [], error: null }
      const query = {
        select: () => query, order: () => query, limit: () => query,
        eq: (k, v) => { state.filters.push(['eq', k, v]); return query },
        or: v => { state.filters.push(['or', v]); return query },
        single: async () => result(),
        insert: payload => { writes.push({ table, payload }); return { then: resolve => resolve(tables[`${table}:insert`]?.(payload) ?? { error: null }) } },
        then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject),
      }
      return query
    },
  }
}

const day = offset => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

async function renderChecklist(t, { canSubmit = true, insertError = null, confirmAnswer = true, logsMode = 'ok', user = { current: { id: 'vv', full_name: 'Victor Viewer', email: 'vv@example.test' } } } = {}) {
  const { dom, restore } = setupDom('https://tcnp.example/victor')
  const React = require('react'), { act } = React, { createRoot } = require('react-dom/client'), RQ = require('@tanstack/react-query')
  const queryClient = new RQ.QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const writes = [], messages = [], errors = [], confirms = [], filters = []
  const logs = [
    { id: 'l1', session: 'Pre-operation', performed_at: at(0, 7), program_id: 'prog-1', checks: [{ label: 'A', done: true }], all_passed: true, notes: null, performed_by_name: 'Head' },
    { id: 'l2', session: 'Pre-operation', performed_at: at(0, 8), program_id: 'prog-1', checks: [{ label: 'A', done: true }], all_passed: true, notes: null, performed_by_name: 'Head' },
    { id: 'l3', session: 'Round 2', performed_at: at(0, 10), program_id: 'prog-1', checks: [{ label: 'A', done: true }, { label: 'Den toilets', done: false }], all_passed: false, notes: 'Toiletries on the way', performed_by_name: 'Viewer' },
    { id: 'l4', session: 'Round 4', performed_at: at(-1, 20), program_id: 'prog-1', checks: [], all_passed: false, notes: null, performed_by_name: 'Viewer' },
    { id: 'l5', session: 'Pre-Program (Morning)', performed_at: at(-30, 9), program_id: null, checks: [true, false], all_passed: false, notes: null, performed_by_name: 'Legacy' },
  ]
  const supabase = fakeSupabase({
    programs: () => ({ data: [
      { id: 'prog-next', name: 'Next Month Crusade', status: 'planning', theatre_id: 'theatre-1', start_date: day(30), end_date: day(32) },
      { id: 'prog-0', name: 'Elsewhere Retreat', status: 'active', theatre_id: 'other-theatre', start_date: day(0), end_date: null },
      { id: 'prog-1', name: "Men's Conference", status: 'active', theatre_id: null, start_date: day(-1), end_date: day(1) },
      { id: 'prog-done', name: 'Finished Summit', status: 'completed', theatre_id: 'theatre-1', start_date: day(0), end_date: day(0) },
      { id: 'prog-x', name: 'Archived Event', status: 'archived', theatre_id: 'theatre-1', start_date: day(-60), end_date: null },
    ], error: null }),
    program_venues: () => ({ data: [{ program_id: 'prog-1', theatre_id: 'theatre-1' }], error: null }),
    den_checklist_logs: state => { filters.push(state.filters); return logsMode === 'pending' ? new Promise(() => {}) : logsMode === 'error' ? { data: null, error: { message: 'boom' } } : { data: logs, error: null } },
    'den_checklist_logs:insert': () => ({ error: insertError }),
  }, writes)
  const imports = new Proxy({}, { get(_, name) {
    if (name === '@/lib/supabase/client') return { createClient: () => supabase }
    if (name === '@/hooks/useCurrentUser') return { useCurrentUser: () => ({ data: user.current }) }
    if (name === '@/components/providers/ConfirmProvider') return { useConfirm: () => async options => { confirms.push(options); return confirmAnswer } }
    if (name === '@/lib/notify') return { notifyError: (error, message) => { errors.push({ error, message }); return message }, UserFacingError: Error }
    if (name === 'sonner') return { toast: { success: message => messages.push(message), error: message => messages.push(message) } }
    if (name === '@/components/ui/select') return selectAPI(React)
    if (name === '@tanstack/react-query') return RQ
    if (String(name).startsWith('@/')) return load(`${name.slice(2)}${name.startsWith('@/components/') ? '.tsx' : '.ts'}`)
  } })
  const cache = new Map()
  function load(file) { if (!cache.has(file)) cache.set(file, compile(file, imports, { window: dom.window, document })); return cache.get(file) }
  const DenChecklist = load('components/theatre/DenChecklist.tsx').default
  const root = createRoot(document.getElementById('root'))
  t.after(async () => { await act(async () => root.unmount()); queryClient.clear(); restore() })
  const card = theatreId => React.createElement(RQ.QueryClientProvider, { client: queryClient }, React.createElement(DenChecklist, { key: theatreId, theatreId, theatreName: theatreId === 'theatre-1' ? 'The Covenant Place' : 'Other Hall', canSubmit }))
  await act(async () => root.render(card('theatre-1')))
  const settle = async () => { for (let i = 0; i < 5; i += 1) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) }) }
  await settle()
  const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.trim().startsWith(text) || node.getAttribute('aria-label') === text)
  const submit = async () => { await act(async () => document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))); await settle() }
  // Simulates leaving the tab (Radix unmounts it) and coming back, or switching theatre.
  const show = async theatreId => { await act(async () => root.render(theatreId ? card(theatreId) : null)); await settle() }
  return { dom, act, settle, button, submit, show, writes, messages, errors, confirms, filters }
}

test('routine check card: theatre programme first, distinct rounds, labelled insert', { skip: !JSDOM }, async t => {
  const view = await renderChecklist(t)
  const text = () => document.body.textContent
  assert.match(text(), /Victor Routine Check/)
  assert.match(text(), /2 of 4 minimum rounds today/)
  assert.equal(document.getElementById('victor-routine-programme').value, 'prog-1', 'the programme held at this theatre is the default')
  const options = [...document.querySelectorAll('option')].map(option => option.textContent)
  assert.ok(!options.some(name => /Archived Event|Finished Summit/.test(name)), 'archived and completed programmes are hidden')
  assert.match(options[0], /Men's Conference · today/)
  assert.match(text(), /Logging Round 3 for Men's Conference at The Covenant Place/, 'the programme is named next to the Log button')
  assert.ok(view.filters.at(-1).some(([kind, value]) => kind === 'or' && value === 'program_id.eq.prog-1,program_id.is.null'))
  assert.equal(document.querySelector('button[aria-pressed="true"]').textContent.trim(), 'Round 3', 'the next round not yet logged is chosen')
  assert.match(text(), /Not done: Den toilets/)
  assert.match(text(), /Toiletries on the way/)
  assert.match(text(), /\(no programme\)/, 'old rows stay visible in the history')
  assert.match(text(), /Not done: Entry points and aisles are clear/, 'old boolean rows read with their old labels')
  assert.equal(document.querySelectorAll('[role="checkbox"]').length, 13)
  for (const box of document.querySelectorAll('[role="checkbox"]')) assert.ok(box.getAttribute('aria-checked') === 'false')

  await view.act(async () => view.button('Tick all').click())
  await view.submit()
  assert.equal(view.confirms.length, 0, 'a complete round needs no confirmation')
  assert.equal(view.writes.length, 1)
  const payload = view.writes[0].payload
  assert.equal(view.writes[0].table, 'den_checklist_logs')
  assert.equal(payload.theatre_id, 'theatre-1')
  assert.equal(payload.program_id, 'prog-1')
  assert.equal(payload.session, 'Round 3')
  assert.equal(payload.performed_by, 'vv')
  assert.equal(payload.all_passed, true)
  assert.equal(payload.notes, null)
  assert.equal(payload.checks.length, 13)
  assert.ok(payload.checks.every(item => item.done === true && typeof item.label === 'string'))
  assert.ok(view.messages.includes('Round 3 check logged'))
})

test('routine check card: a refused insert is reported, never shown as logged', { skip: !JSDOM }, async t => {
  const view = await renderChecklist(t, { insertError: { code: '42501', message: 'new row violates row-level security policy' } })
  await view.act(async () => document.querySelector('[role="checkbox"]').click())
  await view.submit()
  assert.equal(view.confirms.length, 1, 'an incomplete round asks first')
  assert.match(view.confirms[0].message, /12 of 13 items are not ticked/)
  assert.equal(view.writes.length, 1)
  assert.equal(view.writes[0].payload.all_passed, false)
  assert.equal(view.errors.length, 1)
  assert.equal(view.errors[0].message, 'The routine check could not be logged.')
  assert.equal(view.messages.length, 0, 'no success toast after a refused insert')
  assert.equal(document.querySelector('[role="checkbox"]').getAttribute('aria-checked'), 'true', 'the ticks are kept so the officer can retry')
})

test('routine check card: declining the incomplete-round prompt sends nothing', { skip: !JSDOM }, async t => {
  const view = await renderChecklist(t, { confirmAnswer: false })
  await view.act(async () => document.querySelector('[role="checkbox"]').click())
  await view.submit()
  assert.equal(view.writes.length, 0)
})

test('routine check card: read-only viewers see the history only', { skip: !JSDOM }, async t => {
  const readOnly = await renderChecklist(t, { canSubmit: false })
  assert.equal(document.querySelectorAll('[role="checkbox"]').length, 0)
  assert.match(document.body.textContent, /Read only\. Victor members and Command log routine checks\./)
  assert.match(document.body.textContent, /Recent rounds/)
  assert.equal(readOnly.writes.length, 0)
})

async function renderSop(t, { section, memberships, role = 'viewer' }) {
  const { dom, restore } = setupDom(`https://tcnp.example/sop?section=${section}`)
  const React = require('react'), { act } = React, { createRoot } = require('react-dom/client')
  const docs = [
    { id: 'd1', oscar: 'victor_oscar', title: 'Victor seating drill', content: 'x', doc_type: 'sop' },
    { id: 'd2', oscar: 'alpha_oscar', title: 'Alpha landing drill', content: 'x', doc_type: 'sop' },
    { id: 'd3', oscar: 'all', title: 'Everyone drill', content: 'x', doc_type: 'sop' },
    { id: 'd4', oscar: 'november_oscar', title: 'November welcome drill', content: 'x', doc_type: 'sop' },
    { id: 'd5', oscar: 'delta_oscar', title: 'Delta transit drill', content: 'x', doc_type: 'sop' },
  ]
  const supabase = fakeSupabase({
    users: () => ({ data: { role, has_admin_access: false }, error: null }),
    oscar_documents: () => ({ data: docs, error: null }),
  }, [])
  const params = new URLSearchParams(`section=${section}`)
  const imports = new Proxy({}, { get(_, name) {
    if (name === '@/lib/supabase/client') return { createClient: () => supabase }
    if (name === 'next/navigation') return { useSearchParams: () => params }
    if (name === 'next/link') return { __esModule: true, default: ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children) }
    if (name === '@/hooks/useUnitAccess') return { useMyUnitMemberships: () => ({ memberships, loadFailed: false, isLoading: false }) }
    if (name === '@/hooks/useCurrentUser') return { useCurrentUser: () => ({ data: null }) }
    if (name === '@/components/providers/ConfirmProvider') return { useConfirm: () => async () => false }
    if (name === '@/lib/notify') return { notifyError: () => '', UserFacingError: Error }
    if (name === '@/components/ui/select') return selectAPI(React)
    if (String(name).startsWith('@/')) return load(`${name.slice(2)}${name.startsWith('@/components/') ? '.tsx' : '.ts'}`)
  } })
  const cache = new Map()
  function load(file) { if (!cache.has(file)) cache.set(file, compile(file, imports, { window: dom.window, document })); return cache.get(file) }
  const Page = load('app/(dashboard)/sop/page.tsx').default
  const root = createRoot(document.getElementById('root'))
  t.after(async () => { await act(async () => root.unmount()); restore() })
  await act(async () => root.render(React.createElement(Page)))
  for (let i = 0; i < 5; i += 1) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  return document.body.textContent
}

test('SOP theatre section carries the routine check, key risks and the Captain/VO security row', { skip: !JSDOM }, async t => {
  const text = await renderSop(t, { section: 'theatre-management', memberships: [{ slug: 'victor', access_level: 'member' }] })
  assert.match(text, /Theatre Management \(Victor Oscar\)/)
  for (const heading of ['Key Risks & Controls', 'Shared Responsibilities', 'Routine Check for Victor Oscar']) assert.ok(text.includes(heading), heading)
  assert.match(text, /Captain \/ VO/)
  assert.match(text, /Papas security/)
  assert.match(text, /rechecked at least 4 times during operations/)
  assert.match(text, /☐ Check|☐ Seats are available for all Oscars/)
  assert.match(text, /☐ Protocol lounge and conveniences ready \(Event Routines\)/)
})

test('SOP unit documents follow the officer\'s unit memberships, not role or Oscar text', { skip: !JSDOM }, async t => {
  const victor = await renderSop(t, { section: 'unit-sops', memberships: [{ slug: 'victor', access_level: 'member' }] })
  assert.ok(victor.includes('Victor seating drill'))
  assert.ok(victor.includes('Everyone drill'))
  assert.ok(!victor.includes('Alpha landing drill'))
  assert.ok(!victor.includes('Delta transit drill'))
})

test('SOP unit documents: a Den member gets November documents', { skip: !JSDOM }, async t => {
  const den = await renderSop(t, { section: 'unit-sops', memberships: [{ slug: 'november_den', access_level: 'member' }] })
  assert.ok(den.includes('November welcome drill'), 'a Den member gets November documents')
  assert.ok(!den.includes('Victor seating drill'))
})

test('SOP unit documents: Delta Oscar documents follow the DO role', { skip: !JSDOM }, async t => {
  const none = await renderSop(t, { section: 'unit-sops', memberships: [], role: 'delta_oscar' })
  assert.ok(none.includes('Delta transit drill'), 'Delta Oscar documents follow the DO role')
  assert.ok(!none.includes('Victor seating drill'), 'no membership, no unit documents')
})

test('routine check card: ticks and notes survive leaving the tab and changing theatre', { skip: !JSDOM }, async t => {
  const view = await renderChecklist(t)
  const boxes = () => [...document.querySelectorAll('[role="checkbox"]')]
  await view.act(async () => { boxes()[0].click() })
  await view.act(async () => { boxes()[1].click() })
  const notes = document.getElementById('victor-routine-notes')
  const setter = Object.getOwnPropertyDescriptor(view.dom.window.HTMLTextAreaElement.prototype, 'value').set
  await view.act(async () => { setter.call(notes, 'Seats confirmed with HOP'); notes.dispatchEvent(new view.dom.window.Event('input', { bubbles: true })) })
  assert.match(document.body.textContent, /Draft kept while you check other tabs/)

  await view.show(null) // another tab is open: the card is unmounted
  await view.show('theatre-1')
  assert.deepEqual(boxes().map(box => box.getAttribute('aria-checked')).slice(0, 3), ['true', 'true', 'false'])
  assert.equal(document.getElementById('victor-routine-notes').value, 'Seats confirmed with HOP')

  await view.show('theatre-2') // another theatre has its own (empty) draft
  assert.ok(boxes().every(box => box.getAttribute('aria-checked') === 'false'))
  await view.show('theatre-1')
  assert.equal(boxes().filter(box => box.getAttribute('aria-checked') === 'true').length, 2, 'the first theatre\'s draft is still there')

  await view.act(async () => view.button('Tick all').click())
  await view.submit()
  assert.equal(view.writes.at(-1).payload.notes, 'Seats confirmed with HOP')
  assert.ok(boxes().every(box => box.getAttribute('aria-checked') === 'false'), 'a logged round clears its draft')
  await view.show(null)
  await view.show('theatre-1')
  assert.ok(boxes().every(box => box.getAttribute('aria-checked') === 'false'))
})

test('routine check card: no round count or Log button until today\'s rounds load', { skip: !JSDOM }, async t => {
  const view = await renderChecklist(t, { logsMode: 'pending' })
  assert.doesNotMatch(document.body.textContent, /minimum rounds today/)
  assert.equal(document.querySelector('button[aria-pressed="true"]'), null, 'no round is preselected')
  await view.act(async () => document.querySelector('[role="checkbox"]').click())
  const submit = document.querySelector('button[type="submit"]')
  assert.ok(submit.disabled, 'logging waits for the rounds')
  assert.match(submit.textContent, /Loading rounds/)
})

test('routine check card: a failed history says so instead of claiming 0 rounds', { skip: !JSDOM }, async t => {
  const view = await renderChecklist(t, { logsMode: 'error' })
  assert.doesNotMatch(document.body.textContent, /0 of 4 minimum rounds today/)
  assert.match(document.body.textContent, /Rounds unavailable/)
  await view.act(async () => document.querySelector('[role="checkbox"]').click())
  assert.ok(document.querySelector('button[type="submit"]').disabled)
  assert.equal(view.writes.length, 0)
})

test('venue delete: rounds block it up front and a 23503 reads as plain language', () => {
  const theatres = fs.readFileSync('app/(dashboard)/victor/TheatresClient.tsx', 'utf8')
  assert.match(theatres, /from\('den_checklist_logs'\)\s*\.select\('id', \{ count: 'exact', head: true \}\)\s*\.eq\('theatre_id', theatre\.id\)/)
  assert.match(theatres, /routine-check round\$\{count === 1 \? '' : 's'\} logged, so it can't be deleted/)
  assert.match(theatres, /err\?\.code === '23503'/)
  assert.doesNotMatch(theatres, /message: 'Delete this venue\?'/)
})

// ─── Review round 3 ─────────────────────────────────────────────────────────

test('drafts belong to one officer; a programme elsewhere is never the default', () => {
  const store = { owner: 'a', programmes: { T: 'p' }, rounds: { 'T:p': { done: { oscar_seats: true }, notes: 'x' } } }
  assert.deepEqual(plain(routine.draftsFor(store, 'a')), store)
  assert.deepEqual(plain(routine.draftsFor(store, 'b')), { owner: 'b', programmes: {}, rounds: {} }, 'another officer sees nothing')
  assert.deepEqual(plain(routine.draftsFor(store, null)), { owner: null, programmes: {}, rounds: {} }, 'nobody signed in sees nothing')
  const ranked = [
    { id: 'elsewhere', status: 'active', theatre_id: 'Y' },
    { id: 'here', status: 'planning', theatre_id: null },
  ]
  assert.equal(routine.defaultProgrammeId(ranked, 'X', new Set(['here'])), 'here')
  assert.equal(routine.defaultProgrammeId(ranked, 'X', new Set()), null, 'nothing linked to X: the officer must choose')
  assert.equal(routine.defaultProgrammeId(ranked, 'X', new Set(), 'elsewhere'), 'elsewhere', 'an explicit choice is kept')
  assert.equal(routine.defaultProgrammeId(ranked, 'X', new Set(['here']), 'gone'), 'here', 'a choice no longer offered falls back')
  assert.equal(routine.isProgrammeHere({ id: 'q', theatre_id: 'X' }, 'X'), true)
})

test('routine check card: a second officer on the same tab never sees the first officer\'s draft', { skip: !JSDOM }, async t => {
  const user = { current: { id: 'officer-a', full_name: 'Officer A', email: 'a@example.test' } }
  const view = await renderChecklist(t, { user })
  const boxes = () => [...document.querySelectorAll('[role="checkbox"]')]
  const ticked = () => boxes().filter(box => box.getAttribute('aria-checked') === 'true').length
  for (const index of [0, 1, 2]) await view.act(async () => { boxes()[index].click() })
  assert.equal(ticked(), 3)
  assert.equal(JSON.parse(view.dom.window.sessionStorage.getItem('tcnp:victor-routine-draft:v2')).owner, 'officer-a')

  // A signs out without logging; B signs in on the same tab (same module, same sessionStorage).
  await view.show(null)
  user.current = { id: 'officer-b', full_name: 'Officer B', email: 'b@example.test' }
  await view.show('theatre-1')
  assert.equal(ticked(), 0, 'B starts from an empty round')
  assert.doesNotMatch(document.body.textContent, /Draft kept/)
  await view.act(async () => { boxes()[5].click() })
  const stored = JSON.parse(view.dom.window.sessionStorage.getItem('tcnp:victor-routine-draft:v2'))
  assert.equal(stored.owner, 'officer-b')
  assert.deepEqual(Object.keys(stored.rounds['theatre-1:prog-1'].done), ['den_mics_echo'], 'A\'s ticks were replaced, not merged')

  // While the profile is still loading nobody's draft shows.
  await view.show(null)
  user.current = null
  await view.show('theatre-1')
  assert.equal(ticked(), 0)
})

test('routine check card: a theatre with no linked programme makes the officer choose', { skip: !JSDOM }, async t => {
  const view = await renderChecklist(t)
  await view.show('theatre-2')
  const picker = document.getElementById('victor-routine-programme')
  assert.match(document.body.textContent, /No open programme is linked to Other Hall/)
  await view.act(async () => document.querySelector('[role="checkbox"]').click())
  const submit = document.querySelector('button[type="submit"]')
  assert.ok(submit.disabled)
  assert.match(submit.textContent, /Choose a programme to log/)
  assert.doesNotMatch(document.body.textContent, /minimum rounds today/)

  // The test select shows its first option when nothing is chosen, so pick another one.
  await view.act(async () => { picker.value = 'prog-1'; picker.dispatchEvent(new view.dom.window.Event('change', { bubbles: true })) })
  await view.settle()
  assert.match(document.body.textContent, /Men's Conference is not held at Other Hall/)
  assert.doesNotMatch(document.body.textContent, /No open programme is linked/)
  assert.match(document.querySelector('button[type="submit"]').textContent, /Log Round 3/)
})

test('the trigger takes the performer\'s name from public.users only', () => {
  const sql = fs.readFileSync('supabase/migrations/20261116180000_victor_routine_checks.sql', 'utf8')
  const body = /FUNCTION public\.den_checklist_logs_stamp\(\)[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(sql)[1]
  assert.match(body, /NEW\.performed_by_name := coalesce\(\s*\(SELECT coalesce\(NULLIF\(btrim\(u\.full_name\), ''\), NULLIF\(btrim\(u\.email\), ''\)\)/)
  assert.match(body, /'Unknown officer'/)
  assert.doesNotMatch(body.replace(/--.*$/gm, ''), /,\s*NEW\.performed_by_name\s*\)/, 'the client value is never a fallback')
})

test('Victor tabs: ?tab= picks the tab, Routine Check falls back when not allowed, columns match', () => {
  const allStub = new Proxy({}, { get: () => stub })
  const victor = compile('app/(dashboard)/victor/TheatresClient.tsx', allStub)
  const resolve = victor.resolveVictorTab
  assert.equal(resolve(null, { allowed: true, loading: false }), 'venues')
  assert.equal(resolve('nonsense', { allowed: true, loading: false }), 'venues')
  assert.equal(resolve('seating', { allowed: false, loading: false }), 'seating')
  assert.equal(resolve('routine-check', { allowed: true, loading: false }), 'routine-check')
  assert.equal(resolve('routine-check', { allowed: false, loading: true }), 'routine-check', 'kept while membership loads')
  assert.equal(resolve('routine-check', { allowed: false, loading: false }), 'venues')
  const src = fs.readFileSync('app/(dashboard)/victor/TheatresClient.tsx', 'utf8')
  assert.match(src, /<Tabs value=\{activeTab\} onValueChange=\{selectTab\}/)
  assert.doesNotMatch(src, /defaultValue="venues"/)
  // Four tabs, or seven with Routine Check, Tasks and Programme team: rows of four on wide screens.
  assert.match(src, /grid h-auto w-full grid-cols-2 gap-1 p-1 lg:grid-cols-4/)
  assert.equal(resolve('tasks', { allowed: true, loading: false }), 'tasks')
  assert.equal(resolve('team', { allowed: false, loading: true }), 'team', 'kept while membership loads')
  assert.equal(resolve('team', { allowed: false, loading: false }), 'venues')
  assert.match(src, /url\.searchParams\.set\('tab', tab\)/)
  const sop = fs.readFileSync('app/(dashboard)/sop/page.tsx', 'utf8')
  assert.match(sop, /href: '\/victor\?tab=routine-check'/)
})
