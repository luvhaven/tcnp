const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

const program = { id: 'program:one', kind: 'program', label: 'Operation One', programId: 'one', programName: 'Operation One', papaId: null, team: null }
const papa = { id: 'papa:two', kind: 'papa', label: 'Papa Two', programId: 'one', programName: 'Operation One', papaId: 'two', team: null }
const team = { id: 'team:wisdom', kind: 'team', label: 'Team Wisdom', programId: null, papaId: null, team: 'wisdom' }

function nodes(element) {
  if (!element || typeof element !== 'object') return []
  if (Array.isArray(element)) return element.flatMap(nodes)
  return [element, ...nodes(element.props?.children)]
}

function workspace(initialUrl = '', initialRooms = [team, program, papa]) {
  let params = new URLSearchParams(initialUrl)
  let profile = { id: 'captain', role: 'captain', team: null }
  let query = { data: { rooms: initialRooms, canManageMembers: true }, isPending: false, isError: false, refetch() {} }
  const state = []
  let cursor = 0
  let pendingEffects = []
  const imports = {
    react: {
      Suspense: 'Suspense',
      useState(initial) {
        const index = cursor++
        if (!(index in state)) state[index] = initial
        return [state[index], update => { state[index] = typeof update === 'function' ? update(state[index]) : update }]
      },
      useEffect(effect, deps) {
        const index = cursor++
        const previous = state[index]
        if (!previous || deps.some((value, key) => !Object.is(value, previous[key]))) pendingEffects.push(effect)
        state[index] = deps
      },
    },
    '@tanstack/react-query': { useQuery: () => query },
    'next/navigation': { useSearchParams: () => params },
    '@/hooks/useCurrentUser': { useCurrentUser: () => ({ data: profile, isLoading: false }) },
    '@/lib/utils': { isPlatformAdministrator: role => ['captain', 'vice_captain', 'head_of_command', 'admin', 'super_admin'].includes(role) },
    '@/components/chat/ChatSystem': { default: 'ChatSystem' },
    '@/components/chat/TeamChatRoom': { default: 'TeamChatRoom' },
    '@/components/chat/ChatWorkspace': { ChatWorkspace: 'ChatWorkspace' },
    '@/components/chat/ChatMembersPanel': { ChatMembersPanel: 'ChatMembersPanel' },
    '@/components/chat/AdminChatControls': { AdminChatControls: 'AdminChatControls' },
    '@/components/ErrorBoundary': { ErrorBoundary: 'ErrorBoundary' },
    '@/components/ui/button': { Button: 'Button' },
  }
  const mod = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/(dashboard)/chat/page.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { module: mod, exports: mod.exports, require: name => name in imports ? imports[name] : require(name) })
  const Content = mod.exports.default().props.children.type
  return {
    navigate(url) { params = new URLSearchParams(url) },
    setRooms(rooms) { query = { ...query, data: { ...query.data, rooms } } },
    setQuery(changes) { query = { ...query, ...changes } },
    setProfile(value) { profile = value },
    commitEffects() { const effects = pendingEffects; pendingEffects = []; effects.forEach(effect => effect()) },
    render() {
      cursor = 0
      const tree = Content()
      const elements = nodes(tree)
      return {
        tree,
        frame: elements.find(node => node.type === 'ChatWorkspace'),
        engine: elements.find(node => node.type === 'ChatSystem'),
        members: elements.find(node => node.type === 'ChatMembersPanel'),
        statuses: elements.filter(node => node.props?.role === 'status'),
      }
    },
  }
}

test('a new notification target supersedes a manual selection and remounts the mobile workspace', () => {
  const app = workspace('programId=one')
  const initial = app.render()
  assert.equal(initial.engine.props.programId, 'one')
  assert.equal(initial.engine.props.papaId, undefined)
  initial.frame.props.onSelectRoom(team)
  assert.equal(app.render().engine.props.team, 'wisdom')
  const manualKey = app.render().frame.key
  app.navigate('programId=one&papaId=two&highlight=message-two')
  const linked = app.render()
  assert.equal(linked.frame.props.selectedRoomId, papa.id)
  assert.equal(linked.engine.props.programId, 'one')
  assert.equal(linked.engine.props.papaId, 'two')
  assert.equal(linked.engine.props.team, undefined)
  assert.equal(linked.frame.props.showConversationInitially, true)
  assert.notEqual(linked.frame.key, manualKey)
})

test('direct roomId, legacy program/Papa aliases and team links select exact scopes', () => {
  for (const [url, expected] of [['roomId=papa%3Atwo', papa], ['program=one&papa=two', papa], ['program=one', program], ['team=wisdom', team]]) {
    const rendered = workspace(url).render()
    assert.equal(rendered.frame.props.selectedRoomId, expected.id)
    assert.equal(rendered.engine.props.programId, expected.programId ?? undefined)
    assert.equal(rendered.engine.props.papaId, expected.papaId ?? undefined)
    assert.equal(rendered.engine.props.team, expected.team ?? undefined)
    assert.equal(rendered.members.props.room, expected)
  }
})

test('a URL message seed is delivered once and never follows manual room switching', () => {
  const app = workspace('programId=one&message=Program+update')
  const initial = app.render()
  assert.equal(initial.engine.props.initialMessage, 'Program update')
  app.commitEffects()
  assert.equal(app.render().engine.props.initialMessage, undefined)
  app.render().frame.props.onSelectRoom(team)
  assert.equal(app.render().engine.props.initialMessage, undefined)
  app.render().frame.props.onSelectRoom(program)
  assert.equal(app.render().engine.props.initialMessage, undefined)
  app.navigate('papaId=two&message=Papa+update')
  assert.equal(app.render().engine.props.initialMessage, 'Papa update')
  app.commitEffects()
  assert.equal(app.render().engine.props.initialMessage, undefined)
  app.navigate('programId=one&message=Program+update')
  assert.equal(app.render().engine.props.initialMessage, undefined)
})

test('a requested seed waits for the authorized directory instead of being consumed while loading', () => {
  const app = workspace('programId=one&message=Ready', [])
  app.setQuery({ isPending: true, data: undefined })
  assert.equal(app.render().engine, undefined)
  app.commitEffects()
  app.setQuery({ isPending: false, data: { rooms: [program], canManageMembers: true } })
  assert.equal(app.render().engine.props.initialMessage, 'Ready')
  app.commitEffects()
  assert.equal(app.render().engine.props.initialMessage, undefined)
})

test('an unavailable or archived requested room never falls back to an unrelated conversation', () => {
  const app = workspace('programId=archived&message=Private+update')
  let rendered = app.render()
  assert.equal(rendered.engine, undefined)
  assert.equal(rendered.frame.props.selectedRoomId, null)
  assert.equal(rendered.statuses.length, 1)
  assert.match(rendered.statuses[0].props.children, /unavailable/)
  rendered.frame.props.onSelectRoom(team)
  rendered = app.render()
  assert.equal(rendered.engine.props.team, 'wisdom')
  assert.equal(rendered.engine.props.initialMessage, undefined)
  assert.equal(rendered.statuses.length, 0)
  app.setRooms([program, papa]) // A membership removal or archive removes the selected room from the directory.
  assert.equal(app.render().engine, undefined)
  assert.equal(app.render().members, undefined)
})

test('a failed directory refresh hides cached rooms and their conversations', () => {
  const app = workspace('programId=one')
  assert.ok(app.render().engine)
  app.setQuery({ isError: true })
  const rendered = app.render()
  assert.equal(rendered.frame.props.rooms.length, 0)
  assert.equal(rendered.engine, undefined)
  assert.equal(rendered.members, undefined)
  assert.match(rendered.frame.props.error, /could not load/)
})

test('room actions and member management retain the exact selected scope', () => {
  const app = workspace('programId=one&papaId=two')
  let rendered = app.render()
  assert.equal(rendered.frame.props.actions.props.programId, 'one')
  assert.equal(rendered.frame.props.actions.props.papaId, 'two')
  assert.equal(rendered.frame.props.actions.props.team, null)
  rendered.frame.props.onOpenMembers()
  assert.equal(app.render().members.props.open, true)
  rendered.frame.props.onSelectRoom(team)
  rendered = app.render()
  assert.equal(rendered.members.props.open, false)
  assert.equal(rendered.members.props.room, team)
  assert.equal(rendered.frame.props.actions.props.programId, null)
  assert.equal(rendered.frame.props.actions.props.papaId, null)
  assert.equal(rendered.frame.props.actions.props.team, 'wisdom')
  app.setProfile({ id: 'officer', role: 'tango_oscar', team: 'wisdom' })
  assert.equal(app.render().frame.props.actions, null)
})
