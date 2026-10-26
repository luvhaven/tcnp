const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
let PGlite
try { ({ PGlite } = require(process.env.CHAT_POSTGRES_RUNTIME || path.resolve('.next/chat-sql-qa/node_modules/@electric-sql/pglite'))) } catch {}
const uuid = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('PostgreSQL invitation notifications, device isolation and durable delivery leases', { skip: !PGlite }, async t => {
  const db = new PGlite()
  t.after(() => db.close())
  // Vault encryption and outbound HTTP/Cron are provider extensions. Stub their
  // interfaces; all application triggers, grants, FKs and outbox SQL run in PG.
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA vault; CREATE SCHEMA net; CREATE SCHEMA cron;
    CREATE TABLE auth.sessions(id uuid PRIMARY KEY);
    CREATE TABLE users(id uuid PRIMARY KEY,is_active boolean,activation_status text,team text);
    CREATE TABLE programs(id uuid PRIMARY KEY,name text,status text);
    CREATE TABLE papas(id uuid PRIMARY KEY,full_name text,program_id uuid,is_deleted boolean);
    CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES users(id),title text,message text,type text,channel text,metadata jsonb);
    CREATE TABLE chat_room_memberships(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,program_id uuid,papa_id uuid);
    CREATE TABLE title_assignments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,program_id uuid,is_active boolean);
    CREATE VIEW current_title_assignments AS SELECT * FROM title_assignments WHERE is_active=true;
    CREATE TABLE vault.decrypted_secrets(id uuid DEFAULT gen_random_uuid(),decrypted_secret text);
    CREATE FUNCTION vault.create_secret(s text,n text,d text) RETURNS uuid LANGUAGE plpgsql AS $$ DECLARE k uuid:=gen_random_uuid(); BEGIN INSERT INTO vault.decrypted_secrets VALUES(k,s); RETURN k; END $$;
    CREATE FUNCTION net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
    CREATE FUNCTION cron.schedule(n text,s text,q text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
    GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role;
    INSERT INTO users VALUES('${uuid(1)}',true,'active',null),('${uuid(2)}',true,'active',null),('${uuid(3)}',false,'active',null);
    INSERT INTO auth.sessions VALUES('${uuid(4)}');
    INSERT INTO programs VALUES('${uuid(5)}','Open program','active'),('${uuid(6)}','Archived','archived');
    INSERT INTO papas VALUES('${uuid(7)}','Papa','${uuid(5)}',false);`)
  const sql = fs.readFileSync('supabase/migrations/20261026120000_device_push_and_chat_invites.sql', 'utf8').replace(/^CREATE EXTENSION.*$/gm, '')
  await db.exec(sql)
  const scalar = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0]
  await db.exec(`INSERT INTO device_push_subscriptions(id,user_id,session_id,endpoint,p256dh,auth_key) VALUES('${uuid(8)}','${uuid(1)}','${uuid(4)}','https://fcm.googleapis.com/one','key','auth'),('${uuid(9)}','${uuid(2)}','${uuid(4)}','https://fcm.googleapis.com/two','key','auth');`)

  await t.test('exact room invitation creates a detailed bell alert and one job only for its recipient', async () => {
    await db.exec(`INSERT INTO chat_room_memberships VALUES('${uuid(10)}','${uuid(1)}','${uuid(5)}','${uuid(7)}');`)
    const notice = (await db.query('SELECT * FROM notifications')).rows[0]
    assert.equal(notice.user_id, uuid(1)); assert.match(notice.message, /Papa/)
    assert.equal(notice.metadata.url, `/chat?programId=${uuid(5)}&papaId=${uuid(7)}`)
    assert.equal(await scalar('SELECT count(*)::int FROM notification_push_outbox'), 1)
    assert.equal(await scalar('SELECT subscription_id FROM notification_push_outbox'), uuid(8))
    await db.exec(`INSERT INTO chat_room_memberships(user_id,program_id) VALUES('${uuid(1)}','${uuid(6)}'),('${uuid(3)}','${uuid(5)}');`)
    assert.equal(await scalar('SELECT count(*)::int FROM notifications'), 1)
  })
  await t.test('program assignment notifies on first join and reactivation, not each extra title/update', async () => {
    await db.exec(`INSERT INTO title_assignments VALUES('${uuid(11)}','${uuid(2)}','${uuid(5)}',true); UPDATE title_assignments SET is_active=true WHERE id='${uuid(11)}'; INSERT INTO title_assignments VALUES('${uuid(12)}','${uuid(2)}','${uuid(5)}',true);`)
    assert.equal(await scalar('SELECT count(*)::int FROM notifications'), 2)
    await db.exec(`UPDATE title_assignments SET is_active=false; UPDATE title_assignments SET is_active=true WHERE id='${uuid(11)}';`)
    assert.equal(await scalar('SELECT count(*)::int FROM notifications'), 3)
  })
  await t.test('team assignment also notifies once, without presence-update spam', async () => {
    await db.exec(`UPDATE users SET team='strength' WHERE id='${uuid(1)}'; UPDATE users SET is_active=true WHERE id='${uuid(1)}';`)
    assert.equal(await scalar('SELECT count(*)::int FROM notifications'), 4)
    assert.equal(await scalar("SELECT metadata->>'url' FROM notifications WHERE title='Added to Team chat'"), '/chat?team=strength')
  })
  await t.test('leases isolate concurrent dispatchers, ignore stale completion and retry with backoff', async () => {
    const jobs = (await db.query('SELECT * FROM claim_notification_push(1)')).rows
    assert.equal(jobs.length, 1); assert.equal(jobs[0].attempts, 1)
    const remaining = (await db.query('SELECT * FROM claim_notification_push(30)')).rows
    assert.equal(remaining.some(j => j.id === jobs[0].id), false)
    await db.query('SELECT settle_notification_push($1,$2,true,null,null)', [jobs[0].id, uuid(99)])
    assert.equal(await scalar('SELECT delivered_at FROM notification_push_outbox WHERE id=$1', [jobs[0].id]), null)
    await db.query('SELECT settle_notification_push($1,$2,false,$3,60)', [jobs[0].id, jobs[0].lease_id, 'push_503'])
    assert.equal((await db.query('SELECT * FROM claim_notification_push(30)')).rows.length, 0)
    await db.exec(`UPDATE notification_push_outbox SET available_at=now()-interval '1 minute',locked_until=now()-interval '1 minute';`)
    const retry = (await db.query('SELECT * FROM claim_notification_push(30)')).rows.find(j => j.id === jobs[0].id)
    assert.equal(retry.attempts, 2)
    await db.query('SELECT settle_notification_push($1,$2,true,null,null)', [retry.id, retry.lease_id])
    assert.ok(await scalar('SELECT delivered_at FROM notification_push_outbox WHERE id=$1', [retry.id]))
  })
  await t.test('crashed final attempts expire, no unbounded retries', async () => {
    await db.exec(`UPDATE notification_push_outbox SET attempts=8,locked_until=now()-interval '1 minute' WHERE delivered_at IS NULL; SELECT claim_notification_push(30);`)
    assert.equal(await scalar('SELECT count(*)::int FROM notification_push_outbox WHERE delivered_at IS NULL AND failed_at IS NULL'), 0)
  })
  await t.test('private configuration is service only; signing secrets are not stored in public config', async () => {
    await db.query('SELECT configure_device_push($1,$2,$3,$4,$5)', ['A'.repeat(87), 'B'.repeat(43), 'https://tcnp.vercel.app', 'C'.repeat(43), 'https://tcnp.vercel.app/api/notifications/dispatch'])
    assert.equal((await scalar('SELECT get_device_push_config()')).privateKey, 'B'.repeat(43))
    await db.exec('SET ROLE authenticated')
    await assert.rejects(db.exec('SELECT get_device_push_config()'), { code: '42501' })
    await assert.rejects(db.exec('SELECT * FROM device_push_subscriptions'), { code: '42501' })
    await assert.rejects(db.exec('SELECT claim_notification_push(10)'), { code: '42501' })
    await db.exec('RESET ROLE')
    await db.exec(`DELETE FROM auth.sessions WHERE id='${uuid(4)}'`)
    assert.equal(await scalar('SELECT count(*)::int FROM device_push_subscriptions'), 0)
    assert.equal(await scalar('SELECT count(*)::int FROM notification_push_outbox'), 0)
  })
})
