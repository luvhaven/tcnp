const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const mod = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/program-additions.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText, { exports: mod.exports, module: mod, require })
const { additionOutcome, canApproveProgramAdditions, isAdditionUnit, programAcceptsAdditions } = mod.exports

const migration = fs.readFileSync('supabase/migrations/20261115150000_programme_addition_requests.sql', 'utf8')
const route = fs.readFileSync('app/api/program-additions/route.ts', 'utf8')

test('executives, admins and the Head of Command approve; nobody else', () => {
  for (const role of ['super_admin', 'dev_admin', 'admin', 'captain', 'vice_captain', 'head_of_command']) {
    assert.equal(canApproveProgramAdditions(role, false), true, role)
  }
  assert.equal(canApproveProgramAdditions('viewer', true), true)
  for (const role of ['head_noscar_den', 'noscar_den', 'command', 'head_of_operations', 'viewer', null]) {
    assert.equal(canApproveProgramAdditions(role, false), false, String(role))
  }
})

test('a unit head adds an available officer at once and anyone else only with approval', () => {
  assert.equal(additionOutcome({ callerCanApprove: false, officerAcceptedAvailability: true }), 'added')
  assert.equal(additionOutcome({ callerCanApprove: false, officerAcceptedAvailability: false }), 'pending')
})

test('leadership adds anyone directly, available or not', () => {
  assert.equal(additionOutcome({ callerCanApprove: true, officerAcceptedAvailability: false }), 'added')
  assert.equal(additionOutcome({ callerCanApprove: true, officerAcceptedAvailability: true }), 'added')
})

test('only known units and open programmes take additions', () => {
  assert.equal(isAdditionUnit('november_den'), true)
  assert.equal(isAdditionUnit('command'), false)
  assert.equal(isAdditionUnit('toString'), false)
  assert.equal(isAdditionUnit(undefined), false)
  assert.equal(programAcceptsAdditions('planning'), true)
  assert.equal(programAcceptsAdditions('active'), true)
  assert.equal(programAcceptsAdditions('completed'), false)
  assert.equal(programAcceptsAdditions('archived'), false)
})

test('in the database, being on a programme means being added, not being available', () => {
  const active = migration.match(/FUNCTION public\.is_program_active_officer[\s\S]*?\$\$;/)[0]
  assert.match(active, /title_assignments/)
  assert.doesNotMatch(active, /mission_responses/)
})

test('the database approver check matches the app and requests are read-only to clients', () => {
  const approver = migration.match(/FUNCTION public\.can_approve_program_additions[\s\S]*?\$\$;/)[0]
  assert.match(approver, /is_platform_admin\(\)/)
  assert.match(approver, /'head_of_command'/)
  assert.match(migration, /ALTER TABLE public\.program_addition_requests ENABLE ROW LEVEL SECURITY/)
  const policies = [...migration.matchAll(/CREATE POLICY \w+ ON public\.program_addition_requests\s+FOR (\w+)/g)].map(match => match[1])
  assert.deepEqual(policies, ['SELECT'])
  assert.doesNotMatch(migration, /UPDATE public\.users|ALTER TYPE/i)
})

test('the route decides approval from the caller, never from the request body', () => {
  // A unit head cannot approve or reject; only cancel their own unit's request.
  assert.match(route, /else if \(!caller\.canApprove\) \{[\s\S]{0,400}status: 403/)
  assert.match(route, /if \(!caller\.canApprove && !caller\.headOf\.has\(unitSlug\)\)/)
  assert.doesNotMatch(route, /body\.(canApprove|approved|status|title_code|had_availability)/)
  // The pending path requires a reason and never assigns a title.
  const pendingBranch = route.match(/if \(outcome === 'pending'\) \{[\s\S]*?return NextResponse\.json\(\{ outcome: 'pending' \}\)/)[0]
  assert.match(pendingBranch, /if \(!reason\)/)
  assert.doesNotMatch(pendingBranch, /assignToProgram/)
})
