const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// Optional integration runtime, deliberately separate from app dependencies:
// npm install --prefix .next/chat-sql-qa --no-audit --no-fund --package-lock=false @electric-sql/pglite@0.3.14
// CI may provide an equivalent module directory with CHAT_POSTGRES_RUNTIME.
let PGlite
try {
  ;({ PGlite } = require(process.env.CHAT_POSTGRES_RUNTIME || path.resolve('.next/chat-sql-qa/node_modules/@electric-sql/pglite')))
} catch {}

const migration = fs.readFileSync('supabase/migrations/20261025210000_explicit_chat_room_access.sql', 'utf8')
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const PROGRAM = uuid(1), OTHER_PROGRAM = uuid(2), ARCHIVED = uuid(3), PAPA = uuid(4), OTHER_PAPA = uuid(5), DELETED_PAPA = uuid(6)
const MEMBER = uuid(10), PAPA_MEMBER = uuid(11), OUTSIDER = uuid(12), EXECUTIVE = uuid(13), INACTIVE = uuid(14), LEGACY_ADMIN = uuid(15), CAPTAIN = uuid(16), HOC = uuid(17)
const PUBLIC_MESSAGE = uuid(20), PAPA_MESSAGE = uuid(21), PRIVATE_MESSAGE = uuid(22), OTHER_MESSAGE = uuid(23), OLD_MESSAGE = uuid(24), ATTACHMENT_MESSAGE = uuid(25), ARCHIVED_MESSAGE = uuid(26)

test('migration installs restrictive barriers independently of legacy permissive policies', () => {
  assert.match(migration, /CREATE POLICY chat_room_access_guard[\s\S]*?AS RESTRICTIVE[\s\S]*?FOR ALL TO authenticated/)
  assert.match(migration, /CREATE POLICY chat_reaction_access_guard[\s\S]*?AS RESTRICTIVE[\s\S]*?can_access_chat_message\(message_id\)/)
  assert.match(migration, /membership\.papa_id IS NOT DISTINCT FROM target_papa_id/)
  assert.doesNotMatch(migration, /INSERT INTO public\.chat_room_memberships[\s\S]*?SELECT[\s\S]*?(program_assignments|papa_assignments)/)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.edit_room_chat_message\(uuid, text\) FROM PUBLIC, anon/)
  assert.match(migration, /CREATE TRIGGER chat_messages_guard_changes BEFORE INSERT OR UPDATE/)
})

test('actual PostgreSQL room RLS, metadata guards and definer RPCs', { skip: !PGlite && 'Optional PostgreSQL runtime is not installed; see installation command in this test.' }, async t => {
  const db = new PGlite()
  t.after(async () => db.close())
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA realtime;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.user_id', true), '')::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('test.jwt', true), '')::jsonb, '{}'::jsonb) $$;
    CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('test.topic', true) $$;
    CREATE TABLE public.users(id uuid PRIMARY KEY, role text, team text, is_active boolean, activation_status text);
    CREATE TABLE public.programs(id uuid PRIMARY KEY, status text);
    CREATE TABLE public.papas(id uuid PRIMARY KEY, program_id uuid REFERENCES public.programs(id), is_deleted boolean);
    CREATE TABLE public.chat_messages(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sender_id uuid REFERENCES public.users(id),
      program_id uuid REFERENCES public.programs(id), papa_id uuid REFERENCES public.papas(id), team text,
      content text, created_at timestamptz DEFAULT now(), updated_at timestamptz, edited_at timestamptz,
      deleted_at timestamptz, deleted_by_admin boolean DEFAULT false, flagged boolean DEFAULT false, flagged_by uuid,
      is_archived boolean DEFAULT false, is_private boolean DEFAULT false, read_by jsonb DEFAULT '[]', mentions jsonb DEFAULT '[]',
      reply_to_id uuid REFERENCES public.chat_messages(id), attachments jsonb DEFAULT '[]'
    );
    CREATE TABLE public.message_reactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), message_id uuid REFERENCES public.chat_messages(id), user_id uuid REFERENCES public.users(id), emoji text);
    CREATE TABLE realtime.messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), extension text);
    ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
    CREATE POLICY legacy_everything ON public.chat_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY legacy_everything ON public.message_reactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY legacy_everything ON realtime.messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
    CREATE FUNCTION public.is_active_member() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active=true AND activation_status='active') $$;
    CREATE FUNCTION public.is_platform_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active=true AND activation_status='active'
        AND role IN ('admin','super_admin','dev_admin','captain','vice_captain','head_of_command')) $$;
    CREATE FUNCTION public.is_trusted_backend() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT auth.jwt() IS NULL OR coalesce(auth.jwt()->>'role','')='service_role' $$;
    CREATE FUNCTION public.legacy_edit(message_id uuid,new_content text) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
      UPDATE public.chat_messages SET content=new_content WHERE id=message_id $$;
    CREATE FUNCTION public.legacy_read(message_id uuid) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
      UPDATE public.chat_messages SET read_by=read_by || jsonb_build_array(auth.uid()::text) WHERE id=message_id $$;
    GRANT USAGE ON SCHEMA public,auth,realtime TO authenticated,anon,service_role;
    GRANT SELECT ON public.users,public.programs,public.papas TO authenticated;
    GRANT ALL ON public.chat_messages,public.message_reactions,realtime.messages TO authenticated;
    INSERT INTO public.users VALUES
      ('${MEMBER}','tango_oscar','strength',true,'active'),('${PAPA_MEMBER}','tango_oscar','wisdom',true,'active'),
      ('${OUTSIDER}','tango_oscar','swift',true,'active'),('${EXECUTIVE}','vice_captain',null,true,'active'),
      ('${INACTIVE}','captain',null,false,'active'),('${LEGACY_ADMIN}','command',null,true,'active'),
      ('${CAPTAIN}','captain',null,true,'active'),('${HOC}','head_of_command',null,true,'active');
    INSERT INTO public.programs VALUES ('${PROGRAM}','active'),('${OTHER_PROGRAM}','planning'),('${ARCHIVED}',' ARCHIVED ');
    INSERT INTO public.papas VALUES ('${PAPA}','${PROGRAM}',false),('${OTHER_PAPA}','${OTHER_PROGRAM}',false),('${DELETED_PAPA}','${PROGRAM}',true);
    INSERT INTO public.chat_messages(id,sender_id,program_id,papa_id,content,is_private,mentions,created_at) VALUES
      ('${PUBLIC_MESSAGE}','${MEMBER}','${PROGRAM}',null,'Program message',false,'[]',now()),
      ('${PAPA_MESSAGE}','${PAPA_MEMBER}','${PROGRAM}','${PAPA}','Papa message',false,'[]',now()),
      ('${PRIVATE_MESSAGE}','${PAPA_MEMBER}','${PROGRAM}',null,'Private message',true,'["${MEMBER}"]',now()),
      ('${OTHER_MESSAGE}','${OUTSIDER}','${OTHER_PROGRAM}',null,'Other message',false,'[]',now()),
      ('${OLD_MESSAGE}','${MEMBER}','${PROGRAM}',null,'Old message',false,'[]',now()-interval '4 minutes'),
      ('${ATTACHMENT_MESSAGE}','${MEMBER}','${PROGRAM}',null,'',false,'[]',now()),
      ('${ARCHIVED_MESSAGE}','${EXECUTIVE}','${ARCHIVED}',null,'Archived message',false,'[]',now());
    INSERT INTO public.message_reactions(message_id,user_id,emoji) VALUES ('${PAPA_MESSAGE}','${PAPA_MEMBER}','👍');
  `)
  await db.exec(migration)
  await db.exec(`INSERT INTO public.chat_room_memberships(program_id,papa_id,user_id,added_by) VALUES
    ('${PROGRAM}',null,'${MEMBER}','${EXECUTIVE}'),('${PROGRAM}','${PAPA}','${PAPA_MEMBER}','${EXECUTIVE}');`)
  async function as(userId, fn) {
    await db.exec(`RESET ROLE; SELECT set_config('test.user_id','${userId}',false); SELECT set_config('test.jwt','{"role":"authenticated"}',false); SET ROLE authenticated;`)
    try { return await fn() } finally { await db.exec('RESET ROLE') }
  }
  async function scalar(sql, args = []) { return Object.values((await db.query(sql, args)).rows[0])[0] }
  async function visibleIds() { return (await db.query('SELECT id FROM public.chat_messages ORDER BY id')).rows.map(row => row.id) }
  async function rejects(sql, code = '42501') { await assert.rejects(db.exec(sql), error => error.code === code) }
  const room = (program, papa = null, team = null) => scalar('SELECT public.can_access_chat_room($1,$2,$3)', [program, papa, team])

  await t.test('exact invitation isolates program and Papa; inactive and legacy admin have no implicit access', async () => {
    await as(MEMBER, async () => { assert.equal(await room(PROGRAM), true); assert.equal(await room(PROGRAM, PAPA), false); assert.equal(await room(null, null, 'strength'), true); assert.equal(await room(null, null, 'wisdom'), false) })
    await as(PAPA_MEMBER, async () => { assert.equal(await room(PROGRAM), false); assert.equal(await room(PROGRAM, PAPA), true) })
    for (const userId of [OUTSIDER, INACTIVE, LEGACY_ADMIN]) await as(userId, async () => assert.equal(await room(PROGRAM), false))
    for (const userId of [EXECUTIVE, CAPTAIN, HOC]) await as(userId, async () => {
      assert.equal(await room(PROGRAM), true); assert.equal(await room(PROGRAM, PAPA), true)
      assert.equal(await room(null, null, 'wisdom'), true); assert.equal(await room(ARCHIVED), false)
      assert.equal(await room(PROGRAM, OTHER_PAPA), false); assert.equal(await room(PROGRAM, DELETED_PAPA), false)
    })
  })

  await t.test('restrictive SELECT and parent reaction visibility defeat broad legacy policies', async () => {
    await as(MEMBER, async () => {
      assert.deepEqual(await visibleIds(), [PUBLIC_MESSAGE, PRIVATE_MESSAGE, OLD_MESSAGE, ATTACHMENT_MESSAGE].sort())
      assert.equal(await scalar('SELECT count(*)::int FROM public.message_reactions'), 0)
      await rejects(`INSERT INTO public.message_reactions(message_id,user_id,emoji) VALUES ('${PAPA_MESSAGE}','${MEMBER}','👍')`)
    })
    await as(EXECUTIVE, async () => {
      const ids = await visibleIds(); assert.equal(ids.includes(PAPA_MESSAGE), true); assert.equal(ids.includes(ARCHIVED_MESSAGE), false)
    })
  })

  await t.test('INSERT RETURNING works while spoofed sender, inaccessible room and cross-room reply fail', async () => {
    await as(MEMBER, async () => {
      const sent = await db.query(`INSERT INTO public.chat_messages(sender_id,program_id,content) VALUES ($1,$2,'New message') RETURNING id,content`, [MEMBER, PROGRAM])
      assert.equal(sent.rows[0].content, 'New message')
      await rejects(`INSERT INTO public.chat_messages(sender_id,program_id,content) VALUES ('${OUTSIDER}','${PROGRAM}','Spoof')`)
      await rejects(`INSERT INTO public.chat_messages(sender_id,program_id,papa_id,content) VALUES ('${MEMBER}','${PROGRAM}','${PAPA}','Trespass')`)
      await rejects(`INSERT INTO public.chat_messages(sender_id,program_id,content,reply_to_id) VALUES ('${MEMBER}','${PROGRAM}','Reply','${PAPA_MESSAGE}')`)
      await rejects(`INSERT INTO public.chat_messages(sender_id,program_id,content,read_by) VALUES ('${MEMBER}','${PROGRAM}','Spoof receipt','["${OUTSIDER}"]')`)
    })
  })

  await t.test('self edits work; legacy SECURITY DEFINER cannot bypass authorship/window/immutable fields', async () => {
    await as(MEMBER, async () => {
      assert.equal((await scalar('SELECT public.edit_room_chat_message($1,$2)', [PUBLIC_MESSAGE, 'Edited'])).content, 'Edited')
      await rejects(`SELECT public.edit_room_chat_message('${OLD_MESSAGE}','Too late')`)
      await rejects(`SELECT public.legacy_edit('${PRIVATE_MESSAGE}','Not mine')`)
      await rejects(`SELECT public.legacy_edit('${PAPA_MESSAGE}','No membership')`)
      await rejects(`UPDATE public.chat_messages SET program_id='${OTHER_PROGRAM}' WHERE id='${PUBLIC_MESSAGE}'`)
      await rejects(`UPDATE public.chat_messages SET flagged=true WHERE id='${PUBLIC_MESSAGE}'`)
      await rejects(`UPDATE public.chat_messages SET mentions='["${OUTSIDER}"]' WHERE id='${PUBLIC_MESSAGE}'`)
      await rejects(`UPDATE public.chat_messages SET created_at=now()-interval '1 hour' WHERE id='${PUBLIC_MESSAGE}'`)
    })
  })

  await t.test('read RPCs only append caller receipts to visible rooms and retain historic attachment-only messages', async () => {
    await as(MEMBER, async () => {
      await db.query('SELECT public.mark_chat_messages_read($1::uuid[])', [[PUBLIC_MESSAGE, PAPA_MESSAGE, OTHER_MESSAGE, ATTACHMENT_MESSAGE]])
      assert.deepEqual(await scalar('SELECT read_by FROM public.chat_messages WHERE id=$1', [PUBLIC_MESSAGE]), [MEMBER])
      assert.deepEqual(await scalar('SELECT read_by FROM public.chat_messages WHERE id=$1', [ATTACHMENT_MESSAGE]), [MEMBER])
      await db.query('SELECT public.mark_chat_messages_read($1::uuid[])', [[PUBLIC_MESSAGE]])
      assert.deepEqual(await scalar('SELECT read_by FROM public.chat_messages WHERE id=$1', [PUBLIC_MESSAGE]), [MEMBER])
      await rejects(`SELECT public.mark_message_read('${PUBLIC_MESSAGE}','${OUTSIDER}')`)
      await rejects(`SELECT public.mark_message_read('${PAPA_MESSAGE}','${MEMBER}')`)
      await rejects(`SELECT public.mark_messages_as_read('${OUTSIDER}','${PROGRAM}')`)
      await rejects(`SELECT public.mark_chat_messages_read(array_fill('${PUBLIC_MESSAGE}'::uuid, ARRAY[101]))`, '22023')
      await rejects(`UPDATE public.chat_messages SET read_by='["${MEMBER}","${OUTSIDER}"]' WHERE id='${PUBLIC_MESSAGE}'`)
    })
    assert.deepEqual(await scalar('SELECT read_by FROM public.chat_messages WHERE id=$1', [PAPA_MESSAGE]), [])
    assert.deepEqual(await scalar('SELECT read_by FROM public.chat_messages WHERE id=$1', [OTHER_MESSAGE]), [])
  })

  await t.test('only executives alter exact memberships and cannot invite into archived/mismatched rooms', async () => {
    await as(MEMBER, async () => await rejects(`INSERT INTO public.chat_room_memberships(program_id,user_id,added_by) VALUES ('${PROGRAM}','${OUTSIDER}','${MEMBER}')`))
    await as(EXECUTIVE, async () => {
      await rejects(`INSERT INTO public.chat_room_memberships(program_id,user_id,added_by) VALUES ('${ARCHIVED}','${OUTSIDER}','${EXECUTIVE}')`, '23514')
      await rejects(`INSERT INTO public.chat_room_memberships(program_id,papa_id,user_id,added_by) VALUES ('${PROGRAM}','${OTHER_PAPA}','${OUTSIDER}','${EXECUTIVE}')`, '23514')
      await rejects(`INSERT INTO public.chat_room_memberships(program_id,user_id,added_by) VALUES ('${PROGRAM}','${INACTIVE}','${EXECUTIVE}')`, '23514')
      await db.exec(`INSERT INTO public.chat_room_memberships(program_id,papa_id,user_id,added_by) VALUES ('${PROGRAM}','${PAPA}','${OUTSIDER}','${EXECUTIVE}')`)
    })
    await as(OUTSIDER, async () => { assert.equal(await room(PROGRAM, PAPA), true); assert.equal(await room(PROGRAM), false) })
  })

  await t.test('private messages require both exact room membership and private audience', async () => {
    await as(EXECUTIVE, async () => db.exec(`INSERT INTO public.chat_room_memberships(program_id,user_id,added_by) VALUES ('${PROGRAM}','${OUTSIDER}','${EXECUTIVE}')`))
    await as(OUTSIDER, async () => {
      assert.equal((await visibleIds()).includes(PRIVATE_MESSAGE), false)
      assert.equal(await scalar('SELECT public.can_access_chat_message($1)', [PRIVATE_MESSAGE]), false)
      await rejects(`INSERT INTO public.message_reactions(message_id,user_id,emoji) VALUES ('${PRIVATE_MESSAGE}','${OUTSIDER}','👍')`)
      await rejects(`SELECT public.legacy_read('${PRIVATE_MESSAGE}')`)
    })
  })

  await t.test('non-admin participants cannot permanently delete visible messages through legacy permissive policies', async () => {
    await as(MEMBER, async () => {
      await db.exec(`DELETE FROM public.chat_messages WHERE id='${PUBLIC_MESSAGE}'`)
      assert.equal(await scalar('SELECT count(*)::int FROM public.chat_messages WHERE id=$1', [PUBLIC_MESSAGE]), 1)
    })
    await as(EXECUTIVE, async () => {
      const result = await db.query(`INSERT INTO public.chat_messages(sender_id,program_id,content) VALUES ($1,$2,'Executive removable') RETURNING id`, [EXECUTIVE, PROGRAM])
      await db.query('DELETE FROM public.chat_messages WHERE id=$1', [result.rows[0].id])
      assert.equal(await scalar('SELECT count(*)::int FROM public.chat_messages WHERE id=$1', [result.rows[0].id]), 0)
    })
  })

  await t.test('membership removal immediately blocks history, new messages, reactions, receipts, edits and typing topics', async () => {
    await as(EXECUTIVE, async () => db.exec(`DELETE FROM public.chat_room_memberships WHERE user_id='${MEMBER}'`))
    await as(MEMBER, async () => {
      assert.equal(await room(PROGRAM), false); assert.deepEqual(await visibleIds(), [])
      await rejects(`INSERT INTO public.chat_messages(sender_id,program_id,content) VALUES ('${MEMBER}','${PROGRAM}','Revoked')`)
      await rejects(`SELECT public.edit_room_chat_message('${PUBLIC_MESSAGE}','Revoked edit')`)
      await rejects(`SELECT public.legacy_edit('${PUBLIC_MESSAGE}','Legacy revoked edit')`)
      await rejects(`SELECT public.mark_message_read('${PUBLIC_MESSAGE}','${MEMBER}')`)
      assert.equal(await scalar('SELECT public.can_access_chat_topic($1)', [`chat-room:program:${PROGRAM}`]), false)
    })
  })

  await t.test('private realtime topics reject wrong rooms and malformed identifiers despite legacy broadcast policies', async () => {
    await as(PAPA_MEMBER, async () => {
      for (const [topic, allowed] of [[`chat-room:papa:${PAPA}`, true], [`chat-room:program:${PROGRAM}`, false], ['chat-room:program:not-a-uuid', false], [`chat-room:papa:${PAPA}:extra`, false]]) {
        assert.equal(await scalar('SELECT public.can_access_chat_topic($1)', [topic]), allowed)
        await db.query("SELECT set_config('test.topic',$1,false)", [topic])
        if (allowed) await db.exec("INSERT INTO realtime.messages(extension) VALUES ('broadcast')")
        else await rejects("INSERT INTO realtime.messages(extension) VALUES ('broadcast')")
      }
    })
  })
})
