-- Tell Command when an officer who should be visible on Live Tracking goes silent.
--
-- TCNP is a web app: a phone only reports its location while TCNP is open on
-- screen. Locking the phone or switching apps stops it (immediately on iPhone,
-- within minutes on Android), and a backgrounded phone cannot report its own
-- silence. notify_location_offline only fires on GPS errors, so an officer who
-- simply put the phone away vanished from the map with nobody told.
--
-- This check runs on the server every 2 minutes. It watches officers who are
-- sharing location (sharing switched on and a location sent in the last 12
-- hours) and have sent nothing for 10 minutes, in two groups:
--
--   Duty Officers  the DO (pending or acknowledged) of a journey that has
--                  started and is not finished. Checked at any hour. Command
--                  gets one alert per officer, naming the journey.
--   Programme      officers with an active title on a programme that is
--   officers       'active' and running today (Lagos date between its start
--                  and end date). Checked 06:00-22:00 Lagos only, so the end
--                  of a programme day does not page Command overnight, and
--                  Command gets ONE combined alert per run listing everyone
--                  who went silent, not one per officer.
--
-- Every silent officer also gets a 'location_paused' push asking them to
-- reopen TCNP; a push reaches the phone even with TCNP closed. One alert per
-- silent spell: nothing more until the officer sends a new location and goes
-- silent again (that push is the marker).
--
-- No BEGIN/COMMIT: the migration runner wraps each file in its own transaction.

CREATE INDEX IF NOT EXISTS user_locations_user_updated_idx
  ON public.user_locations (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS notifications_location_paused_idx
  ON public.notifications (user_id, created_at DESC)
  WHERE metadata->>'kind' = 'location_paused';

-- check_time exists so the rule can be tested at a chosen hour; the scheduler
-- never passes it, and no client role can call the function at all.
DROP FUNCTION IF EXISTS public.notify_silent_duty_officers();
CREATE OR REPLACE FUNCTION public.notify_silent_duty_officers(check_time timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  officer record;
  officer_label text;
  last_seen text;
  silent_minutes integer;
  lagos_now timestamp := check_time AT TIME ZONE 'Africa/Lagos';
  programme_hours boolean := extract(hour FROM check_time AT TIME ZONE 'Africa/Lagos') BETWEEN 6 AND 21;
  group_lines text[] := '{}';
  group_ids jsonb := '[]'::jsonb;
  group_programs jsonb := '[]'::jsonb;
  group_message text;
  sent integer := 0;
  n integer;
BEGIN
  -- Overlapping runs (a slow run meeting the next tick) must not double-alert.
  IF NOT pg_try_advisory_xact_lock(hashtextextended('notify_silent_duty_officers', 0)) THEN
    RETURN 0;
  END IF;

  FOR officer IN
    WITH started AS (
      SELECT j.id, j.assigned_duty_officer_id
      FROM public.journeys j
      WHERE j.status::text NOT IN ('planned', 'scheduled', 'planning', 'completed', 'cancelled')
    ),
    on_duty AS (
      -- A Duty Officer row decides when there is one (same rule as My Operations).
      SELECT d.user_id, s.id AS journey_id
      FROM started s
      JOIN public.journey_duty_officers d ON d.journey_id = s.id
      WHERE coalesce(d.status, 'acknowledged') IN ('pending', 'acknowledged')
      UNION
      SELECT s.assigned_duty_officer_id, s.id
      FROM started s
      WHERE s.assigned_duty_officer_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.journey_duty_officers d
          WHERE d.journey_id = s.id AND d.user_id = s.assigned_duty_officer_id
        )
    ),
    running_programmes AS (
      SELECT p.id
      FROM public.programs p
      WHERE lower(btrim(coalesce(p.status, ''))) = 'active'
        AND lagos_now::date BETWEEN p.start_date::date AND coalesce(p.end_date::date, p.start_date::date)
    ),
    on_programme AS (
      SELECT a.user_id, a.program_id
      FROM public.title_assignments a
      JOIN running_programmes rp ON rp.id = a.program_id
      WHERE a.is_active = true AND programme_hours
    ),
    candidates AS (
      SELECT user_id, 1 AS priority, journey_id, NULL::uuid AS program_id FROM on_duty
      UNION ALL
      SELECT user_id, 2, NULL::uuid, program_id FROM on_programme
    ),
    -- Duty wins over programme, so a DO is never also counted in the group alert.
    chosen AS (
      SELECT DISTINCT ON (user_id) user_id, priority, journey_id, program_id
      FROM candidates
      ORDER BY user_id, priority, journey_id, program_id
    ),
    last_fix AS (
      SELECT ul.user_id, max(ul.updated_at) AS at
      FROM public.user_locations ul
      WHERE ul.user_id IN (SELECT user_id FROM chosen)
      GROUP BY ul.user_id
    )
    SELECT u.id, u.full_name, u.email, u.oscar, f.at AS last_at, c.priority, c.journey_id, c.program_id
    FROM chosen c
    JOIN public.users u ON u.id = c.user_id
    JOIN last_fix f ON f.user_id = u.id
    WHERE u.location_sharing_enabled = true
      AND u.is_active = true
      AND u.activation_status = 'active'
      AND f.at < check_time - interval '10 minutes'
      AND f.at > check_time - interval '12 hours'
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = u.id
          AND n.metadata->>'kind' = 'location_paused'
          AND n.created_at > f.at
      )
    ORDER BY c.priority, f.at
  LOOP
    officer_label := coalesce(nullif(btrim(officer.full_name), ''), officer.email, 'An officer')
      || CASE WHEN nullif(btrim(coalesce(officer.oscar, '')), '') IS NOT NULL THEN ' (' || btrim(officer.oscar) || ')' ELSE '' END;
    last_seen := to_char(officer.last_at AT TIME ZONE 'Africa/Lagos', 'HH24:MI');
    silent_minutes := floor(extract(epoch FROM check_time - officer.last_at) / 60)::integer;

    IF officer.priority = 1 THEN
      INSERT INTO public.notifications (user_id, title, message, type, channel, metadata, journey_id, is_read)
      SELECT u.id, 'Officer location silent',
        officer_label || ' is on duty but their location has not updated for ' || silent_minutes
          || ' minutes (last seen ' || last_seen || '). TCNP may be closed or their phone locked. Check on them from Live Tracking.',
        'alert', 'push',
        jsonb_build_object('kind', 'location_silent', 'officer_id', officer.id, 'journey_id', officer.journey_id, 'last_seen_at', officer.last_at),
        officer.journey_id, false
      FROM public.users u
      WHERE u.id <> officer.id
        AND u.is_active = true
        AND u.activation_status = 'active'
        AND (u.has_admin_access OR u.role::text IN (
          'super_admin', 'dev_admin', 'admin', 'captain', 'vice_captain',
          'head_of_operations', 'head_of_command', 'command'
        ));
      GET DIAGNOSTICS n = ROW_COUNT;
      sent := sent + n;
    ELSE
      group_lines := group_lines || (officer_label || ' (last seen ' || last_seen || ')');
      group_ids := group_ids || to_jsonb(officer.id::text);
      IF NOT group_programs ? officer.program_id::text THEN
        group_programs := group_programs || to_jsonb(officer.program_id::text);
      END IF;
    END IF;

    -- A push reaches the officer even with TCNP closed; opening it resumes sharing.
    INSERT INTO public.notifications (user_id, title, message, type, channel, metadata, journey_id, is_read)
    VALUES (officer.id, 'Your location is paused',
      CASE WHEN officer.priority = 1 THEN 'You are on duty' ELSE 'You are on today''s programme' END
        || ' but TCNP has not shared your location since ' || last_seen
        || '. Open TCNP and keep it on screen so Command can see you.',
      'alert', 'push',
      jsonb_build_object('kind', 'location_paused', 'officer_id', officer.id, 'journey_id', officer.journey_id,
        'program_id', officer.program_id, 'last_seen_at', officer.last_at),
      officer.journey_id, false);
    sent := sent + 1;
  END LOOP;

  -- One combined alert for programme officers, so a busy day stays readable.
  IF cardinality(group_lines) > 0 THEN
    group_message := CASE
      WHEN cardinality(group_lines) = 1 THEN group_lines[1] || ' is on today''s programme but their location has stopped updating.'
      ELSE cardinality(group_lines) || ' officers on today''s programme have stopped sharing location: '
        || array_to_string(group_lines[1:10], ', ')
        || CASE WHEN cardinality(group_lines) > 10 THEN ' and ' || (cardinality(group_lines) - 10) || ' more' ELSE '' END || '.'
    END || ' TCNP may be closed or their phones locked. Check Live Tracking.';

    INSERT INTO public.notifications (user_id, title, message, type, channel, metadata, is_read)
    SELECT u.id,
      CASE WHEN cardinality(group_lines) = 1 THEN 'Officer location silent' ELSE 'Officers'' locations silent' END,
      group_message, 'alert', 'push',
      jsonb_build_object('kind', 'location_silent', 'officer_ids', group_ids, 'program_ids', group_programs),
      false
    FROM public.users u
    WHERE u.is_active = true
      AND u.activation_status = 'active'
      AND (u.has_admin_access OR u.role::text IN (
        'super_admin', 'dev_admin', 'admin', 'captain', 'vice_captain',
        'head_of_operations', 'head_of_command', 'command'
      ));
    GET DIAGNOSTICS n = ROW_COUNT;
    sent := sent + n;
  END IF;

  RETURN sent;
END;
$$;

-- Only the scheduler runs this; no client can trigger alerts about others.
REVOKE ALL ON FUNCTION public.notify_silent_duty_officers(timestamptz) FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'tcnp-silent-duty-officers';
SELECT cron.schedule(
  'tcnp-silent-duty-officers',
  '*/2 * * * *',
  $$SELECT public.notify_silent_duty_officers();$$
);
