-- Alpha pre-arrival timelines, kept in the database (2026-11-16).
--
-- The Alpha page had a pre-arrival checklist that lived only in the browser:
-- a reload wiped it, it knew no Papa, programme, ETA or who ticked what, and
-- its milestones did not match the SOP. This stores one timeline per Papa per
-- programme, one row per task (so two AOs ticking at the same moment never
-- overwrite each other), seeded from SOP TCNP.01.04 (Arrival Routines),
-- TCNP.01.06 (Airport Operations) and the HOD-AO lines of TCNP.01.07
-- (Protocol Check-in Procedures: visa 2 weeks out, immigration 24h out):
--   2 weeks, 1 week, 24h, 12h, 6h, 2h and 1h before ETA, and on landing.
-- A task is due at ETA + offset_minutes. The ETA is the head's override, else
-- the final live leg of the Papa's flight itinerary for that programme, else
-- papas.flight_arrival_time when the Papa belongs to that programme.
--
-- Access (THE ONE RULE, see 20261116170000_unit_access_single_rule.sql):
--   read          is_admin() OR is_unit_member('alpha') OR is_unit_member('command')
--   start / tick  can_work_unit_programme('alpha', programme)   (RPCs below)
--                 OR can_coordinate_unit('alpha') OR is_admin(): those two
--                 already hold full write access through RLS, so the RPCs
--                 never refuse them something the table would allow.
--   edit / delete / override ETA   can_coordinate_unit('alpha') OR is_admin()
-- Admin and Command are never reduced: is_admin() passes every check here.
--
-- Optional: alpha_send_timeline_overdue() (pg_cron, every 30 minutes) tells
-- the Alpha head(s) once when a milestone of a timeline passes its due time
-- with tasks still open (kind 'alpha_timeline_overdue').

-- ───────────────────────── Tables ─────────────────────────

CREATE TABLE IF NOT EXISTS public.alpha_arrival_timelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  papa_id uuid NOT NULL REFERENCES public.papas(id) ON DELETE CASCADE,
  eagle_square_id uuid REFERENCES public.eagle_squares(id) ON DELETE SET NULL,
  -- Set by the Alpha head when the itinerary is wrong or missing.
  eta_override timestamptz,
  notes text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alpha_arrival_timelines_papa_program UNIQUE (program_id, papa_id),
  CONSTRAINT alpha_arrival_timelines_notes_length CHECK (notes IS NULL OR length(notes) <= 2000)
);

DROP TRIGGER IF EXISTS alpha_arrival_timelines_set_updated_at ON public.alpha_arrival_timelines;
CREATE TRIGGER alpha_arrival_timelines_set_updated_at
BEFORE UPDATE ON public.alpha_arrival_timelines
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_alpha_arrival_timelines_papa ON public.alpha_arrival_timelines(papa_id);

CREATE TABLE IF NOT EXISTS public.alpha_arrival_timeline_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timeline_id uuid NOT NULL REFERENCES public.alpha_arrival_timelines(id) ON DELETE CASCADE,
  milestone_key text NOT NULL,
  -- Minutes relative to the ETA: negative is before it, 0 is on landing.
  offset_minutes integer NOT NULL,
  label text NOT NULL,
  -- Who the SOP makes responsible ("HOD / AO", "TO"), and the SOP section.
  owner text,
  sop_ref text,
  position integer NOT NULL DEFAULT 0,
  done_at timestamptz,
  done_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  note text,
  note_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  note_at timestamptz,
  CONSTRAINT alpha_timeline_items_label CHECK (length(btrim(label)) > 0),
  CONSTRAINT alpha_timeline_items_note_length CHECK (note IS NULL OR length(note) <= 500)
);

-- Kept outside CREATE TABLE so a re-run picks up a changed milestone list.
ALTER TABLE public.alpha_arrival_timeline_items DROP CONSTRAINT IF EXISTS alpha_timeline_items_milestone;
ALTER TABLE public.alpha_arrival_timeline_items ADD CONSTRAINT alpha_timeline_items_milestone CHECK (milestone_key IN (
  't_minus_2w', 't_minus_1w', 't_minus_24h', 't_minus_12h', 't_minus_6h', 't_minus_2h', 't_minus_1h', 'on_landing'
));

CREATE INDEX IF NOT EXISTS idx_alpha_timeline_items_timeline ON public.alpha_arrival_timeline_items(timeline_id, position);

ALTER TABLE public.alpha_arrival_timelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alpha_arrival_timeline_items ENABLE ROW LEVEL SECURITY;

-- ───────────────────────── Policies ─────────────────────────

-- One read rule for both tables.
CREATE OR REPLACE FUNCTION public.can_read_alpha_timelines()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_admin() OR public.is_unit_member('alpha') OR public.is_unit_member('command');
$$;

REVOKE ALL ON FUNCTION public.can_read_alpha_timelines() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_alpha_timelines() TO authenticated, service_role;

DROP POLICY IF EXISTS alpha_arrival_timelines_select ON public.alpha_arrival_timelines;
CREATE POLICY alpha_arrival_timelines_select ON public.alpha_arrival_timelines
FOR SELECT TO authenticated USING (public.can_read_alpha_timelines());

DROP POLICY IF EXISTS alpha_arrival_timelines_coordinate ON public.alpha_arrival_timelines;
CREATE POLICY alpha_arrival_timelines_coordinate ON public.alpha_arrival_timelines
FOR ALL TO authenticated
USING (public.can_coordinate_unit('alpha') OR public.is_admin())
WITH CHECK (public.can_coordinate_unit('alpha') OR public.is_admin());

DROP POLICY IF EXISTS alpha_timeline_items_select ON public.alpha_arrival_timeline_items;
CREATE POLICY alpha_timeline_items_select ON public.alpha_arrival_timeline_items
FOR SELECT TO authenticated USING (public.can_read_alpha_timelines());

DROP POLICY IF EXISTS alpha_timeline_items_coordinate ON public.alpha_arrival_timeline_items;
CREATE POLICY alpha_timeline_items_coordinate ON public.alpha_arrival_timeline_items
FOR ALL TO authenticated
USING (public.can_coordinate_unit('alpha') OR public.is_admin())
WITH CHECK (public.can_coordinate_unit('alpha') OR public.is_admin());

REVOKE ALL ON public.alpha_arrival_timelines, public.alpha_arrival_timeline_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alpha_arrival_timelines, public.alpha_arrival_timeline_items TO authenticated;

-- ───────────────────────── Helpers ─────────────────────────

-- Who may start a timeline or tick its tasks for a programme.
CREATE OR REPLACE FUNCTION public.can_tick_alpha_timeline(target_program uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT target_program IS NOT NULL AND (
    public.is_admin()
    OR public.can_coordinate_unit('alpha')
    OR public.can_work_unit_programme('alpha', target_program)
  );
$$;

REVOKE ALL ON FUNCTION public.can_tick_alpha_timeline(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_tick_alpha_timeline(uuid) TO authenticated, service_role;

-- The ETA a timeline counts from, and where it came from.
CREATE OR REPLACE FUNCTION public.alpha_arrival_eta(target_papa uuid, target_program uuid, override timestamptz)
RETURNS TABLE (eta timestamptz, eta_source text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- The final leg that will still fly. Its arrival is the ETA; when that leg
  -- has no time yet there is no itinerary ETA (an earlier connecting leg's
  -- arrival is not the Papa's arrival).
  WITH final_leg AS (
    SELECT coalesce(flight_leg.actual_arrival, flight_leg.scheduled_arrival) AS arrival
    FROM public.flight_itineraries itinerary
    JOIN public.flight_legs flight_leg ON flight_leg.itinerary_id = itinerary.id
    WHERE itinerary.papa_id = target_papa
      AND itinerary.program_id = target_program
      AND itinerary.status <> 'cancelled'
      AND flight_leg.status NOT IN ('cancelled', 'unavailable')
    ORDER BY flight_leg.leg_order DESC
    LIMIT 1
  ),
  leg AS (
    SELECT arrival FROM final_leg WHERE arrival IS NOT NULL
  ),
  -- papas.flight_arrival_time belongs to the Papa's own programme only.
  papa_row AS (
    SELECT papa.flight_arrival_time AS arrival
    FROM public.papas papa
    WHERE papa.id = target_papa
      AND papa.program_id = target_program
      AND papa.flight_arrival_time IS NOT NULL
  )
  SELECT
    coalesce(override, (SELECT arrival FROM leg), (SELECT arrival FROM papa_row)),
    CASE
      WHEN override IS NOT NULL THEN 'override'
      WHEN EXISTS (SELECT 1 FROM leg) THEN 'itinerary'
      WHEN EXISTS (SELECT 1 FROM papa_row) THEN 'papa'
      ELSE 'none'
    END;
$$;

-- Internal: only the functions below call it.
REVOKE ALL ON FUNCTION public.alpha_arrival_eta(uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.alpha_arrival_eta(uuid, uuid, timestamptz) TO service_role;

-- ───────────────────────── RPCs ─────────────────────────

-- The Papas of a programme with their ETA and timeline progress, for the
-- picker. Papas are read through this function because papas RLS shows an
-- Alpha member only Papas that already have a flight or an Eagle Square.
-- Returns no contact or passport details. Everyone who may read timelines
-- gets the flight number, arrival city and ETA: Command-unit members already
-- read the itineraries and legs (flight_itineraries_operational_select), so
-- hiding the ETA here would only confuse them, not protect anything.
CREATE OR REPLACE FUNCTION public.alpha_arrival_board(target_program uuid)
RETURNS TABLE (
  papa_id uuid,
  full_name text,
  title text,
  flight_number text,
  arrival_city text,
  eta timestamptz,
  eta_source text,
  timeline_id uuid,
  items_total integer,
  items_done integer,
  items_overdue integer,
  next_due_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.can_read_alpha_timelines() THEN
    RAISE EXCEPTION 'Only Alpha, Command and admins can see arrival timelines' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    papa.id,
    papa.full_name,
    papa.title,
    papa.flight_number,
    papa.arrival_city,
    arrival.eta,
    arrival.eta_source,
    timeline.id,
    coalesce(progress.total, 0)::integer,
    coalesce(progress.done, 0)::integer,
    coalesce(progress.overdue, 0)::integer,
    progress.next_due
  FROM public.papas papa
  LEFT JOIN public.alpha_arrival_timelines timeline
    ON timeline.papa_id = papa.id AND timeline.program_id = target_program
  CROSS JOIN LATERAL public.alpha_arrival_eta(papa.id, target_program, timeline.eta_override) AS arrival
  LEFT JOIN LATERAL (
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE item.done_at IS NOT NULL) AS done,
      count(*) FILTER (WHERE item.done_at IS NULL AND arrival.eta IS NOT NULL
        AND arrival.eta + make_interval(mins => item.offset_minutes) < now()) AS overdue,
      min(arrival.eta + make_interval(mins => item.offset_minutes)) FILTER (WHERE item.done_at IS NULL) AS next_due
    FROM public.alpha_arrival_timeline_items item
    WHERE item.timeline_id = timeline.id
  ) progress ON true
  WHERE coalesce(papa.is_deleted, false) = false
    AND (papa.program_id = target_program
      OR timeline.id IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.flight_itineraries itinerary
        WHERE itinerary.papa_id = papa.id AND itinerary.program_id = target_program
      ))
  ORDER BY arrival.eta NULLS LAST, papa.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.alpha_arrival_board(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.alpha_arrival_board(uuid) TO authenticated, service_role;

-- Start (or reopen) the timeline for one Papa on one programme. Idempotent:
-- a second call returns the same timeline and never duplicates its tasks.
CREATE OR REPLACE FUNCTION public.alpha_start_arrival_timeline(target_program uuid, target_papa uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  timeline uuid;
BEGIN
  IF target_program IS NULL OR target_papa IS NULL THEN
    RAISE EXCEPTION 'Choose a programme and a Papa first' USING ERRCODE = '22023';
  END IF;
  IF NOT public.can_tick_alpha_timeline(target_program) THEN
    RAISE EXCEPTION 'You are not active on this programme. Ask your Alpha head to add you.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.programs WHERE id = target_program) THEN
    RAISE EXCEPTION 'Programme not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.papas papa
    WHERE papa.id = target_papa
      AND coalesce(papa.is_deleted, false) = false
      AND (papa.program_id = target_program OR EXISTS (
        SELECT 1 FROM public.flight_itineraries itinerary
        WHERE itinerary.papa_id = papa.id AND itinerary.program_id = target_program
      ))
  ) THEN
    RAISE EXCEPTION 'This Papa is not on that programme' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.alpha_arrival_timelines (program_id, papa_id, created_by)
  VALUES (target_program, target_papa, auth.uid())
  ON CONFLICT (program_id, papa_id) DO NOTHING
  RETURNING id INTO timeline;

  IF timeline IS NULL THEN
    SELECT id INTO timeline FROM public.alpha_arrival_timelines
    WHERE program_id = target_program AND papa_id = target_papa;
  END IF;

  -- Seed the SOP tasks unless the timeline already has some (a head may have
  -- edited them; never put back what they removed one by one).
  IF NOT EXISTS (SELECT 1 FROM public.alpha_arrival_timeline_items WHERE timeline_id = timeline) THEN
    INSERT INTO public.alpha_arrival_timeline_items (timeline_id, milestone_key, offset_minutes, label, owner, sop_ref, position)
    SELECT timeline, seed.milestone_key, seed.offset_minutes, seed.label, seed.owner, seed.sop_ref, seed.position
    FROM (VALUES
      ('t_minus_2w',  -20160, 'Confirm visa status (international guest); if a visa is needed and not processed, confirm visa-on-arrival', 'HOD / AO', 'TCNP.01.07', 1),
      ('t_minus_1w',  -10080, 'Get the flight information (airline, flight number, ETA)', 'HOD / AO', 'TCNP.01.04', 2),
      ('t_minus_1w',  -10080, 'Review this Papa''s pre-arrival checklist with Command Centre', 'AO', 'TCNP.01.06', 3),
      ('t_minus_24h', -1440,  'Finalise all arrival arrangements with SSS and FAAN', 'HOD / AO', 'TCNP.01.04', 4),
      ('t_minus_24h', -1440,  'Confirm the required Cheetah(s) are available with the TO', 'TO with HOD / AO', 'TCNP.01.04', 5),
      ('t_minus_24h', -1440,  'Confirm immigration status (international guest) and what the checkpoint and arrival lounge require', 'HOD / AO', 'TCNP.01.07', 6),
      ('t_minus_12h', -720,   'Confirm immigration formalities with the Eagle Square ODS', 'AO / HOD', 'TCNP.01.04', 7),
      ('t_minus_6h',  -360,   'Reconfirm immigration formalities with the Eagle Square ODS', 'AO / HOD', 'TCNP.01.04', 8),
      ('t_minus_6h',  -360,   'Check and approve the Cheetah parking and pick-up points', 'AO', 'TCNP.01.06', 9),
      ('t_minus_2h',  -120,   'At least two AOs at the Eagle Square', 'AO', 'TCNP.01.04', 10),
      ('t_minus_2h',  -120,   'Confirm the actual ETA with the airline authorities', 'AO', 'TCNP.01.04', 11),
      ('t_minus_2h',  -120,   'Radios and charged, internet-enabled phones working', 'AO', 'TCNP.01.04', 12),
      ('t_minus_2h',  -120,   'One AO holds the emergency contact list (visa, customs, immigration, partner DOs and TOs)', 'AO', 'TCNP.01.06', 13),
      ('t_minus_1h',  -60,    'Drivers and escorts oriented and the route arranged', 'TO', 'TCNP.01.04', 14),
      ('on_landing',  0,      'Confirm the arrangements are intact (immigration formalities) and transport with the TO', 'AO', 'TCNP.01.04', 15),
      ('on_landing',  0,      'Coordinate bag and baggage tagging at the arrival lounge', 'AO', 'TCNP.01.04', 16),
      ('on_landing',  0,      'Call for transport and confirm the landing to the Nest Officer', 'AO', 'TCNP.01.04', 17)
    ) AS seed(milestone_key, offset_minutes, label, owner, sop_ref, position);
  END IF;

  RETURN timeline;
END;
$$;

REVOKE ALL ON FUNCTION public.alpha_start_arrival_timeline(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.alpha_start_arrival_timeline(uuid, uuid) TO authenticated, service_role;

-- Tick, untick or annotate one task. is_done NULL leaves the tick as it is
-- (note only); item_note NULL leaves the note, '' clears it. The first tick
-- keeps its officer and time, so a second AO ticking late does not take it.
CREATE OR REPLACE FUNCTION public.alpha_tick_timeline_item(target_item uuid, is_done boolean DEFAULT NULL, item_note text DEFAULT NULL)
RETURNS public.alpha_arrival_timeline_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  item_program uuid;
  result public.alpha_arrival_timeline_items;
  clean_note text := nullif(btrim(item_note), '');
BEGIN
  SELECT timeline.program_id INTO item_program
  FROM public.alpha_arrival_timeline_items item
  JOIN public.alpha_arrival_timelines timeline ON timeline.id = item.timeline_id
  WHERE item.id = target_item;
  IF item_program IS NULL THEN RAISE EXCEPTION 'Timeline task not found' USING ERRCODE = 'P0002'; END IF;

  IF NOT public.can_tick_alpha_timeline(item_program) THEN
    RAISE EXCEPTION 'You are not active on this programme. Ask your Alpha head to add you.' USING ERRCODE = '42501';
  END IF;
  IF clean_note IS NOT NULL AND length(clean_note) > 500 THEN
    RAISE EXCEPTION 'Keep the note under 500 characters' USING ERRCODE = '22023';
  END IF;

  -- The audit guard below lets only this function write who ticked and when.
  PERFORM set_config('tcnp.alpha_tick', 'on', true);
  UPDATE public.alpha_arrival_timeline_items
  SET done_at = CASE WHEN is_done IS NULL THEN done_at WHEN is_done THEN coalesce(done_at, now()) ELSE NULL END,
      done_by = CASE WHEN is_done IS NULL THEN done_by WHEN is_done THEN coalesce(done_by, auth.uid()) ELSE NULL END,
      note = CASE WHEN item_note IS NULL THEN note ELSE clean_note END,
      note_by = CASE WHEN item_note IS NULL THEN note_by WHEN clean_note IS NULL THEN NULL ELSE auth.uid() END,
      note_at = CASE WHEN item_note IS NULL THEN note_at WHEN clean_note IS NULL THEN NULL ELSE now() END
  WHERE id = target_item
  RETURNING * INTO result;
  PERFORM set_config('tcnp.alpha_tick', '', true);

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.alpha_tick_timeline_item(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.alpha_tick_timeline_item(uuid, boolean, text) TO authenticated, service_role;

-- Who ticked a task and when, and who wrote its note, are written only by
-- alpha_tick_timeline_item(). A coordinator editing a row directly (label,
-- owner, offset, position) cannot forge or erase them. Allowed through:
-- the RPC (it sets tcnp.alpha_tick for its own UPDATE), foreign-key actions
-- (a deleted user's ids become NULL; they run nested, pg_trigger_depth() > 1),
-- and server-side maintenance with no signed-in user (service role, SQL).
CREATE OR REPLACE FUNCTION public.alpha_timeline_items_guard_audit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF coalesce(current_setting('tcnp.alpha_tick', true), '') = 'on'
     OR pg_trigger_depth() > 1
     OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.done_at IS NOT NULL OR NEW.done_by IS NOT NULL OR NEW.note IS NOT NULL
       OR NEW.note_by IS NOT NULL OR NEW.note_at IS NOT NULL THEN
      RAISE EXCEPTION 'New tasks start unticked and without a note. Tick them on the timeline.' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.done_at IS DISTINCT FROM OLD.done_at OR NEW.done_by IS DISTINCT FROM OLD.done_by
     OR NEW.note IS DISTINCT FROM OLD.note OR NEW.note_by IS DISTINCT FROM OLD.note_by
     OR NEW.note_at IS DISTINCT FROM OLD.note_at THEN
    RAISE EXCEPTION 'Ticks and notes are changed on the timeline, not edited directly.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.alpha_timeline_items_guard_audit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS alpha_timeline_items_guard_audit ON public.alpha_arrival_timeline_items;
CREATE TRIGGER alpha_timeline_items_guard_audit
BEFORE INSERT OR UPDATE ON public.alpha_arrival_timeline_items
FOR EACH ROW EXECUTE FUNCTION public.alpha_timeline_items_guard_audit();

-- ───────────────────────── Overdue notice ─────────────────────────

-- What has already been sent. Keyed on the due time as well, so moving the ETA
-- earns a fresh notice.
CREATE TABLE IF NOT EXISTS public.alpha_timeline_overdue_notices (
  timeline_id uuid NOT NULL REFERENCES public.alpha_arrival_timelines(id) ON DELETE CASCADE,
  milestone_key text NOT NULL,
  due_at timestamptz NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (timeline_id, milestone_key, due_at)
);

-- Internal bookkeeping: no policies, so the app can neither read nor write it.
ALTER TABLE public.alpha_timeline_overdue_notices ENABLE ROW LEVEL SECURITY;

-- Tells every active Alpha head once per milestone that passed its due time
-- with tasks still open. Milestones that were more than 12 hours overdue when
-- this runs are left alone, so setting an ETA late (or switching this on)
-- never floods anyone with old news.
CREATE OR REPLACE FUNCTION public.alpha_send_timeline_overdue()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  sent integer;
BEGIN
  WITH overdue AS (
    SELECT
      timeline.id AS timeline_id,
      timeline.program_id,
      timeline.papa_id,
      papa.full_name AS papa_name,
      item.milestone_key,
      arrival.eta + make_interval(mins => item.offset_minutes) AS due_at,
      count(*) AS open_tasks
    FROM public.alpha_arrival_timelines timeline
    JOIN public.papas papa ON papa.id = timeline.papa_id
    JOIN public.programs programme ON programme.id = timeline.program_id
    CROSS JOIN LATERAL public.alpha_arrival_eta(timeline.papa_id, timeline.program_id, timeline.eta_override) AS arrival
    JOIN public.alpha_arrival_timeline_items item ON item.timeline_id = timeline.id
    WHERE item.done_at IS NULL
      -- The board hides deleted Papas and nobody acts on a closed programme.
      AND coalesce(papa.is_deleted, false) = false
      AND coalesce(programme.status, 'planning') NOT IN ('completed', 'archived')
      AND arrival.eta IS NOT NULL
      AND arrival.eta + make_interval(mins => item.offset_minutes) < now()
      AND arrival.eta + make_interval(mins => item.offset_minutes) > now() - interval '12 hours'
    GROUP BY timeline.id, timeline.program_id, timeline.papa_id, papa.full_name, item.milestone_key,
      arrival.eta + make_interval(mins => item.offset_minutes)
  ),
  heads AS (
    SELECT DISTINCT membership.user_id
    FROM public.unit_memberships membership
    JOIN public.units unit_record ON unit_record.id = membership.unit_id
    JOIN public.users head ON head.id = membership.user_id
    WHERE unit_record.slug = 'alpha'
      AND unit_record.is_active = true
      AND membership.status = 'active'
      AND membership.access_level = 'head'
      AND coalesce(head.is_active, true) = true
      AND coalesce(head.activation_status, 'active') = 'active'
  ),
  -- Claimed only when someone will receive it: with no active head the
  -- milestone stays unannounced, and a head appointed inside the 12-hour
  -- window still gets it on the next run.
  claimed AS (
    INSERT INTO public.alpha_timeline_overdue_notices (timeline_id, milestone_key, due_at)
    SELECT overdue.timeline_id, overdue.milestone_key, overdue.due_at FROM overdue
    WHERE EXISTS (SELECT 1 FROM heads)
    ON CONFLICT DO NOTHING
    RETURNING timeline_id, milestone_key, due_at
  )
  INSERT INTO public.notifications (user_id, title, message, type, channel, metadata, is_read)
  SELECT
    heads.user_id,
    'Arrival timeline overdue',
    coalesce(overdue.papa_name, 'A Papa') || ' — '
      || CASE overdue.milestone_key
           WHEN 't_minus_2w' THEN '2 week'
           WHEN 't_minus_1w' THEN '1 week'
           WHEN 't_minus_24h' THEN '24 hour'
           WHEN 't_minus_12h' THEN '12 hour'
           WHEN 't_minus_6h' THEN '6 hour'
           WHEN 't_minus_2h' THEN '2 hour'
           WHEN 't_minus_1h' THEN '1 hour'
           ELSE 'on-landing'
         END
      || ' tasks not done (' || overdue.open_tasks || ' open). Was due '
      || to_char(overdue.due_at AT TIME ZONE 'Africa/Lagos', 'Dy DD Mon, HH24:MI'),
    'warning',
    'push',
    jsonb_build_object(
      'kind', 'alpha_timeline_overdue',
      'unit_slug', 'alpha',
      'timeline_id', overdue.timeline_id,
      'program_id', overdue.program_id,
      'papa_id', overdue.papa_id,
      'milestone', overdue.milestone_key
    ),
    false
  FROM overdue
  JOIN claimed ON claimed.timeline_id = overdue.timeline_id
    AND claimed.milestone_key = overdue.milestone_key
    AND claimed.due_at = overdue.due_at
  CROSS JOIN heads;

  GET DIAGNOSTICS sent = ROW_COUNT;
  RETURN sent;
END;
$$;

-- Run by the scheduler only.
REVOKE ALL ON FUNCTION public.alpha_send_timeline_overdue() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.alpha_send_timeline_overdue() TO service_role;

-- Every 30 minutes. Unscheduling first keeps this migration repeatable.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'tcnp-alpha-timeline-overdue';
SELECT cron.schedule(
  'tcnp-alpha-timeline-overdue',
  '*/30 * * * *',
  $$SELECT public.alpha_send_timeline_overdue();$$
);

-- ───────────────────────── Realtime ─────────────────────────

-- The timeline card listens for ticks so two AOs at the Eagle Square see each
-- other's work. Realtime applies the SELECT policies above to every event.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['alpha_arrival_timelines', 'alpha_arrival_timeline_items']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
