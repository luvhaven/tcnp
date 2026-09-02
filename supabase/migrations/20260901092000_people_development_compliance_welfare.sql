-- Training, Compliance and Welfare operational workspaces.
-- YouTube assets are stored only as validated video IDs; the app embeds them
-- from youtube-nocookie.com so media bandwidth never passes through Supabase.

ALTER TABLE public.training_schedules ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'all_members';
ALTER TABLE public.training_schedules ADD COLUMN IF NOT EXISTS target_unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL;
ALTER TABLE public.training_schedules ADD COLUMN IF NOT EXISTS session_type text NOT NULL DEFAULT 'training';
ALTER TABLE public.training_schedules ADD COLUMN IF NOT EXISTS broadcast_sent_at timestamptz;
ALTER TABLE public.oscar_documents ADD COLUMN IF NOT EXISTS managed_by_training boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'training_schedules_visibility_check'
      AND conrelid = 'public.training_schedules'::regclass
  ) THEN
    ALTER TABLE public.training_schedules ADD CONSTRAINT training_schedules_visibility_check
      CHECK (visibility IN ('all_members', 'training_unit', 'target_unit', 'invite_only'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'training_schedules_session_type_check'
      AND conrelid = 'public.training_schedules'::regclass
  ) THEN
    ALTER TABLE public.training_schedules ADD CONSTRAINT training_schedules_session_type_check
      CHECK (session_type IN ('training', 'recruitment', 'orientation', 'evaluation', 'briefing'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.training_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  target_unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  visibility text NOT NULL DEFAULT 'all_members',
  status text NOT NULL DEFAULT 'draft',
  estimated_minutes integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_courses_visibility CHECK (visibility IN ('all_members', 'training_unit', 'target_unit', 'invite_only')),
  CONSTRAINT training_courses_status CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT training_courses_duration CHECK (estimated_minutes >= 0)
);

CREATE TABLE IF NOT EXISTS public.training_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.training_courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  youtube_video_id text NOT NULL,
  sort_order integer NOT NULL DEFAULT 1,
  duration_minutes integer NOT NULL DEFAULT 0,
  is_required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_lessons_video_id CHECK (youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
  CONSTRAINT training_lessons_sort_order CHECK (sort_order > 0),
  CONSTRAINT training_lessons_duration CHECK (duration_minutes >= 0),
  CONSTRAINT training_lessons_unique_order UNIQUE (course_id, sort_order)
);

CREATE TABLE IF NOT EXISTS public.training_course_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.training_courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  due_at timestamptz,
  status text NOT NULL DEFAULT 'assigned',
  assigned_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_assignments_status CHECK (status IN ('assigned', 'in_progress', 'completed', 'overdue', 'waived')),
  CONSTRAINT training_assignments_unique UNIQUE (course_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.training_lesson_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.training_lessons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  percent_complete integer NOT NULL DEFAULT 0,
  watched_seconds integer NOT NULL DEFAULT 0,
  video_duration_seconds integer,
  completion_method text,
  completed_at timestamptz,
  last_watched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_progress_percent CHECK (percent_complete BETWEEN 0 AND 100),
  CONSTRAINT training_progress_watched CHECK (watched_seconds >= 0),
  CONSTRAINT training_progress_duration CHECK (video_duration_seconds IS NULL OR video_duration_seconds >= 60),
  CONSTRAINT training_progress_method CHECK (completion_method IS NULL OR completion_method IN ('watch_threshold', 'manager_override')),
  CONSTRAINT training_progress_unique UNIQUE (lesson_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.training_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  training_schedule_id uuid NOT NULL REFERENCES public.training_schedules(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'registered',
  checked_in_at timestamptz,
  checked_in_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_attendance_status CHECK (status IN ('registered', 'present', 'late', 'absent', 'excused')),
  CONSTRAINT training_attendance_unique UNIQUE (training_schedule_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.training_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  member_stage text NOT NULL DEFAULT 'new',
  training_schedule_id uuid REFERENCES public.training_schedules(id) ON DELETE SET NULL,
  evaluator_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  due_at timestamptz,
  submitted_at timestamptz,
  score numeric(5,2),
  feedback text,
  strengths text,
  growth_areas text,
  responses jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_evaluations_stage CHECK (member_stage IN ('new', 'existing')),
  CONSTRAINT training_evaluations_status CHECK (status IN ('draft', 'assigned', 'in_review', 'completed', 'archived')),
  CONSTRAINT training_evaluations_score CHECK (score IS NULL OR score BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS idx_training_courses_status_visibility ON public.training_courses(status, visibility);
CREATE INDEX IF NOT EXISTS idx_training_assignments_user_status ON public.training_course_assignments(user_id, status);
CREATE INDEX IF NOT EXISTS idx_training_progress_user ON public.training_lesson_progress(user_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_training_attendance_schedule ON public.training_attendance(training_schedule_id, status);
CREATE INDEX IF NOT EXISTS idx_training_evaluations_subject ON public.training_evaluations(subject_user_id, status);

CREATE TABLE IF NOT EXISTS public.unit_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  project_type text NOT NULL,
  title text NOT NULL,
  description text,
  program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL,
  venue_id uuid REFERENCES public.theatres(id) ON DELETE SET NULL,
  starts_at timestamptz,
  ends_at timestamptz,
  status text NOT NULL DEFAULT 'planning',
  priority text NOT NULL DEFAULT 'normal',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unit_projects_type CHECK (project_type IN ('year_end_party', 'team_bonding', 'awards', 'visit', 'charity', 'member_support', 'emergency', 'other')),
  CONSTRAINT unit_projects_status CHECK (status IN ('idea', 'planning', 'approved', 'in_progress', 'on_hold', 'completed', 'cancelled')),
  CONSTRAINT unit_projects_priority CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  CONSTRAINT unit_projects_time_order CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);

CREATE TABLE IF NOT EXISTS public.unit_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.unit_projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  assigned_to uuid REFERENCES public.users(id) ON DELETE SET NULL,
  due_at timestamptz,
  status text NOT NULL DEFAULT 'todo',
  completed_at timestamptz,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unit_tasks_status CHECK (status IN ('todo', 'in_progress', 'blocked', 'done', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS public.compliance_award_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.unit_projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compliance_award_categories_status CHECK (status IN ('draft', 'open', 'judging', 'announced', 'closed')),
  CONSTRAINT compliance_award_categories_unique UNIQUE (project_id, name)
);

CREATE TABLE IF NOT EXISTS public.compliance_award_nominees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.compliance_award_categories(id) ON DELETE CASCADE,
  nominee_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  nominee_name text,
  reason text,
  status text NOT NULL DEFAULT 'nominated',
  is_winner boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compliance_award_nominee_identity CHECK (nominee_user_id IS NOT NULL OR nullif(trim(nominee_name), '') IS NOT NULL),
  CONSTRAINT compliance_award_nominee_status CHECK (status IN ('nominated', 'shortlisted', 'winner', 'withdrawn'))
);

CREATE INDEX IF NOT EXISTS idx_unit_projects_unit_status ON public.unit_projects(unit_id, status, starts_at);
CREATE INDEX IF NOT EXISTS idx_unit_tasks_project_status ON public.unit_tasks(project_id, status, due_at);

CREATE TABLE IF NOT EXISTS public.prayer_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'prayer_chain',
  program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL,
  training_schedule_id uuid REFERENCES public.training_schedules(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'Africa/Lagos',
  status text NOT NULL DEFAULT 'draft',
  description text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prayer_campaigns_kind CHECK (kind IN ('event', 'training', 'daily_member', 'prayer_chain')),
  CONSTRAINT prayer_campaigns_status CHECK (status IN ('draft', 'published', 'active', 'completed', 'cancelled')),
  CONSTRAINT prayer_campaigns_time_order CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS public.prayer_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.prayer_campaigns(id) ON DELETE CASCADE,
  label text NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  subject_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  team_name text,
  notes text,
  status text NOT NULL DEFAULT 'scheduled',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prayer_slots_status CHECK (status IN ('scheduled', 'reminded', 'active', 'completed', 'missed')),
  CONSTRAINT prayer_slots_time_order CHECK (end_at > start_at)
);

CREATE TABLE IF NOT EXISTS public.prayer_slot_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL REFERENCES public.prayer_slots(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prayer_slot_members_unique UNIQUE (slot_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.welfare_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_type text NOT NULL,
  title text NOT NULL,
  description text,
  target_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  beneficiary_name text,
  event_at timestamptz,
  status text NOT NULL DEFAULT 'open',
  privacy text NOT NULL DEFAULT 'welfare_only',
  assigned_to uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT welfare_cases_type CHECK (case_type IN ('visit', 'charity', 'member_support', 'emergency')),
  CONSTRAINT welfare_cases_status CHECK (status IN ('open', 'planned', 'in_progress', 'resolved', 'closed', 'cancelled')),
  CONSTRAINT welfare_cases_privacy CHECK (privacy IN ('welfare_only', 'assigned', 'team', 'all_members'))
);

CREATE TABLE IF NOT EXISTS public.welfare_celebrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  celebration_type text NOT NULL,
  target_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  celebrant_name text,
  event_date date NOT NULL,
  title text NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT welfare_celebrations_type CHECK (celebration_type IN ('birthday', 'wedding')),
  CONSTRAINT welfare_celebrations_status CHECK (status IN ('draft', 'scheduled', 'published', 'archived')),
  CONSTRAINT welfare_celebrations_identity CHECK (target_user_id IS NOT NULL OR nullif(trim(celebrant_name), '') IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.welfare_reminder_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  recipient_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  delivery_date date NOT NULL,
  notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT welfare_reminder_deliveries_unique UNIQUE (kind, recipient_id, target_user_id, delivery_date)
);

CREATE INDEX IF NOT EXISTS idx_prayer_campaigns_status_start ON public.prayer_campaigns(status, starts_at);
CREATE INDEX IF NOT EXISTS idx_prayer_slots_member_window ON public.prayer_slots(start_at, end_at, status);
CREATE INDEX IF NOT EXISTS idx_welfare_cases_status_type ON public.welfare_cases(status, case_type, event_at);
CREATE INDEX IF NOT EXISTS idx_welfare_celebrations_publish ON public.welfare_celebrations(status, event_date);

CREATE OR REPLACE FUNCTION public.can_access_training_course(target_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.training_courses course
    JOIN public.users viewer ON viewer.id = auth.uid()
    WHERE course.id = target_course_id
      AND coalesce(viewer.is_active, true) = true
      AND coalesce(viewer.activation_status, 'active') = 'active'
      AND (
        public.can_manage_unit('training')
        OR (
          course.status = 'published'
          AND (
            course.visibility = 'all_members'
            OR (course.visibility = 'training_unit' AND public.is_unit_member('training'))
            OR (course.visibility = 'target_unit' AND course.target_unit_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.unit_memberships membership
              WHERE membership.unit_id = course.target_unit_id
                AND membership.user_id = auth.uid()
                AND membership.status = 'active'
            ))
            OR (course.visibility = 'invite_only' AND EXISTS (
              SELECT 1 FROM public.training_course_assignments assignment
              WHERE assignment.course_id = course.id
                AND assignment.user_id = auth.uid()
                AND assignment.status <> 'waived'
            ))
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_training_course(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_training_course(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.normalize_training_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NOT public.can_manage_unit('training')
    AND NEW.percent_complete < OLD.percent_complete
  THEN
    RAISE EXCEPTION 'Training progress cannot move backwards';
  END IF;
  NEW.completed_at := CASE
    WHEN NEW.percent_complete = 100 THEN coalesce(NEW.completed_at, now())
    ELSE NULL
  END;
  NEW.last_watched_at := coalesce(NEW.last_watched_at, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS training_progress_normalize ON public.training_lesson_progress;
CREATE TRIGGER training_progress_normalize
BEFORE INSERT OR UPDATE ON public.training_lesson_progress
FOR EACH ROW EXECUTE FUNCTION public.normalize_training_progress();

-- Learners report short, real-time watch increments. The server serializes the
-- row, caps each increment by elapsed wall time, and derives completion at 90%
-- of the lesson duration configured by Training.
CREATE OR REPLACE FUNCTION public.record_training_watch(
  target_lesson_id uuid,
  watched_increment_seconds integer
)
RETURNS TABLE (
  percent_complete integer,
  completed_at timestamptz,
  watched_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  configured_minutes integer;
  expected_duration integer;
  accepted_increment integer;
  existing_progress public.training_lesson_progress%ROWTYPE;
  next_watched integer;
  next_percent integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF watched_increment_seconds IS NULL OR watched_increment_seconds < 1 OR watched_increment_seconds > 30 THEN
    RAISE EXCEPTION 'Watch increments must be between 1 and 30 seconds';
  END IF;

  SELECT lesson.duration_minutes
  INTO configured_minutes
  FROM public.training_lessons lesson
  WHERE lesson.id = target_lesson_id
    AND public.can_access_training_course(lesson.course_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lesson is not available to this learner';
  END IF;

  expected_duration := greatest(coalesce(configured_minutes, 0) * 60, 60);

  SELECT * INTO existing_progress
  FROM public.training_lesson_progress progress
  WHERE progress.lesson_id = target_lesson_id AND progress.user_id = auth.uid()
  FOR UPDATE;

  IF FOUND AND existing_progress.percent_complete = 100 THEN
    RETURN QUERY SELECT existing_progress.percent_complete, existing_progress.completed_at, existing_progress.watched_seconds;
    RETURN;
  END IF;

  IF FOUND THEN
    accepted_increment := least(
      watched_increment_seconds,
      30,
      greatest(0, floor(extract(epoch FROM (now() - existing_progress.last_watched_at)))::integer)
    );
    next_watched := least(expected_duration, existing_progress.watched_seconds + accepted_increment);
  ELSE
    accepted_increment := least(watched_increment_seconds, 20);
    next_watched := accepted_increment;
  END IF;

  next_percent := CASE
    WHEN next_watched >= ceil(expected_duration * 0.90) THEN 100
    ELSE least(99, floor(next_watched * 100.0 / expected_duration)::integer)
  END;

  INSERT INTO public.training_lesson_progress (
    lesson_id, user_id, percent_complete, watched_seconds,
    video_duration_seconds, completion_method, completed_at, last_watched_at
  ) VALUES (
    target_lesson_id, auth.uid(), next_percent, next_watched,
    expected_duration,
    CASE WHEN next_percent = 100 THEN 'watch_threshold' ELSE NULL END,
    CASE WHEN next_percent = 100 THEN now() ELSE NULL END,
    now()
  )
  ON CONFLICT (lesson_id, user_id) DO UPDATE
  SET percent_complete = EXCLUDED.percent_complete,
      watched_seconds = EXCLUDED.watched_seconds,
      video_duration_seconds = EXCLUDED.video_duration_seconds,
      completion_method = CASE
        WHEN EXCLUDED.percent_complete = 100 THEN 'watch_threshold'
        ELSE training_lesson_progress.completion_method
      END,
      completed_at = CASE
        WHEN EXCLUDED.percent_complete = 100 THEN coalesce(training_lesson_progress.completed_at, now())
        ELSE training_lesson_progress.completed_at
      END,
      last_watched_at = now(),
      updated_at = now();

  RETURN QUERY
  SELECT progress.percent_complete, progress.completed_at, progress.watched_seconds
  FROM public.training_lesson_progress progress
  WHERE progress.lesson_id = target_lesson_id AND progress.user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.record_training_watch(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_training_watch(uuid, integer) TO authenticated;

-- Subjects receive a masked evaluation feed until the review is complete;
-- assigned evaluators retain the full working record.
CREATE OR REPLACE FUNCTION public.get_my_training_evaluations()
RETURNS TABLE (
  id uuid,
  subject_user_id uuid,
  member_stage text,
  training_schedule_id uuid,
  evaluator_id uuid,
  status text,
  due_at timestamptz,
  submitted_at timestamptz,
  score numeric,
  feedback text,
  strengths text,
  growth_areas text,
  responses jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    evaluation.id,
    evaluation.subject_user_id,
    evaluation.member_stage,
    evaluation.training_schedule_id,
    evaluation.evaluator_id,
    evaluation.status,
    evaluation.due_at,
    CASE
      WHEN evaluation.evaluator_id = auth.uid() OR evaluation.status IN ('completed', 'archived')
      THEN evaluation.submitted_at ELSE NULL
    END,
    CASE
      WHEN evaluation.evaluator_id = auth.uid() OR evaluation.status IN ('completed', 'archived')
      THEN evaluation.score ELSE NULL
    END,
    CASE
      WHEN evaluation.evaluator_id = auth.uid() OR evaluation.status IN ('completed', 'archived')
      THEN evaluation.feedback ELSE NULL
    END,
    CASE
      WHEN evaluation.evaluator_id = auth.uid() OR evaluation.status IN ('completed', 'archived')
      THEN evaluation.strengths ELSE NULL
    END,
    CASE
      WHEN evaluation.evaluator_id = auth.uid() OR evaluation.status IN ('completed', 'archived')
      THEN evaluation.growth_areas ELSE NULL
    END,
    CASE
      WHEN evaluation.evaluator_id = auth.uid() OR evaluation.status IN ('completed', 'archived')
      THEN evaluation.responses
      ELSE jsonb_strip_nulls(jsonb_build_object(
        'reflection', evaluation.responses -> 'reflection',
        'reflection_submitted_at', evaluation.responses -> 'reflection_submitted_at'
      ))
    END,
    evaluation.created_at,
    evaluation.updated_at
  FROM public.training_evaluations evaluation
  JOIN public.users viewer ON viewer.id = auth.uid()
  WHERE (evaluation.subject_user_id = auth.uid() OR evaluation.evaluator_id = auth.uid())
    AND coalesce(viewer.is_active, true) = true
    AND coalesce(viewer.activation_status, 'active') = 'active'
  ORDER BY evaluation.due_at NULLS LAST, evaluation.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_my_training_evaluations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_training_evaluations() TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_training_evaluation_reflection(
  target_evaluation_id uuid,
  reflection_text text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_reflection text := trim(coalesce(reflection_text, ''));
BEGIN
  IF length(normalized_reflection) < 10 OR length(normalized_reflection) > 10000 THEN
    RAISE EXCEPTION 'Reflection must be between 10 and 10000 characters';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.training_evaluations evaluation
    JOIN public.users viewer ON viewer.id = auth.uid()
    WHERE evaluation.id = target_evaluation_id
      AND evaluation.subject_user_id = auth.uid()
      AND evaluation.status IN ('assigned', 'in_review')
      AND coalesce(viewer.is_active, true) = true
      AND coalesce(viewer.activation_status, 'active') = 'active'
  ) THEN
    RAISE EXCEPTION 'This evaluation is not open for your reflection';
  END IF;

  PERFORM set_config('app.training_subject_reflection', '1', true);
  UPDATE public.training_evaluations
  SET responses = coalesce(responses, '{}'::jsonb) || jsonb_build_object(
        'reflection', normalized_reflection,
        'reflection_submitted_at', now()
      ),
      status = 'in_review',
      updated_at = now()
  WHERE id = target_evaluation_id AND subject_user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.submit_training_evaluation_reflection(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_training_evaluation_reflection(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.broadcast_training_schedule(target_schedule_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  schedule_record public.training_schedules%ROWTYPE;
  training_unit_id uuid;
  recipient_ids uuid[];
  target_audience_type text;
  target_audience jsonb;
  announcement_id uuid;
  announcement_body text;
BEGIN
  IF NOT public.can_manage_unit('training') THEN
    RAISE EXCEPTION 'Only Training leadership can broadcast a session';
  END IF;

  SELECT * INTO schedule_record
  FROM public.training_schedules
  WHERE id = target_schedule_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Training session not found';
  END IF;

  SELECT id INTO training_unit_id FROM public.units WHERE slug = 'training' AND is_active = true LIMIT 1;
  IF training_unit_id IS NULL THEN
    RAISE EXCEPTION 'Training unit is not configured';
  END IF;

  target_audience_type := 'all';
  target_audience := jsonb_build_object('training_schedule_id', schedule_record.id);

  IF schedule_record.visibility = 'training_unit' THEN
    target_audience_type := 'unit';
  ELSIF schedule_record.visibility = 'target_unit' THEN
    IF schedule_record.target_unit_id IS NULL THEN
      RAISE EXCEPTION 'Training session has no target unit';
    END IF;
    SELECT array_agg(DISTINCT membership.user_id)
    INTO recipient_ids
    FROM public.unit_memberships membership
    JOIN public.users recipient ON recipient.id = membership.user_id
    WHERE membership.unit_id = schedule_record.target_unit_id
      AND membership.status = 'active'
      AND coalesce(recipient.is_active, true) = true
      AND coalesce(recipient.activation_status, 'active') = 'active';
    target_audience_type := 'users';
  ELSIF schedule_record.visibility = 'invite_only' THEN
    SELECT array_agg(DISTINCT attendance.user_id)
    INTO recipient_ids
    FROM public.training_attendance attendance
    JOIN public.users recipient ON recipient.id = attendance.user_id
    WHERE attendance.training_schedule_id = schedule_record.id
      AND coalesce(recipient.is_active, true) = true
      AND coalesce(recipient.activation_status, 'active') = 'active';
    target_audience_type := 'users';
  END IF;

  IF target_audience_type = 'users' THEN
    IF coalesce(cardinality(recipient_ids), 0) = 0 THEN
      RAISE EXCEPTION 'This training audience has no active recipients';
    END IF;
    target_audience := target_audience || jsonb_build_object('user_ids', to_jsonb(recipient_ids));
  END IF;

  announcement_body := concat_ws(
    ' · ',
    schedule_record.topic,
    schedule_record.session_date::text,
    nullif(schedule_record.start_time::text, ''),
    nullif(schedule_record.location, '')
  );

  INSERT INTO public.announcements (
    unit_id, title, body, category, audience_type, audience, publish_at, created_by
  ) VALUES (
    training_unit_id,
    'Training: ' || schedule_record.topic,
    announcement_body,
    'training',
    target_audience_type,
    target_audience,
    now(),
    auth.uid()
  ) RETURNING id INTO announcement_id;

  UPDATE public.training_schedules
  SET broadcast_sent_at = now(), updated_at = now()
  WHERE id = schedule_record.id;

  RETURN announcement_id;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_training_schedule(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.broadcast_training_schedule(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_training_evaluation_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.responses IS DISTINCT FROM OLD.responses
    AND coalesce(current_setting('app.training_subject_reflection', true), '') <> '1'
  THEN
    RAISE EXCEPTION 'Member reflections are subject-authored and cannot be changed by reviewers';
  END IF;

  IF coalesce(current_setting('app.training_subject_reflection', true), '') = '1' THEN
    IF OLD.subject_user_id IS DISTINCT FROM auth.uid()
      OR NEW.evaluator_id IS DISTINCT FROM OLD.evaluator_id
      OR NEW.subject_user_id IS DISTINCT FROM OLD.subject_user_id
      OR NEW.training_schedule_id IS DISTINCT FROM OLD.training_schedule_id
      OR NEW.member_stage IS DISTINCT FROM OLD.member_stage
      OR NEW.due_at IS DISTINCT FROM OLD.due_at
      OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
      OR NEW.score IS DISTINCT FROM OLD.score
      OR NEW.feedback IS DISTINCT FROM OLD.feedback
      OR NEW.strengths IS DISTINCT FROM OLD.strengths
      OR NEW.growth_areas IS DISTINCT FROM OLD.growth_areas
      OR NEW.status NOT IN ('assigned', 'in_review')
    THEN
      RAISE EXCEPTION 'Subjects may update only their own reflection';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT public.can_manage_unit('training') THEN
    IF OLD.evaluator_id IS DISTINCT FROM auth.uid()
      OR NEW.evaluator_id IS DISTINCT FROM OLD.evaluator_id
      OR NEW.subject_user_id IS DISTINCT FROM OLD.subject_user_id
      OR NEW.training_schedule_id IS DISTINCT FROM OLD.training_schedule_id
      OR NEW.member_stage IS DISTINCT FROM OLD.member_stage
    THEN
      RAISE EXCEPTION 'Assigned evaluators may update only review content and status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS training_evaluations_guard_identity ON public.training_evaluations;
CREATE TRIGGER training_evaluations_guard_identity
BEFORE UPDATE ON public.training_evaluations
FOR EACH ROW EXECUTE FUNCTION public.guard_training_evaluation_identity();

CREATE OR REPLACE FUNCTION public.guard_training_schedule_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.broadcast_sent_at IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.training_attendance attendance WHERE attendance.training_schedule_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.training_evaluations evaluation WHERE evaluation.training_schedule_id = OLD.id)
  THEN
    RAISE EXCEPTION 'Training sessions with broadcasts, attendance or evaluations must remain in history';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS training_schedules_guard_history ON public.training_schedules;
CREATE TRIGGER training_schedules_guard_history
BEFORE DELETE ON public.training_schedules
FOR EACH ROW EXECUTE FUNCTION public.guard_training_schedule_history();

CREATE OR REPLACE FUNCTION public.guard_welfare_case_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_unit('welfare') THEN
    IF OLD.assigned_to IS DISTINCT FROM auth.uid()
      OR NEW.case_type IS DISTINCT FROM OLD.case_type
      OR NEW.target_user_id IS DISTINCT FROM OLD.target_user_id
      OR NEW.beneficiary_name IS DISTINCT FROM OLD.beneficiary_name
      OR NEW.privacy IS DISTINCT FROM OLD.privacy
      OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
    THEN
      RAISE EXCEPTION 'Assigned officers may update only welfare case progress';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS welfare_cases_guard_identity ON public.welfare_cases;
CREATE TRIGGER welfare_cases_guard_identity BEFORE UPDATE ON public.welfare_cases
FOR EACH ROW EXECUTE FUNCTION public.guard_welfare_case_identity();

CREATE OR REPLACE FUNCTION public.guard_prayer_slot_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  campaign_start timestamptz;
  campaign_end timestamptz;
BEGIN
  SELECT starts_at, ends_at INTO campaign_start, campaign_end
  FROM public.prayer_campaigns WHERE id = NEW.campaign_id;
  IF campaign_start IS NULL OR NEW.start_at < campaign_start OR NEW.end_at > campaign_end THEN
    RAISE EXCEPTION 'Prayer slot must stay inside its campaign window';
  END IF;

  IF TG_OP = 'UPDATE' AND EXISTS (
    SELECT 1
    FROM public.prayer_slot_members current_member
    JOIN public.prayer_slot_members other_member ON other_member.user_id = current_member.user_id
    JOIN public.prayer_slots other_slot ON other_slot.id = other_member.slot_id
    WHERE current_member.slot_id = NEW.id
      AND other_slot.id <> NEW.id
      AND tstzrange(other_slot.start_at, other_slot.end_at, '[)')
          && tstzrange(NEW.start_at, NEW.end_at, '[)')
  ) THEN
    RAISE EXCEPTION 'A member cannot be scheduled for overlapping prayer slots';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prayer_slots_guard_window ON public.prayer_slots;
CREATE TRIGGER prayer_slots_guard_window BEFORE INSERT OR UPDATE ON public.prayer_slots
FOR EACH ROW EXECUTE FUNCTION public.guard_prayer_slot_window();

CREATE OR REPLACE FUNCTION public.guard_prayer_member_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_start timestamptz;
  target_end timestamptz;
BEGIN
  SELECT start_at, end_at INTO target_start, target_end
  FROM public.prayer_slots WHERE id = NEW.slot_id;
  IF EXISTS (
    SELECT 1
    FROM public.prayer_slot_members other_member
    JOIN public.prayer_slots other_slot ON other_slot.id = other_member.slot_id
    WHERE other_member.user_id = NEW.user_id
      AND other_member.slot_id <> NEW.slot_id
      AND tstzrange(other_slot.start_at, other_slot.end_at, '[)')
          && tstzrange(target_start, target_end, '[)')
  ) THEN
    RAISE EXCEPTION 'This officer already has an overlapping prayer watch';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prayer_slot_members_guard_overlap ON public.prayer_slot_members;
CREATE TRIGGER prayer_slot_members_guard_overlap
BEFORE INSERT OR UPDATE ON public.prayer_slot_members
FOR EACH ROW EXECUTE FUNCTION public.guard_prayer_member_overlap();

CREATE OR REPLACE FUNCTION public.get_today_birthdays()
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  phone text,
  photo_url text,
  oscar text,
  team text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.full_name, u.email, u.phone, u.photo_url, u.oscar, u.team
  FROM public.users u
  WHERE coalesce(u.is_active, true) = true
    AND coalesce(u.activation_status, 'active') = 'active'
    AND u.date_of_birth IS NOT NULL
    AND extract(month FROM u.date_of_birth) = extract(month FROM (now() AT TIME ZONE 'Africa/Lagos'))
    AND extract(day FROM u.date_of_birth) = extract(day FROM (now() AT TIME ZONE 'Africa/Lagos'))
    AND public.can_manage_unit('welfare');
$$;

GRANT EXECUTE ON FUNCTION public.get_today_birthdays() TO authenticated;

-- Updated-at triggers.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'training_courses', 'training_lessons', 'training_course_assignments',
    'training_lesson_progress', 'training_attendance', 'training_evaluations',
    'unit_projects', 'unit_tasks', 'compliance_award_categories',
    'compliance_award_nominees', 'prayer_campaigns', 'prayer_slots',
    'welfare_cases', 'welfare_celebrations'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_set_updated_at ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      table_name, table_name
    );
  END LOOP;
END $$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'training_courses', 'training_lessons', 'training_course_assignments',
    'training_lesson_progress', 'training_attendance', 'training_evaluations',
    'unit_projects', 'unit_tasks', 'compliance_award_categories',
    'compliance_award_nominees', 'prayer_campaigns', 'prayer_slots',
    'prayer_slot_members', 'welfare_cases', 'welfare_celebrations',
    'welfare_reminder_deliveries'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

-- Training visibility and contribution policies.
DROP POLICY IF EXISTS training_courses_scoped_select ON public.training_courses;
CREATE POLICY training_courses_scoped_select ON public.training_courses FOR SELECT TO authenticated
USING (public.can_access_training_course(id));
DROP POLICY IF EXISTS training_courses_manage ON public.training_courses;
CREATE POLICY training_courses_manage ON public.training_courses FOR INSERT TO authenticated
WITH CHECK (public.can_manage_unit('training'));
DROP POLICY IF EXISTS training_courses_update ON public.training_courses;
CREATE POLICY training_courses_update ON public.training_courses FOR UPDATE TO authenticated
USING (public.can_manage_unit('training')) WITH CHECK (public.can_manage_unit('training'));

DROP POLICY IF EXISTS training_lessons_scoped_select ON public.training_lessons;
CREATE POLICY training_lessons_scoped_select ON public.training_lessons FOR SELECT TO authenticated
USING (public.can_access_training_course(course_id));
DROP POLICY IF EXISTS training_lessons_manage ON public.training_lessons;
CREATE POLICY training_lessons_manage ON public.training_lessons FOR INSERT TO authenticated
WITH CHECK (public.can_manage_unit('training'));
DROP POLICY IF EXISTS training_lessons_update ON public.training_lessons;
CREATE POLICY training_lessons_update ON public.training_lessons FOR UPDATE TO authenticated
USING (public.can_manage_unit('training')) WITH CHECK (public.can_manage_unit('training'));

DROP POLICY IF EXISTS training_assignments_scoped_select ON public.training_course_assignments;
CREATE POLICY training_assignments_scoped_select ON public.training_course_assignments FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.can_manage_unit('training'));
DROP POLICY IF EXISTS training_assignments_manage ON public.training_course_assignments;
CREATE POLICY training_assignments_manage ON public.training_course_assignments FOR INSERT TO authenticated
WITH CHECK (public.can_manage_unit('training'));
DROP POLICY IF EXISTS training_assignments_update ON public.training_course_assignments;
CREATE POLICY training_assignments_update ON public.training_course_assignments FOR UPDATE TO authenticated
USING (public.can_manage_unit('training')) WITH CHECK (public.can_manage_unit('training'));

DROP POLICY IF EXISTS training_progress_scoped_select ON public.training_lesson_progress;
CREATE POLICY training_progress_scoped_select ON public.training_lesson_progress FOR SELECT TO authenticated
USING (
  public.can_manage_unit('training')
  OR (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.training_lessons lesson
      WHERE lesson.id = training_lesson_progress.lesson_id
        AND public.can_access_training_course(lesson.course_id)
    )
  )
);
DROP POLICY IF EXISTS training_progress_own_write ON public.training_lesson_progress;
CREATE POLICY training_progress_own_write ON public.training_lesson_progress FOR INSERT TO authenticated
WITH CHECK (public.can_manage_unit('training'));
DROP POLICY IF EXISTS training_progress_update ON public.training_lesson_progress;
CREATE POLICY training_progress_update ON public.training_lesson_progress FOR UPDATE TO authenticated
USING (public.can_manage_unit('training'))
WITH CHECK (public.can_manage_unit('training'));

DROP POLICY IF EXISTS training_attendance_scoped_select ON public.training_attendance;
CREATE POLICY training_attendance_scoped_select ON public.training_attendance FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.can_manage_unit('training'));
DROP POLICY IF EXISTS training_attendance_contribute ON public.training_attendance;
DROP POLICY IF EXISTS training_attendance_manage_insert ON public.training_attendance;
CREATE POLICY training_attendance_manage_insert ON public.training_attendance FOR INSERT TO authenticated
WITH CHECK (public.can_manage_unit('training'));
DROP POLICY IF EXISTS training_attendance_manage_update ON public.training_attendance;
CREATE POLICY training_attendance_manage_update ON public.training_attendance FOR UPDATE TO authenticated
USING (public.can_manage_unit('training')) WITH CHECK (public.can_manage_unit('training'));

DROP POLICY IF EXISTS training_evaluations_scoped_select ON public.training_evaluations;
CREATE POLICY training_evaluations_scoped_select ON public.training_evaluations FOR SELECT TO authenticated
USING (
  evaluator_id = auth.uid()
  OR public.can_manage_unit('training')
  OR (subject_user_id = auth.uid() AND status IN ('completed', 'archived'))
);
DROP POLICY IF EXISTS training_evaluations_scoped_write ON public.training_evaluations;
CREATE POLICY training_evaluations_scoped_write ON public.training_evaluations FOR INSERT TO authenticated
WITH CHECK (public.can_manage_unit('training'));
DROP POLICY IF EXISTS training_evaluations_update ON public.training_evaluations;
CREATE POLICY training_evaluations_update ON public.training_evaluations FOR UPDATE TO authenticated
USING (evaluator_id = auth.uid() OR public.can_manage_unit('training'))
WITH CHECK (evaluator_id = auth.uid() OR public.can_manage_unit('training'));

-- Replace any legacy broad schedule-read policies so Training-unit and invited
-- sessions are actually closed at the database boundary, not merely hidden in
-- the interface. The scoped manager policy below replaces legacy ALL policies.
DO $$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'training_schedules'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.training_schedules', policy_record.policyname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS training_schedules_scoped_select ON public.training_schedules;
CREATE POLICY training_schedules_scoped_select ON public.training_schedules FOR SELECT TO authenticated
USING (
  public.can_manage_unit('training')
  OR visibility = 'all_members'
  OR (visibility = 'training_unit' AND public.is_unit_member('training'))
  OR (visibility = 'target_unit' AND target_unit_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.unit_memberships m
    WHERE m.unit_id = training_schedules.target_unit_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
  ))
  OR (visibility = 'invite_only' AND EXISTS (
    SELECT 1 FROM public.training_attendance attendance
    WHERE attendance.training_schedule_id = training_schedules.id
      AND attendance.user_id = auth.uid()
  ))
);

DROP POLICY IF EXISTS training_schedule_head_manage ON public.training_schedules;
CREATE POLICY training_schedule_head_manage ON public.training_schedules FOR ALL TO authenticated
USING (public.can_manage_unit('training')) WITH CHECK (public.can_manage_unit('training'));
DROP POLICY IF EXISTS oscar_documents_training_head_manage ON public.oscar_documents;
DROP POLICY IF EXISTS "Admins can manage documents" ON public.oscar_documents;
DROP POLICY IF EXISTS oscar_documents_platform_manage ON public.oscar_documents;
CREATE POLICY oscar_documents_platform_manage ON public.oscar_documents FOR ALL TO authenticated
USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE POLICY oscar_documents_training_head_manage ON public.oscar_documents FOR ALL TO authenticated
USING (managed_by_training = true AND public.can_manage_unit('training'))
WITH CHECK (managed_by_training = true AND public.can_manage_unit('training'));

-- Shared project/task policies (Compliance, Welfare, and future units).
DROP POLICY IF EXISTS unit_projects_authenticated_select ON public.unit_projects;
CREATE POLICY unit_projects_authenticated_select ON public.unit_projects FOR SELECT TO authenticated
USING (
  public.is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM public.units unit_record
    WHERE unit_record.id = unit_projects.unit_id
      AND public.is_unit_member(unit_record.slug)
  )
);
DROP POLICY IF EXISTS unit_projects_scoped_manage ON public.unit_projects;
CREATE POLICY unit_projects_scoped_manage ON public.unit_projects FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.units u WHERE u.id = unit_projects.unit_id AND public.can_manage_unit(u.slug)));
DROP POLICY IF EXISTS unit_projects_scoped_update ON public.unit_projects;
CREATE POLICY unit_projects_scoped_update ON public.unit_projects FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.units u WHERE u.id = unit_projects.unit_id AND public.can_manage_unit(u.slug)))
WITH CHECK (EXISTS (SELECT 1 FROM public.units u WHERE u.id = unit_projects.unit_id AND public.can_manage_unit(u.slug)));

DROP POLICY IF EXISTS unit_tasks_authenticated_select ON public.unit_tasks;
CREATE POLICY unit_tasks_authenticated_select ON public.unit_tasks FOR SELECT TO authenticated
USING (
  assigned_to = auth.uid() OR public.is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM public.unit_projects project
    JOIN public.units unit_record ON unit_record.id = project.unit_id
    WHERE project.id = unit_tasks.project_id
      AND public.is_unit_member(unit_record.slug)
  )
);
DROP POLICY IF EXISTS unit_tasks_scoped_manage ON public.unit_tasks;
CREATE POLICY unit_tasks_scoped_manage ON public.unit_tasks FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.unit_projects p JOIN public.units u ON u.id = p.unit_id
  WHERE p.id = unit_tasks.project_id AND public.can_manage_unit(u.slug)
));
DROP POLICY IF EXISTS unit_tasks_scoped_update ON public.unit_tasks;
CREATE POLICY unit_tasks_scoped_update ON public.unit_tasks FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.unit_projects p JOIN public.units u ON u.id = p.unit_id
  WHERE p.id = unit_tasks.project_id AND public.can_manage_unit(u.slug)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.unit_projects p JOIN public.units u ON u.id = p.unit_id
  WHERE p.id = unit_tasks.project_id AND public.can_manage_unit(u.slug)
));

DROP POLICY IF EXISTS award_categories_authenticated_select ON public.compliance_award_categories;
CREATE POLICY award_categories_authenticated_select ON public.compliance_award_categories FOR SELECT TO authenticated
USING (public.is_platform_admin() OR public.is_unit_member('compliance') OR status IN ('announced', 'closed'));
DROP POLICY IF EXISTS award_categories_compliance_manage ON public.compliance_award_categories;
CREATE POLICY award_categories_compliance_manage ON public.compliance_award_categories FOR ALL TO authenticated
USING (public.can_manage_unit('compliance')) WITH CHECK (public.can_manage_unit('compliance'));
DROP POLICY IF EXISTS award_nominees_authenticated_select ON public.compliance_award_nominees;
CREATE POLICY award_nominees_authenticated_select ON public.compliance_award_nominees FOR SELECT TO authenticated
USING (
  public.is_platform_admin() OR public.is_unit_member('compliance')
  OR (
    is_winner = true AND EXISTS (
      SELECT 1 FROM public.compliance_award_categories category
      WHERE category.id = compliance_award_nominees.category_id
        AND category.status IN ('announced', 'closed')
    )
  )
);
DROP POLICY IF EXISTS award_nominees_compliance_manage ON public.compliance_award_nominees;
CREATE POLICY award_nominees_compliance_manage ON public.compliance_award_nominees FOR ALL TO authenticated
USING (public.can_manage_unit('compliance')) WITH CHECK (public.can_manage_unit('compliance'));

-- Welfare schedules are visible team-wide; private support cases are not.
DROP POLICY IF EXISTS prayer_campaigns_authenticated_select ON public.prayer_campaigns;
CREATE POLICY prayer_campaigns_authenticated_select ON public.prayer_campaigns FOR SELECT TO authenticated
USING (public.is_platform_admin() OR public.is_unit_member('welfare') OR status IN ('published', 'active', 'completed'));
DROP POLICY IF EXISTS prayer_campaigns_welfare_manage ON public.prayer_campaigns;
CREATE POLICY prayer_campaigns_welfare_manage ON public.prayer_campaigns FOR ALL TO authenticated
USING (public.can_manage_unit('welfare')) WITH CHECK (public.can_manage_unit('welfare'));
DROP POLICY IF EXISTS prayer_slots_authenticated_select ON public.prayer_slots;
CREATE POLICY prayer_slots_authenticated_select ON public.prayer_slots FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.prayer_campaigns campaign WHERE campaign.id = prayer_slots.campaign_id));
DROP POLICY IF EXISTS prayer_slots_welfare_manage ON public.prayer_slots;
CREATE POLICY prayer_slots_welfare_manage ON public.prayer_slots FOR ALL TO authenticated
USING (public.can_manage_unit('welfare')) WITH CHECK (public.can_manage_unit('welfare'));
DROP POLICY IF EXISTS prayer_slot_members_authenticated_select ON public.prayer_slot_members;
CREATE POLICY prayer_slot_members_authenticated_select ON public.prayer_slot_members FOR SELECT TO authenticated
USING (
  user_id = auth.uid() OR public.is_platform_admin() OR public.is_unit_member('welfare')
  OR EXISTS (
    SELECT 1 FROM public.prayer_slots slot
    JOIN public.prayer_campaigns campaign ON campaign.id = slot.campaign_id
    WHERE slot.id = prayer_slot_members.slot_id
      AND campaign.status IN ('published', 'active', 'completed')
  )
);
DROP POLICY IF EXISTS prayer_slot_members_welfare_manage ON public.prayer_slot_members;
CREATE POLICY prayer_slot_members_welfare_manage ON public.prayer_slot_members FOR ALL TO authenticated
USING (public.can_manage_unit('welfare')) WITH CHECK (public.can_manage_unit('welfare'));

DROP POLICY IF EXISTS welfare_cases_scoped_select ON public.welfare_cases;
CREATE POLICY welfare_cases_scoped_select ON public.welfare_cases FOR SELECT TO authenticated
USING (
  public.is_platform_admin() OR public.can_manage_unit('welfare')
  OR target_user_id = auth.uid() OR assigned_to = auth.uid() OR created_by = auth.uid()
  OR privacy = 'all_members'
  OR (privacy = 'welfare_only' AND public.is_unit_member('welfare'))
  OR (privacy = 'team' AND target_user_id IN (
    SELECT target.id FROM public.users target
    JOIN public.users viewer ON viewer.id = auth.uid()
    WHERE target.id = welfare_cases.target_user_id
      AND viewer.team IS NOT NULL
      AND target.team = viewer.team
  ))
);
DROP POLICY IF EXISTS welfare_cases_scoped_manage ON public.welfare_cases;
CREATE POLICY welfare_cases_scoped_manage ON public.welfare_cases FOR INSERT TO authenticated
WITH CHECK (public.can_manage_unit('welfare'));
DROP POLICY IF EXISTS welfare_cases_manager_update ON public.welfare_cases;
CREATE POLICY welfare_cases_manager_update ON public.welfare_cases FOR UPDATE TO authenticated
USING (public.can_manage_unit('welfare')) WITH CHECK (public.can_manage_unit('welfare'));
DROP POLICY IF EXISTS welfare_cases_assignee_update ON public.welfare_cases;
CREATE POLICY welfare_cases_assignee_update ON public.welfare_cases FOR UPDATE TO authenticated
USING (assigned_to = auth.uid()) WITH CHECK (assigned_to = auth.uid());

DROP POLICY IF EXISTS welfare_celebrations_scoped_select ON public.welfare_celebrations;
CREATE POLICY welfare_celebrations_scoped_select ON public.welfare_celebrations FOR SELECT TO authenticated
USING (status = 'published' OR target_user_id = auth.uid() OR public.is_unit_member('welfare') OR public.is_platform_admin());
DROP POLICY IF EXISTS welfare_celebrations_manage ON public.welfare_celebrations;
CREATE POLICY welfare_celebrations_manage ON public.welfare_celebrations FOR ALL TO authenticated
USING (public.can_manage_unit('welfare')) WITH CHECK (public.can_manage_unit('welfare'));

DROP POLICY IF EXISTS welfare_reminder_deliveries_manage ON public.welfare_reminder_deliveries;
CREATE POLICY welfare_reminder_deliveries_manage ON public.welfare_reminder_deliveries FOR SELECT TO authenticated
USING (recipient_id = auth.uid() OR public.can_manage_unit('welfare'));

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.training_courses,
  public.training_lessons,
  public.training_course_assignments,
  public.training_lesson_progress,
  public.training_attendance,
  public.training_evaluations,
  public.unit_projects,
  public.unit_tasks,
  public.compliance_award_categories,
  public.compliance_award_nominees,
  public.prayer_campaigns,
  public.prayer_slots,
  public.prayer_slot_members,
  public.welfare_cases,
  public.welfare_celebrations,
  public.welfare_reminder_deliveries
TO authenticated;
