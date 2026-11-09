const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

let PGlite
try {
  ;({ PGlite } = require(process.env.CHAT_POSTGRES_RUNTIME || path.resolve('.next/chat-sql-qa/node_modules/@electric-sql/pglite')))
} catch {}

test('officer migration preserves grants, protects Executive and Admin access, and rejects duplicate emails', { skip: !PGlite }, async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS text LANGUAGE sql STABLE AS
      $$ SELECT current_setting('test.user_id', true) $$;
    CREATE FUNCTION public.is_trusted_backend() RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT coalesce(current_setting('test.untrusted', true), '') <> 'yes' $$;
    CREATE TYPE public.user_role AS ENUM ('admin', 'captain', 'vice_captain', 'head_of_command', 'tango_oscar');
    CREATE TABLE public.users (
      id text PRIMARY KEY, email text NOT NULL, role user_role NOT NULL,
      team text CHECK (team IN ('strength', 'wisdom', 'swift')), oscar text,
      is_team_head boolean, is_active boolean DEFAULT true, activation_status text DEFAULT 'active'
    );
    CREATE FUNCTION public.notify_team_chat_join() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN
        IF NEW.team = 'executive' THEN RAISE EXCEPTION 'Executive has no team room'; END IF;
        RETURN NEW;
      END $$;
    INSERT INTO users (id, email, role, team, oscar, is_team_head) VALUES
      ('legacy', 'admin@example.com', 'admin', 'wisdom', 'Tango Oscar', false),
      ('captain', 'captain@example.com', 'captain', 'wisdom', null, true),
      ('vice', 'vice@example.com', 'vice_captain', null, null, false),
      ('command', 'command@example.com', 'head_of_command', null, 'Command', false),
      ('tango', 'tango@example.com', 'tango_oscar', 'swift', 'Tango Oscar', false);
  `)
  await db.exec(fs.readFileSync('supabase/migrations/20261109120000_separate_officer_admin_access.sql', 'utf8'))

  const officer = async id => (await db.query('SELECT role, team, oscar, has_admin_access FROM users WHERE id = $1', [id])).rows[0]
  const rank = async id => {
    await db.query("SELECT set_config('test.user_id', $1, false)", [id])
    return (await db.query('SELECT public.current_user_platform_rank() AS rank')).rows[0].rank
  }
  assert.equal((await officer('legacy')).has_admin_access, true)
  assert.equal(await rank('command'), 80)
  assert.equal(await rank('tango'), 0)
  for (const id of ['captain', 'vice']) {
    const row = await officer(id)
    assert.equal(row.team, 'executive')
    assert.equal(row.oscar, 'Executive')
    assert.equal(row.has_admin_access, false)
    assert.equal(await rank(id), 80)
  }

  await db.exec("UPDATE users SET has_admin_access = true WHERE id = 'tango'")
  assert.deepEqual(await officer('tango'), { role: 'tango_oscar', team: 'swift', oscar: 'Tango Oscar', has_admin_access: true })
  assert.equal(await rank('tango'), 80)
  assert.deepEqual((await db.query('SELECT public.current_user_claim_roles()::text[] AS roles')).rows[0].roles, ['tango_oscar', 'admin'])
  await db.exec("UPDATE users SET is_active = false WHERE id = 'tango'")
  assert.equal(await rank('tango'), null)

  await assert.rejects(db.exec("UPDATE users SET email = ' TANGO@EXAMPLE.COM ' WHERE id = 'command'"), { code: '23505' })
  await assert.rejects(db.exec("INSERT INTO users(id, email, role) VALUES ('duplicate', 'TANGO@example.com', 'tango_oscar')"), { code: '23505' })
  await db.exec("SELECT set_config('test.untrusted', 'yes', false)")
  await assert.rejects(db.exec("UPDATE users SET has_admin_access = true WHERE id = 'vice'"), { code: '42501' })
  await assert.rejects(db.exec("UPDATE users SET role = 'captain' WHERE id = 'tango'"), { code: '42501' })
  await db.exec("UPDATE users SET team = 'executive', oscar = 'Executive' WHERE id = 'tango'")
  assert.equal((await officer('tango')).team, null)
  assert.equal((await officer('tango')).oscar, null)
})
