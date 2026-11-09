-- Send a refresh hint after a committed deletion. Clients read the data again
-- under their own permissions. No deleted row IDs or contents are broadcast.
CREATE POLICY dashboard_deletions_receive ON realtime.messages
FOR SELECT TO authenticated
USING (
  extension = 'broadcast'
  AND (SELECT realtime.topic()) = 'dashboard-deletions'
  AND (SELECT public.is_active_member())
);

CREATE FUNCTION public.broadcast_dashboard_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM deleted_rows) THEN
    PERFORM realtime.send(
      jsonb_build_object('table', TG_TABLE_NAME),
      'deleted',
      'dashboard-deletions',
      true
    );
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_dashboard_deletion() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'programs', 'theatres', 'papas', 'cheetahs', 'nests', 'noscar_assignments',
    'users', 'journeys', 'eagle_squares', 'equipment', 'incidents',
    'program_days', 'program_sessions', 'session_speakers',
    'operational_post_assignments', 'welcome_party_members',
    'papa_accommodations', 'hospitality_places', 'nest_room_stays',
    'fleet_partners', 'journey_cheetahs', 'vendors', 'program_menus',
    'seat_assignments', 'seat_arrangements', 'theatre_vips',
    'training_schedules', 'oscar_documents', 'unit_memberships',
    'media_assets', 'finance_documents', 'compliance_posts',
    'prayer_campaigns', 'prayer_slot_members'
  ]
  LOOP
    -- Some older installations do not have every optional module.
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
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
