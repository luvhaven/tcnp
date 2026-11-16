-- Programme additions: who is on a programme, and how a unit head adds people.
--
-- Being in an Oscar is membership of a unit. It does not put an officer on any
-- programme. Officers are selected for a programme from those who said they
-- are available, or added out of necessity:
--   * a unit head may add one of their own officers who accepted the
--     programme's availability request — that takes effect at once;
--   * a unit head may also add one who did not, but that addition waits for an
--     executive, an admin or the Head of Command to approve it;
--   * executives, admins and the Head of Command add anyone directly, as they
--     already can (nothing here changes or limits that).
--
-- Only November (Den) uses this flow so far; the table is unit-keyed so other
-- units can adopt it without a schema change.

-- 1. "Active for a programme" now means selected for it: an active title on
-- the programme's officers list. Saying "I am available" is an offer, not a
-- selection, so on its own it no longer counts.
CREATE OR REPLACE FUNCTION public.is_program_active_officer(target_user uuid, target_program uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT target_user IS NOT NULL AND target_program IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.title_assignments assignment
    WHERE assignment.program_id = target_program
      AND assignment.user_id = target_user
      AND assignment.is_active = true
  );
$$;

-- 2. Who may approve an addition: executives and admins (platform admins) and
-- the Head of Command.
CREATE OR REPLACE FUNCTION public.can_approve_program_additions()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role::text = 'head_of_command'
      AND u.is_active = true
      AND u.activation_status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.can_approve_program_additions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_approve_program_additions() TO authenticated, service_role;

-- 3. The record of every addition a unit head makes, and its approval.
CREATE TABLE IF NOT EXISTS public.program_addition_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  unit_slug text NOT NULL REFERENCES public.units(slug) ON UPDATE CASCADE ON DELETE CASCADE,
  title_code text NOT NULL,
  -- True when the officer had accepted the programme's availability request,
  -- so the addition needed no approval.
  had_availability boolean NOT NULL DEFAULT false,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  requested_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  decided_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT program_addition_requests_status CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'))
);

-- One open request per officer per programme.
CREATE UNIQUE INDEX IF NOT EXISTS program_addition_requests_one_pending
  ON public.program_addition_requests(program_id, user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_program_addition_requests_status
  ON public.program_addition_requests(status, created_at DESC);

ALTER TABLE public.program_addition_requests ENABLE ROW LEVEL SECURITY;

-- Read-only from the app. Every write goes through /api/program-additions,
-- which checks the caller and performs the title assignment with the same
-- trusted path the existing programme roster uses.
DROP POLICY IF EXISTS program_addition_requests_select ON public.program_addition_requests;
CREATE POLICY program_addition_requests_select ON public.program_addition_requests
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR requested_by = auth.uid()
  OR public.can_approve_program_additions()
  OR public.can_manage_unit(unit_slug)
);

-- 4. The Den head's view of one programme, now with the pending flag. The
-- return type changes, so the function is dropped and recreated.
DROP FUNCTION IF EXISTS public.den_floor_candidates(uuid);
CREATE FUNCTION public.den_floor_candidates(target_program uuid)
RETURNS TABLE (
  user_id uuid,
  accepted_availability boolean,
  on_officers_list boolean,
  pending_approval boolean,
  granted boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    membership.user_id,
    EXISTS (
      SELECT 1
      FROM public.mission_responses response
      JOIN public.mission_requests request ON request.id = response.request_id
      WHERE request.program_id = target_program
        AND response.user_id = membership.user_id
        AND response.response = 'yes'
    ),
    public.is_program_active_officer(membership.user_id, target_program),
    EXISTS (
      SELECT 1 FROM public.program_addition_requests addition
      WHERE addition.program_id = target_program
        AND addition.user_id = membership.user_id
        AND addition.status = 'pending'
    ),
    EXISTS (
      SELECT 1 FROM public.den_floor_grants floor_grant
      WHERE floor_grant.program_id = target_program
        AND floor_grant.user_id = membership.user_id
    )
  FROM public.unit_memberships membership
  JOIN public.units unit_record ON unit_record.id = membership.unit_id
  WHERE unit_record.slug = 'november_den'
    AND membership.status = 'active'
    AND public.can_manage_unit('november_den');
$$;

REVOKE ALL ON FUNCTION public.den_floor_candidates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.den_floor_candidates(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
