-- P0 security hardening (audit 2026-10-19)
--
-- 1. is_admin() and prevent_user_role_escalation() trusted `current_user`, which inside a
--    SECURITY DEFINER function is the owner (postgres), so both returned "admin" for every
--    caller, anonymous requests included.
-- 2. current_user_claim_roles() (behind has_role / has_any_role) trusted
--    user_metadata.role from the JWT, which every user can rewrite with auth.updateUser().
-- 3. Login-only read policies let pending / deactivated accounts read member data.
-- 4. PUBLIC (and therefore anon) could execute every SECURITY DEFINER RPC in public,
--    several of which mutate data with no caller check.
-- 5. Password reset tokens are now stored as SHA-256 digests; open requests holding raw
--    tokens are expired.

BEGIN;

-- ─── Helpers ────────────────────────────────────────────────────────────────

-- True for direct database sessions (migrations, pg_cron) and service-role API calls.
-- PostgREST always sets JWT claims for anon/authenticated requests, so they are never trusted.
CREATE OR REPLACE FUNCTION public.is_trusted_backend()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT auth.jwt() IS NULL OR coalesce(auth.jwt() ->> 'role', '') = 'service_role';
$$;

-- The caller is an approved, active member (not pending, not deactivated).
CREATE OR REPLACE FUNCTION public.is_active_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND coalesce(u.is_active, false) = true
      AND u.activation_status = 'active'
  );
$$;

-- ─── 1. is_admin / role-escalation trigger ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND role IN (
        'super_admin','dev_admin','admin','captain','vice_captain',
        'head_of_operations','head_of_command','command'
      )
      AND coalesce(is_active, false) = true
      AND activation_status = 'active'
  );
$$;

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
  ELSE
    RAISE EXCEPTION 'Unauthorized to modify other users' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- ─── 2. Role claims come from public.users, never from user-editable JWT metadata ───

CREATE OR REPLACE FUNCTION public.current_user_claim_roles()
RETURNS user_role[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(array_agg(u.role), ARRAY[]::user_role[])
  FROM public.users u
  WHERE u.id = auth.uid()
    AND u.role IS NOT NULL
    AND coalesce(u.is_active, false) = true
    AND u.activation_status = 'active';
$$;

-- These only read the caller's role, so let the planner cache them per statement.
ALTER FUNCTION public.has_claim_role(user_role) STABLE;
ALTER FUNCTION public.has_any_claim_role(user_role[]) STABLE;
ALTER FUNCTION public.has_role(user_role) STABLE;
ALTER FUNCTION public.has_role(text) STABLE;
ALTER FUNCTION public.has_any_role(user_role[]) STABLE;
ALTER FUNCTION public.has_any_role(text[]) STABLE;

-- ─── 3. Member-only reads require an approved, active account ───────────────

DROP POLICY IF EXISTS "Authenticated users can view basic user info" ON public.users;

ALTER POLICY users_select_visible_profiles ON public.users
  TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR ((SELECT public.is_active_member()) AND coalesce(is_directory_hidden, false) = false)
    OR (SELECT public.is_platform_admin())
  );

ALTER POLICY "Authenticated can read flower logs" ON public.cheetah_flower_logs TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY compliance_posts_select ON public.compliance_posts TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY "Authenticated can read den logs" ON public.den_checklist_logs TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY "Authenticated users can view eagle_squares" ON public.eagle_squares TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY "Authenticated can read EO logs" ON public.eo_checklist_logs TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY equipment_select_authenticated ON public.equipment TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY equipment_logs_select_authenticated ON public.equipment_logs TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY "Authenticated users can view flight tracking" ON public.flight_tracking TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY flight_tracking_view ON public.flight_tracking TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY hospitality_places_select ON public.hospitality_places TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY "All authenticated users can view incidents" ON public.incidents TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY "Authenticated users can view incidents" ON public.incidents TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY incidents_view ON public.incidents TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY "Authenticated users can view journey locations" ON public.journey_locations TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY "All authenticated users can view journey_papas" ON public.journey_papas TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY journey_status_updates_select_authenticated ON public.journey_status_updates TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY journeys_select_authenticated ON public.journeys TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY reactions_select ON public.message_reactions TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY mission_requests_select ON public.mission_requests TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY nest_amenities_read_all ON public.nest_amenities TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY "Authenticated can read comfort logs" ON public.nest_comfort_logs TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY nest_rooms_authenticated_select ON public.nest_rooms TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY "Authenticated users can view nests" ON public.nests TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY "Authenticated users can view noscar assignments" ON public.noscar_assignments TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY "All authenticated users can view templates" ON public.notification_templates TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY "All authenticated users can view official titles" ON public.official_titles TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY official_titles_view ON public.official_titles TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY "Allow authenticated read access" ON public.oscar_documents TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY "Authenticated users can view program schedules" ON public.program_days TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY allow_select_authenticated ON public.program_exports TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY program_menus_select ON public.program_menus TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY "Authenticated users can view program sessions" ON public.program_sessions TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY program_venues_select_authenticated ON public.program_venues TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY programs_select_authenticated ON public.programs TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY "All authenticated users can view roles" ON public.roles TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY "Authenticated users can view session speakers" ON public.session_speakers TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY "All authenticated users can view telemetry" ON public.telemetry_data TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY testimonials_read_all ON public.testimonials TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY "All authenticated users can view VIPs" ON public.theatre_vips TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY "Authenticated users can view theatres" ON public.theatres TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY "All authenticated users can view title assignments" ON public.title_assignments TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY title_assignments_view ON public.title_assignments TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY unit_deployment_members_select_authenticated ON public.unit_deployment_members TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY unit_deployments_select_authenticated ON public.unit_deployments TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY units_select_authenticated ON public.units TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY "Users can view all user locations" ON public.user_locations TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY "Authenticated users can view vehicle locations" ON public.vehicle_locations TO authenticated USING ((SELECT public.is_active_member()));
ALTER POLICY vendors_select ON public.vendors TO authenticated USING ((SELECT public.is_active_member()));

-- ─── 4a. Caller checks inside RPCs the app still calls ──────────────────────

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
  RETURNING id INTO v_assignment_id;

  UPDATE users
  SET current_title_id = v_title_id, unit = v_unit
  WHERE id = p_user_id;

  RETURN v_assignment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_user_location(p_user_id uuid, p_latitude numeric, p_longitude numeric, p_accuracy numeric DEFAULT NULL::numeric, p_altitude numeric DEFAULT NULL::numeric, p_heading numeric DEFAULT NULL::numeric, p_speed numeric DEFAULT NULL::numeric, p_battery_level integer DEFAULT NULL::integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE location_id UUID;
BEGIN
  IF NOT public.is_trusted_backend()
     AND (p_user_id IS DISTINCT FROM auth.uid() OR NOT public.is_active_member()) THEN
    RAISE EXCEPTION 'You can only report your own location' USING ERRCODE = '42501';
  END IF;

  UPDATE user_locations SET is_active = false
  WHERE user_id = p_user_id AND is_active = true;
  INSERT INTO user_locations (user_id, latitude, longitude, accuracy, altitude, heading, speed, battery_level)
  VALUES (p_user_id, p_latitude, p_longitude, p_accuracy, p_altitude, p_heading, p_speed, p_battery_level)
  RETURNING id INTO location_id;
  RETURN location_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_message_read(message_uuid uuid, user_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_trusted_backend() AND user_uuid IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'You can only mark messages read for yourself' USING ERRCODE = '42501';
  END IF;

  UPDATE chat_messages
  SET read_by = read_by || jsonb_build_array(user_uuid::text)
  WHERE id = message_uuid
  AND NOT (read_by ? user_uuid::text);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_messages_as_read(p_user_id uuid, p_program_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_trusted_backend() AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'You can only mark messages read for yourself' USING ERRCODE = '42501';
  END IF;

  UPDATE chat_messages
  SET read_by = CASE
    WHEN read_by ? p_user_id::text THEN read_by
    ELSE COALESCE(read_by, '[]'::jsonb) || to_jsonb(p_user_id)
  END
  WHERE program_id = p_program_id
    AND sender_id != p_user_id
    AND NOT (read_by ? p_user_id::text);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_active_user_locations()
RETURNS TABLE(user_id uuid, full_name text, oscar text, role user_role, latitude numeric, longitude numeric, accuracy numeric, speed numeric, heading numeric, battery_level integer, updated_at timestamp with time zone)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT ON (ul.user_id)
    u.id, u.full_name, u.oscar, u.role,
    ul.latitude, ul.longitude, ul.accuracy,
    ul.speed, ul.heading, ul.battery_level, ul.updated_at
  FROM user_locations ul
  JOIN users u ON u.id = ul.user_id
  WHERE (public.is_trusted_backend() OR public.is_active_member())
    AND ul.is_active = true
    AND u.is_active = true
    AND ul.updated_at > NOW() - INTERVAL '30 minutes'
  ORDER BY ul.user_id, ul.updated_at DESC;
$$;

-- export_program_data keeps its body; the public entry point now checks the caller first.
ALTER FUNCTION public.export_program_data(uuid) RENAME TO export_program_data_unchecked;
ALTER FUNCTION public.export_program_data_unchecked(uuid) SET search_path = public, pg_temp;

CREATE FUNCTION public.export_program_data(program_uuid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_trusted_backend() AND NOT public.is_active_member() THEN
    RAISE EXCEPTION 'Not authorized to export program data' USING ERRCODE = '42501';
  END IF;
  RETURN public.export_program_data_unchecked(program_uuid);
END;
$$;

-- Pin search_path on the remaining definer functions touched by this audit.
ALTER FUNCTION public.assign_do_to_journey(uuid, uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.reassign_title(uuid, uuid, text, uuid, uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.soft_delete_journey(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.soft_delete_papa(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_journey_call_sign(uuid, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.cleanup_old_locations() SET search_path = public, pg_temp;

-- ─── 4b. Function EXECUTE privileges ────────────────────────────────────────
-- Remove PUBLIC/anon EXECUTE from every non-extension function in public. Keep
-- authenticated and service_role exactly as they were by granting them explicitly
-- wherever they currently hold EXECUTE (often only through PUBLIC).
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_ok,
           has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_ok
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prokind = 'f'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
      )
  LOOP
    IF f.authenticated_ok THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
    END IF;
    IF f.service_ok THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.sig);
  END LOOP;
END $$;

-- Policies with no TO clause are also evaluated for anon. Let anon keep evaluating the
-- boolean predicate helpers those policies reference, so an anonymous request gets
-- "no rows" instead of a permission error. These helpers only read the caller's identity.
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT DISTINCT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_policies pol
      ON (coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '')) ~ ('(^|[^a-z0-9_])' || p.proname || '\(')
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prokind = 'f'
      AND p.prorettype = 'boolean'::regtype
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', f.sig);
  END LOOP;
END $$;

-- Internal-only functions: called by cron routes (service role), pg_cron, or other
-- definer functions; never by end users.
REVOKE EXECUTE ON FUNCTION public.assign_do_to_journey(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reassign_title(uuid, uuid, text, uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.soft_delete_journey(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.soft_delete_papa(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.dispatch_announcement(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.dispatch_due_announcements() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_daily_birthday_reminders() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_locations() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reconcile_journey_primary_cheetah(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.export_program_data_unchecked(uuid) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.is_active_member() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_trusted_backend() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.export_program_data(uuid) TO authenticated, service_role;

-- New functions in public no longer become anon-executable by default.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- ─── 5. Password reset tokens are stored hashed ─────────────────────────────
-- Open requests hold raw tokens that were handed to whoever asked; retire them.
UPDATE public.password_reset_requests
SET status = 'expired', updated_at = now()
WHERE status IN ('pending', 'approved');

COMMENT ON COLUMN public.password_reset_requests.reset_token IS
  'SHA-256 hex digest of the reset token. The raw token only ever lives in the requester''s httpOnly cookie.';

COMMIT;
