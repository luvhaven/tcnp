const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')

test('an open dashboard refreshes program data on remote deletion and catches up on reconnect', async () => {
  const keys = [['programs', 'full'], ['programs-lite'], ['chat-rooms'], ['theatres'], ['currentUser']]
  const calls = []
  const cleanup = []
  const timers = new Set()
  const exports = {}
  let receive
  let status
  let removed = false
  const channel = {
    on(type, filter, callback) {
      assert.equal(type, 'broadcast')
      assert.equal(filter.event, 'deleted')
      receive = callback
      return this
    },
    subscribe(callback) { status = callback; return this },
  }
  const supabase = {
    channel(topic, options) {
      assert.equal(topic, 'dashboard-deletions')
      assert.equal(options.config.private, true)
      return channel
    },
    async removeChannel(value) {
      assert.equal(value, channel)
      removed = true
    },
  }
  const queryClient = {
    async cancelQueries(filters) { calls.push(['cancel', keys.filter(key => filters.predicate({ queryKey: key }))]) },
    async invalidateQueries(filters) { calls.push(['invalidate', keys.filter(key => filters.predicate({ queryKey: key }))]) },
  }
  const source = fs.readFileSync('hooks/useDashboardDeletions.ts', 'utf8')
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, {
    exports,
    require: name => ({
      react: { useEffect: effect => cleanup.push(effect()), useEffectEvent: callback => callback },
      '@tanstack/react-query': { useQueryClient: () => queryClient },
      '@/lib/supabase/client': { createClient: () => supabase },
    })[name],
    setTimeout: callback => { timers.add(callback); return callback },
    clearTimeout: callback => timers.delete(callback),
  })
  const flush = async () => {
    for (const callback of timers) {
      timers.delete(callback)
      callback()
    }
    await Promise.resolve()
  }
  let programReloads = 0
  let theatreReloads = 0
  exports.useReloadOnDeletion(['programs'], () => { programReloads++ })
  exports.useReloadOnDeletion(['theatres'], () => { theatreReloads++ })
  exports.useDashboardDeletions('officer')
  await Promise.resolve()

  receive({ payload: { table: 'programs' } })
  receive({ payload: { table: 'programs' } })
  await flush()
  assert.deepEqual(calls, [['cancel', keys.slice(0, 3)], ['invalidate', keys.slice(0, 3)]])
  assert.equal(programReloads, 1)
  assert.equal(theatreReloads, 0)

  calls.length = 0
  status('SUBSCRIBED')
  await flush()
  assert.deepEqual(calls, [['cancel', keys.slice(0, 4)], ['invalidate', keys.slice(0, 4)]])
  assert.equal(programReloads, 2)
  assert.equal(theatreReloads, 1)

  receive({ payload: { table: 'programs' } })
  cleanup.reverse().forEach(stop => stop())
  await flush()
  assert.equal(removed, true)
  assert.equal(programReloads, 2)
})
