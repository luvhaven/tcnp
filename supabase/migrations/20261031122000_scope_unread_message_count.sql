-- The unread badge counted every unread message in the database (other teams'
-- rooms, old test chats, rooms the officer was never added to), so officers
-- saw e.g. "49" with nothing to read. Count only rooms the caller can open,
-- and only for the caller. The app now counts through RLS directly; this keeps
-- the RPC consistent for any remaining caller.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_unread_message_count(user_uuid uuid)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF user_uuid IS DISTINCT FROM auth.uid() OR NOT public.is_active_member() THEN
    RETURN 0;
  END IF;
  RETURN coalesce((
    SELECT sum(grouped.unread)::integer FROM (
      SELECT m.program_id, m.papa_id, m.team, count(*) AS unread
      FROM public.chat_messages m
      WHERE m.deleted_at IS NULL
        AND coalesce(m.is_archived, false) = false
        AND m.sender_id IS DISTINCT FROM user_uuid
        AND NOT (coalesce(m.read_by, '[]'::jsonb) ? user_uuid::text)
        AND (coalesce(m.is_private, false) = false OR coalesce(m.mentions, '[]'::jsonb) ? user_uuid::text)
      GROUP BY m.program_id, m.papa_id, m.team
    ) grouped
    WHERE public.can_access_chat_room(grouped.program_id, grouped.papa_id, grouped.team)
  ), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_unread_message_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_unread_message_count(uuid) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';

COMMIT;
