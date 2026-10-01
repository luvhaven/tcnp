-- Migration: Add explicit DELETE policy for journeys table
DROP POLICY IF EXISTS "journeys_delete_role_scoped" ON public.journeys;
CREATE POLICY "journeys_delete_role_scoped" ON public.journeys FOR DELETE
  TO authenticated
  USING (
    is_admin()
    OR has_any_role(ARRAY[
      'super_admin'::text, 'dev_admin'::text, 'admin'::text,
      'captain'::text, 'vice_captain'::text,
      'head_of_command'::text, 'head_of_operations'::text,
      'command'::text, 'hod'::text, 'hop'::text
    ])
  );
