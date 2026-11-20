-- Programme grants for every unit (2026-11-16 unit build-out, after the
-- foundation migration 20261116170000_unit_access_single_rule.sql).
--
-- Programme work in unit X for programme P (can_work_unit_programme) needs:
--   member of X  AND  active on P (is_program_active_officer)
--   AND (head / sub_lead of X  OR  a head-issued grant).
-- The Den has had its own grant (den_floor_grants) since 20261115140000. This
-- migration gives every unit the same thing:
--
--   unit_programme_grants  one open row per (unit, programme, officer).
--                          Given and revoked by the unit head
--                          (can_manage_unit) or Command (is_admin()).
--                          Revoking stamps revoked_at; rows are never
--                          deleted, so the history stays.
--   guard trigger          the grantee must be an active member of the unit
--                          (an active user, in an active unit). Being active
--                          on the programme is checked when the grant is USED,
--                          not when it is given, so a head can staff a
--                          programme before the officer's title is assigned.
--   notification           the grantee hears about it (kind
--                          'unit_programme_grant', metadata.unit_slug).
--   can_work_unit_programme  redefined with the same signature: adds "OR an
--                          open grant row". Den floor grants still count for
--                          the Den.
--   unit_programme_team()  the panel's read: every member of the unit, whether
--                          they are active on the programme, hold a grant, and
--                          can therefore work it. Members and Command read it.
--   unit_set_programme_grant()  grant / revoke in one call for the UI.
--
-- Admin and Command are never reduced: platform admins pass every check,
-- Command (is_admin()) may grant and revoke in every unit and reads every team.
-- Repeatable: IF NOT EXISTS, CREATE OR REPLACE, DROP ... IF EXISTS.

-- ─── 1. The table ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.unit_programme_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES public.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS unit_programme_grants_one_open
  ON public.unit_programme_grants(unit_id, program_id, user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_unit_programme_grants_user
  ON public.unit_programme_grants(user_id, program_id) WHERE revoked_at IS NULL;

ALTER TABLE public.unit_programme_grants ENABLE ROW LEVEL SECURITY;

-- Who may grant in a unit: its head, platform admins (inside can_manage_unit)
-- and Command.
CREATE OR REPLACE FUNCTION public.can_grant_unit_programme(target_unit uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM public.units unit_record
    WHERE unit_record.id = target_unit AND public.can_manage_unit(unit_record.slug)
  );
$$;

REVOKE ALL ON FUNCTION public.can_grant_unit_programme(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_grant_unit_programme(uuid) TO authenticated, service_role;

-- Own grants, the unit's members (the team is not a secret inside the unit),
-- Command and platform admins.
DROP POLICY IF EXISTS unit_programme_grants_select ON public.unit_programme_grants;
CREATE POLICY unit_programme_grants_select ON public.unit_programme_grants
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_admin()
  OR public.is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM public.units unit_record
    WHERE unit_record.id = unit_programme_grants.unit_id AND public.is_unit_member(unit_record.slug)
  )
);

DROP POLICY IF EXISTS unit_programme_grants_insert ON public.unit_programme_grants;
CREATE POLICY unit_programme_grants_insert ON public.unit_programme_grants
FOR INSERT TO authenticated
WITH CHECK (
  public.can_grant_unit_programme(unit_id)
  AND granted_by = auth.uid()
  AND revoked_at IS NULL
);

-- Revoking is an UPDATE of revoked_at; the guard trigger refuses any other change.
DROP POLICY IF EXISTS unit_programme_grants_revoke ON public.unit_programme_grants;
CREATE POLICY unit_programme_grants_revoke ON public.unit_programme_grants
FOR UPDATE TO authenticated
USING (public.can_grant_unit_programme(unit_id))
WITH CHECK (public.can_grant_unit_programme(unit_id));

-- No DELETE policy: grants are history.

-- ─── 2. Guard: an active member of an active unit; only revocation changes ──

CREATE OR REPLACE FUNCTION public.guard_unit_programme_grant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.unit_id IS DISTINCT FROM OLD.unit_id
      OR NEW.program_id IS DISTINCT FROM OLD.program_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.granted_by IS DISTINCT FROM OLD.granted_by
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'A programme grant cannot be changed, only revoked' USING ERRCODE = '42501';
    END IF;
    IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
      RAISE EXCEPTION 'This grant has already been revoked. Grant again instead.' USING ERRCODE = '42501';
    END IF;
    IF NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN
      -- The history is the server's: who and when are stamped, never sent.
      NEW.revoked_at := now();
      NEW.revoked_by := coalesce(auth.uid(), NEW.revoked_by);
    END IF;
    RETURN NEW;
  END IF;

  -- INSERT. A grant starts now and open; who gave it is the caller.
  NEW.granted_by := coalesce(auth.uid(), NEW.granted_by);
  NEW.created_at := now();
  NEW.revoked_at := NULL;
  NEW.revoked_by := NULL;
  IF NOT EXISTS (
    SELECT 1
    FROM public.unit_memberships membership
    JOIN public.units unit_record ON unit_record.id = membership.unit_id
    JOIN public.users user_record ON user_record.id = membership.user_id
    WHERE membership.unit_id = NEW.unit_id
      AND membership.user_id = NEW.user_id
      AND membership.status = 'active'
      AND unit_record.is_active = true
      AND coalesce(user_record.is_active, true) = true
      AND coalesce(user_record.activation_status, 'active') = 'active'
  ) THEN
    RAISE EXCEPTION 'Only an active member of this unit can be given programme work' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS unit_programme_grants_guard ON public.unit_programme_grants;
CREATE TRIGGER unit_programme_grants_guard
BEFORE INSERT OR UPDATE ON public.unit_programme_grants
FOR EACH ROW EXECUTE FUNCTION public.guard_unit_programme_grant();

-- ─── 2b. A grant ends with the membership it was given under ───────────────

-- When a membership stops being active (or is deleted, or moved), the open
-- grants it carried are revoked, so an officer who later rejoins does not get
-- programme work back without the head granting it again.
--
-- The check runs at COMMIT (a deferred constraint trigger) and looks at the
-- final state: rebuild_legacy_unit_memberships deletes and re-inserts an
-- officer's legacy rows whenever their role, Oscar or activation changes, and
-- an officer who is still an active member afterwards keeps their grants.
CREATE OR REPLACE FUNCTION public.revoke_unit_programme_grants_on_leave()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'active' THEN
    RETURN NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.unit_memberships membership
    WHERE membership.unit_id = OLD.unit_id
      AND membership.user_id = OLD.user_id
      AND membership.status = 'active'
  ) THEN
    RETURN NULL;
  END IF;

  UPDATE public.unit_programme_grants programme_grant
  SET revoked_at = now(), revoked_by = auth.uid()
  WHERE programme_grant.unit_id = OLD.unit_id
    AND programme_grant.user_id = OLD.user_id
    AND programme_grant.revoked_at IS NULL;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS unit_memberships_revoke_programme_grants ON public.unit_memberships;
CREATE CONSTRAINT TRIGGER unit_memberships_revoke_programme_grants
AFTER UPDATE OR DELETE ON public.unit_memberships
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.revoke_unit_programme_grants_on_leave();

-- Grants left open by memberships that had already ended before this
-- migration are closed the same way.
UPDATE public.unit_programme_grants programme_grant
SET revoked_at = now()
WHERE programme_grant.revoked_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.unit_memberships membership
    WHERE membership.unit_id = programme_grant.unit_id
      AND membership.user_id = programme_grant.user_id
      AND membership.status = 'active'
  );

-- ─── 3. Tell the grantee ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_unit_programme_grant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  unit_label text;
  unit_key text;
  program_label text;
BEGIN
  IF NEW.revoked_at IS NOT NULL THEN RETURN NEW; END IF;
  -- Granting yourself something needs no announcement.
  IF NEW.user_id = auth.uid() THEN RETURN NEW; END IF;

  SELECT unit_record.name, unit_record.slug INTO unit_label, unit_key
  FROM public.units unit_record WHERE unit_record.id = NEW.unit_id;
  SELECT program.name INTO program_label FROM public.programs program WHERE program.id = NEW.program_id;

  INSERT INTO public.notifications (user_id, title, message, type, channel, metadata, is_read)
  VALUES (
    NEW.user_id,
    'You can work ' || coalesce(program_label, 'a programme'),
    coalesce(unit_label, 'Your unit') || ' has added you to the team for '
      || coalesce(program_label, 'a programme')
      || '. You can do its work once you are active on the programme.',
    'info',
    'push',
    jsonb_build_object('kind', 'unit_programme_grant', 'unit_slug', unit_key, 'program_id', NEW.program_id, 'grant_id', NEW.id),
    false
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS unit_programme_grants_notify ON public.unit_programme_grants;
CREATE TRIGGER unit_programme_grants_notify
AFTER INSERT ON public.unit_programme_grants
FOR EACH ROW EXECUTE FUNCTION public.notify_unit_programme_grant();

-- ─── 4. The caller's own open grant, and the redefined work check ───────────

CREATE OR REPLACE FUNCTION public.has_unit_programme_grant(unit_slug text, target_program uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.unit_programme_grants programme_grant
    JOIN public.units unit_record ON unit_record.id = programme_grant.unit_id
    WHERE unit_record.slug = has_unit_programme_grant.unit_slug
      AND programme_grant.program_id = has_unit_programme_grant.target_program
      AND programme_grant.user_id = auth.uid()
      AND programme_grant.revoked_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.has_unit_programme_grant(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_unit_programme_grant(text, uuid) TO authenticated, service_role;

-- Same name, parameters and result as the foundation version, so every policy
-- and the role-update / food-ready routes keep working unchanged.
CREATE OR REPLACE FUNCTION public.can_work_unit_programme(unit_slug text, target_program uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_platform_admin()
    OR (
      target_program IS NOT NULL
      AND public.is_unit_member(unit_slug)
      AND public.is_program_active_officer(auth.uid(), target_program)
      AND (
        public.can_coordinate_unit(unit_slug)
        OR public.has_unit_programme_grant(unit_slug, target_program)
        -- The Den keeps its own floor grants.
        OR (unit_slug = 'november_den' AND public.has_den_floor_access(target_program))
      )
    );
$$;

REVOKE ALL ON FUNCTION public.can_work_unit_programme(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_work_unit_programme(text, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.can_work_unit_programme(text, uuid) IS
  'Programme work in a unit: platform admin, or member of the unit AND active on the programme AND (head/sub_lead OR an open unit_programme_grants row OR, for the Den, a Den floor grant).';

-- ─── 5. The team panel's read ───────────────────────────────────────────────

-- Every active member of the unit, for one programme: are they active on it,
-- do they hold an open grant, and can they therefore work it. Members of the
-- unit, Command and platform admins may read it; anyone else gets no rows.
CREATE OR REPLACE FUNCTION public.unit_programme_team(unit_slug text, target_program uuid)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  photo_url text,
  access_level text,
  on_programme boolean,
  granted boolean,
  grant_id uuid,
  can_work boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH roster AS (
    SELECT
      membership.user_id,
      user_record.full_name,
      user_record.photo_url,
      membership.access_level,
      public.is_program_active_officer(membership.user_id, unit_programme_team.target_program) AS on_programme,
      (
        SELECT programme_grant.id FROM public.unit_programme_grants programme_grant
        WHERE programme_grant.unit_id = unit_record.id
          AND programme_grant.program_id = unit_programme_team.target_program
          AND programme_grant.user_id = membership.user_id
          AND programme_grant.revoked_at IS NULL
        LIMIT 1
      ) AS grant_id,
      -- Den floor grants follow den_floor_grants_select: the grantee, the Den
      -- head (platform admins included) and Command see them; other members
      -- do not learn who holds one.
      (unit_record.slug = 'november_den'
        AND (membership.user_id = auth.uid() OR public.can_manage_unit('november_den') OR public.is_admin())
        AND EXISTS (
        SELECT 1 FROM public.den_floor_grants floor_grant
        WHERE floor_grant.program_id = unit_programme_team.target_program
          AND floor_grant.user_id = membership.user_id
      )) AS den_floor
    FROM public.unit_memberships membership
    JOIN public.units unit_record ON unit_record.id = membership.unit_id
    JOIN public.users user_record ON user_record.id = membership.user_id
    WHERE unit_record.slug = unit_programme_team.unit_slug
      AND unit_record.is_active = true
      AND membership.status = 'active'
      AND coalesce(user_record.is_active, true) = true
      AND coalesce(user_record.activation_status, 'active') = 'active'
      AND unit_programme_team.target_program IS NOT NULL
      AND (public.is_admin() OR public.is_platform_admin() OR public.is_unit_member(unit_programme_team.unit_slug))
  )
  SELECT
    roster.user_id,
    roster.full_name,
    roster.photo_url,
    roster.access_level,
    roster.on_programme,
    roster.grant_id IS NOT NULL OR roster.den_floor,
    roster.grant_id,
    roster.on_programme AND (roster.access_level IN ('head', 'sub_lead') OR roster.grant_id IS NOT NULL OR roster.den_floor)
  FROM roster
  ORDER BY roster.full_name NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.unit_programme_team(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unit_programme_team(text, uuid) TO authenticated, service_role;

-- ─── 6. Grant or revoke in one call ─────────────────────────────────────────

-- Returns the open grant's id after granting, or NULL after revoking. Granting
-- twice and revoking what is not granted are both no-ops, so a double tap on a
-- phone does no harm.
CREATE OR REPLACE FUNCTION public.unit_set_programme_grant(unit_slug text, target_program uuid, target_user uuid, granted boolean)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_unit uuid;
  open_grant uuid;
BEGIN
  SELECT unit_record.id INTO target_unit FROM public.units unit_record
  WHERE unit_record.slug = unit_set_programme_grant.unit_slug AND unit_record.is_active = true;
  IF target_unit IS NULL THEN
    RAISE EXCEPTION 'Unit not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.can_grant_unit_programme(target_unit) THEN
    RAISE EXCEPTION 'Only the unit head or Command can change who works a programme' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.programs program WHERE program.id = target_program) THEN
    RAISE EXCEPTION 'Programme not found' USING ERRCODE = 'P0002';
  END IF;
  IF granted IS NULL OR target_user IS NULL THEN
    RAISE EXCEPTION 'Say who, and whether to grant or revoke' USING ERRCODE = '22004';
  END IF;

  SELECT programme_grant.id INTO open_grant FROM public.unit_programme_grants programme_grant
  WHERE programme_grant.unit_id = target_unit
    AND programme_grant.program_id = target_program
    AND programme_grant.user_id = target_user
    AND programme_grant.revoked_at IS NULL;

  IF granted THEN
    IF open_grant IS NOT NULL THEN RETURN open_grant; END IF;
    -- Two taps (or the head and Command) at the same moment: the second one
    -- finds the first one's row instead of failing on the unique index.
    INSERT INTO public.unit_programme_grants (unit_id, program_id, user_id, granted_by)
    VALUES (target_unit, target_program, target_user, auth.uid())
    ON CONFLICT (unit_id, program_id, user_id) WHERE revoked_at IS NULL DO NOTHING
    RETURNING id INTO open_grant;
    IF open_grant IS NULL THEN
      SELECT programme_grant.id INTO open_grant FROM public.unit_programme_grants programme_grant
      WHERE programme_grant.unit_id = target_unit
        AND programme_grant.program_id = target_program
        AND programme_grant.user_id = target_user
        AND programme_grant.revoked_at IS NULL;
    END IF;
    RETURN open_grant;
  END IF;

  IF open_grant IS NOT NULL THEN
    UPDATE public.unit_programme_grants SET revoked_at = now() WHERE id = open_grant;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.unit_set_programme_grant(text, uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unit_set_programme_grant(text, uuid, uuid, boolean) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
