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
    module: mod, exports: mod.exports, URL, URLSearchParams,
    console: { error() {}, warn() {} },
    require: name => name in imports ? imports[name] : require(name),
  })
  return mod.exports
}

const utils = load('lib/utils.ts')
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const PROGRAM = id(1), PAPA = id(2), MESSAGE = id(3), CALLER = id(4), AUTHOR = id(5)
const MEMBER = id(6), PAPA_MEMBER = id(7), EXECUTIVE = id(8), OUTSIDER = id(9)

function api(options = {}) {
  const config = {
    signedIn: true, role: 'tango_oscar', active: true, status: 'active', allowed: true,
    message: { id: MESSAGE, sender_id: CALLER, content: 'Room message', mentions: [], created_at: new Date(Date.now() - 1000).toISOString(), deleted_at: null, is_archived: false, is_private: false, program_id: PROGRAM, papa_id: null, team: null, flagged: false, flagged_by: null },
    recipients: [], memberships: [], deleteIds: [], existing: 0,
    ...options,
  }
  const calls = []
  const writes = []
  const rpcCalls = []
  const notifications = new Map()
  let adminCreated = 0
  function result(kind, table, query) {
    calls.push({ kind, table, ...query })
    if (query.action !== 'select') {
      writes.push({ kind, table, ...query })
      if (table === 'notifications') {
        for (const row of query.value) if (!notifications.has(row.id)) notifications.set(row.id, row)
      }
      if (config.failReactions && table === 'message_reactions') return { error: { message: 'private database failure' } }
      return { data: null, error: null }
    }
    if (kind === 'auth' && table === 'users') return { data: config.profileMissing ? null : { id: CALLER, role: config.role, is_active: config.active, activation_status: config.status, team: config.team ?? null, is_team_head: config.isTeamHead ?? false }, error: null }
    if (table === 'chat_messages') {
      if (query.columns === 'id') {
        const [start, end] = query.range ?? [0, 499]
        return { data: config.deleteIds.slice(start, end + 1).map(id => ({ id })), error: null }
      }
      return { data: config.message, error: null }
    }
    if (table === 'notifications') return { count: config.existing, error: null }
    let data = table === 'users' ? config.recipients : table === 'chat_room_memberships' ? config.memberships : []
    for (const [method, key, value] of query.filters) {
      data = data.filter(row => method === 'in' ? value.includes(row[key]) : row[key] === value)
    }
    return { data, error: null }
  }
  function from(kind, table) {
    const query = { action: 'select', filters: [] }
    const builder = {
      select(columns) { query.columns = columns; return this },
      eq(key, value) { query.filters.push(['eq', key, value]); return this },
      is(key, value) { query.filters.push(['is', key, value]); return this },
      in(key, value) { query.filters.push(['in', key, value]); return this },
      lte() { return this }, order() { return this },
      range(start, end) { query.range = [start, end]; return this },
      update(value) { query.action = 'update'; query.value = value; return this },
      delete() { query.action = 'delete'; return this },
      insert(value) { query.action = 'insert'; query.value = value; return this },
      upsert(value, settings) { query.action = 'upsert'; query.value = value; query.settings = settings; return this },
      maybeSingle: async () => result(kind, table, query),
      then(resolve, reject) { return Promise.resolve(result(kind, table, query)).then(resolve, reject) },
    }
    return builder
  }
  const auth = {
    auth: { getUser: async () => ({ data: { user: config.signedIn ? { id: CALLER } : null } }) },
    from: table => from('auth', table),
    rpc: async (name, args) => { rpcCalls.push({ name, args }); return { data: config.allowed, error: config.rpcError ? { message: 'Unavailable' } : null } },
  }
  const imports = {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    '@/lib/supabase/server': { createClient: async () => auth },
    '@/lib/supabase/admin': { createAdminClient: () => { adminCreated++; return { from: table => from('admin', table) } } },
    '@/lib/security/rate-limit': { checkRateLimit: async () => ({ success: !config.rateLimited }) },
    '@/lib/utils': utils,
  }
  const admin = load('app/api/admin/chat/route.ts', imports)
  const mentions = load('app/api/chat/mention-notifications/route.ts', imports)
  const request = (body, search = '') => ({ url: `https://app.test/api/admin/chat${search}`, json: async () => body })
  return { admin, mentions, request, calls, writes, rpcCalls, notifications, adminCreated: () => adminCreated, config }
}

test('anonymous and inactive accounts cannot moderate or notify', async () => {
  for (const options of [{ signedIn: false }, { active: false }, { active: null }, { status: 'pending' }]) {
    const app = api(options)
    const expected = options.signedIn === false ? 401 : 403
    assert.equal((await app.admin.POST(app.request({ action: 'soft_delete', messageId: MESSAGE }))).status, expected)
    assert.equal((await app.admin.DELETE(app.request(null, '?all=true'))).status, expected)
    assert.equal((await app.mentions.POST(app.request({ messageId: MESSAGE }))).status, expected)
    assert.equal(app.adminCreated(), 0)
  }
})

test('legacy Command and HOP roles cannot archive or permanently delete chats', async () => {
  for (const role of ['command', 'head_of_operations', 'head_victor_oscar', 'tango_oscar']) {
    const app = api({ role })
    assert.equal((await app.admin.POST(app.request({ action: 'archive', programId: PROGRAM }))).status, 403)
    assert.equal((await app.admin.DELETE(app.request(null, `?messageId=${MESSAGE}`))).status, 403)
    assert.equal((await app.admin.DELETE(app.request(null, '?all=true'))).status, 403)
    assert.equal(app.adminCreated(), 0)
  }
})

test('Captain and Vice Captain retain moderation access without assigned room membership', async () => {
  for (const role of ['captain', 'vice_captain', 'head_of_command', 'admin']) {
    const app = api({ role, allowed: false, message: { id: MESSAGE, sender_id: AUTHOR, team: 'swift', deleted_at: null } })
    assert.equal((await app.admin.POST(app.request({ action: 'soft_delete', messageId: MESSAGE }))).status, 200)
    assert.equal(app.rpcCalls.length, 0)
    assert.equal(app.writes[0].value.deleted_by_admin, true)
  }
})

test('removed members and unavailable access checks fail before any service-role message operation', async () => {
  for (const options of [{ allowed: false }, { rpcError: true }]) {
    const app = api(options)
    assert.equal((await app.admin.POST(app.request({ action: 'soft_delete', messageId: MESSAGE }))).status, 404)
    assert.equal(app.adminCreated(), 0)
    assert.equal(app.rpcCalls[0].name, 'can_access_chat_message')
    assert.equal(app.rpcCalls[0].args.target_message_id, MESSAGE)
  }
})

test('authors can remove their visible messages; team heads only moderate their own team', async () => {
  const author = api()
  assert.equal((await author.admin.POST(author.request({ action: 'soft_delete', messageId: MESSAGE }))).status, 200)
  assert.equal(author.writes[0].value.deleted_by_admin, false)
  for (const [messageTeam, status] of [['wisdom', 200], ['swift', 403], [null, 403]]) {
    const app = api({ team: 'wisdom', isTeamHead: true, message: { id: MESSAGE, sender_id: AUTHOR, team: messageTeam, deleted_at: null } })
    assert.equal((await app.admin.POST(app.request({ action: 'soft_delete', messageId: MESSAGE }))).status, status)
  }
})

test('chat actions reject ambiguous and malformed scopes and limit Papa operations to that exact room', async () => {
  const app = api({ role: 'captain' })
  for (const body of [{}, { programId: 'bad' }, { papaId: PAPA }, { programId: PROGRAM, team: 'wisdom' }, { team: 'unknown' }, { programId: PROGRAM, all: true }]) {
    assert.equal((await app.admin.POST(app.request({ action: 'archive', ...body }))).status, 400)
  }
  assert.equal(app.adminCreated(), 0)
  assert.equal((await app.admin.POST(app.request({ action: 'archive', programId: PROGRAM, papaId: PAPA }))).status, 200)
  assert.ok(app.writes.at(-1).filters.some(([method, key, value]) => method === 'eq' && key === 'papa_id' && value === PAPA))
  assert.equal((await app.admin.POST(app.request({ action: 'archive', programId: PROGRAM }))).status, 200)
  assert.ok(app.writes.at(-1).filters.some(([method, key, value]) => method === 'is' && key === 'papa_id' && value === null))
  assert.equal((await app.admin.POST(app.request({ action: 'archive', all: true }))).status, 200)
})

test('permanent deletion covers more than one database page and stops on dependency failure', async () => {
  const ids = Array.from({ length: 1001 }, (_, index) => id(index + 100))
  const app = api({ role: 'admin', deleteIds: ids })
  const response = await app.admin.DELETE(app.request(null, '?team=wisdom'))
  assert.equal(response.status, 200)
  assert.equal(response.body.count, 1001)
  assert.equal(app.calls.filter(call => call.table === 'chat_messages' && call.action === 'select').length, 3)
  assert.equal(app.writes.filter(write => write.table === 'chat_messages' && write.action === 'delete').length, 3)
  const broken = api({ role: 'captain', deleteIds: [MESSAGE], failReactions: true })
  const failed = await broken.admin.DELETE(broken.request(null, `?messageId=${MESSAGE}`))
  assert.equal(failed.status, 500)
  assert.doesNotMatch(failed.body.error, /private database failure/)
  assert.equal(broken.writes.some(write => write.table === 'chat_messages' && write.action === 'delete'), false)
})

function recipient(userId, role = 'tango_oscar', team = null) {
  return { id: userId, role, team, is_active: true, activation_status: 'active' }
}

test('program mentions notify only exact program-room members and authorized executives', async () => {
  const app = api({ recipients: [recipient(MEMBER), recipient(PAPA_MEMBER), recipient(OUTSIDER), recipient(EXECUTIVE, 'vice_captain')], memberships: [
    { program_id: PROGRAM, papa_id: null, user_id: MEMBER },
    { program_id: PROGRAM, papa_id: PAPA, user_id: PAPA_MEMBER },
  ] })
  app.config.message.mentions = [MEMBER, PAPA_MEMBER, OUTSIDER, EXECUTIVE, MEMBER.toUpperCase(), CALLER, 'not-a-uuid']
  const response = await app.mentions.POST(app.request({ messageId: MESSAGE, content: 'forged content', mentions: [OUTSIDER] }))
  assert.equal(response.status, 200)
  assert.equal(response.body.recipients, 2)
  assert.deepEqual([...app.notifications.values()].map(row => row.user_id).sort(), [MEMBER, EXECUTIVE].sort())
  assert.equal([...app.notifications.values()][0].message, 'Room message')
})

test('program membership does not grant Papa notifications, including for private mentions', async () => {
  const app = api({ recipients: [recipient(MEMBER), recipient(PAPA_MEMBER), recipient(EXECUTIVE, 'captain')], memberships: [
    { program_id: PROGRAM, papa_id: null, user_id: MEMBER },
    { program_id: PROGRAM, papa_id: PAPA, user_id: PAPA_MEMBER },
  ] })
  Object.assign(app.config.message, { papa_id: PAPA, is_private: true, mentions: [MEMBER, PAPA_MEMBER, EXECUTIVE] })
  const response = await app.mentions.POST(app.request({ messageId: MESSAGE }))
  assert.equal(response.status, 200)
  assert.deepEqual([...app.notifications.values()].map(row => row.user_id).sort(), [PAPA_MEMBER, EXECUTIVE].sort())
  assert.match([...app.notifications.values()][0].metadata.url, new RegExp(`papaId=${PAPA}`))
})

test('team mentions never expose a message to another team or inactive account', async () => {
  const app = api({ recipients: [recipient(MEMBER, 'tango_oscar', 'wisdom'), recipient(OUTSIDER, 'tango_oscar', 'swift'), recipient(EXECUTIVE, 'captain'), { ...recipient(PAPA_MEMBER, 'tango_oscar', 'wisdom'), is_active: false }] })
  Object.assign(app.config.message, { program_id: null, team: 'wisdom', mentions: [MEMBER, OUTSIDER, EXECUTIVE, PAPA_MEMBER] })
  const response = await app.mentions.POST(app.request({ messageId: MESSAGE }))
  assert.equal(response.status, 200)
  assert.deepEqual([...app.notifications.values()].map(row => row.user_id).sort(), [MEMBER, EXECUTIVE].sort())
})

test('revoked, archived, deleted, old and invalid-date messages cannot send notifications', async () => {
  const cases = [
    { allowed: false }, { rpcError: true }, { patch: { is_archived: true } }, { patch: { deleted_at: new Date().toISOString() } },
    { patch: { sender_id: AUTHOR } }, { patch: { created_at: 'bad-date' } }, { patch: { created_at: new Date(Date.now() - 700_000).toISOString() } },
  ]
  for (const options of cases) {
    const app = api({ ...options, recipients: [recipient(MEMBER)] })
    Object.assign(app.config.message, { mentions: [MEMBER] }, options.patch)
    const response = await app.mentions.POST(app.request({ messageId: MESSAGE }))
    assert.ok([404, 409].includes(response.status))
    assert.equal(app.adminCreated(), 0)
    assert.equal(app.notifications.size, 0)
  }
})

test('concurrent mention retries use stable unique ids and ignore duplicate inserts', async () => {
  const app = api({ recipients: [recipient(EXECUTIVE, 'captain')] })
  app.config.message.mentions = [EXECUTIVE]
  const request = () => app.mentions.POST(app.request({ messageId: MESSAGE }))
  const responses = await Promise.all([request(), request()])
  assert.deepEqual(responses.map(response => response.status), [200, 200])
  assert.equal(app.notifications.size, 1)
  const writes = app.writes.filter(write => write.table === 'notifications')
  assert.equal(writes[0].value[0].id, writes[1].value[0].id)
  assert.equal(writes[0].settings.ignoreDuplicates, true)
})
