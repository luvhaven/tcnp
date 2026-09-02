-- Allow assigned DOs (both via junction table and legacy assigned_do_id) to insert journey events
CREATE POLICY "DOs can insert events for their assigned journeys"
ON journey_events FOR INSERT
TO authenticated
WITH CHECK (
  -- Assigned via legacy field
  EXISTS (
    SELECT 1 FROM journeys j
    WHERE j.id = journey_events.journey_id
      AND (j.assigned_do_id = auth.uid() OR j.assigned_duty_officer_id = auth.uid())
  )
  OR
  -- Assigned via junction table
  EXISTS (
    SELECT 1 FROM journey_duty_officers jdo
    WHERE jdo.journey_id = journey_events.journey_id
      AND jdo.user_id = auth.uid()
  )
  OR
  -- Admins can always insert
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'dev_admin', 'admin', 'captain', 'head_of_command', 'head_of_operations', 'command')
  )
);;
