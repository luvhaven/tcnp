-- Vendors for Den / Nest catering, and the vendor that supplies a given menu.
--
-- Raised by Adesuwa (November): "November Nest has different vendors for
-- different menus. Special menu for different menu." Closes #72 and unblocks the
-- per-Papa meal ordering in #73/#74, which needs a vendor to group orders by.
--
-- The write role sets below are copied deliberately from the program_menus
-- policies in 20260706235332_teams_and_unit_feature_tables.sql: a vendor is menu
-- data, so whoever may publish a menu may maintain the vendor it comes from.

CREATE TABLE IF NOT EXISTS public.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  cuisine_note text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendors_name_not_blank CHECK (length(btrim(name)) > 0)
);

-- Case-insensitive uniqueness on the name, so "Mama Put" and "mama put" cannot
-- both exist and split one vendor's orders across two rows.
CREATE UNIQUE INDEX IF NOT EXISTS vendors_name_unique_ci ON public.vendors (lower(btrim(name)));
CREATE INDEX IF NOT EXISTS idx_vendors_active ON public.vendors (is_active) WHERE is_active;

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

-- Vendors are reference data every officer may read: an officer taking an order
-- needs to know who supplies it, even if they may not edit the directory.
DROP POLICY IF EXISTS vendors_select ON public.vendors;
CREATE POLICY vendors_select ON public.vendors FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS vendors_insert ON public.vendors;
CREATE POLICY vendors_insert ON public.vendors FOR INSERT WITH CHECK (
  has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_noscar_den','noscar_den','head_noscar_nest','november_oscar','welfare_oscar','head_welfare_oscar']::text[])
);

DROP POLICY IF EXISTS vendors_update ON public.vendors;
CREATE POLICY vendors_update ON public.vendors FOR UPDATE USING (
  has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_noscar_den','noscar_den','head_noscar_nest','november_oscar','welfare_oscar','head_welfare_oscar']::text[])
);

-- Deleting is head-only, matching program_menus_delete.
DROP POLICY IF EXISTS vendors_delete ON public.vendors;
CREATE POLICY vendors_delete ON public.vendors FOR DELETE USING (
  has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_noscar_den','head_noscar_nest','head_welfare_oscar']::text[])
);

-- Nullable on purpose: every existing program_menus row predates vendors and
-- must keep loading, editing and saving with no vendor set. ON DELETE SET NULL so
-- retiring a vendor never takes its menus with it.
ALTER TABLE public.program_menus
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_program_menus_vendor ON public.program_menus (vendor_id);
