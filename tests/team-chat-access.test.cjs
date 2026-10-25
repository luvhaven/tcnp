const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function load(path, imports = {}, globals = {}) {
  const mod = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    module: mod, exports: mod.exports,
    require: name => name in imports ? imports[name] : require(name),
    ...globals,
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

function chat(initialProfile, options = {}) {
  let profile = initialProfile
  const state = []
  let cursor = 0
  const requests = []
  const invalidations = []
  const successes = []
  let fetchImpl = async () => ({ ok: true, json: async () => ({ success: true }) })
  const react = {
    useState(initial) {
      const index = cursor++
      if (!(index in state)) state[index] = initial
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value }]
    },
    useRef(value) {
      const index = cursor++
      if (!(index in state)) state[index] = { current: value }
      return state[index]
    },
  }
  function SharedChatSystem() { throw Error('Wrapper tests must not invoke the conversation engine') }
  const Component = load('components/chat/TeamChatRoom.tsx', {
    react,
    sonner: { toast: { success: text => successes.push(text) } },
    '@/hooks/useCurrentUser': { useCurrentUser: () => ({ data: profile, isLoading: options.loading ?? false }) },
    '@/lib/utils': utils,
    '@/components/ui/button': { Button: 'Button' },
    '@/components/chat/ChatSystem': { default: SharedChatSystem },
    '@tanstack/react-query': {
      useQueryClient: () => ({
        invalidateQueries: async value => { invalidations.push(value) },
        setQueryData: (_key, update) => { profile = update(profile) },
      }),
    },
  }, {
    fetch: async (...args) => { requests.push(args); return fetchImpl(...args) },
  }).default
  function render() {
    cursor = 0
    const tree = Component({ joinOnly: options.joinOnly })
    return {
      tree,
      channel: nodes(tree).find(node => node.type === SharedChatSystem),
      buttons: nodes(tree).filter(node => node.type === 'Button'),
    }
  }
  function select(teamLabel) {
    const button = render().buttons.find(button => button.props.children === teamLabel)
    assert.ok(button, `Missing room choice: ${teamLabel}`)
    button.props.onClick()
  }
  return { render, select, requests, invalidations, successes, profile: () => profile, setFetch: value => { fetchImpl = value } }
}

async function settle() { for (let i = 0; i < 15; i++) await Promise.resolve() }

for (const role of ['captain', 'vice_captain']) {
  test(`an unassigned ${role} switches the unified engine to each team without joining`, () => {
    const profile = { id: `${role}-id`, role, team: null }
    const app = chat(profile)
    assert.equal(app.render().channel.props.team, 'strength')
    assert.equal(app.render().buttons.length, 3)
    for (const [team, label] of [['wisdom', 'Team Wisdom'], ['swift', 'Team Swift'], ['strength', 'Team Strength']]) {
      const previousKey = app.render().channel.key
      app.select(label)
      const { channel } = app.render()
      assert.equal(channel.props.team, team)
      assert.equal(channel.props.programId, undefined)
      assert.equal(channel.props.papaId, undefined)
      assert.equal(channel.props.roomLabel, label)
      assert.notEqual(channel.key, previousKey, 'changing the keyed engine resets drafts and private reply state')
      assert.equal(profile.team, null)
    }
    assert.equal(app.requests.length, 0)
  })
}

test('ordinary officers get no cross-team selector and cannot retain an unauthorized selection', () => {
  const profile = { id: 'member', role: 'captain', team: 'wisdom' }
  const app = chat(profile)
  app.select('Team Swift')
  profile.role = 'tango_oscar'
  assert.equal(app.render().buttons.length, 0)
  assert.equal(app.render().channel.props.team, 'wisdom')
  profile.team = null
  assert.equal(app.render().channel, undefined)
  assert.equal(app.render().buttons.length, 3, 'unassigned regular officers retain the first-join flow')
})

test('first join uses the guarded API once and refreshes both profile and room access', async () => {
  const app = chat({ id: 'member', role: 'tango_oscar', team: null }, { joinOnly: true })
  let resolveJoin
  app.setFetch(() => new Promise(resolve => { resolveJoin = resolve }))
  app.select('Team Wisdom')
  app.select('Team Swift')
  assert.equal(app.requests.length, 1, 'immediate duplicate clicks must not send a second membership request')
  assert.equal(app.requests[0][0], '/api/teams/join')
  assert.equal(app.requests[0][1].method, 'POST')
  assert.deepEqual(JSON.parse(app.requests[0][1].body), { team: 'wisdom' })
  assert.ok(app.render().buttons.every(button => button.props.disabled))
  resolveJoin({ ok: true, json: async () => ({ success: true, team: 'wisdom' }) })
  await settle()
  assert.equal(app.profile().team, 'wisdom')
  assert.deepEqual(app.invalidations.map(value => Array.from(value.queryKey)), [['currentUser'], ['chat-rooms']])
  assert.equal(app.render().tree, null, 'joinOnly collapses once membership is confirmed')
})

test('a failed join keeps the profile unchanged and offers an inline error and retry', async () => {
  const app = chat({ id: 'member', role: 'tango_oscar', team: null })
  app.setFetch(async () => ({ ok: false, json: async () => ({ error: 'This team is currently unavailable.' }) }))
  app.select('Team Strength')
  await settle()
  const rendered = app.render()
  assert.equal(app.profile().team, null)
  assert.equal(rendered.channel, undefined)
  assert.equal(nodes(rendered.tree).find(node => node.props?.role === 'alert').props.children, 'This team is currently unavailable.')
  assert.ok(rendered.buttons.every(button => !button.props.disabled))
  assert.equal(app.invalidations.length, 0)
})

test('joinOnly never offers executives or existing members a team reassignment', () => {
  for (const profile of [
    { id: 'captain', role: 'captain', team: null },
    { id: 'vice', role: 'vice_captain', team: 'swift' },
    { id: 'officer', role: 'tango_oscar', team: 'wisdom' },
  ]) assert.equal(chat(profile, { joinOnly: true }).render().tree, null)
  assert.equal(chat(null).render().tree, null)
  assert.equal(chat({ id: 'loading', role: 'captain', team: null }, { loading: true }).render().channel, undefined)
})
