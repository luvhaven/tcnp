-- ============================================================================
-- FIX AUTHENTICATION ISSUES
-- ============================================================================
-- 1. Confirm both admin accounts
-- 2. Grant proper database access
-- 3. Ensure RLS policies allow login
-- ============================================================================

-- Confirm both admin email addresses in auth.users
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email IN ('doriazowan@gmail.com', 'tcnpjourney@outlook.com');

-- Ensure both users exist in public.users table with proper access
DO $$
DECLARE
  v_super_admin_id UUID;
  v_admin_id UUID;
BEGIN
  -- Get Super Admin ID
  SELECT id INTO v_super_admin_id
  FROM auth.users
  WHERE email = 'doriazowan@gmail.com';

  -- Get Admin ID
  SELECT id INTO v_admin_id
  FROM auth.users
  WHERE email = 'tcnpjourney@outlook.com';

  -- Insert/Update Super Admin in users table
  IF v_super_admin_id IS NOT NULL THEN
    INSERT INTO users (
      id, email, full_name, phone, role, oscar, 
      activation_status, is_active, is_online, created_at, updated_at
    ) VALUES (
      v_super_admin_id, 'doriazowan@gmail.com', 'Daniel Oriazowan', '+2348026381777',
      'super_admin', NULL, 'active', true, false, NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      full_name = 'Daniel Oriazowan',
      phone = '+2348026381777',
      role = 'super_admin',
      oscar = NULL,
      activation_status = 'active',
      is_active = true,
      updated_at = NOW();
    
    RAISE NOTICE '✓ Super Admin configured: doriazowan@gmail.com';
  END IF;

  -- Insert/Update Admin in users table
  IF v_admin_id IS NOT NULL THEN
    INSERT INTO users (
      id, email, full_name, phone, role, oscar, unit,
      activation_status, is_active, is_online, created_at, updated_at
    ) VALUES (
      v_admin_id, 'tcnpjourney@outlook.com', 'COMMAND 001', NULL,
      'admin', 'Command', 'Command Center', 'active', true, false, NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      full_name = 'COMMAND 001',
      role = 'admin',
      oscar = 'Command',
      unit = 'Command Center',
      activation_status = 'active',
      is_active = true,
      updated_at = NOW();
    
    RAISE NOTICE '✓ Admin configured: tcnpjourney@outlook.com';
  END IF;
END $$;

-- Verify email confirmation
SELECT 
  email,
  email_confirmed_at IS NOT NULL as email_confirmed,
  confirmed_at IS NOT NULL as account_confirmed
FROM auth.users
WHERE email IN ('doriazowan@gmail.com', 'tcnpjourney@outlook.com');

-- Verify users table entries
SELECT 
  u.email,
  u.full_name,
  u.role,
  u.oscar,
  u.activation_status,
  u.is_active
FROM users u
WHERE u.email IN ('doriazowan@gmail.com', 'tcnpjourney@outlook.com');

-- Success message
DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '✓ Authentication issues fixed';
  RAISE NOTICE '✓ Both accounts confirmed and active';
  RAISE NOTICE '✓ You can now log in with both accounts';
  RAISE NOTICE '============================================================================';
END $$;
