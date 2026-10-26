const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
let PGlite
try { ({ PGlite } = require(process.env.CHAT_POSTGRES_RUNTIME || path.resolve('.next/chat-sql-qa/node_modules/@electric-sql/pglite'))) } catch {}
const id = n => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`
test('PostgreSQL keeps DO responsibility through theatre, return escort and verified final checkpoint', { skip: !PGlite }, async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT current_setting('test.user')::uuid $$;
    CREATE FUNCTION is_active_member() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('test.active')='true' $$;
    CREATE FUNCTION is_platform_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('test.admin')='true' $$;
    CREATE FUNCTION is_trusted_backend() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE TYPE journey_status AS ENUM('planned','first_course','chapman','dessert','cocktail','completed','cancelled');
    CREATE TYPE call_sign AS ENUM('Dessert','Cocktail');
    CREATE TABLE journeys(id uuid PRIMARY KEY,papa_id uuid,status journey_status,destination text,assigned_theatre_id uuid,assigned_duty_officer_id uuid,completed_at timestamptz,completed_by uuid,status_updated_at timestamptz,updated_at timestamptz);
    CREATE TABLE journey_duty_officers(journey_id uuid,user_id uuid,status text);
    CREATE TABLE journey_events(journey_id uuid,event_type call_sign,description text,triggered_by uuid,triggered_at timestamptz);
    SELECT set_config('test.user','${id(1)}',false),set_config('test.active','true',false),set_config('test.admin','false',false);
    INSERT INTO journeys VALUES('${id(10)}','${id(90)}','chapman','Main Theatre','${id(91)}','${id(1)}',null,null,null,null),('${id(11)}','${id(90)}','cocktail','Eagle Square',null,'${id(1)}',null,null,null,null),('${id(12)}','${id(90)}','dessert','Nest',null,'${id(1)}',null,null,null,null);
    INSERT INTO journey_duty_officers VALUES('${id(10)}','${id(1)}','acknowledged');
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT ALL ON journeys,journey_duty_officers TO authenticated;
  `)
  await db.exec(fs.readFileSync('supabase/migrations/20261026110000_do_continuous_papa_duty.sql', 'utf8'))
  const reject = (sql, code = '23514') => assert.rejects(db.exec(sql), error => error.code === code)
  const row = async n => (await db.query('SELECT * FROM journeys WHERE id=$1', [id(n)])).rows[0]
  await t.test('theatre arrival is not completion, including direct write and insert bypasses', async () => {
    await reject(`SELECT complete_do_journey('${id(10)}','nest_settled')`)
    await reject(`UPDATE journeys SET status='completed',do_completion_reason='nest_settled',do_return_destination='nest' WHERE id='${id(10)}'`)
    await reject(`UPDATE journeys SET papa_id=null,status='completed' WHERE id='${id(10)}'`, '42501')
    await reject(`INSERT INTO journeys(id,papa_id,status) VALUES('${id(20)}','${id(90)}','completed')`)
  })
  await t.test('only acknowledged DO or active Admin can record escort and checkpoint', async () => {
    await db.exec(`SELECT set_config('test.user','${id(2)}',false)`)
    await reject(`SELECT start_do_return('${id(10)}','nest')`, '42501')
    await db.exec(`SELECT set_config('test.user','${id(1)}',false); UPDATE journey_duty_officers SET status='pending'`)
    await reject(`SELECT start_do_return('${id(10)}','nest')`, '42501')
    await db.exec(`UPDATE journey_duty_officers SET status='acknowledged'; SELECT set_config('test.active','false',false)`)
    await reject(`SELECT start_do_return('${id(10)}','nest')`, '42501')
    await db.exec(`SELECT set_config('test.active','true',false)`)
  })
  await t.test('Nest escort keeps duty active and only confirmed settlement completes it', async () => {
    await db.exec(`SELECT start_do_return('${id(10)}','nest')`)
    assert.equal((await row(10)).status, 'dessert')
    assert.equal((await row(10)).completed_at, null)
    await reject(`SELECT complete_do_journey('${id(10)}','flight_departed')`)
    await db.exec(`SELECT complete_do_journey('${id(10)}','nest_settled')`)
    const completed = await row(10)
    assert.equal(completed.status, 'completed'); assert.equal(completed.completed_by, id(1)); assert.ok(completed.completed_at)
    assert.equal(completed.do_completion_reason, 'nest_settled')
    await reject(`SELECT complete_do_journey('${id(10)}','nest_settled')`)
    await reject(`UPDATE journeys SET completed_by='${id(2)}' WHERE id='${id(10)}'`, '42501')
  })
  await t.test('airport duty needs flight confirmation, Nest duty cannot use a flight checkpoint', async () => {
    await reject(`SELECT complete_do_journey('${id(11)}',null)`, '22023')
    await reject(`SELECT complete_do_journey('${id(11)}','nest_settled')`)
    await reject(`SELECT complete_do_journey('${id(12)}','flight_landed')`)
    await db.exec(`SELECT complete_do_journey('${id(11)}','flight_departed')`)
    assert.equal((await row(11)).do_return_destination, 'eagle_square')
  })
  await t.test('only Admin can reopen, and stale completion fields are cleared', async () => {
    await reject(`UPDATE journeys SET status='chapman' WHERE id='${id(10)}'`, '42501')
    await db.exec(`SELECT set_config('test.admin','true',false); UPDATE journeys SET status='chapman' WHERE id='${id(10)}'`)
    const reopened = await row(10)
    for (const field of ['do_return_destination','do_completion_reason','completed_at','completed_by']) assert.equal(reopened[field], null)
  })
})
