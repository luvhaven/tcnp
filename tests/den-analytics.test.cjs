const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const mod = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/den-analytics.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText, { exports: mod.exports, module: mod, require })
const { percent, percentLabel, teamWorkload, usageSeries, usageTrend } = mod.exports
// Values built inside the vm context carry that context's prototypes.
const deepEq = (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message)

const migration = fs.readFileSync('supabase/migrations/20261116140000_den_analytics_and_reminders.sql', 'utf8')
const officer = (overrides) => ({ user_id: 'u', full_name: 'Ada', access_level: 'member', tasks_assigned: 0, tasks_done: 0, tasks_overdue: 0, shifts: 0, programmes: 0, ...overrides })

test('a rate with nothing behind it is unknown, not zero', () => {
  assert.equal(percent(3, 4), 75)
  assert.equal(percent(0, 4), 0)
  assert.equal(percent(0, 0), null)
  assert.equal(percent(5, 4), 100)
  assert.equal(percentLabel(1, 3), '33%')
  assert.equal(percentLabel(0, 0), '—')
})

test('the workload chart shows officers who carry work, busiest first', () => {
  deepEq(teamWorkload([
    officer({ full_name: 'Idle' }),
    officer({ full_name: 'Bola', tasks_assigned: 2, tasks_done: 2 }),
    officer({ full_name: 'Ada', tasks_assigned: 5, tasks_done: 1, tasks_overdue: 2, shifts: 1 }),
    officer({ full_name: 'Shift only', shifts: 3 }),
  ]), [
    { name: 'Ada', done: 1, open: 4, overdue: 2, shifts: 1 },
    { name: 'Bola', done: 2, open: 0, overdue: 0, shifts: 0 },
    { name: 'Shift only', done: 0, open: 0, overdue: 0, shifts: 3 },
  ])
  deepEq(teamWorkload([]), [])
})

test('weekly usage is ordered by date and labelled without depending on the time zone', () => {
  deepEq(usageSeries([
    { week_start: '2026-11-09', used: '12.50' },
    { week_start: '2026-11-02', used: 0 },
  ]), [{ label: '2 Nov', used: 0 }, { label: '9 Nov', used: 12.5 }])
})

test('the usage trend compares the recent weeks with the ones before', () => {
  const weeks = (values) => values.map((used, index) => ({ week_start: `2026-10-${String(5 + index * 7).padStart(2, '0')}`, used }))
  deepEq(usageTrend(weeks([10, 10, 20, 20])), { direction: 'up', change: 100 })
  deepEq(usageTrend(weeks([20, 20, 10, 10])), { direction: 'down', change: -50 })
  deepEq(usageTrend(weeks([10, 10, 10, 10])), { direction: 'flat', change: 0 })
  deepEq(usageTrend(weeks([0, 0, 4, 4])), { direction: 'up', change: null })
  assert.equal(usageTrend(weeks([0, 0, 0, 0])), null)
  assert.equal(usageTrend([]), null)
})

test('the dashboard is read-only and open to the Den and leadership alone', () => {
  const analytics = migration.match(/FUNCTION public\.den_analytics[\s\S]*?\$\$;/)[0]
  assert.match(analytics, /public\.is_admin\(\) OR public\.is_unit_member\('november_den'\)/)
  assert.match(analytics, /STABLE/)
  assert.doesNotMatch(analytics, /\b(INSERT|UPDATE|DELETE)\b/)
  // Every PRD dashboard is covered.
  for (const key of ['programmes_active', 'programmes_completed', 'open_tasks', 'overdue_tasks', 'participating', 'tasks_done', 'low_stock', 'weekly_usage', 'reorder', 'programmes_reported', 'outstanding', 'lessons_logged']) {
    assert.match(analytics, new RegExp(`'${key}'`), `${key} missing from the dashboard`)
  }
  // No guest details or money leave through it.
  assert.doesNotMatch(analytics, /dietary|passport|phone|email|price|amount/)
})

test('reminders go once per deadline, only to the assignee, and never from the app', () => {
  const reminders = migration.match(/FUNCTION public\.den_send_task_reminders[\s\S]*?\$\$;/)[0]
  assert.match(reminders, /ON CONFLICT DO NOTHING/)
  assert.match(reminders, /JOIN claimed ON claimed\.task_id = due\.id AND claimed\.kind = due\.kind/)
  assert.match(reminders, /unit_record\.slug = 'november_den'/)
  assert.match(reminders, /task\.status IN \('todo', 'in_progress', 'blocked'\)/)
  assert.match(reminders, /task\.due_at > now\(\) - interval '3 days'/)
  assert.match(migration, /PRIMARY KEY \(task_id, kind, due_at\)/)
  // Only the scheduler may run it, and the bookkeeping table has no policies at all.
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.den_send_task_reminders\(\) FROM PUBLIC, anon, authenticated/)
  assert.match(migration, /ALTER TABLE public\.den_task_reminders ENABLE ROW LEVEL SECURITY/)
  assert.doesNotMatch(migration, /CREATE POLICY \w+ ON public\.den_task_reminders/)
  assert.match(migration, /cron\.schedule\(\s*'tcnp-den-task-reminders'/)
  assert.doesNotMatch(migration, /UPDATE public\.users|ALTER TYPE/i)
})
