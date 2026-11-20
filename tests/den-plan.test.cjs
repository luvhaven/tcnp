const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const mod = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/den-plan.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText, { exports: mod.exports, module: mod, require })
const { readinessChecks, readinessScore, readinessTone, denPlanStatusOptions, isReturningGuest, hasHospitalityProfile } = mod.exports

const migration = fs.readFileSync('supabase/migrations/20261115160000_den_programme_plans_and_guest_notes.sql', 'utf8')

const empty = {
  guests: 0, guests_profiled: 0, entourage: 0, team_on_programme: 0, floor_access: 0,
  pending_additions: 0, locations: 0, menus: 0, menus_with_vendor: 0, plan: null,
}
const plan = { id: 'p', status: 'planning', expected_guests: null, service_notes: null, updated_at: '2026-11-15T00:00:00Z' }

test('a programme with nothing done scores zero and one with everything scores 100', () => {
  assert.equal(readinessScore(readinessChecks(empty)), 0)
  const complete = { ...empty, guests: 3, guests_profiled: 3, team_on_programme: 4, floor_access: 2, locations: 1, menus: 2, menus_with_vendor: 2, tasks: 5, tasks_done: 5, checklist_items: 8, checklist_items_done: 8, shifts: 3, shifts_covered: 3, plan }
  assert.equal(readinessScore(readinessChecks(complete)), 100)
})

test('the weights add up to 100 so the score reads as a percentage', () => {
  assert.equal(readinessChecks(empty).reduce((sum, check) => sum + check.weight, 0), 100)
})

test('partly met checks earn part of their weight', () => {
  // Plan (5) + menus (15) + half the vendors (5) + one of four guests (2.5)
  // + two of four tasks (7.5) + three of four checklist items (7.5) = 42.5
  const partial = { ...empty, plan, menus: 2, menus_with_vendor: 1, guests: 4, guests_profiled: 1, tasks: 4, tasks_done: 2, checklist_items: 4, checklist_items_done: 3 }
  assert.equal(readinessScore(readinessChecks(partial)), 43)
})

test('availability or a pending request never counts as an officer on the programme', () => {
  const pendingOnly = readinessChecks({ ...empty, pending_additions: 3 }).find(check => check.key === 'team')
  assert.equal(pendingOnly.progress, 0)
  assert.match(pendingOnly.detail, /awaiting approval/)
})

test('a programme with no guests or menus does not divide by zero', () => {
  const checks = readinessChecks({ ...empty, plan })
  for (const check of checks) assert.ok(Number.isFinite(check.progress) && check.progress >= 0 && check.progress <= 1, check.key)
  assert.equal(readinessScore([]), 0)
})

test('the score colour follows the score', () => {
  assert.equal(readinessTone(0), 'destructive')
  assert.equal(readinessTone(39), 'destructive')
  assert.equal(readinessTone(40), 'warning')
  assert.equal(readinessTone(80), 'success')
})

test('only the Team Lead is offered archiving, but an archived plan still shows its stage', () => {
  assert.equal(denPlanStatusOptions(false).includes('archived'), false)
  assert.equal(denPlanStatusOptions(true).includes('archived'), true)
  assert.equal(denPlanStatusOptions(false, 'archived').includes('archived'), true)
})

test('a guest is returning when any record says so', () => {
  assert.equal(isReturningGuest({ is_first_time: true, past_invites_count: 0 }), false)
  assert.equal(isReturningGuest({ is_first_time: false, past_invites_count: 0 }), true)
  assert.equal(isReturningGuest({ is_first_time: true, past_invites_count: 2 }), true)
  assert.equal(isReturningGuest({ is_first_time: true, past_invites_count: 0 }, 2), true)
  assert.equal(isReturningGuest({ is_first_time: true, past_invites_count: 0 }, 1), false)
})

test('a hospitality profile exists once the Den knows anything about hosting the guest', () => {
  assert.equal(hasHospitalityProfile({ dietary_restrictions: null, food_preferences: null, note_count: 0 }), false)
  assert.equal(hasHospitalityProfile({ dietary_restrictions: 'No pork', food_preferences: null, note_count: 0 }), true)
  assert.equal(hasHospitalityProfile({ dietary_restrictions: null, food_preferences: null, note_count: 1 }), true)
})

test('the migration never writes to programmes or Papas, which leadership owns', () => {
  assert.doesNotMatch(migration, /(UPDATE|INSERT INTO|DELETE FROM|ALTER TABLE) public\.(papas|programs|users)\b/i)
  assert.doesNotMatch(migration, /CREATE POLICY \w+ ON public\.(papas|programs)\b/)
})

test('guest data leaves the Papa record only through the hospitality fields', () => {
  const profiles = migration.match(/FUNCTION public\.den_guest_profiles[\s\S]*?\$\$;/)[0]
  for (const field of ['passport', 'phone', 'email', 'flight_number', 'accommodation', 'short_bio', 'nationality']) {
    assert.doesNotMatch(profiles, new RegExp(field), `${field} must not be exposed to the Den`)
  }
  assert.match(profiles, /can_view_den_program\(target_program\)/)
})

test('seeing a programme guests needs more than unit membership', () => {
  const view = migration.match(/FUNCTION public\.can_view_den_program[\s\S]*?\$\$;/)[0]
  // A plain member must also have been added to the programme.
  assert.match(view, /is_unit_member\('november_den'\)\s+AND public\.is_program_active_officer\(auth\.uid\(\), target_program\)/)
  assert.match(view, /public\.is_admin\(\)/)
})

test('every new table has row-level security and the archive guard handles inserts', () => {
  for (const table of ['den_operations', 'den_guest_notes']) {
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`))
  }
  const guard = migration.match(/FUNCTION public\.guard_den_operation_archive[\s\S]*?\$\$;/)[0]
  assert.match(guard, /IF TG_OP = 'INSERT' THEN/)
  assert.match(guard, /can_manage_unit\('november_den'\)/)
  // Notes are written under the author's own name.
  assert.match(migration, /CREATE POLICY den_guest_notes_insert[\s\S]*?created_by = auth\.uid\(\)/)
})

test('a summary from before the tasks migration still scores without NaN', () => {
  const checks = readinessChecks({ ...empty, plan })
  assert.equal(checks.length, 10)
  assert.equal(readinessScore(checks), 5)
  assert.match(checks.find(check => check.key === 'tasks').detail, /No tasks/)
})

test('overdue tasks are called out in the readiness detail', () => {
  const detail = readinessChecks({ ...empty, tasks: 3, tasks_done: 1, tasks_overdue: 2 }).find(check => check.key === 'tasks').detail
  assert.match(detail, /1 of 3 tasks done, 2 overdue/)
})
