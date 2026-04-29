-- ============================================================================
-- RENAME SUPER_ADMIN TO DEV_ADMIN - STEP 2
-- ============================================================================
-- Step 2: Update existing users and cleanup
-- ============================================================================

-- Update all users with super_admin role to dev_admin
UPDATE users
SET role = 'dev_admin'
WHERE role = 'super_admin';

-- Completion message
DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Super Admin renamed to Dev Admin successfully!';
  RAISE NOTICE 'All existing super_admin users have been updated to dev_admin.';
  RAISE NOTICE 'IMPORTANT: Please update your RLS policies and application code!';
  RAISE NOTICE '============================================================================';
END $$;
