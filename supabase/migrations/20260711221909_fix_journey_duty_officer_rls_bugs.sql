-- Bug 1: journey_duty_officers has no UPDATE policy at all, so a Delta Oscar
-- accepting/rejecting their own assignment (MissionNotificationHandler's
-- Accept/Reject buttons, My Operations' "Acknowledge Assignment" button) is
-- silently denied by RLS -- the app renders the buttons but every click fails.
CREATE POLICY "DOs can update own assignment status" ON public.journey_duty_officers
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can update DO assignments" ON public.journey_duty_officers
  FOR UPDATE
  USING (has_any_role(ARRAY['super_admin','dev_admin','admin','captain','head_of_command','head_of_operations','command']::text[]))
  WITH CHECK (has_any_role(ARRAY['super_admin','dev_admin','admin','captain','head_of_command','head_of_operations','command']::text[]));

-- Bug 2: journeys_select_assigned_do and journeys_update_role_scoped both
-- compare jdo.journey_id to jdo.id (the SAME row's own two columns) instead
-- of correlating to the outer journeys.id -- this can never be true, so
-- these policies never actually granted secondary (non-lead) DO team
-- members the access they were clearly meant to have. Reads were masked by
-- the separately-existing journeys_select_authenticated policy (open to any
-- authenticated user), but writes had no such fallback: only the mirrored
-- "lead" (assigned_do_id) or an admin could ever start a journey or update
-- its call-sign -- every non-lead officer on a journey's DO team was a
-- read-only spectator despite the UI inviting them to act.
DROP POLICY IF EXISTS "journeys_select_assigned_do" ON public.journeys;
CREATE POLICY "journeys_select_assigned_do" ON public.journeys
  FOR SELECT
  USING (
    (auth.uid() = assigned_do_id)
    OR EXISTS (
      SELECT 1 FROM journey_duty_officers jdo
      WHERE jdo.journey_id = journeys.id AND jdo.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "journeys_update_role_scoped" ON public.journeys;
CREATE POLICY "journeys_update_role_scoped" ON public.journeys
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role]))
    OR auth.uid() = assigned_do_id
    OR EXISTS (
      SELECT 1 FROM journey_duty_officers jdo
      WHERE jdo.journey_id = journeys.id AND jdo.user_id = auth.uid()
    )
  );
;
