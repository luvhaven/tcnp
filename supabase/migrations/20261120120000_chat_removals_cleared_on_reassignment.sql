-- An explicit admin or lead action that puts an officer on a programme or a
-- Papa restores their chat room access, even after they were removed from
-- that room.
--
-- Bug: an admin removed an officer from the programme chat, then assigned
-- them a programme title on the Officers page. The chat_room_removals row
-- (20261031121000) still overrode the new assignment, so the officer stayed
-- out of the chat. Assigning the same title again failed with a duplicate key
-- ("That already exists"), because assign_title deactivated the row and then
-- inserted an identical (user, title, programme) row.
--
-- Rule (one rule, enforced in the database so every path follows it):
--   * A title assignment that becomes active for a programme (insert,
--     re-activation, or a change of programme or officer) clears the
--     officer's removal from that programme's room.
--   * An officer newly made Duty Officer on a live journey (lead columns on
--     journeys, or a journey_duty_officers row that is new or moves out of
--     "rejected") has their removals cleared for that journey's Papa rooms
--     (journeys.papa_id and journey_papas) and the programme room.
--   * The officer's own actions never clear a removal: answering an
--     availability request is not touched, and every trigger skips rows the
--     officer changes themselves (accepting or rejecting a DO assignment).
--   * Linking a Papa to a journey (papa_id or journey_papas) does not clear
--     anything: the journey form rewrites those links on every save, so it is
--     not a decision to put a particular officer on a Papa.
--
-- assign_title now re-activates the existing (user, title, programme) row
-- instead of inserting a duplicate, and replace_journey_duty_officers now
-- keeps unchanged duty rows (their status, acknowledgement and notification)
-- instead of deleting and re-inserting every officer on each save. Without
-- that, every journey save would look like a new DO assignment and undo any
-- chat removal for that journey's officers.
--
-- Backfill: removals older than an active programme title assignment or a DO
-- duty row for the same room are deleted.

-- 1. Helper: clear an officer's removals for a journey's rooms.
CREATE OR REPLACE FUNCTION public.clear_journey_chat_removals(target_user uuid, target_journey uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  journey_program uuid;
  journey_papa uuid;
BEGIN
  IF target_user IS NULL OR target_journey IS NULL THEN RETURN; END IF;
  SELECT j.program_id, j.papa_id INTO journey_program, journey_papa
  FROM public.journeys j
  WHERE j.id = target_journey
    AND coalesce(j.is_deleted, false) = false
    AND j.status::text <> 'cancelled';
  IF NOT FOUND OR journey_program IS NULL THEN RETURN; END IF;

  DELETE FROM public.chat_room_removals removal
  WHERE removal.user_id = target_user
    AND removal.program_id = journey_program
    AND (
      removal.papa_id IS NULL
      OR removal.papa_id = journey_papa
      OR removal.papa_id IN (SELECT jp.papa_id FROM public.journey_papas jp WHERE jp.journey_id = target_journey)
    );
END;
$$;

-- 2. Title assignments -> programme room.
CREATE OR REPLACE FUNCTION public.chat_removals_clear_on_title_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.program_id IS NULL OR NEW.is_active IS DISTINCT FROM true THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE'
    AND OLD.is_active IS TRUE
    AND OLD.program_id IS NOT DISTINCT FROM NEW.program_id
    AND OLD.user_id = NEW.user_id THEN
    RETURN NULL;
  END IF;
  -- The officer's own action never lifts a removal.
  IF auth.uid() IS NOT DISTINCT FROM NEW.user_id THEN RETURN NULL; END IF;

  DELETE FROM public.chat_room_removals removal
  WHERE removal.user_id = NEW.user_id
    AND removal.program_id = NEW.program_id
    AND removal.papa_id IS NULL;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS title_assignments_clear_chat_removals ON public.title_assignments;
CREATE TRIGGER title_assignments_clear_chat_removals
  AFTER INSERT OR UPDATE OF is_active, program_id, user_id ON public.title_assignments
  FOR EACH ROW EXECUTE FUNCTION public.chat_removals_clear_on_title_assignment();

-- 3. Lead DO columns on journeys.
CREATE OR REPLACE FUNCTION public.chat_removals_clear_on_journey_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  officer uuid;
BEGIN
  FOR officer IN
    SELECT DISTINCT candidate FROM unnest(ARRAY[NEW.assigned_duty_officer_id, NEW.assigned_do_id]) AS candidate
    WHERE candidate IS NOT NULL
  LOOP
    -- Already a lead DO on this journey: nothing new.
    IF TG_OP = 'UPDATE' AND officer IN (OLD.assigned_duty_officer_id, OLD.assigned_do_id) THEN CONTINUE; END IF;
    -- Already on the journey's duty team (a member promoted to lead): nothing new.
    -- A row inserted in this same action already cleared the removal itself.
    IF EXISTS (
      SELECT 1 FROM public.journey_duty_officers d
      WHERE d.journey_id = NEW.id AND d.user_id = officer AND coalesce(d.status, '') <> 'rejected'
    ) THEN CONTINUE; END IF;
    IF auth.uid() IS NOT DISTINCT FROM officer THEN CONTINUE; END IF;
    PERFORM public.clear_journey_chat_removals(officer, NEW.id);
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS journeys_clear_chat_removals ON public.journeys;
CREATE TRIGGER journeys_clear_chat_removals
  AFTER INSERT OR UPDATE OF assigned_duty_officer_id, assigned_do_id ON public.journeys
  FOR EACH ROW EXECUTE FUNCTION public.chat_removals_clear_on_journey_lead();

-- 4. journey_duty_officers rows.
CREATE OR REPLACE FUNCTION public.chat_removals_clear_on_duty_officer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF coalesce(NEW.status, '') = 'rejected' THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE'
    AND coalesce(OLD.status, '') <> 'rejected'
    AND OLD.user_id = NEW.user_id
    AND OLD.journey_id = NEW.journey_id THEN
    RETURN NULL;
  END IF;
  -- Accepting or answering one's own assignment never lifts a removal.
  IF auth.uid() IS NOT DISTINCT FROM NEW.user_id THEN RETURN NULL; END IF;
  -- Already the journey's lead DO: nothing new.
  IF EXISTS (
    SELECT 1 FROM public.journeys j
    WHERE j.id = NEW.journey_id
      AND NEW.user_id IN (j.assigned_duty_officer_id, j.assigned_do_id)
  ) THEN RETURN NULL; END IF;
  PERFORM public.clear_journey_chat_removals(NEW.user_id, NEW.journey_id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS journey_duty_officers_clear_chat_removals ON public.journey_duty_officers;
CREATE TRIGGER journey_duty_officers_clear_chat_removals
  AFTER INSERT OR UPDATE OF status, user_id, journey_id ON public.journey_duty_officers
  FOR EACH ROW EXECUTE FUNCTION public.chat_removals_clear_on_duty_officer();

REVOKE ALL ON FUNCTION public.clear_journey_chat_removals(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_journey_chat_removals(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.chat_removals_clear_on_title_assignment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_removals_clear_on_journey_lead() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_removals_clear_on_duty_officer() FROM PUBLIC, anon, authenticated;

-- 5. assign_title: re-activate the existing (user, title, programme) row.
-- title_assignments has UNIQUE (user_id, title_id, program_id). The previous
-- body deactivated the row and inserted an identical one, which failed with
-- 23505 for any programme title the officer had held before. Programme-less
-- rows (NULL program_id) never conflict, so they keep inserting as before.
CREATE OR REPLACE FUNCTION public.assign_title(p_user_id uuid, p_title_code text, p_program_id uuid DEFAULT NULL::uuid, p_assigned_by uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_title_id UUID;
  v_assignment_id UUID;
  v_is_fixed BOOLEAN;
  v_max_positions INTEGER;
  v_current_count INTEGER;
  v_unit TEXT;
BEGIN
  IF NOT public.is_trusted_backend() THEN
    IF NOT public.is_platform_admin() THEN
      RAISE EXCEPTION 'Only platform administrators can assign titles' USING ERRCODE = '42501';
    END IF;
    -- Attribution comes from the session, not the payload.
    p_assigned_by := auth.uid();
  END IF;

  SELECT id, is_fixed, max_positions, unit
  INTO v_title_id, v_is_fixed, v_max_positions, v_unit
  FROM official_titles
  WHERE code = p_title_code;

  IF v_title_id IS NULL THEN
    RAISE EXCEPTION 'Title % not found', p_title_code;
  END IF;

  UPDATE title_assignments
  SET is_active = false
  WHERE user_id = p_user_id
    AND is_active = true
    AND (
      (p_program_id IS NULL AND program_id IS NULL)
      OR (p_program_id IS NOT NULL AND program_id = p_program_id)
    );

  IF v_is_fixed THEN
    SELECT COUNT(*) INTO v_current_count
    FROM title_assignments
    WHERE title_id = v_title_id
      AND is_active = true
      AND user_id != p_user_id
      AND (
        (p_program_id IS NULL AND program_id IS NULL)
        OR (p_program_id IS NOT NULL AND program_id = p_program_id)
      );

    IF v_current_count > 0 THEN
      RAISE EXCEPTION 'Title % is fixed and already assigned to another officer', p_title_code;
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_current_count
  FROM title_assignments
  WHERE title_id = v_title_id
    AND is_active = true
    AND user_id != p_user_id
    AND (
      (p_program_id IS NULL AND program_id IS NULL)
      OR (p_program_id IS NOT NULL AND program_id = p_program_id)
    );

  IF v_current_count >= v_max_positions THEN
    RAISE EXCEPTION 'Maximum positions (%) reached for title %', v_max_positions, p_title_code;
  END IF;

  INSERT INTO title_assignments (user_id, title_id, program_id, assigned_by, is_active)
  VALUES (p_user_id, v_title_id, p_program_id, p_assigned_by, true)
  ON CONFLICT (user_id, title_id, program_id) DO UPDATE
    SET is_active = true,
        assigned_by = EXCLUDED.assigned_by,
        assigned_at = now()
  RETURNING id INTO v_assignment_id;

  UPDATE users
  SET current_title_id = v_title_id, unit = v_unit
  WHERE id = p_user_id;

  RETURN v_assignment_id;
END;
$$;

-- 6. replace_journey_duty_officers: change only what changed.
-- Same authority check and validation as before. Officers who stay on the
-- journey keep their row (status, acknowledgement, no new notification);
-- removed officers are deleted; new officers, and rejected officers who are
-- assigned again, get a fresh pending row (and the assignment notification).
CREATE OR REPLACE FUNCTION public.replace_journey_duty_officers(target_journey_id uuid, assignments jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
  caller_oscar text;
  assignment_count integer;
  lead_count integer;
BEGIN
  SELECT role::text, oscar INTO caller_role, caller_oscar FROM public.users
    WHERE id = auth.uid() AND coalesce(is_active, true)
      AND coalesce(activation_status, 'active') = 'active';
  IF caller_role IS NULL OR (
    caller_role <> ALL(ARRAY[
      'super_admin','dev_admin','admin','captain','vice_captain',
      'head_of_operations','head_of_command','command','hod','hop'
    ])
    AND lower(coalesce(caller_oscar, '')) NOT LIKE '%command%'
    AND lower(coalesce(caller_oscar, '')) NOT LIKE '%captain%'
  ) THEN
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

  -- Officers taken off the journey, and rejected officers being assigned again.
  DELETE FROM public.journey_duty_officers d
  WHERE d.journey_id = target_journey_id
    AND (
      NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(assignments) entry
        WHERE (entry->>'user_id')::uuid = d.user_id
      )
      OR coalesce(d.status, '') = 'rejected'
    );

  -- Officers who stay: only the lead flag can change.
  UPDATE public.journey_duty_officers d
  SET is_lead = wanted.is_lead
  FROM (
    SELECT (entry->>'user_id')::uuid AS user_id, coalesce((entry->>'is_lead')::boolean, false) AS is_lead
    FROM jsonb_array_elements(assignments) entry
  ) wanted
  WHERE d.journey_id = target_journey_id
    AND d.user_id = wanted.user_id
    AND d.is_lead IS DISTINCT FROM wanted.is_lead;

  INSERT INTO public.journey_duty_officers (journey_id, user_id, is_lead, status, acknowledged_at)
  SELECT target_journey_id, wanted.user_id, wanted.is_lead,
    CASE WHEN wanted.user_id = auth.uid() THEN 'acknowledged' ELSE 'pending' END,
    CASE WHEN wanted.user_id = auth.uid() THEN now() ELSE NULL END
  FROM (
    SELECT (entry->>'user_id')::uuid AS user_id, coalesce((entry->>'is_lead')::boolean, false) AS is_lead
    FROM jsonb_array_elements(assignments) entry
  ) wanted
  WHERE NOT EXISTS (
    SELECT 1 FROM public.journey_duty_officers d
    WHERE d.journey_id = target_journey_id AND d.user_id = wanted.user_id
  );

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

REVOKE ALL ON FUNCTION public.replace_journey_duty_officers(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_journey_duty_officers(uuid, jsonb) TO authenticated;

-- 7. Backfill: a removal older than an active programme title assignment or a
-- DO duty row for the same room no longer applies.
DELETE FROM public.chat_room_removals removal
WHERE (
    removal.papa_id IS NULL AND EXISTS (
      SELECT 1 FROM public.title_assignments ta
      WHERE ta.user_id = removal.user_id
        AND ta.program_id = removal.program_id
        AND ta.is_active = true
        AND coalesce(ta.assigned_at, ta.created_at) > removal.created_at
    )
  ) OR EXISTS (
    SELECT 1 FROM public.journey_duty_officers d
    JOIN public.journeys j ON j.id = d.journey_id
    WHERE d.user_id = removal.user_id
      AND coalesce(d.status, '') <> 'rejected'
      AND d.created_at > removal.created_at
      AND coalesce(j.is_deleted, false) = false
      AND j.status::text <> 'cancelled'
      AND j.program_id = removal.program_id
      AND (
        removal.papa_id IS NULL
        OR j.papa_id = removal.papa_id
        OR EXISTS (SELECT 1 FROM public.journey_papas jp WHERE jp.journey_id = j.id AND jp.papa_id = removal.papa_id)
      )
  );

COMMENT ON TABLE public.chat_room_removals IS
  'Admin removals from a programme or Papa room. Overrides automatic access until the officer is added back, or an admin/lead assigns them to that programme (title) or makes them DO on a journey for that room.';

NOTIFY pgrst, 'reload schema';
