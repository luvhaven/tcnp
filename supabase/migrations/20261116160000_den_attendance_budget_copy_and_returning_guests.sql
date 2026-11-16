-- November (Den) — working well: the features a Den team needs once it is
-- running programmes week after week.
--
--   1. Shift check-in, so the roster records who actually came (attendance).
--   2. A budget on the Den plan, measured against vendor spend.
--   3. Copy a previous programme's set-up (tasks, checklists, shifts, plan
--      notes) into a new one, so no programme starts from a blank page.
--   4. Notes about a guest carried across programmes when the same minister
--      is entered again under a new Papa record.
--
-- Additive only. No existing policy is dropped, no role changes, and platform
-- admins pass every check as elsewhere.

-- ───────────────────────── 1. Attendance ─────────────────────────

ALTER TABLE public.den_shift_members
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS checked_out_at timestamptz,
  ADD COLUMN IF NOT EXISTS checked_in_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

-- An officer checks themselves in from two hours before the shift until it
-- ends, and out once checked in. A coordinator can record it for someone
-- (they forgot, or had no signal) at any time, and can clear a mistake.
CREATE OR REPLACE FUNCTION public.den_shift_attendance(target_member uuid, action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  member public.den_shift_members%ROWTYPE;
  shift public.den_shifts%ROWTYPE;
  coordinator boolean := public.can_coordinate_unit('november_den');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501'; END IF;
  IF action NOT IN ('in', 'out', 'clear') THEN RAISE EXCEPTION 'Unknown attendance action' USING ERRCODE = '22023'; END IF;

  SELECT * INTO member FROM public.den_shift_members WHERE id = target_member FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This roster entry no longer exists' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO shift FROM public.den_shifts WHERE id = member.shift_id;

  IF member.user_id <> auth.uid() AND NOT coordinator THEN
    RAISE EXCEPTION 'You can only check yourself in' USING ERRCODE = '42501';
  END IF;

  IF action = 'clear' THEN
    IF NOT coordinator THEN RAISE EXCEPTION 'Only a coordinator can clear attendance' USING ERRCODE = '42501'; END IF;
    UPDATE public.den_shift_members SET checked_in_at = NULL, checked_out_at = NULL, checked_in_by = NULL WHERE id = target_member;
  ELSIF action = 'in' THEN
    IF member.checked_in_at IS NOT NULL THEN RAISE EXCEPTION 'Already checked in' USING ERRCODE = '23505'; END IF;
    IF NOT coordinator AND (now() < shift.starts_at - interval '2 hours' OR now() > shift.ends_at) THEN
      RAISE EXCEPTION 'Check-in opens two hours before the shift and closes when it ends' USING ERRCODE = '22023';
    END IF;
    UPDATE public.den_shift_members SET checked_in_at = now(), checked_in_by = auth.uid() WHERE id = target_member;
  ELSE
    IF member.checked_in_at IS NULL THEN RAISE EXCEPTION 'Check in first' USING ERRCODE = '22023'; END IF;
    IF member.checked_out_at IS NOT NULL THEN RAISE EXCEPTION 'Already checked out' USING ERRCODE = '23505'; END IF;
    UPDATE public.den_shift_members SET checked_out_at = now() WHERE id = target_member;
  END IF;

  RETURN (SELECT jsonb_build_object('checked_in_at', checked_in_at, 'checked_out_at', checked_out_at)
          FROM public.den_shift_members WHERE id = target_member);
END;
$$;

REVOKE ALL ON FUNCTION public.den_shift_attendance(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.den_shift_attendance(uuid, text) TO authenticated, service_role;

-- Attendance per officer over shifts that have already ended, for the team dashboard.
CREATE OR REPLACE FUNCTION public.den_attendance()
RETURNS TABLE (user_id uuid, shifts_past integer, attended integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT sm.user_id,
    count(*)::integer,
    count(*) FILTER (WHERE sm.checked_in_at IS NOT NULL)::integer
  FROM public.den_shift_members sm
  JOIN public.den_shifts s ON s.id = sm.shift_id
  WHERE s.ends_at < now()
    AND (public.is_admin() OR public.is_unit_member('november_den'))
  GROUP BY sm.user_id;
$$;

REVOKE ALL ON FUNCTION public.den_attendance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.den_attendance() TO authenticated, service_role;

-- ───────────────────────── 2. Budget ─────────────────────────

ALTER TABLE public.den_operations
  ADD COLUMN IF NOT EXISTS budget numeric(14, 2);

ALTER TABLE public.den_operations DROP CONSTRAINT IF EXISTS den_operations_budget;
ALTER TABLE public.den_operations
  ADD CONSTRAINT den_operations_budget CHECK (budget IS NULL OR budget >= 0);

-- The readiness summary now also reports spend, attendance and the budget.
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
    'tasks', (SELECT count(*) FROM public.unit_tasks t
      JOIN public.unit_projects pr ON pr.id = t.project_id
      JOIN public.units u ON u.id = pr.unit_id
      WHERE u.slug = 'november_den' AND pr.program_id = target_program AND t.status <> 'cancelled'),
    'tasks_done', (SELECT count(*) FROM public.unit_tasks t
      JOIN public.unit_projects pr ON pr.id = t.project_id
      JOIN public.units u ON u.id = pr.unit_id
      WHERE u.slug = 'november_den' AND pr.program_id = target_program AND t.status = 'done'),
    'tasks_overdue', (SELECT count(*) FROM public.unit_tasks t
      JOIN public.unit_projects pr ON pr.id = t.project_id
      JOIN public.units u ON u.id = pr.unit_id
      WHERE u.slug = 'november_den' AND pr.program_id = target_program
        AND t.status NOT IN ('done', 'cancelled') AND t.due_at < now()),
    'checklist_items', (SELECT count(*) FROM public.den_checklist_items i
      JOIN public.den_checklists c ON c.id = i.checklist_id WHERE c.program_id = target_program),
    'checklist_items_done', (SELECT count(*) FROM public.den_checklist_items i
      JOIN public.den_checklists c ON c.id = i.checklist_id
      WHERE c.program_id = target_program AND i.done_at IS NOT NULL),
    'shifts', (SELECT count(*) FROM public.den_shifts s WHERE s.program_id = target_program),
    'shifts_covered', (SELECT count(*) FROM public.den_shifts s
      WHERE s.program_id = target_program
        AND (SELECT count(*) FROM public.den_shift_members sm WHERE sm.shift_id = s.id) >= s.officers_needed),
    'spend', (SELECT coalesce(sum(e.amount), 0) FROM public.vendor_engagements e
      WHERE e.program_id = target_program AND e.status <> 'cancelled'),
    'shifts_attended', (SELECT count(*) FROM public.den_shift_members sm
      JOIN public.den_shifts s ON s.id = sm.shift_id
      WHERE s.program_id = target_program AND sm.checked_in_at IS NOT NULL),
    'plan', (SELECT to_jsonb(plan) FROM (
      SELECT o.id, o.status, o.expected_guests, o.service_notes, o.budget, o.updated_at
      FROM public.den_operations o WHERE o.program_id = target_program
    ) plan)
  ) END;
$$;

-- ───────────────────────── 3. Copy a previous set-up ─────────────────────────

-- Programmes whose Den set-up can be reused, newest first.
CREATE OR REPLACE FUNCTION public.den_programmes_with_setup()
RETURNS TABLE (program_id uuid, program_name text, start_date date, tasks integer, checklists integer, shifts integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT program.id, program.name, program.start_date,
    (SELECT count(*)::integer FROM public.unit_tasks t
      JOIN public.unit_projects p ON p.id = t.project_id
      JOIN public.units u ON u.id = p.unit_id
      WHERE u.slug = 'november_den' AND p.program_id = program.id AND t.status <> 'cancelled'),
    (SELECT count(*)::integer FROM public.den_checklists c WHERE c.program_id = program.id),
    (SELECT count(*)::integer FROM public.den_shifts s WHERE s.program_id = program.id)
  FROM public.programs program
  WHERE public.can_coordinate_unit('november_den')
    AND (
      EXISTS (SELECT 1 FROM public.den_operations o WHERE o.program_id = program.id)
      OR EXISTS (SELECT 1 FROM public.den_checklists c WHERE c.program_id = program.id)
      OR EXISTS (SELECT 1 FROM public.den_shifts s WHERE s.program_id = program.id)
      OR EXISTS (SELECT 1 FROM public.unit_projects p JOIN public.units u ON u.id = p.unit_id
                 WHERE u.slug = 'november_den' AND p.program_id = program.id)
    )
  ORDER BY program.start_date DESC NULLS LAST, program.name;
$$;

REVOKE ALL ON FUNCTION public.den_programmes_with_setup() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.den_programmes_with_setup() TO authenticated, service_role;

-- Copies the way one programme was run into another. People are never
-- copied (tasks arrive unassigned, shifts arrive empty, checklist items
-- unticked) because the team differs each time. Dates move with the
-- programme: a task due two days before the old programme started is due two
-- days before the new one starts. If either programme has no start date,
-- task deadlines are left blank and shifts are not copied.
CREATE OR REPLACE FUNCTION public.den_copy_programme_setup(
  source_program uuid,
  target_program uuid,
  copy_tasks boolean DEFAULT true,
  copy_checklists boolean DEFAULT true,
  copy_shifts boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  source_start date;
  target_start date;
  shift_by interval;
  target_project uuid;
  copied_tasks integer := 0;
  copied_checklists integer := 0;
  copied_shifts integer := 0;
  list record;
  new_list uuid;
BEGIN
  IF NOT public.can_coordinate_unit('november_den') THEN
    RAISE EXCEPTION 'Only the head of November (Den) or a Sub-Team Lead can copy a set-up' USING ERRCODE = '42501';
  END IF;
  IF source_program = target_program THEN RAISE EXCEPTION 'Choose a different programme to copy from' USING ERRCODE = '22023'; END IF;
  SELECT start_date INTO source_start FROM public.programs WHERE id = source_program;
  IF NOT FOUND THEN RAISE EXCEPTION 'The programme to copy from was not found' USING ERRCODE = 'P0002'; END IF;
  SELECT start_date INTO target_start FROM public.programs WHERE id = target_program;
  IF NOT FOUND THEN RAISE EXCEPTION 'Programme not found' USING ERRCODE = 'P0002'; END IF;
  shift_by := CASE WHEN source_start IS NOT NULL AND target_start IS NOT NULL
    THEN make_interval(days => target_start - source_start) END;

  -- The plan: open it if needed, and bring the service notes across when the new one has none.
  INSERT INTO public.den_operations (program_id, status, expected_guests, service_notes, created_by, updated_by)
  SELECT target_program, 'planning', o.expected_guests, o.service_notes, auth.uid(), auth.uid()
  FROM public.den_operations o WHERE o.program_id = source_program
  ON CONFLICT (program_id) DO UPDATE
    SET service_notes = coalesce(public.den_operations.service_notes, EXCLUDED.service_notes),
        updated_by = auth.uid();

  IF copy_tasks THEN
    target_project := public.den_ensure_programme_project(target_program);
    INSERT INTO public.unit_tasks (project_id, title, description, due_at, status, created_by)
    SELECT target_project, t.title, t.description,
      CASE WHEN shift_by IS NOT NULL THEN t.due_at + shift_by END,
      'todo', auth.uid()
    FROM public.unit_tasks t
    JOIN public.unit_projects p ON p.id = t.project_id
    JOIN public.units u ON u.id = p.unit_id
    WHERE u.slug = 'november_den' AND p.program_id = source_program AND t.status <> 'cancelled';
    GET DIAGNOSTICS copied_tasks = ROW_COUNT;
  END IF;

  IF copy_checklists THEN
    FOR list IN SELECT * FROM public.den_checklists WHERE program_id = source_program ORDER BY created_at LOOP
      INSERT INTO public.den_checklists (program_id, template_id, title, created_by)
      VALUES (target_program, list.template_id, list.title, auth.uid())
      RETURNING id INTO new_list;
      INSERT INTO public.den_checklist_items (checklist_id, label, position)
      SELECT new_list, i.label, i.position FROM public.den_checklist_items i WHERE i.checklist_id = list.id;
      copied_checklists := copied_checklists + 1;
    END LOOP;
  END IF;

  IF copy_shifts AND shift_by IS NOT NULL THEN
    INSERT INTO public.den_shifts (program_id, title, starts_at, ends_at, nest_id, officers_needed, notes, created_by)
    SELECT target_program, s.title, s.starts_at + shift_by, s.ends_at + shift_by,
      -- A location tied to the old programme does not carry over.
      (SELECT n.id FROM public.nests n WHERE n.id = s.nest_id AND (n.program_id IS NULL OR n.program_id = target_program)),
      s.officers_needed, s.notes, auth.uid()
    FROM public.den_shifts s WHERE s.program_id = source_program;
    GET DIAGNOSTICS copied_shifts = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'tasks', copied_tasks, 'checklists', copied_checklists, 'shifts', copied_shifts,
    'dates_moved', shift_by IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.den_copy_programme_setup(uuid, uuid, boolean, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.den_copy_programme_setup(uuid, uuid, boolean, boolean, boolean) TO authenticated, service_role;

-- ───────────────────────── 4. Returning guests ─────────────────────────

-- A name reduced to the letters that identify it: lower case, no titles, no
-- punctuation. "Pastor Tola Odutola" and "tola odutola." match.
CREATE OR REPLACE FUNCTION public.den_guest_name_key(full_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT nullif(btrim(regexp_replace(
    regexp_replace(
      lower(coalesce(full_name, '')),
      '\m(pastor|pst|rev|reverend|bishop|apostle|prophet|evangelist|elder|deacon|deaconess|dr|prof|professor|mr|mrs|ms|miss|sir|chief|hon|engr)\M\.?', ' ', 'g'
    ),
    '[^a-z0-9]+', ' ', 'g'
  )), '');
$$;

-- What the Den recorded about a guest under their other Papa records — same
-- name, other programmes. Shown as "earlier visits under the same name" so
-- the team can judge whether it is the same person.
CREATE OR REPLACE FUNCTION public.den_guest_earlier_records(target_papa uuid)
RETURNS TABLE (
  papa_id uuid,
  program_name text,
  start_date date,
  note_category text,
  note text,
  note_author text,
  note_created_at timestamptz,
  dishes text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH me AS (
    SELECT p.id, public.den_guest_name_key(p.full_name) AS name_key
    FROM public.papas p WHERE p.id = target_papa
  ),
  others AS (
    SELECT p.id, p.program_id
    FROM public.papas p, me
    WHERE p.id <> me.id
      AND me.name_key IS NOT NULL
      AND public.den_guest_name_key(p.full_name) = me.name_key
      AND coalesce(p.is_deleted, false) = false
  )
  SELECT o.id, program.name, program.start_date, n.category, n.note, author.full_name, n.created_at,
    coalesce((
      SELECT array_agg(DISTINCT dish ORDER BY dish)
      FROM public.papa_meal_orders mo
      CROSS JOIN LATERAL jsonb_array_elements_text(mo.selected_items) AS dish
      WHERE mo.papa_id = o.id AND mo.status <> 'cancelled'
    ), ARRAY[]::text[])
  FROM others o
  LEFT JOIN public.programs program ON program.id = o.program_id
  LEFT JOIN public.den_guest_notes n ON n.papa_id = o.id
  LEFT JOIN public.users author ON author.id = n.created_by
  WHERE public.can_view_den_guest(target_papa)
  ORDER BY program.start_date DESC NULLS LAST, n.created_at DESC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.den_guest_earlier_records(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.den_guest_earlier_records(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
