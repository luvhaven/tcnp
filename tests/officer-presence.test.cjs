const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function load(path, imports = {}) {
  const mod = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, {
    module: mod, exports: mod.exports, console,
    require: name => name in imports ? imports[name] : require(name),
  })
  return mod.exports
}

const utils = load('lib/utils.ts')
const presence = load('lib/presence.ts')
const { isOfficerOnline, OFFICER_ONLINE_WINDOW_MS } = presence
const now = Date.parse('2026-10-25T12:00:00Z')
const live = { id: 'online', is_online: true, last_seen: new Date(now - 30_000).toISOString(), activation_status: 'active', is_active: true }

test('online means a recent signed-in heartbeat, independently of GPS and programme assignment', () => {
  assert.equal(isOfficerOnline(live, now), true)
  assert.equal(isOfficerOnline({ ...live, last_seen: new Date(now - OFFICER_ONLINE_WINDOW_MS).toISOString() }, now), true)
  for (const patch of [
    { is_online: false }, { activation_status: 'pending' }, { activation_status: 'inactive' },
    { is_active: false }, { last_seen: null }, { last_seen: 'invalid' },
    { last_seen: new Date(now + 30_000).toISOString() },
    { last_seen: new Date(now - OFFICER_ONLINE_WINDOW_MS - 1).toISOString() },
  ]) assert.equal(isOfficerOnline({ ...live, ...patch }, now), false, JSON.stringify(patch))
})

function directory(caller, signedIn = true) {
  let adminReads = 0
  const filters = []
  const users = [
    { ...live, last_seen: new Date().toISOString() },
    { ...live, id: 'signed-out', is_online: false, last_seen: new Date().toISOString() },
    { ...live, id: 'stale', last_seen: new Date(Date.now() - OFFICER_ONLINE_WINDOW_MS - 1000).toISOString() },
  ]
  const callerQuery = {
    select() { return this }, eq() { return this },
    maybeSingle: async () => ({ data: caller, error: null }),
  }
  const server = {
    auth: { getUser: async () => ({ data: { user: signedIn ? { id: 'caller', user_metadata: { role: 'admin' } } : null } }) },
    from: () => callerQuery,
  }
  const admin = {
    from(table) {
      adminReads++
      if (table === 'users') return {
        select() { return this },
        eq(key, value) { filters.push([key, value]); return this },
        order: async () => ({ data: users, error: null }),
      }
      if (table === 'current_title_assignments') return { select: async () => ({ data: [], error: null }) }
      throw Error(`Unexpected table ${table}`)
    },
  }
  const { GET } = load('app/api/officers/list/route.ts', {
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200, headers: options.headers }) } },
    '@/lib/supabase/server': { createClient: async () => server },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/utils': utils,
    '@/lib/presence': presence,
  })
  return { GET, filters, adminReads: () => adminReads }
}

for (const role of utils.PLATFORM_ADMIN_ROLES) {
  test(`${role} can see the officer directory and current online status without changing roles`, async () => {
    const route = directory({ role, activation_status: 'active', is_active: true })
    const response = await route.GET()
    assert.equal(response.status, 200)
    assert.equal(response.headers['Cache-Control'], 'private, no-store')
    assert.equal(response.body.officers[0].is_online, true)
    assert.equal(response.body.officers[0].is_active, false, 'programme assignment must not decide presence')
    assert.equal(response.body.officers[1].is_online, false)
    assert.equal(response.body.officers[2].is_online, false)
    assert.deepEqual(route.filters, [['is_directory_hidden', false]])
  })
}

test('ordinary roles, suspended leaders and forged metadata cannot reach the service-role directory read', async () => {
  for (const caller of [
    { role: 'head_victor_oscar', activation_status: 'active', is_active: true },
    { role: 'command', activation_status: 'active', is_active: true },
    { role: 'captain', activation_status: 'pending', is_active: true },
    { role: 'vice_captain', activation_status: 'active', is_active: false },
    null,
  ]) {
    const route = directory(caller)
    assert.equal((await route.GET()).status, 403)
    assert.equal(route.adminReads(), 0)
  }
  const anonymous = directory(null, false)
  assert.equal((await anonymous.GET()).status, 401)
  assert.equal(anonymous.adminReads(), 0)
})

test('leadership navigation exposes every Admin destination, including Command and Approvals', () => {
  const { getVisibleNav } = load('components/layout/nav-config.ts', { '@/lib/utils': utils })
  const expected = Array.from(getVisibleNav('admin'), entry => entry.href).sort()
  for (const role of ['head_of_command', 'captain', 'vice_captain']) {
    assert.deepEqual(Array.from(getVisibleNav(role), entry => entry.href).sort(), expected, role)
  }
  assert.ok(expected.includes('/command'))
  assert.ok(expected.includes('/approvals'))
  assert.ok(expected.includes('/officers'))
})

test('database authorization mirrors leadership ranks and only trusts active profile roles', () => {
  const sql = fs.readFileSync('supabase/migrations/20261025150000_leadership_admin_privileges.sql', 'utf8')
  for (const role of utils.PLATFORM_ADMIN_ROLES) {
    assert.match(sql, new RegExp(`WHEN '${role}' THEN ${utils.platformAuthorityRank(role)}`))
  }
  assert.match(sql, /ARRAY\[u\.role, 'admin'::public\.user_role\]/)
  assert.match(sql, /u\.id = auth\.uid\(\)/)
  assert.match(sql, /coalesce\(u\.is_active, false\) = true/)
  assert.match(sql, /u\.activation_status = 'active'/)
  assert.doesNotMatch(sql, /user_metadata|UPDATE public\.users/i)
  assert.match(sql, /ON public\.audit_logs/)
  assert.match(sql, /ON public\.noscar_assignments/)
})
