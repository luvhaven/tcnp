DROP POLICY IF EXISTS "Admins can manage noscar assignments" ON noscar_assignments;

CREATE POLICY "Admins can manage noscar assignments"
  ON noscar_assignments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = ANY (ARRAY[
          'super_admin'::user_role, 'admin'::user_role, 'captain'::user_role, 'head_of_command'::user_role,
          'november_oscar'::user_role, 'noscar_den'::user_role, 'head_noscar_den'::user_role,
          'noscar_nest'::user_role, 'head_noscar_nest'::user_role, 'head_of_operations'::user_role
        ])
        AND users.is_active = true
    )
  );;
