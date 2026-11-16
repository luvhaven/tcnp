const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const mod = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/den-work.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText, { exports: mod.exports, module: mod, require })
const {
  isTaskOverdue, compareDenTasks, parseChecklistItems, checklistProgress,
  shiftGap, findShiftClashes, toLocalInputValue, fromLocalInputValue,
} = mod.exports
// Values built inside the vm context carry that context's prototypes, so copy
// them into this one before a strict comparison.
const deepEq = (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message)

const migration = fs.readFileSync('supabase/migrations/20261115170000_den_tasks_checklists_roster.sql', 'utf8')
const now = new Date('2026-11-20T12:00:00Z')
const task = (overrides) => ({ id: 't', project_id: 'p', title: 'Task', description: null, assigned_to: null, due_at: null, status: 'todo', completed_at: null, created_at: '', ...overrides })

test('a task is overdue only while it is still open and past its deadline', () => {
  assert.equal(isTaskOverdue(task({ due_at: '2026-11-20T11:00:00Z' }), now), true)
  assert.equal(isTaskOverdue(task({ due_at: '2026-11-20T13:00:00Z' }), now), false)
  assert.equal(isTaskOverdue(task({ due_at: '2026-11-20T11:00:00Z', status: 'done' }), now), false)
  assert.equal(isTaskOverdue(task({ due_at: '2026-11-20T11:00:00Z', status: 'cancelled' }), now), false)
  assert.equal(isTaskOverdue(task({ due_at: null }), now), false)
})

test('the task list puts overdue first, then blocked, then nearest deadline, and finished last', () => {
  const sorted = [
    task({ title: 'done', status: 'done', due_at: '2026-11-19T00:00:00Z' }),
    task({ title: 'undated' }),
    task({ title: 'soon', due_at: '2026-11-21T00:00:00Z' }),
    task({ title: 'blocked', status: 'blocked', due_at: '2026-11-25T00:00:00Z' }),
    task({ title: 'late', due_at: '2026-11-19T00:00:00Z' }),
    task({ title: 'later', due_at: '2026-11-23T00:00:00Z' }),
  ].sort((a, b) => compareDenTasks(a, b, now)).map(entry => entry.title)
  deepEq(sorted, ['late', 'blocked', 'soon', 'later', 'undated', 'done'])
})

test('template text becomes clean items: one per line, bullets and duplicates removed', () => {
  deepEq(
    parseChecklistItems('- Water set out\n\n2. Towels folded\n* water set out\n   Menu cards  \n•\n'),
    ['Water set out', 'Towels folded', 'Menu cards'],
  )
  deepEq(parseChecklistItems('   \n'), [])
})

test('an empty checklist is never reported complete', () => {
  deepEq(checklistProgress([]), { done: 0, total: 0, complete: false })
  deepEq(checklistProgress([{ done_at: 'x' }, { done_at: null }]), { done: 1, total: 2, complete: false })
  assert.equal(checklistProgress([{ done_at: 'x' }]).complete, true)
})

test('a shift is short until it has the officers it needs', () => {
  assert.equal(shiftGap({ officers_needed: 3 }, 1), 2)
  assert.equal(shiftGap({ officers_needed: 3 }, 3), 0)
  assert.equal(shiftGap({ officers_needed: 3 }, 5), 0)
})

test('an officer on two overlapping shifts is flagged; back-to-back shifts are fine', () => {
  const shifts = [
    { id: 'a', starts_at: '2026-11-21T08:00:00Z', ends_at: '2026-11-21T12:00:00Z' },
    { id: 'b', starts_at: '2026-11-21T11:00:00Z', ends_at: '2026-11-21T15:00:00Z' },
    { id: 'c', starts_at: '2026-11-21T12:00:00Z', ends_at: '2026-11-21T16:00:00Z' },
  ]
  const members = [
    { shift_id: 'a', user_id: 'u1' }, { shift_id: 'b', user_id: 'u1' },
    { shift_id: 'a', user_id: 'u2' }, { shift_id: 'c', user_id: 'u2' },
    { shift_id: 'gone', user_id: 'u1' },
  ]
  deepEq(findShiftClashes(shifts, members), [{ user_id: 'u1', shift_ids: ['a', 'b'] }])
})

test('deadline fields round-trip and reject nonsense', () => {
  const iso = '2026-11-21T08:30:00.000Z'
  assert.equal(fromLocalInputValue(toLocalInputValue(iso)), iso)
  assert.equal(toLocalInputValue(null), '')
  assert.equal(toLocalInputValue('not a date'), '')
  assert.equal(fromLocalInputValue(''), null)
  assert.equal(fromLocalInputValue('nope'), null)
})

test('other units keep their projects and tasks exactly as they were', () => {
  // Every policy this migration adds on the shared tables is Den-scoped and additive.
  const shared = [...migration.matchAll(/CREATE POLICY (\w+) ON public\.(unit_projects|unit_tasks)\b([\s\S]*?);/g)]
  assert.equal(shared.length, 6)
  for (const [, name, , body] of shared) {
    assert.match(name, /_den_/, `${name} is not Den-scoped by name`)
    assert.match(body, /november_den|is_den_project/, `${name} is not Den-scoped`)
  }
  for (const dropped of migration.matchAll(/DROP POLICY IF EXISTS (\w+) ON public\.(unit_projects|unit_tasks)/g)) {
    assert.match(dropped[1], /_den_/, `${dropped[1]} is an existing shared policy`)
  }
  // The new project type is added to the list; none of the existing ones is removed.
  for (const type of ['year_end_party', 'team_bonding', 'awards', 'visit', 'charity', 'member_support', 'emergency', 'other', 'programme_operation']) {
    assert.match(migration, new RegExp(`'${type}'`))
  }
  // The assignee guard only checks Den programme tasks.
  const guard = migration.match(/FUNCTION public\.guard_den_task_assignee[\s\S]*?\$\$;/)[0]
  assert.match(guard, /unit_record\.slug = 'november_den'/)
  assert.match(guard, /project_type = 'programme_operation'/)
})

test('work goes only to officers who are on the programme', () => {
  const eligible = migration.match(/FUNCTION public\.den_can_take_programme_work[\s\S]*?\$\$;/)[0]
  assert.match(eligible, /access_level IN \('head', 'sub_lead'\)\s+OR public\.is_program_active_officer\(target_user, target_program\)/)
  assert.match(migration.match(/FUNCTION public\.guard_den_task_assignee[\s\S]*?\$\$;/)[0], /den_can_take_programme_work\(NEW\.assigned_to, task_program\)/)
  assert.match(migration.match(/FUNCTION public\.guard_and_notify_den_shift_member[\s\S]*?\$\$;/)[0], /den_can_take_programme_work\(NEW\.user_id, shift_row\.program_id\)/)
  assert.match(migration.match(/FUNCTION public\.den_tick_checklist_item[\s\S]*?\$\$;/)[0], /den_can_take_programme_work\(auth\.uid\(\), item_program\)/)
})

test('a member can move their own task along but cannot cancel or reassign it', () => {
  const own = migration.match(/FUNCTION public\.den_set_my_task_status[\s\S]*?\$\$;/)[0]
  assert.match(own, /new_status NOT IN \('todo', 'in_progress', 'blocked', 'done'\)/)
  assert.match(own, /task\.assigned_to = auth\.uid\(\)/)
  // Only status and completed_at are written; the WHERE clause is what ties it to the caller.
  const setClause = own.match(/SET([\s\S]*?)WHERE/)[1]
  assert.doesNotMatch(setClause, /assigned_to|title|due_at|project_id/)
})

test('assignment sends a notification, and templates stay with the Team Lead', () => {
  const notify = migration.match(/FUNCTION public\.notify_den_task_assignment[\s\S]*?\$\$;/)[0]
  assert.match(notify, /INSERT INTO public\.notifications/)
  assert.match(notify, /'den_task_assigned'/)
  assert.match(migration, /CREATE POLICY den_checklist_templates_manage[\s\S]*?can_manage_unit\('november_den'\)/)
  for (const table of ['den_checklist_templates', 'den_checklists', 'den_checklist_items', 'den_shifts', 'den_shift_members']) {
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`))
  }
  assert.doesNotMatch(migration, /UPDATE public\.users|ALTER TYPE/i)
})
