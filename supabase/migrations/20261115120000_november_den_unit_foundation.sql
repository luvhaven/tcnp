-- November (Den) — unit foundation (Stage 0 of the Den operations build-out).
--
-- November (Den) had its own page and its own roles, but was never registered
-- in public.units. That kept it out of everything built on unit membership:
-- unit_projects / unit_tasks, unit_deployments (shift rosters) and the
-- can_manage_unit() / is_unit_member() checks those tables' policies use.
--
-- This migration is additive and repeatable. It changes nobody's role.
--   1. Registers the `november_den` unit.
--   2. Adds a `sub_lead` membership level between member and head.
--   3. Teaches the legacy role/Oscar bridge about Den, and backfills members.
--   4. Adds can_coordinate_unit() for head-or-sub-lead checks in later stages.
--   5. Lets members of a unit see who else is in it.

-- 1. The unit itself.
INSERT INTO public.units (slug, name, description, accent)
VALUES ('november_den', 'November (Den)', 'VIP hospitality, Den lounges, menus, vendors and guest service', 'orange')
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = now();

-- 2. Sub-Team Lead level. can_manage_unit() still means head only, so a
-- sub-lead gains nothing until a policy opts in through can_coordinate_unit().
ALTER TABLE public.unit_memberships DROP CONSTRAINT IF EXISTS unit_memberships_access_level;
ALTER TABLE public.unit_memberships
  ADD CONSTRAINT unit_memberships_access_level
  CHECK (access_level IN ('member', 'sub_lead', 'head'));

-- A sub-lead is always a deliberate appointment by a head. Mark the row as
-- curated so the legacy bridge below (which rebuilds managed_by_legacy rows on
-- every users update) never silently demotes one back to member.
CREATE OR REPLACE FUNCTION public.mark_curated_unit_membership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.access_level = 'sub_lead' THEN
    NEW.managed_by_legacy := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS unit_memberships_mark_curated ON public.unit_memberships;
CREATE TRIGGER unit_memberships_mark_curated
BEFORE INSERT OR UPDATE OF access_level ON public.unit_memberships
FOR EACH ROW EXECUTE FUNCTION public.mark_curated_unit_membership();

-- 3a. Who is a Den officer, from the legacy role / Oscar text. One definition,
-- used by the backfill and the sync trigger. The umbrella `november_oscar`
-- role is not matched here: the app resolves it to Nest.
CREATE OR REPLACE FUNCTION public.legacy_matches_november_den(target_role text, target_oscar text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  -- \m and \M are word boundaries: "Den" matches, "garden" or "resident" do not.
  SELECT lower(coalesce(target_role, '')) LIKE '%noscar_den%'
    OR (
      lower(coalesce(target_oscar, '')) ~ '\mden\M'
      AND (lower(coalesce(target_oscar, '')) LIKE '%november%' OR lower(coalesce(target_oscar, '')) LIKE '%noscar%')
    );
$$;

-- 3b. Head detection, with the Den clause added. Every other unit's clause is
-- unchanged from the live definition.
CREATE OR REPLACE FUNCTION public.legacy_unit_access_level(
  target_unit_slug text,
  target_role text,
  target_oscar text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN
    (target_unit_slug = 'alpha' AND (
      lower(coalesce(target_role, '')) = 'head_alpha_oscar'
      OR (lower(coalesce(target_oscar, '')) LIKE '%head%' AND lower(coalesce(target_oscar, '')) LIKE '%alpha%')
    ))
    OR (target_unit_slug = 'command' AND (
      lower(coalesce(target_role, '')) = 'head_of_command'
      OR (lower(coalesce(target_oscar, '')) LIKE '%head%' AND lower(coalesce(target_oscar, '')) LIKE '%command%')
    ))
    OR (target_unit_slug = 'compliance' AND (
      lower(coalesce(target_role, '')) = 'head_compliance_oscar'
      OR (lower(coalesce(target_oscar, '')) LIKE '%head%' AND lower(coalesce(target_oscar, '')) LIKE '%compliance%')
    ))
    OR (target_unit_slug = 'november_nest' AND (
      lower(coalesce(target_role, '')) = 'head_noscar_nest'
      OR (
        lower(coalesce(target_oscar, '')) LIKE '%head%'
        AND lower(coalesce(target_oscar, '')) LIKE '%nest%'
        AND (lower(coalesce(target_oscar, '')) LIKE '%november%' OR lower(coalesce(target_oscar, '')) LIKE '%noscar%')
      )
    ))
    OR (target_unit_slug = 'november_den' AND (
      lower(coalesce(target_role, '')) = 'head_noscar_den'
      OR (
        lower(coalesce(target_oscar, '')) LIKE '%head%'
        AND public.legacy_matches_november_den(NULL, target_oscar)
      )
    ))
    OR (target_unit_slug = 'tango' AND (
      lower(coalesce(target_role, '')) = 'head_tango_oscar'
      OR (lower(coalesce(target_oscar, '')) LIKE '%head%' AND lower(coalesce(target_oscar, '')) LIKE '%tango%')
    ))
    OR (target_unit_slug = 'training' AND (
      lower(coalesce(target_role, '')) = 'head_training_oscar'
      OR (lower(coalesce(target_oscar, '')) LIKE '%head%' AND lower(coalesce(target_oscar, '')) LIKE '%training%')
    ))
    OR (target_unit_slug = 'victor' AND (
      lower(coalesce(target_role, '')) = 'head_victor_oscar'
      OR (lower(coalesce(target_oscar, '')) LIKE '%head%' AND lower(coalesce(target_oscar, '')) LIKE '%victor%')
    ))
    OR (target_unit_slug = 'welfare' AND (
      lower(coalesce(target_role, '')) = 'head_welfare_oscar'
      OR (lower(coalesce(target_oscar, '')) LIKE '%head%' AND lower(coalesce(target_oscar, '')) LIKE '%welfare%')
    ))
  THEN 'head' ELSE 'member' END;
$$;

-- 3c. Keep automatically-derived memberships in step as accounts are created,
-- approved or reassigned — now including Den. Curated rows
-- (managed_by_legacy = false) are never touched.
CREATE OR REPLACE FUNCTION public.sync_legacy_unit_memberships_for_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.unit_memberships
  WHERE user_id = NEW.id AND managed_by_legacy = true;

  INSERT INTO public.unit_memberships (
    unit_id, user_id, access_level, status, managed_by_legacy
  )
  SELECT
    unit_record.id,
    NEW.id,
    public.legacy_unit_access_level(unit_record.slug, NEW.role::text, NEW.oscar),
    CASE
      WHEN coalesce(NEW.is_active, true)
        AND coalesce(NEW.activation_status, 'active') = 'active'
      THEN 'active'
      ELSE 'inactive'
    END,
    true
  FROM public.units unit_record
  WHERE
    (unit_record.slug = 'alpha' AND (lower(coalesce(NEW.role::text, '')) LIKE '%alpha%' OR lower(coalesce(NEW.oscar, '')) LIKE '%alpha%' OR lower(coalesce(NEW.oscar, '')) = 'ao'))
    OR (unit_record.slug = 'command' AND (lower(coalesce(NEW.role::text, '')) IN ('command', 'head_of_command') OR lower(coalesce(NEW.oscar, '')) LIKE '%command%'))
    OR (unit_record.slug = 'compliance' AND (lower(coalesce(NEW.role::text, '')) LIKE '%compliance%' OR lower(coalesce(NEW.oscar, '')) LIKE '%compliance%' OR lower(coalesce(NEW.oscar, '')) = 'co'))
    OR (unit_record.slug = 'november_nest' AND (lower(coalesce(NEW.role::text, '')) LIKE '%noscar_nest%' OR lower(coalesce(NEW.oscar, '')) LIKE '%nest%'))
    OR (unit_record.slug = 'november_den' AND public.legacy_matches_november_den(NEW.role::text, NEW.oscar))
    OR (unit_record.slug = 'tango' AND (lower(coalesce(NEW.role::text, '')) LIKE '%tango%' OR lower(coalesce(NEW.oscar, '')) LIKE '%tango%' OR lower(coalesce(NEW.oscar, '')) = 'to'))
    OR (unit_record.slug = 'training' AND (lower(coalesce(NEW.role::text, '')) LIKE '%training%' OR lower(coalesce(NEW.oscar, '')) LIKE '%training%'))
    OR (unit_record.slug = 'victor' AND (lower(coalesce(NEW.role::text, '')) LIKE '%victor%' OR lower(coalesce(NEW.oscar, '')) LIKE '%victor%' OR lower(coalesce(NEW.oscar, '')) = 'vo'))
    OR (unit_record.slug = 'welfare' AND (lower(coalesce(NEW.role::text, '')) LIKE '%welfare%' OR lower(coalesce(NEW.oscar, '')) LIKE '%welfare%' OR lower(coalesce(NEW.oscar, '')) = 'wo'))
  ON CONFLICT (unit_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- 3d. Backfill existing Den officers. Same rule as every other unit: the Oscar
-- an officer signed up under makes them a member; only the head role (or a
-- "Head ..." Oscar) makes them head. Never downgrades a curated membership.
INSERT INTO public.unit_memberships (unit_id, user_id, access_level, status, managed_by_legacy)
SELECT
  unit_record.id,
  usr.id,
  public.legacy_unit_access_level('november_den', usr.role::text, usr.oscar),
  CASE
    WHEN coalesce(usr.is_active, true)
      AND coalesce(usr.activation_status, 'active') = 'active'
    THEN 'active'
    ELSE 'inactive'
  END,
  true
FROM public.users usr
JOIN public.units unit_record ON unit_record.slug = 'november_den'
WHERE public.legacy_matches_november_den(usr.role::text, usr.oscar)
ON CONFLICT (unit_id, user_id) DO NOTHING;

-- 4. Head-or-sub-lead check for the coordination work a Sub-Team Lead does
-- (assigning tasks, running checklists, managing a roster). Nothing uses it
-- yet; later Den stages opt in table by table.
CREATE OR REPLACE FUNCTION public.can_coordinate_unit(unit_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
  );
$$;

REVOKE ALL ON FUNCTION public.can_coordinate_unit(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_coordinate_unit(text) TO authenticated, service_role;

-- 5. A member can see who else is in their own unit (and at what level), so a
-- team list and "who is my sub-lead" work for everyone, not only the head.
-- Writes stay head/admin only through the existing scoped-write policy.
DROP POLICY IF EXISTS unit_memberships_peer_select ON public.unit_memberships;
CREATE POLICY unit_memberships_peer_select ON public.unit_memberships
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.units unit_record
    WHERE unit_record.id = unit_memberships.unit_id
      AND public.is_unit_member(unit_record.slug)
  )
);
