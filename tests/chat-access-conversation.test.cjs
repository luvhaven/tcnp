const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function load(path, imports = {}, globals = {}) {
  const mod = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    module: mod, exports: mod.exports, URLSearchParams, console,
    require: name => name in imports ? imports[name] : require(name), ...globals,
  })
  return mod.exports
}
const utils = load('lib/utils.ts')
const conversation = load('lib/chat-conversation.ts', { '@/lib/utils': utils })
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const PROGRAM = uuid(1), PAPA = uuid(2), ME = uuid(3), MEMBER = uuid(4), MESSAGE = uuid(5)
const row = (id = MESSAGE, extra = {}) => ({ id, sender_id: MEMBER, content: 'Message', created_at: '2026-10-25T10:00:00.000+00:00', program_id: PROGRAM, papa_id: null, team: null, mentions: [], read_by: [], users: { full_name: 'Member' }, ...extra })

// A deterministic hook lifecycle harness, without browser rendering or network.
function lifecycle() {
  const slots = []
  let cursor = 0, dirty = true, render, current
  const effects = []
  const changed = (a, b) => !a || !b || a.length !== b.length || a.some((value, i) => !Object.is(value, b[i]))
  const react = {
    useState(initial) {
      const index = cursor++
      const slot = slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }
      return [slot.value, update => {
        const next = typeof update === 'function' ? update(slot.value) : update
        if (!Object.is(next, slot.value)) { slot.value = next; dirty = true }
      }]
    },
    useRef(value) { return slots[cursor++] ??= { current: value } },
    useMemo(fn, deps) {
      const index = cursor++
      if (!slots[index] || changed(slots[index].deps, deps)) slots[index] = { value: fn(), deps }
      return slots[index].value
    },
    useEffect(fn, deps) {
      const index = cursor++
      const previous = slots[index]
      if (!previous || changed(previous.deps, deps)) {
        slots[index] = { deps, cleanup: previous?.cleanup }
        effects.push(() => { slots[index].cleanup?.(); slots[index].cleanup = fn() })
      }
    },
  }
  react.useLayoutEffect = react.useEffect
  react.useCallback = (fn, deps) => react.useMemo(() => fn, deps)
  return {
    react, setRender(fn) { render = fn }, get current() { return current },
    async flush() {
      for (let i = 0; i < 40; i++) {
        if (dirty) { dirty = false; cursor = 0; current = render() }
        while (effects.length) effects.shift()()
        await new Promise(resolve => setImmediate(resolve))
        if (!dirty && !effects.length) return
      }
      throw new Error('Hook failed to settle')
    },
    async rerender() { dirty = true; await this.flush() },
    unmount() { for (const slot of slots) slot?.cleanup?.() },
  }
}

function surface() {
  const listeners = { window: new Map(), document: new Map() }, timers = new Map()
  let timerId = 0
  const events = kind => ({
    addEventListener(name, fn) { const set = listeners[kind].get(name) ?? new Set(); set.add(fn); listeners[kind].set(name, set) },
    removeEventListener(name, fn) { listeners[kind].get(name)?.delete(fn) },
  })
  const setTimer = fn => { timers.set(++timerId, fn); return timerId }
  const clearTimer = id => timers.delete(id)
  const window = { ...events('window'), dispatchEvent() {}, setInterval: setTimer, clearInterval: clearTimer }
  const document = { ...events('document'), visibilityState: 'visible', getElementById() { return null } }
  return {
    window, document, setTimeout: setTimer, clearTimeout: clearTimer, Event,
    navigator: { onLine: true },
    emit(kind, event) { for (const fn of listeners[kind].get(event) ?? []) fn() },
    runTimers() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()) },
  }
}

function hook(options = {}) {
  const runner = lifecycle(), browser = surface()
  const config = { rows: [row()], members: [{ id: MEMBER }], ...options }
  const reads = [], inserts = [], rpcs = [], fetches = [], channels = [], invalidations = [], queries = {}
  const user = { id: ME, role: 'tango_oscar' }
  const membersData = { members: config.members }
  const queryClient = { async invalidateQueries(input) { invalidations.push(input) } }
  function from(table) {
    const query = { table, action: 'select', filters: [] }
    async function result(single = false) {
      if (query.action === 'insert') {
        inserts.push(query.value)
        if (config.duplicate) return { data: null, error: { code: '23505' } }
        return { data: row(query.value.id, query.value), error: null }
      }
      reads.push(query)
      if (config.pendingRead && !single) return new Promise(resolve => { config.resolveRead = resolve })
      let rows = table === 'message_reactions' ? config.reactions ?? [] : config.rows
      for (const [method, field, value] of query.filters) rows = rows.filter(row => method === 'in' ? value.includes(row[field]) : row[field] === value)
      if (query.range) rows = rows.slice(query.range[0], query.range[1] + 1)
      return { data: single ? rows[0] ?? null : rows, error: null }
    }
    return {
      select(columns) { query.columns = columns; return this }, or() { return this }, order() { return this }, limit() { return this },
      range(start, end) { query.range = [start, end]; return this },
      eq(field, value) { query.filters.push(['eq', field, value]); return this },
      is(field, value) { query.filters.push(['is', field, value]); return this },
      in(field, value) { query.filters.push(['in', field, value]); return this },
      insert(value) { query.action = 'insert'; query.value = value; return this },
      single: () => result(true), maybeSingle: () => result(true),
      then(resolve, reject) { return result().then(resolve, reject) },
    }
  }
  const supabase = {
    from, async removeChannel() {},
    async rpc(name, args) {
      rpcs.push({ name, args })
      return { error: config.failRpcAt === rpcs.length ? new Error('Read failed') : null }
    },
    channel() { const channel = { handlers: [], on(kind, filter, fn) { this.handlers.push({ kind, filter, fn }); return this }, subscribe(fn) { this.status = fn; return this } }; channels.push(channel); return channel },
  }
  const hookModule = load('hooks/useChatConversation.ts', {
    react: runner.react,
    '@tanstack/react-query': { useQueryClient: () => queryClient, useQuery: input => {
      queries[input.queryKey[0]] = input.queryFn
      return input.queryKey[0] === 'chat-room-members' ? { data: membersData, isPending: false, refetch() {} } : { data: {} }
    } },
    '@/lib/supabase/client': { createClient: () => supabase },
    '@/hooks/useCurrentUser': { useCurrentUser: () => ({ data: user, isLoading: false }) },
    '@/lib/realtime/topic': { uniqueTopic: input => input },
    '@/lib/chat-conversation': conversation,
  }, { ...browser, fetch: async (url, init) => { fetches.push({ url, init }); return { ok: true } } })
  runner.setRender(() => hookModule.useChatConversation({ programId: PROGRAM }))
  return { runner, browser, config, reads, inserts, rpcs, fetches, channels, invalidations, queries }
}

test('keyset pagination traverses hundreds of messages with identical timestamps without gaps', () => {
  const rows = Array.from({ length: 157 }, (_, i) => row(uuid(100 + i))).sort(conversation.compareChatMessages)
  let remaining = rows.slice(), seen = []
  while (remaining.length) {
    const page = remaining.slice(-50)
    seen = [...page, ...seen]
    const cursor = page[0]
    assert.match(conversation.chatCursorFilter(cursor), new RegExp(`id\\.lt\\.${cursor.id}`))
    remaining = remaining.filter(message => conversation.compareChatMessages(message, cursor) < 0)
  }
  assert.deepEqual(seen.map(message => message.id), rows.map(message => message.id))
  assert.equal(new Set(seen.map(message => message.id)).size, 157)
  assert.throws(() => conversation.chatCursorFilter({ id: 'invalid', created_at: 'today' }))
})

test('room matching isolates program-level, Papa and team message coordinates', () => {
  assert.equal(conversation.matchesConversation(row(), { programId: PROGRAM }), true)
  assert.equal(conversation.matchesConversation(row(MESSAGE, { papa_id: PAPA }), { programId: PROGRAM }), false)
  assert.equal(conversation.matchesConversation(row(), { programId: PROGRAM, papaId: PAPA }), false)
  assert.equal(conversation.matchesConversation(row(MESSAGE, { papa_id: PAPA }), { programId: PROGRAM, papaId: PAPA }), true)
  assert.equal(conversation.matchesConversation(row(MESSAGE, { team: 'strength' }), { team: 'strength' }), false)
  assert.equal(conversation.matchesConversation(row(MESSAGE, { program_id: null, team: 'strength' }), { team: 'strength' }), true)
})

test('duplicate send recovery preserves one message and requests idempotent notifications', async () => {
  const app = hook({ duplicate: true, rows: [row(MESSAGE, { sender_id: ME, mentions: [MEMBER] })] })
  await app.runner.flush()
  await app.runner.current.sendMessage({ id: MESSAGE, content: 'Original', mentions: [MEMBER], isPrivate: false, replyId: null })
  await app.runner.flush()
  assert.equal(app.inserts.length, 1)
  assert.equal(app.runner.current.messages.filter(message => message.id === MESSAGE).length, 1)
  assert.equal(app.fetches.length, 1)
  assert.equal(app.fetches[0].url, '/api/chat/mention-notifications')
  assert.equal(JSON.parse(app.fetches[0].init.body).messageId, MESSAGE)
  app.runner.unmount()
})

test('restricted sends fail closed when their intended recipient is no longer in the room', async () => {
  const app = hook({ members: [] })
  await app.runner.flush()
  await assert.rejects(app.runner.current.sendMessage({ id: MESSAGE, content: 'Private update', mentions: [MEMBER], isPrivate: true, replyId: null }), /current room member/)
  assert.equal(app.inserts.length, 0)
  app.runner.unmount()
})

test('read receipts deduplicate and process every loaded message in batches of at most100', async () => {
  const app = hook()
  await app.runner.flush()
  const ids = Array.from({ length: 250 }, (_, i) => uuid(i + 100))
  await app.runner.current.markRead([...ids, ids[0]])
  assert.deepEqual(app.rpcs.map(call => call.args.message_ids.length), [100, 100, 50])
  assert.deepEqual(app.rpcs.flatMap(call => Array.from(call.args.message_ids)), ids)
  app.rpcs.length = 0
  app.config.failRpcAt = 2
  await assert.rejects(app.runner.current.markRead(ids), /Read failed/)
  assert.equal(app.rpcs.length, 2)
  app.runner.unmount()
})

test('reconnect clears stale history immediately and replaces it with fresh authorized rows', async () => {
  const kept = row(uuid(30)), removed = row(uuid(31))
  const app = hook({ rows: [kept, removed] })
  await app.runner.flush()
  assert.equal(app.runner.current.messages.length, 2)
  app.config.pendingRead = true
  app.browser.emit('window', 'online')
  await app.runner.flush()
  assert.equal(app.runner.current.messages.length, 0)
  assert.equal(app.runner.current.loading, true)
  app.config.pendingRead = false
  app.config.resolveRead({ data: [kept], error: null })
  await app.runner.flush()
  assert.deepEqual(Array.from(app.runner.current.messages, row => row.id), [kept.id])
  app.runner.unmount()
})

test('socket resubscription and foreground consistency checks remove rows hidden by RLS', async () => {
  const app = hook()
  await app.runner.flush()
  app.channels[0].status('SUBSCRIBED')
  app.config.rows = []
  app.browser.runTimers()
  await app.runner.flush()
  assert.equal(app.runner.current.messages.length, 0)
  app.config.rows = [row()]
  app.channels[0].status('CHANNEL_ERROR')
  app.channels[0].status('SUBSCRIBED')
  await app.runner.flush()
  assert.equal(app.runner.current.messages.length, 1)
  app.runner.unmount()
})

test('a history request started before reconnect cannot restore stale rows afterwards', async () => {
  const kept = row(), stale = row(uuid(60), { created_at: '2026-10-25T09:00:00.000+00:00' })
  const app = hook({ rows: [kept] })
  await app.runner.flush()
  app.config.pendingRead = true
  const earlier = app.runner.current.loadEarlier()
  await app.runner.flush()
  const resolveEarlier = app.config.resolveRead
  app.browser.emit('window', 'online')
  await app.runner.flush()
  const resolveReconnect = app.config.resolveRead
  resolveEarlier({ data: [stale], error: null })
  await earlier
  await app.runner.flush()
  assert.equal(app.runner.current.messages.length, 0)
  app.config.pendingRead = false
  resolveReconnect({ data: [kept], error: null })
  await app.runner.flush()
  assert.deepEqual(Array.from(app.runner.current.messages, row => row.id), [kept.id])
  app.runner.unmount()
})

test('reaction DELETE uses the old row and invalidates safely when only the primary key is provided', async () => {
  const app = hook()
  await app.runner.flush()
  const handler = app.channels[0].handlers.find(handler => handler.filter.table === 'message_reactions').fn
  handler({ eventType: 'DELETE', new: {}, old: { id: uuid(70), message_id: MESSAGE } })
  handler({ eventType: 'DELETE', new: {}, old: { id: uuid(71) } })
  handler({ eventType: 'INSERT', new: { message_id: uuid(72) }, old: {} })
  assert.equal(app.invalidations.length, 2)
  assert.equal(app.invalidations.every(call => call.queryKey[0] === 'chat-reactions'), true)
  app.runner.unmount()
})

test('large reaction histories chunk message ids and paginate past the default1000-row limit', async () => {
  const rows = Array.from({ length: 120 }, (_, i) => row(uuid(100 + i)))
  const reactions = [
    ...Array.from({ length: 1205 }, (_, i) => ({ id: uuid(1000 + i), message_id: rows[0].id, user_id: uuid(3000 + i), emoji: '👍' })),
    ...rows.slice(1).map((row, i) => ({ id: uuid(5000 + i), message_id: row.id, user_id: MEMBER, emoji: '👍' })),
  ]
  const app = hook({ rows, reactions })
  await app.runner.flush()
  const result = await app.queries['chat-reactions']()
  assert.equal(result[rows[0].id][0].count, 1205)
  assert.equal(Object.keys(result).length, 120)
  const requests = app.reads.filter(read => read.table === 'message_reactions')
  assert.equal(requests.length, 4)
  assert.equal(requests.every(read => read.filters.find(([op]) => op === 'in')[2].length <= 100), true)
  assert.equal(requests.every(read => read.columns === 'message_id,user_id,emoji'), true)
  assert.deepEqual(requests.map(read => read.range), [[0, 499], [500, 999], [1000, 1499], [0, 499]])
  app.runner.unmount()
})

function ui(options = {}) {
  const browser = surface()
  let activeRunner
  const react = Object.fromEntries(['useState', 'useRef', 'useMemo', 'useCallback', 'useEffect', 'useLayoutEffect'].map(name => [name, (...args) => activeRunner.react[name](...args)]))
  const markCalls = [], sends = []
  const chat = {
    me: { id: ME, role: 'tango_oscar' }, members: [], messages: [row(MESSAGE, { read_by: [ME] })],
    allowed: true, denied: false, loading: false, connection: 'connected', reactions: {},
    async markRead(ids) { markCalls.push(ids) },
    async sendMessage(message) { sends.push(message); if (options.failSend) throw new Error('Offline') },
    ...options.chat,
  }
  const jsx = (type, props) => ({ type, props })
  const componentModule = load('components/chat/ChatSystem.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'next/navigation': { useSearchParams: () => new URLSearchParams() },
    'lucide-react': new Proxy({}, { get: (_target, name) => name }),
    sonner: { toast: { error() {} } },
    '@/hooks/useChatConversation': { useChatConversation: () => chat },
    '@/hooks/useChatTyping': { useChatTyping: () => ({ names: [], announce() {} }) },
    '@/lib/chat-conversation': conversation, '@/lib/utils': utils,
    '@/components/ui/button': { Button: 'Button' }, '@/components/ui/input': { Input: 'Input' },
    '@/components/ui/avatar': { Avatar: 'Avatar', AvatarFallback: 'AvatarFallback' },
    '@/components/ui/dialog': Object.fromEntries(['Dialog', 'DialogContent', 'DialogDescription', 'DialogHeader', 'DialogTitle'].map(name => [name, name])),
    '@/components/providers/ConfirmProvider': { useConfirm: () => async () => true },
    './MessageBubble': { MessageBubble: 'MessageBubble' },
  }, { ...browser, requestAnimationFrame: fn => fn() })
  function elements(node) {
    if (!node || typeof node !== 'object') return []
    if (Array.isArray(node)) return node.flatMap(elements)
    return [node, ...elements(node.props?.children)]
  }
  return {
    chat, browser, markCalls, sends,
    mount(props = {}) {
      const runner = lifecycle()
      runner.setRender(() => { activeRunner = runner; return componentModule.default({ programId: PROGRAM, ...props }) })
      runner.find = predicate => elements(runner.current).find(predicate)
      return runner
    },
  }
}

test('loading earlier history never inflates the new-message badge', async () => {
  const app = ui(), runner = app.mount()
  await runner.flush()
  const log = runner.find(node => node.props?.role === 'log')
  log.props.ref.current = { scrollHeight: 1000, scrollTop: 0, clientHeight: 100 }
  log.props.onScroll()
  await runner.flush()
  app.chat.messages = [row(uuid(30), { created_at: '2026-10-25T09:00:00.000+00:00' }), ...app.chat.messages]
  await runner.rerender()
  assert.ok(runner.find(node => node.props?.['aria-label'] === 'Jump to latest messages'))
  app.chat.messages = [...app.chat.messages, row(uuid(31), { created_at: '2026-10-25T11:00:00.000+00:00' })]
  await runner.rerender()
  assert.ok(runner.find(node => node.props?.['aria-label'] === 'Jump to latest, 1 new'))
  runner.unmount()
})

test('returning to a visible tab marks messages which arrived while hidden', async () => {
  const app = ui(), runner = app.mount()
  await runner.flush()
  app.browser.document.visibilityState = 'hidden'
  app.browser.emit('document', 'visibilitychange')
  app.chat.messages = [...app.chat.messages, row(uuid(40))]
  await runner.rerender()
  app.browser.runTimers()
  assert.equal(app.markCalls.length, 0)
  app.browser.document.visibilityState = 'visible'
  app.browser.emit('document', 'visibilitychange')
  await runner.flush()
  app.browser.runTimers()
  assert.equal(app.markCalls.length, 1)
  assert.deepEqual(Array.from(app.markCalls[0]), [uuid(40)])
  runner.unmount()
})

test('failed messages block new sends and draft snapshots survive room unmounts only for their owner', async () => {
  const options = { failSend: true }, app = ui(options)
  let runner = app.mount()
  await runner.flush()
  let textarea = runner.find(node => node.type === 'textarea')
  textarea.props.onChange({ target: { value: 'First unsent message', selectionStart: 20 } })
  await runner.flush()
  runner.find(node => node.props?.['aria-label'] === 'Send message').props.onClick()
  await runner.flush()
  assert.equal(app.sends.length, 1)
  textarea = runner.find(node => node.type === 'textarea')
  textarea.props.onChange({ target: { value: 'Next draft stays safe', selectionStart: 20 } })
  await runner.flush()
  assert.equal(runner.find(node => node.props?.['aria-label'] === 'Send message').props.disabled, true)
  runner.find(node => node.type === 'textarea').props.onKeyDown({ key: 'Enter', nativeEvent: {}, preventDefault() {} })
  await runner.flush()
  assert.equal(app.sends.length, 1)
  runner.unmount()

  // A keyed workspace room mounts a new component, retaining module memory.
  runner = app.mount()
  await runner.flush()
  assert.equal(runner.find(node => node.type === 'textarea').props.value, 'Next draft stays safe')
  assert.ok(runner.find(node => node.props?.children === 'First unsent message'))
  runner.unmount()

  app.chat.me = { id: uuid(99), role: 'tango_oscar' }
  runner = app.mount()
  await runner.flush()
  assert.equal(runner.find(node => node.type === 'textarea').props.value, '')
  runner.unmount()

  app.chat.me = { id: ME, role: 'tango_oscar' }
  app.chat.denied = true; app.chat.allowed = false
  runner = app.mount()
  await runner.flush()
  assert.equal(runner.find(node => node.type === 'textarea').props.value, '')
  runner.unmount()
  app.chat.denied = false; app.chat.allowed = true
  runner = app.mount()
  await runner.flush()
  assert.equal(runner.find(node => node.type === 'textarea').props.value, '')
  assert.equal(runner.find(node => node.props?.children === 'First unsent message'), undefined)
  runner.unmount()
})
