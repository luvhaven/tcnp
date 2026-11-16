-- November (Den) — floor work is granted per programme by the Den head.
--
-- Replaces 20261115130000, which opened menus, vendors and meal orders to
-- every Den unit member. The rule is narrower. A Den officer may do floor work
-- for a programme only when BOTH hold:
--   1. they are active for that programme — they accepted its availability
--      request, or they are on its active officers list; and
--   2. the head of November (Den) has granted them the privilege for it from
--      the Den page.
--
-- Existing role-based policies are not touched, so admins, command, the Den
-- and Nest roles and Welfare keep exactly what they had. Vendor management
-- goes back to those roles only (the Team Lead's job).

-- 0. Withdraw the blanket member policies.
DROP POLICY IF EXISTS program_menus_den_member_insert ON public.program_menus;
DROP POLICY IF EXISTS program_menus_den_member_update ON public.program_menus;
DROP POLICY IF EXISTS vendors_den_member_insert ON public.vendors;
DROP POLICY IF EXISTS vendors_den_member_update ON public.vendors;
DROP POLICY IF EXISTS papa_meal_orders_den_member_insert ON public.papa_meal_orders;
DROP POLICY IF EXISTS papa_meal_orders_den_member_update ON public.papa_meal_orders;

-- 1. "Active for a programme": said yes to its availability request, or holds
-- an active title on its officers list. Uses the app's existing records.
CREATE OR REPLACE FUNCTION public.is_program_active_officer(target_user uuid, target_program uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT target_user IS NOT NULL AND target_program IS NOT NULL AND (
    EXISTS (
      SELECT 1
      FROM public.mission_responses response
      JOIN public.mission_requests request ON request.id = response.request_id
      WHERE request.program_id = target_program
        AND response.user_id = target_user
        AND response.response = 'yes'
    )
    OR EXISTS (
      SELECT 1
      FROM public.title_assignments assignment
      WHERE assignment.program_id = target_program
        AND assignment.user_id = target_user
        AND assignment.is_active = true
    )
  );
$$;

REVOKE ALL ON FUNCTION public.is_program_active_officer(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_program_active_officer(uuid, uuid) TO authenticated, service_role;

-- 2. The head's grant: one row per officer per programme.
CREATE TABLE IF NOT EXISTS public.den_floor_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT den_floor_grants_unique UNIQUE (program_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_den_floor_grants_user ON public.den_floor_grants(user_id, program_id);

ALTER TABLE public.den_floor_grants ENABLE ROW LEVEL SECURITY;

-- An officer sees their own grants; the Den head and platform admins see all.
DROP POLICY IF EXISTS den_floor_grants_select ON public.den_floor_grants;
CREATE POLICY den_floor_grants_select ON public.den_floor_grants
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.can_manage_unit('november_den'));

-- Only the Den head (or a platform admin) grants, and only to a Den officer
-- who is active for that programme. granted_by must be the caller.
DROP POLICY IF EXISTS den_floor_grants_insert ON public.den_floor_grants;
CREATE POLICY den_floor_grants_insert ON public.den_floor_grants
FOR INSERT TO authenticated
WITH CHECK (
  public.can_manage_unit('november_den')
  AND granted_by = auth.uid()
  AND public.is_program_active_officer(user_id, program_id)
  AND EXISTS (
    SELECT 1
    FROM public.unit_memberships membership
    JOIN public.units unit_record ON unit_record.id = membership.unit_id
    WHERE unit_record.slug = 'november_den'
      AND membership.user_id = den_floor_grants.user_id
      AND membership.status = 'active'
  )
);

DROP POLICY IF EXISTS den_floor_grants_delete ON public.den_floor_grants;
CREATE POLICY den_floor_grants_delete ON public.den_floor_grants
FOR DELETE TO authenticated
USING (public.can_manage_unit('november_den'));

-- 3. The check the data policies use. Evaluated on every write, so the
-- privilege lapses by itself when an officer leaves the unit or comes off the
-- programme's list — the head does not have to remember to revoke it.
CREATE OR REPLACE FUNCTION public.has_den_floor_access(target_program uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT target_program IS NOT NULL
    AND public.is_unit_member('november_den')
    AND public.is_program_active_officer(auth.uid(), target_program)
    AND EXISTS (
      SELECT 1 FROM public.den_floor_grants floor_grant
      WHERE floor_grant.program_id = target_program
        AND floor_grant.user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.has_den_floor_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_den_floor_access(uuid) TO authenticated, service_role;

-- 4. Additive policies: menus and Papa meal orders of the granted programme.
DROP POLICY IF EXISTS program_menus_den_floor_insert ON public.program_menus;
CREATE POLICY program_menus_den_floor_insert ON public.program_menus
FOR INSERT TO authenticated
WITH CHECK (public.has_den_floor_access(program_id));

DROP POLICY IF EXISTS program_menus_den_floor_update ON public.program_menus;
CREATE POLICY program_menus_den_floor_update ON public.program_menus
FOR UPDATE TO authenticated
USING (public.has_den_floor_access(program_id))
WITH CHECK (public.has_den_floor_access(program_id));

DROP POLICY IF EXISTS papa_meal_orders_den_floor_insert ON public.papa_meal_orders;
CREATE POLICY papa_meal_orders_den_floor_insert ON public.papa_meal_orders
FOR INSERT TO authenticated
WITH CHECK (
  public.has_den_floor_access(program_id)
  AND EXISTS (SELECT 1 FROM public.papas p WHERE p.id = papa_meal_orders.papa_id)
);

DROP POLICY IF EXISTS papa_meal_orders_den_floor_update ON public.papa_meal_orders;
CREATE POLICY papa_meal_orders_den_floor_update ON public.papa_meal_orders
FOR UPDATE TO authenticated
USING (
  public.has_den_floor_access(program_id)
  AND EXISTS (SELECT 1 FROM public.papas p WHERE p.id = papa_meal_orders.papa_id)
)
WITH CHECK (
  public.has_den_floor_access(program_id)
  AND EXISTS (SELECT 1 FROM public.papas p WHERE p.id = papa_meal_orders.papa_id)
);

-- 5. What the head needs to decide: for one programme, every Den officer, why
-- they are (or are not) active for it, and whether they hold the grant.
-- Availability answers are private to each officer, so this is a function for
-- the Den head and platform admins rather than a wider read policy.
CREATE OR REPLACE FUNCTION public.den_floor_candidates(target_program uuid)
RETURNS TABLE (
  user_id uuid,
  accepted_availability boolean,
  on_officers_list boolean,
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
    EXISTS (
      SELECT 1 FROM public.title_assignments assignment
      WHERE assignment.program_id = target_program
        AND assignment.user_id = membership.user_id
        AND assignment.is_active = true
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
