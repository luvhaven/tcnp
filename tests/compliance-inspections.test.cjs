// Compliance inspections and recognitions: the pure scoring / filter logic,
// its agreement with the migration, the page's access wiring, and jsdom
// tests of the Inspections tab (officer acknowledges; inspector records).
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
  vm.runInNewContext(source, { module: mod, exports: mod.exports, require: name => imports[name] || require(name), console, ...globals })
  return mod.exports
}

const logic = compile('components/compliance/inspection-logic.ts')
const MIGRATION = 'supabase/migrations/20261116200000_compliance_inspections_recognitions.sql'

const ONE_FAIL = { haircut: 'pass', manicure: 'pass', hygiene: 'pass', dress_code: 'pass', apparel_spec: 'pass', black_shoes: 'fail', jewellery: 'pass', makeup: 'na', clean_apparel: 'pass' }
const HALF = { haircut: 'fail', manicure: 'fail', hygiene: 'fail', dress_code: 'pass', apparel_spec: 'pass', black_shoes: 'pass', jewellery: 'na', makeup: 'na', clean_apparel: 'na' }

test('score is pass / (pass + fail), n/a left out, with the same outcome bands as the database', () => {
  const minor = logic.scoreInspection(ONE_FAIL)
  assert.equal(minor.score, 87.5)
  assert.equal(minor.outcome, 'minor')
  assert.equal(minor.complete, true)
  assert.equal(minor.nas, 1)

  const half = logic.scoreInspection(HALF)
  assert.equal(half.score, 50)
  assert.equal(half.outcome, 'non_compliant')

  const all = logic.scoreInspection(logic.allPassChecklist())
  assert.equal(all.score, 100)
  assert.equal(all.outcome, 'compliant')

  // Two fails of nine: 77.78, still minor; three of nine: 66.67, action needed.
  const two = logic.scoreInspection({ ...logic.allPassChecklist(), haircut: 'fail', hygiene: 'fail' })
  assert.equal(two.score, 77.78)
  assert.equal(two.outcome, 'minor')
  const three = logic.scoreInspection({ ...logic.allPassChecklist(), haircut: 'fail', hygiene: 'fail', manicure: 'fail' })
  assert.equal(three.score, 66.67)
  assert.equal(three.outcome, 'non_compliant')

  const nothing = logic.scoreInspection({ haircut: 'na' })
  assert.equal(nothing.score, null)
  assert.equal(nothing.outcome, null)
})

test('the checklist must be complete and judge at least one item before it can be saved', () => {
  assert.equal(logic.checklistProblem({}), 'Rate 9 more items')
  assert.equal(logic.checklistProblem({ ...logic.allPassChecklist(), clean_apparel: undefined }), 'Rate 1 more item')
  const allNa = Object.fromEntries(logic.INSPECTION_ITEMS.map(item => [item.key, 'na']))
  assert.equal(logic.checklistProblem(allNa), 'Mark at least one item as pass or fail')
  assert.equal(logic.checklistProblem(ONE_FAIL), null)
})

test('unknown items and bad values are dropped from rows and drafts', () => {
  const clean = logic.normalizeChecklist({ haircut: 'pass', tattoo: 'fail', hygiene: 'ok', makeup: 'na' })
  assert.deepEqual({ ...clean }, { haircut: 'pass', makeup: 'na' })
  assert.deepEqual({ ...logic.normalizeChecklist(null) }, {})
  assert.deepEqual({ ...logic.normalizeChecklist(['pass']) }, {})
  assert.deepEqual(Array.from(logic.failedItemLabels(ONE_FAIL)), ['Black shoes'])
})

test('the client item list and threshold match the migration (the database is the authority)', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8')
  const keysBlock = sql.match(/compliance_inspection_item_keys\(\)[\s\S]*?ARRAY\[([\s\S]*?)\]::text\[\]/)
  assert.ok(keysBlock, 'item key function present')
  const sqlKeys = [...keysBlock[1].replace(/--.*$/gm, '').matchAll(/'([a-z_]+)'/g)].map(m => m[1])
  assert.deepEqual(sqlKeys, [...logic.INSPECTION_ITEMS.map(item => item.key)])
  for (const item of logic.INSPECTION_ITEMS) {
    assert.ok(sql.includes(`WHEN '${item.key}' THEN '${item.label}'`), `SQL label for ${item.key} matches "${item.label}"`)
  }
  assert.match(sql, new RegExp(`WHEN NEW\\.score >= ${logic.MINOR_THRESHOLD} THEN 'minor'`))
  assert.match(sql, /round\(passes \* 100\.0 \/ \(passes \+ fails\), 2\)/)
  // Notification kinds the unit-tasks builder routes.
  assert.match(sql, /'kind', 'compliance_inspection'/)
  assert.match(sql, /'kind', 'compliance_recognition'/)
  // Migration hygiene from the design.
  assert.ok(!/^\s*(BEGIN|COMMIT)\s*;/im.test(sql), 'no BEGIN/COMMIT')
  const definers = (sql.match(/SECURITY DEFINER/g) || []).length
  const pinned = (sql.match(/SECURITY DEFINER\s+SET search_path = public, pg_temp/g) || []).length
  assert.equal(definers, pinned, 'every SECURITY DEFINER function pins search_path')
  assert.match(sql, /ALTER TABLE public\.compliance_inspections ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /ALTER TABLE public\.compliance_recognitions ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.compliance_acknowledge_inspection\(uuid, text\) FROM PUBLIC, anon/)
})

test('tabs resolve from the address bar, defaulting to outfits', () => {
  assert.equal(logic.resolveComplianceTab('inspections'), 'inspections')
  assert.equal(logic.resolveComplianceTab('recognition'), 'recognition')
  assert.equal(logic.resolveComplianceTab('grooming'), 'grooming')
  assert.equal(logic.resolveComplianceTab('admin'), 'outfits')
  assert.equal(logic.resolveComplianceTab(null), 'outfits')
})

test('inspection filters: programme, outcome, unacknowledged and officer search', () => {
  const rows = [
    { id: 'a', program_id: 'p1', outcome: 'compliant', acknowledged_at: null, score: 100, officer: { full_name: 'Ada Obi' } },
    { id: 'b', program_id: 'p1', outcome: 'minor', acknowledged_at: '2026-11-16T10:00:00Z', score: 88, officer: { full_name: 'Bayo Ade' } },
    { id: 'c', program_id: null, outcome: 'non_compliant', acknowledged_at: null, score: 50, officer: { full_name: 'Chi Eze' } },
  ]
  const ids = filters => [...logic.filterInspections(rows, { ...logic.DEFAULT_INSPECTION_FILTERS, ...filters }).map(row => row.id)]
  assert.deepEqual(ids({}), ['a', 'b', 'c'])
  assert.deepEqual(ids({ programId: 'p1' }), ['a', 'b'])
  assert.deepEqual(ids({ programId: 'none' }), ['c'])
  assert.deepEqual(ids({ outcome: 'open' }), ['b', 'c'])
  assert.deepEqual(ids({ outcome: 'unacknowledged' }), ['c'])
  assert.deepEqual(ids({ outcome: 'minor' }), ['b'])
  assert.deepEqual(ids({ search: '  bayo ' }), ['b'])
  const summary = logic.summarizeInspections(rows)
  assert.equal(summary.average, 79)
  assert.equal(summary.compliant, 1)
  assert.equal(summary.awaitingAck, 1)
  assert.equal(logic.formatScore('87.50'), '88%')
  assert.equal(logic.formatScore(null), '—')
})

test('officers on the programme are listed first, then by name', () => {
  const officers = [{ id: '1', full_name: 'Zed' }, { id: '2', full_name: 'Amy' }, { id: '3', full_name: 'Bola' }]
  assert.deepEqual([...logic.orderOfficersForProgramme(officers, new Set(['1'])).map(o => o.id)], ['1', '2', '3'])
  assert.deepEqual([...logic.orderOfficersForProgramme(officers, new Set()).map(o => o.id)], ['2', '3', '1'])
})

test('Lagos date and write messages', () => {
  assert.equal(logic.lagosToday(new Date('2026-11-16T23:30:00Z')), '2026-11-17')
  assert.equal(logic.lagosToday(new Date('2026-11-16T22:30:00Z')), '2026-11-16')
  assert.match(logic.complianceWriteMessage({ code: '23505' }, 'x'), /already has an inspection/)
  assert.equal(logic.complianceWriteMessage({ code: '23505', message: 'duplicate key value violates unique constraint "compliance_recognitions_one_per_nominee"' }, 'x'), 'This winner is already on the recognition wall.')
  assert.equal(logic.complianceWriteMessage({ code: '23514', message: 'new row for relation "compliance_recognitions" violates check constraint "compliance_recognitions_title_length"' }, 'x'), logic.RECOGNITION_TITLE_RULE)
  assert.match(logic.complianceWriteMessage({ code: '23514', message: 'violates check constraint "something_else"' }, 'x'), /not allowed/)
  assert.equal(logic.complianceWriteMessage({ code: '22023', message: 'Only an active officer can be inspected' }, 'x'), 'Only an active officer can be inspected')
  assert.equal(logic.complianceWriteMessage({ code: '42501', message: 'You cannot inspect yourself' }, 'x'), 'You cannot inspect yourself')
  assert.equal(logic.complianceWriteMessage({ code: '42501', message: 'new row violates row-level security policy' }, 'x'), 'You do not have permission to do that.')
  assert.equal(logic.complianceWriteMessage({ code: 'XX000', message: 'internal' }, 'fallback'), 'fallback')
  assert.equal(logic.awardTypeLabel('best_dressed'), 'Best dressed')
  assert.equal(logic.isNotProvisioned({ code: 'PGRST205' }), true)
  assert.equal(logic.isNotProvisioned({ code: '42501' }), false)
})

test('recognition titles: blank falls back to the award name, otherwise 2 to 120 characters (the DB check)', () => {
  assert.equal(logic.recognitionTitleProblem(''), null)
  assert.equal(logic.recognitionTitleProblem('   '), null)
  assert.equal(logic.recognitionTitleProblem(' A '), logic.RECOGNITION_TITLE_RULE)
  assert.equal(logic.recognitionTitleProblem('Ab'), null)
  assert.equal(logic.recognitionTitleProblem('x'.repeat(121)), logic.RECOGNITION_TITLE_RULE)
  const sql = fs.readFileSync(MIGRATION, 'utf8')
  assert.match(sql, /compliance_recognitions_title_length CHECK \(char_length\(btrim\(title\)\) BETWEEN 2 AND 120\)/)
})

test('migration: deleted users and programmes do not break the pinned columns or the one-per-day index', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8')
  // Pinning must step aside for the FK's ON DELETE SET NULL.
  assert.match(sql, /IF NOT \(NEW\.inspector_id IS NULL AND OLD\.inspector_id IS NOT NULL\s+AND NOT EXISTS \(SELECT 1 FROM public\.users u WHERE u\.id = OLD\.inspector_id\)\) THEN\s+NEW\.inspector_id := OLD\.inspector_id;/)
  assert.match(sql, /IF NOT \(NEW\.awarded_by IS NULL AND OLD\.awarded_by IS NOT NULL\s+AND NOT EXISTS \(SELECT 1 FROM public\.users u WHERE u\.id = OLD\.awarded_by\)\) THEN\s+NEW\.awarded_by := OLD\.awarded_by;/)
  // A programme's inspections go with it rather than colliding on the no-programme slot.
  const table = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS public.compliance_inspections'), sql.indexOf('compliance_inspections_score_range'))
  assert.match(table, /program_id uuid REFERENCES public\.programs\(id\) ON DELETE CASCADE/)
})

test('Command keeps oversight of recognitions in the UI, as in RLS', () => {
  const page = fs.readFileSync('app/(dashboard)/compliance/page.tsx', 'utf8')
  assert.match(page, /canRecognise = compliance\.isCommand \|\| compliance\.canCoordinate/)
  assert.match(page, /canRecognise=\{canRecognise\}/)
  const sql = fs.readFileSync(MIGRATION, 'utf8')
  for (const action of ['insert', 'update', 'delete']) {
    const start = sql.indexOf(`CREATE POLICY compliance_recognitions_${action}`)
    assert.ok(start > 0, action)
    assert.match(sql.slice(start, sql.indexOf(';', start)), /can_coordinate_unit\('compliance'\) OR public\.is_admin\(\)/)
  }
})

test('the page uses the one unit-access rule, and members mark their own task through the shared RPC', () => {
  const page = fs.readFileSync('app/(dashboard)/compliance/page.tsx', 'utf8')
  assert.ok(!page.includes('canManageCompliance'), 'no role/Oscar helper')
  assert.ok(!page.includes('can_manage_unit'), 'no ad-hoc RPC check')
  assert.match(page, /useUnitAccess\("compliance"\)/)
  assert.match(page, /canEdit = compliance\.isCommand \|\| compliance\.canCoordinate/)
  assert.match(page, /canDelete = compliance\.isCommand \|\| compliance\.canManage/)
  assert.match(page, /<Suspense/)

  const initiatives = fs.readFileSync('components/compliance/ComplianceInitiatives.tsx', 'utf8')
  assert.match(initiatives, /useUnitAccess\("compliance"\)/)
  assert.ok(!initiatives.includes('MANAGER_ACCESS'))
  assert.match(initiatives, /rpc\("unit_set_my_task_status", \{\s*task: task\.id,\s*new_status:/)
})

// ───────────────────────── jsdom: the Inspections tab ─────────────────────────

let JSDOM
try { ({ JSDOM } = require(process.env.FORM_DOM_RUNTIME || path.resolve('.next/form-ui-qa/node_modules/jsdom'))) } catch {}

function mountHarness(t, { currentUserId, canInspect, mine = [], all = [], officers = [], component = 'components/compliance/ComplianceInspections.tsx', props = {}, tables = {}, confirmAnswer = true }) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://tcnp.example/compliance?tab=inspections', pretendToBeVisual: true })
  const previous = new Map()
  for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Event', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'MutationObserver', 'Node', 'CustomEvent', 'IS_REACT_ACT_ENVIRONMENT']) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'window' ? dom.window : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] })
  }
  const React = require('react')
  const { act } = React
  const { createRoot } = require('react-dom/client')
  const { QueryClient, QueryClientProvider } = require('@tanstack/react-query')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } })

  const calls = { rpc: [], insert: [], update: [], delete: [], messages: [], confirms: [] }
  const supabase = {
    from: table => {
      const filters = {}
      let op = 'select'
      let payload
      const builder = {
        select: () => builder, order: () => builder, limit: () => builder, in: () => builder, neq: () => builder,
        eq: (key, value) => { filters[key] = value; return builder },
        insert: value => { op = 'insert'; payload = value; return builder },
        update: value => { op = 'update'; payload = value; return builder },
        delete: () => { op = 'delete'; return builder },
        then: (resolve, reject) => {
          let result = { data: [], error: null }
          if (op !== 'select') calls[op].push({ table, payload, filters })
          else if (tables[table]) result = { data: tables[table], error: null }
          else if (table === 'compliance_inspections') result = { data: filters.officer_id ? mine : all, error: null }
          else if (table === 'users') result = { data: officers, error: null }
          return Promise.resolve(result).then(resolve, reject)
        },
      }
      return builder
    },
    rpc: async (name, args) => { calls.rpc.push({ name, args }); return { data: '2026-11-16T10:00:00Z', error: null } },
  }

  const selectAPI = {
    Select: ({ children, value, onValueChange, disabled }) => {
      const items = React.Children.toArray(children)
      const trigger = items.find(item => item.type === selectAPI.SelectTrigger)
      return React.createElement('select', { id: trigger?.props.id, 'aria-label': trigger?.props['aria-label'], value, disabled, onChange: event => onValueChange(event.target.value) }, children)
    },
    SelectTrigger: () => null, SelectValue: () => null, SelectContent: ({ children }) => children,
    SelectItem: ({ children, value }) => React.createElement('option', { value }, children),
  }
  const dialogAPI = {
    Dialog: ({ open, children }) => (open ? React.createElement('div', { role: 'dialog' }, children) : null),
    DialogContent: ({ children }) => React.createElement('div', null, children),
    DialogHeader: ({ children }) => React.createElement('div', null, children),
    DialogTitle: ({ children }) => React.createElement('h2', null, children),
    DialogDescription: ({ children }) => React.createElement('p', null, children),
  }
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator }
  const cache = new Map()
  const imports = new Proxy({}, {
    get(_, name) {
      if (name === '@/lib/supabase/client') return { createClient: () => supabase }
      if (name === '@/lib/notify') return { notifyError: (error, fallback) => calls.messages.push(error?.message || fallback), UserFacingError: Error }
      if (name === 'sonner') return { toast: { success: m => calls.messages.push(m), error: m => calls.messages.push(m), info: m => calls.messages.push(m) } }
      if (name === '@/components/providers/ConfirmProvider') return { useConfirm: () => async options => { calls.confirms.push(options); return confirmAnswer } }
      if (name === '@/components/ui/select') return selectAPI
      if (name === '@/components/ui/dialog') return dialogAPI
      if (typeof name === 'string' && name.startsWith('@/')) {
        const base = name.slice(2)
        const file = fs.existsSync(`${base}.tsx`) ? `${base}.tsx` : `${base}.ts`
        if (!cache.has(file)) cache.set(file, compile(file, imports, globals))
        return cache.get(file)
      }
      return undefined
    },
  })
  const Component = compile(component, imports, globals).default
  const root = createRoot(dom.window.document.getElementById('root'))
  t.after(async () => {
    await act(async () => root.unmount())
    queryClient.clear()
    dom.window.close()
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else delete globalThis[name]
    }
  })

  const document = dom.window.document
  const settle = async () => { for (let i = 0; i < 6; i += 1) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) }) }
  const render = async () => {
    await act(async () => root.render(React.createElement(QueryClientProvider, { client: queryClient },
      React.createElement(Component, { canInspect, currentUserId, programs: [{ id: 'p1', name: 'Conference' }], ...props }))))
    await settle()
  }
  const byLabel = label => [...document.querySelectorAll('[aria-label]')].find(node => node.getAttribute('aria-label') === label)
  const buttonByText = text => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === text)
  const click = async node => { await act(async () => { node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) }); await settle() }
  const type = async (node, value) => {
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value').set
      setter.call(node, value)
      node.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
    await settle()
  }
  const select = async (node, value) => {
    await act(async () => {
      node.value = value
      node.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
    })
    await settle()
  }
  return { document, calls, render, byLabel, buttonByText, click, type, select }
}

const MY_ROW = {
  id: 'i1', officer_id: 'me', program_id: 'p1', inspected_on: '2026-11-15', inspector_id: 'head', checklist: ONE_FAIL,
  score: '87.50', outcome: 'minor', notes: 'Brown shoes', follow_up_due: null, acknowledged_at: null, officer_comment: null,
  created_at: '2026-11-15T09:00:00Z', officer: { full_name: 'Me Officer' }, inspector: { full_name: 'Head One' }, programs: { name: 'Conference' },
}

test('an officer sees only My compliance and acknowledges through the RPC', { skip: !JSDOM }, async t => {
  const h = mountHarness(t, { currentUserId: 'me', canInspect: false, mine: [MY_ROW], all: [], officers: [] })
  await h.render()
  const text = h.document.body.textContent
  assert.ok(text.includes('My compliance'))
  assert.ok(text.includes('88%'))
  assert.ok(text.includes('To fix: Black shoes'))
  assert.ok(text.includes('By Head One'))
  assert.ok(!text.includes('Team inspections'), 'no team list for a plain officer')
  assert.ok(!h.buttonByText('New inspection'))

  await h.click(h.byLabel('Acknowledge inspection on Sun 15 Nov 2026'))
  assert.ok(h.document.querySelector('[role="dialog"]'), 'acknowledge dialog open')
  await h.type(h.document.getElementById('inspection-ack-note'), '  New shoes bought  ')
  const submit = [...h.document.querySelectorAll('[role="dialog"] button[type="submit"]')][0]
  await h.click(submit)
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.rpc)), [{ name: 'compliance_acknowledge_inspection', args: { target_inspection: 'i1', note: 'New shoes bought' } }])
  assert.ok(h.calls.messages.includes('Acknowledged'))
})

test('an inspector records an inspection: officer, checklist, live score, insert payload', { skip: !JSDOM }, async t => {
  const other = { ...MY_ROW, id: 'i2', officer_id: 'o2', officer: { full_name: 'Bayo Ade' }, acknowledged_at: '2026-11-15T12:00:00Z', officer_comment: 'Fixed' }
  const h = mountHarness(t, {
    currentUserId: 'me',
    canInspect: true,
    mine: [],
    all: [other],
    officers: [{ id: 'me', full_name: 'Me Inspector', oscar: 'Compliance Oscar' }, { id: 'o1', full_name: 'Ada Obi', oscar: 'Victor Oscar' }],
  })
  await h.render()
  const text = h.document.body.textContent
  assert.ok(text.includes('Team inspections'))
  assert.ok(text.includes('Bayo Ade'))
  assert.ok(text.includes('“Fixed”'), 'shows the officer acknowledgement comment')

  // Filters
  await h.type(h.byLabel('Search inspections by officer'), 'zzz')
  assert.ok(h.document.body.textContent.includes('Nothing matches these filters'))
  await h.type(h.byLabel('Search inspections by officer'), '')

  await h.click(h.buttonByText('New inspection'))
  const dialog = h.document.querySelector('[role="dialog"]')
  assert.ok(dialog)
  const radios = [...dialog.querySelectorAll('[role="radiogroup"][aria-label="Officer"] [role="radio"]')]
  assert.deepEqual(radios.map(node => node.textContent.includes('Ada Obi')), [true], 'only other officers; never yourself')
  const record = () => [...dialog.querySelectorAll('button[type="submit"]')].find(node => node.textContent.includes('Record'))
  assert.equal(record().disabled, true, 'nothing chosen yet')

  await h.click(radios[0])
  await h.click(h.byLabel('Black shoes: Fail'))
  assert.ok(dialog.textContent.includes('Rate 8 more items'))
  await h.click(h.buttonByText('Pass the rest'))
  assert.equal(h.byLabel('Black shoes: Fail').getAttribute('aria-checked'), 'true', 'pass the rest keeps the fail')
  assert.ok(dialog.textContent.includes('89%'), 'live score 8/9')
  assert.ok(dialog.textContent.includes('Minor issues'))
  await h.click(h.byLabel('Moderate make-up: N/A'))
  assert.ok(dialog.textContent.includes('88%'), 'n/a leaves the item out: 7/8')
  assert.ok(dialog.textContent.includes('Re-check by'), 'follow-up appears when something failed')
  assert.equal(record().disabled, false)

  await h.type(h.document.getElementById('inspection-notes'), ' Replace shoes ')
  await h.click(record())
  assert.equal(h.calls.insert.length, 1)
  const { table, payload } = h.calls.insert[0]
  assert.equal(table, 'compliance_inspections')
  assert.equal(payload.officer_id, 'o1')
  assert.equal(payload.program_id, null)
  assert.equal(payload.notes, 'Replace shoes')
  assert.equal(payload.checklist.black_shoes, 'fail')
  assert.equal(payload.checklist.makeup, 'na')
  assert.equal(Object.keys(payload.checklist).length, 9)
  assert.ok(!('score' in payload) && !('outcome' in payload), 'the database computes score and outcome')
  assert.ok(h.calls.messages.includes('Inspection recorded'))
})

test('My compliance waits for the profile instead of claiming there are no inspections', { skip: !JSDOM }, async t => {
  const h = mountHarness(t, { currentUserId: undefined, canInspect: false, props: { userStatus: 'loading' } })
  await h.render()
  assert.ok(h.byLabel('Loading your inspections'), 'skeleton while the profile loads')
  assert.ok(!h.document.body.textContent.includes('No inspections yet'))
})

test('My compliance shows an error with retry when the profile cannot load', { skip: !JSDOM }, async t => {
  let retried = 0
  const h = mountHarness(t, { currentUserId: undefined, canInspect: false, props: { userStatus: 'error', onRetryUser: () => { retried += 1 } } })
  await h.render()
  const text = h.document.body.textContent
  assert.ok(text.includes('Could not load your profile'))
  assert.ok(!text.includes('No inspections yet'))
  const retry = [...h.document.querySelectorAll('button')].find(node => /retry|try again/i.test(node.textContent))
  assert.ok(retry, 'retry button')
  await h.click(retry)
  assert.equal(retried, 1)
})

const AWARD_TABLES = {
  compliance_award_categories: [{ id: 'c1', project_id: 'proj', name: 'Best dressed 2026', description: null, status: 'judging', created_at: '2026-11-01T00:00:00Z' }],
  compliance_award_nominees: [
    { id: 'n1', category_id: 'c1', nominee_user_id: 'u1', nominee_name: null, reason: 'Sharp', status: 'winner', is_winner: true, nominee: { full_name: 'Ada Obi' } },
    { id: 'n2', category_id: 'c1', nominee_user_id: 'u2', nominee_name: null, reason: null, status: 'winner', is_winner: true, nominee: { full_name: 'Bayo Ade' } },
  ],
  compliance_recognitions: [{ nominee_id: 'n1' }],
  unit_projects: [{ id: 'proj', title: 'Awards 2026', status: 'active' }],
}
const AWARDS = 'components/compliance/ComplianceAwards.tsx'

test('awards: a winner already on the wall shows a badge, not the add button', { skip: !JSDOM }, async t => {
  const h = mountHarness(t, { component: AWARDS, props: { canManage: true, isUnitMember: true }, tables: AWARD_TABLES })
  await h.render()
  assert.ok(!h.byLabel('Add Ada Obi to the recognition wall'), 'Ada is already on the wall')
  assert.ok(h.document.body.textContent.includes('On the wall'))
  const add = h.byLabel('Add Bayo Ade to the recognition wall')
  assert.ok(add, 'Bayo can still be added')
  await h.click(add)
  assert.equal(h.calls.insert.length, 1)
  assert.equal(h.calls.insert[0].payload.nominee_id, 'n2')
  assert.ok(h.calls.messages.includes('Added to the recognition wall'))
})

test('awards: declining the announce confirmation sends nothing', { skip: !JSDOM }, async t => {
  const h = mountHarness(t, { component: AWARDS, props: { canManage: true, isUnitMember: true }, tables: AWARD_TABLES, confirmAnswer: false })
  await h.render()
  await h.select(h.byLabel('Status of Best dressed 2026'), 'announced')
  assert.equal(h.calls.confirms.length, 1)
  assert.match(h.calls.confirms[0].message, /Every officer will see the winners/)
  assert.equal(h.calls.update.length, 0)
})

test('awards: a confirmed announcement updates once and confirms with a toast', { skip: !JSDOM }, async t => {
  const h = mountHarness(t, { component: AWARDS, props: { canManage: true, isUnitMember: true }, tables: AWARD_TABLES })
  await h.render()
  await h.select(h.byLabel('Status of Best dressed 2026'), 'announced')
  assert.equal(h.calls.update.length, 1)
  assert.equal(h.calls.update[0].payload.status, 'announced')
  assert.ok(h.calls.messages.includes('Best dressed 2026: Announced'))
  // A move that needs no confirmation goes straight through.
  await h.select(h.byLabel('Status of Ada Obi'), 'shortlisted')
  assert.equal(h.calls.confirms.length, 1)
  assert.equal(h.calls.update.length, 2)
  assert.ok(h.calls.messages.includes('Ada Obi: Shortlisted'))
})
