-- Lock down write access to programs and their schedule sub-tables.
--
-- WHY: ProgramsClient shipped Create/Edit/Delete to every authenticated officer
-- with no role check (fixed in the UI in commit dcf40ef), but the UI is not the
-- security boundary — RLS is. A policy restricting programs to leadership existed
-- only in docs/archive/ SQL; it was never in an applied migration, so there was
-- no tracked guarantee it is live on the database. This migration makes the
-- boundary explicit and idempotent.
--
-- MODEL: read is open to any authenticated user (every list view needs it);
-- write (insert/update/delete) is restricted to is_admin(), the SECURITY DEFINER
-- helper already deployed and used by the nests/theatres policies. Its role set
-- (super_admin, dev_admin, admin, captain, vice_captain, head_of_operations,
-- head_of_command, command) is exactly the client isAdmin() list, so the UI and
-- the database agree.
--
-- SAFE FOR EXISTING FLOWS: the only anon/authed-client writer to these tables is
-- the (now admin-gated) programs UI. Server routes that legitimately mutate them
-- use the service-role client, which bypasses RLS entirely — so enabling RLS
-- here cannot break background/admin automation.
--
-- NOT INCLUDED: theatre_vips (senior ministers). That table is Victor-Oscar
-- owned, not admin-only, so an is_admin()-only policy would wrongly lock out
-- Victor Oscars. It needs a Victor-scoped policy verified against live schema;
-- it is gated in the UI in the meantime.

-- Fail loudly if the helper this migration depends on is somehow absent, rather
-- than silently creating a policy that references a missing function.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'is_admin' AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'is_admin() not found in public schema — aborting programs RLS migration';
  END IF;
END $$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['programs', 'program_days', 'program_sessions', 'session_speakers']
  LOOP
    -- Enable RLS (no-op if already enabled)
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Drop every prior policy on the table so re-running yields one clean pair,
    -- and so any legacy over-permissive "authenticated can do anything" policy
    -- (the actual hole) is removed rather than left to OR-grant writes.
    DECLARE
      p record;
    BEGIN
      FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
      END LOOP;
    END;

    -- Read: any authenticated user.
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (auth.uid() IS NOT NULL)',
      t || '_select_authenticated', t
    );

    -- Write (insert / update / delete): leadership only.
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (is_admin()) WITH CHECK (is_admin())',
      t || '_admin_write', t
    );
  END LOOP;
END $$;
