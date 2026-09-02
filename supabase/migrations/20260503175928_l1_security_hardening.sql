
-- ============================================================
-- L1 — SECURITY HARDENING
-- ============================================================

-- 1. Enable RLS on exposed tables
ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nest_amenities ENABLE ROW LEVEL SECURITY;

-- 2. Public read policies (idempotent via DO blocks)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='testimonials' AND policyname='testimonials_read_all') THEN
    CREATE POLICY "testimonials_read_all" ON public.testimonials FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='nest_amenities' AND policyname='nest_amenities_read_all') THEN
    CREATE POLICY "nest_amenities_read_all" ON public.nest_amenities FOR SELECT USING (true);
  END IF;
END $$;

-- 3. Revoke anon EXECUTE from all sensitive SECURITY DEFINER RPCs
DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'archive_journey', 'assign_do_to_journey', 'complete_journey',
    'export_program_data', 'update_journey_status', 'update_journey_call_sign',
    'upsert_user_location', 'update_user_profile', 'create_journey',
    'delete_journey', 'get_admin_dashboard_stats', 'get_journey_analytics',
    'get_operational_overview', 'log_audit_event', 'send_notification',
    'send_bulk_notification', 'create_incident', 'resolve_incident',
    'assign_cheetah_to_journey', 'assign_papa_to_journey',
    'get_journey_timeline', 'bulk_archive_journeys'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I FROM anon', fn);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

-- 4. Remove duplicate notification INSERT policies
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;

-- 5. Tighten journeys UPDATE — drop catch-all USING(true) policies
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.journeys;
DROP POLICY IF EXISTS "journeys_update_authenticated" ON public.journeys;

-- 5a. Create role-scoped UPDATE policy
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='journeys' AND policyname='journeys_update_role_scoped') THEN
    CREATE POLICY "journeys_update_role_scoped" ON public.journeys
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.id = (SELECT auth.uid()) AND u.role IN ('admin', 'super_admin')
        )
        OR (SELECT auth.uid()) = assigned_do_id
        OR EXISTS (
          SELECT 1 FROM public.journey_duty_officers jdo
          WHERE jdo.journey_id = id AND jdo.user_id = (SELECT auth.uid())
        )
      );
  END IF;
END $$;
;
