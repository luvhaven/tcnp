const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const React = require('react')
const { renderToString } = require('react-dom/server')
const testModule = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('hooks/useBrowserSnapshot.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: testModule.exports, module: testModule, require })

test('browser snapshots use the server fallback without touching browser APIs', () => {
  function Probe() {
    const value = testModule.exports.useBrowserSnapshot(() => { throw new Error('Browser read during SSR') }, 'server')
    return React.createElement('span', null, value)
  }
  assert.equal(renderToString(React.createElement(Probe)), '<span>server</span>')
})

test('online status can render without window or navigator', () => {
  function Probe() {
    return React.createElement('span', null, String(testModule.exports.useOnlineStatus()))
  }
  assert.equal(renderToString(React.createElement(Probe)), '<span>true</span>')
})
