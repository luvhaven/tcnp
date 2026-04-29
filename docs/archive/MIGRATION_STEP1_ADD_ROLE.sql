-- ============================================================================
-- STEP 1: ADD HEAD OF OPERATIONS ROLE
-- ============================================================================
-- This must be run FIRST and separately due to PostgreSQL enum constraints
-- ============================================================================

-- Add new role to user_role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'head_of_operations';

-- ============================================================================
-- MIGRATION STEP 1 COMPLETE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'STEP 1 COMPLETE: Head of Operations role added';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Next: Run MIGRATION_STEP2_FIXES_AND_TRACKING.sql';
  RAISE NOTICE '============================================================================';
END $$;
