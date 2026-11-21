-- A programme's Tango Team Lead runs the Tango page for that programme.
--
-- Unit rights come from the unit membership, and only the unit head could add
-- or manage Cheetahs and drivers. An officer made "Team Lead - Tango" for one
-- programme (title code TANGO_OSCAR_LEAD on that programme) is not the unit
-- head, so the Tango page stayed read-only for the person running transport.
--
-- The rule now:
--   * The head of Tango stays the head. Nothing here changes membership levels.
--   * A Tango member holding an active TANGO_OSCAR_LEAD title on a programme
--     that is still open (status planning or active) can manage and coordinate
--     Tango: Cheetahs, drivers, licences, allocations, partners. The right ends
--     by itself when the programme is completed or archived, or the title is
--     removed.
--   * Who is in the unit and at what level stays with the permanent head and
--     platform admins only (is_unit_head), so a programme lead cannot promote
--     anyone, including themself.
--
-- No BEGIN/COMMIT: the migration runner wraps each file in its own transaction.

-- The permanent head of a unit: exactly what can_manage_unit meant until now.
CREATE OR REPLACE FUNCTION public.is_unit_head(unit_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_platform_admin() OR EXISTS (
    SELECT 1
    FROM public.unit_memberships membership
    JOIN public.units unit_record ON unit_record.id = membership.unit_id
    JOIN public.users user_record ON user_record.id = membership.user_id
    WHERE membership.user_id = auth.uid()
      AND membership.status = 'active'
      AND membership.access_level = 'head'
      AND unit_record.slug = unit_slug
      AND unit_record.is_active = true
      AND coalesce(user_record.is_active, true) = true
      AND coalesce(user_record.activation_status, 'active') = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_unit_head(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_unit_head(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_tango_programme_lead()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.title_assignments assignment
    JOIN public.official_titles title ON title.id = assignment.title_id
    JOIN public.programs programme ON programme.id = assignment.program_id
    JOIN public.users user_record ON user_record.id = assignment.user_id
    WHERE assignment.user_id = auth.uid()
      AND assignment.is_active = true
      AND title.code = 'TANGO_OSCAR_LEAD'
      AND lower(btrim(coalesce(programme.status, ''))) IN ('planning', 'active')
      AND coalesce(user_record.is_active, true) = true
      AND coalesce(user_record.activation_status, 'active') = 'active'
      -- Still a Tango officer: the title alone grants nothing.
      AND EXISTS (
        SELECT 1
        FROM public.unit_memberships membership
        JOIN public.units unit_record ON unit_record.id = membership.unit_id
        WHERE membership.user_id = assignment.user_id
          AND membership.status = 'active'
          AND unit_record.slug = 'tango'
          AND unit_record.is_active = true
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_tango_programme_lead() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_tango_programme_lead() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_manage_unit(unit_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_unit_head(unit_slug)
    OR (unit_slug = 'tango' AND public.is_tango_programme_lead());
$$;

CREATE OR REPLACE FUNCTION public.can_coordinate_unit(unit_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_platform_admin() OR EXISTS (
    SELECT 1
    FROM public.unit_memberships membership
    JOIN public.units unit_record ON unit_record.id = membership.unit_id
    JOIN public.users user_record ON user_record.id = membership.user_id
    WHERE membership.user_id = auth.uid()
      AND membership.status = 'active'
      AND membership.access_level IN ('head', 'sub_lead')
      AND unit_record.slug = unit_slug
      AND unit_record.is_active = true
      AND coalesce(user_record.is_active, true) = true
      AND coalesce(user_record.activation_status, 'active') = 'active'
  )
  OR (unit_slug = 'tango' AND public.is_tango_programme_lead());
$$;

-- Membership levels stay with the permanent head.
DROP POLICY IF EXISTS unit_memberships_scoped_write ON public.unit_memberships;
CREATE POLICY unit_memberships_scoped_write ON public.unit_memberships
FOR ALL TO authenticated
USING (
  public.is_platform_admin()
  OR EXISTS (SELECT 1 FROM public.units u WHERE u.id = unit_memberships.unit_id AND public.is_unit_head(u.slug))
)
WITH CHECK (
  public.is_platform_admin()
  OR EXISTS (SELECT 1 FROM public.units u WHERE u.id = unit_memberships.unit_id AND public.is_unit_head(u.slug))
);

NOTIFY pgrst, 'reload schema';
