-- Chat membership is independent of programme staffing and Papa assignments.
-- No implicit backfill: a member must be invited to each programme/Papa room.
BEGIN;

CREATE TABLE IF NOT EXISTS public.chat_room_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  papa_id uuid REFERENCES public.papas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  added_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_room_memberships_program_user_idx
  ON public.chat_room_memberships (program_id, user_id) WHERE papa_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS chat_room_memberships_papa_user_idx
  ON public.chat_room_memberships (papa_id, user_id) WHERE papa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS chat_room_memberships_user_idx ON public.chat_room_memberships(user_id);

ALTER TABLE public.chat_room_memberships ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.chat_room_memberships TO authenticated;
GRANT ALL ON public.chat_room_memberships TO service_role;

CREATE OR REPLACE FUNCTION public.can_access_chat_room(
  target_program_id uuid DEFAULT NULL,
  target_papa_id uuid DEFAULT NULL,
  target_team text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_team text;
  platform_admin boolean;
BEGIN
  SELECT u.team INTO caller_team FROM public.users u
  WHERE u.id = auth.uid() AND u.is_active = true AND u.activation_status = 'active';
  IF NOT FOUND THEN RETURN false; END IF;
  platform_admin := public.is_platform_admin();

  IF target_team IS NOT NULL THEN
    RETURN target_program_id IS NULL AND target_papa_id IS NULL
      AND target_team IN ('strength', 'wisdom', 'swift')
      AND (platform_admin OR caller_team = target_team);
  END IF;
  IF target_program_id IS NULL THEN RETURN false; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.programs p WHERE p.id = target_program_id
      AND lower(trim(coalesce(p.status, ''))) <> 'archived'
      AND coalesce((to_jsonb(p)->>'is_archived')::boolean, false) = false
      AND coalesce((to_jsonb(p)->>'is_deleted')::boolean, false) = false
  ) THEN RETURN false; END IF;
  IF target_papa_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.papas p WHERE p.id = target_papa_id
      AND p.program_id = target_program_id AND coalesce(p.is_deleted, false) = false
  ) THEN RETURN false; END IF;

  IF platform_admin THEN RETURN true; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.chat_room_memberships membership
    WHERE membership.user_id = auth.uid()
      AND membership.program_id = target_program_id
      AND membership.papa_id IS NOT DISTINCT FROM target_papa_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_chat_message(target_message_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_messages message
    WHERE message.id = target_message_id
      AND public.can_access_chat_room(message.program_id, message.papa_id, message.team)
      AND (
        public.is_platform_admin()
        OR (
          message.deleted_at IS NULL AND coalesce(message.is_archived, false) = false
          AND (
            coalesce(message.is_private, false) = false
            OR message.sender_id = auth.uid()
            OR coalesce(message.mentions, '[]'::jsonb) ? auth.uid()::text
          )
        )
      )
  );
$$;

DROP POLICY IF EXISTS chat_memberships_read ON public.chat_room_memberships;
CREATE POLICY chat_memberships_read ON public.chat_room_memberships FOR SELECT TO authenticated
USING (
  public.is_active_member()
  AND (public.is_platform_admin() OR user_id = auth.uid())
);
DROP POLICY IF EXISTS chat_memberships_insert ON public.chat_room_memberships;
CREATE POLICY chat_memberships_insert ON public.chat_room_memberships FOR INSERT TO authenticated
WITH CHECK (public.is_platform_admin() AND added_by = auth.uid());
DROP POLICY IF EXISTS chat_memberships_delete ON public.chat_room_memberships;
CREATE POLICY chat_memberships_delete ON public.chat_room_memberships FOR DELETE TO authenticated
USING (public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.validate_chat_room_membership()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Foreign-key maintenance may clear added_by after an account is removed;
  -- it must not revalidate an unchanged, historical room membership.
  IF TG_OP = 'UPDATE' AND NEW.program_id IS NOT DISTINCT FROM OLD.program_id
    AND NEW.papa_id IS NOT DISTINCT FROM OLD.papa_id AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.programs p WHERE p.id = NEW.program_id
      AND lower(trim(coalesce(p.status, ''))) <> 'archived'
      AND coalesce((to_jsonb(p)->>'is_archived')::boolean, false) = false
      AND coalesce((to_jsonb(p)->>'is_deleted')::boolean, false) = false
  ) THEN RAISE EXCEPTION 'The program chat is no longer available' USING ERRCODE = '23514'; END IF;
  IF NEW.papa_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.papas p WHERE p.id = NEW.papa_id
      AND p.program_id = NEW.program_id AND coalesce(p.is_deleted, false) = false
  ) THEN RAISE EXCEPTION 'The Papa must belong to this program' USING ERRCODE = '23514'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = NEW.user_id
      AND u.is_active = true AND u.activation_status = 'active'
  ) THEN RAISE EXCEPTION 'Only active officers can be added to chat' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS chat_room_memberships_validate ON public.chat_room_memberships;
CREATE TRIGGER chat_room_memberships_validate BEFORE INSERT OR UPDATE ON public.chat_room_memberships
FOR EACH ROW EXECUTE FUNCTION public.validate_chat_room_membership();

-- Restrictive policies are ANDed with every legacy permissive policy. An old
-- broad authenticated-read policy therefore cannot bypass room membership.
DROP POLICY IF EXISTS chat_room_access_guard ON public.chat_messages;
CREATE POLICY chat_room_access_guard ON public.chat_messages AS RESTRICTIVE
FOR ALL TO authenticated
USING (public.can_access_chat_room(program_id, papa_id, team))
WITH CHECK (public.can_access_chat_room(program_id, papa_id, team));

DROP POLICY IF EXISTS chat_message_visibility_guard ON public.chat_messages;
CREATE POLICY chat_message_visibility_guard ON public.chat_messages AS RESTRICTIVE
FOR SELECT TO authenticated USING (
  public.is_platform_admin()
  OR (
    deleted_at IS NULL AND coalesce(is_archived, false) = false
    AND (
      coalesce(is_private, false) = false OR sender_id = auth.uid()
      OR coalesce(mentions, '[]'::jsonb) ? auth.uid()::text
    )
  )
);

DROP POLICY IF EXISTS chat_message_sender_guard ON public.chat_messages;
CREATE POLICY chat_message_sender_guard ON public.chat_messages AS RESTRICTIVE
FOR INSERT TO authenticated WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS chat_message_delete_guard ON public.chat_messages;
CREATE POLICY chat_message_delete_guard ON public.chat_messages AS RESTRICTIVE
FOR DELETE TO authenticated USING (public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.guard_chat_message_changes()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE reply_message public.chat_messages%ROWTYPE;
BEGIN
  IF public.is_trusted_backend() THEN RETURN NEW; END IF;
  IF NOT public.can_access_chat_room(NEW.program_id, NEW.papa_id, NEW.team) THEN
    RAISE EXCEPTION 'You do not have access to this chat room' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.sender_id IS DISTINCT FROM auth.uid()
      OR NEW.deleted_at IS NOT NULL OR coalesce(NEW.deleted_by_admin, false)
      OR coalesce(NEW.flagged, false) OR NEW.flagged_by IS NOT NULL
      OR coalesce(NEW.is_archived, false)
      OR coalesce(NEW.read_by, '[]'::jsonb) <> '[]'::jsonb THEN
      RAISE EXCEPTION 'Invalid message metadata' USING ERRCODE = '42501';
    END IF;
    NEW.created_at := now();
    NEW.edited_at := NULL;
  ELSE
    IF NOT public.can_access_chat_message(OLD.id) THEN
      RAISE EXCEPTION 'You cannot change this message' USING ERRCODE = '42501';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.program_id IS DISTINCT FROM OLD.program_id OR NEW.papa_id IS DISTINCT FROM OLD.papa_id
      OR NEW.team IS DISTINCT FROM OLD.team OR NEW.reply_to_id IS DISTINCT FROM OLD.reply_to_id
      OR NEW.attachments IS DISTINCT FROM OLD.attachments OR NEW.mentions IS DISTINCT FROM OLD.mentions
      OR NEW.is_private IS DISTINCT FROM OLD.is_private
      OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at OR NEW.deleted_by_admin IS DISTINCT FROM OLD.deleted_by_admin
      OR NEW.flagged IS DISTINCT FROM OLD.flagged OR NEW.flagged_by IS DISTINCT FROM OLD.flagged_by
      OR NEW.is_archived IS DISTINCT FROM OLD.is_archived THEN
      RAISE EXCEPTION 'Message ownership, room and moderation fields cannot be changed here' USING ERRCODE = '42501';
    END IF;
    IF NEW.content IS DISTINCT FROM OLD.content THEN
      IF OLD.sender_id IS DISTINCT FROM auth.uid() OR OLD.deleted_at IS NOT NULL
        OR coalesce(OLD.is_archived, false) OR OLD.created_at IS NULL OR OLD.created_at < now() - interval '3 minutes' THEN
        RAISE EXCEPTION 'This message can no longer be edited' USING ERRCODE = '42501';
      END IF;
      NEW.edited_at := now();
    ELSIF NEW.edited_at IS DISTINCT FROM OLD.edited_at THEN
      RAISE EXCEPTION 'Invalid edit metadata' USING ERRCODE = '42501';
    END IF;
    IF NEW.read_by IS DISTINCT FROM OLD.read_by
      AND NEW.read_by IS DISTINCT FROM (coalesce(OLD.read_by, '[]'::jsonb) || jsonb_build_array(auth.uid()::text)) THEN
      RAISE EXCEPTION 'You can only mark a message read for yourself' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' OR NEW.content IS DISTINCT FROM OLD.content THEN
    IF length(trim(NEW.content)) = 0 OR length(NEW.content) > 4000 THEN
      RAISE EXCEPTION 'Messages must contain between 1 and 4000 characters' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' AND jsonb_typeof(coalesce(NEW.mentions, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Invalid message mentions' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.reply_to_id IS NOT NULL THEN
    SELECT * INTO reply_message FROM public.chat_messages WHERE id = NEW.reply_to_id;
    IF NOT FOUND OR reply_message.program_id IS DISTINCT FROM NEW.program_id
      OR reply_message.papa_id IS DISTINCT FROM NEW.papa_id OR reply_message.team IS DISTINCT FROM NEW.team
      OR NOT public.can_access_chat_message(NEW.reply_to_id) THEN
      RAISE EXCEPTION 'A reply must target a visible message in this room' USING ERRCODE = '42501';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS chat_messages_guard_changes ON public.chat_messages;
CREATE TRIGGER chat_messages_guard_changes BEFORE INSERT OR UPDATE ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.guard_chat_message_changes();

-- The trigger also guards legacy SECURITY DEFINER edit_chat_message calls:
-- their external auth.uid remains the sender, so definer ownership cannot
-- bypass room access, sender identity, the edit window or immutable metadata.

CREATE OR REPLACE FUNCTION public.edit_room_chat_message(message_id uuid, new_content text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE edited_message public.chat_messages%ROWTYPE;
BEGIN
  IF NOT public.can_access_chat_message(message_id) THEN
    RAISE EXCEPTION 'You cannot edit this message' USING ERRCODE = '42501';
  END IF;
  IF new_content IS NULL OR length(trim(new_content)) = 0 OR length(new_content) > 4000 THEN
    RAISE EXCEPTION 'Messages must contain between 1 and 4000 characters' USING ERRCODE = '22023';
  END IF;
  UPDATE public.chat_messages message SET content = new_content, edited_at = now()
  WHERE message.id = message_id AND message.sender_id = auth.uid()
    AND message.deleted_at IS NULL AND coalesce(message.is_archived, false) = false
    AND message.created_at >= now() - interval '3 minutes'
  RETURNING message.* INTO edited_message;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This message can no longer be edited' USING ERRCODE = '42501';
  END IF;
  RETURN to_jsonb(edited_message);
END;
$$;

DROP POLICY IF EXISTS chat_reaction_access_guard ON public.message_reactions;
CREATE POLICY chat_reaction_access_guard ON public.message_reactions AS RESTRICTIVE
FOR ALL TO authenticated
USING (public.can_access_chat_message(message_id))
WITH CHECK (user_id = auth.uid() AND public.can_access_chat_message(message_id));

CREATE OR REPLACE FUNCTION public.mark_chat_messages_read(message_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_active_member() THEN
    RAISE EXCEPTION 'An active account is required' USING ERRCODE = '42501';
  END IF;
  IF coalesce(array_length(message_ids, 1), 0) > 100 THEN
    RAISE EXCEPTION 'Mark at most 100 messages at once' USING ERRCODE = '22023';
  END IF;
  UPDATE public.chat_messages message
  SET read_by = coalesce(message.read_by, '[]'::jsonb) || jsonb_build_array(auth.uid()::text)
  WHERE message.id = ANY(message_ids)
    AND public.can_access_chat_message(message.id)
    AND NOT (coalesce(message.read_by, '[]'::jsonb) ? auth.uid()::text);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_message_read(message_uuid uuid, user_uuid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF user_uuid IS DISTINCT FROM auth.uid() OR NOT public.can_access_chat_message(message_uuid) THEN
    RAISE EXCEPTION 'You cannot mark this message read' USING ERRCODE = '42501';
  END IF;
  PERFORM public.mark_chat_messages_read(ARRAY[message_uuid]);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_messages_as_read(p_user_id uuid, p_program_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() OR NOT public.is_active_member() THEN
    RAISE EXCEPTION 'You can only mark messages read for yourself' USING ERRCODE = '42501';
  END IF;
  UPDATE public.chat_messages message
  SET read_by = coalesce(message.read_by, '[]'::jsonb) || jsonb_build_array(auth.uid()::text)
  WHERE message.program_id = p_program_id
    AND public.can_access_chat_message(message.id)
    AND NOT (coalesce(message.read_by, '[]'::jsonb) ? auth.uid()::text);
END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_chat_topic(topic text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE room_key text; kind text; identifier text; program_id uuid;
BEGIN
  IF left(topic, 10) <> 'chat-room:' THEN RETURN false; END IF;
  room_key := substring(topic FROM 11);
  IF array_length(string_to_array(room_key, ':'), 1) <> 2 THEN RETURN false; END IF;
  kind := split_part(room_key, ':', 1);
  identifier := split_part(room_key, ':', 2);
  IF kind = 'team' THEN RETURN public.can_access_chat_room(NULL, NULL, identifier); END IF;
  IF identifier !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN false; END IF;
  IF kind = 'program' THEN RETURN public.can_access_chat_room(identifier::uuid, NULL, NULL); END IF;
  IF kind = 'papa' THEN
    SELECT p.program_id INTO program_id FROM public.papas p WHERE p.id = identifier::uuid;
    IF program_id IS NULL THEN RETURN false; END IF;
    RETURN public.can_access_chat_room(program_id, identifier::uuid, NULL);
  END IF;
  RETURN false;
END;
$$;

-- Realtime's managed messages table already has RLS. Do not ALTER its RLS
-- setting: Supabase only permits policy management on this managed table.
DROP POLICY IF EXISTS chat_room_broadcast_receive ON realtime.messages;
CREATE POLICY chat_room_broadcast_receive ON realtime.messages FOR SELECT TO authenticated
USING (extension = 'broadcast' AND public.can_access_chat_topic((SELECT realtime.topic())));
DROP POLICY IF EXISTS chat_room_broadcast_send ON realtime.messages;
CREATE POLICY chat_room_broadcast_send ON realtime.messages FOR INSERT TO authenticated
WITH CHECK (extension = 'broadcast' AND public.can_access_chat_topic((SELECT realtime.topic())));
DROP POLICY IF EXISTS chat_room_broadcast_receive_guard ON realtime.messages;
CREATE POLICY chat_room_broadcast_receive_guard ON realtime.messages AS RESTRICTIVE FOR SELECT TO authenticated
USING (left((SELECT realtime.topic()), 10) <> 'chat-room:' OR (extension = 'broadcast' AND public.can_access_chat_topic((SELECT realtime.topic()))));
DROP POLICY IF EXISTS chat_room_broadcast_send_guard ON realtime.messages;
CREATE POLICY chat_room_broadcast_send_guard ON realtime.messages AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (left((SELECT realtime.topic()), 10) <> 'chat-room:' OR (extension = 'broadcast' AND public.can_access_chat_topic((SELECT realtime.topic()))));

REVOKE ALL ON FUNCTION public.can_access_chat_room(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_chat_message(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_chat_topic(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_chat_messages_read(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.edit_room_chat_message(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_message_read(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_messages_as_read(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.validate_chat_room_membership() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_chat_message_changes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_chat_room(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_chat_message(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_chat_topic(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_chat_messages_read(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.edit_room_chat_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_message_read(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_messages_as_read(uuid, uuid) TO authenticated;

COMMIT;
