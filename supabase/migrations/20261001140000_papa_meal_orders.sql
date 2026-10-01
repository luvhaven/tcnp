-- Per-Papa meal orders taken at the Papa's chair. Closes #73.
--
-- Raised by Adesuwa (November): "I walk up to the papa to ask what they want and
-- I check them on the app and then send them to the vendor." Nothing in the
-- schema could hold that today — program_menus.items is a flat list of dishes
-- for a day with no per-Papa dimension, so the conversation happened on paper.
--
-- The vendor the order goes to is reached through menu_id -> program_menus.vendor_id
-- (added in 20260930220302), so an order never duplicates vendor data.

CREATE TABLE IF NOT EXISTS public.papa_meal_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid REFERENCES public.programs(id) ON DELETE CASCADE,
  papa_id uuid NOT NULL REFERENCES public.papas(id) ON DELETE CASCADE,
  -- Nullable: an order can be taken against a day with no published menu, and
  -- retiring a menu must not take the orders already placed from it.
  menu_id uuid REFERENCES public.program_menus(id) ON DELETE SET NULL,
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  meal_type text NOT NULL DEFAULT 'lunch' CHECK (meal_type IN ('breakfast','lunch','dinner','snacks','all_day')),
  -- A SNAPSHOT of the dish names chosen, not references into program_menus.items.
  -- program_menus.items is a positional jsonb string array that officers edit
  -- freely, so storing indexes into it would silently re-point yesterday's order
  -- at a different dish the moment a menu is reordered. The label is the record.
  selected_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  note text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','fulfilled','cancelled')),
  taken_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  taken_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT papa_meal_orders_items_is_array CHECK (jsonb_typeof(selected_items) = 'array')
);

-- One order per Papa per meal per day: re-ordering updates the order that is
-- already there instead of leaving the kitchen with two conflicting sheets.
CREATE UNIQUE INDEX IF NOT EXISTS papa_meal_orders_unique_per_meal
  ON public.papa_meal_orders (papa_id, order_date, meal_type);
CREATE INDEX IF NOT EXISTS idx_papa_meal_orders_date ON public.papa_meal_orders (order_date DESC);
CREATE INDEX IF NOT EXISTS idx_papa_meal_orders_program ON public.papa_meal_orders (program_id, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_papa_meal_orders_menu ON public.papa_meal_orders (menu_id);

DROP TRIGGER IF EXISTS papa_meal_orders_set_updated_at ON public.papa_meal_orders;
CREATE TRIGGER papa_meal_orders_set_updated_at BEFORE UPDATE ON public.papa_meal_orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.papa_meal_orders ENABLE ROW LEVEL SECURITY;

-- Reads follow the existing Papa visibility rules rather than restating them.
-- papas carries papas_select_stage_scoped (20260708234959), and row security on
-- papas is applied to this sub-select as the querying officer, so anyone who
-- cannot see the Papa cannot see what the Papa ordered either — including the
-- dietary context an order is taken against.
DROP POLICY IF EXISTS papa_meal_orders_select ON public.papa_meal_orders;
CREATE POLICY papa_meal_orders_select ON public.papa_meal_orders FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.papas p WHERE p.id = papa_meal_orders.papa_id)
);

-- Writes are the November role set that already maintains menus, minus the
-- Welfare roles: taking an order happens at the Nest, in front of the Papa.
DROP POLICY IF EXISTS papa_meal_orders_insert ON public.papa_meal_orders;
CREATE POLICY papa_meal_orders_insert ON public.papa_meal_orders FOR INSERT WITH CHECK (
  has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_noscar_den','noscar_den','head_noscar_nest','noscar_nest','november_oscar']::text[])
  AND EXISTS (SELECT 1 FROM public.papas p WHERE p.id = papa_meal_orders.papa_id)
);

DROP POLICY IF EXISTS papa_meal_orders_update ON public.papa_meal_orders;
CREATE POLICY papa_meal_orders_update ON public.papa_meal_orders FOR UPDATE USING (
  has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_noscar_den','noscar_den','head_noscar_nest','noscar_nest','november_oscar']::text[])
  AND EXISTS (SELECT 1 FROM public.papas p WHERE p.id = papa_meal_orders.papa_id)
);

-- Deleting is head-only, matching program_menus_delete. Cancelling an order is
-- a status change, so the floor never needs DELETE to undo a mistake.
DROP POLICY IF EXISTS papa_meal_orders_delete ON public.papa_meal_orders;
CREATE POLICY papa_meal_orders_delete ON public.papa_meal_orders FOR DELETE USING (
  has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_noscar_den','head_noscar_nest']::text[])
);
