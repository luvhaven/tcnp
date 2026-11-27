const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
let PGlite
try { ({ PGlite } = require(process.env.CHAT_POSTGRES_RUNTIME || path.resolve('.next/chat-sql-qa/node_modules/@electric-sql/pglite'))) } catch {}
const id = n => `50000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const hash = n => String(n).repeat(64).slice(0, 64)
const MIGRATION = 'supabase/migrations/20261127100000_location_device_tokens.sql'

test('migration has no transaction control and stores only a hash', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8')
  assert.doesNotMatch(sql.replace(/--.*$/gm, ''), /^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/m)
  assert.match(sql, /token_hash text NOT NULL UNIQUE/)
  assert.doesNotMatch(sql.replace(/--.*$/gm, ''), /\btoken text\b/)
})

test('a device token publishes only its own officer, only while sharing is on', { skip: !PGlite }, async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE FUNCTION is_trusted_backend() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('test.trusted') = 'true' $$;
    CREATE TABLE users(id uuid PRIMARY KEY, is_active boolean DEFAULT true, activation_status text DEFAULT 'active', location_sharing_enabled boolean DEFAULT true);
    CREATE TABLE user_locations(user_id uuid, latitude numeric, longitude numeric, battery_level integer, device_id text, updated_at timestamptz DEFAULT now());
    -- Stand-in with the real function's contract: refuses with 42501 when sharing is off.
    CREATE FUNCTION upsert_user_location(p_user_id uuid, p_latitude numeric, p_longitude numeric, p_accuracy numeric, p_altitude numeric, p_heading numeric, p_speed numeric, p_battery_level integer, p_device_id text)
    RETURNS uuid LANGUAGE plpgsql AS $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id AND location_sharing_enabled AND is_active AND activation_status = 'active') THEN
        RAISE EXCEPTION 'Location sharing is off' USING ERRCODE = '42501';
      END IF;
      INSERT INTO user_locations(user_id, latitude, longitude, battery_level, device_id) VALUES (p_user_id, p_latitude, p_longitude, p_battery_level, p_device_id);
      RETURN gen_random_uuid();
    END $$;
    INSERT INTO users(id) VALUES ('${id(1)}'), ('${id(2)}');
    INSERT INTO users(id, is_active) VALUES ('${id(3)}', false);
    SELECT set_config('test.trusted', 'true', false);`)
  await db.exec(fs.readFileSync(MIGRATION, 'utf8'))
  const one = async (sql, params) => (await db.query(sql, params)).rows[0]
  const ingest = h => one(`SELECT ingest_device_location($1, 6.5, 3.3, 5, NULL, NULL, 2, 80) AS r`, [h]).then(r => r.r)
  const live = async () => (await db.query(`SELECT user_id, device_id FROM location_device_tokens WHERE revoked_at IS NULL ORDER BY device_id`)).rows

  await t.test('issuing gives one live token per phone and retires the previous holder', async () => {
    await db.query(`SELECT issue_location_device_token($1, 'phone-aaaa', $2, 'android')`, [id(1), hash(1)])
    await db.query(`SELECT issue_location_device_token($1, 'phone-bbbb', $2, 'ios')`, [id(2), hash(2)])
    assert.equal(await ingest(hash(1)), 'ok')
    // Officer 2 signs in on officer 1's phone.
    await db.query(`SELECT issue_location_device_token($1, 'phone-aaaa', $2, 'android')`, [id(2), hash(3)])
    assert.deepEqual(await live(), [{ user_id: id(2), device_id: 'phone-aaaa' }, { user_id: id(2), device_id: 'phone-bbbb' }])
    assert.equal(await ingest(hash(1)), 'invalid', "the previous officer's token no longer works")
    assert.equal(await ingest(hash(3)), 'ok')
  })

  await t.test('the position is recorded for the token owner with the device id', async () => {
    const row = await one(`SELECT user_id, device_id, battery_level FROM user_locations ORDER BY updated_at DESC, device_id LIMIT 1`)
    assert.equal(row.user_id, id(2)); assert.equal(row.battery_level, 80)
    const used = await one(`SELECT last_used_at FROM location_device_tokens WHERE token_hash = $1`, [hash(3)])
    assert.ok(used.last_used_at)
  })

  await t.test('uploads are refused while sharing is off, and work again when it is back on', async () => {
    await db.exec(`UPDATE users SET location_sharing_enabled = false WHERE id = '${id(2)}'`)
    const before = (await one(`SELECT count(*)::int AS n FROM user_locations`)).n
    assert.equal(await ingest(hash(3)), 'sharing_off')
    assert.equal((await one(`SELECT count(*)::int AS n FROM user_locations`)).n, before)
    await db.exec(`UPDATE users SET location_sharing_enabled = true WHERE id = '${id(2)}'`)
    assert.equal(await ingest(hash(3)), 'ok')
  })

  await t.test('unknown tokens, inactive accounts and malformed requests are rejected', async () => {
    assert.equal(await ingest(hash(9)), 'invalid')
    await assert.rejects(db.query(`SELECT issue_location_device_token($1, 'phone-cccc', $2, 'ios')`, [id(3), hash(4)]), error => error.code === '42501')
    await assert.rejects(db.query(`SELECT issue_location_device_token($1, 'phone-cccc', 'not-a-hash', 'ios')`, [id(1)]), error => error.code === '22023')
  })

  await t.test('signing out revokes the device, and only the server can call any of it', async () => {
    assert.equal((await one(`SELECT revoke_location_device_tokens($1, 'phone-aaaa') AS n`, [id(2)])).n, 1)
    assert.equal(await ingest(hash(3)), 'invalid')
    for (const fn of ['issue_location_device_token(uuid, text, text, text)', 'revoke_location_device_tokens(uuid, text)', 'ingest_device_location(text, numeric, numeric, numeric, numeric, numeric, numeric, integer)']) {
      assert.equal((await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'execute') AS ok`)).ok, false, fn)
    }
    assert.equal((await one(`SELECT has_table_privilege('authenticated', 'public.location_device_tokens', 'select') AS ok`)).ok, false)
    await db.exec(`SELECT set_config('test.trusted', 'false', false)`)
    await assert.rejects(db.query(`SELECT ingest_device_location($1, 6.5, 3.3)`, [hash(2)]), error => error.code === '42501')
  })
})
