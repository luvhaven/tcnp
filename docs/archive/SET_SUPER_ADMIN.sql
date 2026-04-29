-- ============================================================================
-- SET SUPER ADMIN ACCOUNT
-- ============================================================================
-- This script sets doriazowan@gmail.com as Super Admin with full privileges
-- ============================================================================

-- Update the user to Super Admin role with full details
UPDATE users 
SET 
  role = 'super_admin',
  full_name = 'Daniel Oriazowan',
  phone = '+2348026381777',
  oscar = 'OSCAR-ALPHA',
  activation_status = 'active',
  is_active = true,
  is_online = false
WHERE email = 'doriazowan@gmail.com';

-- Verify the update
SELECT 
  id,
  email,
  full_name,
  role,
  phone,
  oscar,
  is_active,
  activation_status,
  created_at
FROM users 
WHERE email = 'doriazowan@gmail.com';

-- Show success message
DO $$
DECLARE
  v_user_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM users WHERE email = 'doriazowan@gmail.com'
  ) INTO v_user_exists;
  
  IF v_user_exists THEN
    RAISE NOTICE '============================================================================';
    RAISE NOTICE 'SUCCESS: doriazowan@gmail.com is now Super Admin!';
    RAISE NOTICE '============================================================================';
    RAISE NOTICE 'Account Details:';
    RAISE NOTICE '  - Name: Daniel Oriazowan';
    RAISE NOTICE '  - Email: doriazowan@gmail.com';
    RAISE NOTICE '  - Phone: +2348026381777';
    RAISE NOTICE '  - OSCAR: OSCAR-ALPHA';
    RAISE NOTICE '  - Role: super_admin';
    RAISE NOTICE '  - Status: Active';
    RAISE NOTICE '============================================================================';
    RAISE NOTICE 'Super Admin Privileges:';
    RAISE NOTICE '  ✓ Full system access';
    RAISE NOTICE '  ✓ Manage all users';
    RAISE NOTICE '  ✓ Create/edit/delete all entities';
    RAISE NOTICE '  ✓ View audit logs';
    RAISE NOTICE '  ✓ Manage system settings';
    RAISE NOTICE '  ✓ Assign roles to other users';
    RAISE NOTICE '  ✓ Activate/deactivate accounts';
    RAISE NOTICE '  ✓ Cannot be deleted or deactivated by others';
    RAISE NOTICE '============================================================================';
  ELSE
    RAISE NOTICE '============================================================================';
    RAISE NOTICE 'WARNING: User doriazowan@gmail.com does not exist yet!';
    RAISE NOTICE '============================================================================';
    RAISE NOTICE 'Please complete these steps:';
    RAISE NOTICE '  1. Go to http://localhost:3001/login';
    RAISE NOTICE '  2. Click "Sign Up"';
    RAISE NOTICE '  3. Create account with email: doriazowan@gmail.com';
    RAISE NOTICE '  4. After signup, run this script again';
    RAISE NOTICE '============================================================================';
  END IF;
END $$;
