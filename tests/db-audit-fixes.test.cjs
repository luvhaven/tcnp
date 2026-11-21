// Static checks on the database audit-fix migrations (audit 2026-11-20).
// The behaviour itself is exercised against the live schema in a rolled-back
// trial (side-session notes: trial-audit-fixes.sql); these tests keep the
// migration files from drifting away from what that trial proved.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const DIR = path.join(__dirname, '..', 'supabase', 'migrations')
const read = name => fs.readFileSync(path.join(DIR, name), 'utf8')
const FIXES = read('20261120130000_audit_fixes.sql')
const CLEANUP = read('20261120140000_data_cleanup.sql')
const RATE = read('20261019170500_shared_rate_limits.sql')

/** Body of `CREATE OR REPLACE FUNCTION public.<name>(` up to its closing dollar quote. */
function functionBody(sql, name) {
  const start = sql.indexOf(`FUNCTION public.${name}(`)
  assert.notEqual(start, -1, `${name} is defined`)
  const open = sql.slice(start).match(/AS (\$[a-z]*\$)/)
  assert.ok(open, `${name} has a dollar-quoted body`)
  const bodyStart = start + open.index + open[0].length
  const bodyEnd = sql.indexOf(open[1], bodyStart)
  return sql.slice(bodyStart, bodyEnd)
}

/** SQL without comments, so assertions look at statements only. */
const code = sql => sql.replace(/--[^\n]*/g, '')

test('migration versions are unique, so every file can be recorded', () => {
  const versions = new Map()
  for (const file of fs.readdirSync(DIR).filter(f => f.endsWith('.sql'))) {
    const version = file.split('_')[0]
    assert.ok(!versions.has(version), `${file} shares version ${version} with ${versions.get(version)}`)
    versions.set(version, file)
  }
  assert.ok(!fs.existsSync(path.join(DIR, '20261019170000_shared_rate_limits.sql')), 'old duplicate-version file is gone')
})

test('shared rate limits: no BEGIN/COMMIT (the runner and the trial wrap each file)', () => {
  assert.doesNotMatch(code(RATE), /^\s*(BEGIN|COMMIT)\s*;/m)
  assert.match(RATE, /CREATE OR REPLACE FUNCTION public\.rate_limit_hit\(p_key text, p_limit integer, p_window_ms integer\)/)
  assert.match(RATE, /GRANT EXECUTE ON FUNCTION public\.rate_limit_hit\(text, integer, integer\) TO service_role/)
  assert.match(RATE, /REVOKE ALL ON FUNCTION public\.rate_limit_hit\(text, integer, integer\) FROM PUBLIC, anon, authenticated/)
})

test('the audit-fix and cleanup migrations have no transaction control', () => {
  for (const sql of [FIXES, CLEANUP]) assert.doesNotMatch(code(sql), /^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/m)
})

test('#6 audit trigger skips updates that only touch bookkeeping columns', () => {
  const body = functionBody(FIXES, 'audit_log_trigger')
  assert.match(body, /ARRAY\['updated_at', 'last_seen', 'is_online'\]/)
  assert.match(body, /IF TG_OP = 'UPDATE' AND \(v_new - v_noise\) = \(v_old - v_noise\) THEN\s+RETURN NEW;/)
  for (const table of ['papas', 'eagle_squares', 'nests', 'theatres', 'cheetahs', 'journeys', 'incidents', 'programs', 'title_assignments']) {
    assert.match(FIXES, new RegExp(`DROP TRIGGER IF EXISTS audit_${table} ON public\\.${table};`), `duplicate audit trigger on ${table} dropped`)
  }
})

test('#7 assign_title moves the directory title only for programme-less titles', () => {
  const body = functionBody(FIXES, 'assign_title')
  assert.match(body, /IF p_program_id IS NULL THEN\s+UPDATE users\s+SET current_title_id = v_title_id, unit = v_unit/)
  // Keeps the re-activation from the chat-removal migration it replaces.
  assert.match(body, /ON CONFLICT \(user_id, title_id, program_id\) DO UPDATE/)
  assert.match(body, /is_trusted_backend\(\)/)
  // And a direct pointer write is normalised by a trigger.
  assert.match(FIXES, /BEFORE UPDATE OF current_title_id ON public\.users/)
  const guard = functionBody(FIXES, 'users_normalise_current_title')
  assert.match(guard, /ta\.is_active AND ta\.program_id IS NULL/)
})

test('#7/#15 cleanup restores pointers and dedupes before adding the unique index', () => {
  const dedupe = CLEANUP.indexOf('PARTITION BY user_id, title_id')
  const pointer = CLEANUP.indexOf('SET current_title_id = g.title_id')
  const index = CLEANUP.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS title_assignments_one_active_global')
  assert.ok(dedupe > 0 && pointer > dedupe && index > pointer, 'dedupe, then pointer backfill, then index')
  assert.match(CLEANUP, /WHERE program_id IS NULL AND is_active;/)
})

test('#8 availability: one send overload with the opt-in, gap count, late recipients', () => {
  assert.match(FIXES, /DROP FUNCTION IF EXISTS public\.send_mission_availability_request\(uuid, text, text, timestamptz, uuid, text, text\);/)
  const send = functionBody(FIXES, 'send_mission_availability_request')
  assert.match(send, /WHEN 'male' THEN gender = 'male' OR \(coalesce\(include_unset_gender, false\) AND gender IS NULL\)/)
  assert.match(FIXES, /include_unset_gender boolean DEFAULT false\n\)\nRETURNS TABLE \(request_id uuid, recipients integer\)/)
  assert.match(FIXES, /FUNCTION public\.get_mission_audience_gaps\(program uuid, audience text\)\s+RETURNS TABLE \(recipients integer, no_gender integer\)/)
  const late = functionBody(FIXES, 'add_mission_request_recipients')
  assert.match(late, /request\.status IS DISTINCT FROM 'open' OR request\.deadline <= now\(\)/)
  assert.match(late, /ON CONFLICT \(request_id, user_id\) DO NOTHING/)
  assert.match(late, /AT TIME ZONE 'Africa\/Lagos'/)
})

test('#9 officer-photos writes are platform-admin only; inserts are self-only', () => {
  for (const cmd of ['upload', 'update', 'delete']) {
    assert.match(FIXES, new RegExp(`DROP POLICY IF EXISTS "Authenticated users can ${cmd} officer photos" ON storage\\.objects;`))
  }
  for (const cmd of ['INSERT', 'UPDATE', 'DELETE']) {
    assert.match(FIXES, new RegExp(`FOR ${cmd} TO authenticated\\s+(USING|WITH CHECK) \\(bucket_id = 'officer-photos' AND \\(SELECT public\\.is_platform_admin\\(\\)\\)\\)`))
  }
  assert.match(FIXES, /DROP POLICY IF EXISTS audit_logs_insert ON public\.audit_logs;/)
  assert.match(FIXES, /CREATE POLICY audit_logs_insert_own ON public\.audit_logs\s+FOR INSERT TO authenticated\s+WITH CHECK \(user_id = \(SELECT auth\.uid\(\)\)/)
  // vip-photos policies were replaced by 20261116170000 and must not be touched here.
  assert.doesNotMatch(code(FIXES), /vip-photos/)
})

test('#10 realtime publication adds the subscribed tables', () => {
  for (const table of ['driver_feedback', 'nest_room_stays', 'nest_room_inspections', 'nest_room_items', 'nest_room_issues', 'chat_room_memberships', 'programs']) {
    assert.match(FIXES, new RegExp(`'${table}'`))
  }
  assert.match(FIXES, /ALTER PUBLICATION supabase_realtime ADD TABLE public\.%I/)
})

test('#16/#20 audit views run as the caller; Command reads audit logs and After-Op Reports', () => {
  assert.match(FIXES, /ALTER VIEW public\.audit_logs_readable SET \(security_invoker = true\);/)
  assert.match(FIXES, /ALTER VIEW public\.vw_audit_logs SET \(security_invoker = true\);/)
  assert.match(FIXES, /CREATE POLICY audit_logs_command_select ON public\.audit_logs\s+FOR SELECT TO authenticated\s+USING \(\(SELECT public\.is_admin\(\)\)\);/)
  assert.match(FIXES, /CREATE POLICY do_feedback_forms_select ON public\.do_feedback_forms[\s\S]*?\(SELECT public\.is_admin\(\)\)\);/)
})

test('#5 / s2 / #2 notification kinds match lib/notification-route.ts', () => {
  const route = fs.readFileSync(path.join(__dirname, '..', 'lib', 'notification-route.ts'), 'utf8')
  assert.match(functionBody(FIXES, 'decide_signup'), /'kind', 'signup_approved'/)
  assert.match(route, /kind === 'signup_approved'/)
  assert.match(functionBody(FIXES, 'notify_do_assignment'), /'kind',\s+'do_assignment'/)
  assert.match(route, /kind === 'do_assignment'/)
  const offline = functionBody(FIXES, 'notify_location_offline')
  assert.match(offline, /'kind', 'location_offline'/)
  assert.match(offline, /interval '15 minutes'/)
  assert.match(offline, /reason NOT IN \('location_lost', 'battery_critical'\)/)
  assert.match(FIXES, /REVOKE ALL ON FUNCTION public\.notify_location_offline\(text\) FROM PUBLIC, anon;/)
})

test('s1 cleanup deletes only notifications whose target is gone, plus legacy chat_message', () => {
  const del = CLEANUP.slice(CLEANUP.indexOf('DELETE FROM public.notifications'), CLEANUP.indexOf('-- 3a.'))
  assert.match(del, /n\.type = 'chat_message'/)
  assert.match(del, /NOT EXISTS \(SELECT 1 FROM public\.programs p/)
  assert.match(del, /NOT EXISTS \(SELECT 1 FROM public\.mission_requests r/)
  assert.match(del, /NOT EXISTS \(SELECT 1 FROM public\.papas p/)
})

test('#14 cleanup resolves exactly the orphan incident', () => {
  assert.match(CLEANUP, /WHERE id = 'd3830d2a-b18f-4e57-8ded-baccd2597a01'\s+AND status = 'open';/)
})
