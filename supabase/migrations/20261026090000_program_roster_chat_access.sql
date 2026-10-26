-- Active program assignments include the main Program chat only.
-- Papa rooms continue to require their own explicit invitations.
BEGIN;

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
  IF target_papa_id IS NULL AND EXISTS (
    SELECT 1 FROM public.current_title_assignments assignment
    WHERE assignment.program_id = target_program_id
      AND assignment.user_id = auth.uid() AND assignment.is_active = true
  ) THEN RETURN true; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.chat_room_memberships membership
    WHERE membership.user_id = auth.uid()
      AND membership.program_id = target_program_id
      AND membership.papa_id IS NOT DISTINCT FROM target_papa_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_chat_room(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_chat_room(uuid, uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.can_access_chat_room(uuid, uuid, text) IS
  'Active program assignees have main-room access; Papa rooms require explicit invitations.';
NOTIFY pgrst, 'reload schema';

COMMIT;
