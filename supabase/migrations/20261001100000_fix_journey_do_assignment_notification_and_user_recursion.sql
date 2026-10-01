-- Migration: Fix Journey DO Assignment Notification and User Policy Recursion
-- 1. Default channel for notifications to prevent NOT NULL constraint violation (23502)
ALTER TABLE public.notifications ALTER COLUMN channel SET DEFAULT 'push'::notification_channel;

-- 2. Update notify_do_assignment function to explicitly set channel and status
CREATE OR REPLACE FUNCTION public.notify_do_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j_record  RECORD;
  papa_name text;
  msg_body  text;
BEGIN
  SELECT j.origin, j.destination, j.scheduled_departure, j.papa_id
  INTO j_record
  FROM journeys j
  WHERE j.id = NEW.journey_id;

  IF j_record.papa_id IS NOT NULL THEN
    SELECT COALESCE(full_name, 'Unknown') INTO papa_name
    FROM papas WHERE id = j_record.papa_id;
  ELSE
    papa_name := 'Unknown Papa';
  END IF;

  msg_body := format(
    'You have been assigned as Duty Officer for %s: %s → %s',
    papa_name, j_record.origin, j_record.destination
  );

  INSERT INTO notifications (
    user_id, title, message, type, channel, status, journey_id, metadata, is_read
  )
  VALUES (
    NEW.user_id,
    CASE WHEN NEW.is_lead THEN 'New Assignment — Team Lead' ELSE 'New Journey Assignment' END,
    msg_body,
    'assignment',
    'push',
    'pending',
    NEW.journey_id,
    jsonb_build_object(
      'papa_name',           papa_name,
      'origin',              j_record.origin,
      'destination',         j_record.destination,
      'scheduled_departure', j_record.scheduled_departure,
      'is_lead',             NEW.is_lead
    ),
    false
  );

  RETURN NEW;
END;
$$;

-- 3. Fix journey_papas management policy to include leadership
DROP POLICY IF EXISTS "Authorized users can manage journey_papas" ON public.journey_papas;
CREATE POLICY "Authorized users can manage journey_papas"
    ON public.journey_papas FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND (
                users.role::text IN (
                    'super_admin', 'dev_admin', 'admin', 'captain', 'vice_captain',
                    'head_of_operations', 'head_of_command', 'command',
                    'delta_oscar', 'tango_oscar'
                )
            )
            AND coalesce(users.is_active, true) = true
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND (
                users.role::text IN (
                    'super_admin', 'dev_admin', 'admin', 'captain', 'vice_captain',
                    'head_of_operations', 'head_of_command', 'command',
                    'delta_oscar', 'tango_oscar'
                )
            )
            AND coalesce(users.is_active, true) = true
        )
    );

-- 4. Fix infinite recursion on users table update policy
DROP POLICY IF EXISTS "Users can update own non-sensitive fields" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
DROP POLICY IF EXISTS "users_update_self" ON public.users;

CREATE OR REPLACE FUNCTION public.prevent_user_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Cannot change own role' USING ERRCODE = '42501';
    END IF;
    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      RAISE EXCEPTION 'Cannot change own active status' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_user_role_escalation ON public.users;
CREATE TRIGGER trg_prevent_user_role_escalation
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_user_role_escalation();

CREATE POLICY "users_update_self"
  ON public.users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 5. Update replace_journey_duty_officers function
CREATE OR REPLACE FUNCTION public.replace_journey_duty_officers(
  target_journey_id uuid,
  assignments jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
