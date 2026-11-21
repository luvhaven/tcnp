const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
let PGlite
try { ({ PGlite } = require(process.env.CHAT_POSTGRES_RUNTIME || path.resolve('.next/chat-sql-qa/node_modules/@electric-sql/pglite'))) } catch {}
const id = n => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const MIGRATION = 'supabase/migrations/20261121120000_silent_duty_officer_alerts.sql'

test('migration has no transaction control and schedules the check', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8').replace(/--.*$/gm, '')
  assert.doesNotMatch(sql, /^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/m)
  assert.match(sql, /cron\.schedule\(\s*'tcnp-silent-duty-officers',\s*'\*\/2 \* \* \* \*'/)
})

// Yesterday, so alerts written "now" are always later than the test's locations.
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
const lagosTime = (hour, minute) => new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate(), hour - 1, minute)).toISOString()
const day = yesterday.toISOString().slice(0, 10)

/**
 * Officers at check time T:
 *  1 silent DO (also on the programme: duty wins)   2 Command          3 ordinary, silent, on nothing
 *  4 DO sharing fine     5 DO with sharing off      6 DO, planned journey   7 DO, completed journey
 *  8 DO who declined     9 DO by assigned_duty_officer_id only         10 DO silent for 13 hours
 * 11 programme officer, silent 15 min   12 programme officer, silent 20 min   13 programme officer, sharing fine
 * 14 on a programme still in planning   15 on a programme that ended    16 inactive title on the running programme
 * 17 Command who is also a silent programme officer
 */
async function world(T) {
  const db = new PGlite()
  const ago = minutes => `'${T}'::timestamptz - interval '${minutes} minutes'`
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA cron;
    CREATE TABLE cron.job(jobid bigserial PRIMARY KEY, jobname text, schedule text, command text);
    CREATE FUNCTION cron.schedule(n text, s text, c text) RETURNS bigint LANGUAGE sql AS $$ INSERT INTO cron.job(jobname,schedule,command) VALUES(n,s,c) RETURNING jobid $$;
    CREATE FUNCTION cron.unschedule(j bigint) RETURNS boolean LANGUAGE sql AS $$ DELETE FROM cron.job WHERE jobid=j RETURNING true $$;
    CREATE TYPE journey_status AS ENUM('planned','scheduled','planning','chapman','first_course','dessert','completed','cancelled');
    CREATE TABLE users(id uuid PRIMARY KEY, full_name text, email text, oscar text, role text, has_admin_access boolean DEFAULT false,
      is_active boolean DEFAULT true, activation_status text DEFAULT 'active', location_sharing_enabled boolean DEFAULT true);
    CREATE TABLE journeys(id uuid PRIMARY KEY, status journey_status, assigned_duty_officer_id uuid);
    CREATE TABLE journey_duty_officers(journey_id uuid, user_id uuid, status text);
    CREATE TABLE programs(id uuid PRIMARY KEY, status text, start_date date, end_date date);
    CREATE TABLE title_assignments(program_id uuid, user_id uuid, is_active boolean);
    CREATE TABLE user_locations(user_id uuid, updated_at timestamptz);
    CREATE TABLE notifications(id bigserial PRIMARY KEY, user_id uuid, title text, message text, type text, channel text, metadata jsonb,
      journey_id uuid, is_read boolean, created_at timestamptz DEFAULT now());
    INSERT INTO users(id, full_name, oscar, role, location_sharing_enabled) VALUES
      ('${id(1)}','Akin Ojo','Victor Oscar','viewer',true), ('${id(2)}','Cmd Lead',null,'command',true), ('${id(3)}','Plain',null,'viewer',true),
      ('${id(4)}','Fine',null,'viewer',true), ('${id(5)}','Private',null,'viewer',false), ('${id(6)}','Planned',null,'viewer',true),
      ('${id(7)}','Done',null,'viewer',true), ('${id(8)}','Declined',null,'viewer',true), ('${id(9)}','Legacy',null,'viewer',true),
      ('${id(10)}','Yesterday',null,'viewer',true), ('${id(11)}','Prog One','Alpha Oscar','viewer',true), ('${id(12)}','Prog Two',null,'viewer',true),
      ('${id(13)}','Prog Fine',null,'viewer',true), ('${id(14)}','Planning Prog',null,'viewer',true), ('${id(15)}','Ended Prog',null,'viewer',true),
      ('${id(16)}','Removed',null,'viewer',true), ('${id(17)}','Cmd Field',null,'command',true);
    INSERT INTO journeys VALUES ('${id(50)}','chapman',null), ('${id(51)}','planned',null), ('${id(52)}','completed',null),
      ('${id(53)}','first_course','${id(9)}'), ('${id(54)}','dessert','${id(8)}');
    INSERT INTO journey_duty_officers VALUES ('${id(50)}','${id(1)}','acknowledged'), ('${id(50)}','${id(4)}','acknowledged'),
      ('${id(50)}','${id(5)}','acknowledged'), ('${id(51)}','${id(6)}','acknowledged'), ('${id(52)}','${id(7)}','acknowledged'),
      ('${id(54)}','${id(8)}','declined'), ('${id(50)}','${id(10)}','pending');
    INSERT INTO programs VALUES ('${id(70)}','Active','${day}','${day}'), ('${id(71)}','planning','${day}','${day}'),
      ('${id(72)}','active', '${day}'::date - 3, '${day}'::date - 1);
    INSERT INTO title_assignments VALUES ('${id(70)}','${id(1)}',true), ('${id(70)}','${id(11)}',true), ('${id(70)}','${id(12)}',true),
      ('${id(70)}','${id(13)}',true), ('${id(71)}','${id(14)}',true), ('${id(72)}','${id(15)}',true), ('${id(70)}','${id(16)}',false),
      ('${id(70)}','${id(17)}',true);
    INSERT INTO user_locations VALUES ('${id(1)}', ${ago(40)}), ('${id(1)}', ${ago(15)}), ('${id(3)}', ${ago(15)}),
      ('${id(4)}', ${ago(1)}), ('${id(5)}', ${ago(15)}), ('${id(6)}', ${ago(15)}), ('${id(7)}', ${ago(15)}), ('${id(8)}', ${ago(15)}),
      ('${id(9)}', ${ago(20)}), ('${id(10)}', ${ago(13 * 60)}), ('${id(11)}', ${ago(15)}), ('${id(12)}', ${ago(20)}), ('${id(13)}', ${ago(2)}),
      ('${id(14)}', ${ago(15)}), ('${id(15)}', ${ago(15)}), ('${id(16)}', ${ago(15)}), ('${id(17)}', ${ago(15)});
  `)
  await db.exec(fs.readFileSync(MIGRATION, 'utf8'))
  const run = async () => (await db.query('SELECT public.notify_silent_duty_officers($1::timestamptz) AS n', [T])).rows[0].n
  const alerts = async () => (await db.query(`SELECT user_id, title, message, metadata, metadata->>'kind' AS kind, metadata->>'officer_id' AS officer, journey_id, channel, type
    FROM notifications ORDER BY id`)).rows
  return { db, run, alerts, ago }
}

test('daytime: Duty Officers alert one by one, programme officers in one combined alert', { skip: !PGlite }, async t => {
  const T = lagosTime(12, 0)
  const { db, run, alerts, ago } = await world(T)
  t.after(() => db.close())

  await t.test('only silent officers who should be visible trigger', async () => {
    // 2 DOs x 2 Command + 2 own pushes, then 3 programme pushes + 1 combined alert x 2 Command.
    assert.equal(await run(), 11)
    const rows = await alerts()
    const paused = rows.filter(r => r.kind === 'location_paused').map(r => r.user_id).sort()
    assert.deepEqual(paused, [id(1), id(9), id(11), id(12), id(17)].sort())
    assert.ok(!rows.some(r => [3, 4, 5, 6, 7, 8, 10, 13, 14, 15, 16].map(id).includes(r.user_id)), 'nobody else hears anything')

    const perOfficer = rows.filter(r => r.kind === 'location_silent' && r.officer)
    assert.deepEqual(perOfficer.map(r => `${r.user_id}>${r.officer}`).sort(), [id(2), id(17)].flatMap(c => [`${c}>${id(1)}`, `${c}>${id(9)}`]).sort())
    const akin = perOfficer.find(r => r.officer === id(1) && r.user_id === id(2))
    assert.match(akin.message, /^Akin Ojo \(Victor Oscar\) is on duty but their location has not updated for 15 minutes \(last seen 11:45\)/)
    assert.equal(akin.journey_id, id(50)); assert.equal(akin.channel, 'push'); assert.equal(akin.type, 'alert')

    const combined = rows.filter(r => r.kind === 'location_silent' && !r.officer)
    assert.deepEqual(combined.map(r => r.user_id).sort(), [id(2), id(17)].sort(), 'one combined alert per Command member')
    assert.equal(combined[0].title, "Officers' locations silent")
    assert.match(combined[0].message, /^3 officers on today's programme have stopped sharing location: Prog Two \(last seen 11:40\), /)
    assert.match(combined[0].message, /Prog One \(Alpha Oscar\) \(last seen 11:45\)/)
    assert.deepEqual([...combined[0].metadata.officer_ids].sort(), [id(11), id(12), id(17)].sort())
    assert.deepEqual(combined[0].metadata.program_ids, [id(70)])
    assert.ok(!combined[0].message.includes('Akin'), 'a Duty Officer is never repeated in the programme alert')
    const own = rows.find(r => r.kind === 'location_paused' && r.user_id === id(11))
    assert.match(own.message, /^You are on today's programme but TCNP has not shared your location since 11:45/)
  })

  await t.test('the same silent spell is not alerted twice', async () => {
    assert.equal(await run(), 0)
  })

  await t.test('a new spell after the officer shares again alerts again, worded for one officer', async () => {
    await db.exec(`UPDATE notifications SET created_at = ${ago(30)} WHERE user_id = '${id(11)}';
      INSERT INTO user_locations VALUES ('${id(11)}', ${ago(12)});`)
    assert.equal(await run(), 3)
    const latest = (await alerts()).filter(r => r.kind === 'location_silent').pop()
    assert.equal(latest.title, 'Officer location silent')
    assert.match(latest.message, /^Prog One \(Alpha Oscar\) \(last seen 11:48\) is on today's programme but their location has stopped updating\./)
  })

  await t.test('clients cannot run the check; the scheduler can', async () => {
    const { rows } = await db.query(`SELECT has_function_privilege('authenticated', 'public.notify_silent_duty_officers(timestamptz)', 'execute') AS ok`)
    assert.equal(rows[0].ok, false)
    const jobs = (await db.query(`SELECT jobname, schedule, command FROM cron.job`)).rows
    assert.deepEqual(jobs.map(j => [j.jobname, j.schedule]), [['tcnp-silent-duty-officers', '*/2 * * * *']])
    assert.match(jobs[0].command, /notify_silent_duty_officers\(\)/)
  })
})

test('overnight: programme officers are left alone, Duty Officers still alert', { skip: !PGlite }, async t => {
  const { db, run, alerts } = await world(lagosTime(23, 30))
  t.after(() => db.close())
  assert.equal(await run(), 6)
  const rows = await alerts()
  assert.deepEqual(rows.filter(r => r.kind === 'location_paused').map(r => r.user_id).sort(), [id(1), id(9)].sort())
  assert.ok(rows.filter(r => r.kind === 'location_silent').every(r => r.officer), 'no combined programme alert at night')
})
