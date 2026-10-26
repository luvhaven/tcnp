const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path')
let PGlite
try { ({ PGlite } = require(process.env.CHAT_POSTGRES_RUNTIME || path.resolve('.next/chat-sql-qa/node_modules/@electric-sql/pglite'))) } catch {}
const id = n => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`
test('PostgreSQL opt-out removes published locations and blocks stale clients, direct writes and map reads', { skip: !PGlite }, async t => {
 const db = new PGlite(); t.after(() => db.close())
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
 CREATE FUNCTION is_trusted_backend() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
 CREATE TYPE user_role AS ENUM('admin','delta_oscar');
 CREATE TABLE users(id uuid PRIMARY KEY,full_name text,oscar text,role user_role,is_active boolean,activation_status text);
 CREATE FUNCTION is_active_member() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM users WHERE id=auth.uid() AND is_active=true AND activation_status='active') $$;
 CREATE TABLE user_locations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES users(id),latitude numeric,longitude numeric,accuracy numeric,altitude numeric,heading numeric,speed numeric,battery_level integer,is_active boolean DEFAULT true,updated_at timestamptz DEFAULT now());
 ALTER TABLE user_locations ENABLE ROW LEVEL SECURITY; CREATE POLICY legacy_read ON user_locations FOR SELECT TO authenticated USING(true);
 GRANT USAGE ON SCHEMA public,auth TO authenticated,anon; GRANT ALL ON user_locations TO authenticated; GRANT SELECT,UPDATE ON users TO authenticated;
 INSERT INTO users VALUES('${id(1)}','Officer One','Delta','delta_oscar',true,'active'),('${id(2)}','Officer Two','Delta','delta_oscar',true,'active'),('${id(3)}','Inactive','Delta','delta_oscar',false,'inactive');
 SELECT set_config('test.uid','${id(1)}',false);`)
 await db.exec(fs.readFileSync('supabase/migrations/20261026210000_location_sharing_visibility.sql', 'utf8'))
 const scalar = async sql => Object.values((await db.query(sql)).rows[0])[0]
 const upload = who => `SELECT upsert_user_location('${id(who)}',6.5,3.4)`
 const reject = sql => assert.rejects(db.exec(sql), error => error.code === '42501')
 await t.test('sharing defaults off and requires the officer’s own active consent', async () => {
  await reject(upload(1)); await reject(upload(2))
  await reject(`UPDATE users SET location_sharing_enabled=true WHERE id='${id(2)}'`)
  await db.exec(`SELECT set_config('test.uid','${id(3)}',false)`); await reject('SELECT set_location_sharing(true)')
  await db.exec(`SELECT set_config('test.uid','${id(1)}',false); SELECT set_location_sharing(true);`)
  assert.equal(await scalar('SELECT location_sharing_enabled FROM users WHERE id=auth.uid()'), true)
 })
 await t.test('enabled fresh uploads are visible; old positions remain inactive', async () => {
  await db.exec(`${upload(1)}; ${upload(1)};`)
  assert.equal(await scalar('SELECT count(*)::int FROM get_active_user_locations()'), 1)
  assert.equal(await scalar('SELECT count(*)::int FROM user_locations WHERE is_active=false'), 1)
  await db.exec(`SELECT set_config('test.uid','${id(2)}',false); SET ROLE authenticated;`)
  assert.equal(await scalar('SELECT count(*)::int FROM get_active_user_locations()'), 1)
  assert.equal(await scalar('SELECT count(*)::int FROM user_locations'), 1)
  await db.exec(`RESET ROLE; SELECT set_config('test.uid','${id(1)}',false)`)
 })
 await t.test('off unpublishes the current marker, retains inactive history and rejects late uploads', async () => {
  await db.exec('SELECT set_location_sharing(false)')
  assert.equal(await scalar('SELECT count(*)::int FROM get_active_user_locations()'), 0)
  assert.equal(await scalar('SELECT count(*)::int FROM user_locations WHERE is_active=true'), 0)
  assert.equal(await scalar('SELECT count(*)::int FROM user_locations WHERE is_active=false'), 1)
  await reject(upload(1))
  await reject(`INSERT INTO user_locations(user_id,latitude,longitude) VALUES('${id(1)}',6.5,3.4)`)
  await db.exec('SET ROLE authenticated'); assert.equal(await scalar('SELECT count(*)::int FROM user_locations'), 0)
  await reject(`UPDATE user_locations SET is_active=true`); await db.exec('RESET ROLE')
 })
 await t.test('a new opt-in does not republish a historical pin; a new fix is required', async () => {
  await db.exec('SELECT set_location_sharing(true)')
  assert.equal(await scalar('SELECT count(*)::int FROM get_active_user_locations()'), 0)
  await db.exec(upload(1)); assert.equal(await scalar('SELECT count(*)::int FROM get_active_user_locations()'), 1)
  await db.exec('SELECT set_location_sharing(false); SELECT set_location_sharing(false)')
  assert.equal(await scalar('SELECT count(*)::int FROM get_active_user_locations()'), 0)
 })
 await t.test('deactivation also removes publication, and anonymous callers cannot change consent', async () => {
  await db.exec(`SELECT set_location_sharing(true); ${upload(1)}; UPDATE users SET is_active=false WHERE id=auth.uid();`)
  assert.equal(await scalar('SELECT count(*)::int FROM get_active_user_locations()'), 0)
  await db.exec('SET ROLE anon'); await reject('SELECT set_location_sharing(true)'); await db.exec('RESET ROLE')
 })
})
