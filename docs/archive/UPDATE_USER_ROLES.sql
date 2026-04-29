-- ============================================================================
-- UPDATE USER ROLES
-- ============================================================================
-- Add new roles for Protocol Officers and NOscar management
-- ============================================================================

-- Add new role values to the user_role enum
DO $$ BEGIN
  -- Head roles
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'head_alpha_oscar';
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'head_victor_oscar';
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'head_echo_oscar';
  
  -- NOscar roles (replacing November Oscar)
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'noscar_den';
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'head_noscar_den';
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'noscar_nest';
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'head_noscar_nest';
  
  -- Echo Oscar
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'echo_oscar';
  
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'Role values already exist, skipping...';
END $$;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'User roles updated successfully!';
  RAISE NOTICE 'New roles added:';
  RAISE NOTICE '  - head_alpha_oscar';
  RAISE NOTICE '  - head_victor_oscar';
  RAISE NOTICE '  - head_echo_oscar';
  RAISE NOTICE '  - noscar_den, head_noscar_den';
  RAISE NOTICE '  - noscar_nest, head_noscar_nest';
  RAISE NOTICE '  - echo_oscar';
  RAISE NOTICE '============================================================================';
END $$;
