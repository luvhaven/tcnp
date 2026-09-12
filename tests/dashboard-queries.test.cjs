const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const mod = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/dashboard-queries.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: mod.exports, module: mod })
test('dashboard selects the unambiguous primary Papa relationship', () => {
  assert.match(mod.exports.DASHBOARD_JOURNEY_SELECT, /papas!journeys_papa_id_fkey\(/)
  assert.doesNotMatch(mod.exports.DASHBOARD_JOURNEY_SELECT, /\bpapas\(/)
  const page = fs.readFileSync('app/(dashboard)/dashboard/page.tsx', 'utf8')
  assert.equal((page.match(/\.select\(DASHBOARD_JOURNEY_SELECT/g) || []).length, 2)
  const alerts = fs.readFileSync('components/dashboard/JourneyAlerts.tsx', 'utf8')
  assert.match(alerts, /papas!journeys_papa_id_fkey\(/)
  assert.doesNotMatch(alerts, /\bpapas\(/)
})
