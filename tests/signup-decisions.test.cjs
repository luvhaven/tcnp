// Declining signups: pure rules, the API routes (mocked Supabase clients) and
// the Approvals page (jsdom, skipped when the jsdom runtime is not installed).
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
  vm.runInNewContext(source, {
    module: mod, exports: mod.exports, console, URL, setTimeout, clearTimeout,
    require: name => (name in imports ? imports[name] : require(name)),
    ...globals,
  })
  return mod.exports
}

const utils = compile('lib/utils.ts')
const unitAccess = compile('lib/unit-access.ts')
const directory = compile('lib/officer-directory.ts', { '@/lib/utils': utils })
const workbook = compile('lib/officer-status-workbook.ts', {
  '@/lib/utils': utils,
  '@/lib/profile-completion': compile('lib/profile-completion.ts'),
})

const eq = (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message)
const head = slug => ({ slug, access_level: 'head', status: 'active' })
const member = slug => ({ slug, access_level: 'member', status: 'active' })

// ─── Pure rules ─────────────────────────────────────────────────────────────

test('signup approval authority comes from head memberships, not role or Oscar text', () => {
  assert.equal(utils.canApproveSignups('viewer', null, false, [head('tango')]), true, 'a curated head row approves')
  assert.equal(utils.canApproveSignups('head_tango_oscar', null, false, []), false, 'a head role without its row does not')
  assert.equal(utils.canApproveSignups('viewer', 'Head Tango Oscar', false, [member('tango')]), false)
  assert.equal(utils.canApproveSignups('viewer', null, false, [{ ...head('tango'), status: 'inactive' }]), false)
  // Platform admins are never reduced.
  for (const role of ['super_admin', 'admin', 'dev_admin', 'captain', 'vice_captain']) assert.equal(utils.canApproveSignups(role, null, false, []), true, role)
  assert.equal(utils.canApproveSignups('head_of_command', null, true, []), true)
  // Command (rank 60) approves only through a head row, as before.
  assert.equal(utils.canApproveSignups('command', null, false, []), false)
  // Without memberships the legacy head-role fallback still applies (nav callers that pass none).
  assert.equal(utils.canApproveSignups('head_tango_oscar', null, false), true)
  assert.equal(utils.canApproveSignups('viewer', 'head_alpha_oscar', false), false)
})

test('canDecideSignup: a head decides only for the applicant\'s own unit', () => {
  const tangoHead = { role: 'viewer', memberships: [head('tango'), member('alpha')] }
  assert.equal(utils.canDecideSignup(tangoHead, ['tango']), true)
  assert.equal(utils.canDecideSignup(tangoHead, ['alpha']), false, 'membership is not headship')
  assert.equal(utils.canDecideSignup(tangoHead, ['victor']), false)
  assert.equal(utils.canDecideSignup(tangoHead, []), false, 'no-unit signups are for admins')
  assert.equal(utils.canDecideSignup(tangoHead, undefined), false)
  assert.equal(utils.canDecideSignup({ role: 'admin', memberships: [] }, []), true)
  assert.equal(utils.canDecideSignup({ role: 'command', memberships: [] }, ['command']), false)
  assert.equal(utils.canDecideSignup({ role: 'head_of_command', memberships: [head('command')] }, ['command']), true)
  eq(Array.from(utils.headedUnitSlugs([head('tango'), head('tango'), member('alpha'), { ...head('victor'), status: 'inactive' }])), ['tango'])
})

test('decision bodies are validated before anything is written', () => {
  eq({ ...utils.parseSignupDecision({ officerId: ' u1 ' }) }, { officerId: 'u1', decision: 'approve', reason: null })
  eq({ ...utils.parseSignupDecision({ officerId: 'u1', decision: 'decline', reason: '  Not known  ' }) }, { officerId: 'u1', decision: 'decline', reason: 'Not known' })
  assert.match(utils.parseSignupDecision({ officerId: 'u1', decision: 'decline' }).error, /reason/)
  assert.match(utils.parseSignupDecision({ officerId: 'u1', decision: 'decline', reason: ' no ' }).error, /at least 3/)
  assert.match(utils.parseSignupDecision({ officerId: 'u1', decision: 'decline', reason: 'x'.repeat(501) }).error, /under 500/)
  assert.match(utils.parseSignupDecision({ officerId: 'u1', decision: 'delete' }).error, /approve, decline or reopen/)
  assert.match(utils.parseSignupDecision({ decision: 'approve' }).error, /officerId/)
  assert.match(utils.parseSignupDecision(null).error, /Invalid/)
  assert.match(utils.parseSignupDecision({ officerId: 'u1', reason: 42 }).error, /text/)
  assert.equal(utils.parseSignupDecision({ officerId: 'u1', decision: 'reopen' }).decision, 'reopen')
})

test('decide_signup error codes map to HTTP statuses', () => {
  eq({ ...utils.signupDecisionErrorStatus('42501') }, { status: 403, userFacing: true })
  eq({ ...utils.signupDecisionErrorStatus('P0002') }, { status: 404, userFacing: true })
  eq({ ...utils.signupDecisionErrorStatus('55000') }, { status: 409, userFacing: true })
  eq({ ...utils.signupDecisionErrorStatus('22023') }, { status: 400, userFacing: true })
  eq({ ...utils.signupDecisionErrorStatus('PGRST202') }, { status: 503, userFacing: false })
  eq({ ...utils.signupDecisionErrorStatus('XX000') }, { status: 500, userFacing: false })
})

test('officer directory and status workbook label declined accounts', () => {
  assert.equal(directory.officerAccountStatus({ is_active: false, activation_status: 'declined' }), 'Declined')
  assert.equal(directory.officerAccountStatus({ is_active: false, activation_status: 'deactivated' }), 'Inactive')
  assert.equal(directory.officerAccountStatus({ is_active: false, activation_status: 'pending' }), 'Pending')
  const officers = [
    { id: 'd', role: 'viewer', full_name: 'Declined One', email: 'd@x.test', is_active: false, activation_status: 'declined' },
    { id: 'i', role: 'viewer', full_name: 'Gone', email: 'i@x.test', is_active: false, activation_status: 'deactivated' },
  ]
  const filter = status => directory.filterDirectoryOfficers(officers, { status, role: 'all', team: 'all', search: '' }).map(o => o.id)
  eq(filter('declined'), ['d'])
  // 'inactive' keeps declined accounts too, so a directory without a Declined
  // option never hides them.
  eq(filter('inactive'), ['d', 'i'])
  eq(filter('active'), [])
  assert.equal(directory.accountStatusMatches('Declined', 'inactive'), true)
  assert.equal(directory.accountStatusMatches('Inactive', 'declined'), false)
  assert.equal(workbook.statusFor({ activation_status: 'declined', is_active: false }), 'Declined')
  assert.equal(workbook.statusFor({ activation_status: 'deactivated', is_active: false }), 'Deactivated')
  assert.equal(workbook.statusFor({ activation_status: 'pending', is_active: false }), 'Pending approval')
  assert.equal(workbook.statusFor({ activation_status: 'active', is_active: true }), 'Active')
  // The workbook still builds, with the Declined column in the overview.
  const zip = workbook.createOfficerStatusWorkbook([{ ...officers[0], oscar: 'Tango Oscar', created_at: '2026-11-01T10:00:00Z' }], new Date('2026-11-16T10:00:00Z'), new Uint8Array([137, 80, 78, 71]))
  const { unzipSync, strFromU8 } = require('fflate')
  const files = unzipSync(zip)
  const overview = strFromU8(files['xl/worksheets/sheet1.xml'])
  assert.match(overview, />Declined</)
  const tango = Object.keys(files).filter(name => /sheet\d+\.xml$/.test(name)).map(name => strFromU8(files[name])).find(xml => xml.includes('Declined One'))
  assert.ok(tango && tango.includes('>Declined<'))
})

// ─── signup-approvals route ─────────────────────────────────────────────────

const json = (body, options = {}) => ({ body, status: options.status || 200 })
const nextServer = { NextResponse: { json } }

/** A chainable PostgREST stand-in: every call is recorded, results come from `resolve`. */
function fakeDb(resolve, log) {
  return {
    from(table) {
      const q = { table, filters: [], op: 'select' }
      const chain = new Proxy({}, {
        get(_, key) {
          if (key === 'then') return (ok, fail) => Promise.resolve(resolve(q)).then(ok, fail)
          if (key === 'maybeSingle' || key === 'single') return async () => { const r = await resolve({ ...q, single: true }); log?.push(q); return r }
          return (...args) => {
            if (['insert', 'update', 'delete'].includes(key)) { q.op = key; q.payload = args[0] }
            else if (key === 'select' && q.op === 'select') q.select = args[0]
            else q.filters.push([key, ...args])
            if (key === 'insert' || key === 'update') log?.push(q)
            return chain
          }
        },
      })
      return chain
    },
  }
}

const filterValue = (q, key, column) => q.filters.find(([k, c]) => k === key && c === column)?.[2]

function approvalsRoute({ caller, memberships = [], membershipError = null, pending = [], applicantUnits = {}, decisions = [], people = [], rpcError = null }) {
  const rpcCalls = []
  const session = {
    auth: { getUser: async () => ({ data: { user: caller ? { id: caller.id } : null } }) },
    ...fakeDb(q => {
      if (q.table === 'users') return { data: caller, error: null }
      if (q.table === 'unit_memberships') return { data: membershipError ? null : memberships.map(m => ({ access_level: m.access_level, status: 'active', units: { slug: m.slug } })), error: membershipError }
      return { data: null, error: null }
    }),
    rpc: async (name, args) => { rpcCalls.push({ name, args }); return rpcError ? { data: null, error: rpcError } : { data: { id: args.target_user, activation_status: { approve: 'active', decline: 'declined', reopen: 'pending' }[args.signup_decision] }, error: null } },
  }
  const admin = fakeDb(q => {
    if (q.table === 'users' && filterValue(q, 'eq', 'activation_status') === 'pending') return { data: pending, error: null }
    if (q.table === 'users') return { data: people.filter(p => filterValue(q, 'in', 'id').includes(p.id)), error: null }
    if (q.table === 'unit_memberships') {
      const ids = filterValue(q, 'in', 'user_id')
      return { data: ids.flatMap(id => (applicantUnits[id] ?? []).map(slug => ({ user_id: id, units: { slug } }))), error: null }
    }
    if (q.table === 'signup_decisions') return { data: decisions, error: null }
    return { data: null, error: null }
  })
  const route = compile('app/api/officers/signup-approvals/route.ts', {
    'next/server': nextServer,
    '@/lib/supabase/server': { createClient: async () => session },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/utils': utils,
    '@/lib/unit-access': unitAccess,
  })
  const post = body => route.POST({ json: async () => body })
  return { route, post, rpcCalls }
}

const active = extra => ({ id: 'caller', activation_status: 'active', is_active: true, has_admin_access: false, ...extra })
const applicants = [
  { id: 'tango-app', full_name: 'Tango Applicant', email: 't@x.test', oscar: 'Tango Oscar', created_at: '2026-11-15' },
  { id: 'victor-app', full_name: 'Victor Applicant', email: 'v@x.test', oscar: 'Victor Oscar', created_at: '2026-11-14' },
  { id: 'nounit-app', full_name: 'No Unit', email: 'n@x.test', oscar: 'OSCAR-NU-VIEWER', created_at: '2026-11-13' },
]
const applicantUnits = { 'tango-app': ['tango'], 'victor-app': ['victor'] }

test('GET: a unit head by membership sees only their unit; Oscar text gives nothing', async () => {
  const { route } = approvalsRoute({ caller: active({ role: 'viewer' }), memberships: [head('tango')], pending: applicants, applicantUnits })
  const res = await route.GET()
  assert.equal(res.status, 200)
  eq(res.body.pending.map(p => p.id), ['tango-app'])
  assert.equal(res.body.scope, 'unit')
  assert.equal(res.body.canReopen, false)
  eq(res.body.declined, [])

  const oscarOnly = approvalsRoute({ caller: active({ role: 'viewer', oscar: 'Head Tango Oscar' }), memberships: [member('tango')], pending: applicants, applicantUnits })
  assert.equal((await oscarOnly.route.GET()).status, 403)
  const inactive = approvalsRoute({ caller: active({ role: 'admin', activation_status: 'declined', is_active: false }) })
  assert.equal((await inactive.route.GET()).status, 403)
})

test('GET: admins see every signup and the declined list; reopened people drop out of it', async () => {
  const now = new Date().toISOString()
  const { route } = approvalsRoute({
    caller: active({ role: 'admin' }), pending: applicants, applicantUnits,
    decisions: [
      { user_id: 'd1', reason: 'Not known to the unit', decided_at: now, decided_by: 'head1' },
      { user_id: 'd2', reason: 'Duplicate', decided_at: now, decided_by: null },
      { user_id: 'd1', reason: 'older decline', decided_at: '2026-11-01T00:00:00Z', decided_by: 'head1' },
    ],
    people: [
      { id: 'd1', full_name: 'Declined One', email: 'd1@x.test', oscar: 'Tango Oscar', activation_status: 'declined', is_directory_hidden: false },
      { id: 'd2', full_name: 'Reopened', email: 'd2@x.test', oscar: null, activation_status: 'pending', is_directory_hidden: false },
      { id: 'head1', full_name: 'Tango Head', email: 'h@x.test', oscar: 'Tango Oscar', activation_status: 'active', is_directory_hidden: false },
    ],
  })
  const res = await route.GET()
  eq(res.body.pending.map(p => p.id), ['tango-app', 'victor-app', 'nounit-app'])
  assert.equal(res.body.scope, 'all')
  assert.equal(res.body.canReopen, true)
  eq(res.body.declined.map(d => [d.id, d.reason, d.declined_by_name]), [['d1', 'Not known to the unit', 'Tango Head']])
  assert.equal(res.body.declinedFailed, false)
})

test('GET: Command (no head row) may reopen but sees no pending signups', async () => {
  const { route } = approvalsRoute({ caller: active({ role: 'command' }), pending: applicants, applicantUnits })
  const res = await route.GET()
  assert.equal(res.status, 200)
  assert.equal(res.body.scope, 'none')
  eq(res.body.pending, [])
  assert.equal(res.body.canReopen, true)
})

test('GET: a failed membership read refuses a head instead of guessing', async () => {
  const { route } = approvalsRoute({ caller: active({ role: 'head_tango_oscar' }), membershipError: { message: 'timeout' }, pending: applicants, applicantUnits })
  assert.equal((await route.GET()).status, 503)
})

test('POST: decline needs a reason and goes through decide_signup as the approver', async () => {
  const flow = approvalsRoute({ caller: active({ role: 'viewer' }), memberships: [head('tango')], applicantUnits })
  assert.equal((await flow.post({ officerId: 'tango-app', decision: 'decline' })).status, 400)
  assert.equal(flow.rpcCalls.length, 0)

  const res = await flow.post({ officerId: 'tango-app', decision: 'decline', reason: '  Not known to the unit ' })
  assert.equal(res.status, 200)
  assert.equal(res.body.activation_status, 'declined')
  eq(flow.rpcCalls, [{ name: 'decide_signup', args: { target_user: 'tango-app', signup_decision: 'decline', decision_reason: 'Not known to the unit' } }])

  assert.equal((await flow.post({ officerId: 'victor-app', decision: 'decline', reason: 'Other unit' })).status, 403)
  assert.equal((await flow.post({ officerId: 'nounit-app' })).status, 403)
  assert.equal((await flow.post({ officerId: 'tango-app', decision: 'reopen' })).status, 403, 'heads cannot reopen')
  assert.equal(flow.rpcCalls.length, 1)
})

test('POST: admins approve anyone, Command reopens, and database refusals keep their meaning', async () => {
  const admin = approvalsRoute({ caller: active({ role: 'vice_captain' }), applicantUnits })
  assert.equal((await admin.post({ officerId: 'nounit-app' })).status, 200)
  assert.equal(admin.rpcCalls[0].args.signup_decision, 'approve')

  const command = approvalsRoute({ caller: active({ role: 'command' }) })
  assert.equal((await command.post({ officerId: 'd1', decision: 'reopen' })).status, 200)
  assert.equal(command.rpcCalls[0].args.signup_decision, 'reopen')
  assert.equal((await command.post({ officerId: 'tango-app', decision: 'approve' })).status, 403)

  const stale = approvalsRoute({ caller: active({ role: 'admin' }), rpcError: { code: '55000', message: 'This signup is no longer pending' } })
  const conflict = await stale.post({ officerId: 'tango-app', decision: 'approve' })
  eq([conflict.status, conflict.body.error], [409, 'This signup is no longer pending'])

  const missing = approvalsRoute({ caller: active({ role: 'admin' }), rpcError: { code: 'PGRST202', message: 'Could not find the function public.decide_signup' } })
  const unavailable = await missing.post({ officerId: 'tango-app' })
  assert.equal(unavailable.status, 503)
  assert.doesNotMatch(unavailable.body.error, /PGRST|function/)
})

// ─── login, signup and toggle-activation routes ────────────────────────────

function loginRoute(profile) {
  let signedOut = false
  const client = {
    auth: {
      signInWithPassword: async () => ({ data: { user: { id: 'u1', email: 'person@x.test' } }, error: null }),
      signOut: async () => { signedOut = true },
    },
    ...fakeDb(() => ({ data: profile, error: null })),
  }
  const route = compile('app/api/auth/login/route.ts', {
    'next/server': nextServer,
    '@/lib/supabase/server': { createClient: async () => client },
    '@/lib/supabase/request-timeout': { isSupabaseRequestTimeout: () => false },
    '@/lib/security/rate-limit': { checkRateLimit: async () => ({ success: true }) },
    '@/lib/platform-owner': { isPermanentOwnerEmail: () => false },
    '@sentry/nextjs': { captureException() {} },
    '@/lib/monitoring/sentry-shared': { supabaseErrorCodeTag: code => code },
    '@/lib/utils': utils,
  })
  return { run: () => route.POST({ json: async () => ({ email: 'person@x.test', password: 'pw' }) }), signedOut: () => signedOut }
}

test('login tells a declined person their signup was not approved', async () => {
  const declined = loginRoute({ activation_status: 'declined', is_active: false, role: 'viewer' })
  const res = await declined.run()
  assert.equal(res.status, 403)
  assert.equal(res.body.error, 'Your sign-up was not approved. Contact your unit head.')
  assert.equal(declined.signedOut(), true)
  assert.equal((await loginRoute({ activation_status: 'pending', is_active: false }).run()).body.error, 'Your account is awaiting admin approval.')
  assert.match((await loginRoute({ activation_status: 'deactivated', is_active: false }).run()).body.error, /inactive or restricted/)
  assert.equal((await loginRoute({ activation_status: 'active', is_active: true }).run()).status, 200)
})

function signupRoute(existingStatus, oscar = 'Tango Oscar', fullName = 'Person') {
  const writes = []
  let created = 0
  const admin = {
    auth: { admin: {
      createUser: async () => { created += 1; return existingStatus ? { data: {}, error: { code: 'email_exists' } } : { data: { user: { id: 'new' } }, error: null } },
      deleteUser: async () => ({}),
    } },
    ...fakeDb(q => q.table === 'users' && q.op === 'select' ? { data: existingStatus ? { activation_status: existingStatus } : null, error: null } : { data: null, error: null }, writes),
  }
  const route = compile('app/api/auth/signup/route.ts', {
    'next/server': nextServer,
    '@/lib/supabase/server': { createClient: async () => ({}) },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/security/rate-limit': { checkRateLimit: async () => ({ success: true }) },
    '@/lib/utils': utils,
  })
  return { run: () => route.POST({ json: async () => ({ email: 'Person@X.test', password: 'secret1', full_name: fullName, ...(oscar ? { oscar } : {}) }) }), writes, created: () => created }
}

test('signing up again with a declined email gives the same clear message and creates nothing', async () => {
  const declined = signupRoute('declined')
  const res = await declined.run()
  eq([res.status, res.body.error], [403, 'Your sign-up was not approved. Contact your unit head.'])
  assert.equal(declined.writes.filter(q => q.op === 'insert').length, 0)
  const taken = await signupRoute('active').run()
  eq([taken.status, taken.body.error], [409, 'An account already uses this email address.'])
  const fresh = signupRoute(null)
  assert.equal((await fresh.run()).status, 200)
  assert.equal(fresh.writes.find(q => q.op === 'insert').payload[0].activation_status, 'pending')
  assert.equal(fresh.writes.find(q => q.op === 'insert').payload[0].oscar, 'Tango Oscar')
})

test('a signup with no unit stores no Oscar, so its initials cannot spell a unit', async () => {
  // 'Tobi Ade Nnamdi Gbenga Obi' used to become OSCAR-TANGO-VIEWER, which the
  // membership sync read as Tango.
  const noUnit = signupRoute(null, null, 'Tobi Ade Nnamdi Gbenga Obi')
  const res = await noUnit.run()
  assert.equal(res.status, 200)
  assert.equal(noUnit.writes.find(q => q.op === 'insert').payload[0].oscar, null)
  assert.equal(res.body.user.oscar, null)
  const src = fs.readFileSync('app/api/auth/signup/route.ts', 'utf8')
  assert.doesNotMatch(src, /OSCAR-\$\{/)
})

function toggleRoute(targetStatus) {
  const writes = [], rpcCalls = []
  const session = {
    auth: { getUser: async () => ({ data: { user: { id: 'admin1' } }, error: null }) },
    ...fakeDb(() => ({ data: { role: 'admin', has_admin_access: false, activation_status: 'active', is_active: true }, error: null })),
  }
  const admin = {
    ...fakeDb(q => {
      if (q.op === 'update') return { data: { id: 'o1', ...q.payload }, error: null }
      if (q.op === 'insert') return { error: null }
      if (q.table === 'signup_decisions') return { data: { reason: 'Not known to the unit' }, error: null }
      return { data: { role: 'viewer', has_admin_access: false, email: 'o@x.test', is_directory_hidden: false, activation_status: targetStatus }, error: null }
    }, writes),
    rpc: async (name, args) => { rpcCalls.push({ name, args }); return { error: null } },
  }
  const route = compile('app/api/officers/toggle-activation/route.ts', {
    'next/server': nextServer,
    '@/lib/supabase/server': { createClient: async () => session },
    '@supabase/supabase-js': { createClient: () => admin },
    '@/lib/utils': utils,
    '@/lib/platform-owner': { isPermanentOwnerEmail: () => false },
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://x.test', SUPABASE_SERVICE_ROLE_KEY: 'service' } } })
  return { run: (activeWanted, extra = {}) => route.POST({ json: async () => ({ officerId: 'o1', active: activeWanted, ...extra }) }), writes, rpcCalls }
}

test('toggle-activation writes a valid status, revokes sessions, and records approvals', async () => {
  const off = toggleRoute('active')
  const res = await off.run(false)
  assert.equal(res.status, 200)
  assert.equal(res.body.activation_status, 'deactivated')
  eq(off.writes.find(q => q.op === 'update').payload, { is_active: false, activation_status: 'deactivated' })
  eq(off.rpcCalls, [{ name: 'revoke_user_sessions', args: { target_user: 'o1' } }])

  // One tap must not silently override a recorded decline: 409 with the reason.
  const tapDeclined = toggleRoute('declined')
  const refused = await tapDeclined.run(true)
  eq([refused.status, refused.body.code, refused.body.reason], [409, 'signup_declined', 'Not known to the unit'])
  assert.match(refused.body.error, /declined \(reason: Not known to the unit\)\. Reopen it on the Approvals page/)
  assert.equal(tapDeclined.writes.filter(q => q.op === 'update' || q.op === 'insert').length, 0)

  // A client that confirmed it with the admin says so explicitly.
  const approveDeclined = toggleRoute('declined')
  assert.equal((await approveDeclined.run(true, { overrideDecline: true })).body.activation_status, 'active')
  const audit = approveDeclined.writes.find(q => q.table === 'signup_decisions')
  eq(audit.payload, { user_id: 'o1', decision: 'approved', decided_by: 'admin1' })
  assert.equal(approveDeclined.rpcCalls.length, 0)

  const approvePending = toggleRoute('pending')
  assert.equal((await approvePending.run(true)).body.activation_status, 'active', 'pending needs no override')
  assert.equal(approvePending.writes.filter(q => q.table === 'signup_decisions').length, 1)

  const reactivate = toggleRoute('deactivated')
  await reactivate.run(true)
  assert.equal(reactivate.writes.filter(q => q.table === 'signup_decisions').length, 0, 'reactivation is not a signup decision')
})

test('toggle-activation never takes a signup out of the decision flow without an audit row', async () => {
  // Declined is already inactive: success, no overwrite, so it stays in the
  // Declined list and can still be reopened.
  const declined = toggleRoute('declined')
  const res = await declined.run(false)
  eq([res.status, res.body.activation_status, res.body.is_active], [200, 'declined', false])
  assert.equal(declined.writes.filter(q => q.op === 'update' || q.op === 'insert').length, 0)
  // Pending must be declined on Approvals (with a reason).
  const pending = toggleRoute('pending')
  const refused = await pending.run(false)
  assert.equal(refused.status, 409)
  assert.match(refused.body.error, /Approvals page/)
  assert.equal(pending.writes.filter(q => q.op === 'update' || q.op === 'insert').length, 0)
  assert.equal(pending.rpcCalls.length, 0)
})

test('the migration adds the status, an append-only audit table and the decision functions', () => {
  const sql = fs.readFileSync('supabase/migrations/20261116183000_signup_decisions.sql', 'utf8')
  assert.match(sql, /'deactivated'::text, 'declined'::text/)
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /signup_decisions_declined_needs_reason CHECK \(decision <> 'declined' OR reason IS NOT NULL\)/)
  assert.match(sql, /USING \(public\.is_admin\(\)\)/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.revoke_user_sessions\(uuid\) FROM PUBLIC, anon, authenticated/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.decide_signup\(uuid, text, text\) FROM PUBLIC, anon/)
  for (const fn of ['decide_signup', 'can_decide_signup', 'revoke_user_sessions']) {
    assert.match(sql, new RegExp(`FUNCTION public\\.${fn}\\([^)]*\\)\\s*RETURNS[\\s\\S]*?SECURITY DEFINER\\s*SET search_path = public, pg_temp`), fn)
  }
  assert.doesNotMatch(sql, /^\s*(BEGIN|COMMIT)\s*;/im)
  // decided_by ON DELETE SET NULL runs as an UPDATE: the append-only trigger lets that one change through.
  assert.match(sql, /NEW\.decided_by IS NULL\s+AND OLD\.decided_by IS NOT NULL/)
  assert.match(sql, /NOT EXISTS \(SELECT 1 FROM public\.users WHERE id = OLD\.decided_by\)/)
})

// ─── Approvals page gate ───────────────────────────────────────────────────

async function approvalsGate({ caller, memberships = [], membershipError = null, signedIn = true }) {
  const session = {
    auth: { getUser: async () => ({ data: { user: signedIn ? { id: 'caller' } : null } }) },
    ...fakeDb(q => {
      if (q.table === 'users') return { data: caller, error: null }
      if (q.table === 'unit_memberships') return { data: membershipError ? null : memberships.map(m => ({ access_level: m.access_level, status: 'active', units: { slug: m.slug } })), error: membershipError }
      return { data: null, error: null }
    }),
  }
  class Redirect extends Error { constructor(to) { super(to); this.to = to } }
  const page = compile('app/(dashboard)/approvals/page.tsx', {
    'next/navigation': { redirect: to => { throw new Redirect(to) } },
    '@/lib/supabase/server': { createClient: async () => session },
    '@/lib/utils': utils,
    '@/lib/program-additions': compile('lib/program-additions.ts'),
    '@/lib/unit-access': unitAccess,
    './ApprovalsClient': { default: function ApprovalsClient() { return null } },
  })
  try {
    await page.default()
    return 'allowed'
  } catch (error) {
    if (error instanceof Redirect) return error.to
    throw error
  }
}

test('Approvals page admits admins, Command and unit heads by membership, and nobody else', async () => {
  assert.equal(await approvalsGate({ caller: active({ role: 'admin' }) }), 'allowed')
  assert.equal(await approvalsGate({ caller: active({ role: 'viewer', has_admin_access: true }) }), 'allowed')
  // Command without a head row reaches the page to reopen declined signups.
  assert.equal(await approvalsGate({ caller: active({ role: 'command' }) }), 'allowed')
  assert.equal(await approvalsGate({ caller: active({ role: 'head_of_operations' }) }), 'allowed')
  assert.equal(await approvalsGate({ caller: active({ role: 'head_of_command' }) }), 'allowed')
  // A curated head row counts even without a head role.
  assert.equal(await approvalsGate({ caller: active({ role: 'viewer' }), memberships: [head('tango')] }), 'allowed')
  // A plain member, or "Head" Oscar text, does not.
  assert.equal(await approvalsGate({ caller: active({ role: 'viewer', oscar: 'Head Tango Oscar' }), memberships: [member('tango')] }), '/dashboard')
  // A head role whose head row was removed is not a head any more.
  assert.equal(await approvalsGate({ caller: active({ role: 'head_tango_oscar' }), memberships: [member('tango')] }), '/dashboard')
  // If the rows cannot be read, the head role still opens the page (the API re-checks every decision).
  assert.equal(await approvalsGate({ caller: active({ role: 'head_tango_oscar' }), membershipError: { message: 'timeout' } }), 'allowed')
  // Inactive, declined and signed-out callers never get in.
  assert.equal(await approvalsGate({ caller: active({ role: 'admin', activation_status: 'declined', is_active: false }) }), '/dashboard')
  assert.equal(await approvalsGate({ caller: null }), '/dashboard')
  assert.equal(await approvalsGate({ caller: null, signedIn: false }), '/login?next=%2Fapprovals')
})

// ─── Approvals page (jsdom) ────────────────────────────────────────────────

let JSDOM
try { ({ JSDOM } = require(process.env.FORM_DOM_RUNTIME || path.resolve('.next/form-ui-qa/node_modules/jsdom'))) } catch {}

test('Approvals page: decline needs a reason, removes the card at once, keeps the reason on a refusal, and admins can reopen', { skip: !JSDOM }, async t => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://tcnp.example/approvals', pretendToBeVisual: true })
  const previous = new Map()
  for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'Event', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'MutationObserver', 'Node', 'CustomEvent', 'IS_REACT_ACT_ENVIRONMENT']) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'window' ? dom.window : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] })
  }
  const React = require('react'), { act } = React, { createRoot } = require('react-dom/client'), { QueryClient, QueryClientProvider } = require('@tanstack/react-query')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } })

  const state = {
    pending: [
      { id: 'a1', full_name: 'Ada Tango', email: 'ada@x.test', phone: null, oscar: 'Tango Oscar', team: null, photo_url: null, created_at: '2026-11-15T10:00:00Z' },
      { id: 'b2', full_name: 'Ben Tango', email: 'ben@x.test', phone: null, oscar: 'Tango Oscar', team: null, photo_url: null, created_at: '2026-11-14T10:00:00Z' },
    ],
    declined: [{ id: 'c3', full_name: 'Cy Declined', email: 'cy@x.test', oscar: 'Victor Oscar', reason: 'Duplicate account', declined_at: '2026-11-10T10:00:00Z', declined_by_name: 'Victor Head' }],
  }
  const posts = [], messages = []
  let holdPost = null
  let failPost = null
  const fetchMock = async (url, options = {}) => {
    if (options.method === 'POST') {
      const body = JSON.parse(options.body)
      posts.push(body)
      if (holdPost) await holdPost
      if (failPost) { const failure = failPost; failPost = null; return { ok: false, status: failure.status, json: async () => ({ error: failure.error }) } }
      if (body.decision === 'decline') state.pending = state.pending.filter(p => p.id !== body.officerId)
      if (body.decision === 'reopen') state.declined = state.declined.filter(p => p.id !== body.officerId)
      return { ok: true, status: 200, json: async () => ({ success: true }) }
    }
    return { ok: true, status: 200, json: async () => ({ pending: state.pending, scope: 'all', canReopen: true, declined: state.declined, declinedFailed: false }) }
  }
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, fetch: fetchMock }
  const cache = new Map()
  const imports = new Proxy({}, {
    has: () => true,
    get(_, name) {
      if (name === '@/lib/notify') return { notifyError: (_, message) => messages.push(message), UserFacingError: Error }
      if (name === 'sonner') return { toast: { success: message => messages.push(message), error: message => messages.push(message) } }
      if (name === '@/components/providers/ConfirmProvider') return { useConfirm: () => async () => true }
      if (name === '@/components/programs/ProgramAdditionApprovals') return { __esModule: true, default: ({ emptyFallback }) => emptyFallback ?? null }
      if (name === '@/lib/utils') return utils
      if (name.startsWith('@/')) return load(`${name.slice(2)}.tsx`)
      return require(name)
    },
  })
  function load(file) {
    if (!cache.has(file)) cache.set(file, compile(fs.existsSync(file) ? file : file.replace(/\.tsx$/, '.ts'), imports, globals))
    return cache.get(file)
  }
  const Page = load('app/(dashboard)/approvals/ApprovalsClient.tsx').default
  const root = createRoot(dom.window.document.getElementById('root'))
  t.after(async () => {
    await act(async () => root.unmount())
    queryClient.clear()
    dom.window.close()
    for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name] }
  })
  const settle = async () => { for (let i = 0; i < 5; i += 1) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) }) }
  await act(async () => root.render(React.createElement(QueryClientProvider, { client: queryClient }, React.createElement(Page))))
  await settle()
  const doc = dom.window.document
  const byLabel = label => doc.querySelector(`[aria-label="${label}"]`)
  const text = () => doc.body.textContent

  await t.test('cards show Approve and Decline with accessible names', () => {
    assert.ok(byLabel('Approve Ada Tango') && byLabel('Decline Ada Tango'))
    assert.ok(text().includes('Declined (last 30 days) · 1'))
  })

  await t.test('decline opens a dialog that refuses an empty reason', async () => {
    await act(async () => byLabel('Decline Ada Tango').click())
    const dialog = doc.querySelector('[role="dialog"]')
    assert.ok(dialog && dialog.textContent.includes('Decline Ada Tango?'))
    const submit = [...dialog.querySelectorAll('button')].find(b => b.textContent.includes('Decline signup'))
    await act(async () => submit.click())
    assert.equal(posts.length, 0)
    assert.equal(doc.getElementById('decline-reason').getAttribute('aria-invalid'), 'true')
    assert.match(doc.getElementById('decline-reason-help').textContent, /at least 3 characters/)
  })

  await t.test('a reasoned decline removes the card before the server answers', async () => {
    let release
    holdPost = new Promise(resolve => { release = resolve })
    const textarea = doc.getElementById('decline-reason')
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set
    await act(async () => { setter.call(textarea, '  Not known to the unit '); textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true })) })
    const submit = [...doc.querySelectorAll('[role="dialog"] button')].find(b => b.textContent.includes('Decline signup'))
    await act(async () => submit.click())
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
    eq(posts.at(-1), { officerId: 'a1', decision: 'decline', reason: 'Not known to the unit' })
    assert.equal(byLabel('Approve Ada Tango'), null, 'removed optimistically')
    assert.ok(byLabel('Approve Ben Tango'))
    // The dialog stays open (and cannot be dismissed) until the server answers.
    const dialog = doc.querySelector('[role="dialog"]')
    assert.ok(dialog, 'dialog stays open while pending')
    assert.ok(dialog.textContent.includes('Declining'))
    release(); holdPost = null
    await settle()
    assert.equal(doc.querySelector('[role="dialog"]'), null, 'closes on success')
    assert.ok(messages.some(m => /declined/.test(m)))
  })

  await t.test('a refused decline brings the card back and keeps the dialog, the reason and the message', async () => {
    await act(async () => byLabel('Decline Ben Tango').click())
    const textarea = doc.getElementById('decline-reason')
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set
    await act(async () => { setter.call(textarea, 'A long careful reason'); textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true })) })
    failPost = { status: 403, error: 'You can only decide signups for your own unit' }
    const submit = [...doc.querySelectorAll('[role="dialog"] button')].find(b => b.textContent.includes('Decline signup'))
    await act(async () => submit.click())
    await settle()
    assert.ok(doc.querySelector('[role="dialog"]'), 'dialog still open')
    assert.equal(doc.getElementById('decline-reason').value, 'A long careful reason')
    assert.match(doc.querySelector('[role="alert"]').textContent, /own unit/)
    assert.ok(byLabel('Approve Ben Tango'), 'card restored')
    const cancel = [...doc.querySelectorAll('[role="dialog"] button')].find(b => b.textContent.trim() === 'Cancel')
    await act(async () => cancel.click())
    await settle()
    assert.equal(doc.querySelector('[role="dialog"]'), null)
  })

  await t.test('a decline that someone else already decided (409) closes the dialog with a message', async () => {
    await act(async () => byLabel('Decline Ben Tango').click())
    const textarea = doc.getElementById('decline-reason')
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set
    await act(async () => { setter.call(textarea, 'Another careful reason'); textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true })) })
    failPost = { status: 409, error: 'This signup is no longer pending' }
    const before = messages.length
    const submit = [...doc.querySelectorAll('[role="dialog"] button')].find(b => b.textContent.includes('Decline signup'))
    await act(async () => submit.click())
    await settle()
    assert.equal(doc.querySelector('[role="dialog"]'), null, 'dialog closed')
    assert.ok(messages.slice(before).some(m => /already decided/.test(m)))
  })

  await t.test('admins reopen a declined signup from the collapsed list', async () => {
    const reopenButton = byLabel("Reopen Cy Declined's signup")
    assert.ok(reopenButton)
    assert.ok(text().includes('Duplicate account') && text().includes('by Victor Head'))
    await act(async () => reopenButton.click())
    await settle()
    eq(posts.at(-1), { officerId: 'c3', decision: 'reopen' })
    assert.equal(byLabel("Reopen Cy Declined's signup"), null)
  })
})
