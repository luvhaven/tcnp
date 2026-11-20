-- Unit tasks for every unit (2026-11-16 unit build-out).
--
-- unit_projects / unit_tasks were always generic, but the notifications, the
-- "move my own task" RPC, the reminders and the coordinator policies were
-- written for November (Den) only (20261115170000, 20261116140000). This
-- migration generalises them to every unit:
--
--   task_unit_slug(project)        which unit a project (and so a task) belongs to.
--   coordinator policies           head / sub_lead of the owning unit create and
--                                  update its projects and tasks; Command reads
--                                  every unit's. The Den-only policies stay
--                                  (they are additive and now redundant).
--   created_by guard               a task's creator is the caller, so status
--                                  notifications go to the person who set it.
--   assignee guard                 every task goes to an active member of the
--                                  owning unit; a programme task also needs the
--                                  member to lead the unit or be active on the
--                                  programme. Checked when the assignee or the
--                                  project changes. Replaces the Den's guard.
--   notify_unit_task_assignment    replaces notify_den_task_assignment's trigger.
--                                  Den tasks keep kind 'den_task_assigned';
--                                  other units send 'unit_task_assigned'.
--   notify_unit_task_status        the creator hears when the assignee marks the
--                                  task done or blocked ('unit_task_status').
--   unit_set_my_task_status(task, new_status)
--                                  the assignee, while a member of the unit,
--                                  moves their own task. den_set_my_task_status
--                                  becomes a wrapper.
--   unit_send_task_reminders()     the Den reminder job for every unit (same
--                                  bookkeeping table); den_send_task_reminders
--                                  becomes a wrapper and the cron job is renamed.
--   unit_ensure_programme_project(slug, program)
--                                  a unit's task list for one programme.
--   notifications INSERT           notifications_insert_all (any signed-in user
--                                  could notify anyone, which also pushes to
--                                  their phone) becomes "only yourself".
--                                  Triggers and the service role bypass RLS, so
--                                  every server-side notification keeps working.
--
-- Platform admins pass every check (can_coordinate_unit includes them);
-- Command keeps reading. Repeatable: CREATE OR REPLACE, DROP ... IF EXISTS.

-- ─── 1. Which unit a project belongs to ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.task_unit_slug(project uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT unit_record.slug
  FROM public.unit_projects unit_project
  JOIN public.units unit_record ON unit_record.id = unit_project.unit_id
  WHERE unit_project.id = task_unit_slug.project;
$$;

REVOKE ALL ON FUNCTION public.task_unit_slug(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.task_unit_slug(uuid) TO authenticated, service_role;

-- ─── 2. Coordinators of the owning unit; Command reads ──────────────────────

DROP POLICY IF EXISTS unit_projects_coordinate_insert ON public.unit_projects;
CREATE POLICY unit_projects_coordinate_insert ON public.unit_projects
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.units unit_record
  WHERE unit_record.id = unit_projects.unit_id AND public.can_coordinate_unit(unit_record.slug)
));

DROP POLICY IF EXISTS unit_projects_coordinate_update ON public.unit_projects;
CREATE POLICY unit_projects_coordinate_update ON public.unit_projects
FOR UPDATE TO authenticated
USING (public.can_coordinate_unit(public.task_unit_slug(id)))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.units unit_record
  WHERE unit_record.id = unit_projects.unit_id AND public.can_coordinate_unit(unit_record.slug)
));

DROP POLICY IF EXISTS unit_projects_leadership_select ON public.unit_projects;
CREATE POLICY unit_projects_leadership_select ON public.unit_projects
FOR SELECT TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS unit_tasks_coordinate_insert ON public.unit_tasks;
CREATE POLICY unit_tasks_coordinate_insert ON public.unit_tasks
FOR INSERT TO authenticated
WITH CHECK (public.can_coordinate_unit(public.task_unit_slug(project_id)));

-- USING and WITH CHECK both: a task cannot be moved into a unit the caller
-- does not coordinate.
DROP POLICY IF EXISTS unit_tasks_coordinate_update ON public.unit_tasks;
CREATE POLICY unit_tasks_coordinate_update ON public.unit_tasks
FOR UPDATE TO authenticated
USING (public.can_coordinate_unit(public.task_unit_slug(project_id)))
WITH CHECK (public.can_coordinate_unit(public.task_unit_slug(project_id)));

DROP POLICY IF EXISTS unit_tasks_leadership_select ON public.unit_tasks;
CREATE POLICY unit_tasks_leadership_select ON public.unit_tasks
FOR SELECT TO authenticated
USING (public.is_admin());

-- ─── 3. The creator is the caller ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.stamp_unit_task_creator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Only signed-in callers are stamped; the service role keeps what it sent.
    IF auth.uid() IS NOT NULL THEN NEW.created_by := auth.uid(); END IF;
  ELSIF NEW.created_by IS DISTINCT FROM OLD.created_by AND auth.uid() IS NOT NULL THEN
    NEW.created_by := OLD.created_by;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS unit_tasks_stamp_creator ON public.unit_tasks;
CREATE TRIGGER unit_tasks_stamp_creator
BEFORE INSERT OR UPDATE OF created_by ON public.unit_tasks
FOR EACH ROW EXECUTE FUNCTION public.stamp_unit_task_creator();

-- ─── 4. Programme tasks go to people who can take the programme's work ──────

-- Someone who may be given unit X's work on programme P: an active member of
-- X who leads it or is active on P. A head grant is not required to RECEIVE a
-- task (the Den rule, den_can_take_programme_work, is the same).
CREATE OR REPLACE FUNCTION public.unit_can_take_programme_work(unit_slug text, target_user uuid, target_program uuid)
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
    WHERE unit_record.slug = unit_can_take_programme_work.unit_slug
      AND unit_record.is_active = true
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

REVOKE ALL ON FUNCTION public.unit_can_take_programme_work(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unit_can_take_programme_work(text, uuid, uuid) TO authenticated, service_role;

-- Whether an officer is an active member of an active unit (the assignee
-- rule for every task: only someone who can see the task and mark it done
-- may be given it).
CREATE OR REPLACE FUNCTION public.unit_member_can_take_task(unit_slug text, target_user uuid)
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
    WHERE unit_record.slug = unit_member_can_take_task.unit_slug
      AND unit_record.is_active = true
      AND membership.user_id = target_user
      AND membership.status = 'active'
      AND coalesce(user_record.is_active, true) = true
      AND coalesce(user_record.activation_status, 'active') = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.unit_member_can_take_task(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unit_member_can_take_task(text, uuid) TO authenticated, service_role;

-- One rule for every unit, the Den included, checked whenever the assignee
-- OR the project changes (moving a task onto a programme's list is checked
-- like assigning it there):
--   every task       the assignee is an active member of the owning unit, so
--                    they can see the task, are reminded about it, and can
--                    mark it done (unit_set_my_task_status needs membership).
--   programme task   also leads the unit or is active on the programme
--                    (den_can_take_programme_work for the Den, with its own
--                    wording; unit_can_take_programme_work elsewhere).
-- This replaces the Den's own trigger (unit_tasks_guard_den_assignee), which
-- only looked at assignee changes.
CREATE OR REPLACE FUNCTION public.guard_unit_task_assignee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  owning_slug text;
  project_kind text;
  task_program uuid;
BEGIN
  IF NEW.assigned_to IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE'
    AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to
    AND NEW.project_id IS NOT DISTINCT FROM OLD.project_id
  THEN
    RETURN NEW;
  END IF;

  SELECT unit_record.slug, unit_project.project_type, unit_project.program_id
  INTO owning_slug, project_kind, task_program
  FROM public.unit_projects unit_project
  JOIN public.units unit_record ON unit_record.id = unit_project.unit_id
  WHERE unit_project.id = NEW.project_id;

  IF owning_slug IS NULL THEN RETURN NEW; END IF;

  IF project_kind = 'programme_operation' AND task_program IS NOT NULL THEN
    IF owning_slug = 'november_den' THEN
      IF NOT public.den_can_take_programme_work(NEW.assigned_to, task_program) THEN
        RAISE EXCEPTION 'This officer has not been added to the programme, so the task cannot be assigned to them'
          USING ERRCODE = '23514';
      END IF;
    ELSIF NOT public.unit_can_take_programme_work(owning_slug, NEW.assigned_to, task_program) THEN
      RAISE EXCEPTION 'This officer is not on the programme for this unit, so the task cannot be assigned to them'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT public.unit_member_can_take_task(owning_slug, NEW.assigned_to) THEN
    RAISE EXCEPTION 'Only an active member of this unit can be given its tasks'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS unit_tasks_guard_den_assignee ON public.unit_tasks;
DROP TRIGGER IF EXISTS unit_tasks_guard_programme_assignee ON public.unit_tasks;
CREATE TRIGGER unit_tasks_guard_programme_assignee
BEFORE INSERT OR UPDATE OF assigned_to, project_id ON public.unit_tasks
FOR EACH ROW EXECUTE FUNCTION public.guard_unit_task_assignee();

-- ─── 5. Assignment notification, every unit ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_unit_task_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  owning_slug text;
  unit_label text;
  task_program uuid;
  program_label text;
BEGIN
  IF NEW.assigned_to IS NULL OR NEW.status IN ('done', 'cancelled') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN RETURN NEW; END IF;
  -- Giving yourself a task needs no announcement.
  IF NEW.assigned_to = auth.uid() THEN RETURN NEW; END IF;

  SELECT unit_record.slug, unit_record.name, unit_project.program_id, program.name
  INTO owning_slug, unit_label, task_program, program_label
  FROM public.unit_projects unit_project
  JOIN public.units unit_record ON unit_record.id = unit_project.unit_id
  LEFT JOIN public.programs program ON program.id = unit_project.program_id
  WHERE unit_project.id = NEW.project_id;

  IF owning_slug IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.notifications (user_id, title, message, type, channel, metadata, is_read)
  VALUES (
    NEW.assigned_to,
    CASE WHEN owning_slug = 'november_den' THEN 'New Den task' ELSE 'New ' || unit_label || ' task' END,
    NEW.title
      || coalesce(' — ' || program_label, '')
      || coalesce('. Due ' || to_char(NEW.due_at AT TIME ZONE 'Africa/Lagos', 'Dy DD Mon, HH24:MI'), ''),
    'info',
    'push',
    jsonb_build_object(
      'kind', CASE WHEN owning_slug = 'november_den' THEN 'den_task_assigned' ELSE 'unit_task_assigned' END,
      'unit_slug', owning_slug,
      'task_id', NEW.id,
      'program_id', task_program
    ),
    false
  );
  RETURN NEW;
END;
$$;

-- The Den trigger is replaced by the generic one (same timing and columns), so
-- a Den assignment is still announced exactly once.
DROP TRIGGER IF EXISTS unit_tasks_notify_den_assignment ON public.unit_tasks;
DROP TRIGGER IF EXISTS unit_tasks_notify_assignment ON public.unit_tasks;
CREATE TRIGGER unit_tasks_notify_assignment
AFTER INSERT OR UPDATE OF assigned_to ON public.unit_tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_unit_task_assignment();

-- ─── 6. The creator hears when the work is done or stuck ────────────────────

CREATE OR REPLACE FUNCTION public.notify_unit_task_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  owning_slug text;
  task_program uuid;
  program_label text;
  actor_name text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status NOT IN ('done', 'blocked') THEN RETURN NEW; END IF;
  IF NEW.created_by IS NULL OR NEW.created_by = auth.uid() THEN RETURN NEW; END IF;

  SELECT unit_record.slug, unit_project.program_id, program.name
  INTO owning_slug, task_program, program_label
  FROM public.unit_projects unit_project
  JOIN public.units unit_record ON unit_record.id = unit_project.unit_id
  LEFT JOIN public.programs program ON program.id = unit_project.program_id
  WHERE unit_project.id = NEW.project_id;

  IF owning_slug IS NULL THEN RETURN NEW; END IF;

  SELECT user_record.full_name INTO actor_name FROM public.users user_record WHERE user_record.id = auth.uid();

  INSERT INTO public.notifications (user_id, title, message, type, channel, metadata, is_read)
  VALUES (
    NEW.created_by,
    CASE WHEN NEW.status = 'done' THEN 'Task done' ELSE 'Task blocked' END,
    NEW.title
      || coalesce(' — ' || program_label, '')
      || CASE WHEN NEW.status = 'done' THEN '. Marked done' ELSE '. Marked blocked' END
      || coalesce(' by ' || actor_name, '')
      || CASE WHEN NEW.status = 'blocked' THEN '. It needs your help.' ELSE '.' END,
    CASE WHEN NEW.status = 'done' THEN 'success' ELSE 'warning' END,
    'push',
    jsonb_build_object('kind', 'unit_task_status', 'status', NEW.status, 'unit_slug', owning_slug, 'task_id', NEW.id, 'program_id', task_program),
    false
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS unit_tasks_notify_status ON public.unit_tasks;
CREATE TRIGGER unit_tasks_notify_status
AFTER UPDATE OF status ON public.unit_tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_unit_task_status();

-- ─── 7. A member moves their own task ───────────────────────────────────────

-- The assignee, while still a member of the owning unit, sets the status. They
-- cannot retitle, reassign or re-date it; that stays with the coordinators.
-- The parameter is called "task" because components/compliance calls it so.
CREATE OR REPLACE FUNCTION public.unit_set_my_task_status(task uuid, new_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF new_status IS NULL OR new_status NOT IN ('todo', 'in_progress', 'blocked', 'done') THEN
    RAISE EXCEPTION 'Unknown task status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.unit_tasks target
  SET status = new_status,
      completed_at = CASE WHEN new_status = 'done' THEN coalesce(target.completed_at, now()) ELSE NULL END
  WHERE target.id = unit_set_my_task_status.task
    AND target.assigned_to = auth.uid()
    AND target.status <> 'cancelled'
    AND public.is_unit_member(public.task_unit_slug(target.project_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This task is not assigned to you' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.unit_set_my_task_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unit_set_my_task_status(uuid, text) TO authenticated, service_role;

-- The Den's name, kept for components/den. Den tasks only, as before.
CREATE OR REPLACE FUNCTION public.den_set_my_task_status(target_task uuid, new_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.unit_tasks target
    WHERE target.id = target_task AND public.is_den_project(target.project_id)
  ) THEN
    RAISE EXCEPTION 'This task is not assigned to you' USING ERRCODE = '42501';
  END IF;
  PERFORM public.unit_set_my_task_status(target_task, new_status);
END;
$$;

REVOKE ALL ON FUNCTION public.den_set_my_task_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.den_set_my_task_status(uuid, text) TO authenticated, service_role;

-- ─── 8. A unit's task list for one programme ────────────────────────────────

CREATE OR REPLACE FUNCTION public.unit_ensure_programme_project(unit_slug text, target_program uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_unit uuid;
  unit_label text;
  program_label text;
  project_id uuid;
BEGIN
  IF NOT public.can_coordinate_unit(unit_ensure_programme_project.unit_slug) THEN
    RAISE EXCEPTION 'Only the unit head or a sub-lead can set up a programme''s tasks' USING ERRCODE = '42501';
  END IF;
  SELECT unit_record.id, unit_record.name INTO target_unit, unit_label
  FROM public.units unit_record
  WHERE unit_record.slug = unit_ensure_programme_project.unit_slug AND unit_record.is_active = true;
  SELECT program.name INTO program_label FROM public.programs program WHERE program.id = target_program;
  IF target_unit IS NULL OR program_label IS NULL THEN
    RAISE EXCEPTION 'Programme not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT unit_project.id INTO project_id FROM public.unit_projects unit_project
  WHERE unit_project.unit_id = target_unit AND unit_project.program_id = target_program
    AND unit_project.project_type = 'programme_operation';
  IF project_id IS NOT NULL THEN RETURN project_id; END IF;

  INSERT INTO public.unit_projects (unit_id, project_type, title, program_id, status, created_by)
  VALUES (
    target_unit, 'programme_operation',
    CASE WHEN unit_ensure_programme_project.unit_slug = 'november_den' THEN 'Den operations' ELSE unit_label || ' operations' END
      || ' — ' || program_label,
    target_program, 'in_progress', auth.uid()
  )
  ON CONFLICT (unit_id, program_id) WHERE project_type = 'programme_operation' DO NOTHING
  RETURNING id INTO project_id;

  IF project_id IS NULL THEN
    SELECT unit_project.id INTO project_id FROM public.unit_projects unit_project
    WHERE unit_project.unit_id = target_unit AND unit_project.program_id = target_program
      AND unit_project.project_type = 'programme_operation';
  END IF;
  RETURN project_id;
END;
$$;

REVOKE ALL ON FUNCTION public.unit_ensure_programme_project(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unit_ensure_programme_project(text, uuid) TO authenticated, service_role;

-- ─── 9. Reminders for every unit ────────────────────────────────────────────

-- Same rules as the Den job (20261116140000): open tasks due within 24 hours,
-- and once more when overdue; nothing older than three days; one reminder per
-- task, kind and deadline (den_task_reminders is keyed that way and was never
-- Den-specific). Den reminders keep their kind and wording.
CREATE OR REPLACE FUNCTION public.unit_send_task_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  sent integer := 0;
BEGIN
  WITH due AS (
    SELECT target.id, target.assigned_to, target.title, target.due_at,
      unit_record.slug AS unit_slug, unit_record.name AS unit_name,
      unit_project.program_id, program.name AS program_name,
      CASE WHEN target.due_at < now() THEN 'overdue' ELSE 'due_soon' END AS kind
    FROM public.unit_tasks target
    JOIN public.unit_projects unit_project ON unit_project.id = target.project_id
    JOIN public.units unit_record ON unit_record.id = unit_project.unit_id
    LEFT JOIN public.programs program ON program.id = unit_project.program_id
    JOIN public.users assignee ON assignee.id = target.assigned_to
    WHERE target.status IN ('todo', 'in_progress', 'blocked')
      AND target.due_at IS NOT NULL
      AND target.due_at > now() - interval '3 days'
      AND target.due_at <= now() + interval '24 hours'
      AND coalesce(assignee.is_active, true) = true
      AND coalesce(assignee.activation_status, 'active') = 'active'
      -- Only people who can still see and close the task: an officer who has
      -- left the unit is not chased for its work.
      AND unit_record.is_active = true
      AND EXISTS (
        SELECT 1 FROM public.unit_memberships membership
        WHERE membership.unit_id = unit_record.id
          AND membership.user_id = target.assigned_to
          AND membership.status = 'active'
      )
  ),
  claimed AS (
    INSERT INTO public.den_task_reminders (task_id, kind, due_at)
    SELECT due.id, due.kind, due.due_at FROM due
    ON CONFLICT DO NOTHING
    RETURNING task_id, kind
  )
  INSERT INTO public.notifications (user_id, title, message, type, channel, metadata, is_read)
  SELECT
    due.assigned_to,
    CASE WHEN due.unit_slug = 'november_den' THEN 'Den task' ELSE due.unit_name || ' task' END
      || CASE WHEN due.kind = 'overdue' THEN ' overdue' ELSE ' due soon' END,
    due.title
      || coalesce(' — ' || due.program_name, '')
      || CASE WHEN due.kind = 'overdue' THEN '. Was due ' ELSE '. Due ' END
      || to_char(due.due_at AT TIME ZONE 'Africa/Lagos', 'Dy DD Mon, HH24:MI'),
    CASE WHEN due.kind = 'overdue' THEN 'warning' ELSE 'reminder' END,
    'push',
    jsonb_build_object(
      'kind', CASE WHEN due.unit_slug = 'november_den' THEN 'den_task_reminder' ELSE 'unit_task_reminder' END,
      'reminder', due.kind,
      'unit_slug', due.unit_slug,
      'task_id', due.id,
      'program_id', due.program_id
    ),
    false
  FROM due
  JOIN claimed ON claimed.task_id = due.id AND claimed.kind = due.kind;

  GET DIAGNOSTICS sent = ROW_COUNT;
  RETURN sent;
END;
$$;

REVOKE ALL ON FUNCTION public.unit_send_task_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unit_send_task_reminders() TO service_role;

-- The old name still works (and now covers every unit).
CREATE OR REPLACE FUNCTION public.den_send_task_reminders()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.unit_send_task_reminders();
$$;

REVOKE ALL ON FUNCTION public.den_send_task_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.den_send_task_reminders() TO service_role;

-- One job for every unit, every 30 minutes. Unscheduling first keeps this
-- migration repeatable.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('tcnp-den-task-reminders', 'tcnp-unit-task-reminders');
SELECT cron.schedule(
  'tcnp-unit-task-reminders',
  '*/30 * * * *',
  $$SELECT public.unit_send_task_reminders();$$
);

-- ─── 10. Nobody notifies anybody else from the browser ──────────────────────

-- notifications_insert_all (TO authenticated WITH CHECK true) let any signed-in
-- account write a notification, and so a phone push, for any user. Every
-- notification for someone else is written by a SECURITY DEFINER trigger or
-- function, or by an API route with the service-role client; both bypass RLS.
-- The one browser insert (components/tracking/LocationTracker) is for the
-- caller themself. The two older admin-role INSERT policies are left as they
-- are (Admin and Command are never reduced).
--
-- notifications_insert_own is the policy 20261019150000_p1_security_hardening
-- defines (own row AND an active account). That migration is in the repo but
-- has not been applied to live, which still has notifications_insert_all; this
-- recreates the hardened policy exactly so both paths end in the same place.
DROP POLICY IF EXISTS notifications_insert_all ON public.notifications;
DROP POLICY IF EXISTS notifications_insert_own ON public.notifications;
CREATE POLICY notifications_insert_own ON public.notifications
FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT public.is_active_member()));

NOTIFY pgrst, 'reload schema';
