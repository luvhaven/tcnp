const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function setup({ entries, databaseError = null, userId = 'officer-a' }) {
  const removed = [], retried = [], writes = []
  const queue = {
    getQueueCount: async () => entries.length,
    getAllPending: async () => entries,
    removeFromQueue: async id => removed.push(id),
    incrementRetry: async id => retried.push(id),
  }
  const client = {
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) },
    from: table => ({ upsert: async (data, options) => {
      writes.push({ table, data, options })
      return { error: databaseError }
    } }),
  }
  const testModule = { exports: {} }
  const source = ts.transpileModule(fs.readFileSync('lib/sync-service.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  vm.runInNewContext(source, {
    module: testModule, exports: testModule.exports, navigator: { onLine: true }, console,
    require: name => name === '@/lib/supabase/client' ? { createClient: () => client }
      : name === './offline-queue' ? { offlineQueue: queue }
      : { toast: { success() {}, error() {} } },
  })
  return { service: testModule.exports.syncService, removed, retried, writes }
}
const entry = { id: 'queue-1', ownerId: 'officer-a', type: 'incident', data: { id: 'stable-id' }, retries: 12 }
test('database rejection retains the queued submission even after many retries', async () => {
  const ctx = setup({ entries: [entry], databaseError: { message: 'RLS denied' } })
  await ctx.service.syncAll()
  assert.deepEqual(ctx.removed, [])
  assert.deepEqual(ctx.retried, ['queue-1'])
})
test('successful replay uses the stable ID and removes only the acknowledged submission', async () => {
  const ctx = setup({ entries: [entry] })
  await ctx.service.syncAll()
  assert.deepEqual(ctx.removed, ['queue-1'])
  assert.equal(ctx.writes[0].data[0].id, 'stable-id')
  assert.equal(ctx.writes[0].options.ignoreDuplicates, true)
})
test('another account and unowned legacy submissions are never replayed', async () => {
  const ctx = setup({ entries: [{ ...entry, ownerId: 'officer-b' }, { ...entry, ownerId: undefined }] })
  await ctx.service.syncAll()
  assert.equal(ctx.writes.length, 0)
  assert.equal(ctx.removed.length, 0)
})
test('expired authentication cannot consume the outbox', async () => {
  const ctx = setup({ entries: [entry], userId: null })
  await ctx.service.syncAll()
  assert.equal(ctx.writes.length, 0)
  assert.equal(ctx.removed.length, 0)
})

test('unavailable device storage rejects saving instead of reporting success', async () => {
  const testModule = { exports: {} }
  const source = ts.transpileModule(fs.readFileSync('lib/offline-queue.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  vm.runInNewContext(source, {
    module: testModule, exports: testModule.exports, window: {}, console,
    require: () => ({ createClient: () => { throw new Error('Should not authenticate without storage') } }),
  })
  await assert.rejects(testModule.exports.offlineQueue.addToQueue('incident', {}), /Offline storage is unavailable/)
})
