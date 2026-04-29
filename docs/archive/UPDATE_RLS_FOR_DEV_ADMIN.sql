-- Update RLS policies to include 'dev_admin' role

-- Users Table Policies
DROP POLICY IF EXISTS "Admins can view all users" ON users;
CREATE POLICY "Admins can view all users" ON users
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role IN ('super_admin', 'dev_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "Admins can update users" ON users;
CREATE POLICY "Admins can update users" ON users
  FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role IN ('super_admin', 'dev_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "Admins can insert users" ON users;
CREATE POLICY "Admins can insert users" ON users
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM users WHERE role IN ('super_admin', 'dev_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "Admins can delete users" ON users;
CREATE POLICY "Admins can delete users" ON users
  FOR DELETE
  USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role IN ('super_admin', 'dev_admin', 'admin')
    )
  );

-- Ensure users can view their own profile (should already exist, but recreating to be safe)
DROP POLICY IF EXISTS "Users can view their own profile" ON users;
CREATE POLICY "Users can view their own profile" ON users
  FOR SELECT
  USING (auth.uid() = id);

-- Journeys Table Policies (Critical for Admin access)
DROP POLICY IF EXISTS "All authenticated users can view journeys" ON journeys;
CREATE POLICY "All authenticated users can view journeys" ON journeys
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authorized users can create journeys" ON journeys;
CREATE POLICY "Authorized users can create journeys" ON journeys
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM users WHERE role IN ('super_admin', 'dev_admin', 'admin', 'captain', 'head_of_command', 'head_of_operations')
    )
  );

DROP POLICY IF EXISTS "Admins can delete journeys" ON journeys;
CREATE POLICY "Admins can delete journeys" ON journeys
  FOR DELETE
  USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role IN ('super_admin', 'dev_admin', 'admin')
    )
  );
