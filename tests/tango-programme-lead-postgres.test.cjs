const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
let PGlite
try { ({ PGlite } = require(process.env.CHAT_POSTGRES_RUNTIME || path.resolve('.next/chat-sql-qa/node_modules/@electric-sql/pglite'))) } catch {}
const id = n => `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const MIGRATION = 'supabase/migrations/20261121140000_tango_programme_lead.sql'

test('migration has no transaction control', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8').replace(/--.*$/gm, '')
  assert.doesNotMatch(sql, /^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/m)
})

test('the Tango page asks the database whether the officer is a programme lead', () => {
  const hook = fs.readFileSync('hooks/useUnitAccess.ts', 'utf8')
  assert.match(hook, /rpc\('is_tango_programme_lead'\)/)
  assert.match(hook, /enabled: unit === 'tango' && Boolean\(currentUser\?\.id\) && access\.isMember && !access\.canManage/)
  assert.match(hook, /canManage: access\.canManage \|\| programmeLead/)
})

test("a programme's Tango Team Lead manages Tango for that programme only, and never the unit's membership", { skip: !PGlite }, async t => {
  const db = new PGlite()
  t.after(() => db.close())
  // 1 permanent head, 2 programme lead (member), 3 plain member, 4 lead title but not a Tango member,
  // 5 lead on a completed programme, 6 lead whose title was removed, 7 Alpha member.
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT current_setting('test.user')::uuid $$;
    CREATE FUNCTION is_platform_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE TABLE users(id uuid PRIMARY KEY, is_active boolean DEFAULT true, activation_status text DEFAULT 'active');
    CREATE TABLE units(id uuid PRIMARY KEY, slug text, is_active boolean DEFAULT true);
    CREATE TABLE unit_memberships(id serial PRIMARY KEY, unit_id uuid, user_id uuid, access_level text, status text DEFAULT 'active');
    CREATE TABLE programs(id uuid PRIMARY KEY, status text);
    CREATE TABLE official_titles(id uuid PRIMARY KEY, code text);
    CREATE TABLE title_assignments(user_id uuid, title_id uuid, program_id uuid, is_active boolean);
    ALTER TABLE unit_memberships ENABLE ROW LEVEL SECURITY;
    CREATE POLICY read_all ON unit_memberships FOR SELECT TO authenticated USING (true);
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
    INSERT INTO users(id) SELECT ('40000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid FROM generate_series(1, 7) n;
    INSERT INTO units VALUES ('${id(100)}','tango'), ('${id(101)}','alpha');
    INSERT INTO unit_memberships(unit_id, user_id, access_level) VALUES
      ('${id(100)}','${id(1)}','head'), ('${id(100)}','${id(2)}','member'), ('${id(100)}','${id(3)}','member'),
      ('${id(100)}','${id(5)}','member'), ('${id(100)}','${id(6)}','member'), ('${id(101)}','${id(7)}','member'), ('${id(101)}','${id(2)}','member');
    INSERT INTO programs VALUES ('${id(200)}','Active'), ('${id(201)}','completed');
    INSERT INTO official_titles VALUES ('${id(300)}','TANGO_OSCAR_LEAD'), ('${id(301)}','TANGO_OSCAR');
    INSERT INTO title_assignments VALUES ('${id(2)}','${id(300)}','${id(200)}',true), ('${id(3)}','${id(301)}','${id(200)}',true),
      ('${id(4)}','${id(300)}','${id(200)}',true), ('${id(5)}','${id(300)}','${id(201)}',true), ('${id(6)}','${id(300)}','${id(200)}',false);
    SELECT set_config('test.user','${id(1)}',false);`)
  await db.exec(fs.readFileSync(MIGRATION, 'utf8'))
  const as = async (n, sql) => { await db.exec(`SELECT set_config('test.user','${id(n)}',false)`); return (await db.query(sql)).rows[0] }
  const rights = n => as(n, `SELECT can_manage_unit('tango') AS manage, can_coordinate_unit('tango') AS coordinate, is_unit_head('tango') AS head, can_manage_unit('alpha') AS alpha`)

  assert.deepEqual(await rights(1), { manage: true, coordinate: true, head: true, alpha: false }, 'the head of Tango keeps everything')
  assert.deepEqual(await rights(2), { manage: true, coordinate: true, head: false, alpha: false }, 'the programme lead manages Tango, is not the head, and gains nothing in another unit')
  for (const [n, why] of [[3, 'plain member'], [4, 'lead title without Tango membership'], [5, 'programme completed'], [6, 'title removed'], [7, 'another unit']]) {
    assert.deepEqual(await rights(n), { manage: false, coordinate: false, head: false, alpha: false }, why)
  }

  await t.test('the right ends when the programme closes', async () => {
    await db.exec(`UPDATE programs SET status='completed' WHERE id='${id(200)}'`)
    assert.equal((await rights(2)).manage, false)
    await db.exec(`UPDATE programs SET status='planning' WHERE id='${id(200)}'`)
    assert.equal((await rights(2)).manage, true, 'and covers the planning stage')
  })

  await t.test('only the permanent head changes who is in the unit', async () => {
    const promote = async n => {
      await db.exec(`SELECT set_config('test.user','${id(n)}',false); SET ROLE authenticated`)
      try { return (await db.query(`UPDATE unit_memberships SET access_level='head' WHERE user_id='${id(3)}' AND unit_id='${id(100)}' RETURNING id`)).rows.length }
      finally { await db.exec('RESET ROLE') }
    }
    assert.equal(await promote(2), 0, 'a programme lead cannot promote anyone')
    assert.equal(await promote(1), 1, 'the head can')
  })
})
