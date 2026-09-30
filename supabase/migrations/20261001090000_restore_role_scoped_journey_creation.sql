-- Journey creation was disabled when the legacy authenticated INSERT policy
-- was removed. Restore creation for the same active leadership roles exposed
-- by the Journeys UI, while keeping ordinary officers read/update scoped.
DROP POLICY IF EXISTS journeys_insert_authenticated ON public.journeys;
DROP POLICY IF EXISTS journeys_insert_role_scoped ON public.journeys;

CREATE POLICY journeys_insert_role_scoped
  ON public.journeys
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_any_role(ARRAY[
      'admin', 'dev_admin', 'super_admin', 'captain', 'vice_captain',
      'head_of_operations', 'head_of_command', 'command', 'hod', 'hop'
    ]::text[])
  );
