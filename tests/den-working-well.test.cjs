const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function load(file) {
  const mod = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  }).outputText, { exports: mod.exports, module: mod, require })
  return mod.exports
}
const { attendanceState } = load('lib/den-work.ts')
const { parseStockLines } = load('lib/den-inventory.ts')
// den-plan imports only types at runtime, so it loads on its own.
const { budgetStatus } = load('lib/den-plan.ts')
const deepEq = (actual, expected) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected)

const migration = fs.readFileSync('supabase/migrations/20261116160000_den_attendance_budget_copy_and_returning_guests.sql', 'utf8')
const shift = { starts_at: '2026-11-28T17:00:00Z', ends_at: '2026-11-28T21:00:00Z' }
const at = (iso) => new Date(iso)

test('check-in opens two hours before a shift and a missed shift is called missed', () => {
  assert.equal(attendanceState(shift, {}, at('2026-11-28T14:59:00Z')), 'upcoming')
  assert.equal(attendanceState(shift, {}, at('2026-11-28T15:00:00Z')), 'open')
  assert.equal(attendanceState(shift, {}, at('2026-11-28T20:59:00Z')), 'open')
  assert.equal(attendanceState(shift, {}, at('2026-11-28T21:01:00Z')), 'missed')
  assert.equal(attendanceState(shift, { checked_in_at: '2026-11-28T16:55:00Z' }, at('2026-11-28T22:00:00Z')), 'checked_in')
  assert.equal(attendanceState(shift, { checked_in_at: 'x', checked_out_at: 'y' }), 'checked_out')
})

test('budget is reported as under, near or over only when one is set', () => {
  deepEq(budgetStatus(null, 500), { state: 'none', used: null })
  deepEq(budgetStatus(0, 500), { state: 'none', used: null })
  deepEq(budgetStatus(1000, 500), { state: 'under', used: 50 })
  deepEq(budgetStatus('1000.00', 900), { state: 'near', used: 90 })
  deepEq(budgetStatus(1000, 1200), { state: 'over', used: 120 })
  deepEq(budgetStatus(1000, undefined), { state: 'under', used: 0 })
})

test('pasted stock lines are read from commas or a spreadsheet, and problems are reported, not guessed', () => {
  const { rows, problems } = parseStockLines('Bottled water 50cl, pcs, 120, 24\nFace towels\tpcs\t40\t10\nGlass cups\n, x\nCups, pcs, abc\nface towels', ['Plates'])
  deepEq(rows, [
    { name: 'Bottled water 50cl', unit: 'pcs', quantity: 120, reorderLevel: 24, category: null },
    { name: 'Face towels', unit: 'pcs', quantity: 40, reorderLevel: 10, category: null },
    { name: 'Glass cups', unit: 'pcs', quantity: 0, reorderLevel: 0, category: null },
  ])
  assert.equal(problems.length, 3)
  assert.match(problems[0], /no item name/)
  assert.match(problems[1], /"abc" is not a quantity/)
  assert.match(problems[2], /already on the list/)
  assert.match(parseStockLines('Plates, pcs, 5', ['plates']).problems[0], /already on the list/)
})

test('officers check only themselves in, inside the window; coordinators can record anyone', () => {
  const fn = migration.match(/FUNCTION public\.den_shift_attendance[\s\S]*?\$\$;/)[0]
  assert.match(fn, /member\.user_id <> auth\.uid\(\) AND NOT coordinator/)
  assert.match(fn, /NOT coordinator AND \(now\(\) < shift\.starts_at - interval '2 hours' OR now\(\) > shift\.ends_at\)/)
  assert.match(fn, /action = 'clear' THEN\s+IF NOT coordinator/)
  assert.match(fn, /FOR UPDATE/)
})

test('copying a set-up never copies people and moves dates with the programme', () => {
  const fn = migration.match(/FUNCTION public\.den_copy_programme_setup[\s\S]*?\$\$;/)[0]
  assert.match(fn, /IF NOT public\.can_coordinate_unit\('november_den'\)/)
  assert.doesNotMatch(fn, /assigned_to/)
  assert.doesNotMatch(fn, /den_shift_members/)
  assert.doesNotMatch(fn, /done_at/)
  assert.match(fn, /make_interval\(days => target_start - source_start\)/)
  assert.match(fn, /IF copy_shifts AND shift_by IS NOT NULL THEN/)
})

test('earlier guest records are matched by name and shown only to those who can see the guest', () => {
  const fn = migration.match(/FUNCTION public\.den_guest_earlier_records[\s\S]*?\$\$;/)[0]
  assert.match(fn, /den_guest_name_key\(p\.full_name\) = me\.name_key/)
  assert.match(fn, /WHERE public\.can_view_den_guest\(target_papa\)/)
  assert.doesNotMatch(fn, /passport|phone|email|flight/)
})

test('the readiness summary keeps every earlier field and only adds new ones', () => {
  const summary = migration.match(/FUNCTION public\.den_programme_summary[\s\S]*?\$\$;/)[0]
  for (const key of ['guests', 'guests_profiled', 'entourage', 'team_on_programme', 'floor_access', 'pending_additions', 'locations', 'menus', 'menus_with_vendor', 'tasks', 'tasks_done', 'tasks_overdue', 'checklist_items', 'checklist_items_done', 'shifts', 'shifts_covered', 'plan', 'spend', 'shifts_attended']) {
    assert.match(summary, new RegExp(`'${key}'`), `${key} missing`)
  }
  assert.doesNotMatch(migration, /DROP POLICY|UPDATE public\.users|ALTER TYPE/i)
})
