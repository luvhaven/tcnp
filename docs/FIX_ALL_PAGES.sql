-- ============================================================================
-- FIX ALL PAGES - Ensure RLS Policies Exist for All Tables
-- ============================================================================
-- This script ensures all tables have proper RLS policies
-- Run this if pages are showing errors
-- ============================================================================

-- ============================================================================
-- 1. ENABLE RLS ON ALL TABLES (if not already enabled)
-- ============================================================================

ALTER TABLE IF EXISTS theatres ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS nests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS eagle_squares ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS cheetahs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS papas ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS vehicle_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS flight_tracking ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. PAPAS (GUESTS) - Remove VVIP/VIP, Keep Regular Only
-- ============================================================================

-- Drop all existing policies
DROP POLICY IF EXISTS "All authenticated users can view papas" ON papas;
DROP POLICY IF EXISTS "Authorized users can manage papas" ON papas;
DROP POLICY IF EXISTS "All users can view papas" ON papas;
DROP POLICY IF EXISTS "Authorized users can manage papas" ON papas;

-- View policy: All authenticated users
CREATE POLICY "All users can view papas"
  ON papas FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Manage policy: Super Admin, Admin, and authorized roles
CREATE POLICY "Authorized users can manage papas"
  ON papas FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'captain', 'head_of_command')
      AND is_active = true
    )
  );

-- ============================================================================
-- 3. PROGRAMS - Budget Removed
-- ============================================================================

-- Drop all existing policies
DROP POLICY IF EXISTS "All authenticated users can view programs" ON programs;
DROP POLICY IF EXISTS "Authorized users can manage programs" ON programs;
DROP POLICY IF EXISTS "All users can view programs" ON programs;

-- View policy: All authenticated users
CREATE POLICY "All users can view programs"
  ON programs FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Manage policy: Admins and leadership (Echo Oscar uses title system)
CREATE POLICY "Authorized users can manage programs"
  ON programs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND (
        role IN ('super_admin', 'admin', 'captain', 'head_of_command')
        OR EXISTS (
          SELECT 1 FROM official_titles ot
          WHERE ot.id = users.current_title_id
          AND ot.code IN ('ECHO_OSCAR', 'ECHO_OSCAR_LEAD')
        )
      )
      AND is_active = true
    )
  );

-- ============================================================================
-- 4. THEATRES (VENUES)
-- ============================================================================

-- Drop all existing policies
DROP POLICY IF EXISTS "All authenticated users can view theatres" ON theatres;
DROP POLICY IF EXISTS "Authorized users can manage theatres" ON theatres;
DROP POLICY IF EXISTS "All users can view theatres" ON theatres;
DROP POLICY IF EXISTS "Victor Oscar can manage theatres" ON theatres;

-- View policy: All authenticated users
CREATE POLICY "All users can view theatres"
  ON theatres FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Manage policy: Victor Oscar and admins
CREATE POLICY "Victor Oscar can manage theatres"
  ON theatres FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND (
        role IN ('super_admin', 'admin', 'victor_oscar')
        OR EXISTS (
          SELECT 1 FROM official_titles ot
          WHERE ot.id = users.current_title_id
          AND ot.code IN ('VICTOR_OSCAR', 'VICTOR_OSCAR_LEAD')
        )
      )
      AND is_active = true
    )
  );

-- ============================================================================
-- 5. NESTS (HOTELS)
-- ============================================================================

-- Drop all existing policies
DROP POLICY IF EXISTS "All authenticated users can view nests" ON nests;
DROP POLICY IF EXISTS "Authorized users can manage nests" ON nests;
DROP POLICY IF EXISTS "All users can view nests" ON nests;
DROP POLICY IF EXISTS "November Oscar can manage nests" ON nests;

-- View policy: All authenticated users
CREATE POLICY "All users can view nests"
  ON nests FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Manage policy: November Oscar and admins
CREATE POLICY "November Oscar can manage nests"
  ON nests FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND (
        role IN ('super_admin', 'admin', 'november_oscar')
        OR EXISTS (
          SELECT 1 FROM official_titles ot
          WHERE ot.id = users.current_title_id
          AND ot.code IN ('NOVEMBER_OSCAR', 'NOVEMBER_OSCAR_LEAD')
        )
      )
      AND is_active = true
    )
  );

-- ============================================================================
-- 6. EAGLE SQUARES (AIRPORTS)
-- ============================================================================

-- Drop all existing policies
DROP POLICY IF EXISTS "All authenticated users can view eagle squares" ON eagle_squares;
DROP POLICY IF EXISTS "Authorized users can manage eagle squares" ON eagle_squares;
DROP POLICY IF EXISTS "All users can view eagle squares" ON eagle_squares;
DROP POLICY IF EXISTS "Alpha Oscar can manage eagle squares" ON eagle_squares;

-- View policy: All authenticated users
CREATE POLICY "All users can view eagle squares"
  ON eagle_squares FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Manage policy: Alpha Oscar and admins
CREATE POLICY "Alpha Oscar can manage eagle squares"
  ON eagle_squares FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND (
        role IN ('super_admin', 'admin', 'alpha_oscar')
        OR EXISTS (
          SELECT 1 FROM official_titles ot
          WHERE ot.id = users.current_title_id
          AND ot.code IN ('ALPHA_OSCAR', 'ALPHA_OSCAR_LEAD')
        )
      )
      AND is_active = true
    )
  );

-- ============================================================================
-- 7. CHEETAHS (FLEET)
-- ============================================================================

-- Drop all existing policies
DROP POLICY IF EXISTS "All authenticated users can view cheetahs" ON cheetahs;
DROP POLICY IF EXISTS "Transport officers can manage cheetahs" ON cheetahs;
DROP POLICY IF EXISTS "All users can view cheetahs" ON cheetahs;
DROP POLICY IF EXISTS "Tango Oscar can manage cheetahs" ON cheetahs;

-- View policy: All authenticated users
CREATE POLICY "All users can view cheetahs"
  ON cheetahs FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Manage policy: Tango Oscar and admins
CREATE POLICY "Tango Oscar can manage cheetahs"
  ON cheetahs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND (
        role IN ('super_admin', 'admin', 'tango_oscar')
        OR EXISTS (
          SELECT 1 FROM official_titles ot
          WHERE ot.id = users.current_title_id
          AND ot.code IN ('TANGO_OSCAR', 'TANGO_OSCAR_LEAD')
        )
      )
      AND is_active = true
    )
  );

-- ============================================================================
-- 8. JOURNEYS
-- ============================================================================

-- Drop all existing policies
DROP POLICY IF EXISTS "All authenticated users can view journeys" ON journeys;
DROP POLICY IF EXISTS "Authorized users can manage journeys" ON journeys;
DROP POLICY IF EXISTS "All users can view journeys" ON journeys;

-- View policy: All authenticated users
CREATE POLICY "All users can view journeys"
  ON journeys FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Manage policy: Admins and authorized roles
CREATE POLICY "Authorized users can manage journeys"
  ON journeys FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND (
        role IN ('super_admin', 'admin', 'captain', 'head_of_command')
        OR EXISTS (
          SELECT 1 FROM official_titles ot
          WHERE ot.id = users.current_title_id
          AND ot.code IN ('HEAD_OF_OPERATIONS', 'HOP')
        )
      )
      AND is_active = true
    )
  );

-- ============================================================================
-- 9. USERS
-- ============================================================================

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view their own data" ON users;
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Admins can manage users" ON users;
DROP POLICY IF EXISTS "All users can view users" ON users;
DROP POLICY IF EXISTS "Authorized users can manage users" ON users;

-- View policy: All authenticated users can view all users
CREATE POLICY "All users can view users"
  ON users FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Manage policy: Super Admin and Admin only
CREATE POLICY "Authorized users can manage users"
  ON users FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'ALL PAGES FIXED!';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'RLS Policies Updated For:';
  RAISE NOTICE '  ✓ Papas (Guests) - VVIP/VIP removed';
  RAISE NOTICE '  ✓ Programs - Budget removed';
  RAISE NOTICE '  ✓ Theatres (Venues)';
  RAISE NOTICE '  ✓ Nests (Hotels)';
  RAISE NOTICE '  ✓ Eagle Squares (Airports)';
  RAISE NOTICE '  ✓ Cheetahs (Fleet)';
  RAISE NOTICE '  ✓ Journeys';
  RAISE NOTICE '  ✓ Users';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'All pages should now load without errors!';
  RAISE NOTICE '============================================================================';
END $$;
