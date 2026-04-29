-- ============================================================================
-- FIX RLS POLICIES AND DATABASE GRANTS FOR LOGIN
-- ============================================================================
-- This script fixes "Database error granting user" by ensuring:
-- 1. RLS policies allow users to read their own records
-- 2. Proper grants are set on tables
-- 3. Auth triggers work correctly
-- ============================================================================

-- Ensure users table has proper RLS policies for login
DROP POLICY IF EXISTS "Users can view own record" ON users;
DROP POLICY IF EXISTS "Users can update own record" ON users;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON users;
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Admins can manage all users" ON users;

-- Allow users to read their own record (required for login)
CREATE POLICY "Users can view own record"
ON users FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Allow users to update their own record
CREATE POLICY "Users can update own record"
ON users FOR UPDATE
TO authenticated
USING (auth.uid() = id);

-- Allow admins to view all users
CREATE POLICY "Admins can view all users"
ON users FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'admin')
  )
);

-- Allow admins to manage all users
CREATE POLICY "Admins can manage all users"
ON users FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'admin')
  )
);

-- Ensure audit_logs table allows inserts from triggers
DROP POLICY IF EXISTS "Allow system inserts to audit_logs" ON audit_logs;

CREATE POLICY "Allow system inserts to audit_logs"
ON audit_logs FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow users to view audit logs based on role
DROP POLICY IF EXISTS "Users can view audit logs" ON audit_logs;

CREATE POLICY "Users can view audit logs"
ON audit_logs FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'admin', 'captain', 'head_of_operations')
  )
);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;

GRANT SELECT, INSERT, UPDATE ON users TO authenticated;
GRANT SELECT ON users TO anon;

GRANT INSERT ON audit_logs TO authenticated;
GRANT SELECT ON audit_logs TO authenticated;

-- Ensure sequences are accessible
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Create or replace a function to handle post-login user updates
CREATE OR REPLACE FUNCTION handle_user_login()
RETURNS TRIGGER AS $$
BEGIN
  -- Update last_login and is_online status
  UPDATE users
  SET 
    last_login = NOW(),
    is_online = true,
    updated_at = NOW()
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'on_auth_user_login'
  ) THEN
    EXECUTE 'DROP TRIGGER on_auth_user_login ON auth.users';
  END IF;
END $$;

-- Create trigger for login tracking (optional, won't block login)
-- Note: This trigger is informational only and shouldn't block authentication
CREATE TRIGGER on_auth_user_login
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.last_sign_in_at IS DISTINCT FROM NEW.last_sign_in_at)
  EXECUTE FUNCTION handle_user_login();

-- Verify both admin accounts exist and are properly configured
DO $$
DECLARE
  v_super_admin_count INTEGER;
  v_admin_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_super_admin_count
  FROM users
  WHERE email = 'doriazowan@gmail.com'
    AND role = 'super_admin'
    AND is_active = true;

  SELECT COUNT(*) INTO v_admin_count
  FROM users
  WHERE email = 'tcnpjourney@outlook.com'
    AND role = 'admin'
    AND is_active = true;

  IF v_super_admin_count = 0 THEN
    RAISE WARNING 'Super Admin account not found or not active';
  ELSE
    RAISE NOTICE '✓ Super Admin account verified';
  END IF;

  IF v_admin_count = 0 THEN
    RAISE WARNING 'Admin account not found or not active';
  ELSE
    RAISE NOTICE '✓ Admin account verified';
  END IF;
END $$;

-- Verify auth users are confirmed
DO $$
DECLARE
  v_super_admin_confirmed BOOLEAN;
  v_admin_confirmed BOOLEAN;
BEGIN
  SELECT (email_confirmed_at IS NOT NULL) INTO v_super_admin_confirmed
  FROM auth.users
  WHERE email = 'doriazowan@gmail.com';

  SELECT (email_confirmed_at IS NOT NULL) INTO v_admin_confirmed
  FROM auth.users
  WHERE email = 'tcnpjourney@outlook.com';

  IF NOT v_super_admin_confirmed THEN
    RAISE WARNING 'Super Admin email not confirmed in auth.users';
  ELSE
    RAISE NOTICE '✓ Super Admin email confirmed';
  END IF;

  IF NOT v_admin_confirmed THEN
    RAISE WARNING 'Admin email not confirmed in auth.users';
  ELSE
    RAISE NOTICE '✓ Admin email confirmed';
  END IF;
END $$;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '✓ RLS policies and grants configured';
  RAISE NOTICE '✓ Login should now work correctly';
  RAISE NOTICE '============================================================================';
END $$;
