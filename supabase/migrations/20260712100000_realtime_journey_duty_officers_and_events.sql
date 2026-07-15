-- Ensure the Ops Monitor realtime relay is complete.
--
-- The Operations Monitor subscribes to postgres_changes on journeys,
-- journey_events, and journey_duty_officers. journeys + journey_events were
-- already in the supabase_realtime publication, but journey_duty_officers was
-- NOT — so DO-team assignment/acknowledgement changes never reached the monitor
-- in real time (they only appeared on the 60s fallback poll).
--
-- journey_events is what carries live SITREP broadcasts (Blue/Red Cocktail,
-- Re-order, Broken Arrow): these do not change journeys.status, so without the
-- monitor listening to journey_events INSERTs they were invisible.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'journey_duty_officers'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.journey_duty_officers';
  END IF;
END $$;
