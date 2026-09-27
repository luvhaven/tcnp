-- Harden DO mission acceptance, assignment replacement, and post-op reports.

-- A DO may only accept or reject their own pending assignment. All other
-- assignment edits are performed by the atomic, role-checked RPC below.
DROP POLICY IF EXISTS "DOs can update own assignment status" ON public.journey_duty_officers;
DROP POLICY IF EXISTS "Admins can update DO assignments" ON public.journey_duty_officers;
CREATE POLICY "DOs can respond to own pending assignment"
  ON public.journey_duty_officers FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND coalesce(status, 'acknowledged') = 'pending')
  WITH CHECK (user_id = auth.uid() AND status IN ('acknowledged', 'rejected'));
CREATE POLICY "Admins can update DO assignments"
  ON public.journey_duty_officers FOR UPDATE TO authenticated
  USING (has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','head_of_command','head_of_operations','command','hod','hop']::text[]))
  WITH CHECK (has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','head_of_command','head_of_operations','command','hod','hop']::text[]));

CREATE OR REPLACE FUNCTION public.guard_do_assignment_response()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF auth.uid() = OLD.user_id AND NOT has_any_role(ARRAY[
    'super_admin','dev_admin','admin','captain','vice_captain',
    'head_of_command','head_of_operations','command','hod','hop'
  ]::text[]) THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.journey_id IS DISTINCT FROM OLD.journey_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.is_lead IS DISTINCT FROM OLD.is_lead
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR coalesce(OLD.status, 'acknowledged') <> 'pending'
      OR NEW.status NOT IN ('acknowledged', 'rejected') THEN
      RAISE EXCEPTION 'Only a pending assignment response may be changed';
    END IF;
    IF NEW.status = 'acknowledged' THEN
      NEW.acknowledged_at := coalesce(NEW.acknowledged_at, now());
    ELSE
      NEW.acknowledged_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_do_assignment_response ON public.journey_duty_officers;
CREATE TRIGGER trg_guard_do_assignment_response
  BEFORE UPDATE ON public.journey_duty_officers
  FOR EACH ROW EXECUTE FUNCTION public.guard_do_assignment_response();

-- Restrict journey edits to operational administrators or active/pending DOs;
-- the shared helper intentionally excludes rejected assignments.
DROP POLICY IF EXISTS "journeys_update_role_scoped" ON public.journeys;
CREATE POLICY "journeys_update_role_scoped" ON public.journeys
  FOR UPDATE TO authenticated
  USING (
    has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','head_of_command','head_of_operations','command','hod','hop']::text[])
    OR public.is_assigned_do_for_journey(id)
  )
  WITH CHECK (
    has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','head_of_command','head_of_operations','command','hod','hop']::text[])
    OR public.is_assigned_do_for_journey(id)
  );

-- Reassignment is one database transaction: validation/insert errors roll back
-- the deletes, and each non-empty team must have exactly one lead.
CREATE OR REPLACE FUNCTION public.replace_journey_duty_officers(
  target_journey_id uuid,
  assignments jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_role text;
  assignment_count integer;
  lead_count integer;
BEGIN
  SELECT role::text INTO caller_role FROM public.users
    WHERE id = auth.uid() AND coalesce(is_active, true)
      AND coalesce(activation_status, 'active') = 'active';
  IF caller_role IS NULL OR caller_role <> ALL(ARRAY[
    'super_admin','dev_admin','admin','captain','vice_captain',
    'head_of_operations','head_of_command','command','hod','hop'
  ]) THEN
    RAISE EXCEPTION 'Not authorized to assign duty officers' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.journeys WHERE id = target_journey_id) THEN
    RAISE EXCEPTION 'Journey not found' USING ERRCODE = 'P0002';
  END IF;
  IF jsonb_typeof(assignments) <> 'array' THEN
    RAISE EXCEPTION 'assignments must be an array';
  END IF;

  assignment_count := jsonb_array_length(assignments);
  SELECT count(*) INTO lead_count FROM jsonb_array_elements(assignments) entry
    WHERE coalesce((entry->>'is_lead')::boolean, false);
  IF assignment_count > 0 AND lead_count <> 1 THEN
    RAISE EXCEPTION 'Exactly one duty officer must be marked as team lead';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(assignments) entry
      GROUP BY entry->>'user_id' HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'A duty officer cannot be assigned more than once';
  END IF;

  DELETE FROM public.journey_duty_officers WHERE journey_id = target_journey_id;
  INSERT INTO public.journey_duty_officers (journey_id, user_id, is_lead, status, acknowledged_at)
  SELECT target_journey_id, (entry->>'user_id')::uuid,
    coalesce((entry->>'is_lead')::boolean, false),
    CASE WHEN (entry->>'user_id')::uuid = auth.uid() THEN 'acknowledged' ELSE 'pending' END,
    CASE WHEN (entry->>'user_id')::uuid = auth.uid() THEN now() ELSE NULL END
  FROM jsonb_array_elements(assignments) entry;

  UPDATE public.journeys
    SET assigned_duty_officer_id = (
          SELECT user_id FROM public.journey_duty_officers
          WHERE journey_id = target_journey_id AND is_lead LIMIT 1
        ),
        assigned_do_id = (
          SELECT user_id FROM public.journey_duty_officers
          WHERE journey_id = target_journey_id AND is_lead LIMIT 1
        )
    WHERE id = target_journey_id;
END;
$$;
REVOKE ALL ON FUNCTION public.replace_journey_duty_officers(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_journey_duty_officers(uuid, jsonb) TO authenticated;

-- Report content can include sensitive wellbeing/incident/expense details.
DROP POLICY IF EXISTS "Authenticated can read feedback" ON public.do_feedback_forms;
DROP POLICY IF EXISTS "feedback_delta_insert" ON public.do_feedback_forms;
DROP POLICY IF EXISTS "DOs can insert feedback" ON public.do_feedback_forms;
CREATE POLICY "DOs can read own feedback; admins can read all"
  ON public.do_feedback_forms FOR SELECT TO authenticated
  USING (submitted_by = auth.uid() OR public.is_platform_admin());
CREATE POLICY "Assigned DOs can submit completed journey feedback"
  ON public.do_feedback_forms FOR INSERT TO authenticated
  WITH CHECK (
    submitted_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.journeys journey
      WHERE journey.id = journey_id
        AND journey.status::text = 'completed'
        AND public.is_assigned_do_for_journey(journey.id)
    )
  );
