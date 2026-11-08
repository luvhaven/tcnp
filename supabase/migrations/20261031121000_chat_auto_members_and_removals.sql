-- Program and Papa chat room membership follows operations by default.
--
-- * Papa room: every DO assigned to a journey for that Papa is a member
--   automatically (lead DO columns or journey_duty_officers, not rejected).
-- * Program room: officers with an active program title assignment (as before),
--   plus officers who said "available" to the program's mission request and
--   are assigned as DO on one of the program's journeys.
-- * Executives and admins can remove any non-admin officer from a room,
--   including automatic members. A removal row overrides the automatic rules
--   until the officer is added back (which deletes the removal).
BEGIN;

CREATE TABLE IF NOT EXISTS public.chat_room_removals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  papa_id uuid REFERENCES public.papas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  removed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS chat_room_removals_program_user_idx
  ON public.chat_room_removals (program_id, user_id) WHERE papa_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS chat_room_removals_papa_user_idx
  ON public.chat_room_removals (papa_id, user_id) WHERE papa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS chat_room_removals_user_idx ON public.chat_room_removals (user_id);

ALTER TABLE public.chat_room_removals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_room_removals FROM anon, authenticated;
GRANT SELECT ON public.chat_room_removals TO authenticated;
GRANT ALL ON public.chat_room_removals TO service_role;
DROP POLICY IF EXISTS chat_room_removals_admin_read ON public.chat_room_removals;
CREATE POLICY chat_room_removals_admin_read ON public.chat_room_removals FOR SELECT TO authenticated
  USING ((SELECT public.is_platform_admin()));

-- True when target_user is a DO on a live (not cancelled/deleted) journey for target_papa.
CREATE OR REPLACE FUNCTION public.is_papa_duty_officer(target_user uuid, target_papa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.journeys j
    WHERE coalesce(j.is_deleted, false) = false
      AND j.status::text <> 'cancelled'
      AND (j.papa_id = target_papa OR EXISTS (
        SELECT 1 FROM public.journey_papas jp WHERE jp.journey_id = j.id AND jp.papa_id = target_papa))
      AND (j.assigned_duty_officer_id = target_user OR j.assigned_do_id = target_user OR EXISTS (
        SELECT 1 FROM public.journey_duty_officers d
        WHERE d.journey_id = j.id AND d.user_id = target_user AND coalesce(d.status, '') <> 'rejected'))
  );
$$;

-- True when target_user said "yes" to the program's availability request and is a DO on one of its journeys.
CREATE OR REPLACE FUNCTION public.is_available_program_duty_officer(target_user uuid, target_program uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mission_responses r
    JOIN public.mission_requests q ON q.id = r.request_id
    WHERE q.program_id = target_program AND r.user_id = target_user AND r.response = 'yes'
  ) AND EXISTS (
    SELECT 1 FROM public.journeys j
    WHERE j.program_id = target_program
      AND coalesce(j.is_deleted, false) = false
      AND j.status::text <> 'cancelled'
      AND (j.assigned_duty_officer_id = target_user OR j.assigned_do_id = target_user OR EXISTS (
        SELECT 1 FROM public.journey_duty_officers d
        WHERE d.journey_id = j.id AND d.user_id = target_user AND coalesce(d.status, '') <> 'rejected'))
  );
$$;

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

  -- An executive/admin removal overrides every automatic rule below.
  IF EXISTS (
    SELECT 1 FROM public.chat_room_removals removal
    WHERE removal.user_id = auth.uid()
      AND removal.program_id = target_program_id
      AND removal.papa_id IS NOT DISTINCT FROM target_papa_id
  ) THEN RETURN false; END IF;

  IF target_papa_id IS NULL AND (
    EXISTS (
      SELECT 1 FROM public.current_title_assignments assignment
      WHERE assignment.program_id = target_program_id
        AND assignment.user_id = auth.uid() AND assignment.is_active = true
    ) OR public.is_available_program_duty_officer(auth.uid(), target_program_id)
  ) THEN RETURN true; END IF;

  IF target_papa_id IS NOT NULL AND public.is_papa_duty_officer(auth.uid(), target_papa_id) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.chat_room_memberships membership
    WHERE membership.user_id = auth.uid()
      AND membership.program_id = target_program_id
      AND membership.papa_id IS NOT DISTINCT FROM target_papa_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_papa_duty_officer(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_available_program_duty_officer(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_papa_duty_officer(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_available_program_duty_officer(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_access_chat_room(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_chat_room(uuid, uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.can_access_chat_room(uuid, uuid, text) IS
  'Program room: title assignees and available journey DOs; Papa room: that Papa''s DOs; plus explicit invitations; minus admin removals.';
NOTIFY pgrst, 'reload schema';

COMMIT;
