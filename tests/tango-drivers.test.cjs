// Tango drivers: pure helpers (client mirrors of the SQL guard), the migration's
// shape, and the Drivers panel rendered in jsdom for coordinator / Command / member.
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
  vm.runInNewContext(source, { module: mod, exports: mod.exports, require: name => (name in imports ? imports[name] : require(name)), console, Intl, Date, URL, ...globals })
  return mod.exports
}
// Values built inside the vm context carry that context's prototypes.
const plain = value => JSON.parse(JSON.stringify(value))

class UserFacingError extends Error { constructor(message) { super(message); this.userFacing = true } }
const stubModules = new Proxy({}, {
  has: () => true,
  get(_, name) {
    if (name === '@/lib/notify') return { notifyError: () => {}, UserFacingError }
    if (name === 'react' || name === 'react/jsx-runtime') return require(name)
    if (name === '@tanstack/react-query') return { useQuery: () => ({}), useMutation: () => ({}), useQueryClient: () => ({}) }
    if (name === 'next/navigation') return { useSearchParams: () => new URLSearchParams() }
    return new Proxy({}, { get: () => () => null })
  },
})
const panel = compile('components/tango/DriversPanel.tsx', stubModules)
const operations = compile('components/tango/TangoOperations.tsx', new Proxy({}, {
  has: () => true,
  get: (_, name) => (name === '@/components/tango/DriversPanel' ? panel : stubModules[name]),
}))
const migration = fs.readFileSync('supabase/migrations/20261116193000_tango_drivers.sql', 'utf8')

const today = '2026-11-16'

test('licence state matches SQL tango_licence_state at every boundary', () => {
  assert.equal(panel.licenceState(null, today), 'missing')
  assert.equal(panel.licenceState('', today), 'missing')
  assert.equal(panel.licenceState('2026-11-15', today), 'expired')
  assert.equal(panel.licenceState('2026-11-16', today), 'expiring', 'a licence is still valid on its expiry day')
  assert.equal(panel.licenceState('2026-12-16', today), 'expiring', '30 days out still counts as expiring')
  assert.equal(panel.licenceState('2026-12-17', today), 'valid')
  assert.equal(panel.licenceState('2027-06-01T00:00:00Z', today), 'valid', 'timestamps are read by their date')
})

test('dates are Lagos calendar days and add across month ends', () => {
  assert.equal(panel.lagosDate('2026-11-20T23:30:00Z'), '2026-11-21', '23:30 UTC is already the next day in Lagos')
  assert.equal(panel.lagosDate('not a date'), null)
  assert.equal(panel.addDays('2026-11-16', 30), '2026-12-16')
  assert.equal(panel.addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(panel.formatDay('2026-10-17'), '17 Oct 2026')
})

test('driver guard mirrors the database messages and order of checks', () => {
  const driver = overrides => ({ full_name: 'Driver One', status: 'available', licence_expires_on: '2028-01-01', ...overrides })
  assert.equal(panel.driverBlocker(driver(), '2026-11-24', today), null)
  assert.equal(panel.driverBlocker(null, null, today), 'That driver no longer exists.')
  // These strings are what the trial saw the SQL guard raise.
  assert.equal(panel.driverBlocker(driver({ full_name: 'Driver Suspended', status: 'suspended' }), null, today), 'Driver Suspended is suspended and cannot be assigned.')
  assert.equal(panel.driverBlocker(driver({ full_name: 'Driver Inactive', status: 'inactive' }), null, today), 'Driver Inactive is inactive and cannot be assigned.')
  assert.equal(panel.driverBlocker(driver({ full_name: 'Driver Unlicensed', licence_expires_on: null }), null, today), 'Driver Unlicensed has no driving licence on record.')
  assert.equal(panel.driverBlocker(driver({ full_name: 'Driver Expired', licence_expires_on: '2026-10-17' }), null, today), "Driver Expired's driving licence expired on 17 Oct 2026.")
  assert.equal(panel.driverBlocker(driver({ full_name: 'Driver Soon', licence_expires_on: '2026-11-20' }), '2026-11-24', today), "Driver Soon's driving licence expires on 20 Nov 2026, before this assignment ends.")
  assert.equal(panel.driverBlocker(driver({ licence_expires_on: '2026-11-20' }), '2026-11-17', today), null, 'a short window inside the licence is fine')
  assert.equal(panel.driverBlocker(driver({ licence_expires_on: '2026-11-20' }), '2026-01-01', today), null, 'a past date never asks for less than today')
  // Suspension wins over a missing licence, as in SQL.
  assert.match(panel.driverBlocker(driver({ status: 'suspended', licence_expires_on: null }), null, today), /suspended/)
})

test('picker labels name the reason a driver is greyed out', () => {
  const base = { full_name: 'Ada', status: 'available', licence_expires_on: '2028-01-01' }
  assert.equal(panel.driverShortBlocker(base, null, today), null)
  assert.equal(panel.driverOptionLabel(base, null), 'Ada')
  assert.equal(panel.driverShortBlocker({ ...base, status: 'off_duty' }, null, today), null, 'off duty is a warning, not a block')
  assert.equal(panel.driverShortBlocker({ ...base, status: 'suspended' }, null, today), 'suspended')
  assert.equal(panel.driverShortBlocker({ ...base, licence_expires_on: null }, null, today), 'no licence')
  assert.equal(panel.driverShortBlocker({ ...base, licence_expires_on: '2026-01-01' }, null, today), 'licence expired')
  assert.equal(panel.driverOptionLabel(base, panel.driverShortBlocker({ ...base, licence_expires_on: '2026-11-20' }, '2026-11-24', today)), 'Ada (licence ends 20 Nov 2026)')
})

test('needed-until dates follow the SQL guard (window end, then programme end, then start)', () => {
  assert.equal(panel.programmeNeededUntil({ start_date: '2026-11-09', end_date: '2026-11-24' }), '2026-11-24')
  assert.equal(panel.programmeNeededUntil({ start_date: '2026-11-09', end_date: null }), '2026-11-09')
  assert.equal(panel.programmeNeededUntil({ start_date: '2026-11-09', end_date: '2026-11-24' }, '2026-11-12T22:59:59Z'), '2026-11-12')
  assert.equal(panel.programmeNeededUntil(null), null)
  assert.equal(panel.journeyNeededDate({ scheduled_arrival: null, eta: '2026-11-18T10:00:00Z', scheduled_departure: '2026-11-17T10:00:00Z' }), '2026-11-18')
  assert.equal(panel.journeyNeededDate({}), null)
  assert.equal(panel.journeyNeededDate(null), null)
})

test('the driver form validates, trims and keeps licence fields to coordinators', () => {
  const form = { ...plain(panel.emptyDriverForm), full_name: '  Ada Obi ', phone: ' 0801 ', notes: '  ' }
  assert.deepEqual(plain(panel.validateDriverForm({ ...form, full_name: ' ' }, { withLicence: false })), { error: "Enter the driver's full name." })
  assert.deepEqual(plain(panel.validateDriverForm({ ...form, phone: '' }, { withLicence: false })), { error: "Enter the driver's phone number." })
  assert.deepEqual(plain(panel.validateDriverForm({ ...form, engagement_type: 'partner' }, { withLicence: false })), { error: 'Choose the fleet partner this driver comes from.' })
  const command = plain(panel.validateDriverForm({ ...form, licence_number: 'SHOULD-NOT-SEND', expires_on: '2027-01-01' }, { withLicence: false }))
  assert.equal(command.licence, null, 'Command never writes licence fields')
  assert.deepEqual(command.driver, { full_name: 'Ada Obi', phone: '0801', alt_phone: null, engagement_type: 'internal', partner_id: null, status: 'available', notes: null })
  assert.equal(plain(panel.validateDriverForm({ ...form, partner_id: 'p1' }, { withLicence: false })).driver.partner_id, null, 'internal drivers carry no partner')
  assert.equal(plain(panel.validateDriverForm(form, { withLicence: true })).licence, 'clear', 'empty licence fields remove the licence')
  assert.deepEqual(plain(panel.validateDriverForm({ ...form, expires_on: '2027-01-01' }, { withLicence: true })), { error: 'Enter the licence number, or clear the licence fields.' })
  assert.deepEqual(plain(panel.validateDriverForm({ ...form, licence_number: 'ABC' }, { withLicence: true })), { error: 'Enter the licence expiry date.' })
  assert.deepEqual(plain(panel.validateDriverForm({ ...form, licence_number: 'ABC', issued_on: '2027-02-01', expires_on: '2027-01-01' }, { withLicence: true })), { error: 'The licence cannot expire before it was issued.' })
  assert.deepEqual(plain(panel.validateDriverForm({ ...form, licence_number: ' ABC 123 ', licence_class: ' E ', expires_on: '2027-01-01' }, { withLicence: true })).licence,
    { licence_number: 'ABC 123', licence_class: 'E', issued_on: null, expires_on: '2027-01-01' })
})

test('only the database driver guard is shown verbatim', () => {
  assert.equal(panel.guardErrorMessage({ code: '23514', hint: 'tango_driver_guard', message: 'Ada is suspended and cannot be assigned.' }), 'Ada is suspended and cannot be assigned.')
  assert.equal(panel.guardErrorMessage({ code: '23514', message: 'new row violates check constraint "x"' }), null, 'ordinary constraint text stays hidden')
  assert.equal(panel.guardErrorMessage(null), null)
  assert.throws(() => panel.rethrowDriverError({ hint: 'tango_driver_guard', message: 'Blocked.' }), error => error.userFacing === true && error.message === 'Blocked.')
  const raw = { code: '42501', message: 'row-level security' }
  assert.throws(() => panel.rethrowDriverError(raw), error => error === raw)
})

test('duplicates and licence verification read as the database decides', () => {
  assert.equal(panel.duplicateErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint "idx_tango_driver_licences_number"' }), 'Another driver already has this licence number.')
  assert.equal(panel.duplicateErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint "idx_tango_driver_assignments_one_primary_per_cheetah"' }), 'This Cheetah already has a primary driver for this programme.')
  assert.match(panel.duplicateErrorMessage({ code: '23505', message: 'x', details: 'idx_tango_driver_assignments_one_per_programme' }), /already on this programme's roster/)
  assert.equal(panel.duplicateErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint "other"' }), null)
  assert.equal(panel.duplicateErrorMessage({ code: '23514', message: 'idx_tango_driver_licences_number' }), null)
  assert.throws(() => panel.rethrowDriverError({ code: '23505', message: 'unique constraint "idx_tango_driver_licences_number"' }), error => error.userFacing === true && /licence number/.test(error.message))

  assert.equal(panel.normaliseLicenceNumber(' lag 12 34 '), 'LAG1234')
  const stored = { licence_number: 'LAG-1', expires_on: '2028-01-01', verified_at: '2026-11-01T00:00:00Z' }
  assert.equal(panel.licenceIdentityChanged(stored, { licence_number: 'lag-1 ', expires_on: '2028-01-01' }), false, 'case and spaces do not count')
  assert.equal(panel.licenceIdentityChanged(stored, { licence_number: 'LAG-2', expires_on: '2028-01-01' }), true)
  assert.equal(panel.licenceIdentityChanged(stored, { licence_number: 'LAG-1', expires_on: '2029-01-01' }), true)
  assert.equal(panel.licenceIdentityChanged(null, { licence_number: 'LAG-1', expires_on: '2028-01-01' }), true)
  const now = '2026-11-17T09:00:00.000Z'
  assert.equal(panel.licenceVerifiedAt(stored, { licence_number: 'LAG-1', expires_on: '2028-01-01' }, true, now), stored.verified_at, 'same card keeps its verification')
  assert.equal(panel.licenceVerifiedAt(stored, { licence_number: 'LAG-2', expires_on: '2028-01-01' }, true, now), now, 'a renewed card is verified afresh')
  assert.equal(panel.licenceVerifiedAt(stored, { licence_number: 'LAG-1', expires_on: '2028-01-01' }, false, now), null)
  assert.equal(panel.licenceVerifiedAt(null, { licence_number: 'LAG-1', expires_on: '2028-01-01' }, true, now), now)
})

test('roster rows cannot be put back where a unique index would refuse them', () => {
  const rows = [
    { id: 'r1', driver_id: 'd1', cheetah_id: 'c1', role: 'primary', status: 'released' },
    { id: 'r2', driver_id: 'd1', cheetah_id: null, role: 'backup', status: 'assigned' },
    { id: 'r3', driver_id: 'd2', cheetah_id: 'c2', role: 'primary', status: 'released' },
    { id: 'r4', driver_id: 'd3', cheetah_id: 'c2', role: 'primary', status: 'confirmed' },
    { id: 'r5', driver_id: 'd4', cheetah_id: 'c3', role: 'primary', status: 'cancelled' },
  ]
  assert.equal(panel.rosterReactivationBlocker(rows[0], rows), 'already rostered again')
  assert.equal(panel.rosterReactivationBlocker(rows[2], rows), 'Cheetah has a primary')
  assert.equal(panel.rosterReactivationBlocker(rows[3], rows), null, 'an active row can always change status')
  assert.equal(panel.rosterReactivationBlocker(rows[4], rows), null)
})

test('allocation driver pickers: auto-filled defaults follow the vehicle, legacy drivers can be cleared', () => {
  const form = { journey_id: 'j', cheetah_id: '', assignment_role: 'support', driver_id: '', driver_auto: false }
  const a = operations.allocationFormForCheetah(form, 'cA', 'ade')
  assert.deepEqual(plain({ cheetah_id: a.cheetah_id, driver_id: a.driver_id, driver_auto: a.driver_auto }), { cheetah_id: 'cA', driver_id: 'ade', driver_auto: true })
  const b = operations.allocationFormForCheetah(a, 'cB', 'bola')
  assert.equal(b.driver_id, 'bola', "switching vehicles replaces the previous vehicle's default")
  const c = operations.allocationFormForCheetah(b, 'cC', null)
  assert.deepEqual(plain({ driver_id: c.driver_id, driver_auto: c.driver_auto }), { driver_id: '', driver_auto: false }, 'no usable default: back to auto')
  const chosen = operations.allocationFormForCheetah({ ...form, driver_id: 'tunde', driver_auto: false }, 'cB', 'bola')
  assert.equal(chosen.driver_id, 'tunde', 'a driver the officer chose stays')

  assert.deepEqual(plain(operations.allocationDriverFields(operations.NO_DRIVER)), { driver_name: '' })
  assert.deepEqual(plain(operations.allocationDriverFields('')), {})

  const legacy = { driver_id: null, driver_name: 'Old Name' }
  assert.equal(operations.allocationDriverValue(legacy), operations.LEGACY_DRIVER)
  assert.equal(operations.allocationDriverChange(legacy, operations.LEGACY_DRIVER), null)
  assert.deepEqual(plain(operations.allocationDriverChange(legacy, operations.NO_DRIVER)), { driverId: null }, 'No driver clears free text')
  const none = { driver_id: null, driver_name: null }
  assert.equal(operations.allocationDriverValue(none), operations.NO_DRIVER)
  assert.equal(operations.allocationDriverChange(none, operations.NO_DRIVER), null)
  const linked = { driver_id: 'd1', driver_name: 'Driver One' }
  assert.equal(operations.allocationDriverValue(linked), 'd1')
  assert.equal(operations.allocationDriverChange(linked, 'd1'), null)
  assert.deepEqual(plain(operations.allocationDriverChange(linked, 'd2')), { driverId: 'd2' })
  assert.deepEqual(plain(operations.allocationDriverChange(linked, operations.NO_DRIVER)), { driverId: null })
})

test('Tango tabs and allocation rights follow the ONE RULE', () => {
  assert.equal(operations.resolveTangoTab('drivers'), 'drivers', 'notification route /tango?tab=drivers')
  assert.equal(operations.resolveTangoTab('nope'), 'board')
  assert.equal(operations.resolveTangoTab(null), 'board')
  const none = new Set()
  const work = new Set(['p1'])
  const member = { isCommand: false, canCoordinate: false }
  assert.equal(operations.canAllocateForJourney({ isCommand: true, canCoordinate: false }, none, { program_id: 'p1' }), true, 'Command keeps allocation')
  assert.equal(operations.canAllocateForJourney({ isCommand: false, canCoordinate: true }, none, { program_id: null }), true, 'head / sub-lead')
  assert.equal(operations.canAllocateForJourney(member, work, { program_id: 'p1' }), true, 'member doing programme work')
  assert.equal(operations.canAllocateForJourney(member, work, { program_id: 'p2' }), false, 'not on that programme')
  assert.equal(operations.canAllocateForJourney(member, work, { program_id: null }), false)
  assert.equal(operations.canAllocateForJourney(member, none, null), false)
})

test('the migration keeps licences to coordinators and follows the migration rules', () => {
  assert.doesNotMatch(migration, /^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im)
  for (const table of ['tango_drivers', 'tango_driver_licences', 'tango_driver_assignments', 'tango_licence_reminders']) {
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`), table)
  }
  const licencePolicies = migration.match(/CREATE POLICY \w+ ON public\.tango_driver_licences[\s\S]*?;/g)
  assert.equal(licencePolicies.length, 1)
  assert.doesNotMatch(licencePolicies[0], /is_admin\(\)/, 'Command must not read licence numbers')
  assert.match(licencePolicies[0], /can_coordinate_unit\('tango'\)/)
  const roster = migration.match(/CREATE OR REPLACE FUNCTION public\.tango_driver_roster\(\)[\s\S]*?\$\$;/)[0]
  assert.doesNotMatch(roster, /licence_number/, 'the roster never returns the number')
  // Every SECURITY DEFINER function pins search_path and is revoked from PUBLIC.
  const definers = migration.match(/CREATE OR REPLACE FUNCTION public\.(\w+)\([^)]*\)[\s\S]*?\$\$;/g).filter(fn => /SECURITY DEFINER/.test(fn))
  assert.ok(definers.length >= 7)
  for (const fn of definers) {
    const name = fn.match(/FUNCTION public\.(\w+)/)[1]
    assert.match(fn, /SET search_path = public, pg_temp/, name)
    assert.match(migration, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM PUBLIC`), name)
  }
  assert.match(migration, /'kind', 'tango_licence_expiring'/)
  assert.match(migration, /HINT = 'tango_driver_guard'/)
  // Review fixes: blanks become NULL, re-activation is guarded, licence
  // verification is stamped server-side, reminders wait for a recipient.
  assert.match(migration, /NEW\.driver_name := nullif\(btrim\(NEW\.driver_name\), ''\)/)
  assert.match(migration, /BEFORE INSERT OR UPDATE OF driver_id, status, driver_name, driver_phone ON public\.journey_cheetahs/)
  assert.match(migration, /CREATE TRIGGER tango_driver_licences_stamp\s+BEFORE INSERT OR UPDATE ON public\.tango_driver_licences/)
  assert.match(migration, /WHERE EXISTS \(SELECT 1 FROM coordinators\)/)
  assert.ok(migration.indexOf('coordinators AS (') < migration.indexOf('claimed AS ('), 'coordinators are known before anything is claimed')
})

// ─── Drivers panel in jsdom ──────────────────────────────────────────────────

let JSDOM
try { ({ JSDOM } = require(process.env.FORM_DOM_RUNTIME || path.resolve('.next/form-ui-qa/node_modules/jsdom'))) } catch {}

test('Drivers panel: badges, licence privacy and saving a driver', { skip: !JSDOM }, async t => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://tcnp.example/tango?tab=drivers', pretendToBeVisual: true })
  const previous = new Map()
  for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'Event', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'MutationObserver', 'Node', 'CustomEvent', 'IS_REACT_ACT_ENVIRONMENT']) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'window' ? dom.window : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] })
  }
  const React = require('react'), { act } = React, { createRoot } = require('react-dom/client')
  const h = React.createElement

  const realToday = panel.lagosDate(new Date())
  const roster = [
    { id: 'd1', full_name: 'Driver One', phone: '0801', alt_phone: null, partner_id: null, engagement_type: 'internal', status: 'available', notes: null, licence_class: 'E', licence_expires_on: panel.addDays(realToday, 800), licence_state: 'valid', licence_verified: true },
    { id: 'd2', full_name: 'Driver Expired', phone: '0802', alt_phone: null, partner_id: null, engagement_type: 'internal', status: 'available', notes: null, licence_class: null, licence_expires_on: panel.addDays(realToday, -3), licence_state: 'expired', licence_verified: false },
    { id: 'd3', full_name: 'Driver Suspended', phone: '0803', alt_phone: null, partner_id: null, engagement_type: 'internal', status: 'suspended', notes: null, licence_class: null, licence_expires_on: panel.addDays(realToday, 800), licence_state: 'valid', licence_verified: false },
  ]
  const licences = [{ driver_id: 'd1', licence_number: 'LAG-12345', licence_class: 'E', expires_on: roster[0].licence_expires_on, verified_at: '2026-11-01T00:00:00Z', verified_by: 'head' }]
  const assignments = [{ id: 'a1', program_id: 'p1', driver_id: 'd1', cheetah_id: 'c1', role: 'primary', status: 'confirmed', starts_at: null, ends_at: null }]
  const programs = [{ id: 'p1', name: 'Conference', start_date: realToday, end_date: panel.addDays(realToday, 8) }]
  const cheetahs = [{ id: 'c1', call_sign: 'CHEETAH-001', status: 'available', default_driver_id: 'd1' }]

  const calls = []
  let licenceError = null
  const supabase = {
    from(table) {
      let op = 'select'
      const q = {
        insert(payload) { op = 'insert'; calls.push({ table, op: 'insert', payload }); return q },
        update(payload) { op = 'update'; calls.push({ table, op: 'update', payload }); return q },
        upsert(payload, options) { op = 'upsert'; calls.push({ table, op: 'upsert', payload, options }); return q },
        delete() { op = 'delete'; calls.push({ table, op: 'delete' }); return q },
        select() { return q }, eq() { return q }, order() { return q }, limit() { return q },
        single: async () => ({ data: { id: 'new-driver' }, error: null }),
        then(resolve) { resolve({ data: [], error: table === 'tango_driver_licences' && op === 'upsert' ? licenceError : null }) },
      }
      return q
    },
    rpc: async () => ({ data: roster, error: null }),
  }
  const passthrough = tag => ({ children, className, id, role, 'aria-label': label }) => h(tag, { className, id, role, 'aria-label': label }, children)
  const selectAPI = {
    Select: ({ children, value, onValueChange, disabled }) => {
      const items = React.Children.toArray(children)
      const trigger = items.find(item => item.type === selectAPI.SelectTrigger)
      return h('select', { id: trigger?.props.id, 'aria-label': trigger?.props['aria-label'], value, disabled, onChange: event => onValueChange(event.target.value) }, children)
    },
    SelectTrigger: () => null, SelectValue: () => null, SelectContent: ({ children }) => children,
    SelectItem: ({ children, value, disabled }) => h('option', { value, disabled }, children),
  }
  const imports = {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@/lib/supabase/client': { createClient: () => supabase },
    '@/lib/notify': { notifyError: (error, message) => calls.push({ op: 'error', message, error }), UserFacingError },
    sonner: { toast: { success: message => calls.push({ op: 'toast', message }) } },
    '@/components/providers/ConfirmProvider': { useConfirm: () => async () => true },
    '@/components/ui/select': selectAPI,
    '@/components/ui/badge': { Badge: passthrough('span') },
    '@/components/ui/button': { Button: ({ children, onClick, type = 'button', disabled, 'aria-label': label, className }) => h('button', { onClick, type, disabled, 'aria-label': label, className }, children) },
    '@/components/ui/card': { Card: passthrough('section'), CardHeader: passthrough('div'), CardContent: passthrough('div'), CardTitle: passthrough('h3'), CardDescription: passthrough('p') },
    '@/components/ui/dialog': { Dialog: ({ open, children }) => (open ? h('div', { role: 'dialog' }, children) : null), DialogContent: passthrough('div'), DialogHeader: passthrough('div'), DialogTitle: passthrough('h2'), DialogDescription: passthrough('p') },
    '@/components/ui/error-state': { ErrorState: ({ title, onRetry }) => h('div', { role: 'alert' }, title, onRetry ? h('button', { type: 'button', onClick: onRetry }, 'Retry') : null) },
    '@/components/ui/input': { Input: props => h('input', props) },
    '@/components/ui/label': { Label: ({ children, htmlFor }) => h('label', { htmlFor }, children) },
    '@/components/ui/textarea': { Textarea: props => h('textarea', props) },
    '@/components/ui/skeleton': { Skeleton: () => h('div', { 'data-skeleton': true }) },
    'lucide-react': new Proxy({}, { get: () => () => null }),
    '@tanstack/react-query': {
      useQueryClient: () => ({ invalidateQueries: () => {} }),
      useQuery: options => {
        if (options.enabled === false) return { data: undefined, isLoading: false, isError: false }
        const key = options.queryKey[0]
        const data = key === 'tango-driver-roster' ? roster : key === 'tango-driver-licences' ? licences : key === 'tango-driver-assignments' ? assignments : []
        return { data, isLoading: false, isError: false, isFetching: false, refetch() {} }
      },
      useMutation: options => {
        const ref = React.useRef(options); ref.current = options
        return { isPending: false, mutate: async value => { try { const result = await ref.current.mutationFn(value); ref.current.onSuccess?.(result, value) } catch (error) { ref.current.onError?.(error) } finally { ref.current.onSettled?.() } } }
      },
    },
  }
  const Panel = compile('components/tango/DriversPanel.tsx', imports, { window: dom.window, document }).default
  const root = createRoot(document.getElementById('root'))
  t.after(async () => {
    await act(async () => root.unmount())
    dom.window.close()
    for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name] }
  })
  const render = async access => act(async () => root.render(h(Panel, { programs, cheetahs, partners: [], userId: 'head', canView: true, canEdit: false, canSeeLicences: false, ...access })))
  const text = () => document.body.textContent
  const dialog = () => document.querySelector('[role="dialog"]')
  const button = label => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === label || node.getAttribute('aria-label') === label)
  const type = async (element, value) => act(async () => {
    const proto = element.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value)
    element.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  })

  await t.test('a plain member sees licence state but no controls or numbers', async () => {
    await render({})
    assert.match(text(), /Driver One/)
    assert.match(text(), /Licence valid to/)
    assert.match(text(), /Licence expired/)
    assert.match(text(), /Suspended/)
    assert.match(text(), /1 licence issue(?!s)/, 'the expired licence; a suspended driver with a valid licence is not a licence issue')
    assert.doesNotMatch(text(), /LAG-12345/)
    assert.equal(button('Add driver'), undefined)
    assert.equal(button('Edit Driver One'), undefined)
    assert.match(text(), /Default for CHEETAH-001/)
    assert.match(text(), /Driver One · Primary/, 'programme roster row')
  })

  await t.test('Command can edit drivers but never sees or sends licence numbers', async () => {
    await render({ canEdit: true })
    assert.doesNotMatch(text(), /LAG-12345/)
    assert.match(text(), /Licence numbers are kept by the Tango head and sub-leads/)
    await act(async () => button('Edit Driver One').click())
    assert.ok(document.querySelector('[role="dialog"]'))
    assert.equal(document.getElementById('licence-number'), null)
    assert.match(document.querySelector('[role="dialog"]').textContent, /Licence details are added by the Tango head or a sub-lead/)
    calls.length = 0
    await act(async () => button('Save driver').click())
    assert.deepEqual(calls.filter(call => call.table).map(call => `${call.table}:${call.op}`), ['tango_drivers:update'])
    assert.ok(!calls.some(call => call.table === 'tango_driver_licences'))
  })

  await t.test('a coordinator sees the number and saves a new driver with a licence', async () => {
    await render({ canEdit: true, canSeeLicences: true })
    assert.match(text(), /LAG-12345/)
    // Suspended / expired drivers cannot be picked for the programme roster.
    const options = [...document.querySelector('select[aria-label="Roster driver"]').options]
    assert.equal(options.find(option => option.value === 'd3').disabled, true)
    assert.match(options.find(option => option.value === 'd3').textContent, /suspended/)
    assert.equal(options.find(option => option.value === 'd2').disabled, true)
    assert.equal(options.some(option => option.value === 'd1'), false, 'already on the roster')
    await act(async () => button('Add driver').click())
    await type(document.getElementById('driver-name'), 'New Driver')
    await type(document.getElementById('driver-phone'), '0809')
    await type(document.getElementById('licence-number'), 'LAG-999')
    await type(document.getElementById('licence-expires'), '2028-05-01')
    calls.length = 0
    const submit = [...document.querySelectorAll('[role="dialog"] button')].find(node => node.textContent.trim() === 'Add driver')
    await act(async () => submit.click())
    const writes = calls.filter(call => call.table)
    assert.deepEqual(writes.map(call => `${call.table}:${call.op}`), ['tango_drivers:insert', 'tango_driver_licences:upsert'])
    assert.equal(writes[0].payload.full_name, 'New Driver')
    assert.equal(writes[1].payload.driver_id, 'new-driver')
    assert.equal(writes[1].payload.licence_number, 'LAG-999')
    assert.equal(writes[1].payload.verified_at, null, 'not verified unless ticked')
    assert.ok(!('verified_by' in writes[1].payload) && !('updated_by' in writes[1].payload), 'the database stamps who verified and edited')
    assert.equal(writes[1].options.onConflict, 'driver_id')
  })

  await t.test('a failed licence write never leads to a second driver on retry', async () => {
    await render({ canEdit: true, canSeeLicences: true })
    await act(async () => button('Add driver').click())
    await type(document.getElementById('driver-name'), 'Retry Driver')
    await type(document.getElementById('driver-phone'), '0812')
    await type(document.getElementById('licence-number'), 'LAG-12345')
    await type(document.getElementById('licence-expires'), '2028-05-01')
    calls.length = 0
    licenceError = { code: '23505', message: 'duplicate key value violates unique constraint "idx_tango_driver_licences_number"' }
    const dialogButton = label => [...document.querySelectorAll('[role="dialog"] button')].find(node => node.textContent.trim() === label)
    await act(async () => dialogButton('Add driver').click())
    const failure = calls.find(call => call.op === 'error')
    assert.match(failure.error.message, /Another driver already has this licence number\. The driver was added without a licence/)
    assert.ok(document.querySelector('[role="dialog"]'), 'the dialog stays open to correct the number')
    assert.match(document.querySelector('[role="dialog"]').textContent, /Edit driver/)
    licenceError = null
    await type(document.getElementById('licence-number'), 'LAG-777')
    calls.length = 0
    await act(async () => dialogButton('Save driver').click())
    const writes = calls.filter(call => call.table)
    assert.deepEqual(writes.map(call => `${call.table}:${call.op}`), ['tango_drivers:update', 'tango_driver_licences:upsert'], 'the retry updates the driver it already added')
    assert.equal(writes[1].payload.driver_id, 'new-driver')
  })

  await t.test('editing a verified licence number clears the tick', async () => {
    await render({ canEdit: true, canSeeLicences: true })
    await act(async () => button('Edit Driver One').click())
    const tick = document.querySelector('[role="dialog"] input[type="checkbox"]')
    assert.equal(tick.checked, true)
    await type(document.getElementById('licence-number'), 'LAG-NEW')
    assert.equal(document.querySelector('[role="dialog"] input[type="checkbox"]').checked, false)
    await type(document.getElementById('licence-number'), 'lag-12345')
    calls.length = 0
    await act(async () => dialog().querySelector('input[type="checkbox"]').click())
    await act(async () => [...dialog().querySelectorAll('button')].find(node => node.textContent.trim() === 'Save driver').click())
    const upsert = calls.find(call => call.op === 'upsert')
    assert.equal(upsert.payload.verified_at, licences[0].verified_at, 'same card, ticked again: the stored verification is kept')
  })

  await t.test('roster pickers grey out choices a unique index would refuse', async () => {
    await render({ canEdit: true, canSeeLicences: true })
    const cheetahOption = [...document.querySelector('select[aria-label="Roster Cheetah"]').options].find(option => option.value === 'c1')
    assert.equal(cheetahOption.disabled, true, 'C1 already has a primary driver')
    assert.match(cheetahOption.textContent, /has a primary driver/)
  })

  await t.test('while access loads or fails the panel does not claim there is no access', async () => {
    await render({ canView: false, accessLoading: true })
    assert.ok(document.querySelector('[aria-busy="true"]'))
    assert.doesNotMatch(text(), /Drivers are visible to Tango members and Command/)
    let retried = 0
    await render({ canView: false, accessFailed: true, onRetryAccess: () => { retried += 1 } })
    assert.match(text(), /Your Tango access could not be checked/)
    assert.doesNotMatch(text(), /Drivers are visible to Tango members and Command/)
    await act(async () => button('Retry').click())
    assert.equal(retried, 1)
  })

  await t.test('without read access the panel explains who can see drivers', async () => {
    await render({ canView: false })
    assert.match(text(), /Drivers are visible to Tango members and Command/)
  })
})
