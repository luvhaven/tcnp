-- Drop redundant/dangerous unauthenticated-readable SELECT policies (qual = true).
-- Each of these tables already has a working `auth.uid() IS NOT NULL` policy,
-- so these `true` policies only added anon-key exposure of principal movement,
-- nest/theatre, and guest-minister data with zero functional benefit.
DROP POLICY IF EXISTS "nests_select_all" ON public.nests;
DROP POLICY IF EXISTS "nests_view" ON public.nests;
DROP POLICY IF EXISTS "theatres_select_all" ON public.theatres;
DROP POLICY IF EXISTS "theatres_view" ON public.theatres;
DROP POLICY IF EXISTS "eagle_squares_view" ON public.eagle_squares;
DROP POLICY IF EXISTS "papas_select_all" ON public.papas;

-- journeys had two `true` policies and no non-DO-scoped authenticated-only
-- policy at all — replace both with a single proper authenticated policy.
DROP POLICY IF EXISTS "journeys_select_all" ON public.journeys;
DROP POLICY IF EXISTS "journeys_select_authenticated" ON public.journeys;
CREATE POLICY "journeys_select_authenticated" ON public.journeys
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Hospitality Oscar owns Papa experiences/places (per app's own unit
-- description) but had no RLS write grant on papas — the client-side
-- canManagePapas() fix would have been silently blocked by RLS without this.
CREATE POLICY "papas_hospitality_manage" ON public.papas
  FOR ALL
  USING (has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_hospitality_oscar','hospitality_oscar']::text[]))
  WITH CHECK (has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_hospitality_oscar','hospitality_oscar']::text[]));
;
