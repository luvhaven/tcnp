const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

let PGlite
try {
  ;({ PGlite } = require(process.env.CHAT_POSTGRES_RUNTIME || path.resolve('.next/chat-sql-qa/node_modules/@electric-sql/pglite')))
} catch {}

test('mission availability reaches only the selected audience', { skip: !PGlite && 'PostgreSQL runtime unavailable' }, async t => {
  const db = new PGlite()
  t.after(() => db.close())
  const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0')
  const [program, swift, strength, wisdom, other, inactive, hidden, legacy] = Array.from({ length: 8 }, (_, i) => uuid(i + 1))
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT current_setting('test.user_id')::uuid $$;
    CREATE FUNCTION public.is_active_member() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT auth.uid() = '${other}' $$;
    CREATE TABLE public.users (
      id uuid PRIMARY KEY, gender text, team text, is_active boolean, activation_status text, is_directory_hidden boolean
    );
    CREATE TABLE public.programs (id uuid PRIMARY KEY);
    CREATE TYPE notification_channel AS ENUM ('push');
    CREATE TABLE public.notifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, title text,
      message text NOT NULL, type text, channel notification_channel, metadata jsonb, is_read boolean
    );
    INSERT INTO public.programs VALUES ('${program}');
    INSERT INTO public.users VALUES
      ('${swift}', 'male', 'swift', true, 'active', false),
      ('${strength}', 'female', 'strength', true, 'active', false),
      ('${wisdom}', 'male', 'wisdom', true, 'active', false),
      ('${other}', 'prefer_not_to_say', null, true, 'active', false),
      ('${inactive}', 'female', 'strength', false, 'active', false),
      ('${hidden}', 'male', 'swift', true, 'active', true);
  `)
  const base = fs.readFileSync('supabase/migrations/20260706235332_teams_and_unit_feature_tables.sql', 'utf8')
  await db.exec(base.slice(base.indexOf('CREATE TABLE IF NOT EXISTS public.mission_requests')))
  await db.exec(`
    GRANT SELECT ON public.mission_requests TO authenticated;
    GRANT SELECT, INSERT, UPDATE ON public.mission_responses TO authenticated;
    INSERT INTO public.mission_requests (id, program_id, title, deadline)
    VALUES ('${legacy}', '${program}', 'Legacy request', now() + interval '1 day');
  `)
  await db.exec(fs.readFileSync('supabase/migrations/20261109140000_mission_request_audiences.sql', 'utf8'))

  const send = (audience, message = 'Confirm availability') => db.query(
    "SELECT * FROM public.send_mission_availability_request($1, 'Request', NULL, now() + interval '1 day', $2, $3, $4)",
    [program, other, audience, message],
  )
  const groups = { all: [swift, strength, wisdom, other], male: [swift, wisdom], female: [strength], swift: [swift], strength: [strength], wisdom: [wisdom] }
  const requests = new Map()
  for (const [audience, expected] of Object.entries(groups)) {
    await db.exec('SET ROLE service_role')
    const { rows: [request] } = await send(audience)
    assert.equal(request.recipients, expected.length)
    requests.set(audience, request.request_id)
    await db.exec('RESET ROLE')
    const { rows } = await db.query(
      "SELECT user_id FROM public.notifications WHERE metadata->>'request_id' = $1 ORDER BY user_id", [request.request_id],
    )
    assert.deepEqual(rows.map(row => row.user_id), expected)
  }
  await assert.rejects(send('swift', null), /not-null constraint/)
  assert.equal((await db.query('SELECT id FROM public.mission_requests')).rows.length, 7)

  await db.exec(`UPDATE public.users SET team = 'swift' WHERE id = '${strength}'`)
  const as = userId => db.exec(`RESET ROLE; SET test.user_id = '${userId}'; SET ROLE authenticated;`)
  const visible = async () => (await db.query('SELECT id FROM public.mission_requests')).rows.map(row => row.id)
  const respond = id => db.query(
    "INSERT INTO public.mission_responses (request_id, user_id, response) VALUES ($1, auth.uid(), 'yes')", [id],
  )
  await as(strength)
  assert.deepEqual(new Set(await visible()), new Set([legacy, ...['all', 'female', 'strength'].map(a => requests.get(a))]))
  await assert.rejects(respond(requests.get('swift')), /row-level security/)
  await respond(legacy)
  await respond(requests.get('female'))

  await as(other)
  assert.equal((await visible()).length, 7)
  const { rows: addressed } = await db.query('SELECT request_id FROM public.mission_request_recipients')
  assert.deepEqual(addressed, [{ request_id: requests.get('all') }])
  await assert.rejects(respond(requests.get('female')), /row-level security/)
  await assert.rejects(send('all'), /permission denied/)
})
