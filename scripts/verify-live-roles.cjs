// Explicit opt-in only: creates isolated QA accounts, exercises RLS, then bans
// every account created by this run. Never sends invitations or real broadcasts.
require('@next/env').loadEnvConfig(process.cwd())
const { createClient } = require('@supabase/supabase-js')
const { createServerClient } = require('@supabase/ssr')
const { randomUUID, randomBytes } = require('node:crypto')
const assert = require('node:assert/strict')

if (!process.argv.includes('--create-test-accounts')) throw new Error('Explicit --create-test-accounts opt-in required')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key || !anon) throw new Error('Supabase configuration missing')
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const run = randomUUID().slice(0, 8)
const accounts = []
const results = []
async function checked(query) { const r = await query; if (r.error) throw r.error; return r.data }
async function check(name, fn) {
  try { await fn(); results.push({ name, passed: true }); console.log('PASS', name) }
  catch (error) { results.push({ name, passed: false }); console.log('FAIL', name, error.message); process.exitCode = 1 }
}

async function main() {
  console.log('QA run', run, 'project', new URL(url).hostname)
  try {
    const units = await checked(admin.from('units').select('id,slug').in('slug', ['victor', 'welfare']))
    const victor = units.find(u => u.slug === 'victor')
    const welfare = units.find(u => u.slug === 'welfare')
    if (!victor || !welfare) throw new Error('Required units are missing')
    for (const label of ['officer', 'head', 'admin', 'inactive']) {
      const email = `qa-${run}-${label}@example.com`
      const password = randomBytes(32).toString('base64url') + '!Aa7'
      const user = await checked(admin.auth.admin.createUser({ email, password, email_confirm: true,
        user_metadata: { full_name: `QA TEMP ${run} ${label}`, qa_run: run } }))
      const account = { id: user.user.id, label, email, password }
      accounts.push(account)
      await checked(admin.from('users').upsert({ id: account.id, email,
        full_name: `QA TEMP ${run} ${label}`, role: label === 'admin' ? 'admin' : 'delta_oscar',
        activation_status: label === 'inactive' ? 'pending' : 'active', is_active: label !== 'inactive',
        notification_preferences: { email: false, push: false, sms: false } }))
      const cookies = new Map()
      account.client = createServerClient(url, anon, { cookies: {
        getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
        setAll: values => values.forEach(({ name, value }) => cookies.set(name, value)),
      }, auth: { autoRefreshToken: false } })
      await checked(account.client.auth.signInWithPassword({ email, password }))
      account.cookie = () => [...cookies].map(([name, value]) => `${name}=${value}`).join('; ')
      console.log('CREATED', label, account.id)
    }
    const [officer, head, platformAdmin, inactive] = accounts
    await checked(admin.from('unit_memberships').upsert([
      { unit_id: victor.id, user_id: officer.id, access_level: 'member', status: 'active', managed_by_legacy: false },
      { unit_id: victor.id, user_id: head.id, access_level: 'head', status: 'active', managed_by_legacy: false },
    ], { onConflict: 'unit_id,user_id' }))
    for (const account of accounts) {
      await check(`${account.label}: Victor management boundary`, async () => {
        const allowed = await checked(account.client.rpc('can_manage_unit', { unit_slug: 'victor' }))
        assert.equal(allowed, ['head', 'admin'].includes(account.label))
      })
      await check(`${account.label}: Welfare management boundary`, async () => {
        const allowed = await checked(account.client.rpc('can_manage_unit', { unit_slug: 'welfare' }))
        assert.equal(allowed, account.label === 'admin')
      })
    }
    await check('officer cannot promote self', async () => {
      const r = await officer.client.from('users').update({ role: 'admin' }).eq('id', officer.id)
      const row = await checked(admin.from('users').select('role').eq('id', officer.id).single())
      assert.equal(row.role, 'delta_oscar')
      assert.ok(r.error)
    })
    await check('head cannot assign another unit', async () => {
      const r = await head.client.from('unit_memberships').insert({ unit_id: welfare.id, user_id: officer.id, access_level: 'head' })
      assert.ok(r.error)
    })
    await check('head can manage own unit member', async () => {
      const rows = await checked(head.client.from('unit_memberships').update({ status: 'inactive' }).eq('unit_id', victor.id).eq('user_id', officer.id).select('status'))
      assert.equal(rows.length, 1)
      assert.equal(rows[0].status, 'inactive')
    })
    const notificationIds = [randomUUID(), randomUUID()]
    await checked(admin.from('notifications').insert(accounts.slice(0, 2).map((account, i) => ({
      id: notificationIds[i], user_id: account.id, title: `QA ${run}`, message: 'Isolated permission test',
      type: 'announcement', channel: 'push', status: 'pending', is_read: false,
    }))))
    await check('notification recipient isolation', async () => {
      const rows = await checked(officer.client.from('notifications').select('id').in('id', notificationIds))
      assert.deepEqual(rows.map(r => r.id), [notificationIds[0]])
    })
    const base = process.argv.find(arg => arg.startsWith('--app-url='))?.slice(10) || process.env.QA_APP_URL || 'http://127.0.0.1:3100'
    await check('active officer can load the dashboard document', async () => {
      const r = await fetch(`${base}/dashboard`, { headers: { Cookie: officer.cookie() },
        redirect: 'manual', signal: AbortSignal.timeout(60000) })
      assert.equal(r.status, 200)
      const html = await r.text()
      assert.ok(html.includes('<html'))
      assert.ok(!html.includes('NEXT_REDIRECT'))
    })
    await check('active admin can use application administration', async () => {
      const r = await fetch(`${base}/api/admin/update-user`, { method: 'POST', headers: {
        'Content-Type': 'application/json', Cookie: platformAdmin.cookie() },
        body: JSON.stringify({ id: officer.id, full_name: `QA TEMP ${run} officer` }), signal: AbortSignal.timeout(15000) })
      assert.equal(r.status, 200)
    })
    for (const account of [officer, head, inactive]) {
      await check(`${account.label}: administrator HTTP endpoint rejects request`, async () => {
        const r = await fetch(`${base}/api/admin/update-user`, { method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: account.cookie() },
          body: JSON.stringify({ id: officer.id, full_name: `QA TEMP ${run} officer` }), signal: AbortSignal.timeout(15000) })
        assert.ok([401, 403].includes(r.status), `Unexpected HTTP ${r.status}`)
      })
    }
    await check('inactive account cannot log in through application', async () => {
      const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inactive.email, password: inactive.password }), signal: AbortSignal.timeout(15000) })
      assert.equal(r.status, 403)
    })
    await checked(admin.from('users').update({ is_active: false, activation_status: 'pending' }).eq('id', platformAdmin.id))
    await check('suspended admin loses HTTP administration immediately', async () => {
      const r = await fetch(`${base}/api/admin/update-user`, { method: 'POST', headers: {
        'Content-Type': 'application/json', Cookie: platformAdmin.cookie() },
        body: JSON.stringify({ id: officer.id, full_name: `QA TEMP ${run} officer` }), signal: AbortSignal.timeout(15000) })
      assert.ok([401, 403].includes(r.status), `Unexpected HTTP ${r.status}`)
    })
    for (const [path, method] of [['create-user', 'POST'], ['delete-user', 'DELETE'], ['bulk-assign-program', 'POST'], ['chat', 'POST'], ['chat', 'DELETE']]) {
      await check(`suspended admin rejected by ${method} ${path}`, async () => {
        const r = await fetch(`${base}/api/admin/${path}`, { method,
          headers: { 'Content-Type': 'application/json', Cookie: platformAdmin.cookie() },
          ...(method === 'POST' ? { body: '{}' } : {}), signal: AbortSignal.timeout(60000) })
        assert.ok([401, 403].includes(r.status), `Unexpected HTTP ${r.status}`)
      })
    }
  } finally {
    for (const account of accounts) {
      try {
        await checked(admin.from('users').update({ is_active: false, activation_status: 'pending' }).eq('id', account.id))
        await checked(admin.auth.admin.updateUserById(account.id, { ban_duration: '876000h' }))
        console.log('DISABLED', account.label, account.id)
      } catch (error) { console.error('CLEANUP FAILED', account.id, error.message); process.exitCode = 1 }
    }
    console.log(JSON.stringify({ run, passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length }))
  }
}
main().catch(error => { console.error('QA STOPPED:', error.message); process.exitCode = 1 })
