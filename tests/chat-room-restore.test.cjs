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

const restore = load('lib/chat-room-restore.ts')
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const PROGRAM = id(1), ADMIN = id(2), OSHO = id(3), OTHER = id(4), NEW_OFFICER = id(5)
const MENS = 'Men’s Conference'
// Values built inside the vm context have that realm's prototypes; compare plain copies.
const plain = value => JSON.parse(JSON.stringify(value))
const same = (actual, expected) => assert.deepEqual(plain(actual), expected)

/** Minimal PostgREST-style fake: tables are arrays of rows; writes are recorded. */
function fakeDb(tables, options = {}) {
  const writes = [], rpcCalls = []
  function from(table) {
    const query = { table, filters: [], action: 'select' }
    const rows = () => {
      let data = tables[table] ?? []
      for (const [op, field, value] of query.filters) {
        data = data.filter(row => op === 'in' ? value.includes(row[field]) : op === 'is' ? (row[field] ?? null) === value : row[field] === value)
      }
      return data
    }
    function result(single) {
      if (options.missing?.includes(table)) return { data: null, error: { code: '42P01', message: `relation "public.${table}" does not exist` } }
      if (query.action === 'delete') {
        const removed = rows()
        tables[table] = (tables[table] ?? []).filter(row => !removed.includes(row))
        writes.push({ ...query, removed })
        return { data: query.returning ? removed : null, error: null }
      }
      if (query.action !== 'select') { writes.push(query); return { data: null, error: null } }
      const data = rows()
      return { data: single ? data[0] ?? null : data, error: null }
    }
    const chain = {
      select(columns) { if (query.action === 'delete') query.returning = columns; else query.columns = columns; return chain },
      eq(field, value) { query.filters.push(['eq', field, value]); return chain },
      is(field, value) { query.filters.push(['is', field, value]); return chain },
      in(field, value) { query.filters.push(['in', field, value]); return chain },
      or() { return chain }, order() { return chain }, limit() { return chain },
      delete() { query.action = 'delete'; return chain },
      update(value) { query.action = 'update'; query.value = value; return chain },
      insert(value) { query.action = 'insert'; query.value = value; return chain },
      single: async () => result(true), maybeSingle: async () => result(true),
      then(resolve, reject) { return Promise.resolve(result(false)).then(resolve, reject) },
    }
    return chain
  }
  return {
    from, writes, rpcCalls, tables,
    rpc: async (name, args) => {
      rpcCalls.push({ name, args })
      // The database trigger lifts the removal when a programme title becomes active.
      tables.chat_room_removals = (tables.chat_room_removals ?? []).filter(row => !(row.user_id === args.p_user_id && row.program_id === args.p_program_id && row.papa_id === null))
      tables.current_title_assignments.push({ user_id: args.p_user_id, program_id: args.p_program_id, is_active: true })
      return { data: id(99), error: null }
    },
  }
}

test('outcome sentences tell the admin the officer is already on the programme and back in the chat', () => {
  same(restore.assignmentOutcomeToasts({
    programName: MENS, assigned: [], alreadyAssigned: [{ id: OSHO, name: 'Emmanuel Osho' }], chatRestoredIds: [OSHO],
  }), [{ kind: 'success', message: `Emmanuel Osho is already on ${MENS}. They are back in the programme chat.` }])

  same(restore.assignmentOutcomeToasts({
    programName: MENS, assigned: [], alreadyAssigned: [{ id: OSHO, name: 'Emmanuel Osho' }], chatRestoredIds: [],
  }), [{ kind: 'info', message: `Emmanuel Osho is already on ${MENS}.` }])

  same(restore.assignmentOutcomeToasts({
    programName: 'Retreat', assigned: [{ id: NEW_OFFICER, name: 'Ada' }, { id: OTHER, name: 'Bola' }], alreadyAssigned: [], chatRestoredIds: [OTHER],
  }), [{ kind: 'success', message: 'Assigned 2 officers to Retreat. Bola is back in the programme chat.' }])

  same(restore.assignmentOutcomeToasts({
    programName: null, assigned: [], alreadyAssigned: [{ id: OSHO, name: 'A' }, { id: OTHER, name: 'B' }], chatRestoredIds: [OSHO, OTHER],
  }), [{ kind: 'success', message: '2 officers are already on the programme. They are back in the programme chat.' }])
})

test('bulk results without names or ids still read correctly', () => {
  same(restore.bulkAssignToasts({ assigned_count: 3 }, 'Retreat'), [{ kind: 'success', message: 'Assigned 3 officers to Retreat.' }])
  same(restore.bulkAssignToasts({ assigned_ids: [], already_assigned_ids: [OSHO] }, 'Retreat'), [{ kind: 'info', message: 'This officer is already on Retreat.' }])
  same(restore.bulkAssignToasts({ assigned_ids: [], already_assigned_ids: [] }, 'Retreat'), [])
})

test('restoring programme chat access deletes only that programme room removal', async () => {
  const db = fakeDb({ chat_room_removals: [
    { program_id: PROGRAM, papa_id: null, user_id: OSHO },
    { program_id: PROGRAM, papa_id: id(50), user_id: OSHO },     // Papa room: untouched
    { program_id: id(60), papa_id: null, user_id: OSHO },       // other programme: untouched
    { program_id: PROGRAM, papa_id: null, user_id: OTHER },     // not asked for: untouched
  ] })
  same([...await restore.programChatRemovedIds(db, PROGRAM, [OSHO, NEW_OFFICER])], [OSHO])
  same(await restore.restoreProgramChatAccess(db, PROGRAM, [OSHO, OSHO, NEW_OFFICER]), [OSHO])
  assert.equal(db.tables.chat_room_removals.length, 3)
  assert.equal(db.tables.chat_room_removals.some(row => row.user_id === OSHO && row.program_id === PROGRAM && row.papa_id === null), false)
  same(await restore.restoreProgramChatAccess(db, PROGRAM, []), [])
})

test('before the removals migration the helpers change nothing', async () => {
  const db = fakeDb({}, { missing: ['chat_room_removals'] })
  same(await restore.restoreProgramChatAccess(db, PROGRAM, [OSHO]), [])
  assert.equal((await restore.programChatRemovedIds(db, PROGRAM, [OSHO])).size, 0)
})

function bulkAssign(tables) {
  const admin = fakeDb(tables)
  const session = {
    auth: { getUser: async () => ({ data: { user: { id: ADMIN } } }) },
    from: () => fakeDb({ users: [{ id: ADMIN, role: 'captain', has_admin_access: false, activation_status: 'active' }] }).from('users'),
  }
  const json = (body, init = {}) => ({ body, status: init.status ?? 200 })
  const route = load('app/api/admin/bulk-assign-program/route.ts', {
    'next/server': { NextResponse: { json } },
    '@/lib/supabase/server': { createClient: async () => session },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/utils': load('lib/utils.ts'),
    '@/lib/chat-room-restore': restore,
  })
  return { admin, post: officerIds => route.POST({ json: async () => ({ officer_ids: officerIds, program_id: PROGRAM }) }) }
}

test('bulk assign: an officer already on the programme is put back in its chat', async () => {
  const { admin, post } = bulkAssign({
    programs: [{ id: PROGRAM, status: 'active', name: MENS }],
    current_title_assignments: [{ user_id: OSHO, program_id: PROGRAM, is_active: true }],
    chat_room_removals: [{ program_id: PROGRAM, papa_id: null, user_id: OSHO }],
    users: [{ id: OSHO, full_name: 'Emmanuel Osho' }],
  })
  const response = await post([OSHO])
  assert.equal(response.status, 200)
  same(response.body.already_assigned_ids, [OSHO])
  same(response.body.chat_restored_ids, [OSHO])
  assert.equal(admin.tables.chat_room_removals.length, 0)
  assert.equal(admin.rpcCalls.length, 0)
  same(restore.bulkAssignToasts(response.body), [{ kind: 'success', message: `Emmanuel Osho is already on ${MENS}. They are back in the programme chat.` }])
})

test('bulk assign: a newly assigned removed officer is reported back in the chat', async () => {
  const { admin, post } = bulkAssign({
    programs: [{ id: PROGRAM, status: 'active', name: 'Retreat' }],
    current_title_assignments: [],
    chat_room_removals: [{ program_id: PROGRAM, papa_id: null, user_id: NEW_OFFICER }],
    official_titles: [{ id: id(70), code: 'TANGO_OSCAR', unit: 'tango' }],
    users: [{ id: NEW_OFFICER, full_name: 'Ada', role: 'tango_oscar', oscar: null, current_title_id: null, is_active: true, activation_status: 'active' }],
  })
  const response = await post([NEW_OFFICER])
  assert.equal(response.status, 200)
  assert.equal(admin.rpcCalls[0].args.p_title_code, 'TANGO_OSCAR')
  same(response.body.assigned_ids, [NEW_OFFICER])
  same(response.body.chat_restored_ids, [NEW_OFFICER])
  same(restore.bulkAssignToasts(response.body), [{ kind: 'success', message: 'Ada is now on Retreat and back in the programme chat.' }])
})
