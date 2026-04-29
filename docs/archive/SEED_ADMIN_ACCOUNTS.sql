-- ============================================================================
-- SEED ADMIN ACCOUNTS FOR TCNP JOURNEY MANAGEMENT
-- ============================================================================
-- Creates Super Admin (Daniel Oriazowan) and Admin (COMMAND 001) accounts
-- NOTE: Users must first sign up via Supabase Auth, then this script updates their roles
-- ============================================================================

-- ============================================================================
-- INSTRUCTIONS:
-- ============================================================================
-- 1. First, manually create these accounts via Supabase Auth Dashboard:
--    a. Go to Authentication > Users > Add User
--    b. Create user: doriazowan@gmail.com with password: &DannyDev1&
--    c. Create user: tcnpjourney@outlook.com with password: $Command001
-- 2. Then run this script to set their roles and details
-- ============================================================================

-- Update Super Admin account
DO $$
DECLARE
  v_super_admin_id UUID;
BEGIN
  -- Get the user ID from auth.users
  SELECT id INTO v_super_admin_id
  FROM auth.users
  WHERE email = 'doriazowan@gmail.com';

  IF v_super_admin_id IS NOT NULL THEN
    -- Insert or update in users table
    INSERT INTO users (
      id,
      email,
      full_name,
      phone,
      role,
      oscar,
      activation_status,
      is_active,
      is_online,
      created_at,
      updated_at
    ) VALUES (
      v_super_admin_id,
      'doriazowan@gmail.com',
      'Daniel Oriazowan',
      '+2348026381777',
      'super_admin',
      NULL, -- Super Admin cannot be assigned OSCAR
      'active',
      true,
      false,
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      full_name = 'Daniel Oriazowan',
      phone = '+2348026381777',
      role = 'super_admin',
      oscar = NULL,
      activation_status = 'active',
      is_active = true,
      updated_at = NOW();

    RAISE NOTICE '✓ Super Admin account configured: doriazowan@gmail.com';
  ELSE
    RAISE NOTICE '⚠ Super Admin user not found in auth.users. Please create via Supabase Auth Dashboard first.';
  END IF;
END $$;

-- Update Admin (COMMAND 001) account
DO $$
DECLARE
  v_admin_id UUID;
  v_command_title_id UUID;
BEGIN
  -- Get the user ID from auth.users
  SELECT id INTO v_admin_id
  FROM auth.users
  WHERE email = 'tcnpjourney@outlook.com';

  IF v_admin_id IS NOT NULL THEN
    -- Insert or update in users table
    INSERT INTO users (
      id,
      email,
      full_name,
      phone,
      role,
      oscar,
      unit,
      activation_status,
      is_active,
      is_online,
      created_at,
      updated_at
    ) VALUES (
      v_admin_id,
      'tcnpjourney@outlook.com',
      'COMMAND 001',
      NULL,
      'admin',
      'Command', -- Permanent OSCAR
      'Command Center',
      'active',
      true,
      false,
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      full_name = 'COMMAND 001',
      role = 'admin',
      oscar = 'Command',
      unit = 'Command Center',
      activation_status = 'active',
      is_active = true,
      updated_at = NOW();

    -- Create a fixed title for COMMAND if it doesn't exist
    INSERT INTO official_titles (
      code,
      name,
      unit,
      is_fixed,
      is_team_lead,
      max_positions,
      description
    ) VALUES (
      'COMMAND',
      'Command Center Lead',
      'Command Center',
      true, -- Fixed, cannot be reassigned
      true,
      1,
      'Permanent Command Center leadership position'
    )
    ON CONFLICT (code) DO NOTHING;

    -- Get the title ID
    SELECT id INTO v_command_title_id
    FROM official_titles
    WHERE code = 'COMMAND';

    -- Assign the title permanently
    INSERT INTO title_assignments (
      user_id,
      title_id,
      program_id,
      assigned_by,
      assigned_at,
      is_active,
      notes
    ) VALUES (
      v_admin_id,
      v_command_title_id,
      NULL, -- Global assignment, not program-specific
      v_admin_id, -- Self-assigned
      NOW(),
      true,
      'Permanent Command Center assignment - not reassignable'
    )
    ON CONFLICT (user_id, title_id, program_id) DO UPDATE SET
      is_active = true,
      notes = 'Permanent Command Center assignment - not reassignable';

    -- Update user's current title
    UPDATE users
    SET current_title_id = v_command_title_id
    WHERE id = v_admin_id;

    RAISE NOTICE '✓ Admin account configured: tcnpjourney@outlook.com (COMMAND 001)';
  ELSE
    RAISE NOTICE '⚠ Admin user not found in auth.users. Please create via Supabase Auth Dashboard first.';
  END IF;
END $$;

-- Verify accounts
DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'ADMIN ACCOUNTS SETUP COMPLETE';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Super Admin Account:';
  RAISE NOTICE '  Email: doriazowan@gmail.com';
  RAISE NOTICE '  Password: &DannyDev1&';
  RAISE NOTICE '  Full Name: Daniel Oriazowan';
  RAISE NOTICE '  Role: super_admin';
  RAISE NOTICE '  OSCAR: (Cannot be assigned)';
  RAISE NOTICE '';
  RAISE NOTICE 'Admin Account:';
  RAISE NOTICE '  Email: tcnpjourney@outlook.com';
  RAISE NOTICE '  Password: $Command001';
  RAISE NOTICE '  Full Name: COMMAND 001';
  RAISE NOTICE '  Role: admin';
  RAISE NOTICE '  OSCAR: Command (Permanent, not reassignable)';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;

-- Display configured accounts
SELECT 
  u.id,
  u.email,
  u.full_name,
  u.role,
  u.oscar,
  u.unit,
  u.activation_status,
  u.is_active,
  ot.name as current_title
FROM users u
LEFT JOIN official_titles ot ON u.current_title_id = ot.id
WHERE u.email IN ('doriazowan@gmail.com', 'tcnpjourney@outlook.com')
ORDER BY u.role DESC;
