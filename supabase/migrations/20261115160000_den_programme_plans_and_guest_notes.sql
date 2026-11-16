-- November (Den) — Stage 1: a Den plan per programme, and guest hospitality
-- profiles with the Den's own notes and visit history.
--
-- Programmes and Papas stay owned by leadership exactly as they are. This
-- migration adds Den's layer on top and never edits either table:
--   * den_operations   — the Den's plan for one programme;
--   * den_guest_notes  — what the Den has learned about a guest, kept for the
--                        next time they are hosted (the institutional memory);
--   * three read functions that return only what hospitality needs.
--
-- Who sees a programme's guests: the Den head and sub-leads, leadership
-- (is_admin), and Den officers who have been ADDED to that programme. Unit
-- membership alone shows nothing.

-- 1. Guest visibility for Den, per programme.
CREATE OR REPLACE FUNCTION public.can_view_den_program(target_program uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT target_program IS NOT NULL AND (
    public.is_admin()
    OR public.can_coordinate_unit('november_den')
    OR (
      public.is_unit_member('november_den')
      AND public.is_program_active_officer(auth.uid(), target_program)
    )
  );
$$;

REVOKE ALL ON FUNCTION public.can_view_den_program(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_den_program(uuid) TO authenticated, service_role;

-- 2. The Den plan for a programme.
CREATE TABLE IF NOT EXISTS public.den_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL UNIQUE REFERENCES public.programs(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'planning',
  expected_guests integer,
  service_notes text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT den_operations_status CHECK (status IN ('planning', 'ready', 'live', 'completed', 'archived')),
  CONSTRAINT den_operations_expected_guests CHECK (expected_guests IS NULL OR expected_guests >= 0)
);

DROP TRIGGER IF EXISTS den_operations_set_updated_at ON public.den_operations;
CREATE TRIGGER den_operations_set_updated_at
BEFORE UPDATE ON public.den_operations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Archiving closes a plan for good, so it is the Team Lead's call (or a
-- platform admin's), not a Sub-Team Lead's. The service role is not held back.
CREATE OR REPLACE FUNCTION public.guard_den_operation_archive()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  touches_archive boolean;
BEGIN
  -- OLD does not exist on INSERT, so the two cases are tested separately.
  IF TG_OP = 'INSERT' THEN
    touches_archive := NEW.status = 'archived';
  ELSE
    touches_archive := NEW.status IS DISTINCT FROM OLD.status
      AND (NEW.status = 'archived' OR OLD.status = 'archived');
  END IF;

  IF touches_archive
     AND NOT public.is_trusted_backend()
     AND NOT public.can_manage_unit('november_den') THEN
    RAISE EXCEPTION 'Only the head of November (Den) can archive or reopen a Den plan' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS den_operations_guard_archive ON public.den_operations;
CREATE TRIGGER den_operations_guard_archive
BEFORE INSERT OR UPDATE OF status ON public.den_operations
FOR EACH ROW EXECUTE FUNCTION public.guard_den_operation_archive();

ALTER TABLE public.den_operations ENABLE ROW LEVEL SECURITY;

-- The plan itself holds no guest data, so every Den member and leadership can
-- read it; only the head, sub-leads and platform admins write it.
DROP POLICY IF EXISTS den_operations_select ON public.den_operations;
CREATE POLICY den_operations_select ON public.den_operations
FOR SELECT TO authenticated
USING (public.is_admin() OR public.is_unit_member('november_den'));

DROP POLICY IF EXISTS den_operations_insert ON public.den_operations;
CREATE POLICY den_operations_insert ON public.den_operations
FOR INSERT TO authenticated
WITH CHECK (public.can_coordinate_unit('november_den') AND created_by = auth.uid());

DROP POLICY IF EXISTS den_operations_update ON public.den_operations;
CREATE POLICY den_operations_update ON public.den_operations
FOR UPDATE TO authenticated
USING (public.can_coordinate_unit('november_den'))
WITH CHECK (public.can_coordinate_unit('november_den'));

-- 3. What the Den has learned about a guest.
CREATE TABLE IF NOT EXISTS public.den_guest_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  papa_id uuid NOT NULL REFERENCES public.papas(id) ON DELETE CASCADE,
  -- The programme the note was written during. Kept when a programme is
  -- deleted: the lesson about the guest outlives the event.
  program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'preference',
  note text NOT NULL,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT den_guest_notes_category CHECK (category IN ('preference', 'dietary', 'allergy', 'service', 'lesson')),
  CONSTRAINT den_guest_notes_not_blank CHECK (length(btrim(note)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_den_guest_notes_papa ON public.den_guest_notes(papa_id, created_at DESC);

ALTER TABLE public.den_guest_notes ENABLE ROW LEVEL SECURITY;

-- Can the caller see this guest for Den purposes: through the programme the
-- guest is currently attached to.
CREATE OR REPLACE FUNCTION public.can_view_den_guest(target_papa uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.papas p
    WHERE p.id = target_papa
      AND coalesce(p.is_deleted, false) = false
      AND public.can_view_den_program(p.program_id)
  );
$$;

REVOKE ALL ON FUNCTION public.can_view_den_guest(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_den_guest(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS den_guest_notes_select ON public.den_guest_notes;
CREATE POLICY den_guest_notes_select ON public.den_guest_notes
FOR SELECT TO authenticated
USING (public.can_view_den_guest(papa_id));

-- Anyone who can see the guest for Den purposes can add what they learned,
-- under their own name. Leadership passes can_view_den_guest already.
DROP POLICY IF EXISTS den_guest_notes_insert ON public.den_guest_notes;
CREATE POLICY den_guest_notes_insert ON public.den_guest_notes
FOR INSERT TO authenticated
WITH CHECK (public.can_view_den_guest(papa_id) AND created_by = auth.uid());

-- Notes are a record: the author can remove their own, the head or a platform
-- admin can remove any. Nobody edits someone else's words.
DROP POLICY IF EXISTS den_guest_notes_delete ON public.den_guest_notes;
CREATE POLICY den_guest_notes_delete ON public.den_guest_notes
FOR DELETE TO authenticated
USING (created_by = auth.uid() OR public.can_manage_unit('november_den'));

-- 4. Guests of a programme: hospitality fields only. No passport, contact,
-- flight or accommodation details leave the papas table through this.
CREATE OR REPLACE FUNCTION public.den_guest_profiles(target_program uuid)
RETURNS TABLE (
  id uuid,
  title text,
  full_name text,
  profile_photo_url text,
  organization text,
  "position" text,
  is_first_time boolean,
  past_invites_count integer,
  entourage integer,
  dietary_restrictions text,
  food_preferences text,
  water_temperature text,
  special_requirements text,
  arrival_date date,
  departure_date date,
  note_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    p.id, p.title, p.full_name, p.profile_photo_url, p.organization, p."position",
    coalesce(p.is_first_time, true),
    coalesce(p.past_invites_count, 0),
    greatest(
      coalesce(p.entourage_count, 0),
      coalesce(p.entourage_size, 0),
      (SELECT count(*)::integer FROM public.papa_entourage_members member WHERE member.papa_id = p.id)
    ),
    nullif(btrim(p.dietary_restrictions), ''),
    nullif(btrim(p.food_preferences), ''),
    nullif(btrim(p.water_temperature::text), ''),
    nullif(btrim(p.special_requirements), ''),
    p.arrival_date, p.departure_date,
    (SELECT count(*)::integer FROM public.den_guest_notes note WHERE note.papa_id = p.id)
  FROM public.papas p
  WHERE p.program_id = target_program
    AND coalesce(p.is_deleted, false) = false
    AND public.can_view_den_program(target_program)
  ORDER BY p.full_name;
$$;

REVOKE ALL ON FUNCTION public.den_guest_profiles(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.den_guest_profiles(uuid) TO authenticated, service_role;

-- 5. A guest's history with the Den: each programme they were served or
-- written about in, with what they ordered.
CREATE OR REPLACE FUNCTION public.den_guest_history(target_papa uuid)
RETURNS TABLE (
  program_id uuid,
  program_name text,
  start_date date,
  meal_orders integer,
  dishes text[],
  notes integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH visits AS (
    SELECT o.program_id FROM public.papa_meal_orders o
      WHERE o.papa_id = target_papa AND o.program_id IS NOT NULL AND o.status <> 'cancelled'
    UNION
    SELECT n.program_id FROM public.den_guest_notes n
      WHERE n.papa_id = target_papa AND n.program_id IS NOT NULL
    UNION
    SELECT p.program_id FROM public.papas p
      WHERE p.id = target_papa AND p.program_id IS NOT NULL
  )
  SELECT
    program.id,
    program.name,
    program.start_date,
    (SELECT count(*)::integer FROM public.papa_meal_orders o
      WHERE o.papa_id = target_papa AND o.program_id = program.id AND o.status <> 'cancelled'),
    coalesce((
      SELECT array_agg(DISTINCT dish ORDER BY dish)
      FROM public.papa_meal_orders o
      CROSS JOIN LATERAL jsonb_array_elements_text(o.selected_items) AS dish
      WHERE o.papa_id = target_papa AND o.program_id = program.id AND o.status <> 'cancelled'
    ), ARRAY[]::text[]),
    (SELECT count(*)::integer FROM public.den_guest_notes n
      WHERE n.papa_id = target_papa AND n.program_id = program.id)
  FROM visits
  JOIN public.programs program ON program.id = visits.program_id
  WHERE public.can_view_den_guest(target_papa)
  ORDER BY program.start_date DESC NULLS LAST, program.name;
$$;

REVOKE ALL ON FUNCTION public.den_guest_history(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.den_guest_history(uuid) TO authenticated, service_role;

-- 6. The numbers behind a programme's readiness score. Counts only — safe for
-- every Den member and leadership, including members not on the programme.
CREATE OR REPLACE FUNCTION public.den_programme_summary(target_program uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN target_program IS NULL OR NOT (public.is_admin() OR public.is_unit_member('november_den')) THEN NULL
  ELSE jsonb_build_object(
    'guests', (SELECT count(*) FROM public.papas p
      WHERE p.program_id = target_program AND coalesce(p.is_deleted, false) = false),
    'guests_profiled', (SELECT count(*) FROM public.papas p
      WHERE p.program_id = target_program AND coalesce(p.is_deleted, false) = false
        AND (nullif(btrim(p.dietary_restrictions), '') IS NOT NULL
          OR nullif(btrim(p.food_preferences), '') IS NOT NULL
          OR EXISTS (SELECT 1 FROM public.den_guest_notes n WHERE n.papa_id = p.id))),
    'entourage', (SELECT coalesce(sum(greatest(coalesce(p.entourage_count, 0), coalesce(p.entourage_size, 0))), 0) FROM public.papas p
      WHERE p.program_id = target_program AND coalesce(p.is_deleted, false) = false),
    'team_on_programme', (SELECT count(*) FROM public.unit_memberships m
      JOIN public.units u ON u.id = m.unit_id
      WHERE u.slug = 'november_den' AND m.status = 'active'
        AND public.is_program_active_officer(m.user_id, target_program)),
    'floor_access', (SELECT count(*) FROM public.den_floor_grants g
      WHERE g.program_id = target_program
        AND public.is_program_active_officer(g.user_id, target_program)),
    'pending_additions', (SELECT count(*) FROM public.program_addition_requests r
      WHERE r.program_id = target_program AND r.unit_slug = 'november_den' AND r.status = 'pending'),
    'locations', (SELECT count(*) FROM public.nests n
      WHERE n.program_id = target_program AND n.type::text = 'den'),
    'menus', (SELECT count(*) FROM public.program_menus m WHERE m.program_id = target_program),
    'menus_with_vendor', (SELECT count(*) FROM public.program_menus m
      WHERE m.program_id = target_program AND m.vendor_id IS NOT NULL),
    'plan', (SELECT to_jsonb(plan) FROM (
      SELECT o.id, o.status, o.expected_guests, o.service_notes, o.updated_at
      FROM public.den_operations o WHERE o.program_id = target_program
    ) plan)
  ) END;
$$;

REVOKE ALL ON FUNCTION public.den_programme_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.den_programme_summary(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
