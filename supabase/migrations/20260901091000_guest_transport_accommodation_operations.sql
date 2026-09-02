-- Guest, Victor, Tango, aviation and November-Nest operational workflows.
-- All changes are additive; legacy singular assignments and JSON briefing fields
-- stay readable while the normalized workflows are adopted.

ALTER TABLE public.papas ADD COLUMN IF NOT EXISTS needs_clicker boolean NOT NULL DEFAULT false;
ALTER TABLE public.papas ADD COLUMN IF NOT EXISTS stage_props_details text;

ALTER TABLE public.seat_arrangements ADD COLUMN IF NOT EXISTS publication_status text NOT NULL DEFAULT 'draft';
ALTER TABLE public.seat_arrangements ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.seat_arrangements ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE public.seat_arrangements ADD COLUMN IF NOT EXISTS published_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'seat_arrangements_publication_status_check'
      AND conrelid = 'public.seat_arrangements'::regclass
  ) THEN
    ALTER TABLE public.seat_arrangements
      ADD CONSTRAINT seat_arrangements_publication_status_check
      CHECK (publication_status IN ('draft', 'published', 'archived'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.senior_ministers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  full_name text NOT NULL,
  organization text,
  email text,
  phone text,
  notes text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_senior_ministers_identity
  ON public.senior_ministers(lower(full_name), lower(coalesce(organization, '')));

CREATE TABLE IF NOT EXISTS public.program_senior_ministers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  senior_minister_id uuid NOT NULL REFERENCES public.senior_ministers(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  theatre_id uuid REFERENCES public.theatres(id) ON DELETE SET NULL,
  papa_id uuid REFERENCES public.papas(id) ON DELETE SET NULL,
  accreditation_status text NOT NULL DEFAULT 'pending',
  badge_number text,
  seat_label text,
  arrival_status text NOT NULL DEFAULT 'expected',
  notes text,
  added_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT program_senior_ministers_accreditation CHECK (accreditation_status IN ('pending', 'approved', 'printed', 'issued', 'declined')),
  CONSTRAINT program_senior_ministers_arrival CHECK (arrival_status IN ('expected', 'arrived', 'seated', 'departed', 'cancelled')),
  CONSTRAINT program_senior_ministers_unique UNIQUE (senior_minister_id, program_id, theatre_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_program_senior_ministers_global_unique
  ON public.program_senior_ministers(senior_minister_id, program_id)
  WHERE theatre_id IS NULL;

CREATE TABLE IF NOT EXISTS public.papa_entourage_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  papa_id uuid NOT NULL REFERENCES public.papas(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'entourage',
  title text,
  full_name text NOT NULL,
  phone text,
  email text,
  notes text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT papa_entourage_category CHECK (category IN ('senior_minister', 'associate', 'personal_assistant', 'family', 'entourage'))
);

CREATE INDEX IF NOT EXISTS idx_entourage_papa_category ON public.papa_entourage_members(papa_id, category);

CREATE TABLE IF NOT EXISTS public.operational_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_venue_id uuid NOT NULL REFERENCES public.program_venues(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  capacity integer NOT NULL DEFAULT 1,
  starts_at timestamptz,
  ends_at timestamptz,
  status text NOT NULL DEFAULT 'open',
  notes text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operational_posts_capacity CHECK (capacity > 0),
  CONSTRAINT operational_posts_status CHECK (status IN ('open', 'staffed', 'active', 'closed')),
  CONSTRAINT operational_posts_time_order CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at),
  CONSTRAINT operational_posts_unique UNIQUE (program_venue_id, unit_id, code)
);

CREATE TABLE IF NOT EXISTS public.operational_post_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.operational_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assignment_role text NOT NULL DEFAULT 'primary',
  assigned_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operational_post_assignment_role CHECK (assignment_role IN ('primary', 'relief', 'support')),
  CONSTRAINT operational_post_assignment_unique UNIQUE (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.welcome_parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_venue_id uuid NOT NULL REFERENCES public.program_venues(id) ON DELETE CASCADE,
  papa_id uuid REFERENCES public.papas(id) ON DELETE SET NULL,
  label text NOT NULL,
  scheduled_start timestamptz NOT NULL,
  scheduled_end timestamptz,
  status text NOT NULL DEFAULT 'planned',
  notes text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT welcome_parties_status CHECK (status IN ('planned', 'ready', 'assembled', 'welcomed', 'cancelled')),
  CONSTRAINT welcome_parties_time_order CHECK (scheduled_end IS NULL OR scheduled_end >= scheduled_start)
);

CREATE TABLE IF NOT EXISTS public.welcome_party_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES public.welcome_parties(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  assigned_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT welcome_party_member_role CHECK (role IN ('lead', 'member', 'support')),
  CONSTRAINT welcome_party_member_unique UNIQUE (party_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.presentation_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  papa_id uuid NOT NULL REFERENCES public.papas(id) ON DELETE CASCADE,
  program_id uuid REFERENCES public.programs(id) ON DELETE CASCADE,
  title text NOT NULL,
  storage_path text NOT NULL,
  original_name text NOT NULL,
  mime_type text,
  file_size bigint,
  version integer NOT NULL DEFAULT 1,
  uploaded_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT presentation_assets_file_size CHECK (file_size IS NULL OR file_size BETWEEN 0 AND 52428800),
  CONSTRAINT presentation_assets_unique_path UNIQUE (storage_path)
);

CREATE TABLE IF NOT EXISTS public.papa_book_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  papa_id uuid NOT NULL REFERENCES public.papas(id) ON DELETE CASCADE,
  program_id uuid REFERENCES public.programs(id) ON DELETE CASCADE,
  title text NOT NULL,
  isbn text,
  quantity_received integer NOT NULL,
  unit_price numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',
  notes text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT papa_book_batches_quantity CHECK (quantity_received >= 0),
  CONSTRAINT papa_book_batches_price CHECK (unit_price >= 0)
);

CREATE TABLE IF NOT EXISTS public.papa_book_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.papa_book_batches(id) ON DELETE RESTRICT,
  movement_type text NOT NULL,
  quantity integer NOT NULL,
  amount numeric(14,2),
  notes text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT papa_book_movements_type CHECK (movement_type IN ('sale', 'return', 'return_to_papa', 'adjustment')),
  CONSTRAINT papa_book_movements_quantity CHECK (
    (movement_type = 'adjustment' AND quantity <> 0)
    OR (movement_type <> 'adjustment' AND quantity > 0)
  ),
  CONSTRAINT papa_book_movements_amount CHECK (amount IS NULL OR amount >= 0)
);

CREATE TABLE IF NOT EXISTS public.papa_book_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.papa_book_batches(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  reference text,
  notes text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT papa_book_settlements_amount CHECK (amount >= 0),
  CONSTRAINT papa_book_settlements_status CHECK (status IN ('pending', 'paid', 'void'))
);

CREATE OR REPLACE VIEW public.papa_book_balances
WITH (security_invoker = true)
AS
SELECT
  batch.id AS batch_id,
  batch.papa_id,
  batch.program_id,
  batch.title,
  batch.isbn,
  batch.quantity_received,
  batch.unit_price,
  batch.currency,
  coalesce(sum(CASE WHEN movement.movement_type = 'sale' THEN movement.quantity ELSE 0 END), 0)::integer AS quantity_sold,
  coalesce(sum(CASE WHEN movement.movement_type IN ('return', 'return_to_papa') THEN movement.quantity ELSE 0 END), 0)::integer AS quantity_returned,
  (
    batch.quantity_received
    + coalesce(sum(CASE WHEN movement.movement_type = 'adjustment' THEN movement.quantity ELSE 0 END), 0)
    - coalesce(sum(CASE WHEN movement.movement_type = 'sale' THEN movement.quantity ELSE 0 END), 0)
    - coalesce(sum(CASE WHEN movement.movement_type IN ('return', 'return_to_papa') THEN movement.quantity ELSE 0 END), 0)
  )::integer AS quantity_remaining,
  coalesce(sum(CASE WHEN movement.movement_type = 'sale' THEN coalesce(movement.amount, movement.quantity * batch.unit_price) ELSE 0 END), 0)::numeric(14,2) AS payout_due,
  coalesce((
    SELECT sum(settlement.amount)
    FROM public.papa_book_settlements settlement
    WHERE settlement.batch_id = batch.id AND settlement.status = 'paid'
  ), 0)::numeric(14,2) AS amount_paid
FROM public.papa_book_batches batch
LEFT JOIN public.papa_book_movements movement ON movement.batch_id = batch.id
GROUP BY batch.id;

-- Serialize stock movements on the parent batch so two concurrent sales can
-- never consume the same remaining copy. Sale value is always the full book
-- price: the Papa receives 100% of recorded sales.
CREATE OR REPLACE FUNCTION public.guard_papa_book_movement_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  received_quantity integer;
  book_price numeric(14,2);
  current_balance integer;
  movement_delta integer;
BEGIN
  SELECT quantity_received, unit_price
  INTO received_quantity, book_price
  FROM public.papa_book_batches
  WHERE id = NEW.batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Book consignment does not exist';
  END IF;

  SELECT
    received_quantity
    + coalesce(sum(CASE WHEN movement_type = 'adjustment' THEN quantity ELSE 0 END), 0)
    - coalesce(sum(CASE WHEN movement_type = 'sale' THEN quantity ELSE 0 END), 0)
    - coalesce(sum(CASE WHEN movement_type IN ('return', 'return_to_papa') THEN quantity ELSE 0 END), 0)
  INTO current_balance
  FROM public.papa_book_movements
  WHERE batch_id = NEW.batch_id;

  movement_delta := CASE
    WHEN NEW.movement_type = 'adjustment' THEN NEW.quantity
    ELSE -NEW.quantity
  END;

  IF current_balance + movement_delta < 0 THEN
    RAISE EXCEPTION 'This movement exceeds the remaining book stock';
  END IF;

  IF NEW.movement_type = 'sale' THEN
    NEW.amount := NEW.quantity * book_price;
  ELSIF NEW.movement_type IN ('return', 'return_to_papa') THEN
    NEW.amount := 0;
  ELSE
    NEW.amount := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS papa_book_movements_guard_balance ON public.papa_book_movements;
CREATE TRIGGER papa_book_movements_guard_balance
BEFORE INSERT ON public.papa_book_movements
FOR EACH ROW EXECUTE FUNCTION public.guard_papa_book_movement_balance();

CREATE OR REPLACE FUNCTION public.guard_papa_book_batch_quantity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  movement_balance integer;
BEGIN
  IF NEW.quantity_received IS DISTINCT FROM OLD.quantity_received THEN
    SELECT
      NEW.quantity_received
      + coalesce(sum(CASE WHEN movement_type = 'adjustment' THEN quantity ELSE 0 END), 0)
      - coalesce(sum(CASE WHEN movement_type = 'sale' THEN quantity ELSE 0 END), 0)
      - coalesce(sum(CASE WHEN movement_type IN ('return', 'return_to_papa') THEN quantity ELSE 0 END), 0)
    INTO movement_balance
    FROM public.papa_book_movements
    WHERE batch_id = OLD.id;

    IF movement_balance < 0 THEN
      RAISE EXCEPTION 'Quantity received cannot be lower than stock already sold or returned';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS papa_book_batches_guard_quantity ON public.papa_book_batches;
CREATE TRIGGER papa_book_batches_guard_quantity
BEFORE UPDATE ON public.papa_book_batches
FOR EACH ROW EXECUTE FUNCTION public.guard_papa_book_batch_quantity();

CREATE TABLE IF NOT EXISTS public.seat_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  arrangement_id uuid NOT NULL REFERENCES public.seat_arrangements(id) ON DELETE CASCADE,
  row_label text NOT NULL,
  seat_label text NOT NULL,
  senior_minister_id uuid REFERENCES public.senior_ministers(id) ON DELETE SET NULL,
  papa_id uuid REFERENCES public.papas(id) ON DELETE SET NULL,
  occupant_name text,
  notes text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seat_assignments_occupant CHECK (
    num_nonnulls(senior_minister_id, papa_id, nullif(trim(occupant_name), '')) = 1
  ),
  CONSTRAINT seat_assignments_unique_seat UNIQUE (arrangement_id, row_label, seat_label)
);

-- A normalized itinerary prevents a recurring callsign from leaking stale
-- telemetry into a future flight occurrence.
CREATE TABLE IF NOT EXISTS public.flight_itineraries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  papa_id uuid NOT NULL REFERENCES public.papas(id) ON DELETE CASCADE,
  program_id uuid REFERENCES public.programs(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'scheduled',
  notes text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT flight_itineraries_status CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')),
  CONSTRAINT flight_itineraries_unique UNIQUE (papa_id, program_id)
);

CREATE TABLE IF NOT EXISTS public.flight_legs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id uuid NOT NULL REFERENCES public.flight_itineraries(id) ON DELETE CASCADE,
  leg_order integer NOT NULL DEFAULT 1,
  flight_number text NOT NULL,
  adsb_callsign text,
  icao24 text,
  airline text,
  departure_airport text,
  arrival_airport text,
  scheduled_departure timestamptz,
  scheduled_arrival timestamptz,
  actual_departure timestamptz,
  actual_arrival timestamptz,
  status text NOT NULL DEFAULT 'scheduled',
  telemetry_source text,
  source text NOT NULL DEFAULT 'manual',
  telemetry_confidence text NOT NULL DEFAULT 'unverified',
  last_seen_at timestamptz,
  current_latitude double precision,
  current_longitude double precision,
  altitude double precision,
  velocity double precision,
  heading double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT flight_legs_order CHECK (leg_order > 0),
  CONSTRAINT flight_legs_status CHECK (status IN ('scheduled', 'boarding', 'departed', 'in_air', 'landed', 'delayed', 'cancelled', 'unavailable')),
  CONSTRAINT flight_legs_confidence CHECK (telemetry_confidence IN ('unverified', 'scheduled', 'matched', 'confirmed')),
  CONSTRAINT flight_legs_source CHECK (source IN ('manual', 'papa_form')),
  CONSTRAINT flight_legs_latitude CHECK (current_latitude IS NULL OR current_latitude BETWEEN -90 AND 90),
  CONSTRAINT flight_legs_longitude CHECK (current_longitude IS NULL OR current_longitude BETWEEN -180 AND 180),
  CONSTRAINT flight_legs_altitude CHECK (altitude IS NULL OR altitude >= -500),
  CONSTRAINT flight_legs_velocity CHECK (velocity IS NULL OR velocity >= 0),
  CONSTRAINT flight_legs_heading CHECK (heading IS NULL OR heading BETWEEN 0 AND 360),
  CONSTRAINT flight_legs_time_order CHECK (scheduled_arrival IS NULL OR scheduled_departure IS NULL OR scheduled_arrival >= scheduled_departure),
  CONSTRAINT flight_legs_unique_order UNIQUE (itinerary_id, leg_order)
);

CREATE INDEX IF NOT EXISTS idx_flight_legs_active ON public.flight_legs(status, scheduled_departure, scheduled_arrival);
CREATE INDEX IF NOT EXISTS idx_flight_legs_callsign ON public.flight_legs(adsb_callsign, icao24);
CREATE UNIQUE INDEX IF NOT EXISTS idx_flight_itineraries_papa_without_program
ON public.flight_itineraries(papa_id) WHERE program_id IS NULL;

INSERT INTO public.flight_itineraries (papa_id, program_id, status, created_by)
SELECT p.id, p.program_id, 'scheduled', p.created_by
FROM public.papas p
WHERE nullif(trim(p.flight_number), '') IS NOT NULL AND coalesce(p.is_deleted, false) = false
ON CONFLICT (papa_id, program_id) DO NOTHING;

INSERT INTO public.flight_legs (
  itinerary_id, leg_order, flight_number, airline, departure_airport, arrival_airport,
  scheduled_departure, scheduled_arrival, telemetry_confidence, source
)
SELECT
  itinerary.id,
  1,
  p.flight_number,
  p.airline,
  coalesce(nullif(p.arrival_country, ''), 'Departure airport pending'),
  coalesce(nullif(p.arrival_city, ''), 'Arrival airport pending'),
  p.flight_departure_time,
  p.flight_arrival_time,
  'scheduled',
  'papa_form'
FROM public.flight_itineraries itinerary
JOIN public.papas p ON p.id = itinerary.papa_id
WHERE nullif(trim(p.flight_number), '') IS NOT NULL
ON CONFLICT (itinerary_id, leg_order) DO NOTHING;

-- Papa forms remain the editing surface for the primary flight. Keep their
-- normalized leg synchronized after every edit while preserving manually-added
-- multi-leg itinerary rows.
CREATE OR REPLACE FUNCTION public.sync_papa_form_flight_leg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_itinerary_id uuid;
  target_leg_id uuid;
  next_leg_order integer;
  identifier_changed boolean := false;
BEGIN
  DELETE FROM public.flight_legs leg
  USING public.flight_itineraries itinerary
  WHERE leg.itinerary_id = itinerary.id
    AND itinerary.papa_id = NEW.id
    AND leg.source = 'papa_form'
    AND itinerary.program_id IS DISTINCT FROM NEW.program_id;

  IF coalesce(NEW.is_deleted, false) OR nullif(trim(NEW.flight_number), '') IS NULL THEN
    DELETE FROM public.flight_legs leg
    USING public.flight_itineraries itinerary
    WHERE leg.itinerary_id = itinerary.id
      AND itinerary.papa_id = NEW.id
      AND leg.source = 'papa_form';
    RETURN NEW;
  END IF;

  SELECT itinerary.id INTO target_itinerary_id
  FROM public.flight_itineraries itinerary
  WHERE itinerary.papa_id = NEW.id
    AND itinerary.program_id IS NOT DISTINCT FROM NEW.program_id
  ORDER BY itinerary.created_at
  LIMIT 1;

  IF target_itinerary_id IS NULL THEN
    INSERT INTO public.flight_itineraries (papa_id, program_id, status, created_by)
    VALUES (NEW.id, NEW.program_id, 'scheduled', NEW.created_by)
    RETURNING id INTO target_itinerary_id;
  END IF;

  SELECT id INTO target_leg_id
  FROM public.flight_legs
  WHERE itinerary_id = target_itinerary_id AND source = 'papa_form'
  ORDER BY leg_order
  LIMIT 1;

  IF target_leg_id IS NULL THEN
    SELECT coalesce(max(leg_order), 0) + 1 INTO next_leg_order
    FROM public.flight_legs WHERE itinerary_id = target_itinerary_id;

    INSERT INTO public.flight_legs (
      itinerary_id, leg_order, flight_number, adsb_callsign, airline,
      departure_airport, arrival_airport, scheduled_departure,
      scheduled_arrival, telemetry_confidence, source
    ) VALUES (
      target_itinerary_id, next_leg_order, trim(NEW.flight_number),
      upper(replace(trim(NEW.flight_number), ' ', '')), NEW.airline,
      coalesce(nullif(NEW.arrival_country, ''), 'Departure airport pending'),
      coalesce(nullif(NEW.arrival_city, ''), 'Arrival airport pending'),
      NEW.flight_departure_time, NEW.flight_arrival_time, 'scheduled', 'papa_form'
    );
  ELSE
    identifier_changed := TG_OP = 'UPDATE'
      AND upper(regexp_replace(trim(coalesce(OLD.flight_number, '')), '\s+', '', 'g'))
        IS DISTINCT FROM upper(regexp_replace(trim(coalesce(NEW.flight_number, '')), '\s+', '', 'g'));

    UPDATE public.flight_legs
    SET flight_number = trim(NEW.flight_number),
        adsb_callsign = upper(regexp_replace(trim(NEW.flight_number), '\s+', '', 'g')),
        airline = NEW.airline,
        departure_airport = coalesce(nullif(NEW.arrival_country, ''), 'Departure airport pending'),
        arrival_airport = coalesce(nullif(NEW.arrival_city, ''), 'Arrival airport pending'),
        scheduled_departure = NEW.flight_departure_time,
        scheduled_arrival = NEW.flight_arrival_time,
        updated_at = now()
    WHERE id = target_leg_id;

    IF identifier_changed THEN
      UPDATE public.flight_legs
      SET icao24 = NULL,
          actual_departure = NULL,
          actual_arrival = NULL,
          status = 'scheduled',
          telemetry_source = NULL,
          telemetry_confidence = 'scheduled',
          last_seen_at = NULL,
          current_latitude = NULL,
          current_longitude = NULL,
          altitude = NULL,
          velocity = NULL,
          heading = NULL,
          updated_at = now()
      WHERE id = target_leg_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS papas_sync_primary_flight_leg ON public.papas;
CREATE TRIGGER papas_sync_primary_flight_leg
AFTER INSERT OR UPDATE OF flight_number, airline, arrival_country, arrival_city,
  flight_departure_time, flight_arrival_time, program_id, is_deleted
ON public.papas
FOR EACH ROW EXECUTE FUNCTION public.sync_papa_form_flight_leg();

CREATE TABLE IF NOT EXISTS public.fleet_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  partner_type text NOT NULL DEFAULT 'external',
  contact_name text,
  phone text,
  email text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fleet_partners_type CHECK (partner_type IN ('internal', 'external'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fleet_partners_name ON public.fleet_partners(lower(name));

ALTER TABLE public.cheetahs ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.fleet_partners(id) ON DELETE SET NULL;
ALTER TABLE public.cheetahs ADD COLUMN IF NOT EXISTS ownership_type text NOT NULL DEFAULT 'internal';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cheetahs_ownership_type_check'
      AND conrelid = 'public.cheetahs'::regclass
  ) THEN
    ALTER TABLE public.cheetahs
      ADD CONSTRAINT cheetahs_ownership_type_check CHECK (ownership_type IN ('internal', 'partner'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cheetahs_partner_required_check'
      AND conrelid = 'public.cheetahs'::regclass
  ) THEN
    ALTER TABLE public.cheetahs
      ADD CONSTRAINT cheetahs_partner_required_check
      CHECK (ownership_type = 'internal' OR partner_id IS NOT NULL);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.journey_cheetahs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id uuid NOT NULL REFERENCES public.journeys(id) ON DELETE CASCADE,
  cheetah_id uuid NOT NULL REFERENCES public.cheetahs(id) ON DELETE RESTRICT,
  assignment_role text NOT NULL DEFAULT 'primary',
  driver_name text,
  driver_phone text,
  status text NOT NULL DEFAULT 'assigned',
  assigned_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT journey_cheetahs_role CHECK (assignment_role IN ('primary', 'support', 'luggage', 'security', 'advance')),
  CONSTRAINT journey_cheetahs_status CHECK (status IN ('assigned', 'confirmed', 'en_route', 'completed', 'cancelled')),
  CONSTRAINT journey_cheetahs_unique UNIQUE (journey_id, cheetah_id)
);

INSERT INTO public.journey_cheetahs (journey_id, cheetah_id, assignment_role, status, assigned_by)
SELECT j.id, j.assigned_cheetah_id, 'primary', 'assigned', j.created_by
FROM public.journeys j
WHERE j.assigned_cheetah_id IS NOT NULL AND coalesce(j.is_deleted, false) = false
ON CONFLICT (journey_id, cheetah_id) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS idx_journey_cheetahs_one_active_primary
ON public.journey_cheetahs(journey_id)
WHERE assignment_role = 'primary' AND status <> 'cancelled';

-- The normalized many-vehicle table is canonical. The singular journey column
-- remains a compatibility projection for existing journey, incident and live
-- tracking screens until they are migrated individually.
CREATE OR REPLACE FUNCTION public.demote_other_journey_primaries()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assignment_role = 'primary' AND NEW.status <> 'cancelled' THEN
    UPDATE public.journey_cheetahs
    SET assignment_role = 'support', updated_at = now()
    WHERE journey_id = NEW.journey_id
      AND id IS DISTINCT FROM NEW.id
      AND assignment_role = 'primary'
      AND status <> 'cancelled';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS journey_cheetahs_demote_other_primary ON public.journey_cheetahs;
CREATE TRIGGER journey_cheetahs_demote_other_primary
BEFORE INSERT OR UPDATE OF journey_id, assignment_role, status ON public.journey_cheetahs
FOR EACH ROW EXECUTE FUNCTION public.demote_other_journey_primaries();

CREATE OR REPLACE FUNCTION public.reconcile_journey_primary_cheetah(target_journey_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  primary_allocation_id uuid;
  primary_cheetah_id uuid;
BEGIN
  IF target_journey_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id, cheetah_id INTO primary_allocation_id, primary_cheetah_id
  FROM public.journey_cheetahs
  WHERE journey_id = target_journey_id
    AND assignment_role = 'primary'
    AND status <> 'cancelled'
  ORDER BY created_at, id
  LIMIT 1;

  IF primary_allocation_id IS NULL THEN
    SELECT id, cheetah_id INTO primary_allocation_id, primary_cheetah_id
    FROM public.journey_cheetahs
    WHERE journey_id = target_journey_id AND status <> 'cancelled'
    ORDER BY created_at, id
    LIMIT 1;

    IF primary_allocation_id IS NOT NULL THEN
      UPDATE public.journey_cheetahs
      SET assignment_role = 'primary', updated_at = now()
      WHERE id = primary_allocation_id;
    END IF;
  END IF;

  UPDATE public.journeys
  SET assigned_cheetah_id = primary_cheetah_id, updated_at = now()
  WHERE id = target_journey_id
    AND assigned_cheetah_id IS DISTINCT FROM primary_cheetah_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_journey_primary_from_allocations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM public.reconcile_journey_primary_cheetah(OLD.journey_id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.journey_id IS DISTINCT FROM NEW.journey_id THEN
    PERFORM public.reconcile_journey_primary_cheetah(OLD.journey_id);
  END IF;
  PERFORM public.reconcile_journey_primary_cheetah(NEW.journey_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS journey_cheetahs_sync_legacy_primary ON public.journey_cheetahs;
CREATE TRIGGER journey_cheetahs_sync_legacy_primary
AFTER INSERT OR UPDATE OF journey_id, cheetah_id, assignment_role, status OR DELETE ON public.journey_cheetahs
FOR EACH ROW EXECUTE FUNCTION public.sync_journey_primary_from_allocations();

CREATE OR REPLACE FUNCTION public.sync_allocation_from_legacy_journey_primary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() > 1
    OR (TG_OP = 'UPDATE' AND NEW.assigned_cheetah_id IS NOT DISTINCT FROM OLD.assigned_cheetah_id)
  THEN
    RETURN NEW;
  END IF;

  UPDATE public.journey_cheetahs
  SET assignment_role = 'support', updated_at = now()
  WHERE journey_id = NEW.id
    AND assignment_role = 'primary'
    AND status <> 'cancelled';

  IF NEW.assigned_cheetah_id IS NOT NULL THEN
    INSERT INTO public.journey_cheetahs (
      journey_id, cheetah_id, assignment_role, status, assigned_by
    ) VALUES (
      NEW.id, NEW.assigned_cheetah_id, 'primary', 'assigned', auth.uid()
    )
    ON CONFLICT (journey_id, cheetah_id) DO UPDATE
    SET assignment_role = 'primary',
        status = CASE WHEN journey_cheetahs.status = 'cancelled' THEN 'assigned' ELSE journey_cheetahs.status END,
        updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS journeys_sync_normalized_primary_cheetah ON public.journeys;
CREATE TRIGGER journeys_sync_normalized_primary_cheetah
AFTER INSERT OR UPDATE OF assigned_cheetah_id ON public.journeys
FOR EACH ROW EXECUTE FUNCTION public.sync_allocation_from_legacy_journey_primary();

REVOKE ALL ON FUNCTION public.reconcile_journey_primary_cheetah(uuid) FROM PUBLIC;

CREATE TABLE IF NOT EXISTS public.driver_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id uuid NOT NULL REFERENCES public.journeys(id) ON DELETE CASCADE,
  cheetah_id uuid REFERENCES public.cheetahs(id) ON DELETE SET NULL,
  papa_id uuid REFERENCES public.papas(id) ON DELETE SET NULL,
  reviewer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rating integer NOT NULL,
  safety_rating integer,
  punctuality_rating integer,
  cleanliness_rating integer,
  notes text,
  status text NOT NULL DEFAULT 'submitted',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driver_feedback_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT driver_feedback_safety CHECK (safety_rating IS NULL OR safety_rating BETWEEN 1 AND 5),
  CONSTRAINT driver_feedback_punctuality CHECK (punctuality_rating IS NULL OR punctuality_rating BETWEEN 1 AND 5),
  CONSTRAINT driver_feedback_cleanliness CHECK (cleanliness_rating IS NULL OR cleanliness_rating BETWEEN 1 AND 5),
  CONSTRAINT driver_feedback_status CHECK (status IN ('submitted', 'reviewed', 'resolved'))
);

CREATE INDEX IF NOT EXISTS idx_driver_feedback_journey_created ON public.driver_feedback(journey_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.nest_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nest_id uuid NOT NULL REFERENCES public.nests(id) ON DELETE CASCADE,
  room_number text NOT NULL,
  name text,
  room_type text,
  floor text,
  status text NOT NULL DEFAULT 'available',
  notes text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nest_rooms_status CHECK (status IN ('available', 'preparing', 'inspection_due', 'ready', 'occupied', 'out_of_service')),
  CONSTRAINT nest_rooms_unique UNIQUE (nest_id, room_number)
);

CREATE TABLE IF NOT EXISTS public.nest_room_stays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.nest_rooms(id) ON DELETE RESTRICT,
  papa_id uuid REFERENCES public.papas(id) ON DELETE SET NULL,
  program_id uuid REFERENCES public.programs(id) ON DELETE CASCADE,
  planned_check_in timestamptz,
  planned_check_out timestamptz,
  actual_check_in timestamptz,
  actual_check_out timestamptz,
  status text NOT NULL DEFAULT 'reserved',
  special_requests text,
  assigned_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nest_room_stays_status CHECK (status IN ('planned', 'reserved', 'preparing', 'ready', 'checked_in', 'checked_out', 'cancelled')),
  CONSTRAINT nest_room_stays_planned_order CHECK (planned_check_out IS NULL OR planned_check_in IS NULL OR planned_check_out >= planned_check_in),
  CONSTRAINT nest_room_stays_actual_order CHECK (actual_check_out IS NULL OR actual_check_in IS NULL OR actual_check_out >= actual_check_in)
);

CREATE EXTENSION IF NOT EXISTS btree_gist;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nest_room_stays_no_active_overlap'
      AND conrelid = 'public.nest_room_stays'::regclass
  ) THEN
    ALTER TABLE public.nest_room_stays
      ADD CONSTRAINT nest_room_stays_no_active_overlap
      EXCLUDE USING gist (
        room_id WITH =,
        tstzrange(planned_check_in, planned_check_out, '[)') WITH &&
      )
      WHERE (
        status NOT IN ('checked_out', 'cancelled')
        AND planned_check_in IS NOT NULL
        AND planned_check_out IS NOT NULL
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.nest_room_guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stay_id uuid NOT NULL REFERENCES public.nest_room_stays(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  relationship text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_nest_room_guests_one_primary
ON public.nest_room_guests(stay_id) WHERE is_primary = true;

CREATE TABLE IF NOT EXISTS public.nest_room_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.nest_rooms(id) ON DELETE CASCADE,
  stay_id uuid REFERENCES public.nest_room_stays(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES public.users(id) ON DELETE SET NULL,
  inspected_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  due_at timestamptz,
  inspected_at timestamptz,
  status text NOT NULL DEFAULT 'assigned',
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nest_room_inspections_status CHECK (status IN ('assigned', 'in_progress', 'passed', 'attention', 'failed', 'reinspection_required'))
);

CREATE TABLE IF NOT EXISTS public.nest_room_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.nest_rooms(id) ON DELETE CASCADE,
  stay_id uuid REFERENCES public.nest_room_stays(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  category text NOT NULL DEFAULT 'amenity',
  photo_path text,
  status text NOT NULL DEFAULT 'placed',
  notes text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nest_room_items_quantity CHECK (quantity >= 0),
  CONSTRAINT nest_room_items_category CHECK (category IN ('gift', 'amenity', 'welcome_note', 'food', 'equipment')),
  CONSTRAINT nest_room_items_status CHECK (status IN ('planned', 'placed', 'delivered', 'verified', 'removed', 'missing'))
);

CREATE TABLE IF NOT EXISTS public.nest_room_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.nest_rooms(id) ON DELETE CASCADE,
  stay_id uuid REFERENCES public.nest_room_stays(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  severity text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  reported_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES public.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolution_notes text,
  next_use_blocked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nest_room_issues_severity CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT nest_room_issues_status CHECK (status IN ('open', 'assigned', 'in_progress', 'resolved', 'verified', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_nest_rooms_nest_status ON public.nest_rooms(nest_id, status);
CREATE INDEX IF NOT EXISTS idx_nest_stays_program_status ON public.nest_room_stays(program_id, status);
CREATE INDEX IF NOT EXISTS idx_nest_inspections_assignee ON public.nest_room_inspections(assigned_to, status, due_at);
CREATE INDEX IF NOT EXISTS idx_nest_issues_room_status ON public.nest_room_issues(room_id, status, severity);

ALTER TABLE public.nest_room_stays
  ADD CONSTRAINT nest_room_stays_id_room_unique UNIQUE (id, room_id);
ALTER TABLE public.nest_room_inspections
  ADD CONSTRAINT nest_room_inspections_stay_room_fkey
  FOREIGN KEY (stay_id, room_id) REFERENCES public.nest_room_stays(id, room_id) ON DELETE CASCADE;
ALTER TABLE public.nest_room_items
  ADD CONSTRAINT nest_room_items_stay_room_fkey
  FOREIGN KEY (stay_id, room_id) REFERENCES public.nest_room_stays(id, room_id) ON DELETE CASCADE;
ALTER TABLE public.nest_room_issues
  ADD CONSTRAINT nest_room_issues_stay_room_fkey
  FOREIGN KEY (stay_id, room_id) REFERENCES public.nest_room_stays(id, room_id);

CREATE OR REPLACE FUNCTION public.reconcile_nest_room_status(target_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_status text;
  latest_inspection_status text;
  relevant_stay_id uuid;
  relevant_stay_created_at timestamptz;
  relevant_stay_status text;
  latest_checkout_at timestamptz;
BEGIN
  SELECT max(coalesce(stay.actual_check_out, stay.updated_at, stay.planned_check_out))
  INTO latest_checkout_at
  FROM public.nest_room_stays stay
  WHERE stay.room_id = target_room_id AND stay.status = 'checked_out';

  SELECT stay.id, stay.created_at, stay.status
  INTO relevant_stay_id, relevant_stay_created_at, relevant_stay_status
  FROM public.nest_room_stays stay
  WHERE stay.room_id = target_room_id
    AND stay.status NOT IN ('checked_out', 'cancelled')
    AND (stay.status = 'checked_in' OR stay.planned_check_out IS NULL OR stay.planned_check_out >= now())
  ORDER BY
    CASE WHEN stay.status = 'checked_in' THEN 0 ELSE 1 END,
    stay.planned_check_in NULLS LAST,
    stay.created_at
  LIMIT 1;

  SELECT inspection.status INTO latest_inspection_status
  FROM public.nest_room_inspections inspection
  WHERE inspection.room_id = target_room_id
    AND (latest_checkout_at IS NULL OR inspection.created_at >= latest_checkout_at)
    AND (
      (relevant_stay_id IS NOT NULL AND (
        inspection.stay_id = relevant_stay_id
        OR (inspection.stay_id IS NULL AND inspection.created_at >= relevant_stay_created_at)
      ))
      OR (relevant_stay_id IS NULL AND inspection.stay_id IS NULL)
    )
  ORDER BY coalesce(inspection.inspected_at, inspection.created_at) DESC, inspection.created_at DESC
  LIMIT 1;

  IF EXISTS (
    SELECT 1 FROM public.nest_room_issues issue
    WHERE issue.room_id = target_room_id
      AND issue.next_use_blocked = true
      AND issue.status NOT IN ('resolved', 'verified', 'closed')
  ) THEN
    next_status := 'out_of_service';
  ELSIF relevant_stay_status = 'checked_in' THEN
    next_status := 'occupied';
  ELSIF latest_inspection_status IN ('attention', 'failed') THEN
    next_status := 'out_of_service';
  ELSIF latest_inspection_status IN ('assigned', 'in_progress', 'reinspection_required') THEN
    next_status := 'inspection_due';
  ELSIF latest_inspection_status = 'passed' THEN
    next_status := 'ready';
  ELSIF relevant_stay_id IS NOT NULL THEN
    next_status := 'preparing';
  ELSE
    next_status := 'available';
  END IF;

  UPDATE public.nest_rooms SET status = next_status, updated_at = now()
  WHERE id = target_room_id AND status IS DISTINCT FROM next_status;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_nest_room_status(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_nest_room_status(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_nest_room_status(uuid) FROM authenticated;

CREATE OR REPLACE FUNCTION public.sync_nest_room_status_from_child()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.reconcile_nest_room_status(OLD.room_id);
    RETURN OLD;
  END IF;

  PERFORM public.reconcile_nest_room_status(NEW.room_id);
  IF TG_OP = 'UPDATE' AND OLD.room_id IS DISTINCT FROM NEW.room_id THEN
    PERFORM public.reconcile_nest_room_status(OLD.room_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS nest_stays_sync_room_status ON public.nest_room_stays;
CREATE TRIGGER nest_stays_sync_room_status
AFTER INSERT OR UPDATE OR DELETE ON public.nest_room_stays
FOR EACH ROW EXECUTE FUNCTION public.sync_nest_room_status_from_child();
DROP TRIGGER IF EXISTS nest_inspections_sync_room_status ON public.nest_room_inspections;
CREATE TRIGGER nest_inspections_sync_room_status
AFTER INSERT OR UPDATE OR DELETE ON public.nest_room_inspections
FOR EACH ROW EXECUTE FUNCTION public.sync_nest_room_status_from_child();
DROP TRIGGER IF EXISTS nest_issues_sync_room_status ON public.nest_room_issues;
CREATE TRIGGER nest_issues_sync_room_status
AFTER INSERT OR UPDATE OR DELETE ON public.nest_room_issues
FOR EACH ROW EXECUTE FUNCTION public.sync_nest_room_status_from_child();

CREATE OR REPLACE FUNCTION public.guard_nest_assigned_record_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_unit('november_nest') THEN
    IF TG_TABLE_NAME = 'nest_room_inspections' THEN
      IF OLD.assigned_to IS DISTINCT FROM auth.uid()
        OR NEW.room_id IS DISTINCT FROM OLD.room_id
        OR NEW.stay_id IS DISTINCT FROM OLD.stay_id
        OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
        OR NEW.inspected_by IS DISTINCT FROM auth.uid()
      THEN
        RAISE EXCEPTION 'Assigned inspectors may update only their inspection result';
      END IF;
    ELSIF TG_TABLE_NAME = 'nest_room_items' THEN
      IF OLD.created_by IS DISTINCT FROM auth.uid()
        OR NEW.room_id IS DISTINCT FROM OLD.room_id
        OR NEW.stay_id IS DISTINCT FROM OLD.stay_id
        OR NEW.created_by IS DISTINCT FROM OLD.created_by
      THEN
        RAISE EXCEPTION 'Item ownership and room identity cannot be changed';
      END IF;
    ELSIF TG_TABLE_NAME = 'nest_room_issues' THEN
      IF auth.uid() IS DISTINCT FROM OLD.reported_by AND auth.uid() IS DISTINCT FROM OLD.assigned_to THEN
        RAISE EXCEPTION 'Only the reporter, assignee or Nest head can update this issue';
      END IF;
      IF NEW.room_id IS DISTINCT FROM OLD.room_id
        OR NEW.stay_id IS DISTINCT FROM OLD.stay_id
        OR NEW.reported_by IS DISTINCT FROM OLD.reported_by
        OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
      THEN
        RAISE EXCEPTION 'Issue ownership and room identity cannot be changed';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS nest_inspections_guard_identity ON public.nest_room_inspections;
CREATE TRIGGER nest_inspections_guard_identity BEFORE UPDATE ON public.nest_room_inspections
FOR EACH ROW EXECUTE FUNCTION public.guard_nest_assigned_record_identity();
DROP TRIGGER IF EXISTS nest_items_guard_identity ON public.nest_room_items;
CREATE TRIGGER nest_items_guard_identity BEFORE UPDATE ON public.nest_room_items
FOR EACH ROW EXECUTE FUNCTION public.guard_nest_assigned_record_identity();
DROP TRIGGER IF EXISTS nest_issues_guard_identity ON public.nest_room_issues;
CREATE TRIGGER nest_issues_guard_identity BEFORE UPDATE ON public.nest_room_issues
FOR EACH ROW EXECUTE FUNCTION public.guard_nest_assigned_record_identity();

-- Presentation rows are auditable file manifests. A DO may edit the display
-- title, but cannot repoint an authorized row to another Papa, programme or
-- object path after insertion.
CREATE OR REPLACE FUNCTION public.guard_presentation_asset_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF split_part(NEW.storage_path, '/', 1) IS DISTINCT FROM NEW.papa_id::text
    OR split_part(NEW.storage_path, '/', 2) IS DISTINCT FROM coalesce(NEW.program_id::text, 'unassigned')
  THEN
    RAISE EXCEPTION 'Presentation path must match its Papa and programme';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW.papa_id IS DISTINCT FROM OLD.papa_id
    OR NEW.program_id IS DISTINCT FROM OLD.program_id
    OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
    OR NEW.original_name IS DISTINCT FROM OLD.original_name
    OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
    OR NEW.file_size IS DISTINCT FROM OLD.file_size
    OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by
  ) THEN
    RAISE EXCEPTION 'Presentation file identity is immutable; upload a new version instead';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS presentation_assets_guard_identity ON public.presentation_assets;
CREATE TRIGGER presentation_assets_guard_identity
BEFORE INSERT OR UPDATE ON public.presentation_assets
FOR EACH ROW EXECUTE FUNCTION public.guard_presentation_asset_identity();

CREATE OR REPLACE FUNCTION public.guard_driver_feedback_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  journey_papa_id uuid;
BEGIN
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

DROP TRIGGER IF EXISTS driver_feedback_guard_identity ON public.driver_feedback;
CREATE TRIGGER driver_feedback_guard_identity
BEFORE INSERT OR UPDATE ON public.driver_feedback
FOR EACH ROW EXECUTE FUNCTION public.guard_driver_feedback_identity();

-- Updated-at triggers.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'senior_ministers', 'program_senior_ministers', 'papa_entourage_members',
    'operational_posts', 'welcome_parties', 'papa_book_batches', 'seat_assignments',
    'flight_itineraries', 'flight_legs', 'fleet_partners', 'journey_cheetahs',
    'driver_feedback', 'nest_rooms', 'nest_room_stays', 'nest_room_inspections',
    'nest_room_items', 'nest_room_issues'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_set_updated_at ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      table_name, table_name
    );
  END LOOP;
END $$;

-- Automatically seed Victor priority positions A–F whenever the Victor unit is
-- deployed to a venue. Re-running is safe because of the unique constraint.
CREATE OR REPLACE FUNCTION public.seed_victor_priority_posts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  unit_slug text;
BEGIN
  SELECT slug INTO unit_slug FROM public.units WHERE id = NEW.unit_id;
  IF unit_slug = 'victor' THEN
    INSERT INTO public.operational_posts (program_venue_id, unit_id, code, label, created_by)
    SELECT NEW.program_venue_id, NEW.unit_id, code, 'Priority Position ' || code, NEW.created_by
    FROM unnest(ARRAY['A','B','C','D','E','F']) AS code
    ON CONFLICT (program_venue_id, unit_id, code) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS unit_deployments_seed_victor_posts ON public.unit_deployments;
CREATE TRIGGER unit_deployments_seed_victor_posts
AFTER INSERT ON public.unit_deployments
FOR EACH ROW EXECUTE FUNCTION public.seed_victor_priority_posts();

INSERT INTO public.operational_posts (program_venue_id, unit_id, code, label, created_by)
SELECT d.program_venue_id, d.unit_id, code, 'Priority Position ' || code, d.created_by
FROM public.unit_deployments d
JOIN public.units u ON u.id = d.unit_id AND u.slug = 'victor'
CROSS JOIN unnest(ARRAY['A','B','C','D','E','F']) AS code
ON CONFLICT (program_venue_id, unit_id, code) DO NOTHING;

-- Private storage buckets. Files are served with short-lived signed URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('papa-presentations', 'papa-presentations', false, 52428800, ARRAY[
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]),
  ('nest-room-media', 'nest-room-media', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- One assignment check for every operational policy. It covers both legacy
-- lead-DO columns and the normalized many-DO table.
CREATE OR REPLACE FUNCTION public.is_assigned_do_for_journey(target_journey_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.journeys journey
    JOIN public.users viewer ON viewer.id = auth.uid()
    WHERE journey.id = target_journey_id
      AND coalesce(journey.is_deleted, false) = false
      AND coalesce(viewer.is_active, true) = true
      AND coalesce(viewer.activation_status, 'active') = 'active'
      AND (
        (
          (journey.assigned_do_id = auth.uid() OR journey.assigned_duty_officer_id = auth.uid())
          AND NOT EXISTS (
            SELECT 1 FROM public.journey_duty_officers rejected_assignment
            WHERE rejected_assignment.journey_id = journey.id
              AND rejected_assignment.user_id = auth.uid()
              AND rejected_assignment.status = 'rejected'
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.journey_duty_officers assignment
          WHERE assignment.journey_id = journey.id
            AND assignment.user_id = auth.uid()
            AND coalesce(assignment.status, 'acknowledged') IN ('pending', 'acknowledged')
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_assigned_do_for_papa(target_papa_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.journeys journey
    WHERE (
        journey.papa_id = target_papa_id
        OR EXISTS (
          SELECT 1 FROM public.journey_papas journey_papa
          WHERE journey_papa.journey_id = journey.id
            AND journey_papa.papa_id = target_papa_id
        )
      )
      AND public.is_assigned_do_for_journey(journey.id)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_assigned_do_for_papa_program(
  target_papa_id uuid,
  target_program_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.journeys journey
    WHERE (
        journey.papa_id = target_papa_id
        OR EXISTS (
          SELECT 1 FROM public.journey_papas journey_papa
          WHERE journey_papa.journey_id = journey.id
            AND journey_papa.papa_id = target_papa_id
        )
      )
      AND journey.program_id IS NOT DISTINCT FROM target_program_id
      AND public.is_assigned_do_for_journey(journey.id)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_assigned_do_for_presentation_path(
  target_papa_text text,
  target_program_text text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.journeys journey
    WHERE (
        journey.papa_id::text = target_papa_text
        OR EXISTS (
          SELECT 1 FROM public.journey_papas journey_papa
          WHERE journey_papa.journey_id = journey.id
            AND journey_papa.papa_id::text = target_papa_text
        )
      )
      AND coalesce(journey.program_id::text, 'unassigned') = target_program_text
      AND public.is_assigned_do_for_journey(journey.id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_assigned_do_for_journey(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_assigned_do_for_papa(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_assigned_do_for_papa_program(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_assigned_do_for_presentation_path(text, text) TO authenticated;

-- Enable RLS on all new operational tables.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'senior_ministers', 'program_senior_ministers', 'papa_entourage_members',
    'operational_posts', 'operational_post_assignments', 'welcome_parties',
    'welcome_party_members', 'presentation_assets', 'papa_book_batches',
    'papa_book_movements', 'papa_book_settlements', 'seat_assignments',
    'flight_itineraries', 'flight_legs', 'fleet_partners', 'journey_cheetahs',
    'driver_feedback', 'nest_rooms', 'nest_room_stays', 'nest_room_guests',
    'nest_room_inspections', 'nest_room_items', 'nest_room_issues'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

-- Victor policies.
ALTER TABLE public.theatres ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS theatres_victor_head_manage_v4 ON public.theatres;
CREATE POLICY theatres_victor_head_manage_v4 ON public.theatres
FOR ALL TO authenticated
USING (public.can_manage_unit('victor'))
WITH CHECK (public.can_manage_unit('victor'));

ALTER TABLE public.seat_arrangements ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'seat_arrangements'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.seat_arrangements', policy_record.policyname);
  END LOOP;
END $$;

CREATE POLICY seat_arrangements_operational_select ON public.seat_arrangements
FOR SELECT TO authenticated
USING (
  public.is_platform_admin()
  OR public.is_unit_member('victor')
  OR EXISTS (
    SELECT 1 FROM public.journeys journey
    WHERE journey.program_id = seat_arrangements.program_id
      AND public.is_assigned_do_for_journey(journey.id)
  )
);
CREATE POLICY seat_arrangements_victor_manage ON public.seat_arrangements
FOR ALL TO authenticated
USING (public.can_manage_unit('victor'))
WITH CHECK (public.can_manage_unit('victor'));

DROP POLICY IF EXISTS senior_ministers_victor_select ON public.senior_ministers;
CREATE POLICY senior_ministers_victor_select ON public.senior_ministers FOR SELECT TO authenticated
USING (public.is_platform_admin() OR public.is_unit_member('victor'));
DROP POLICY IF EXISTS senior_ministers_victor_manage ON public.senior_ministers;
CREATE POLICY senior_ministers_victor_manage ON public.senior_ministers FOR ALL TO authenticated
USING (public.can_manage_unit('victor')) WITH CHECK (public.can_manage_unit('victor'));

DROP POLICY IF EXISTS program_senior_ministers_victor_select ON public.program_senior_ministers;
CREATE POLICY program_senior_ministers_victor_select ON public.program_senior_ministers FOR SELECT TO authenticated
USING (public.is_platform_admin() OR public.is_unit_member('victor'));
DROP POLICY IF EXISTS program_senior_ministers_victor_manage ON public.program_senior_ministers;
CREATE POLICY program_senior_ministers_victor_manage ON public.program_senior_ministers FOR ALL TO authenticated
USING (public.can_manage_unit('victor')) WITH CHECK (public.can_manage_unit('victor'));

DROP POLICY IF EXISTS papa_entourage_operational_select ON public.papa_entourage_members;
CREATE POLICY papa_entourage_operational_select ON public.papa_entourage_members FOR SELECT TO authenticated
USING (
  public.is_platform_admin()
  OR public.is_unit_member('victor')
  OR public.is_unit_member('november_nest')
  OR public.is_assigned_do_for_papa(papa_entourage_members.papa_id)
);
DROP POLICY IF EXISTS papa_entourage_manage ON public.papa_entourage_members;
CREATE POLICY papa_entourage_manage ON public.papa_entourage_members FOR ALL TO authenticated
USING (
  public.can_manage_unit('victor')
  OR public.is_assigned_do_for_papa(papa_entourage_members.papa_id)
)
WITH CHECK (
  public.can_manage_unit('victor')
  OR public.is_assigned_do_for_papa(papa_entourage_members.papa_id)
);

DROP POLICY IF EXISTS operational_posts_authenticated_select ON public.operational_posts;
CREATE POLICY operational_posts_authenticated_select ON public.operational_posts FOR SELECT TO authenticated
USING (
  public.is_platform_admin() OR public.is_unit_member('victor')
  OR EXISTS (
    SELECT 1 FROM public.operational_post_assignments assignment
    WHERE assignment.post_id = operational_posts.id AND assignment.user_id = auth.uid()
  )
);
DROP POLICY IF EXISTS operational_posts_unit_manage ON public.operational_posts;
CREATE POLICY operational_posts_unit_manage ON public.operational_posts FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.units u WHERE u.id = operational_posts.unit_id AND public.can_manage_unit(u.slug)))
WITH CHECK (EXISTS (SELECT 1 FROM public.units u WHERE u.id = operational_posts.unit_id AND public.can_manage_unit(u.slug)));

DROP POLICY IF EXISTS post_assignments_authenticated_select ON public.operational_post_assignments;
CREATE POLICY post_assignments_authenticated_select ON public.operational_post_assignments FOR SELECT TO authenticated
USING (public.is_platform_admin() OR public.is_unit_member('victor') OR user_id = auth.uid());
DROP POLICY IF EXISTS post_assignments_unit_manage ON public.operational_post_assignments;
CREATE POLICY post_assignments_unit_manage ON public.operational_post_assignments FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.operational_posts p JOIN public.units u ON u.id = p.unit_id
  WHERE p.id = operational_post_assignments.post_id AND public.can_manage_unit(u.slug)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.operational_posts p JOIN public.units u ON u.id = p.unit_id
  WHERE p.id = operational_post_assignments.post_id AND public.can_manage_unit(u.slug)
));

DROP POLICY IF EXISTS welcome_parties_authenticated_select ON public.welcome_parties;
CREATE POLICY welcome_parties_authenticated_select ON public.welcome_parties FOR SELECT TO authenticated
USING (
  public.is_platform_admin() OR public.is_unit_member('victor')
  OR EXISTS (
    SELECT 1 FROM public.welcome_party_members member
    WHERE member.party_id = welcome_parties.id AND member.user_id = auth.uid()
  )
);
DROP POLICY IF EXISTS welcome_parties_victor_manage ON public.welcome_parties;
CREATE POLICY welcome_parties_victor_manage ON public.welcome_parties FOR ALL TO authenticated
USING (public.can_manage_unit('victor')) WITH CHECK (public.can_manage_unit('victor'));
DROP POLICY IF EXISTS welcome_party_members_authenticated_select ON public.welcome_party_members;
CREATE POLICY welcome_party_members_authenticated_select ON public.welcome_party_members FOR SELECT TO authenticated
USING (public.is_platform_admin() OR public.is_unit_member('victor') OR user_id = auth.uid());
DROP POLICY IF EXISTS welcome_party_members_victor_manage ON public.welcome_party_members;
CREATE POLICY welcome_party_members_victor_manage ON public.welcome_party_members FOR ALL TO authenticated
USING (public.can_manage_unit('victor')) WITH CHECK (public.can_manage_unit('victor'));

DROP POLICY IF EXISTS presentation_assets_scoped_select ON public.presentation_assets;
CREATE POLICY presentation_assets_scoped_select ON public.presentation_assets FOR SELECT TO authenticated
USING (
  public.is_platform_admin() OR public.is_unit_member('victor')
  OR uploaded_by = auth.uid()
  OR public.is_assigned_do_for_papa_program(presentation_assets.papa_id, presentation_assets.program_id)
);
DROP POLICY IF EXISTS presentation_assets_scoped_insert ON public.presentation_assets;
CREATE POLICY presentation_assets_scoped_insert ON public.presentation_assets FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND (
    public.is_platform_admin() OR public.is_unit_member('victor')
    OR public.is_assigned_do_for_papa_program(presentation_assets.papa_id, presentation_assets.program_id)
  )
);
DROP POLICY IF EXISTS presentation_assets_owner_manage ON public.presentation_assets;
CREATE POLICY presentation_assets_owner_manage ON public.presentation_assets FOR UPDATE TO authenticated
USING (uploaded_by = auth.uid() OR public.can_manage_unit('victor'))
WITH CHECK (uploaded_by = auth.uid() OR public.can_manage_unit('victor'));
DROP POLICY IF EXISTS presentation_assets_owner_delete ON public.presentation_assets;
CREATE POLICY presentation_assets_owner_delete ON public.presentation_assets FOR DELETE TO authenticated
USING (uploaded_by = auth.uid() OR public.can_manage_unit('victor'));

DROP POLICY IF EXISTS book_batches_victor_select ON public.papa_book_batches;
CREATE POLICY book_batches_victor_select ON public.papa_book_batches FOR SELECT TO authenticated
USING (public.is_platform_admin() OR public.is_unit_member('victor'));
DROP POLICY IF EXISTS book_batches_victor_manage ON public.papa_book_batches;
CREATE POLICY book_batches_victor_manage ON public.papa_book_batches FOR ALL TO authenticated
USING (public.can_manage_unit('victor')) WITH CHECK (public.can_manage_unit('victor'));
DROP POLICY IF EXISTS book_movements_victor_select ON public.papa_book_movements;
CREATE POLICY book_movements_victor_select ON public.papa_book_movements FOR SELECT TO authenticated
USING (public.is_platform_admin() OR public.is_unit_member('victor'));
DROP POLICY IF EXISTS book_movements_victor_insert ON public.papa_book_movements;
CREATE POLICY book_movements_victor_insert ON public.papa_book_movements FOR INSERT TO authenticated
WITH CHECK (public.can_manage_unit('victor'));
DROP POLICY IF EXISTS book_settlements_victor_select ON public.papa_book_settlements;
CREATE POLICY book_settlements_victor_select ON public.papa_book_settlements FOR SELECT TO authenticated
USING (public.is_platform_admin() OR public.is_unit_member('victor'));
DROP POLICY IF EXISTS book_settlements_victor_manage ON public.papa_book_settlements;
CREATE POLICY book_settlements_victor_manage ON public.papa_book_settlements FOR ALL TO authenticated
USING (public.can_manage_unit('victor')) WITH CHECK (public.can_manage_unit('victor'));

DROP POLICY IF EXISTS seat_assignments_authenticated_select ON public.seat_assignments;
CREATE POLICY seat_assignments_authenticated_select ON public.seat_assignments FOR SELECT TO authenticated
USING (public.is_platform_admin() OR public.is_unit_member('victor'));
DROP POLICY IF EXISTS seat_assignments_victor_manage ON public.seat_assignments;
CREATE POLICY seat_assignments_victor_manage ON public.seat_assignments FOR ALL TO authenticated
USING (public.can_manage_unit('victor')) WITH CHECK (public.can_manage_unit('victor'));

-- Flight itineraries are deliberately restricted to operational units that need
-- them. Command/Alpha manage telemetry; Tango/Nest/Victor receive read access.
DROP POLICY IF EXISTS flight_itineraries_operational_select ON public.flight_itineraries;
CREATE POLICY flight_itineraries_operational_select ON public.flight_itineraries FOR SELECT TO authenticated
USING (
  public.is_platform_admin()
  OR public.is_unit_member('command') OR public.is_unit_member('alpha')
  OR public.is_unit_member('tango') OR public.is_unit_member('november_nest')
  OR public.is_unit_member('victor')
  OR public.is_assigned_do_for_papa_program(flight_itineraries.papa_id, flight_itineraries.program_id)
);
DROP POLICY IF EXISTS flight_itineraries_manage ON public.flight_itineraries;
CREATE POLICY flight_itineraries_manage ON public.flight_itineraries FOR ALL TO authenticated
USING (public.is_platform_admin() OR public.can_manage_unit('command') OR public.can_manage_unit('alpha'))
WITH CHECK (public.is_platform_admin() OR public.can_manage_unit('command') OR public.can_manage_unit('alpha'));

DROP POLICY IF EXISTS flight_legs_operational_select ON public.flight_legs;
CREATE POLICY flight_legs_operational_select ON public.flight_legs FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.flight_itineraries itinerary
  WHERE itinerary.id = flight_legs.itinerary_id
));
DROP POLICY IF EXISTS flight_legs_manage ON public.flight_legs;
CREATE POLICY flight_legs_manage ON public.flight_legs FOR ALL TO authenticated
USING (public.is_platform_admin() OR public.can_manage_unit('command') OR public.can_manage_unit('alpha'))
WITH CHECK (public.is_platform_admin() OR public.can_manage_unit('command') OR public.can_manage_unit('alpha'));

-- Tango policies.
ALTER TABLE public.cheetahs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cheetahs_tango_head_manage_v4 ON public.cheetahs;
CREATE POLICY cheetahs_tango_head_manage_v4 ON public.cheetahs
FOR ALL TO authenticated
USING (public.can_manage_unit('tango'))
WITH CHECK (public.can_manage_unit('tango'));

DROP POLICY IF EXISTS fleet_partners_tango_select ON public.fleet_partners;
CREATE POLICY fleet_partners_tango_select ON public.fleet_partners FOR SELECT TO authenticated
USING (public.is_platform_admin() OR public.is_unit_member('tango'));
DROP POLICY IF EXISTS fleet_partners_tango_manage ON public.fleet_partners;
CREATE POLICY fleet_partners_tango_manage ON public.fleet_partners FOR ALL TO authenticated
USING (public.can_manage_unit('tango')) WITH CHECK (public.can_manage_unit('tango'));

DROP POLICY IF EXISTS journey_cheetahs_authenticated_select ON public.journey_cheetahs;
CREATE POLICY journey_cheetahs_authenticated_select ON public.journey_cheetahs FOR SELECT TO authenticated
USING (
  public.is_platform_admin() OR public.is_unit_member('tango')
  OR public.is_assigned_do_for_journey(journey_id)
);
DROP POLICY IF EXISTS journey_cheetahs_tango_manage ON public.journey_cheetahs;
CREATE POLICY journey_cheetahs_tango_manage ON public.journey_cheetahs FOR ALL TO authenticated
USING (public.can_manage_unit('tango'))
WITH CHECK (public.can_manage_unit('tango'));

DROP POLICY IF EXISTS driver_feedback_scoped_select ON public.driver_feedback;
CREATE POLICY driver_feedback_scoped_select ON public.driver_feedback FOR SELECT TO authenticated
USING (reviewer_id = auth.uid() OR public.is_platform_admin() OR public.is_unit_member('tango'));
DROP POLICY IF EXISTS driver_feedback_do_insert ON public.driver_feedback;
CREATE POLICY driver_feedback_do_insert ON public.driver_feedback FOR INSERT TO authenticated
WITH CHECK (
  reviewer_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.journeys j
    WHERE j.id = driver_feedback.journey_id
      AND public.is_assigned_do_for_journey(j.id)
      AND (
        driver_feedback.papa_id IS NULL
        OR driver_feedback.papa_id IS NOT DISTINCT FROM j.papa_id
        OR EXISTS (
          SELECT 1 FROM public.journey_papas journey_papa
          WHERE journey_papa.journey_id = j.id
            AND journey_papa.papa_id = driver_feedback.papa_id
        )
      )
      AND (
        driver_feedback.cheetah_id IS NULL
        OR driver_feedback.cheetah_id = j.assigned_cheetah_id
        OR EXISTS (
          SELECT 1 FROM public.journey_cheetahs allocation
          WHERE allocation.journey_id = j.id
            AND allocation.cheetah_id = driver_feedback.cheetah_id
        )
      )
  )
);
DROP POLICY IF EXISTS driver_feedback_tango_update ON public.driver_feedback;
CREATE POLICY driver_feedback_tango_update ON public.driver_feedback FOR UPDATE TO authenticated
USING (reviewer_id = auth.uid() OR public.can_manage_unit('tango'))
WITH CHECK (reviewer_id = auth.uid() OR public.can_manage_unit('tango'));

-- Nest policies. General officers can see room readiness but sensitive stay,
-- guest and issue detail remains scoped to Nest/Command/admin or the assignee.
ALTER TABLE public.nests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nests_november_head_manage_v4 ON public.nests;
CREATE POLICY nests_november_head_manage_v4 ON public.nests
FOR ALL TO authenticated
USING (public.can_manage_unit('november_nest') AND coalesce(type, 'nest') = 'nest')
WITH CHECK (public.can_manage_unit('november_nest') AND coalesce(type, 'nest') = 'nest');

ALTER TABLE public.papa_accommodations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS papa_accommodations_nest_select_v4 ON public.papa_accommodations;
CREATE POLICY papa_accommodations_nest_select_v4 ON public.papa_accommodations
FOR SELECT TO authenticated
USING (public.is_platform_admin() OR public.is_unit_member('november_nest'));
DROP POLICY IF EXISTS papa_accommodations_nest_manage_v4 ON public.papa_accommodations;
CREATE POLICY papa_accommodations_nest_manage_v4 ON public.papa_accommodations
FOR ALL TO authenticated
USING (public.can_manage_unit('november_nest'))
WITH CHECK (public.can_manage_unit('november_nest'));

DROP POLICY IF EXISTS nest_rooms_authenticated_select ON public.nest_rooms;
CREATE POLICY nest_rooms_authenticated_select ON public.nest_rooms FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS nest_rooms_manage ON public.nest_rooms;
CREATE POLICY nest_rooms_manage ON public.nest_rooms FOR ALL TO authenticated
USING (public.can_manage_unit('november_nest')) WITH CHECK (public.can_manage_unit('november_nest'));

DROP POLICY IF EXISTS nest_stays_scoped_select ON public.nest_room_stays;
CREATE POLICY nest_stays_scoped_select ON public.nest_room_stays FOR SELECT TO authenticated
USING (public.is_platform_admin() OR public.is_unit_member('november_nest') OR assigned_by = auth.uid());
DROP POLICY IF EXISTS nest_stays_manage ON public.nest_room_stays;
CREATE POLICY nest_stays_manage ON public.nest_room_stays FOR ALL TO authenticated
USING (public.can_manage_unit('november_nest')) WITH CHECK (public.can_manage_unit('november_nest'));

DROP POLICY IF EXISTS nest_guests_scoped_select ON public.nest_room_guests;
CREATE POLICY nest_guests_scoped_select ON public.nest_room_guests FOR SELECT TO authenticated
USING (public.is_platform_admin() OR public.is_unit_member('november_nest'));
DROP POLICY IF EXISTS nest_guests_manage ON public.nest_room_guests;
CREATE POLICY nest_guests_manage ON public.nest_room_guests FOR ALL TO authenticated
USING (public.can_manage_unit('november_nest')) WITH CHECK (public.can_manage_unit('november_nest'));

DROP POLICY IF EXISTS nest_inspections_scoped_select ON public.nest_room_inspections;
CREATE POLICY nest_inspections_scoped_select ON public.nest_room_inspections FOR SELECT TO authenticated
USING (public.is_platform_admin() OR public.is_unit_member('november_nest') OR assigned_to = auth.uid() OR inspected_by = auth.uid());
DROP POLICY IF EXISTS nest_inspections_contribute ON public.nest_room_inspections;
DROP POLICY IF EXISTS nest_inspections_manage ON public.nest_room_inspections;
CREATE POLICY nest_inspections_manage ON public.nest_room_inspections FOR ALL TO authenticated
USING (public.can_manage_unit('november_nest'))
WITH CHECK (public.can_manage_unit('november_nest'));
DROP POLICY IF EXISTS nest_inspections_assignee_update ON public.nest_room_inspections;
CREATE POLICY nest_inspections_assignee_update ON public.nest_room_inspections FOR UPDATE TO authenticated
USING (assigned_to = auth.uid())
WITH CHECK (assigned_to = auth.uid() AND inspected_by = auth.uid());

DROP POLICY IF EXISTS nest_items_scoped_select ON public.nest_room_items;
CREATE POLICY nest_items_scoped_select ON public.nest_room_items FOR SELECT TO authenticated
USING (public.is_platform_admin() OR public.is_unit_member('november_nest'));
DROP POLICY IF EXISTS nest_items_manage ON public.nest_room_items;
CREATE POLICY nest_items_manage ON public.nest_room_items FOR ALL TO authenticated
USING (public.can_manage_unit('november_nest'))
WITH CHECK (public.can_manage_unit('november_nest'));
DROP POLICY IF EXISTS nest_items_member_insert ON public.nest_room_items;
CREATE POLICY nest_items_member_insert ON public.nest_room_items FOR INSERT TO authenticated
WITH CHECK (public.is_unit_member('november_nest') AND created_by = auth.uid());
DROP POLICY IF EXISTS nest_items_owner_update ON public.nest_room_items;
CREATE POLICY nest_items_owner_update ON public.nest_room_items FOR UPDATE TO authenticated
USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS nest_issues_scoped_select ON public.nest_room_issues;
CREATE POLICY nest_issues_scoped_select ON public.nest_room_issues FOR SELECT TO authenticated
USING (public.is_platform_admin() OR public.is_unit_member('november_nest') OR reported_by = auth.uid() OR assigned_to = auth.uid());
DROP POLICY IF EXISTS nest_issues_contribute ON public.nest_room_issues;
DROP POLICY IF EXISTS nest_issues_manage ON public.nest_room_issues;
CREATE POLICY nest_issues_manage ON public.nest_room_issues FOR ALL TO authenticated
USING (public.can_manage_unit('november_nest'))
WITH CHECK (public.can_manage_unit('november_nest'));
DROP POLICY IF EXISTS nest_issues_member_insert ON public.nest_room_issues;
CREATE POLICY nest_issues_member_insert ON public.nest_room_issues FOR INSERT TO authenticated
WITH CHECK (public.is_unit_member('november_nest') AND reported_by = auth.uid());
DROP POLICY IF EXISTS nest_issues_contributor_update ON public.nest_room_issues;
CREATE POLICY nest_issues_contributor_update ON public.nest_room_issues FOR UPDATE TO authenticated
USING (reported_by = auth.uid() OR assigned_to = auth.uid())
WITH CHECK (reported_by = auth.uid() OR assigned_to = auth.uid());

-- Storage RLS for private presentation and room media.
DROP POLICY IF EXISTS papa_presentations_select_scoped ON storage.objects;
CREATE POLICY papa_presentations_select_scoped ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'papa-presentations'
  AND (
    owner_id = auth.uid()::text OR public.is_platform_admin() OR public.is_unit_member('victor')
    OR public.is_assigned_do_for_presentation_path(
      split_part(name, '/', 1), split_part(name, '/', 2)
    )
  )
);
DROP POLICY IF EXISTS papa_presentations_insert_scoped ON storage.objects;
CREATE POLICY papa_presentations_insert_scoped ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'papa-presentations'
  AND (
    public.is_platform_admin() OR public.is_unit_member('victor')
    OR public.is_assigned_do_for_presentation_path(
      split_part(name, '/', 1), split_part(name, '/', 2)
    )
  )
);
DROP POLICY IF EXISTS papa_presentations_manage_scoped ON storage.objects;
CREATE POLICY papa_presentations_manage_scoped ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'papa-presentations' AND public.can_manage_unit('victor'))
WITH CHECK (bucket_id = 'papa-presentations' AND public.can_manage_unit('victor'));
DROP POLICY IF EXISTS papa_presentations_delete_scoped ON storage.objects;
CREATE POLICY papa_presentations_delete_scoped ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'papa-presentations' AND (owner_id = auth.uid()::text OR public.can_manage_unit('victor')));

DROP POLICY IF EXISTS nest_room_media_select_scoped ON storage.objects;
CREATE POLICY nest_room_media_select_scoped ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'nest-room-media' AND (owner_id = auth.uid()::text OR public.is_platform_admin() OR public.is_unit_member('november_nest')));
DROP POLICY IF EXISTS nest_room_media_insert_scoped ON storage.objects;
CREATE POLICY nest_room_media_insert_scoped ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'nest-room-media' AND (public.is_platform_admin() OR public.is_unit_member('november_nest')));
DROP POLICY IF EXISTS nest_room_media_manage_scoped ON storage.objects;
CREATE POLICY nest_room_media_manage_scoped ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'nest-room-media' AND (owner_id = auth.uid()::text OR public.can_manage_unit('november_nest')))
WITH CHECK (bucket_id = 'nest-room-media' AND (owner_id = auth.uid()::text OR public.can_manage_unit('november_nest')));
DROP POLICY IF EXISTS nest_room_media_delete_scoped ON storage.objects;
CREATE POLICY nest_room_media_delete_scoped ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'nest-room-media' AND (owner_id = auth.uid()::text OR public.can_manage_unit('november_nest')));

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.theatres,
  public.cheetahs,
  public.nests,
  public.papa_accommodations,
  public.seat_arrangements,
  public.senior_ministers,
  public.program_senior_ministers,
  public.papa_entourage_members,
  public.operational_posts,
  public.operational_post_assignments,
  public.welcome_parties,
  public.welcome_party_members,
  public.presentation_assets,
  public.papa_book_batches,
  public.papa_book_movements,
  public.papa_book_settlements,
  public.seat_assignments,
  public.flight_itineraries,
  public.flight_legs,
  public.fleet_partners,
  public.journey_cheetahs,
  public.driver_feedback,
  public.nest_rooms,
  public.nest_room_stays,
  public.nest_room_guests,
  public.nest_room_inspections,
  public.nest_room_items,
  public.nest_room_issues
TO authenticated;
GRANT SELECT ON public.papa_book_balances TO authenticated;
