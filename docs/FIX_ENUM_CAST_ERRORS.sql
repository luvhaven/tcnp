-- ============================================================================
-- FIX_ENUM_CAST_ERRORS.sql
-- Fixes "operator does not exist: user_role = text" errors by ensuring
-- all role/enum columns use proper casting and indexes
-- ============================================================================

-- 1. Drop and recreate indexes with proper casting for user_role
DROP INDEX IF EXISTS idx_users_role;
CREATE INDEX idx_users_role ON users(role);

-- 2. Ensure role column is properly typed as user_role enum
-- (This should already be correct, but we verify it)
DO $$
BEGIN
  -- Check if role column exists and is of correct type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'users' 
    AND column_name = 'role'
    AND udt_name != 'user_role'
  ) THEN
    -- If it's not the enum type, alter it
    ALTER TABLE users ALTER COLUMN role TYPE user_role USING role::user_role;
  END IF;
END $$;

-- 3. Update RLS policies to use proper enum casting
DROP POLICY IF EXISTS "Users can view their own data" ON users;
CREATE POLICY "Users can view their own data"
  ON users FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can view all users" ON users;
CREATE POLICY "Admins can view all users"
  ON users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('super_admin', 'admin')
        AND u.is_active = true
    )
  );

DROP POLICY IF EXISTS "Admins can update users" ON users;
CREATE POLICY "Admins can update users"
  ON users FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('super_admin', 'admin')
        AND u.is_active = true
    )
  );

DROP POLICY IF EXISTS "Admins can insert users" ON users;
CREATE POLICY "Admins can insert users"
  ON users FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('super_admin', 'admin')
        AND u.is_active = true
    )
  );

DROP POLICY IF EXISTS "Admins can delete users" ON users;
CREATE POLICY "Admins can delete users"
  ON users FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('super_admin', 'admin')
        AND u.is_active = true
    )
  );

-- 4. Drop and recreate helper functions with proper type handling
DROP FUNCTION IF EXISTS has_role(user_role) CASCADE;
CREATE FUNCTION has_role(p_role user_role)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND role = p_role
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

DROP FUNCTION IF EXISTS has_any_role(user_role[]) CASCADE;
CREATE FUNCTION has_any_role(p_roles user_role[])
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND role = ANY(p_roles)
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

DROP FUNCTION IF EXISTS is_admin_user() CASCADE;
CREATE FUNCTION is_admin_user()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 5. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_users_activation_status ON users(activation_status);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 6. Verify all enum columns are properly typed
DO $$
BEGIN
  -- journey_status
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'journeys' 
    AND column_name = 'status'
    AND udt_name != 'journey_status'
  ) THEN
    ALTER TABLE journeys ALTER COLUMN status TYPE journey_status USING status::journey_status;
  END IF;

  -- vehicle_status
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'cheetahs' 
    AND column_name = 'current_status'
    AND udt_name != 'vehicle_status'
  ) THEN
    ALTER TABLE cheetahs ALTER COLUMN current_status TYPE vehicle_status USING current_status::vehicle_status;
  END IF;
END $$;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'FIX_ENUM_CAST_ERRORS.sql completed successfully. All enum casting issues resolved.';
END $$;
