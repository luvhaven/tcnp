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
    module: mod, exports: mod.exports, URL, console: { error() {} },
    require: name => name in imports ? imports[name] : require(name),
  })
  return mod.exports
}

const utils = load('lib/utils.ts')
const programMembership = load('lib/chat-program-membership.ts')
const access = load('lib/chat-access.ts', { '@/lib/utils': utils })
const json = (body, init = {}) => ({ body, status: init.status ?? 200, headers: init.headers })
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const PROGRAM = id(1), OTHER_PROGRAM = id(2), ARCHIVED = id(3), PAPA = id(4), OTHER_PAPA = id(5)
const CALLER = id(6), MEMBER = id(7), EXECUTIVE = id(8), CANDIDATE = id(9), HIDDEN = id(10), INACTIVE = id(11)
const user = (userId, extra = {}) => ({ id: userId, full_name: userId, role: 'tango_oscar', team: 'strength', is_active: true, activation_status: 'active', is_directory_hidden: false, is_online: false, ...extra })

function app(options = {}) {
  const config = {
    role: 'tango_oscar', allowed: true,
    programs: [{ id: PROGRAM, name: 'Current', status: 'active' }, { id: OTHER_PROGRAM, name: 'Other', status: 'planning' }, { id: ARCHIVED, name: 'Past', status: ' ARCHIVED ' }],
    papas: [{ id: PAPA, full_name: 'First Papa', program_id: PROGRAM, is_deleted: false }, { id: OTHER_PAPA, full_name: 'Other Papa', program_id: OTHER_PROGRAM, is_deleted: false }],
    memberships: [], assignments: [], users: [user(MEMBER), user(EXECUTIVE, { role: 'vice_captain' }), user(CANDIDATE), user(HIDDEN, { is_directory_hidden: true }), user(INACTIVE, { is_active: false })],
    ...options,
  }
  const calls = [], writes = [], rpcCalls = []
  function from(kind, table) {
    const query = { kind, table, filters: [], action: 'select' }
    function result(single = false) {
      calls.push(query)
      if (query.action !== 'select') {
        writes.push(query)
        return { data: null, error: config.writeError ?? null }
      }
      if (config.failTable === table) return { data: null, error: { message: 'Unavailable' } }
      let data = table === 'programs' ? config.programs : table === 'papas' ? config.papas : table === 'users' ? config.users : table === 'current_title_assignments' ? config.assignments : config.memberships
      for (const [op, field, value] of query.filters) {
        data = data.filter(row => op === 'in' ? value.includes(row[field]) : op === 'neq' ? row[field] !== value : row[field] === value)
      }
      if (query.range) data = data.slice(query.range[0], query.range[1] + 1)
      if (query.columns && query.columns !== '*') {
        const fields = query.columns.split(',').map(field => field.trim())
        data = data.map(row => Object.fromEntries(fields.filter(field => field in row).map(field => [field, row[field]])))
      }
      return { data: single ? data[0] ?? null : data, error: null }
    }
    return {
      select(columns) { query.columns = columns; return this }, order() { return this }, limit() { return this },
      eq(field, value) { query.filters.push(['eq', field, value]); return this },
      neq(field, value) { query.filters.push(['neq', field, value]); return this },
      is(field, value) { query.filters.push(['is', field, value]); return this },
      in(field, value) { query.filters.push(['in', field, value]); return this },
      range(start, end) { query.range = [start, end]; return this },
      insert(value) { query.action = 'insert'; query.value = value; return this },
      delete() { query.action = 'delete'; return this },
      maybeSingle: async () => result(true),
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject) },
    }
  }
  const db = { from: table => from('service', table) }
  const auth = {
    from: table => from('auth', table),
    rpc: async (name, args) => { rpcCalls.push({ name, args }); return { data: config.allowed, error: config.rpcError ? { message: 'Unavailable' } : null } },
  }
  const next = { NextResponse: { json } }
  const server = load('lib/chat-server.ts', {
    'next/server': next, '@/lib/chat-access': access,
    '@/lib/supabase/server': {}, '@/lib/supabase/admin': {},
  })
  const imports = {
    'next/server': next, '@/lib/utils': utils, '@/lib/chat-access': access,
    '@/lib/chat-program-membership': programMembership,
    '@/lib/chat-server': {
      ...server,
      getChatCaller: async () => config.callerError
        ? { error: json({ error: 'Denied' }, { status: config.callerError }) }
        : { auth, db, profile: { id: CALLER, role: config.role, team: 'strength' }, canManageMembers: utils.isPlatformAdministrator(config.role) },
    },
    '@/lib/presence': { isOfficerOnline: user => user.is_online === true },
    '@/lib/security/rate-limit': { checkRateLimit: async () => ({ success: !config.rateLimited }) },
  }
  const rooms = load('app/api/chat/rooms/route.ts', imports)
  const members = load('app/api/chat/room-members/route.ts', imports)
  const request = (body, query = `?programId=${PROGRAM}`) => ({ url: `https://app.test/api/chat/room-members${query}`, json: async () => body })
  return { rooms, members, request, calls, writes, rpcCalls, config }
}

test('scope parsing requires exactly one valid room and rejects orphan Papa or mixed team/program', () => {
  for (const scope of [{}, { papaId: PAPA }, { programId: 'malformed' }, { programId: PROGRAM, papaId: 4 }, { programId: PROGRAM, team: 'strength' }, { team: 'unknown' }, { team: ['strength'] }]) {
    assert.equal(access.parseChatRoomScope(scope), null)
  }
  assert.equal(access.getChatRoomId(access.parseChatRoomScope({ programId: PROGRAM })), `program:${PROGRAM}`)
  assert.equal(access.getChatRoomId(access.parseChatRoomScope({ programId: PROGRAM, papaId: PAPA })), `papa:${PAPA}`)
  assert.equal(access.getChatRoomId(access.parseChatRoomScope({ team: 'strength' })), 'team:strength')
  for (const scope of [{ status: 'archived' }, { status: ' ARCHIVED ' }, { status: 'active', is_archived: true }, { status: 'active', is_deleted: true }]) assert.equal(access.isChatProgramOpen(scope), false)
})

test('only Captain and Vice Captain carry Executive labels while other implicit managers are Admin', async () => {
  for (const role of ['captain', 'vice_captain', 'admin', 'dev_admin', 'super_admin', 'head_of_command']) {
    const system = app({ role: 'captain', users: [user(EXECUTIVE, { role })] })
    const result = await system.members.GET(system.request(null))
    assert.equal(result.body.members[0].accessType, ['captain', 'vice_captain'].includes(role) ? 'executive' : 'admin')
    assert.equal(utils.privilegedAccessLabel(role), ['captain', 'vice_captain'].includes(role) ? 'Executive access' : 'Admin')
    assert.equal(utils.isPlatformAdministrator(role), true)
  }
})

test('nullable status and deleted flags agree with database open-room rules', async () => {
  const system = app({ role: 'captain', programs: [{ id: PROGRAM, name: 'Open', status: null }], papas: [{ id: PAPA, full_name: 'Available Papa', program_id: PROGRAM, is_deleted: null }] })
  const response = await system.rooms.GET()
  assert.equal(response.status, 200)
  assert.ok(response.body.rooms.some(room => room.id === `program:${PROGRAM}`))
  assert.ok(response.body.rooms.some(room => room.id === `papa:${PAPA}`))
})

test('active program assignments add only the main room; failed assignment checks never grant rooms', async () => {
  const system = app({ assignments: [
    { user_id: CALLER, program_id: PROGRAM, is_active: true },
    { user_id: CALLER, program_id: OTHER_PROGRAM, is_active: false },
    { user_id: CALLER, program_id: ARCHIVED, is_active: true },
  ] })
  const response = await system.rooms.GET()
  assert.equal(response.status, 200)
  assert.deepEqual(Array.from(response.body.rooms, room => room.id), ['team:strength', `program:${PROGRAM}`])
  const failed = app({ failTable: 'current_title_assignments' })
  assert.equal((await failed.rooms.GET()).status, 503)
})

test('main-room member lists include active assigned officers but Papa lists do not inherit them', async () => {
  const system = app({ role: 'captain', assignments: [
    { user_id: MEMBER, program_id: PROGRAM, is_active: true },
    { user_id: INACTIVE, program_id: PROGRAM, is_active: true },
    { user_id: CANDIDATE, program_id: OTHER_PROGRAM, is_active: true },
  ] })
  const main = await system.members.GET(system.request(null))
  assert.equal(main.status, 200)
  assert.equal(main.body.members.find(member => member.id === MEMBER)?.accessType, 'program')
  assert.equal(main.body.members.some(member => member.id === INACTIVE), false)
  assert.equal(main.body.candidates.some(member => member.id === MEMBER), false)
  assert.equal(main.body.candidates.some(member => member.id === CANDIDATE), true)
  const papa = await system.members.GET(system.request(null, `?programId=${PROGRAM}&papaId=${PAPA}`))
  assert.equal(papa.body.members.some(member => member.id === MEMBER), false)
  assert.equal(papa.body.candidates.some(member => member.id === MEMBER), true)
})

test('inherited main-chat members are managed through program assignments; Papa invitations stay independent', async () => {
  const system = app({ role: 'captain', assignments: [{ user_id: MEMBER, program_id: PROGRAM, is_active: true }] })
  const main = { programId: PROGRAM, papaId: null, userId: MEMBER }
  assert.equal((await system.members.POST(system.request(main))).status, 409)
  assert.equal((await system.members.DELETE(system.request(main))).status, 409)
  assert.equal(system.writes.length, 0)
  assert.equal((await system.members.POST(system.request({ ...main, papaId: PAPA }))).status, 200)
  assert.equal(system.writes.length, 1)
  assert.equal(system.writes[0].value.papa_id, PAPA)
})

test('large program rosters are paged and officer lookups use bounded ID batches', async () => {
  const assignedUsers = [user(CALLER), ...Array.from({ length: 1100 }, (_, i) => user(id(1000 + i)))]
  const assignments = assignedUsers.map(officer => ({ user_id: officer.id, program_id: PROGRAM, is_active: true }))
  for (const role of ['captain', 'tango_oscar']) {
    const system = app({ role, assignments, users: [...assignedUsers, user(EXECUTIVE, { role: 'captain' })] })
    const result = await system.members.GET(system.request(null))
    assert.equal(result.status, 200)
    assert.equal(result.body.members.length, 1102)
    assert.equal(result.body.members.filter(member => member.accessType === 'program').length, 1101)
    assert.equal(system.calls.filter(call => call.table === 'current_title_assignments').length, 3)
    for (const call of system.calls.filter(call => call.table === 'users')) {
      for (const [op, field, ids] of call.filters) if (op === 'in' && field === 'id') assert.ok(ids.length <= 100)
    }
  }
})

test('Captain, Vice Captain and Head of Command discover all active rooms without invitations', async () => {
  for (const role of ['captain', 'vice_captain', 'head_of_command']) {
    const api = app({ role })
    const result = await api.rooms.GET()
    assert.equal(result.status, 200)
    assert.equal(result.body.canManageMembers, true)
    assert.deepEqual(Array.from(result.body.rooms, row => row.id).sort(), ['team:strength', 'team:swift', 'team:wisdom', `program:${PROGRAM}`, `program:${OTHER_PROGRAM}`, `papa:${PAPA}`, `papa:${OTHER_PAPA}`].sort())
    assert.equal(api.calls.some(call => call.table === 'chat_room_memberships'), false)
    assert.match(result.headers['Cache-Control'], /private.*no-store/)
  }
})

test('program and Papa invitations grant only the exact invited room, never one another', async () => {
  for (const [memberships, expected] of [
    [[], []],
    [[{ user_id: CALLER, program_id: PROGRAM, papa_id: null }], [`program:${PROGRAM}`]],
    [[{ user_id: CALLER, program_id: PROGRAM, papa_id: PAPA }], [`papa:${PAPA}`]],
    [[{ user_id: CALLER, program_id: PROGRAM, papa_id: OTHER_PAPA }], []],
    [[{ user_id: CALLER, program_id: ARCHIVED, papa_id: null }], []],
    [[{ user_id: MEMBER, program_id: PROGRAM, papa_id: null }], []],
  ]) {
    const api = app({ memberships })
    const result = await api.rooms.GET()
    assert.equal(result.status, 200)
    assert.deepEqual(Array.from(result.body.rooms, row => row.id).sort(), ['team:strength', ...expected].sort())
    assert.equal(api.calls.some(call => /program_assignments|papa_assignments/.test(call.table)), false)
  }
  assert.equal((await app({ failTable: 'chat_room_memberships' }).rooms.GET()).status, 503)
})

test('deleted Papa rooms and archived programs are excluded even for executives', async () => {
  const api = app({ role: 'captain', papas: [{ id: PAPA, program_id: PROGRAM, is_deleted: true }, { id: OTHER_PAPA, program_id: ARCHIVED, is_deleted: false }] })
  const result = await api.rooms.GET()
  assert.equal(result.body.rooms.some(row => row.kind === 'papa' || row.programId === ARCHIVED), false)
})

test('optional archive/delete flags are projected into checks without exposing full program records', async () => {
  for (const flag of ['is_archived', 'is_deleted']) {
    const api = app({ role: 'captain', programs: [{ id: PROGRAM, name: 'Hidden', status: 'active', [flag]: true, confidential_note: 'Server only' }] })
    assert.equal((await api.rooms.GET()).body.rooms.some(room => room.programId === PROGRAM), false)
    assert.equal((await api.members.GET(api.request())).status, 404)
    assert.equal((await api.members.POST(api.request({ programId: PROGRAM, userId: MEMBER }))).status, 404)
    assert.equal(api.writes.length, 0)
  }
  const api = app({ role: 'captain', programs: [{ id: PROGRAM, name: 'Open', status: 'active', confidential_note: 'Server only' }] })
  assert.equal(JSON.stringify((await api.rooms.GET()).body).includes('Server only'), false)
})

test('room-member reads fail closed before service queries when caller lacks exact room access', async () => {
  for (const [options, query, status] of [[{ allowed: false }, `?programId=${PROGRAM}`, 403], [{ rpcError: true }, `?programId=${PROGRAM}`, 503], [{}, `?papaId=${PAPA}`, 400], [{ callerError: 401 }, `?programId=${PROGRAM}`, 401]]) {
    const api = app(options)
    assert.equal((await api.members.GET(api.request(null, query))).status, status)
    assert.equal(api.calls.length, 0)
  }
})

test('ordinary room participants see only exact members and executives, never candidate directory', async () => {
  const api = app({ memberships: [{ program_id: PROGRAM, papa_id: null, user_id: MEMBER }, { program_id: PROGRAM, papa_id: PAPA, user_id: CANDIDATE }] })
  const result = await api.members.GET(api.request())
  assert.deepEqual(Array.from(result.body.members, row => row.id).sort(), [MEMBER, EXECUTIVE].sort())
  assert.equal(result.body.candidates, undefined)
  assert.equal(result.body.canManageMembers, false)
  assert.equal(result.body.members.find(row => row.id === EXECUTIVE).accessType, 'executive')
  assert.equal(api.rpcCalls[0].name, 'can_access_chat_room')
  assert.equal(api.rpcCalls[0].args.target_papa_id, null)
})

test('executive membership management excludes hidden/inactive officers and implicit executives', async () => {
  const api = app({ role: 'vice_captain', memberships: [{ program_id: PROGRAM, papa_id: null, user_id: MEMBER }] })
  const result = await api.members.GET(api.request())
  assert.deepEqual(Array.from(result.body.members, row => row.id).sort(), [MEMBER, EXECUTIVE].sort())
  assert.deepEqual(Array.from(result.body.candidates, row => row.id), [CANDIDATE])
  const teamResult = await api.members.GET(api.request(null, '?team=strength'))
  assert.equal(teamResult.body.canManageMembers, false)
  assert.equal(teamResult.body.candidates, undefined)
})

test('only platform administrators add/remove members and scope validation precedes writes', async () => {
  for (const role of ['tango_oscar', 'command', 'head_of_program', 'head_victor']) {
    for (const action of ['POST', 'DELETE']) {
      const api = app({ role })
      assert.equal((await api.members[action](api.request({ programId: PROGRAM, userId: MEMBER }))).status, 403)
      assert.equal(api.writes.length, 0)
    }
  }
  for (const body of [{ team: 'strength', userId: MEMBER }, { papaId: PAPA, userId: MEMBER }, { programId: PROGRAM, userId: 'bad-id' }, { programId: PROGRAM, userId: EXECUTIVE }, { programId: PROGRAM, userId: HIDDEN }, { programId: PROGRAM, userId: INACTIVE }, { programId: ARCHIVED, userId: MEMBER }, { programId: PROGRAM, papaId: OTHER_PAPA, userId: MEMBER }]) {
    const api = app({ role: 'captain' })
    assert.ok((await api.members.POST(api.request(body))).status >= 400)
    assert.equal(api.writes.length, 0)
  }
})

test('membership mutations run as the caller and preserve exact program/Papa boundaries', async () => {
  for (const papaId of [null, PAPA]) {
    const api = app({ role: 'captain' })
    const body = { programId: PROGRAM, papaId, userId: MEMBER }
    assert.equal((await api.members.POST(api.request(body))).status, 200)
    assert.equal((await api.members.DELETE(api.request(body))).status, 200)
    assert.equal(api.writes.every(write => write.kind === 'auth'), true)
    assert.equal(api.writes[0].value.added_by, CALLER)
    assert.equal(api.writes[0].value.papa_id, papaId)
    assert.equal(api.writes[1].filters.some(([op, key, value]) => op === (papaId ? 'eq' : 'is') && key === 'papa_id' && value === papaId), true)
    assert.equal(api.writes[1].filters.some(([, key, value]) => key === 'program_id' && value === PROGRAM), true)
  }
  assert.equal((await app({ role: 'captain', writeError: { code: '23505' } }).members.POST(app().request({ programId: PROGRAM, userId: MEMBER }))).status, 200)
  assert.equal((await app({ role: 'captain', rateLimited: true }).members.POST(app().request({ programId: PROGRAM, userId: MEMBER }))).status, 429)
})
