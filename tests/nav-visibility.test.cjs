const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

// Load a TypeScript module with "@/..." imports resolved to other loaded modules.
const cache = {}
function load(file) {
  if (cache[file]) return cache[file]
  const mod = { exports: {} }
  cache[file] = mod.exports
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const localRequire = (name) => {
    if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => key })
    if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`)
    return require(name)
  }
  vm.runInNewContext(source, { exports: mod.exports, module: mod, require: localRequire })
  cache[file] = mod.exports
  return mod.exports
}

const { getVisibleNav } = load('components/layout/nav-config.ts')
const hrefs = (...args) => getVisibleNav(...args).map(item => item.href)

test('Den and Serial are reachable through unit membership alone', () => {
  assert.ok(hrefs('viewer', 'November (Den)', ['november_den']).includes('/den'))
  assert.ok(hrefs('viewer', null, ['serial']).includes('/serial'))
  assert.ok(!hrefs('viewer', null, []).includes('/den'))
})

test('the SOP manual is in everyone\'s navigation', () => {
  assert.ok(hrefs('viewer', null, []).includes('/sop'))
  assert.ok(hrefs(null, null, []).includes('/sop'))
})

test('Officers is offered only to those the page admits', () => {
  assert.ok(hrefs('admin', null, []).includes('/officers'))
  assert.ok(hrefs('viewer', null, [], true).includes('/officers'))
  // Command and the heads of operations used to see a link that bounced them to the dashboard.
  for (const role of ['command', 'head_of_command', 'head_of_operations']) {
    assert.ok(!hrefs(role, null, []).includes('/officers'), role)
  }
})

test('the Head of Command sees Approvals for programme additions', () => {
  assert.ok(hrefs('head_of_command', null, []).includes('/approvals'))
  assert.ok(!hrefs('viewer', 'November (Den)', []).includes('/approvals'))
})

test('Journeys is listed for leadership', () => {
  assert.ok(hrefs('admin', null, []).includes('/journeys'))
})
