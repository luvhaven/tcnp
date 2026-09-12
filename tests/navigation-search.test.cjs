const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const mod = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/navigation-search.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText, { exports: mod.exports, module: mod, require })
const { filterNavigation } = mod.exports
const sections = [{ label: 'Knowledge', items: [{ name: 'Training', href: '/training' }] }, { label: 'Account', items: [{ name: 'My Profile', href: '/profile' }] }]
test('empty navigation search preserves the allowed list', () => {
  assert.equal(filterNavigation(sections, '  '), sections)
})
test('navigation search matches words, section names and case without mutating input', () => {
  const result = filterNavigation(sections, ' KNOWLEDGE train ')
  assert.equal(result.length, 1)
  assert.equal(result[0].items[0].href, '/training')
  assert.equal(sections.length, 2)
  assert.equal(sections[1].items.length, 1)
})
test('navigation search never introduces a destination outside the allowed list', () => {
  assert.equal(filterNavigation(sections, 'admin').length, 0)
  assert.equal(filterNavigation([], 'training').length, 0)
})
