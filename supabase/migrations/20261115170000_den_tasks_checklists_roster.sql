-- November (Den) — Stage 2: tasks, reusable checklists and the shift roster.
--
-- Tasks reuse the shared unit_projects / unit_tasks tables that Compliance
-- already uses; nothing about another unit's projects or tasks changes. Every
-- policy added here is additive and scoped to the november_den unit, and
-- platform admins pass every check exactly as they do elsewhere.
--
-- Who does what (PRD roles):
--   Team Lead (head)      templates, everything below
--   Sub-Team Lead         create and assign tasks, run checklists, build the roster
--   Team Member           complete own tasks and tick checklist items — and only
--                         for a programme they have been added to
--   Leadership (is_admin) read

-- 0. Who can be given a programme's work: a Den officer who has been added to
-- that programme, or the unit's head / sub-leads who run it.
CREATE OR REPLACE FUNCTION public.den_can_take_programme_work(target_user uuid, target_program uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.unit_memberships membership
    JOIN public.units unit_record ON unit_record.id = membership.unit_id
    JOIN public.users user_record ON user_record.id = membership.user_id
    WHERE unit_record.slug = 'november_den'
      AND membership.user_id = target_user
      AND membership.status = 'active'
      AND coalesce(user_record.is_active, true) = true
      AND coalesce(user_record.activation_status, 'active') = 'active'
      AND (
        membership.access_level IN ('head', 'sub_lead')
        OR public.is_program_active_officer(target_user, target_program)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.den_can_take_programme_work(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.den_can_take_programme_work(uuid, uuid) TO authenticated, service_role;

-- ───────────────────────── Tasks ─────────────────────────

-- 1. A programme's Den work lives in one unit_project of a new type.
ALTER TABLE public.unit_projects DROP CONSTRAINT IF EXISTS unit_projects_type;
ALTER TABLE public.unit_projects
  ADD CONSTRAINT unit_projects_type
  CHECK (project_type IN ('year_end_party', 'team_bonding', 'awards', 'visit', 'charity', 'member_support', 'emergency', 'other', 'programme_operation'));

CREATE UNIQUE INDEX IF NOT EXISTS unit_projects_one_programme_operation
  ON public.unit_projects(unit_id, program_id) WHERE project_type = 'programme_operation';

CREATE OR REPLACE FUNCTION public.is_den_project(target_project uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.unit_projects project
    JOIN public.units unit_record ON unit_record.id = project.unit_id
    WHERE project.id = target_project AND unit_record.slug = 'november_den'
  );
$$;

REVOKE ALL ON FUNCTION public.is_den_project(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_den_project(uuid) TO authenticated, service_role;

-- 2. Sub-Team Leads coordinate Den projects and tasks; leadership can read them.
DROP POLICY IF EXISTS unit_projects_den_coordinate_insert ON public.unit_projects;
CREATE POLICY unit_projects_den_coordinate_insert ON public.unit_projects
FOR INSERT TO authenticated
WITH CHECK (
  public.can_coordinate_unit('november_den')
  AND EXISTS (SELECT 1 FROM public.units u WHERE u.id = unit_projects.unit_id AND u.slug = 'november_den')
);

DROP POLICY IF EXISTS unit_projects_den_coordinate_update ON public.unit_projects;
CREATE POLICY unit_projects_den_coordinate_update ON public.unit_projects
FOR UPDATE TO authenticated
USING (public.can_coordinate_unit('november_den') AND public.is_den_project(id))
WITH CHECK (
  public.can_coordinate_unit('november_den')
  AND EXISTS (SELECT 1 FROM public.units u WHERE u.id = unit_projects.unit_id AND u.slug = 'november_den')
);

DROP POLICY IF EXISTS unit_projects_den_leadership_select ON public.unit_projects;
CREATE POLICY unit_projects_den_leadership_select ON public.unit_projects
FOR SELECT TO authenticated
USING (public.is_admin() AND public.is_den_project(id));

DROP POLICY IF EXISTS unit_tasks_den_coordinate_insert ON public.unit_tasks;
CREATE POLICY unit_tasks_den_coordinate_insert ON public.unit_tasks
FOR INSERT TO authenticated
WITH CHECK (public.can_coordinate_unit('november_den') AND public.is_den_project(project_id));

DROP POLICY IF EXISTS unit_tasks_den_coordinate_update ON public.unit_tasks;
CREATE POLICY unit_tasks_den_coordinate_update ON public.unit_tasks
FOR UPDATE TO authenticated
USING (public.can_coordinate_unit('november_den') AND public.is_den_project(project_id))
WITH CHECK (public.can_coordinate_unit('november_den') AND public.is_den_project(project_id));

DROP POLICY IF EXISTS unit_tasks_den_leadership_select ON public.unit_tasks;
CREATE POLICY unit_tasks_den_leadership_select ON public.unit_tasks
FOR SELECT TO authenticated
USING (public.is_admin() AND public.is_den_project(project_id));

-- 3. A Den programme task can only be assigned to someone who is on that
-- programme (or leads the unit). Other units' tasks are not checked.
CREATE OR REPLACE FUNCTION public.guard_den_task_assignee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  task_program uuid;
BEGIN
  IF NEW.assigned_to IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN RETURN NEW; END IF;

  SELECT project.program_id INTO task_program
  FROM public.unit_projects project
  JOIN public.units unit_record ON unit_record.id = project.unit_id
  WHERE project.id = NEW.project_id
    AND unit_record.slug = 'november_den'
    AND project.project_type = 'programme_operation';

  IF task_program IS NOT NULL AND NOT public.den_can_take_programme_work(NEW.assigned_to, task_program) THEN
    RAISE EXCEPTION 'This officer has not been added to the programme, so the task cannot be assigned to them'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS unit_tasks_guard_den_assignee ON public.unit_tasks;
CREATE TRIGGER unit_tasks_guard_den_assignee
BEFORE INSERT OR UPDATE OF assigned_to ON public.unit_tasks
FOR EACH ROW EXECUTE FUNCTION public.guard_den_task_assignee();

-- 4. "When a task is assigned, the assigned member receives a notification."
CREATE OR REPLACE FUNCTION public.notify_den_task_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  program_label text;
  task_program uuid;
BEGIN
  IF NEW.assigned_to IS NULL OR NEW.status IN ('done', 'cancelled') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN RETURN NEW; END IF;
  -- Giving yourself a task needs no announcement.
  IF NEW.assigned_to = auth.uid() THEN RETURN NEW; END IF;
  IF NOT public.is_den_project(NEW.project_id) THEN RETURN NEW; END IF;

  SELECT project.program_id, program.name INTO task_program, program_label
  FROM public.unit_projects project
  LEFT JOIN public.programs program ON program.id = project.program_id
  WHERE project.id = NEW.project_id;

  INSERT INTO public.notifications (user_id, title, message, type, channel, metadata, is_read)
  VALUES (
    NEW.assigned_to,
    'New Den task',
    NEW.title
      || coalesce(' — ' || program_label, '')
      || coalesce('. Due ' || to_char(NEW.due_at AT TIME ZONE 'Africa/Lagos', 'Dy DD Mon, HH24:MI'), ''),
    'info',
    'push',
    jsonb_build_object('kind', 'den_task_assigned', 'task_id', NEW.id, 'program_id', task_program),
    false
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS unit_tasks_notify_den_assignment ON public.unit_tasks;
CREATE TRIGGER unit_tasks_notify_den_assignment
AFTER INSERT OR UPDATE OF assigned_to ON public.unit_tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_den_task_assignment();

-- 5. The programme's task list, created on first use.
CREATE OR REPLACE FUNCTION public.den_ensure_programme_project(target_program uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  den_unit uuid;
  project_id uuid;
  program_label text;
BEGIN
  IF NOT public.can_coordinate_unit('november_den') THEN
    RAISE EXCEPTION 'Only the head of November (Den) or a Sub-Team Lead can set up a programme''s tasks' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO den_unit FROM public.units WHERE slug = 'november_den';
  SELECT name INTO program_label FROM public.programs WHERE id = target_program;
  IF den_unit IS NULL OR program_label IS NULL THEN
    RAISE EXCEPTION 'Programme not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO project_id FROM public.unit_projects
  WHERE unit_id = den_unit AND program_id = target_program AND project_type = 'programme_operation';
  IF project_id IS NOT NULL THEN RETURN project_id; END IF;

  INSERT INTO public.unit_projects (unit_id, project_type, title, program_id, status, created_by)
  VALUES (den_unit, 'programme_operation', 'Den operations — ' || program_label, target_program, 'in_progress', auth.uid())
  ON CONFLICT (unit_id, program_id) WHERE project_type = 'programme_operation' DO NOTHING
  RETURNING id INTO project_id;

  IF project_id IS NULL THEN
    SELECT id INTO project_id FROM public.unit_projects
    WHERE unit_id = den_unit AND program_id = target_program AND project_type = 'programme_operation';
  END IF;
  RETURN project_id;
END;
$$;

REVOKE ALL ON FUNCTION public.den_ensure_programme_project(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.den_ensure_programme_project(uuid) TO authenticated, service_role;

-- 6. A member moves their own task along. They cannot retitle, reassign or
-- re-date it — that stays with the coordinators' update policy.
CREATE OR REPLACE FUNCTION public.den_set_my_task_status(target_task uuid, new_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF new_status NOT IN ('todo', 'in_progress', 'blocked', 'done') THEN
    RAISE EXCEPTION 'Unknown task status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.unit_tasks task
  SET status = new_status,
      completed_at = CASE WHEN new_status = 'done' THEN now() ELSE NULL END
  WHERE task.id = target_task
    AND task.assigned_to = auth.uid()
    AND task.status <> 'cancelled'
    AND public.is_den_project(task.project_id)
    AND public.is_unit_member('november_den');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This task is not assigned to you' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.den_set_my_task_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.den_set_my_task_status(uuid, text) TO authenticated, service_role;

-- ───────────────────────── Checklists ─────────────────────────

-- 7. Reusable templates (the Team Lead's), and the checklists run from them.
CREATE TABLE IF NOT EXISTS public.den_checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT den_checklist_templates_title CHECK (length(btrim(title)) > 0),
  CONSTRAINT den_checklist_templates_items CHECK (jsonb_typeof(items) = 'array')
);

DROP TRIGGER IF EXISTS den_checklist_templates_set_updated_at ON public.den_checklist_templates;
CREATE TRIGGER den_checklist_templates_set_updated_at
BEFORE UPDATE ON public.den_checklist_templates
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.den_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  -- Kept when its template is deleted: the run is the record of what was done.
  template_id uuid REFERENCES public.den_checklist_templates(id) ON DELETE SET NULL,
  title text NOT NULL,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT den_checklists_title CHECK (length(btrim(title)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_den_checklists_program ON public.den_checklists(program_id, created_at);

-- One row per item, so two officers ticking different items at the same
-- moment never overwrite each other.
CREATE TABLE IF NOT EXISTS public.den_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.den_checklists(id) ON DELETE CASCADE,
  label text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  done_at timestamptz,
  done_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT den_checklist_items_label CHECK (length(btrim(label)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_den_checklist_items_checklist ON public.den_checklist_items(checklist_id, position);

ALTER TABLE public.den_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.den_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.den_checklist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS den_checklist_templates_select ON public.den_checklist_templates;
CREATE POLICY den_checklist_templates_select ON public.den_checklist_templates
FOR SELECT TO authenticated USING (public.is_admin() OR public.is_unit_member('november_den'));

DROP POLICY IF EXISTS den_checklist_templates_manage ON public.den_checklist_templates;
CREATE POLICY den_checklist_templates_manage ON public.den_checklist_templates
FOR ALL TO authenticated
USING (public.can_manage_unit('november_den'))
WITH CHECK (public.can_manage_unit('november_den'));

DROP POLICY IF EXISTS den_checklists_select ON public.den_checklists;
CREATE POLICY den_checklists_select ON public.den_checklists
FOR SELECT TO authenticated USING (public.is_admin() OR public.is_unit_member('november_den'));

DROP POLICY IF EXISTS den_checklists_coordinate ON public.den_checklists;
CREATE POLICY den_checklists_coordinate ON public.den_checklists
FOR ALL TO authenticated
USING (public.can_coordinate_unit('november_den'))
WITH CHECK (public.can_coordinate_unit('november_den'));

DROP POLICY IF EXISTS den_checklist_items_select ON public.den_checklist_items;
CREATE POLICY den_checklist_items_select ON public.den_checklist_items
FOR SELECT TO authenticated USING (public.is_admin() OR public.is_unit_member('november_den'));

DROP POLICY IF EXISTS den_checklist_items_coordinate ON public.den_checklist_items;
CREATE POLICY den_checklist_items_coordinate ON public.den_checklist_items
FOR ALL TO authenticated
USING (public.can_coordinate_unit('november_den'))
WITH CHECK (public.can_coordinate_unit('november_den'));

-- 8. Start a checklist for a programme, from a template or blank, in one step.
CREATE OR REPLACE FUNCTION public.den_start_checklist(target_program uuid, target_template uuid DEFAULT NULL, checklist_title text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  template_row public.den_checklist_templates%ROWTYPE;
  new_id uuid;
  final_title text;
BEGIN
  IF NOT public.can_coordinate_unit('november_den') THEN
    RAISE EXCEPTION 'Only the head of November (Den) or a Sub-Team Lead can start a checklist' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.programs WHERE id = target_program) THEN
    RAISE EXCEPTION 'Programme not found' USING ERRCODE = 'P0002';
  END IF;
  IF target_template IS NOT NULL THEN
    SELECT * INTO template_row FROM public.den_checklist_templates WHERE id = target_template;
    IF NOT FOUND THEN RAISE EXCEPTION 'Checklist template not found' USING ERRCODE = 'P0002'; END IF;
  END IF;

  final_title := coalesce(nullif(btrim(checklist_title), ''), template_row.title);
  IF final_title IS NULL THEN RAISE EXCEPTION 'A checklist needs a title' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.den_checklists (program_id, template_id, title, created_by)
  VALUES (target_program, target_template, final_title, auth.uid())
  RETURNING id INTO new_id;

  IF target_template IS NOT NULL THEN
    INSERT INTO public.den_checklist_items (checklist_id, label, position)
    SELECT new_id, btrim(item.label), item.ordinality::integer
    FROM jsonb_array_elements_text(template_row.items) WITH ORDINALITY AS item(label, ordinality)
    WHERE length(btrim(item.label)) > 0;
  END IF;
  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.den_start_checklist(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.den_start_checklist(uuid, uuid, text) TO authenticated, service_role;

-- 9. Tick or untick one item: anyone doing that programme's work.
CREATE OR REPLACE FUNCTION public.den_tick_checklist_item(target_item uuid, is_done boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  item_program uuid;
BEGIN
  SELECT checklist.program_id INTO item_program
  FROM public.den_checklist_items item
  JOIN public.den_checklists checklist ON checklist.id = item.checklist_id
  WHERE item.id = target_item;
  IF item_program IS NULL THEN RAISE EXCEPTION 'Checklist item not found' USING ERRCODE = 'P0002'; END IF;

  IF NOT (public.is_platform_admin() OR public.den_can_take_programme_work(auth.uid(), item_program)) THEN
    RAISE EXCEPTION 'You have not been added to this programme' USING ERRCODE = '42501';
  END IF;

  UPDATE public.den_checklist_items
  SET done_at = CASE WHEN is_done THEN coalesce(done_at, now()) ELSE NULL END,
      done_by = CASE WHEN is_done THEN coalesce(done_by, auth.uid()) ELSE NULL END
  WHERE id = target_item;
END;
$$;

REVOKE ALL ON FUNCTION public.den_tick_checklist_item(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.den_tick_checklist_item(uuid, boolean) TO authenticated, service_role;

-- ───────────────────────── Roster ─────────────────────────

-- 10. Shifts for a programme and who covers each one.
CREATE TABLE IF NOT EXISTS public.den_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  nest_id uuid REFERENCES public.nests(id) ON DELETE SET NULL,
  officers_needed integer NOT NULL DEFAULT 1,
  notes text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT den_shifts_title CHECK (length(btrim(title)) > 0),
  CONSTRAINT den_shifts_time_order CHECK (ends_at > starts_at),
  CONSTRAINT den_shifts_officers_needed CHECK (officers_needed BETWEEN 1 AND 100)
);

CREATE INDEX IF NOT EXISTS idx_den_shifts_program ON public.den_shifts(program_id, starts_at);

DROP TRIGGER IF EXISTS den_shifts_set_updated_at ON public.den_shifts;
CREATE TRIGGER den_shifts_set_updated_at
BEFORE UPDATE ON public.den_shifts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.den_shift_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES public.den_shifts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT den_shift_members_unique UNIQUE (shift_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_den_shift_members_user ON public.den_shift_members(user_id);

ALTER TABLE public.den_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.den_shift_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS den_shifts_select ON public.den_shifts;
CREATE POLICY den_shifts_select ON public.den_shifts
FOR SELECT TO authenticated USING (public.is_admin() OR public.is_unit_member('november_den'));

DROP POLICY IF EXISTS den_shifts_coordinate ON public.den_shifts;
CREATE POLICY den_shifts_coordinate ON public.den_shifts
FOR ALL TO authenticated
USING (public.can_coordinate_unit('november_den'))
WITH CHECK (public.can_coordinate_unit('november_den'));

DROP POLICY IF EXISTS den_shift_members_select ON public.den_shift_members;
CREATE POLICY den_shift_members_select ON public.den_shift_members
FOR SELECT TO authenticated USING (public.is_admin() OR public.is_unit_member('november_den'));

DROP POLICY IF EXISTS den_shift_members_coordinate ON public.den_shift_members;
CREATE POLICY den_shift_members_coordinate ON public.den_shift_members
FOR ALL TO authenticated
USING (public.can_coordinate_unit('november_den'))
WITH CHECK (public.can_coordinate_unit('november_den'));

-- 11. Only officers on the programme go on its roster, and each is told.
CREATE OR REPLACE FUNCTION public.guard_and_notify_den_shift_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  shift_row public.den_shifts%ROWTYPE;
  program_label text;
BEGIN
  SELECT * INTO shift_row FROM public.den_shifts WHERE id = NEW.shift_id;

  IF TG_WHEN = 'BEFORE' THEN
    IF NOT public.den_can_take_programme_work(NEW.user_id, shift_row.program_id) THEN
      RAISE EXCEPTION 'This officer has not been added to the programme, so they cannot be put on its roster'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
    SELECT name INTO program_label FROM public.programs WHERE id = shift_row.program_id;
    INSERT INTO public.notifications (user_id, title, message, type, channel, metadata, is_read)
    VALUES (
      NEW.user_id,
      'You are on the Den roster',
      shift_row.title
        || coalesce(' — ' || program_label, '')
        || '. ' || to_char(shift_row.starts_at AT TIME ZONE 'Africa/Lagos', 'Dy DD Mon, HH24:MI')
        || ' to ' || to_char(shift_row.ends_at AT TIME ZONE 'Africa/Lagos', 'HH24:MI'),
      'info',
      'push',
      jsonb_build_object('kind', 'den_shift_assigned', 'shift_id', NEW.shift_id, 'program_id', shift_row.program_id),
      false
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS den_shift_members_guard ON public.den_shift_members;
CREATE TRIGGER den_shift_members_guard
BEFORE INSERT ON public.den_shift_members
FOR EACH ROW EXECUTE FUNCTION public.guard_and_notify_den_shift_member();

DROP TRIGGER IF EXISTS den_shift_members_notify ON public.den_shift_members;
CREATE TRIGGER den_shift_members_notify
AFTER INSERT ON public.den_shift_members
FOR EACH ROW EXECUTE FUNCTION public.guard_and_notify_den_shift_member();

-- ───────────────────────── Shared reads ─────────────────────────

-- 12. Who can be given this programme's work — names only, for the pickers.
CREATE OR REPLACE FUNCTION public.den_programme_team(target_program uuid)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  photo_url text,
  access_level text,
  on_programme boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    membership.user_id,
    user_record.full_name,
    user_record.photo_url,
    membership.access_level,
    public.is_program_active_officer(membership.user_id, target_program)
  FROM public.unit_memberships membership
  JOIN public.units unit_record ON unit_record.id = membership.unit_id
  JOIN public.users user_record ON user_record.id = membership.user_id
  WHERE unit_record.slug = 'november_den'
    AND membership.status = 'active'
    AND (public.is_admin() OR public.is_unit_member('november_den'))
    AND public.den_can_take_programme_work(membership.user_id, target_program)
  ORDER BY user_record.full_name;
$$;

REVOKE ALL ON FUNCTION public.den_programme_team(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.den_programme_team(uuid) TO authenticated, service_role;

-- 13. The readiness numbers, now including tasks, checklists and the roster.
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
    'plan', (SELECT to_jsonb(plan) FROM (
      SELECT o.id, o.status, o.expected_guests, o.service_notes, o.updated_at
      FROM public.den_operations o WHERE o.program_id = target_program
    ) plan)
  ) END;
$$;

NOTIFY pgrst, 'reload schema';
