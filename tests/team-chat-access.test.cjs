const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function load(path, imports = {}) {
  const mod = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    module: mod, exports: mod.exports,
    require: name => name in imports ? imports[name] : require(name),
  })
  return mod.exports
}

const utils = load('lib/utils.ts')
const roomNames = rooms => Array.from(rooms, room => room.value)

test('Captain and Vice Captains can access all team rooms without a team assignment', () => {
  for (const role of ['captain', 'vice_captain', 'head_of_command', 'admin', 'super_admin']) {
    for (const assigned of [null, 'strength', 'wisdom', 'swift']) {
      assert.deepEqual(roomNames(utils.getAccessibleTeamChats(role, assigned)), ['strength', 'wisdom', 'swift'])
    }
  }
})

test('ordinary officers and team heads stay within their assigned team', () => {
  for (const role of ['tango_oscar', 'head_welfare_oscar', 'command', 'viewer', null]) {
    assert.deepEqual(roomNames(utils.getAccessibleTeamChats(role, 'wisdom')), ['wisdom'])
    assert.deepEqual(roomNames(utils.getAccessibleTeamChats(role, null)), [])
    assert.deepEqual(roomNames(utils.getAccessibleTeamChats(role, 'unknown')), [])
  }
})

function nodes(element) {
  if (!element || typeof element !== 'object') return []
  if (Array.isArray(element)) return element.flatMap(nodes)
  return [element, ...nodes(element.props?.children)]
}

function chat(profile) {
  const parentState = []
  let channelState = []
  let state = parentState
  let cursor = 0
  let channelKey
  const writes = []
  const queries = []
  const invalidations = []
  const react = {
    useState(initial) {
      const index = cursor++
      const slots = state
      if (!(index in slots)) slots[index] = initial
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value }]
    },
    useRef: value => ({ current: value }),
    useMemo: fn => fn(),
    useEffect() {},
  }
  const client = { from: table => ({ insert: async row => { writes.push({ table, row }); return { error: null } } }) }
  const ui = Object.fromEntries(['Button', 'Badge', 'Input', 'Avatar', 'AvatarFallback', 'AvatarImage'].map(name => [name, name]))
  const imports = {
    react,
    'framer-motion': { motion: { div: 'div' }, AnimatePresence: 'div' },
    sonner: { toast: { error() {}, success() {} } },
    '@/lib/supabase/client': { createClient: () => client },
    '@/hooks/useCurrentUser': { useCurrentUser: () => ({ data: profile, isLoading: false }) },
    '@/lib/utils': utils,
    '@/lib/realtime/topic': { uniqueTopic: name => `${name}:test` },
    '@/components/providers/ConfirmProvider': { useConfirm: () => async () => false },
    '@/components/chat/AdminChatControls': { AdminChatControls: 'AdminChatControls' },
    '@tanstack/react-query': {
      useQuery: options => { queries.push(options); return { data: [], isLoading: false } },
      useMutation: () => ({}),
      useQueryClient: () => ({ invalidateQueries: options => invalidations.push(options) }),
    },
  }
  for (const name of ['button', 'badge', 'input', 'avatar']) imports[`@/components/ui/${name}`] = ui
  const Component = load('components/chat/TeamChatRoom.tsx', imports).default
  function render() {
    state = parentState
    cursor = 0
    const tree = Component()
    const channel = nodes(tree).find(node => typeof node.type === 'function' && node.type.name === 'TeamChatChannel')
    return { tree, channel, buttons: nodes(tree).filter(node => node.type === 'Button') }
  }
  function room() {
    const { channel } = render()
    if (channel.key !== channelKey) { channelState = []; channelKey = channel.key }
    state = channelState
    cursor = 0
    return channel.type(channel.props)
  }
  function select(teamLabel) {
    const button = render().buttons.find(button => button.props.children === teamLabel)
    assert.ok(button, `Missing room selector: ${teamLabel}`)
    button.props.onClick()
  }
  return { render, room, select, writes, queries, invalidations }
}

test('an unassigned Captain can switch rooms and send into the selected team without joining it', async () => {
  const profile = { id: 'captain-id', role: 'captain', team: null, is_team_head: false }
  const app = chat(profile)
  assert.equal(app.render().channel.props.team, 'strength')
  assert.equal(app.render().buttons.length, 3)

  for (const [team, label] of [['wisdom', 'Team Wisdom'], ['swift', 'Team Swift'], ['strength', 'Team Strength']]) {
    app.select(label)
    assert.equal(app.render().channel.props.team, team)
    let room = app.room()
    const input = nodes(room).find(node => node.type === 'Input')
    assert.equal(input.props.value, '')
    input.props.onChange({ target: { value: `Hello ${team}` } })
    room = app.room()
    nodes(room).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} })
    for (let i = 0; i < 5; i++) await Promise.resolve()
    assert.equal(app.writes.at(-1).table, 'chat_messages')
    assert.equal(app.writes.at(-1).row.team, team)
    assert.equal(app.writes.at(-1).row.sender_id, 'captain-id')
    assert.equal(app.writes.at(-1).row.content, `Hello ${team}`)
    assert.equal(profile.team, null)
  }
  assert.equal(app.writes.length, 3)
})

test('switching rooms clears the previous draft and scopes the message and member caches to the current user and team', () => {
  const app = chat({ id: 'vice-id', role: 'vice_captain', team: null })
  const first = app.render().channel
  nodes(app.room()).find(node => node.type === 'Input').props.onChange({ target: { value: 'Private draft for Strength' } })
  app.select('Team Swift')
  assert.notEqual(app.render().channel.key, first.key)
  assert.equal(nodes(app.room()).find(node => node.type === 'Input').props.value, '')
  assert.deepEqual(Array.from(app.queries.at(-2).queryKey), ['team-chat', 'vice-id', 'swift'])
  assert.deepEqual(Array.from(app.queries.at(-1).queryKey), ['team-members', 'vice-id', 'swift'])
})

test('ordinary officers get no cross-team selector and cannot retain an unauthorized selection', () => {
  const profile = { id: 'member', role: 'captain', team: 'wisdom' }
  const app = chat(profile)
  app.select('Team Swift')
  profile.role = 'tango_oscar'
  assert.equal(app.render().buttons.length, 0)
  assert.equal(app.render().channel.props.team, 'wisdom')
  profile.team = null
  assert.equal(app.render().channel.props.team, null)
})
