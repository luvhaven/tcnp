-- ============================================================================
-- ELEVATE COMMAND OSCARS TO ADMIN PRIVILEGES
-- ============================================================================
-- This script updates the is_admin() function to include 'command' and 
-- 'head_of_command' roles, granting them full system access.
-- ============================================================================

-- Update is_admin function to include command roles
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role IN (
      'super_admin', 
      'admin', 
      'captain', 
      'head_of_operations',
      'head_of_command',  -- Added
      'command'           -- Added
    )
    AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Log the change
DO $$
BEGIN
  RAISE NOTICE '✓ Updated is_admin() function to include Command Oscars';
  RAISE NOTICE '  Now includes: super_admin, admin, captain, head_of_operations, head_of_command, command';
END $$;
