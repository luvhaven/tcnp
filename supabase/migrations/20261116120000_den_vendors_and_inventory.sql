-- November (Den) — Stage 4: vendor management and inventory.
--
-- Vendors: the directory already exists (name and contact). This adds what the
-- PRD asks for on top — service categories, an SLA note, a price list, ratings
-- and a usage history — without changing who can already edit a vendor.
--
-- Inventory: stock is never edited directly. Every change is a movement in a
-- ledger, recorded through one function that locks the item, refuses to go
-- below zero, updates the count and raises the low-stock alert. So "usage is
-- recorded and stock updates automatically", and the count can always be
-- explained line by line.
--
-- Roles (PRD): Team Lead manages vendors and inventory. Team Members record
-- usage. Vendor ratings are visible to everyone. Platform admins pass every
-- check, and no existing policy is changed or removed.

-- ───────────────────────── Vendors ─────────────────────────

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS service_categories text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sla_notes text;

-- Who may edit a vendor's details: exactly the roles the existing
-- vendors_update policy names, plus the Den head through unit membership.
CREATE OR REPLACE FUNCTION public.can_edit_vendors()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.has_any_role(ARRAY[
    'super_admin', 'dev_admin', 'admin', 'captain', 'vice_captain', 'command',
    'head_of_command', 'head_of_operations', 'head_noscar_den', 'noscar_den',
    'head_noscar_nest', 'november_oscar', 'welfare_oscar', 'head_welfare_oscar'
  ]::text[]) OR public.can_manage_unit('november_den');
$$;

REVOKE ALL ON FUNCTION public.can_edit_vendors() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_vendors() TO authenticated, service_role;

-- The Den head edits vendors through membership, even on the default role.
DROP POLICY IF EXISTS vendors_den_head_insert ON public.vendors;
CREATE POLICY vendors_den_head_insert ON public.vendors
FOR INSERT TO authenticated WITH CHECK (public.can_manage_unit('november_den'));

DROP POLICY IF EXISTS vendors_den_head_update ON public.vendors;
CREATE POLICY vendors_den_head_update ON public.vendors
FOR UPDATE TO authenticated
USING (public.can_manage_unit('november_den'))
WITH CHECK (public.can_manage_unit('november_den'));

-- Price list.
CREATE TABLE IF NOT EXISTS public.vendor_price_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  item text NOT NULL,
  unit text,
  price numeric(14, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',
  note text,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_price_items_item CHECK (length(btrim(item)) > 0),
  CONSTRAINT vendor_price_items_price CHECK (price >= 0),
  CONSTRAINT vendor_price_items_currency CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE INDEX IF NOT EXISTS idx_vendor_price_items_vendor ON public.vendor_price_items(vendor_id, item);

DROP TRIGGER IF EXISTS vendor_price_items_set_updated_at ON public.vendor_price_items;
CREATE TRIGGER vendor_price_items_set_updated_at
BEFORE UPDATE ON public.vendor_price_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Usage history: which programme a vendor served, for what, and how it went.
CREATE TABLE IF NOT EXISTS public.vendor_engagements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL,
  service text NOT NULL,
  amount numeric(14, 2),
  currency text NOT NULL DEFAULT 'NGN',
  status text NOT NULL DEFAULT 'planned',
  notes text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_engagements_service CHECK (length(btrim(service)) > 0),
  CONSTRAINT vendor_engagements_amount CHECK (amount IS NULL OR amount >= 0),
  CONSTRAINT vendor_engagements_currency CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT vendor_engagements_status CHECK (status IN ('planned', 'confirmed', 'delivered', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_vendor_engagements_vendor ON public.vendor_engagements(vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vendor_engagements_program ON public.vendor_engagements(program_id);

DROP TRIGGER IF EXISTS vendor_engagements_set_updated_at ON public.vendor_engagements;
CREATE TRIGGER vendor_engagements_set_updated_at
BEFORE UPDATE ON public.vendor_engagements
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Ratings: one per officer per vendor per programme.
CREATE TABLE IF NOT EXISTS public.vendor_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL,
  rating integer NOT NULL,
  comment text,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_ratings_range CHECK (rating BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX IF NOT EXISTS vendor_ratings_one_per_officer
  ON public.vendor_ratings(vendor_id, created_by, coalesce(program_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS idx_vendor_ratings_vendor ON public.vendor_ratings(vendor_id, created_at DESC);

ALTER TABLE public.vendor_price_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_ratings ENABLE ROW LEVEL SECURITY;

-- Prices and spend are for the people who work with vendors, and leadership.
DROP POLICY IF EXISTS vendor_price_items_select ON public.vendor_price_items;
CREATE POLICY vendor_price_items_select ON public.vendor_price_items
FOR SELECT TO authenticated
USING (public.is_admin() OR public.is_unit_member('november_den') OR public.can_edit_vendors());

DROP POLICY IF EXISTS vendor_price_items_manage ON public.vendor_price_items;
CREATE POLICY vendor_price_items_manage ON public.vendor_price_items
FOR ALL TO authenticated
USING (public.can_edit_vendors())
WITH CHECK (public.can_edit_vendors());

DROP POLICY IF EXISTS vendor_engagements_select ON public.vendor_engagements;
CREATE POLICY vendor_engagements_select ON public.vendor_engagements
FOR SELECT TO authenticated
USING (public.is_admin() OR public.is_unit_member('november_den') OR public.can_edit_vendors());

DROP POLICY IF EXISTS vendor_engagements_manage ON public.vendor_engagements;
CREATE POLICY vendor_engagements_manage ON public.vendor_engagements
FOR ALL TO authenticated
USING (public.can_edit_vendors() OR public.can_coordinate_unit('november_den'))
WITH CHECK (public.can_edit_vendors() OR public.can_coordinate_unit('november_den'));

-- Ratings are visible to every active officer (PRD decision).
DROP POLICY IF EXISTS vendor_ratings_select ON public.vendor_ratings;
CREATE POLICY vendor_ratings_select ON public.vendor_ratings
FOR SELECT TO authenticated USING ((SELECT public.is_active_member()));

-- A rating comes from someone who worked with the vendor: a Den member or a
-- vendor editor, under their own name.
DROP POLICY IF EXISTS vendor_ratings_insert ON public.vendor_ratings;
CREATE POLICY vendor_ratings_insert ON public.vendor_ratings
FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid() AND (public.is_unit_member('november_den') OR public.can_edit_vendors()));

DROP POLICY IF EXISTS vendor_ratings_update ON public.vendor_ratings;
CREATE POLICY vendor_ratings_update ON public.vendor_ratings
FOR UPDATE TO authenticated
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS vendor_ratings_delete ON public.vendor_ratings;
CREATE POLICY vendor_ratings_delete ON public.vendor_ratings
FOR DELETE TO authenticated
USING (created_by = auth.uid() OR public.can_manage_unit('november_den'));

-- One line per vendor for the directory cards: rating and how often used.
-- No prices or amounts, so it is safe for every active officer.
CREATE OR REPLACE FUNCTION public.vendor_summaries()
RETURNS TABLE (
  vendor_id uuid,
  average_rating numeric,
  rating_count integer,
  engagement_count integer,
  menu_count integer,
  last_used date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    vendor.id,
    (SELECT round(avg(r.rating)::numeric, 1) FROM public.vendor_ratings r WHERE r.vendor_id = vendor.id),
    (SELECT count(*)::integer FROM public.vendor_ratings r WHERE r.vendor_id = vendor.id),
    (SELECT count(*)::integer FROM public.vendor_engagements e WHERE e.vendor_id = vendor.id AND e.status <> 'cancelled'),
    (SELECT count(*)::integer FROM public.program_menus m WHERE m.vendor_id = vendor.id),
    greatest(
      (SELECT max(m.menu_date) FROM public.program_menus m WHERE m.vendor_id = vendor.id),
      (SELECT max(e.created_at)::date FROM public.vendor_engagements e WHERE e.vendor_id = vendor.id AND e.status <> 'cancelled')
    )
  FROM public.vendors vendor
  WHERE public.is_active_member();
$$;

REVOKE ALL ON FUNCTION public.vendor_summaries() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_summaries() TO authenticated, service_role;

-- ───────────────────────── Inventory ─────────────────────────

CREATE TABLE IF NOT EXISTS public.den_inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text,
  unit text NOT NULL DEFAULT 'pcs',
  -- Changed only by den_record_stock(); see the guard below.
  quantity numeric(14, 2) NOT NULL DEFAULT 0,
  reorder_level numeric(14, 2) NOT NULL DEFAULT 0,
  storage_location text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT den_inventory_items_name CHECK (length(btrim(name)) > 0),
  CONSTRAINT den_inventory_items_quantity CHECK (quantity >= 0),
  CONSTRAINT den_inventory_items_reorder CHECK (reorder_level >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS den_inventory_items_name_unique ON public.den_inventory_items(lower(btrim(name)));

DROP TRIGGER IF EXISTS den_inventory_items_set_updated_at ON public.den_inventory_items;
CREATE TRIGGER den_inventory_items_set_updated_at
BEFORE UPDATE ON public.den_inventory_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- The ledger. Rows are never updated or deleted.
CREATE TABLE IF NOT EXISTS public.den_inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.den_inventory_items(id) ON DELETE CASCADE,
  movement_type text NOT NULL,
  -- Signed effect on stock: +received, -used, ± for a count correction.
  change numeric(14, 2) NOT NULL,
  balance_after numeric(14, 2) NOT NULL,
  program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL,
  note text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT den_inventory_movements_type CHECK (movement_type IN ('receive', 'use', 'count', 'adjust'))
);

CREATE INDEX IF NOT EXISTS idx_den_inventory_movements_item ON public.den_inventory_movements(item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_den_inventory_movements_program ON public.den_inventory_movements(program_id);

-- Stock set aside for a programme, so two programmes do not plan on the same boxes.
CREATE TABLE IF NOT EXISTS public.den_inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.den_inventory_items(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  quantity numeric(14, 2) NOT NULL,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT den_inventory_reservations_quantity CHECK (quantity > 0),
  CONSTRAINT den_inventory_reservations_unique UNIQUE (item_id, program_id)
);

DROP TRIGGER IF EXISTS den_inventory_reservations_set_updated_at ON public.den_inventory_reservations;
CREATE TRIGGER den_inventory_reservations_set_updated_at
BEFORE UPDATE ON public.den_inventory_reservations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.den_inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.den_inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.den_inventory_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS den_inventory_items_select ON public.den_inventory_items;
CREATE POLICY den_inventory_items_select ON public.den_inventory_items
FOR SELECT TO authenticated USING (public.is_admin() OR public.is_unit_member('november_den'));

-- The Team Lead adds, edits and retires items. The count itself is guarded below.
DROP POLICY IF EXISTS den_inventory_items_manage ON public.den_inventory_items;
CREATE POLICY den_inventory_items_manage ON public.den_inventory_items
FOR ALL TO authenticated
USING (public.can_manage_unit('november_den'))
WITH CHECK (public.can_manage_unit('november_den'));

-- Read-only from the app: movements are written by den_record_stock() alone.
DROP POLICY IF EXISTS den_inventory_movements_select ON public.den_inventory_movements;
CREATE POLICY den_inventory_movements_select ON public.den_inventory_movements
FOR SELECT TO authenticated USING (public.is_admin() OR public.is_unit_member('november_den'));

DROP POLICY IF EXISTS den_inventory_reservations_select ON public.den_inventory_reservations;
CREATE POLICY den_inventory_reservations_select ON public.den_inventory_reservations
FOR SELECT TO authenticated USING (public.is_admin() OR public.is_unit_member('november_den'));

DROP POLICY IF EXISTS den_inventory_reservations_coordinate ON public.den_inventory_reservations;
CREATE POLICY den_inventory_reservations_coordinate ON public.den_inventory_reservations
FOR ALL TO authenticated
USING (public.can_coordinate_unit('november_den'))
WITH CHECK (public.can_coordinate_unit('november_den'));

-- The stock figure cannot be typed over, even by someone allowed to edit the
-- item: only the ledger function (which sets this flag for its own
-- transaction) or the service role may change it. New items start at zero and
-- are stocked with a "receive" movement, so the ledger is complete from day one.
CREATE OR REPLACE FUNCTION public.guard_den_inventory_quantity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF coalesce(current_setting('den.stock_ledger', true), '') = 'on' OR public.is_trusted_backend() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.quantity := 0;
  ELSIF NEW.quantity IS DISTINCT FROM OLD.quantity THEN
    RAISE EXCEPTION 'Stock is changed by recording a movement, not by editing the item' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS den_inventory_items_guard_quantity ON public.den_inventory_items;
CREATE TRIGGER den_inventory_items_guard_quantity
BEFORE INSERT OR UPDATE ON public.den_inventory_items
FOR EACH ROW EXECUTE FUNCTION public.guard_den_inventory_quantity();

-- The one way stock changes.
--   use      take stock out (amount > 0). Any officer doing that programme's
--            work; coordinators may also record usage with no programme.
--   receive  put stock in (amount > 0). Team Lead.
--   count    the shelf was counted and holds `amount`; the ledger records the
--            difference. Team Lead. This is the audit.
--   adjust   a signed correction with a reason (breakage, loss). Team Lead.
CREATE OR REPLACE FUNCTION public.den_record_stock(
  target_item uuid,
  movement text,
  amount numeric,
  target_program uuid DEFAULT NULL,
  movement_note text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  item public.den_inventory_items%ROWTYPE;
  delta numeric;
  new_quantity numeric;
  program_label text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to record stock' USING ERRCODE = '42501'; END IF;
  IF amount IS NULL OR amount <> round(amount, 2) THEN
    RAISE EXCEPTION 'Enter an amount with at most two decimal places' USING ERRCODE = '22023';
  END IF;

  -- Lock the item so two officers recording at once cannot both read the old count.
  SELECT * INTO item FROM public.den_inventory_items WHERE id = target_item FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stock item not found' USING ERRCODE = 'P0002'; END IF;

  IF movement = 'use' THEN
    IF amount <= 0 THEN RAISE EXCEPTION 'Enter how many were used' USING ERRCODE = '22023'; END IF;
    IF NOT (
      public.can_coordinate_unit('november_den')
      OR (target_program IS NOT NULL AND public.den_can_take_programme_work(auth.uid(), target_program))
    ) THEN
      RAISE EXCEPTION 'You can record usage only for a programme you have been added to' USING ERRCODE = '42501';
    END IF;
    delta := -amount;
  ELSIF movement IN ('receive', 'count', 'adjust') THEN
    IF NOT public.can_manage_unit('november_den') THEN
      RAISE EXCEPTION 'Only the head of November (Den) can receive, count or adjust stock' USING ERRCODE = '42501';
    END IF;
    IF movement = 'receive' THEN
      IF amount <= 0 THEN RAISE EXCEPTION 'Enter how many were received' USING ERRCODE = '22023'; END IF;
      delta := amount;
    ELSIF movement = 'count' THEN
      IF amount < 0 THEN RAISE EXCEPTION 'A count cannot be negative' USING ERRCODE = '22023'; END IF;
      delta := amount - item.quantity;
    ELSE
      IF amount = 0 THEN RAISE EXCEPTION 'An adjustment cannot be zero' USING ERRCODE = '22023'; END IF;
      IF nullif(btrim(coalesce(movement_note, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Say why the stock is being adjusted' USING ERRCODE = '22023';
      END IF;
      delta := amount;
    END IF;
  ELSE
    RAISE EXCEPTION 'Unknown stock movement' USING ERRCODE = '22023';
  END IF;

  new_quantity := item.quantity + delta;
  IF new_quantity < 0 THEN
    RAISE EXCEPTION 'Only % % of % in stock', trim(to_char(item.quantity, 'FM999999990.##')), item.unit, item.name
      USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('den.stock_ledger', 'on', true);
  UPDATE public.den_inventory_items SET quantity = new_quantity WHERE id = target_item;
  PERFORM set_config('den.stock_ledger', 'off', true);

  INSERT INTO public.den_inventory_movements (item_id, movement_type, change, balance_after, program_id, note, created_by)
  VALUES (target_item, movement, delta, new_quantity, target_program, nullif(btrim(coalesce(movement_note, '')), ''), auth.uid());

  -- Using stock for a programme draws down what was set aside for it.
  IF movement = 'use' AND target_program IS NOT NULL THEN
    UPDATE public.den_inventory_reservations
    SET quantity = quantity - amount
    WHERE item_id = target_item AND program_id = target_program AND quantity > amount;
    IF NOT FOUND THEN
      DELETE FROM public.den_inventory_reservations WHERE item_id = target_item AND program_id = target_program;
    END IF;
  END IF;

  -- Low-stock alert, once, at the moment the level is crossed going down.
  IF item.reorder_level > 0 AND item.quantity > item.reorder_level AND new_quantity <= item.reorder_level THEN
    SELECT name INTO program_label FROM public.programs WHERE id = target_program;
    INSERT INTO public.notifications (user_id, title, message, type, channel, metadata, is_read)
    SELECT
      membership.user_id,
      'Low stock: ' || item.name,
      trim(to_char(new_quantity, 'FM999999990.##')) || ' ' || item.unit || ' left (reorder at '
        || trim(to_char(item.reorder_level, 'FM999999990.##')) || ')'
        || coalesce('. Last used for ' || program_label, '') || '.',
      'warning',
      'push',
      jsonb_build_object('kind', 'den_low_stock', 'item_id', item.id),
      false
    FROM public.unit_memberships membership
    JOIN public.units unit_record ON unit_record.id = membership.unit_id
    WHERE unit_record.slug = 'november_den'
      AND membership.status = 'active'
      AND membership.access_level IN ('head', 'sub_lead');
  END IF;

  RETURN new_quantity;
END;
$$;

REVOKE ALL ON FUNCTION public.den_record_stock(uuid, text, numeric, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.den_record_stock(uuid, text, numeric, uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
