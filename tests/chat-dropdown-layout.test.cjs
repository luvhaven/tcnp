const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

const team = { id: 'team:wisdom', kind: 'team', team: 'wisdom', programId: null, papaId: null, label: 'Team Wisdom' }
const program = { id: 'program:one', kind: 'program', programId: 'one', papaId: null, team: null, label: 'Convention', programName: 'Convention' }
const papa = { id: 'papa:two', kind: 'papa', programId: 'one', papaId: 'two', team: null, label: 'Pastor A', programName: 'Convention' }
const onlyPapa = { ...papa, id: 'papa:three', papaId: 'three', programId: 'other', programName: 'Retreat', label: 'Pastor B' }
const nodes = element => !element || typeof element !== 'object' ? [] : Array.isArray(element) ? element.flatMap(nodes) : [element, ...nodes(element.props?.children)]

function app(rooms, selectedRoomId) {
  let props, selected
  const slots = [], mod = { exports: {} }
  let cursor = 0
  const react = { useRef: value => ({ current: value }), useEffect() {}, useMemo: fn => fn(), useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value }] } }
  const imports = { react, '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') }, '@/components/ui/button': { Button: 'Button' } }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/chat/ChatWorkspace.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText, { module: mod, exports: mod.exports, require: name => imports[name] || require(name) })
  props = { rooms, selectedRoomId, children: 'CONVERSATION', onSelectRoom(room) { selected = room; props.selectedRoomId = room.id }, onRetry() {} }
  return { render() { cursor = 0; return nodes(mod.exports.ChatWorkspace(props)) }, get selected() { return selected } }
}

test('program and Papa dropdowns select exact authorized rooms in a single conversation pane', () => {
  const ui = app([team, program, papa, onlyPapa], program.id)
  let tree = ui.render()
  assert.equal(tree.some(node => node.type === 'aside' || node.type === 'nav'), false)
  const programSelect = tree.find(node => node.props?.id === 'chat-program')
  assert.deepEqual(nodes(programSelect).filter(node => node.type === 'option').map(node => node.props.value), ['one', 'other'])
  tree.find(node => node.props?.id === 'chat-room').props.onChange({ target: { value: papa.id } })
  assert.equal(ui.selected, papa)
  tree = ui.render()
  tree.find(node => node.props?.id === 'chat-program').props.onChange({ target: { value: 'other' } })
  assert.equal(ui.selected, onlyPapa)
  const options = nodes(ui.render().find(node => node.props?.id === 'chat-room')).filter(node => node.type === 'option')
  assert.equal(options.length, 1)
  assert.equal(options[0].props.value, onlyPapa.id)
})

test('switching between programs and teams preserves the selected Papa room', () => {
  const ui = app([team, program, papa], papa.id)
  ui.render().find(node => node.type === 'button' && node.props.children === 'Teams').props.onClick()
  assert.equal(ui.selected, team)
  ui.render().find(node => node.type === 'button' && node.props.children === 'Programs').props.onClick()
  assert.equal(ui.selected, papa)
})

test('an unavailable deep link still permits selecting an authorized team', () => {
  const ui = app([team], null)
  const select = ui.render().find(node => node.props?.id === 'chat-team')
  assert.ok(select)
  select.props.onChange({ target: { value: team.id } })
  assert.equal(ui.selected, team)
  assert.equal(ui.render().some(node => node.props?.children === 'CONVERSATION'), true)
})
