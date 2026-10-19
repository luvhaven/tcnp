-- Authority-bearing profile fields (audit 2026-10-19, follow-up to P1 #14)
--
-- users.oscar feeds authorization: oscar_unit_matches() / is_*_oscar() policies and
-- the replace_journey_duty_officers() caller check. The users_update_self policy let
-- a member rewrite their own oscar (and unit, title, team-head flag), so these are now
-- admin-only, like role and activation status. The profile page never edits them.
--
-- replace_journey_duty_officers() also accepted any oscar text containing "command" or
-- "captain". The unit fallback now only applies while the caller is on DO duty
-- (role = 'delta_oscar'), and only for exact leadership unit labels.
--
-- Idempotent. Not yet applied to the live database.

BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_user_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_trusted_backend() THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF auth.uid() = NEW.id THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Cannot change own role' USING ERRCODE = '42501';
    END IF;
    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      RAISE EXCEPTION 'Cannot change own active status' USING ERRCODE = '42501';
    END IF;
    IF NEW.activation_status IS DISTINCT FROM OLD.activation_status THEN
      RAISE EXCEPTION 'Cannot change own activation status' USING ERRCODE = '42501';
    END IF;
    IF NEW.oscar IS DISTINCT FROM OLD.oscar
      OR NEW.unit IS DISTINCT FROM OLD.unit
      OR NEW.current_title_id IS DISTINCT FROM OLD.current_title_id
      OR NEW.is_team_head IS DISTINCT FROM OLD.is_team_head
    THEN
      RAISE EXCEPTION 'Cannot change own unit or title' USING ERRCODE = '42501';
    END IF;
    IF NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'Cannot change own email here' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unauthorized to modify other users' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

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
    WHERE id = auth.uid() AND coalesce(is_active, false)
      AND activation_status = 'active';
  IF caller_role IS NULL OR (
    caller_role <> ALL(ARRAY[
      'super_admin','dev_admin','admin','captain','vice_captain',
      'head_of_operations','head_of_command','command','hod','hop'
    ])
    -- Leadership officers temporarily on DO duty keep their assigning authority.
    AND NOT (
      caller_role = 'delta_oscar'
      AND lower(trim(coalesce(caller_oscar, ''))) IN (
        'command', 'command centre', 'command center',
        'captain', 'vice captain', 'vice_captain',
        'head_of_command', 'head of command', 'head_of_operations', 'head of operations'
      )
    )
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
REVOKE ALL ON FUNCTION public.replace_journey_duty_officers(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_journey_duty_officers(uuid, jsonb) TO authenticated;

COMMIT;
