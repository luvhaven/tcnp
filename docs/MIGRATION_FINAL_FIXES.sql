-- ============================================================================
-- FINAL FIXES MIGRATION
-- ============================================================================
-- This migration adds:
-- 1. RLS for DOs to access only their assigned Papas
-- 2. Delete functionality for flight tracking (admins only)
-- ============================================================================

-- ============================================================================
-- 1. UPDATE PAPAS RLS FOR DO ACCESS
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "papas_select_policy" ON papas;
DROP POLICY IF EXISTS "papas_modify_policy" ON papas;
DROP POLICY IF EXISTS "Users can view papas" ON papas;
DROP POLICY IF EXISTS "Authorized users can manage papas" ON papas;

-- Create comprehensive select policy for Papas
CREATE POLICY "papas_select_policy" ON papas
  FOR SELECT USING (
    -- Admins and management can view all
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN (
        'super_admin',
        'admin',
        'captain',
        'vice_captain',
        'head_of_operations',
        'head_of_command',
        'command',
        'echo_oscar',
        'head_echo_oscar'
      )
      AND is_active = true
    )
    OR
    -- DOs can view Papas from their assigned journeys
    EXISTS (
      SELECT 1 FROM journeys j
      INNER JOIN users u ON u.id = auth.uid()
      WHERE j.papa_id = papas.id
      AND j.assigned_duty_officer_id = auth.uid()
      AND u.is_active = true
    )
  );

-- Create modify policy for Papas
CREATE POLICY "papas_modify_policy" ON papas
  FOR ALL USING (
    -- Only admins and authorized roles can modify
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN (
        'super_admin',
        'admin',
        'captain',
        'head_of_operations',
        'echo_oscar',
        'head_echo_oscar'
      )
      AND is_active = true
    )
  );

-- ============================================================================
-- 2. ADD DELETE FUNCTIONALITY FOR FLIGHT TRACKING
-- ============================================================================

-- Drop existing policies on flight_tracking
DROP POLICY IF EXISTS "flight_tracking_select_policy" ON flight_tracking;
DROP POLICY IF EXISTS "flight_tracking_insert_policy" ON flight_tracking;
DROP POLICY IF EXISTS "flight_tracking_update_policy" ON flight_tracking;
DROP POLICY IF EXISTS "flight_tracking_delete_policy" ON flight_tracking;

-- Create comprehensive policies for flight_tracking

-- Select policy - all active users can view
CREATE POLICY "flight_tracking_select_policy" ON flight_tracking
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND is_active = true
    )
  );

-- Insert policy - authorized users can create
CREATE POLICY "flight_tracking_insert_policy" ON flight_tracking
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN (
        'super_admin',
        'admin',
        'captain',
        'delta_oscar',
        'tango_oscar',
        'head_tango_oscar',
        'alpha_oscar',
        'november_oscar'
      )
      AND is_active = true
    )
  );

-- Update policy - authorized users can update
CREATE POLICY "flight_tracking_update_policy" ON flight_tracking
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN (
        'super_admin',
        'admin',
        'captain',
        'delta_oscar',
        'tango_oscar',
        'head_tango_oscar',
        'alpha_oscar',
        'november_oscar'
      )
      AND is_active = true
    )
  );

-- Delete policy - ONLY super_admin and admin can delete
CREATE POLICY "flight_tracking_delete_policy" ON flight_tracking
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

-- ============================================================================
-- 3. ENSURE PAPAS TABLE HAS RLS ENABLED
-- ============================================================================

ALTER TABLE papas ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. ENSURE FLIGHT_TRACKING TABLE HAS RLS ENABLED
-- ============================================================================

ALTER TABLE flight_tracking ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'FINAL FIXES MIGRATION COMPLETE!';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Completed:';
  RAISE NOTICE '  ✓ Updated Papas RLS - DOs can view only their assigned Papas';
  RAISE NOTICE '  ✓ Added flight tracking delete policy - Admins only';
  RAISE NOTICE '  ✓ Enabled RLS on papas table';
  RAISE NOTICE '  ✓ Enabled RLS on flight_tracking table';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'DOs can now access Papa forms for their assigned journeys only';
  RAISE NOTICE 'Super Admin and Admin can delete any flight being tracked';
  RAISE NOTICE '============================================================================';
END $$;
