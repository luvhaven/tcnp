-- November (Den) — let every Den unit member do Den floor work.
--
-- Menus, vendors and Papa meal orders were writable only by officers whose
-- *role* is noscar_den / head_noscar_den. New accounts keep the signup default
-- role ("viewer") and are identified by the Oscar they registered under, so
-- most of the Den team could read these tables but not use them.
--
-- These policies are purely additive (PERMISSIVE policies are OR-ed together):
-- every existing policy stays exactly as it is, so admins, command and the
-- role-based Den/Nest/Welfare access are untouched. They give a Den unit
-- member the same create/update rights the noscar_den role already has, and
-- nothing more: deleting stays with heads and leadership, and no role changes.

-- Menus: create and update.
DROP POLICY IF EXISTS program_menus_den_member_insert ON public.program_menus;
CREATE POLICY program_menus_den_member_insert ON public.program_menus
FOR INSERT TO authenticated
WITH CHECK (public.is_unit_member('november_den'));

DROP POLICY IF EXISTS program_menus_den_member_update ON public.program_menus;
CREATE POLICY program_menus_den_member_update ON public.program_menus
FOR UPDATE TO authenticated
USING (public.is_unit_member('november_den'))
WITH CHECK (public.is_unit_member('november_den'));

-- Vendors: create and update.
DROP POLICY IF EXISTS vendors_den_member_insert ON public.vendors;
CREATE POLICY vendors_den_member_insert ON public.vendors
FOR INSERT TO authenticated
WITH CHECK (public.is_unit_member('november_den'));

DROP POLICY IF EXISTS vendors_den_member_update ON public.vendors;
CREATE POLICY vendors_den_member_update ON public.vendors
FOR UPDATE TO authenticated
USING (public.is_unit_member('november_den'))
WITH CHECK (public.is_unit_member('november_den'));

-- Papa meal orders: take and update an order, only for a Papa the officer is
-- already allowed to see (the same condition the role-based policies carry).
DROP POLICY IF EXISTS papa_meal_orders_den_member_insert ON public.papa_meal_orders;
CREATE POLICY papa_meal_orders_den_member_insert ON public.papa_meal_orders
FOR INSERT TO authenticated
WITH CHECK (
  public.is_unit_member('november_den')
  AND EXISTS (SELECT 1 FROM public.papas p WHERE p.id = papa_meal_orders.papa_id)
);

DROP POLICY IF EXISTS papa_meal_orders_den_member_update ON public.papa_meal_orders;
CREATE POLICY papa_meal_orders_den_member_update ON public.papa_meal_orders
FOR UPDATE TO authenticated
USING (
  public.is_unit_member('november_den')
  AND EXISTS (SELECT 1 FROM public.papas p WHERE p.id = papa_meal_orders.papa_id)
)
WITH CHECK (
  public.is_unit_member('november_den')
  AND EXISTS (SELECT 1 FROM public.papas p WHERE p.id = papa_meal_orders.papa_id)
);
