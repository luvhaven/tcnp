-- ============================================================================
-- RENAME SUPER_ADMIN TO DEV_ADMIN - STEP 1
-- ============================================================================
-- Step 1: Add dev_admin role to the enum
-- ============================================================================

-- Note: This must be run and COMMITTED before Step 2

DO $$ BEGIN
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'dev_admin';
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'dev_admin role already exists, skipping...';
END $$;

DO $$
BEGIN
  RAISE NOTICE 'Step 1 Complete: dev_admin role added.';
  RAISE NOTICE 'Now please run RENAME_SUPER_ADMIN_STEP_2.sql';
END $$;
