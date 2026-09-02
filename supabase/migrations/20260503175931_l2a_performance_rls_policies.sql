
-- ============================================================
-- L2A — PERFORMANCE: RLS INITPLAN FIXES
-- ============================================================

-- JOURNEYS
DROP POLICY IF EXISTS "All authenticated users can view journeys" ON public.journeys;
DROP POLICY IF EXISTS "Authenticated users can view all journeys" ON public.journeys;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='journeys' AND policyname='journeys_select_authenticated') THEN
    CREATE POLICY "journeys_select_authenticated" ON public.journeys
      FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);
  END IF;
END $$;

DROP POLICY IF EXISTS "Delta Oscars can view their assigned journeys" ON public.journeys;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='journeys' AND policyname='journeys_select_assigned_do') THEN
    CREATE POLICY "journeys_select_assigned_do" ON public.journeys
      FOR SELECT USING (
        (SELECT auth.uid()) = assigned_do_id
        OR EXISTS (
          SELECT 1 FROM public.journey_duty_officers jdo
          WHERE jdo.journey_id = id AND jdo.user_id = (SELECT auth.uid())
        )
      );
  END IF;
END $$;

-- NOTIFICATIONS
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='notifications_select_own_v2') THEN
    CREATE POLICY "notifications_select_own_v2" ON public.notifications
      FOR SELECT USING (user_id = (SELECT auth.uid()));
  END IF;
END $$;

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='notifications_update_own_v2') THEN
    CREATE POLICY "notifications_update_own_v2" ON public.notifications
      FOR UPDATE USING (user_id = (SELECT auth.uid()));
  END IF;
END $$;

-- USER_LOCATIONS (21k rows — highest per-row auth risk)
DROP POLICY IF EXISTS "Users can view their own location" ON public.user_locations;
DROP POLICY IF EXISTS "Users can insert their own location" ON public.user_locations;
DROP POLICY IF EXISTS "Users can update their own location" ON public.user_locations;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_locations' AND policyname='user_locations_select_own') THEN
    CREATE POLICY "user_locations_select_own" ON public.user_locations
      FOR SELECT USING (user_id = (SELECT auth.uid()));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_locations' AND policyname='user_locations_insert_own') THEN
    CREATE POLICY "user_locations_insert_own" ON public.user_locations
      FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_locations' AND policyname='user_locations_update_own') THEN
    CREATE POLICY "user_locations_update_own" ON public.user_locations
      FOR UPDATE USING (user_id = (SELECT auth.uid()));
  END IF;
END $$;

-- AUDIT_LOGS (143k rows)
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='audit_logs' AND policyname='audit_logs_admin_select') THEN
    CREATE POLICY "audit_logs_admin_select" ON public.audit_logs
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.id = (SELECT auth.uid()) AND u.role IN ('admin', 'super_admin')
        )
      );
  END IF;
END $$;

-- CHEETAHS — consolidate 6 SELECT policies into 1
DROP POLICY IF EXISTS "Admins have full access to cheetahs" ON public.cheetahs;
DROP POLICY IF EXISTS "Tango Oscars have full access to cheetahs" ON public.cheetahs;
DROP POLICY IF EXISTS "cheetahs_manage" ON public.cheetahs;
DROP POLICY IF EXISTS "cheetahs_select_all" ON public.cheetahs;
DROP POLICY IF EXISTS "cheetahs_view" ON public.cheetahs;
DROP POLICY IF EXISTS "Authenticated users can view cheetahs" ON public.cheetahs;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cheetahs' AND policyname='cheetahs_select_authenticated') THEN
    CREATE POLICY "cheetahs_select_authenticated" ON public.cheetahs
      FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);
  END IF;
END $$;
;
