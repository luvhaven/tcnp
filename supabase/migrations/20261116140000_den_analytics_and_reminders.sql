-- November (Den) — Stage 5: the Den dashboard and deadline reminders.
--
-- One read function returns everything the dashboard shows, so the page makes
-- a single request and loads well inside the PRD's three seconds. It is
-- read-only and returns the same answer to every Den member and to leadership
-- (is_admin): Protocol Leadership sees the dashboards without being able to
-- change any record through them.
--
-- A second function, run by the scheduler, reminds officers of their own Den
-- tasks before they fall due and once when they are overdue.

-- ───────────────────────── Dashboard ─────────────────────────

CREATE OR REPLACE FUNCTION public.den_analytics()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
WITH allowed AS (
  SELECT (public.is_admin() OR public.is_unit_member('november_den')) AS ok
),
den_unit AS (
  SELECT id FROM public.units WHERE slug = 'november_den'
),
members AS (
  SELECT membership.user_id, membership.access_level, user_record.full_name
  FROM public.unit_memberships membership
  JOIN den_unit ON den_unit.id = membership.unit_id
  JOIN public.users user_record ON user_record.id = membership.user_id
  WHERE membership.status = 'active'
    AND coalesce(user_record.is_active, true) = true
),
tasks AS (
  SELECT task.id, task.assigned_to, task.status, task.due_at, project.program_id
  FROM public.unit_tasks task
  JOIN public.unit_projects project ON project.id = task.project_id
  JOIN den_unit ON den_unit.id = project.unit_id
  WHERE task.status <> 'cancelled'
),
-- Programmes the Den is working on: those with a Den plan that is not archived.
den_programmes AS (
  SELECT program.id, program.name, program.start_date, program.end_date, plan.status AS plan_status
  FROM public.den_operations plan
  JOIN public.programs program ON program.id = plan.program_id
  WHERE plan.status <> 'archived'
),
usage AS (
  SELECT movement.item_id, -movement.change AS used, movement.created_at
  FROM public.den_inventory_movements movement
  WHERE movement.movement_type = 'use'
),
weeks AS (
  SELECT generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') AS week_start
)
SELECT CASE WHEN NOT (SELECT ok FROM allowed) THEN NULL ELSE jsonb_build_object(
  'generated_at', now(),

  'operational', jsonb_build_object(
    'programmes_active', (SELECT count(*) FROM den_programmes WHERE plan_status IN ('planning', 'ready', 'live')),
    'programmes_completed', (SELECT count(*) FROM den_programmes WHERE plan_status = 'completed'),
    'open_tasks', (SELECT count(*) FROM tasks WHERE status <> 'done'),
    'overdue_tasks', (SELECT count(*) FROM tasks WHERE status <> 'done' AND due_at < now()),
    'tasks_done', (SELECT count(*) FROM tasks WHERE status = 'done'),
    'programmes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'start_date', p.start_date, 'end_date', p.end_date, 'plan_status', p.plan_status,
        'summary', public.den_programme_summary(p.id)
      ) ORDER BY p.start_date DESC NULLS LAST, p.name)
      FROM den_programmes p
    ), '[]'::jsonb)
  ),

  'team', jsonb_build_object(
    'members', (SELECT count(*) FROM members),
    -- Participation: members who have been added to at least one Den programme.
    'participating', (SELECT count(*) FROM members m WHERE EXISTS (
      SELECT 1 FROM den_programmes p WHERE public.is_program_active_officer(m.user_id, p.id)
    )),
    'officers', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'user_id', m.user_id,
        'full_name', m.full_name,
        'access_level', m.access_level,
        'tasks_assigned', (SELECT count(*) FROM tasks t WHERE t.assigned_to = m.user_id),
        'tasks_done', (SELECT count(*) FROM tasks t WHERE t.assigned_to = m.user_id AND t.status = 'done'),
        'tasks_overdue', (SELECT count(*) FROM tasks t WHERE t.assigned_to = m.user_id AND t.status <> 'done' AND t.due_at < now()),
        'shifts', (SELECT count(*) FROM public.den_shift_members sm WHERE sm.user_id = m.user_id),
        'programmes', (SELECT count(*) FROM den_programmes p WHERE public.is_program_active_officer(m.user_id, p.id))
      ) ORDER BY m.full_name)
      FROM members m
    ), '[]'::jsonb)
  ),

  'inventory', jsonb_build_object(
    'items', (SELECT count(*) FROM public.den_inventory_items WHERE is_active),
    'out_of_stock', (SELECT count(*) FROM public.den_inventory_items WHERE is_active AND quantity <= 0),
    'low_stock', (SELECT count(*) FROM public.den_inventory_items WHERE is_active AND quantity > 0 AND reorder_level > 0 AND quantity <= reorder_level),
    'reorder', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'name', i.name, 'unit', i.unit, 'quantity', i.quantity, 'reorder_level', i.reorder_level
      ) ORDER BY i.quantity, i.name)
      FROM public.den_inventory_items i
      WHERE i.is_active AND (i.quantity <= 0 OR (i.reorder_level > 0 AND i.quantity <= i.reorder_level))
    ), '[]'::jsonb),
    'weekly_usage', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'week_start', w.week_start::date,
        'used', coalesce((SELECT sum(u.used) FROM usage u WHERE u.created_at >= w.week_start AND u.created_at < w.week_start + interval '1 week'), 0)
      ) ORDER BY w.week_start)
      FROM weeks w
    ), '[]'::jsonb),
    'top_used', coalesce((
      SELECT jsonb_agg(row_to_json(top)::jsonb)
      FROM (
        SELECT i.name, i.unit, sum(u.used) AS used
        FROM usage u JOIN public.den_inventory_items i ON i.id = u.item_id
        WHERE u.created_at >= now() - interval '30 days'
        GROUP BY i.id, i.name, i.unit
        ORDER BY sum(u.used) DESC, i.name
        LIMIT 5
      ) top
    ), '[]'::jsonb)
  ),

  'reporting', jsonb_build_object(
    'programmes_reported', (SELECT count(DISTINCT r.program_id) FROM public.den_reports r WHERE r.report_type = 'post_operation' AND r.status = 'submitted'),
    'field_reports', (SELECT count(*) FROM public.den_reports r WHERE r.report_type = 'field' AND r.status = 'submitted'),
    'lessons_logged', (
      (SELECT count(*) FROM public.den_reports r WHERE r.status = 'submitted' AND nullif(btrim(coalesce(r.lessons_learned, '')), '') IS NOT NULL)
      + (SELECT count(*) FROM public.den_guest_notes n WHERE n.category = 'lesson')
    ),
    'repository_items', (SELECT count(*) FROM public.den_repository_items),
    'outstanding', coalesce((
      SELECT jsonb_agg(jsonb_build_object('program_id', o.program_id, 'program_name', o.program_name, 'end_date', o.end_date, 'has_draft', o.has_draft))
      FROM public.den_outstanding_reports() o
    ), '[]'::jsonb)
  )
) END;
$$;

REVOKE ALL ON FUNCTION public.den_analytics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.den_analytics() TO authenticated, service_role;

-- ───────────────────────── Reminders ─────────────────────────

-- What has already been sent, so nobody is reminded of the same thing twice.
-- Keyed on the deadline as well: moving a deadline earns a fresh reminder.
CREATE TABLE IF NOT EXISTS public.den_task_reminders (
  task_id uuid NOT NULL REFERENCES public.unit_tasks(id) ON DELETE CASCADE,
  kind text NOT NULL,
  due_at timestamptz NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, kind, due_at),
  CONSTRAINT den_task_reminders_kind CHECK (kind IN ('due_soon', 'overdue'))
);

-- Internal bookkeeping: no policies, so the app can neither read nor write it.
ALTER TABLE public.den_task_reminders ENABLE ROW LEVEL SECURITY;

-- Reminds the assignee of an open Den task that is due within the next 24
-- hours, and once more when it has gone overdue. Tasks that were already more
-- than three days overdue when this first runs are left alone, so switching
-- reminders on never floods anyone with old news.
CREATE OR REPLACE FUNCTION public.den_send_task_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  sent integer := 0;
  batch integer;
BEGIN
  WITH due AS (
    SELECT task.id, task.assigned_to, task.title, task.due_at, project.program_id, program.name AS program_name,
      CASE WHEN task.due_at < now() THEN 'overdue' ELSE 'due_soon' END AS kind
    FROM public.unit_tasks task
    JOIN public.unit_projects project ON project.id = task.project_id
    JOIN public.units unit_record ON unit_record.id = project.unit_id
    LEFT JOIN public.programs program ON program.id = project.program_id
    JOIN public.users assignee ON assignee.id = task.assigned_to
    WHERE unit_record.slug = 'november_den'
      AND task.status IN ('todo', 'in_progress', 'blocked')
      AND task.due_at IS NOT NULL
      AND task.due_at > now() - interval '3 days'
      AND task.due_at <= now() + interval '24 hours'
      AND coalesce(assignee.is_active, true) = true
      AND coalesce(assignee.activation_status, 'active') = 'active'
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
    CASE WHEN due.kind = 'overdue' THEN 'Den task overdue' ELSE 'Den task due soon' END,
    due.title
      || coalesce(' — ' || due.program_name, '')
      || CASE WHEN due.kind = 'overdue' THEN '. Was due ' ELSE '. Due ' END
      || to_char(due.due_at AT TIME ZONE 'Africa/Lagos', 'Dy DD Mon, HH24:MI'),
    CASE WHEN due.kind = 'overdue' THEN 'warning' ELSE 'reminder' END,
    'push',
    jsonb_build_object('kind', 'den_task_reminder', 'reminder', due.kind, 'task_id', due.id, 'program_id', due.program_id),
    false
  FROM due
  JOIN claimed ON claimed.task_id = due.id AND claimed.kind = due.kind;

  GET DIAGNOSTICS batch = ROW_COUNT;
  sent := sent + batch;
  RETURN sent;
END;
$$;

-- Run by the scheduler only.
REVOKE ALL ON FUNCTION public.den_send_task_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.den_send_task_reminders() TO service_role;

-- Every 30 minutes. Unscheduling first keeps this migration repeatable.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'tcnp-den-task-reminders';
SELECT cron.schedule(
  'tcnp-den-task-reminders',
  '*/30 * * * *',
  $$SELECT public.den_send_task_reminders();$$
);

NOTIFY pgrst, 'reload schema';
