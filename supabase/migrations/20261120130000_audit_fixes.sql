-- Audit fixes (database group, audit 2026-11-20).
--
-- Runs after 20261120120000_chat_removals_cleared_on_reassignment.sql, which
-- also redefines assign_title; section 2 starts from that version.
-- Idempotent: CREATE OR REPLACE, DROP ... IF EXISTS, guarded publication adds.
-- One-off data changes (deleting heartbeat audit rows, stale notifications,
-- duplicate titles, the orphan incident, the current_title_id backfill) are in
-- 20261120140000_data_cleanup.sql, not here.
--
--  1. Audit trigger skips presence-only updates; duplicate audit triggers dropped (#6)
--  2. assign_title: a programme title no longer replaces the directory title (#7)
--  3. Availability requests: no-gender count, opt-in, late recipients (#8)
--  4. officer-photos writes and audit_logs/notifications inserts locked down (#9)
--  5. Realtime publication for Nest rooms, driver feedback, chat memberships, programmes (#10)
--  6. Audit log views respect RLS; Command can read audit_logs (#16)
--  7. Command can read After-Op Reports (#20)
--  8. decide_signup tells an approved officer (#5)
--  9. notify_do_assignment tags kind do_assignment (s2)
-- 10. notify_location_offline: tell Command and admins an officer went dark (#2/#28)
-- 11. Deleting a programme or request removes its notifications (s1)


-- ─── 1. Audit trigger: skip presence-only updates (#6) ─────────────────────
-- PresenceHeartbeat updates users.last_seen / is_online every 30 s, and every
-- update copied the whole users row into audit_logs (263k rows, 366 MB).
-- An UPDATE whose only differences are bookkeeping columns is not audited:
-- updated_at on every table, plus last_seen and is_online on users.
CREATE OR REPLACE FUNCTION public.audit_log_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor UUID := auth.uid();
  v_action TEXT := lower(TG_OP);
  v_target UUID := COALESCE(NEW.id, OLD.id);
  v_changes JSONB;
  v_description TEXT;
  v_new JSONB := COALESCE(to_jsonb(NEW), '{}'::jsonb);
  v_old JSONB := COALESCE(to_jsonb(OLD), '{}'::jsonb);
  v_noise TEXT[] := CASE WHEN TG_TABLE_NAME = 'users'
    THEN ARRAY['updated_at', 'last_seen', 'is_online']
    ELSE ARRAY['updated_at'] END;
BEGIN
  IF TG_OP = 'UPDATE' AND (v_new - v_noise) = (v_old - v_noise) THEN
    RETURN NEW;
  END IF;

  IF v_actor IS NULL THEN
    v_actor := COALESCE(
      NULLIF(v_new->>'updated_by', '')::uuid,
      NULLIF(v_old->>'updated_by', '')::uuid,
      NULLIF(v_new->>'created_by', '')::uuid,
      NULLIF(v_old->>'created_by', '')::uuid,
      NULLIF(v_new->>'assigned_by', '')::uuid,
      NULLIF(v_old->>'assigned_by', '')::uuid,
      NULLIF(v_new->>'user_id', '')::uuid,
      NULLIF(v_old->>'user_id', '')::uuid
    );
  END IF;

  IF v_actor IS NOT NULL THEN
    PERFORM 1 FROM users WHERE id = v_actor;
    IF NOT FOUND THEN
      v_actor := NULL;
    END IF;
  END IF;

  v_changes := CASE TG_OP
    WHEN 'INSERT' THEN jsonb_build_object('after', v_new)
    WHEN 'UPDATE' THEN jsonb_build_object('before', v_old, 'after', v_new)
    ELSE jsonb_build_object('before', v_old)
  END;

  v_description := CONCAT(initcap(v_action), ' on ', TG_TABLE_NAME);

  PERFORM set_config('row_security', 'off', true);

  INSERT INTO audit_logs (
    user_id, action, target_type, target_id, changes, description, metadata, created_at
  ) VALUES (
    v_actor,
    v_action,
    TG_TABLE_NAME,
    v_target,
    v_changes,
    v_description,
    jsonb_build_object('trigger', TG_NAME, 'schema', TG_TABLE_SCHEMA, 'table', TG_TABLE_NAME),
    NOW()
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- These tables carried two audit triggers, so every change was written twice.
-- audit_log_trigger (kept) records the actor fallback and trigger metadata.
DROP TRIGGER IF EXISTS audit_papas ON public.papas;
DROP TRIGGER IF EXISTS audit_eagle_squares ON public.eagle_squares;
DROP TRIGGER IF EXISTS audit_nests ON public.nests;
DROP TRIGGER IF EXISTS audit_theatres ON public.theatres;
DROP TRIGGER IF EXISTS audit_cheetahs ON public.cheetahs;
DROP TRIGGER IF EXISTS audit_journeys ON public.journeys;
DROP TRIGGER IF EXISTS audit_incidents ON public.incidents;
DROP TRIGGER IF EXISTS audit_programs ON public.programs;
DROP TRIGGER IF EXISTS audit_title_assignments ON public.title_assignments;


-- ─── 2. assign_title: programme titles leave the directory title alone (#7) ──
-- Same body as 20261120120000 (ON CONFLICT re-activation), except that
-- users.current_title_id and users.unit (the officer's directory title) change
-- only for a programme-less title. A programme title is held in
-- title_assignments alone.
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

  -- The directory title follows programme-less titles only.
  IF p_program_id IS NULL THEN
    UPDATE users
    SET current_title_id = v_title_id, unit = v_unit
    WHERE id = p_user_id;
  END IF;

  RETURN v_assignment_id;
END;
$$;

-- 2b. Two app paths also write users.current_title_id directly after
--     assign_title: the bulk "Assign to program" route (sets it to the
--     programme title) and the Officers title dialog's clear path (picks the
--     newest active title, programme ones included). The database now keeps
--     the pointer honest whatever the caller sends: a value that is not an
--     active programme-less title of that officer is replaced by their newest
--     active programme-less title (or NULL), and unit follows that title.
--     NULL is always accepted.
CREATE OR REPLACE FUNCTION public.users_normalise_current_title()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_title uuid;
  v_unit text;
BEGIN
  IF NEW.current_title_id IS NULL
    OR NEW.current_title_id IS NOT DISTINCT FROM OLD.current_title_id THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.title_assignments ta
    WHERE ta.user_id = NEW.id AND ta.title_id = NEW.current_title_id
      AND ta.is_active AND ta.program_id IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  SELECT ta.title_id, ot.unit INTO v_title, v_unit
  FROM public.title_assignments ta
  JOIN public.official_titles ot ON ot.id = ta.title_id
  WHERE ta.user_id = NEW.id AND ta.is_active AND ta.program_id IS NULL
  ORDER BY ta.assigned_at DESC NULLS LAST, ta.created_at DESC NULLS LAST
  LIMIT 1;

  NEW.current_title_id := v_title;
  NEW.unit := CASE WHEN v_title IS NULL THEN OLD.unit ELSE v_unit END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.users_normalise_current_title() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS users_normalise_current_title ON public.users;
CREATE TRIGGER users_normalise_current_title
  BEFORE UPDATE OF current_title_id ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.users_normalise_current_title();


-- ─── 3. Availability requests and officers with no gender (#8) ─────────────
-- Males / Females requests keep filtering on users.gender. The sender can now
-- see how many active officers have no gender set and choose to include them,
-- and officers can be added to a request that is still open.

-- 3a. How many officers an audience reaches, and how many have no gender.
--     `program` is accepted so the UI can key the question by programme; the
--     counts do not depend on it. Command and admins only (SQL is_admin()).
CREATE OR REPLACE FUNCTION public.get_mission_audience_gaps(program uuid, audience text)
RETURNS TABLE (recipients integer, no_gender integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT (public.is_trusted_backend() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Only Command or an admin can check a request audience' USING ERRCODE = '42501';
  END IF;
  IF audience IS NULL OR audience NOT IN ('all', 'male', 'female', 'swift', 'strength', 'wisdom') THEN
    RAISE EXCEPTION 'Select a valid audience' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    count(*) FILTER (WHERE CASE audience
      WHEN 'all' THEN true
      WHEN 'male' THEN u.gender = 'male'
      WHEN 'female' THEN u.gender = 'female'
      WHEN 'swift' THEN u.team = 'swift'
      WHEN 'strength' THEN u.team = 'strength'
      WHEN 'wisdom' THEN u.team = 'wisdom'
      ELSE false
    END)::integer,
    count(*) FILTER (WHERE u.gender IS NULL)::integer
  FROM public.users u
  WHERE u.is_active = true AND u.activation_status = 'active' AND u.is_directory_hidden = false;
END;
$$;

REVOKE ALL ON FUNCTION public.get_mission_audience_gaps(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_mission_audience_gaps(uuid, text) TO authenticated, service_role;

-- 3b. send_mission_availability_request gains include_unset_gender (default
--     false, so existing callers behave as before). With it, a Males or
--     Females request also reaches active officers whose gender is not set.
--     The old 7-argument signature is dropped so PostgREST has one candidate.
DROP FUNCTION IF EXISTS public.send_mission_availability_request(uuid, text, text, timestamptz, uuid, text, text);

CREATE OR REPLACE FUNCTION public.send_mission_availability_request(
  target_program_id uuid,
  request_title text,
  request_message text,
  request_deadline timestamptz,
  sender_id uuid,
  request_audience text,
  notification_message text,
  include_unset_gender boolean DEFAULT false
)
RETURNS TABLE (request_id uuid, recipients integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH eligible AS MATERIALIZED (
    SELECT id FROM public.users
    WHERE is_active = true AND activation_status = 'active' AND is_directory_hidden = false
      AND CASE request_audience
        WHEN 'all' THEN true
        WHEN 'male' THEN gender = 'male' OR (coalesce(include_unset_gender, false) AND gender IS NULL)
        WHEN 'female' THEN gender = 'female' OR (coalesce(include_unset_gender, false) AND gender IS NULL)
        WHEN 'swift' THEN team = 'swift'
        WHEN 'strength' THEN team = 'strength'
        WHEN 'wisdom' THEN team = 'wisdom'
        ELSE false
      END
  ), new_request AS (
    INSERT INTO public.mission_requests (program_id, title, message, deadline, created_by, audience)
    SELECT target_program_id, request_title, request_message, request_deadline, sender_id, request_audience
    WHERE EXISTS (SELECT 1 FROM eligible)
    RETURNING id
  ), addressed AS (
    INSERT INTO public.mission_request_recipients (request_id, user_id)
    SELECT new_request.id, eligible.id FROM new_request CROSS JOIN eligible
    RETURNING mission_request_recipients.request_id, user_id
  ), notified AS (
    INSERT INTO public.notifications (user_id, title, message, type, channel, metadata, is_read)
    SELECT addressed.user_id, '🎖️ ' || request_title, notification_message, 'alert', 'push',
      jsonb_build_object('kind', 'mission_request', 'request_id', addressed.request_id, 'program_id', target_program_id),
      false
    FROM addressed
    RETURNING id
  )
  SELECT (SELECT id FROM new_request), (SELECT count(*)::integer FROM notified);
$$;

REVOKE ALL ON FUNCTION public.send_mission_availability_request(uuid, text, text, timestamptz, uuid, text, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_mission_availability_request(uuid, text, text, timestamptz, uuid, text, text, boolean)
  TO service_role;

-- 3c. Add officers to a request that is still open (status 'open' and the
--     deadline not passed). Adds, without duplicates:
--       * active officers who match the request's audience now (for example
--         an officer who set their gender after it was sent, or a new officer),
--       * with include_unset_gender, active officers with no gender set
--         (Males / Females requests),
--       * the active officers in user_ids, whatever the audience.
--     Each new recipient gets the same availability notification. Returns the
--     number added. Command and admins only (SQL is_admin()), or the backend.
--     Requests with no audience (sent before recipients were recorded) are
--     open to everyone already and are refused.
CREATE OR REPLACE FUNCTION public.add_mission_request_recipients(
  target_request_id uuid,
  user_ids uuid[] DEFAULT NULL,
  include_unset_gender boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  request record;
  program_name text;
  message_text text;
  added integer;
BEGIN
  IF NOT (public.is_trusted_backend() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Only Command or an admin can add officers to a request' USING ERRCODE = '42501';
  END IF;

  SELECT r.id, r.program_id, r.title, r.deadline, r.status, r.audience
  INTO request
  FROM public.mission_requests r
  WHERE r.id = target_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Availability request not found' USING ERRCODE = 'P0002';
  END IF;
  IF request.audience IS NULL THEN
    RAISE EXCEPTION 'Every officer can already answer this request' USING ERRCODE = '55000';
  END IF;
  IF request.status IS DISTINCT FROM 'open' OR request.deadline <= now() THEN
    RAISE EXCEPTION 'This request has closed. Extend its deadline first to add officers' USING ERRCODE = '55000';
  END IF;

  SELECT p.name INTO program_name FROM public.programs p WHERE p.id = request.program_id;
  message_text := format(
    '%s: please confirm your availability to serve before %s. Respond from your dashboard.',
    coalesce(program_name, 'Programme'),
    to_char(request.deadline AT TIME ZONE 'Africa/Lagos', 'DD Mon YYYY, HH24:MI')
  );

  WITH wanted AS (
    SELECT u.id FROM public.users u
    WHERE u.is_active = true AND u.activation_status = 'active' AND u.is_directory_hidden = false
      AND (
        CASE request.audience
          WHEN 'all' THEN true
          WHEN 'male' THEN u.gender = 'male'
          WHEN 'female' THEN u.gender = 'female'
          WHEN 'swift' THEN u.team = 'swift'
          WHEN 'strength' THEN u.team = 'strength'
          WHEN 'wisdom' THEN u.team = 'wisdom'
          ELSE false
        END
        OR (coalesce(include_unset_gender, false) AND u.gender IS NULL)
        OR u.id = ANY (coalesce(user_ids, ARRAY[]::uuid[]))
      )
  ), addressed AS (
    INSERT INTO public.mission_request_recipients (request_id, user_id)
    SELECT request.id, wanted.id FROM wanted
    ON CONFLICT (request_id, user_id) DO NOTHING
    RETURNING user_id
  ), notified AS (
    INSERT INTO public.notifications (user_id, title, message, type, channel, metadata, is_read)
    SELECT addressed.user_id, '🎖️ ' || request.title, message_text, 'alert', 'push',
      jsonb_build_object('kind', 'mission_request', 'request_id', request.id, 'program_id', request.program_id, 'late_recipient', true),
      false
    FROM addressed
    RETURNING id
  )
  SELECT count(*)::integer INTO added FROM notified;

  RETURN added;
END;
$$;

REVOKE ALL ON FUNCTION public.add_mission_request_recipients(uuid, uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_mission_request_recipients(uuid, uuid[], boolean) TO authenticated, service_role;


-- ─── 4. officer-photos writes, audit_logs and notifications inserts (#9) ────
-- Ported from 20261019150000_p1_security_hardening.sql (never applied), only
-- the parts that are still missing and still right:
--   * officer-photos: only platform administrators write, matching
--     canManageOfficers in OfficersClient (the only uploader; officers' own
--     headshots go to the avatars bucket). Reads are unchanged.
--   * audit_logs: a browser can insert only a row attributed to itself (the
--     incidents page does this). Server routes use the service role and the
--     audit triggers are SECURITY DEFINER, so neither goes through RLS.
--   * notifications: the two role-based insert policies let admin and captain
--     browsers write notifications for anyone. Every cross-user notification
--     now comes from the service role or a SECURITY DEFINER function, so only
--     notifications_insert_own (already live) remains.
-- Not ported: the vip-photos policies (20261116170000 replaced them with the
-- unit rule) and the SOP checklist log policies (already live in later form).
-- The bucket MIME/size limits are left out on purpose; see the notes.
DROP POLICY IF EXISTS "Authenticated users can upload officer photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update officer photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete officer photos" ON storage.objects;
DROP POLICY IF EXISTS "officer-photos_insert_admins" ON storage.objects;
DROP POLICY IF EXISTS "officer-photos_update_admins" ON storage.objects;
DROP POLICY IF EXISTS "officer-photos_delete_admins" ON storage.objects;

CREATE POLICY "officer-photos_insert_admins" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'officer-photos' AND (SELECT public.is_platform_admin()));

CREATE POLICY "officer-photos_update_admins" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'officer-photos' AND (SELECT public.is_platform_admin()))
  WITH CHECK (bucket_id = 'officer-photos' AND (SELECT public.is_platform_admin()));

CREATE POLICY "officer-photos_delete_admins" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'officer-photos' AND (SELECT public.is_platform_admin()));

DROP POLICY IF EXISTS audit_logs_insert ON public.audit_logs;
DROP POLICY IF EXISTS "Only system functions can insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_insert_own ON public.audit_logs;
CREATE POLICY audit_logs_insert_own ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT public.is_active_member()));

DROP POLICY IF EXISTS "Admins and captains can create notifications" ON public.notifications;
DROP POLICY IF EXISTS "Only admins can create notifications" ON public.notifications;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM anon;


-- ─── 5. Realtime publication (#10) ─────────────────────────────────────────
-- The app subscribes to these with postgres_changes, but they were never in
-- the publication (20261019180000 was not applied; this supersedes it and
-- adds chat_room_memberships and programs). Realtime applies each table's
-- SELECT policy to every event:
--   driver_feedback        reviewer, platform admin or Tango member
--   nest_room_*            platform admin, Nest member, or the assigned officer
--   chat_room_memberships  the member themselves, or a platform admin
--   programs               any active member
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'driver_feedback', 'nest_room_stays', 'nest_room_inspections', 'nest_room_items',
    'nest_room_issues', 'chat_room_memberships', 'programs'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;


-- ─── 6. Audit log views respect RLS (#16) ──────────────────────────────────
-- Both views were owned by postgres (bypasses RLS) without security_invoker,
-- so any signed-in officer, and anon, could read every audit row through
-- them. They now run with the caller's rights.
ALTER VIEW public.audit_logs_readable SET (security_invoker = true);
ALTER VIEW public.vw_audit_logs SET (security_invoker = true);
REVOKE ALL ON public.audit_logs_readable FROM anon;
REVOKE ALL ON public.vw_audit_logs FROM anon;

-- The Audit Log page admits Command as well as admins. SQL is_admin() is the
-- admin and Command set (8 roles or has_admin_access, active accounts only).
DROP POLICY IF EXISTS audit_logs_command_select ON public.audit_logs;
CREATE POLICY audit_logs_command_select ON public.audit_logs
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));


-- ─── 7. After-Op Reports readable by Command (#20) ─────────────────────────
DROP POLICY IF EXISTS "DOs can read own feedback; admins can read all" ON public.do_feedback_forms;
DROP POLICY IF EXISTS do_feedback_forms_select ON public.do_feedback_forms;
CREATE POLICY do_feedback_forms_select ON public.do_feedback_forms
  FOR SELECT TO authenticated
  USING (submitted_by = (SELECT auth.uid()) OR (SELECT public.is_platform_admin()) OR (SELECT public.is_admin()));


-- ─── 8. decide_signup tells an approved officer (#5) ───────────────────────
-- Same body as 20261116183000; an approval now also writes a notification
-- (kind signup_approved, routed to /profile so they add a headshot first).
CREATE OR REPLACE FUNCTION public.decide_signup(target_user uuid, signup_decision text, decision_reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  caller uuid := auth.uid();
  wanted text := lower(btrim(coalesce(signup_decision, '')));
  clean_reason text := nullif(btrim(coalesce(decision_reason, '')), '');
  applicant record;
  next_status text;
  next_active boolean;
  new_decision uuid;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Sign in to decide signups' USING ERRCODE = '42501';
  END IF;

  wanted := CASE wanted
    WHEN 'approve' THEN 'approved'
    WHEN 'decline' THEN 'declined'
    WHEN 'reopen' THEN 'reopened'
    ELSE wanted
  END;
  IF wanted NOT IN ('approved', 'declined', 'reopened') THEN
    RAISE EXCEPTION 'Unknown signup decision' USING ERRCODE = '22023';
  END IF;
  IF wanted = 'declined' AND (clean_reason IS NULL OR char_length(clean_reason) < 3) THEN
    RAISE EXCEPTION 'Give a reason (at least 3 characters) to decline a signup' USING ERRCODE = '22023';
  END IF;
  IF clean_reason IS NOT NULL AND char_length(clean_reason) > 500 THEN
    RAISE EXCEPTION 'Keep the reason under 500 characters' USING ERRCODE = '22023';
  END IF;
  IF target_user IS NULL OR target_user = caller THEN
    RAISE EXCEPTION 'You cannot decide your own signup' USING ERRCODE = '42501';
  END IF;

  SELECT id, activation_status, coalesce(is_directory_hidden, false) AS hidden
  INTO applicant
  FROM public.users
  WHERE id = target_user
  FOR UPDATE;

  IF NOT FOUND OR applicant.hidden THEN
    RAISE EXCEPTION 'Officer not found' USING ERRCODE = 'P0002';
  END IF;

  IF wanted = 'reopened' THEN
    -- Admin and Command only (SQL is_admin(); it also requires an active caller).
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only an admin or Command can reopen a declined signup' USING ERRCODE = '42501';
    END IF;
    IF applicant.activation_status IS DISTINCT FROM 'declined' THEN
      RAISE EXCEPTION 'This signup is not declined' USING ERRCODE = '55000';
    END IF;
    next_status := 'pending';
    next_active := false;
  ELSE
    IF NOT public.can_decide_signup(target_user) THEN
      RAISE EXCEPTION 'You can only decide signups into your own unit' USING ERRCODE = '42501';
    END IF;
    IF applicant.activation_status IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'This signup is no longer pending' USING ERRCODE = '55000';
    END IF;
    next_status := CASE WHEN wanted = 'approved' THEN 'active' ELSE 'declined' END;
    next_active := wanted = 'approved';
  END IF;

  UPDATE public.users
  SET activation_status = next_status, is_active = next_active
  WHERE id = target_user;

  INSERT INTO public.signup_decisions (user_id, decision, reason, decided_by)
  VALUES (target_user, wanted, clean_reason, caller)
  RETURNING id INTO new_decision;

  IF wanted = 'declined' THEN
    PERFORM public.revoke_user_sessions(target_user);
  END IF;

  IF wanted = 'approved' THEN
    INSERT INTO public.notifications (user_id, title, message, type, channel, metadata, is_read)
    VALUES (
      target_user,
      'Account approved',
      'Your TCNP account has been approved. You can sign in now. Start by adding your headshot to your profile.',
      'info',
      'push',
      jsonb_build_object('kind', 'signup_approved', 'decision_id', new_decision),
      false
    );
  END IF;

  RETURN jsonb_build_object(
    'id', target_user,
    'decision', wanted,
    'decision_id', new_decision,
    'activation_status', next_status,
    'is_active', next_active
  );
END;
$function$;


-- ─── 9. notify_do_assignment: metadata.kind do_assignment (s2) ─────────────
-- Same body as live; the metadata now carries kind 'do_assignment' so the
-- notification routes to My Operations rather than the Journeys planner.
CREATE OR REPLACE FUNCTION public.notify_do_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      'kind',                'do_assignment',
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
$function$;


-- ─── 10. notify_location_offline (#2 / #28) ────────────────────────────────
-- LocationTracker used to insert the "location offline" alert for the officer
-- themself. This tells Command and platform admins instead (the SQL is_admin()
-- set, active accounts, not the officer). At most one alert per officer and
-- reason every 15 minutes; a call inside that window sends nothing and
-- returns 0. The function writes the text, so a client cannot address
-- arbitrary notifications to others. Returns the number of people notified.
CREATE OR REPLACE FUNCTION public.notify_location_offline(reason text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller uuid := auth.uid();
  officer record;
  officer_label text;
  alert_title text;
  alert_body text;
  sent integer;
BEGIN
  IF caller IS NULL OR NOT public.is_active_member() THEN
    RAISE EXCEPTION 'Sign in to send a location alert' USING ERRCODE = '42501';
  END IF;
  IF reason IS NULL OR reason NOT IN ('location_lost', 'battery_critical') THEN
    RAISE EXCEPTION 'Unknown location alert reason' USING ERRCODE = '22023';
  END IF;

  -- One caller at a time per officer, so two tabs cannot both pass the window check.
  PERFORM pg_advisory_xact_lock(hashtextextended('notify_location_offline:' || caller::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.created_at > now() - interval '15 minutes'
      AND n.metadata->>'kind' = 'location_offline'
      AND n.metadata->>'officer_id' = caller::text
      AND n.metadata->>'reason' = reason
  ) THEN
    RETURN 0;
  END IF;

  SELECT u.full_name, u.email, u.oscar INTO officer FROM public.users u WHERE u.id = caller;
  officer_label := coalesce(nullif(btrim(officer.full_name), ''), officer.email, 'An officer')
    || CASE WHEN nullif(btrim(coalesce(officer.oscar, '')), '') IS NOT NULL THEN ' (' || btrim(officer.oscar) || ')' ELSE '' END;

  IF reason = 'location_lost' THEN
    alert_title := 'SOS: Location Offline';
    alert_body := officer_label || '''s location stopped updating. Check on them from Live Tracking.';
  ELSE
    alert_title := 'SOS: Battery Critical';
    alert_body := officer_label || '''s phone battery is critically low, so their location may stop soon. Check on them from Live Tracking.';
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, channel, metadata, is_read)
  SELECT u.id, alert_title, alert_body, 'alert', 'push',
    jsonb_build_object('kind', 'location_offline', 'reason', reason, 'officer_id', caller),
    false
  FROM public.users u
  WHERE u.id <> caller
    AND u.is_active = true
    AND u.activation_status = 'active'
    AND (u.has_admin_access OR u.role::text IN (
      'super_admin', 'dev_admin', 'admin', 'captain', 'vice_captain',
      'head_of_operations', 'head_of_command', 'command'
    ));
  GET DIAGNOSTICS sent = ROW_COUNT;
  RETURN sent;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_location_offline(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_location_offline(text) TO authenticated;


-- ─── 11. Deleting a programme or request removes its notifications (s1) ─────
-- Notifications about a deleted programme or availability request pointed at
-- pages that no longer exist (138 live; the cleanup migration removes them).
CREATE OR REPLACE FUNCTION public.delete_notifications_for_deleted_target()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_TABLE_NAME = 'programs' THEN
    DELETE FROM public.notifications n
    WHERE n.metadata->>'program_id' IN (SELECT d.id::text FROM deleted_rows d);
  ELSIF TG_TABLE_NAME = 'mission_requests' THEN
    DELETE FROM public.notifications n
    WHERE n.metadata->>'kind' = 'mission_request'
      AND n.metadata->>'request_id' IN (SELECT d.id::text FROM deleted_rows d);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_notifications_for_deleted_target() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS programs_delete_notifications ON public.programs;
CREATE TRIGGER programs_delete_notifications
  AFTER DELETE ON public.programs
  REFERENCING OLD TABLE AS deleted_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.delete_notifications_for_deleted_target();

DROP TRIGGER IF EXISTS mission_requests_delete_notifications ON public.mission_requests;
CREATE TRIGGER mission_requests_delete_notifications
  AFTER DELETE ON public.mission_requests
  REFERENCING OLD TABLE AS deleted_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.delete_notifications_for_deleted_target();

NOTIFY pgrst, 'reload schema';
