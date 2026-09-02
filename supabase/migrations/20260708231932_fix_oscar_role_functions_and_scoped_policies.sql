-- ═══════════════════════════════════════════════════════════════════════════
-- SOP ACCESS AUDIT — fix broken oscar-matching + replace wide-open RLS with
-- properly scoped policies (currently ANY authenticated user can insert/
-- update/delete cheetahs, theatres, nests, papas and journeys via dangling
-- "*_authenticated" policies that were left in place as a workaround for
-- these broken role-check functions never actually matching real data).
-- ═══════════════════════════════════════════════════════════════════════════

-- Generic, format-tolerant Oscar-unit matcher. Real `oscar` values are messy
-- ("Tango Oscar", "OSCAR-XX-TANGO-OSCAR", "OSCAR-XX-HEAD-TANGO_OSCAR") so we
-- match case-insensitively on substring, mirroring lib/utils.ts oscarToRole().
CREATE OR REPLACE FUNCTION public.oscar_unit_matches(unit_pattern text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND is_active = true
    AND oscar IS NOT NULL
    AND lower(oscar) LIKE '%' || lower(unit_pattern) || '%'
  );
$$;

-- Fix: previously exact-matched lowercase snake_case ('tango_oscar') which
-- never matches the real Title-Case / OSCAR-XX-* stored values.
CREATE OR REPLACE FUNCTION public.is_tango_oscar()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT oscar_unit_matches('tango') $$;

CREATE OR REPLACE FUNCTION public.is_alpha_oscar()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT oscar_unit_matches('alpha') $$;

-- New — didn't exist, so Victor/November Oscars had no working DB-level
-- write policy of their own for their unit's table.
CREATE OR REPLACE FUNCTION public.is_victor_oscar()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT oscar_unit_matches('victor') $$;

CREATE OR REPLACE FUNCTION public.is_november_oscar()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT oscar_unit_matches('november') $$;

-- Fix: Delta Oscar duty is a per-operation ASSIGNMENT recorded in `role`
-- (temporarily 'delta_oscar' while assigned), not the officer's permanent
-- `oscar` unit — checking `oscar` meant this was true for almost no one.
CREATE OR REPLACE FUNCTION public.is_delta_oscar()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'delta_oscar'
    AND is_active = true
  );
$$;

-- ─── Cheetahs: had NO real scoped write policy at all — add one ─────────────
CREATE POLICY cheetahs_oscar_manage ON public.cheetahs FOR ALL
  USING (is_admin() OR is_tango_oscar())
  WITH CHECK (is_admin() OR is_tango_oscar());

-- ─── Theatres: add the missing Victor Oscar policy ──────────────────────────
CREATE POLICY theatres_victor_manage ON public.theatres FOR ALL
  USING (is_admin() OR is_victor_oscar())
  WITH CHECK (is_admin() OR is_victor_oscar());

-- ─── Nests: add the missing November Oscar policy ───────────────────────────
CREATE POLICY nests_november_manage ON public.nests FOR ALL
  USING (is_admin() OR is_november_oscar())
  WITH CHECK (is_admin() OR is_november_oscar());

-- eagle_squares already has an Alpha-Oscar-scoped policy — it just never
-- worked because is_alpha_oscar() was broken. Fixed above; no new policy
-- needed here.

-- ─── Drop the dangerous wide-open write policies ────────────────────────────
-- (SELECT/"_view" policies are untouched — these tables are meant to be
-- readable by every authenticated officer; only writes were over-permissioned)
DROP POLICY IF EXISTS cheetahs_insert_authenticated ON public.cheetahs;
DROP POLICY IF EXISTS cheetahs_update_authenticated ON public.cheetahs;
DROP POLICY IF EXISTS cheetahs_delete_authenticated ON public.cheetahs;

DROP POLICY IF EXISTS theatres_insert_authenticated ON public.theatres;
DROP POLICY IF EXISTS theatres_update_authenticated ON public.theatres;
DROP POLICY IF EXISTS theatres_delete_authenticated ON public.theatres;

DROP POLICY IF EXISTS nests_insert_authenticated ON public.nests;
DROP POLICY IF EXISTS nests_update_authenticated ON public.nests;
DROP POLICY IF EXISTS nests_delete_authenticated ON public.nests;

DROP POLICY IF EXISTS papas_insert_authenticated ON public.papas;
DROP POLICY IF EXISTS papas_update_authenticated ON public.papas;
DROP POLICY IF EXISTS papas_delete_authenticated ON public.papas;

DROP POLICY IF EXISTS journeys_insert_authenticated ON public.journeys;
DROP POLICY IF EXISTS journeys_delete_authenticated ON public.journeys;;
