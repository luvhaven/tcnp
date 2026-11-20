-- Follow-ups after the 2026-11-16 unit build-out review.
--
-- 1. Drop public.update_journey_call_sign(uuid, text).
--    It was broken for everyone: it assigned the text argument to the
--    journeys.current_call_sign enum column without a cast, so every call that
--    passed the auth check failed with 42804. Its auth check was also NULL (so
--    it did not raise) on a journey with no assigned DO, letting any caller
--    reach the SECURITY DEFINER UPDATE once the cast was fixed. Nothing in the
--    app calls it any more: Journeys, Ops Monitor and My Operations update
--    journeys.status directly under RLS. Dropping it closes the hole for good.
--
-- 2. Dashboard deletion broadcasts for the Alpha arrival timelines
--    (hooks/useDashboardDeletions.ts maps these tables to the Alpha board and
--    timeline queries). Same statement trigger as
--    20261109130000_live_dashboard_deletions.sql.
--
-- No BEGIN/COMMIT. Idempotent.

DROP FUNCTION IF EXISTS public.update_journey_call_sign(uuid, text);

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['alpha_arrival_timelines', 'alpha_arrival_timeline_items']
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS broadcast_dashboard_deletion ON public.%I', table_name);
      EXECUTE format(
        'CREATE TRIGGER broadcast_dashboard_deletion
         AFTER DELETE ON public.%I
         REFERENCING OLD TABLE AS deleted_rows
         FOR EACH STATEMENT EXECUTE FUNCTION public.broadcast_dashboard_deletion()',
        table_name
      );
    END IF;
  END LOOP;
END;
$$;
