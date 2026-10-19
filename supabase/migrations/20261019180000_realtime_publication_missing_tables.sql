-- Tables the app subscribes to with postgres_changes but that were never added to the
-- realtime publication, so those live updates silently never arrived:
--   driver_feedback          → Tango driver-feedback list (components/tango/TangoOperations.tsx)
--   nest_room_*              → Nest room operations (components/nests/RoomOperations.tsx)
-- Realtime applies each table's RLS SELECT policy to every event.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['driver_feedback', 'nest_room_stays', 'nest_room_inspections', 'nest_room_items', 'nest_room_issues']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
