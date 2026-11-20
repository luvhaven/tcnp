-- Tango drivers (2026-11-16).
--
-- Drivers were free text on cheetahs (driver_name / driver_phone NOT NULL) and
-- on journey_cheetahs. This migration gives them their own records:
--
--   1. tango_drivers            one row per driver (not app users).
--   2. tango_driver_licences    licence details, kept apart because they are
--                               personal data: Tango head / sub-leads (and
--                               platform admins, through can_coordinate_unit)
--                               only. Command does not see licence numbers.
--   3. tango_driver_assignments per-programme driver roster (driver, Cheetah,
--                               role, window, status).
--   4. driver_id on journey_cheetahs and driver_feedback, default_driver_id on
--      cheetahs. Copy triggers keep driver_name / driver_phone filled from the
--      driver record, so every existing reader (journeys, incidents, my
--      operations, current mission card) keeps working unchanged.
--      cheetahs.driver_name / driver_phone become optional.
--   5. One guard for every place a driver is put to work: a suspended or
--      inactive driver, a driver with no licence on record, or a licence that
--      expires before the work ends is refused (SQLSTATE 23514, HINT
--      'tango_driver_guard'). The guard is a safety rule, so it applies to
--      everyone, admins included.
--   6. tango_driver_roster(): drivers with their licence state
--      (valid | expiring | expired | missing), class and expiry date, never the
--      licence number. Readable by Tango members, Command and admins.
--   7. Daily licence-expiry reminder to Tango coordinators
--      (notification kind 'tango_licence_expiring', routed to /tango?tab=drivers).
--
-- Access (THE ONE RULE, see 20261116170000_unit_access_single_rule.sql):
--   drivers, assignments   read  is_admin() OR is_unit_member('tango')
--                          write can_coordinate_unit('tango') OR is_admin()
--   licences               read/write can_coordinate_unit('tango') only
--   journey_cheetahs       adds a write path for Command, Tango coordinators and
--                          members doing programme work on the journey's
--                          programme (can_work_unit_programme('tango', programme)).
--                          The head-only policy stays.
--
-- Repeatable: IF NOT EXISTS, CREATE OR REPLACE, DROP ... IF EXISTS.

-- ─── 1. Drivers ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tango_drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text NOT NULL,
  alt_phone text,
  partner_id uuid REFERENCES public.fleet_partners(id) ON DELETE SET NULL,
  engagement_type text NOT NULL DEFAULT 'internal',
  status text NOT NULL DEFAULT 'available',
  notes text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tango_drivers_name_present CHECK (btrim(full_name) <> ''),
  CONSTRAINT tango_drivers_phone_present CHECK (btrim(phone) <> ''),
  CONSTRAINT tango_drivers_engagement CHECK (engagement_type IN ('internal', 'partner', 'contract')),
  CONSTRAINT tango_drivers_status CHECK (status IN ('available', 'off_duty', 'suspended', 'inactive'))
);

CREATE INDEX IF NOT EXISTS idx_tango_drivers_name ON public.tango_drivers (lower(full_name));
CREATE INDEX IF NOT EXISTS idx_tango_drivers_partner ON public.tango_drivers (partner_id) WHERE partner_id IS NOT NULL;

COMMENT ON TABLE public.tango_drivers IS
  'Tango drivers (not app users). Licence details live in tango_driver_licences (coordinators only).';

-- ─── 2. Licences (coordinators only) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tango_driver_licences (
  driver_id uuid PRIMARY KEY REFERENCES public.tango_drivers(id) ON DELETE CASCADE,
  licence_number text NOT NULL,
  licence_class text,
  issued_on date,
  expires_on date NOT NULL,
  verified_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tango_driver_licences_number_present CHECK (btrim(licence_number) <> ''),
  CONSTRAINT tango_driver_licences_dates CHECK (issued_on IS NULL OR issued_on <= expires_on)
);

-- One licence number per driver, ignoring case and spaces.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tango_driver_licences_number
  ON public.tango_driver_licences (upper(regexp_replace(licence_number, '\s', '', 'g')));
CREATE INDEX IF NOT EXISTS idx_tango_driver_licences_expiry ON public.tango_driver_licences (expires_on);

COMMENT ON TABLE public.tango_driver_licences IS
  'Driver licence details. Read/write: can_coordinate_unit(''tango'') only (Tango head, sub-leads, platform admins). Others see the state through tango_driver_roster().';

-- ─── 3. Per-programme assignments ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tango_driver_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.tango_drivers(id) ON DELETE CASCADE,
  cheetah_id uuid REFERENCES public.cheetahs(id) ON DELETE SET NULL,
  role text NOT NULL DEFAULT 'primary',
  starts_at timestamptz,
  ends_at timestamptz,
  status text NOT NULL DEFAULT 'assigned',
  notes text,
  assigned_by uuid REFERENCES public.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tango_driver_assignments_role CHECK (role IN ('primary', 'backup', 'utility')),
  CONSTRAINT tango_driver_assignments_status CHECK (status IN ('assigned', 'confirmed', 'released', 'cancelled')),
  CONSTRAINT tango_driver_assignments_window CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at >= starts_at)
);

-- A driver is on a programme's roster once at a time; a Cheetah has one
-- primary driver per programme.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tango_driver_assignments_one_per_programme
  ON public.tango_driver_assignments (program_id, driver_id)
  WHERE status IN ('assigned', 'confirmed');
CREATE UNIQUE INDEX IF NOT EXISTS idx_tango_driver_assignments_one_primary_per_cheetah
  ON public.tango_driver_assignments (program_id, cheetah_id)
  WHERE role = 'primary' AND cheetah_id IS NOT NULL AND status IN ('assigned', 'confirmed');
CREATE INDEX IF NOT EXISTS idx_tango_driver_assignments_driver ON public.tango_driver_assignments (driver_id);

-- ─── 4. Links on existing tables ────────────────────────────────────────────

ALTER TABLE public.journey_cheetahs
  ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES public.tango_drivers(id) ON DELETE SET NULL;
ALTER TABLE public.driver_feedback
  ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES public.tango_drivers(id) ON DELETE SET NULL;
ALTER TABLE public.cheetahs
  ADD COLUMN IF NOT EXISTS default_driver_id uuid REFERENCES public.tango_drivers(id) ON DELETE SET NULL;

-- The vehicle form no longer requires free-text driver details.
ALTER TABLE public.cheetahs ALTER COLUMN driver_name DROP NOT NULL;
ALTER TABLE public.cheetahs ALTER COLUMN driver_phone DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_journey_cheetahs_driver ON public.journey_cheetahs (driver_id) WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_driver_feedback_driver ON public.driver_feedback (driver_id) WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cheetahs_default_driver ON public.cheetahs (default_driver_id) WHERE default_driver_id IS NOT NULL;

-- ─── 5. Licence state and the driver guard ──────────────────────────────────

-- valid | expiring (within 30 days) | expired | missing. Pure; the client
-- mirrors it in components/tango/DriversPanel.tsx (licenceState).
CREATE OR REPLACE FUNCTION public.tango_licence_state(expires_on date, on_date date DEFAULT NULL)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN expires_on IS NULL THEN 'missing'
    WHEN expires_on < coalesce(on_date, (now() AT TIME ZONE 'Africa/Lagos')::date) THEN 'expired'
    WHEN expires_on <= coalesce(on_date, (now() AT TIME ZONE 'Africa/Lagos')::date) + 30 THEN 'expiring'
    ELSE 'valid'
  END;
$$;

REVOKE ALL ON FUNCTION public.tango_licence_state(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tango_licence_state(date, date) TO authenticated, service_role;

-- Why a driver may not be put to work until `needed_until`, or NULL when they
-- may. Reads the licence table, so it is SECURITY DEFINER and internal: only
-- the guard triggers below call it.
CREATE OR REPLACE FUNCTION public.tango_driver_blocker(target_driver uuid, needed_until date)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH today AS (SELECT (now() AT TIME ZONE 'Africa/Lagos')::date AS d)
  SELECT CASE
    WHEN driver.id IS NULL THEN 'That driver no longer exists.'
    WHEN driver.status = 'suspended' THEN driver.full_name || ' is suspended and cannot be assigned.'
    WHEN driver.status = 'inactive' THEN driver.full_name || ' is inactive and cannot be assigned.'
    WHEN licence.driver_id IS NULL THEN driver.full_name || ' has no driving licence on record.'
    WHEN licence.expires_on < today.d THEN
      driver.full_name || '''s driving licence expired on ' || to_char(licence.expires_on, 'DD Mon YYYY') || '.'
    WHEN licence.expires_on < greatest(today.d, coalesce(needed_until, today.d)) THEN
      driver.full_name || '''s driving licence expires on ' || to_char(licence.expires_on, 'DD Mon YYYY')
        || ', before this assignment ends.'
  END
  FROM today
  LEFT JOIN public.tango_drivers driver ON driver.id = target_driver
  LEFT JOIN public.tango_driver_licences licence ON licence.driver_id = driver.id;
$$;

REVOKE ALL ON FUNCTION public.tango_driver_blocker(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tango_driver_blocker(uuid, date) TO service_role;

-- 5a. Programme roster: checked when a row starts or comes back into force, or
-- its driver, programme or end changes. Status-only moves to released /
-- cancelled are never blocked.
CREATE OR REPLACE FUNCTION public.guard_tango_driver_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  needed date;
  blocker text;
BEGIN
  IF NEW.status NOT IN ('assigned', 'confirmed') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
    AND OLD.status IN ('assigned', 'confirmed')
    AND NEW.driver_id IS NOT DISTINCT FROM OLD.driver_id
    AND NEW.program_id IS NOT DISTINCT FROM OLD.program_id
    AND NEW.ends_at IS NOT DISTINCT FROM OLD.ends_at
  THEN
    RETURN NEW;
  END IF;

  SELECT coalesce((NEW.ends_at AT TIME ZONE 'Africa/Lagos')::date, program.end_date, program.start_date)
    INTO needed
  FROM public.programs program
  WHERE program.id = NEW.program_id;

  blocker := public.tango_driver_blocker(NEW.driver_id, needed);
  IF blocker IS NOT NULL THEN
    RAISE EXCEPTION '%', blocker USING ERRCODE = '23514', HINT = 'tango_driver_guard';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_tango_driver_assignment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tango_driver_assignments_guard ON public.tango_driver_assignments;
CREATE TRIGGER tango_driver_assignments_guard
BEFORE INSERT OR UPDATE OF driver_id, program_id, ends_at, status ON public.tango_driver_assignments
FOR EACH ROW EXECUTE FUNCTION public.guard_tango_driver_assignment();

-- 5b. Journey allocations: guard + copy. A new allocation without a driver
-- takes the Cheetah's default driver when that driver may work (silently left
-- empty otherwise, so the Journeys page can still assign a vehicle). A new
-- allocation sent with driver_name '' means "no driver on purpose": the default
-- is skipped and the blank is stored as NULL. Setting a driver copies their
-- name and phone into driver_name / driver_phone; clearing driver_id leaves the
-- text alone (history survives a driver being deleted).
--
-- The guard runs when a driver is set or changed on an active allocation and
-- when a completed / cancelled allocation comes back into force with its
-- driver (as the programme roster guard does). A re-activation made by another
-- trigger (journeys.assigned_cheetah_id re-using a cancelled row) drops a
-- driver who may no longer work instead of failing the vehicle assignment.
CREATE OR REPLACE FUNCTION public.tango_journey_cheetah_driver()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  needed date;
  candidate uuid;
  blocker text;
  driver record;
  reactivated boolean := TG_OP = 'UPDATE'
    AND OLD.status IN ('completed', 'cancelled')
    AND NEW.status NOT IN ('completed', 'cancelled');
BEGIN
  SELECT (coalesce(journey.scheduled_arrival, journey.eta, journey.scheduled_departure, journey.etd)
            AT TIME ZONE 'Africa/Lagos')::date
    INTO needed
  FROM public.journeys journey
  WHERE journey.id = NEW.journey_id;

  IF TG_OP = 'INSERT' AND NEW.driver_id IS NULL AND NEW.driver_name IS NULL THEN
    SELECT cheetah.default_driver_id INTO candidate FROM public.cheetahs cheetah WHERE cheetah.id = NEW.cheetah_id;
    IF candidate IS NOT NULL AND public.tango_driver_blocker(candidate, needed) IS NULL THEN
      NEW.driver_id := candidate;
    END IF;
  ELSIF NEW.driver_id IS NOT NULL
    AND (TG_OP = 'INSERT' OR NEW.driver_id IS DISTINCT FROM OLD.driver_id OR reactivated)
    AND NEW.status NOT IN ('completed', 'cancelled')
  THEN
    blocker := public.tango_driver_blocker(NEW.driver_id, needed);
    IF blocker IS NOT NULL THEN
      IF reactivated AND NEW.driver_id IS NOT DISTINCT FROM OLD.driver_id AND pg_trigger_depth() > 1 THEN
        NEW.driver_id := NULL;
        NEW.driver_name := NULL;
        NEW.driver_phone := NULL;
      ELSE
        RAISE EXCEPTION '%', blocker USING ERRCODE = '23514', HINT = 'tango_driver_guard';
      END IF;
    END IF;
  END IF;

  IF NEW.driver_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.driver_id IS DISTINCT FROM OLD.driver_id) THEN
    SELECT full_name, phone INTO driver FROM public.tango_drivers WHERE id = NEW.driver_id;
    IF FOUND THEN
      NEW.driver_name := driver.full_name;
      NEW.driver_phone := driver.phone;
    END IF;
  END IF;

  -- A blank driver is no driver.
  NEW.driver_name := nullif(btrim(NEW.driver_name), '');
  NEW.driver_phone := nullif(btrim(NEW.driver_phone), '');
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tango_journey_cheetah_driver() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS journey_cheetahs_tango_driver ON public.journey_cheetahs;
CREATE TRIGGER journey_cheetahs_tango_driver
BEFORE INSERT OR UPDATE OF driver_id, status, driver_name, driver_phone ON public.journey_cheetahs
FOR EACH ROW EXECUTE FUNCTION public.tango_journey_cheetah_driver();

-- 5c. Vehicle default driver: guard (licence valid today) + copy. Only when the
-- default driver is set or changed, so routine vehicle edits never fail
-- because a licence lapsed later.
CREATE OR REPLACE FUNCTION public.tango_cheetah_default_driver()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  blocker text;
  driver record;
BEGIN
  IF NEW.default_driver_id IS NULL
    OR (TG_OP = 'UPDATE' AND NEW.default_driver_id IS NOT DISTINCT FROM OLD.default_driver_id)
  THEN
    RETURN NEW;
  END IF;

  blocker := public.tango_driver_blocker(NEW.default_driver_id, NULL);
  IF blocker IS NOT NULL THEN
    RAISE EXCEPTION '%', blocker USING ERRCODE = '23514', HINT = 'tango_driver_guard';
  END IF;

  SELECT full_name, phone INTO driver FROM public.tango_drivers WHERE id = NEW.default_driver_id;
  NEW.driver_name := driver.full_name;
  NEW.driver_phone := driver.phone;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tango_cheetah_default_driver() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS cheetahs_tango_default_driver ON public.cheetahs;
CREATE TRIGGER cheetahs_tango_default_driver
BEFORE INSERT OR UPDATE OF default_driver_id ON public.cheetahs
FOR EACH ROW EXECUTE FUNCTION public.tango_cheetah_default_driver();

-- 5d. Driver feedback: the driver is taken from the allocation the DO reviews
-- (then the vehicle's default driver), never from the client. Changing or
-- clearing it later is limited to Tango coordinators and admins, on top of the
-- existing UPDATE policy driver_feedback_tango_update (reviewer or Tango head),
-- so in practice the Tango head, or an admin who passes that policy. Deleting
-- a driver (FK ON DELETE SET NULL) always clears it.
CREATE OR REPLACE FUNCTION public.tango_driver_feedback_driver()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.driver_id := coalesce(
      (SELECT allocation.driver_id FROM public.journey_cheetahs allocation
        WHERE allocation.journey_id = NEW.journey_id AND allocation.cheetah_id = NEW.cheetah_id),
      (SELECT cheetah.default_driver_id FROM public.cheetahs cheetah WHERE cheetah.id = NEW.cheetah_id)
    );
  ELSIF NEW.driver_id IS DISTINCT FROM OLD.driver_id
    AND NOT (public.can_coordinate_unit('tango') OR public.is_admin())
  THEN
    -- The driver row is gone: this is the ON DELETE SET NULL action.
    IF NEW.driver_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.tango_drivers WHERE id = OLD.driver_id) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Only the Tango head or an admin can change the driver on feedback'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tango_driver_feedback_driver() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS driver_feedback_tango_driver ON public.driver_feedback;
CREATE TRIGGER driver_feedback_tango_driver
BEFORE INSERT OR UPDATE OF driver_id ON public.driver_feedback
FOR EACH ROW EXECUTE FUNCTION public.tango_driver_feedback_driver();

-- 5d'. guard_driver_feedback_identity (20260901091000) re-checks on every
-- update that the journey still exists and the Cheetah is still allocated.
-- The ON DELETE SET NULL from a deleted driver must not fail on a soft-deleted
-- journey or a removed allocation, so an update that changes nothing but
-- driver_id (and updated_at) skips those checks. Otherwise unchanged.
CREATE OR REPLACE FUNCTION public.guard_driver_feedback_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  journey_papa_id uuid;
BEGIN
  IF TG_OP = 'UPDATE'
    AND (to_jsonb(NEW) - 'driver_id' - 'updated_at') = (to_jsonb(OLD) - 'driver_id' - 'updated_at')
  THEN
    RETURN NEW;
  END IF;

  SELECT papa_id INTO journey_papa_id
  FROM public.journeys
  WHERE id = NEW.journey_id AND coalesce(is_deleted, false) = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journey does not exist';
  END IF;
  IF NEW.papa_id IS NOT NULL
    AND NEW.papa_id IS DISTINCT FROM journey_papa_id
    AND NOT EXISTS (
      SELECT 1 FROM public.journey_papas journey_papa
      WHERE journey_papa.journey_id = NEW.journey_id
        AND journey_papa.papa_id = NEW.papa_id
    )
  THEN
    RAISE EXCEPTION 'Feedback Papa does not belong to this journey';
  END IF;
  IF NEW.cheetah_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.journeys journey
    WHERE journey.id = NEW.journey_id
      AND (
        journey.assigned_cheetah_id = NEW.cheetah_id
        OR EXISTS (
          SELECT 1 FROM public.journey_cheetahs allocation
          WHERE allocation.journey_id = journey.id
            AND allocation.cheetah_id = NEW.cheetah_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'Feedback Cheetah is not allocated to this journey';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW.journey_id IS DISTINCT FROM OLD.journey_id
    OR NEW.cheetah_id IS DISTINCT FROM OLD.cheetah_id
    OR NEW.papa_id IS DISTINCT FROM OLD.papa_id
    OR NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id
  ) THEN
    RAISE EXCEPTION 'Feedback journey, vehicle, Papa and reviewer are immutable';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_driver_feedback_identity() FROM PUBLIC, anon, authenticated;

-- 5f. Licence verification is stamped by the database: updated_by and
-- verified_by are the caller, never what the client sends. A licence whose
-- number or expiry changes loses its verification unless the same request
-- verifies it again (sends a new verified_at).
CREATE OR REPLACE FUNCTION public.tango_driver_licence_stamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor uuid := auth.uid();
BEGIN
  IF actor IS NOT NULL THEN
    NEW.updated_by := actor;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.updated_by := OLD.updated_by;
  END IF;

  IF NEW.verified_at IS NULL THEN
    NEW.verified_by := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    -- verified_at is kept as sent (never in the future): an upsert runs this
    -- INSERT branch first and its ON CONFLICT UPDATE then compares the sent
    -- value with the stored one below.
    NEW.verified_by := coalesce(actor, NEW.verified_by);
    NEW.verified_at := least(NEW.verified_at, now());
  ELSIF OLD.verified_at IS NULL OR NEW.verified_at IS DISTINCT FROM OLD.verified_at THEN
    -- Verified (again) in this request.
    NEW.verified_by := coalesce(actor, NEW.verified_by);
    NEW.verified_at := now();
  ELSIF upper(regexp_replace(NEW.licence_number, '\s', '', 'g')) IS DISTINCT FROM upper(regexp_replace(OLD.licence_number, '\s', '', 'g'))
    OR NEW.expires_on IS DISTINCT FROM OLD.expires_on
  THEN
    -- A different card or date that nobody has seen yet.
    NEW.verified_by := NULL;
    NEW.verified_at := NULL;
  ELSE
    NEW.verified_by := OLD.verified_by;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tango_driver_licence_stamp() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tango_driver_licences_stamp ON public.tango_driver_licences;
CREATE TRIGGER tango_driver_licences_stamp
BEFORE INSERT OR UPDATE ON public.tango_driver_licences
FOR EACH ROW EXECUTE FUNCTION public.tango_driver_licence_stamp();

-- 5e. A renamed driver or a new phone number reaches the vehicles that default
-- to them and their open journey allocations. Finished allocations keep the
-- details they were driven with.
CREATE OR REPLACE FUNCTION public.tango_driver_propagate_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.full_name IS NOT DISTINCT FROM OLD.full_name AND NEW.phone IS NOT DISTINCT FROM OLD.phone THEN
    RETURN NEW;
  END IF;
  UPDATE public.cheetahs
  SET driver_name = NEW.full_name, driver_phone = NEW.phone
  WHERE default_driver_id = NEW.id;
  UPDATE public.journey_cheetahs
  SET driver_name = NEW.full_name, driver_phone = NEW.phone
  WHERE driver_id = NEW.id AND status NOT IN ('completed', 'cancelled');
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tango_driver_propagate_contact() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tango_drivers_propagate_contact ON public.tango_drivers;
CREATE TRIGGER tango_drivers_propagate_contact
AFTER UPDATE OF full_name, phone ON public.tango_drivers
FOR EACH ROW EXECUTE FUNCTION public.tango_driver_propagate_contact();

-- updated_at
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['tango_drivers', 'tango_driver_licences', 'tango_driver_assignments'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_set_updated_at ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      table_name, table_name
    );
  END LOOP;
END $$;

-- ─── 6. Row-level security ──────────────────────────────────────────────────

ALTER TABLE public.tango_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tango_driver_licences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tango_driver_assignments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tango_drivers, public.tango_driver_licences, public.tango_driver_assignments FROM anon;

DROP POLICY IF EXISTS tango_drivers_select ON public.tango_drivers;
CREATE POLICY tango_drivers_select ON public.tango_drivers
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_unit_member('tango'));

DROP POLICY IF EXISTS tango_drivers_manage ON public.tango_drivers;
CREATE POLICY tango_drivers_manage ON public.tango_drivers
  FOR ALL TO authenticated
  USING (public.can_coordinate_unit('tango') OR public.is_admin())
  WITH CHECK (public.can_coordinate_unit('tango') OR public.is_admin());

-- Licences: coordinators only (platform admins pass can_coordinate_unit).
-- Deliberately not is_admin(): Command does not read licence numbers.
DROP POLICY IF EXISTS tango_driver_licences_coordinators ON public.tango_driver_licences;
CREATE POLICY tango_driver_licences_coordinators ON public.tango_driver_licences
  FOR ALL TO authenticated
  USING (public.can_coordinate_unit('tango'))
  WITH CHECK (public.can_coordinate_unit('tango'));

DROP POLICY IF EXISTS tango_driver_assignments_select ON public.tango_driver_assignments;
CREATE POLICY tango_driver_assignments_select ON public.tango_driver_assignments
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_unit_member('tango'));

DROP POLICY IF EXISTS tango_driver_assignments_manage ON public.tango_driver_assignments;
CREATE POLICY tango_driver_assignments_manage ON public.tango_driver_assignments
  FOR ALL TO authenticated
  USING (public.can_coordinate_unit('tango') OR public.is_admin())
  WITH CHECK (public.can_coordinate_unit('tango') OR public.is_admin());

-- Journey allocations: Command, Tango coordinators, and members doing
-- programme work on the journey's programme. journey_cheetahs_tango_manage
-- (head) stays as it is.
DROP POLICY IF EXISTS journey_cheetahs_tango_programme_work ON public.journey_cheetahs;
CREATE POLICY journey_cheetahs_tango_programme_work ON public.journey_cheetahs
  FOR ALL TO authenticated
  USING (
    public.is_admin()
    OR public.can_coordinate_unit('tango')
    OR EXISTS (
      SELECT 1 FROM public.journeys journey
      WHERE journey.id = journey_cheetahs.journey_id
        AND public.can_work_unit_programme('tango', journey.program_id)
    )
  )
  WITH CHECK (
    public.is_admin()
    OR public.can_coordinate_unit('tango')
    OR EXISTS (
      SELECT 1 FROM public.journeys journey
      WHERE journey.id = journey_cheetahs.journey_id
        AND public.can_work_unit_programme('tango', journey.program_id)
    )
  );

-- ─── 7. Roster RPC (licence state, never the number) ────────────────────────

CREATE OR REPLACE FUNCTION public.tango_driver_roster()
RETURNS TABLE (
  id uuid,
  full_name text,
  phone text,
  alt_phone text,
  partner_id uuid,
  engagement_type text,
  status text,
  notes text,
  licence_class text,
  licence_expires_on date,
  licence_state text,
  licence_verified boolean,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.is_unit_member('tango')) THEN
    RAISE EXCEPTION 'Only Tango members and Command can read the driver roster' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    driver.id, driver.full_name, driver.phone, driver.alt_phone, driver.partner_id,
    driver.engagement_type, driver.status, driver.notes,
    licence.licence_class, licence.expires_on,
    public.tango_licence_state(licence.expires_on, NULL),
    licence.verified_at IS NOT NULL,
    driver.updated_at
  FROM public.tango_drivers driver
  LEFT JOIN public.tango_driver_licences licence ON licence.driver_id = driver.id
  ORDER BY lower(driver.full_name), driver.id;
END;
$$;

REVOKE ALL ON FUNCTION public.tango_driver_roster() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tango_driver_roster() TO authenticated, service_role;

COMMENT ON FUNCTION public.tango_driver_roster() IS
  'Tango drivers with licence state (valid | expiring | expired | missing), class and expiry date but never the licence number. Tango members, Command and admins.';

-- ─── 8. Licence-expiry reminders to Tango coordinators ──────────────────────

-- What has been sent. Keyed on the expiry date: a renewed licence earns fresh
-- reminders when it nears its new date.
CREATE TABLE IF NOT EXISTS public.tango_licence_reminders (
  driver_id uuid NOT NULL REFERENCES public.tango_drivers(id) ON DELETE CASCADE,
  expires_on date NOT NULL,
  kind text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (driver_id, expires_on, kind),
  CONSTRAINT tango_licence_reminders_kind CHECK (kind IN ('expiring', 'expired'))
);

-- Internal bookkeeping: no policies, so the app can neither read nor write it.
ALTER TABLE public.tango_licence_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tango_licence_reminders FROM anon, authenticated;

-- One reminder per licence when it comes within 30 days of expiry, and one
-- more when it has expired. Licences that expired more than 7 days before
-- this first runs are left alone, and inactive drivers are skipped. The
-- message names the driver and date, never the licence number.
CREATE OR REPLACE FUNCTION public.tango_send_licence_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  today date := (now() AT TIME ZONE 'Africa/Lagos')::date;
  sent integer;
BEGIN
  WITH due AS (
    SELECT driver.id AS driver_id, driver.full_name, licence.expires_on,
      CASE WHEN licence.expires_on < today THEN 'expired' ELSE 'expiring' END AS kind
    FROM public.tango_driver_licences licence
    JOIN public.tango_drivers driver ON driver.id = licence.driver_id
    WHERE driver.status <> 'inactive'
      AND licence.expires_on <= today + 30
      AND licence.expires_on >= today - 7
  ),
  coordinators AS (
    SELECT DISTINCT membership.user_id
    FROM public.unit_memberships membership
    JOIN public.units unit_record ON unit_record.id = membership.unit_id
    JOIN public.users person ON person.id = membership.user_id
    WHERE unit_record.slug = 'tango'
      AND coalesce(unit_record.is_active, true)
      AND membership.status = 'active'
      AND membership.access_level IN ('head', 'sub_lead')
      AND coalesce(person.is_active, true) = true
      AND coalesce(person.activation_status, 'active') = 'active'
  ),
  -- Claimed only when someone receives it: with no active head or sub-lead
  -- the reminder waits for the next run.
  claimed AS (
    INSERT INTO public.tango_licence_reminders (driver_id, expires_on, kind)
    SELECT due.driver_id, due.expires_on, due.kind FROM due
    WHERE EXISTS (SELECT 1 FROM coordinators)
    ON CONFLICT DO NOTHING
    RETURNING driver_id, kind
  )
  INSERT INTO public.notifications (user_id, title, message, type, channel, metadata, is_read)
  SELECT
    coordinators.user_id,
    CASE WHEN due.kind = 'expired' THEN 'Driver licence expired' ELSE 'Driver licence expiring' END,
    due.full_name || CASE WHEN due.kind = 'expired' THEN '''s driving licence expired on ' ELSE '''s driving licence expires on ' END
      || to_char(due.expires_on, 'Dy DD Mon YYYY')
      || '. They cannot be assigned past that date until it is renewed.',
    CASE WHEN due.kind = 'expired' THEN 'warning' ELSE 'reminder' END,
    'push',
    jsonb_build_object(
      'kind', 'tango_licence_expiring',
      'unit_slug', 'tango',
      'reminder', due.kind,
      'driver_id', due.driver_id,
      'expires_on', due.expires_on
    ),
    false
  FROM due
  JOIN claimed ON claimed.driver_id = due.driver_id AND claimed.kind = due.kind
  CROSS JOIN coordinators;

  GET DIAGNOSTICS sent = ROW_COUNT;
  RETURN sent;
END;
$$;

-- Run by the scheduler only.
REVOKE ALL ON FUNCTION public.tango_send_licence_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tango_send_licence_reminders() TO service_role;

-- Daily at 07:00 Lagos (06:00 UTC). Unscheduling first keeps this repeatable.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'tcnp-tango-licence-reminders';
SELECT cron.schedule(
  'tcnp-tango-licence-reminders',
  '0 6 * * *',
  $$SELECT public.tango_send_licence_reminders();$$
);

NOTIFY pgrst, 'reload schema';
