// Papa passport privacy: the client mirror of can_view_papa_passport, the
// helpers that keep passports out of papas, the migration's policies, and the
// Papas page (jsdom) for the people who may and may not see a passport.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function compile(file, imports = {}, globals = {}) {
  const mod = { exports: {} }
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2021 },
  }).outputText
  vm.runInNewContext(source, { module: mod, exports: mod.exports, require: name => imports[name] || require(name), console, Promise, ...globals })
  return mod.exports
}

const unitAccessModule = compile('lib/unit-access.ts')
const privacy = compile('lib/papa-privacy.ts', { '@/lib/unit-access': unitAccessModule })
const plain = value => JSON.parse(JSON.stringify(value))
const migration = fs.readFileSync('supabase/migrations/20261116173000_papa_private_details.sql', 'utf8')

test('passports: Command, platform admins and Alpha head/sub-leads only (the one rule)', () => {
  const alphaHead = [{ slug: 'alpha', access_level: 'head' }]
  const alphaSub = [{ slug: 'alpha', access_level: 'sub_lead' }]
  const alphaMember = [{ slug: 'alpha', access_level: 'member' }]
  const tango = [{ slug: 'tango', access_level: 'head' }]
  const cases = [
    ['super_admin', [], undefined, true],
    ['captain', [], undefined, true],
    ['command', [], undefined, true],
    ['head_of_operations', [], undefined, true],
    ['viewer', [], true, true], // has_admin_access
    ['head_alpha_oscar', alphaHead, undefined, true],
    ['viewer', alphaSub, undefined, true],
    ['viewer', alphaMember, undefined, false],
    ['alpha_oscar', alphaMember, undefined, false],
    ['head_tango_oscar', tango, undefined, false],
    ['delta_oscar', [], undefined, false],
    // A head role (or Oscar text) without an active membership row grants nothing.
    ['head_alpha_oscar', [], undefined, false],
    ['head_alpha_oscar', [{ slug: 'alpha', access_level: 'head', status: 'inactive' }], undefined, false],
    // hod / hop are client-only ranks; SQL is_admin() does not include them.
    ['hod', [], undefined, false],
    ['hop', [], undefined, false],
  ]
  for (const [role, memberships, hasAdminAccess, expected] of cases) {
    assert.equal(privacy.papaPassportAccess(memberships, { role, hasAdminAccess }), expected, `${role} ${JSON.stringify(memberships)}`)
  }
  assert.equal(privacy.canViewPapaPassport({ isCommand: false, canCoordinate: true }), true)
  assert.equal(privacy.canViewPapaPassport({ isCommand: false, canCoordinate: false }), false)
  assert.equal(privacy.canEditPapaPassport, privacy.canViewPapaPassport)
})

test('a Papa payload is split so passport fields never reach papas', () => {
  const { papa, privateDetails } = privacy.splitPapaPrivate({
    full_name: 'Bishop A', phone: '1', passport_number: '  A123  ', passport_country: '', passport_expiry: '2027-03-12',
  })
  assert.deepEqual(plain(papa), { full_name: 'Bishop A', phone: '1' })
  assert.deepEqual(plain(privateDetails), { passport_number: 'A123', passport_country: null, passport_expiry: '2027-03-12' })
  assert.deepEqual(plain(privacy.stripPapaPrivateFields({ id: 'p', passport_number: 'X' })), { id: 'p' })
})

test('expiry dates are real calendar dates', () => {
  assert.equal(privacy.normaliseExpiry('2027-02-28'), '2027-02-28')
  assert.equal(privacy.normaliseExpiry('2027-02-30'), null)
  assert.equal(privacy.normaliseExpiry('2027-03-12T10:00:00Z'), '2027-03-12')
  assert.equal(privacy.normaliseExpiry('12/03/2027'), null)
  assert.equal(privacy.normaliseExpiry(''), null)
  assert.equal(privacy.formatPassportExpiry('2027-03-12'), '12 Mar 2027')
  assert.equal(privacy.formatPassportExpiry(null), null)
  const now = new Date(2026, 10, 16)
  assert.equal(privacy.passportExpiryStatus('2026-11-15', now), 'expired')
  assert.equal(privacy.passportExpiryStatus('2027-03-01', now), 'expiring')
  assert.equal(privacy.passportExpiryStatus('2027-06-01', now), 'valid')
  assert.equal(privacy.passportExpiryStatus(null, now), 'none')
})

test('a save writes papa_private_details only when allowed, loaded and changed', () => {
  const empty = privacy.EMPTY_PAPA_PRIVATE_DETAILS
  const next = { passport_number: 'A1', passport_country: null, passport_expiry: null }
  assert.equal(privacy.shouldWritePapaPrivate({ allowed: false, loaded: true, previous: null, next }), false)
  // The stored value never loaded: never overwrite it.
  assert.equal(privacy.shouldWritePapaPrivate({ allowed: true, loaded: false, previous: null, next }), false)
  assert.equal(privacy.shouldWritePapaPrivate({ allowed: true, loaded: true, previous: null, next: empty }), false)
  assert.equal(privacy.shouldWritePapaPrivate({ allowed: true, loaded: true, previous: null, next }), true)
  assert.equal(privacy.shouldWritePapaPrivate({ allowed: true, loaded: true, previous: { ...next, passport_number: ' A1 ' }, next }), false)
  // Clearing a stored passport is a change.
  assert.equal(privacy.shouldWritePapaPrivate({ allowed: true, loaded: true, previous: next, next: empty }), true)
})

test('the directory reads explicit columns with nothing private', () => {
  const columns = privacy.PAPA_DIRECTORY_COLUMNS.split(', ')
  assert.ok(!columns.includes('*'))
  assert.ok(!columns.some(column => /passport/.test(column)))
  for (const column of ['id', 'full_name', 'title', 'program_id', 'profile_photo_url', 'flight_arrival_time', 'personal_assistants', 'needs_clicker']) {
    assert.ok(columns.includes(column), column)
  }
})

test('private reads and writes go to papa_private_details by papa id', async () => {
  const calls = []
  const client = {
    from(table) {
      const call = { table, ops: [] }
      calls.push(call)
      const q = {
        select: cols => { call.ops.push(['select', cols]); return q },
        eq: (k, v) => { call.ops.push(['eq', k, v]); return q },
        in: (k, v) => { call.ops.push(['in', k, v]); return Promise.resolve({ data: [{ papa_id: 'p1', passport_number: 'A1', passport_country: null, passport_expiry: null }], error: null }) },
        upsert: (rows, opts) => { call.ops.push(['upsert', rows, opts]); return q },
        maybeSingle: async () => ({ data: { papa_id: 'p1', passport_number: 'A1', passport_country: 'NG', passport_expiry: '2027-01-01' }, error: null }),
      }
      return q
    },
  }
  const one = await privacy.fetchPapaPrivateDetails(client, 'p1')
  assert.deepEqual(plain(one), { passport_number: 'A1', passport_country: 'NG', passport_expiry: '2027-01-01' })
  assert.equal(calls[0].table, 'papa_private_details')
  assert.deepEqual(plain(calls[0].ops[1]), ['eq', 'papa_id', 'p1'])

  const batch = await privacy.fetchPapaPrivateDetailsBatch(client, ['p1', 'p1', 'p2'])
  assert.deepEqual(Object.keys(batch), ['p1'])
  assert.deepEqual(plain(calls[1].ops[1]), ['in', 'papa_id', ['p1', 'p2']])
  assert.deepEqual(plain(await privacy.fetchPapaPrivateDetailsBatch(client, [])), {})

  await privacy.upsertPapaPrivateDetails(client, 'p1', { passport_number: ' A1 ', passport_country: '', passport_expiry: 'bad' })
  const upsert = calls[2].ops.find(op => op[0] === 'upsert')
  assert.deepEqual(plain(upsert[1]), [{ papa_id: 'p1', passport_number: 'A1', passport_country: null, passport_expiry: null }])
  assert.deepEqual(plain(upsert[2]), { onConflict: 'papa_id' })
  assert.ok(!('updated_by' in upsert[1][0]), 'the database stamps the writer')
})

test('migration: one passport rule, admin-only delete, backfill now, drop in a later file', () => {
  const helper = migration.match(/FUNCTION public\.can_view_papa_passport[\s\S]*?\$\$;/)[0]
  assert.match(helper, /SECURITY DEFINER/)
  assert.match(helper, /SET search_path = public, pg_temp/)
  assert.match(helper, /public\.is_admin\(\) OR public\.can_coordinate_unit\('alpha'\)/)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.can_view_papa_passport\(uuid\) FROM anon/)
  assert.match(migration, /ALTER TABLE public\.papa_private_details ENABLE ROW LEVEL SECURITY/)
  assert.match(migration, /REVOKE ALL ON public\.papa_private_details FROM anon/)
  for (const cmd of ['select', 'insert', 'update']) {
    assert.match(migration, new RegExp(`CREATE POLICY papa_private_details_${cmd}[\\s\\S]*?can_view_papa_passport\\(papa_id\\)`))
  }
  assert.match(migration, /CREATE POLICY papa_private_details_delete[\s\S]*?USING \(public\.is_admin\(\)\)/)
  // The drop is split out so the front end live before this release keeps
  // saving Papas (it still sends passport_number) until the new one ships.
  assert.ok(migration.includes('INSERT INTO public.papa_private_details (papa_id, passport_number)'))
  assert.doesNotMatch(migration, /DROP COLUMN passport_number/)
  const drop = fs.readFileSync('supabase/migrations/20261116220000_drop_papas_passport_number.sql', 'utf8')
  assert.ok(drop.indexOf('INSERT INTO public.papa_private_details (papa_id, passport_number)') < drop.indexOf('DROP COLUMN passport_number'))
  assert.match(drop, /APPLY ONLY AFTER the new front end/)
  assert.doesNotMatch(drop, /^\s*(BEGIN|COMMIT)\s*;/mi)
  assert.match(migration, /REFERENCES public\.papas\(id\) ON DELETE CASCADE/)
  assert.doesNotMatch(migration, /^\s*(BEGIN|COMMIT)\s*;/mi)
})

test('migration: passport values never reach audit_logs', () => {
  assert.doesNotMatch(migration, /ON public\.papa_private_details[\s\S]{0,80}(audit_log_trigger|create_audit_log)\(\)/)
  const audit = migration.match(/FUNCTION public\.audit_papa_private_details[\s\S]*?\$\$;/)[0]
  assert.doesNotMatch(audit, /to_jsonb\((NEW|OLD)\)/)
  assert.doesNotMatch(audit, /NEW\.passport_number\s*[,)]/)
  assert.match(audit, /jsonb_build_object\('fields', to_jsonb\(v_fields\)\)/)
})

test('migration: export is admin/Command only and drops Papa contact data', () => {
  const gate = migration.match(/FUNCTION public\.export_program_data\(program_uuid uuid\)[\s\S]*?\$function\$;/)[0]
  assert.match(gate, /NOT public\.is_admin\(\)/)
  assert.doesNotMatch(gate, /is_active_member/)
  const unchecked = migration.match(/FUNCTION public\.export_program_data_unchecked[\s\S]*?\$function\$;/)[0]
  assert.match(unchecked, /to_jsonb\(pa\.\*\) - 'phone' - 'email' - 'passport_number'/)
  assert.match(unchecked, /assistant - 'phone' - 'email'/)
  assert.match(migration, /CREATE POLICY program_exports_select_own_or_admin[\s\S]*?exported_by = \(SELECT auth\.uid\(\)\) OR \(SELECT public\.is_admin\(\)\)/)
  assert.match(migration, /DROP POLICY IF EXISTS allow_select_authenticated ON public\.program_exports/)
  assert.match(migration, /REVOKE ALL ON public\.papas_basic FROM anon/)
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE[^;]*ON public\.papas_basic FROM authenticated/)
})

test('briefings: Alpha fields carry no passport; the card reads it separately', () => {
  const fields = compile('lib/constants/papaBriefingFields.ts')
  for (const [role, config] of Object.entries(fields.ROLE_BRIEFING_CONFIG)) {
    assert.ok(!config.viewFields.some(field => /passport/.test(field.key)), role)
    assert.ok(!config.editableFields.some(key => /passport/.test(key)), role)
  }
  assert.equal(fields.ROLE_BRIEFING_CONFIG.alpha_oscar.showsPassport, true)
  assert.equal(fields.ROLE_BRIEFING_CONFIG.head_alpha_oscar.showsPassport, true)
  assert.ok(!fields.ROLE_BRIEFING_CONFIG.victor_oscar.showsPassport)
  const section = fs.readFileSync('components/papas/PapaBriefingsSection.tsx', 'utf8')
  assert.match(section, /canViewPapaPassport\(alpha\)/)
  assert.match(section, /enabled: passportAllowed && papaIds\.length > 0/)
})

test('Papas page: the one rule, explicit columns, no Oscar strings', () => {
  const client = fs.readFileSync('app/(dashboard)/papas/PapasClient.tsx', 'utf8')
  const page = fs.readFileSync('app/(dashboard)/papas/page.tsx', 'utf8')
  assert.doesNotMatch(client, /effectiveOscarRole|canManagePapas|\.oscar\b|oscar\)/)
  assert.match(client, /useUnitAccess\('alpha'\)/)
  assert.match(client, /const canManage = alpha\.isCommand/)
  assert.doesNotMatch(client + page, /select\('\*'\)/)
  assert.doesNotMatch(client, /\.select\(\)/, 'writes return explicit columns, not RETURNING *')
  assert.match(page, /select\(PAPA_DIRECTORY_COLUMNS\)/)
  const sync = fs.readFileSync('lib/sync-service.ts', 'utf8')
  assert.match(sync, /upsert\(\[stripPapaPrivateFields\(submission\.data\)\]/)
})

test('programme export: admin/Command only, formula-safe CSV', () => {
  const mod = compile('components/programs/ProgramExport.tsx', {
    '@/lib/supabase/client': { createClient: () => ({}) },
    '@/hooks/useCurrentUser': { useCurrentUser: () => ({ data: null }) },
    '@/lib/unit-access': unitAccessModule,
    '@/components/ui/button': { Button: () => null },
    '@/lib/notify': { notifyError() {}, UserFacingError: Error },
    sonner: { toast: {} },
    'lucide-react': {},
  })
  assert.equal(mod.canExportProgram({ role: 'super_admin' }), true)
  assert.equal(mod.canExportProgram({ role: 'command' }), true)
  assert.equal(mod.canExportProgram({ role: 'viewer', has_admin_access: true }), true)
  for (const role of ['viewer', 'head_alpha_oscar', 'tango_oscar', 'delta_oscar', 'hod']) {
    assert.equal(mod.canExportProgram({ role }), false, role)
  }
  assert.equal(mod.canExportProgram(null), false)
  assert.equal(mod.csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"')
  assert.equal(mod.csvCell(null), '')
  assert.equal(mod.csvCell({ a: 1 }), '"{""a"":1}"')
  // Coordinates stay numbers; only real formula starts are defused.
  assert.equal(mod.csvCell(-73.77), '"-73.77"')
  assert.equal(mod.csvCell('-73.77'), '"-73.77"')
  assert.equal(mod.csvCell('-1e5'), '"-1e5"')
  assert.equal(mod.csvCell('-2+3'), '"\'-2+3"')
  assert.equal(mod.csvCell('+2348012345678'), '"\'+2348012345678"')
  assert.equal(mod.csvCell('@SUM(A1)'), '"\'@SUM(A1)"')
  assert.equal(mod.csvCell('\tcmd'), '"\'\tcmd"')
  assert.equal(mod.csvCell('\rcmd'), '"\'\rcmd"')
  assert.equal(mod.csvCell('  =1+1'), '"\'  =1+1"')
  assert.equal(mod.csvCell('Lagos'), '"Lagos"')
})

let JSDOM
try { ({ JSDOM } = require(process.env.FORM_DOM_RUNTIME || path.resolve('.next/form-ui-qa/node_modules/jsdom'))) } catch {}

async function renderPapas(t, { role, memberships, hasAdminAccess = false }) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://tcnp.example/papas', pretendToBeVisual: true })
  const previous = new Map()
  for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'Event', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'MutationObserver', 'Node', 'CustomEvent', 'IS_REACT_ACT_ENVIRONMENT']) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'window' ? dom.window : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] })
  }
  const React = require('react'), { act } = React, { createRoot } = require('react-dom/client'), { QueryClient, QueryClientProvider } = require('@tanstack/react-query')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } }) // Infinity: no gc timers keep node alive
  const papa = { id: 'papa-1', full_name: 'Grace Okafor', title: 'Bishop', program_id: null, phone: '', created_at: '2026-11-01' }
  const requests = []
  const writes = []
  const control = { failPrivate: false }
  const supabase = {
    from(table) {
      const call = { table, ops: [] }
      requests.push(call)
      const result = () => {
        if (table === 'papas') return { data: [papa], error: null }
        if (table === 'programs') return { data: [], error: null }
        return { data: [], error: null }
      }
      const q = {
        select: cols => { call.ops.push(['select', cols]); return q },
        order: () => q, range: () => q,
        eq: (k, v) => { call.ops.push(['eq', k, v]); return q },
        in: () => q,
        update: patch => { writes.push({ table, kind: 'update', patch }); return q },
        insert: rows => { writes.push({ table, kind: 'insert', rows }); return q },
        upsert: rows => { writes.push({ table, kind: 'upsert', rows }); return q },
        maybeSingle: async () => (table === 'papa_private_details' && control.failPrivate
          ? { data: null, error: { message: 'network down', code: '503' } }
          : table === 'papa_private_details'
          ? { data: { papa_id: 'papa-1', passport_number: 'A0001', passport_country: 'Nigeria', passport_expiry: '2030-01-01' }, error: null }
          : { data: null, error: null }),
        then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject),
      }
      return q
    },
  }
  const motionTags = new Map()
  const motion = new Proxy({}, { get(_, tag) { if (!motionTags.has(tag)) motionTags.set(tag, React.forwardRef(({ children, initial, animate, exit, transition, layout, ...props }, ref) => React.createElement(tag, { ...props, ref }, children))); return motionTags.get(tag) } })
  const selectAPI = {
    Select: ({ children, value, onValueChange }) => { const items = React.Children.toArray(children); const trigger = items.find(item => item.type === selectAPI.SelectTrigger); return React.createElement('select', { 'aria-label': trigger?.props['aria-label'], value, onChange: event => onValueChange(event.target.value) }, children) },
    SelectTrigger: () => null, SelectValue: () => null, SelectContent: ({ children }) => children,
    SelectItem: ({ children, value }) => React.createElement('option', { value }, children),
  }
  const unitAccess = unitAccessModule.unitAccess(memberships, 'alpha', { role, hasAdminAccess })
  const messages = []
  const cache = new Map()
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator }
  const imports = new Proxy({}, { get(_, name) {
    if (name === '@/lib/supabase/client') return { createClient: () => supabase }
    if (name === 'next/navigation') return { useSearchParams: () => new URLSearchParams() }
    if (name === '@/lib/notify') return { notifyError: (_, message) => messages.push(message), UserFacingError: Error }
    if (name === 'sonner') return { toast: { success: m => messages.push(m), error: m => messages.push(m) } }
    if (name === '@/components/providers/ConfirmProvider') return { useConfirm: () => async () => false }
    if (name === '@/components/papas/PapaPhotoStep') return { default: () => null }
    if (name === '@/components/ui/select') return selectAPI
    if (name === 'framer-motion') return { motion, AnimatePresence: ({ children }) => children }
    if (name === '@/hooks/useUnitAccess') return { useUnitAccess: () => ({ currentUser: { id: 'me', role, has_admin_access: hasAdminAccess }, ...unitAccess, loadFailed: false, isLoading: false }) }
    if (name === '@/lib/unit-access') return unitAccessModule
    if (name.startsWith('@/')) return load(`${name.slice(2)}${name.startsWith('@/components/') || name.startsWith('@/app/') ? '.tsx' : '.ts'}`)
  } })
  function load(file) { if (!cache.has(file)) cache.set(file, compile(file, imports, globals)); return cache.get(file) }
  const Page = load('app/(dashboard)/papas/PapasClient.tsx').default
  const root = createRoot(dom.window.document.getElementById('root'))
  t.after(async () => {
    await act(async () => root.unmount()); queryClient.clear(); dom.window.close()
    for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name] }
  })
  await act(async () => root.render(React.createElement(QueryClientProvider, { client: queryClient }, React.createElement(Page, { initialPapas: [papa] }))))
  const doc = dom.window.document
  const button = label => [...doc.querySelectorAll('button')].find(node => node.getAttribute('aria-label') === label || node.textContent.trim() === label)
  const settle = async () => { for (let i = 0; i < 5; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) }) }
  return { doc, act, button, settle, requests, writes, messages, window: dom.window, queryClient, control }
}

test('Papas page: an Alpha member never requests or sees a passport', { skip: !JSDOM }, async t => {
  const ui = await renderPapas(t, { role: 'viewer', memberships: [{ slug: 'alpha', access_level: 'member' }] })
  await ui.act(async () => ui.button('View Grace Okafor').click())
  await ui.settle()
  assert.ok(ui.doc.body.textContent.includes('Papa Details'))
  assert.ok(!ui.doc.body.textContent.includes('Passport'))
  assert.ok(!ui.requests.some(r => r.table === 'papa_private_details'), 'no private read for a member')
  assert.ok(!ui.button('Add Papa'), 'members do not manage Papas')
  for (const r of ui.requests.filter(r => r.table === 'papas')) {
    assert.doesNotMatch(String(r.ops.find(op => op[0] === 'select')?.[1]), /passport|\*/)
  }
})

test('Papas page: an Alpha head reads and can edit the passport, but does not manage Papas', { skip: !JSDOM }, async t => {
  const ui = await renderPapas(t, { role: 'head_alpha_oscar', memberships: [{ slug: 'alpha', access_level: 'head' }] })
  assert.ok(!ui.button('Add Papa'))
  await ui.act(async () => ui.button('View Grace Okafor').click())
  await ui.settle()
  const read = ui.requests.find(r => r.table === 'papa_private_details')
  assert.ok(read, 'passport fetched on demand')
  assert.deepEqual(read.ops.find(op => op[0] === 'eq'), ['eq', 'papa_id', 'papa-1'])
  const panel = ui.doc.querySelector('section[aria-label="Passport details for Grace Okafor"]')
  assert.ok(panel, 'passport shown although the Papa has no flight')
  assert.ok(panel.textContent.includes('A0001') && panel.textContent.includes('1 Jan 2030'))
  assert.ok(ui.button('Edit passport details for Grace Okafor'))
  assert.ok(!ui.button('Edit details'), 'the dossier itself stays Command-only')
})

test('Papas page: Command edits a Papa; passport is upserted separately and never sent to papas', { skip: !JSDOM }, async t => {
  const ui = await renderPapas(t, { role: 'command', memberships: [] })
  assert.ok(ui.button('Add Papa'))
  await ui.act(async () => ui.button('Edit Grace Okafor').click())
  await ui.settle()
  const number = ui.doc.getElementById('passport_number')
  assert.ok(number, 'passport fields shown to Command once loaded')
  assert.equal(number.value, 'A0001')
  const setValue = async (node, value) => ui.act(async () => {
    const setter = Object.getOwnPropertyDescriptor(ui.window.HTMLInputElement.prototype, 'value').set
    setter.call(node, value)
    node.dispatchEvent(new ui.window.Event('input', { bubbles: true }))
  })
  await setValue(number, 'B0002')
  const form = number.closest('form')
  await ui.act(async () => form.dispatchEvent(new ui.window.Event('submit', { bubbles: true, cancelable: true })))
  await ui.settle()
  const update = ui.writes.find(w => w.table === 'papas' && w.kind === 'update')
  assert.ok(update, ui.messages.join(' | '))
  assert.ok(!Object.keys(update.patch).some(key => /passport/.test(key)), 'papas update carries no passport field')
  const upsert = ui.writes.find(w => w.table === 'papa_private_details' && w.kind === 'upsert')
  assert.ok(upsert, 'passport written to papa_private_details')
  assert.equal(upsert.rows[0].papa_id, 'papa-1')
  assert.equal(upsert.rows[0].passport_number, 'B0002')
})

test('Papas page: a Tango member sees no passport fields and triggers no private read', { skip: !JSDOM }, async t => {
  const ui = await renderPapas(t, { role: 'tango_oscar', memberships: [{ slug: 'tango', access_level: 'head' }] })
  await ui.act(async () => ui.button('View Grace Okafor').click())
  await ui.settle()
  assert.ok(!ui.doc.body.textContent.includes('Passport'))
  assert.ok(!ui.requests.some(r => r.table === 'papa_private_details'))
})

test('passport saves mark every other private cache entry stale, not their own', () => {
  const own = privacy.papaPrivateKey('papa-1')
  const filter = privacy.papaPrivateSiblingFilter(own)
  assert.deepEqual(plain(filter.queryKey), ['papa-private'])
  assert.equal(filter.predicate({ queryKey: own }), false)
  assert.equal(filter.predicate({ queryKey: privacy.papaPrivateBatchKey(['papa-2', 'papa-1']) }), true)
  assert.equal(filter.predicate({ queryKey: privacy.papaPrivateKey('papa-2') }), true)
  const batch = privacy.papaPrivateBatchKey(['papa-1'])
  assert.equal(privacy.papaPrivateSiblingFilter(batch).predicate({ queryKey: own }), true)
})

test('Papas page: a failed passport refetch never resets the open edit form', { skip: !JSDOM }, async t => {
  const ui = await renderPapas(t, { role: 'command', memberships: [] })
  await ui.act(async () => ui.button('Edit Grace Okafor').click())
  await ui.settle()
  const number = ui.doc.getElementById('passport_number')
  assert.equal(number.value, 'A0001')
  const fullName = ui.doc.getElementById('full_name')
  const setValue = async (node, value) => ui.act(async () => {
    const setter = Object.getOwnPropertyDescriptor(ui.window.HTMLInputElement.prototype, 'value').set
    setter.call(node, value)
    node.dispatchEvent(new ui.window.Event('input', { bubbles: true }))
  })
  await setValue(number, 'C0003')
  if (fullName) await setValue(fullName, 'Grace O. Okafor')
  // A background refetch fails: React Query keeps the data but status is 'error'.
  ui.control.failPrivate = true
  await ui.act(async () => { await ui.queryClient.refetchQueries({ queryKey: ['papa-private'] }) })
  await ui.settle()
  const after = ui.doc.getElementById('passport_number')
  assert.ok(after, 'passport fields still shown')
  assert.equal(after, number, 'the form was not remounted')
  assert.equal(after.value, 'C0003', 'unsaved passport edit kept')
  if (fullName) assert.equal(ui.doc.getElementById('full_name').value, 'Grace O. Okafor')
  assert.ok(!ui.doc.body.textContent.includes("couldn't load"), 'no load-failure notice while data is cached')
})
