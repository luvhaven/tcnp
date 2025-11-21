-- ============================================================================
-- ROLE-BASED ACCESS CONTROL (RBAC) SYSTEM
-- ============================================================================
-- This script implements comprehensive RLS policies for unit-specific access
-- Run this in Supabase SQL Editor AFTER running the main migrations
-- ============================================================================

-- ============================================================================
-- 1. SCHEMA CHANGES - ADD COLUMNS FIRST
-- ============================================================================

-- Add assigned_do_id column to journeys table (needed by RLS policies)
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS assigned_do_id UUID REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_journeys_assigned_do ON journeys(assigned_do_id);

-- Add created_by column to incidents table (for RLS policies)
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_incidents_created_by ON incidents(created_by);

-- Backfill created_by from reported_by if needed
UPDATE incidents SET created_by = reported_by WHERE created_by IS NULL AND reported_by IS NOT NULL;

DO $$
BEGIN
  RAISE NOTICE '✓ Schema changes applied: assigned_do_id and created_by columns added';
END $$;

-- ============================================================================
-- 2. HELPER FUNCTIONS FOR ROLE CHECKS
-- ============================================================================

-- Check if user is admin (full access)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'admin', 'captain', 'head_of_operations')
    AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if user is a Delta Oscar (DO)
CREATE OR REPLACE FUNCTION is_delta_oscar()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND oscar = 'delta_oscar'
    AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if user is a Tango Oscar (TO)
CREATE OR REPLACE FUNCTION is_tango_oscar()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND oscar = 'tango_oscar'
    AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if user is an Alpha Oscar (AO)
CREATE OR REPLACE FUNCTION is_alpha_oscar()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND oscar = 'alpha_oscar'
    AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Get current user's oscar
CREATE OR REPLACE FUNCTION get_current_oscar()
RETURNS TEXT AS $$
  SELECT oscar FROM users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================================
-- 3. PAPAS (GUESTS) - RLS POLICIES
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "All authenticated users can view papas" ON papas;
DROP POLICY IF EXISTS "Authorized users can manage papas" ON papas;
DROP POLICY IF EXISTS "Admins have full access to papas" ON papas;
DROP POLICY IF EXISTS "Delta Oscars can view their assigned papas" ON papas;
DROP POLICY IF EXISTS "Delta Oscars can update their assigned papa notes" ON papas;
DROP POLICY IF EXISTS "Authenticated users can view basic papa info" ON papas;

-- Admins can do everything
CREATE POLICY "Admins have full access to papas"
  ON papas FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Delta Oscars can view only their assigned papas
CREATE POLICY "Delta Oscars can view their assigned papas"
  ON papas FOR SELECT
  USING (
    is_delta_oscar() AND
    EXISTS (
      SELECT 1 FROM journeys j
      WHERE j.papa_id = papas.id
      AND j.assigned_do_id = auth.uid()
    )
  );

-- Delta Oscars can update their assigned papas (limited fields)
CREATE POLICY "Delta Oscars can update their assigned papa notes"
  ON papas FOR UPDATE
  USING (
    is_delta_oscar() AND
    EXISTS (
      SELECT 1 FROM journeys j
      WHERE j.papa_id = papas.id
      AND j.assigned_do_id = auth.uid()
    )
  )
  WITH CHECK (
    is_delta_oscar() AND
    EXISTS (
      SELECT 1 FROM journeys j
      WHERE j.papa_id = papas.id
      AND j.assigned_do_id = auth.uid()
    )
  );

-- All authenticated users can view basic papa info (for dropdowns, etc.)
CREATE POLICY "Authenticated users can view basic papa info"
  ON papas FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================================
-- 4. JOURNEYS - RLS POLICIES WITH DO ASSIGNMENT
-- ============================================================================

-- Note: assigned_do_id column already created in section 1

-- Drop existing policies
DROP POLICY IF EXISTS "All authenticated users can view journeys" ON journeys;
DROP POLICY IF EXISTS "Authorized users can manage journeys" ON journeys;
DROP POLICY IF EXISTS "Admins have full access to journeys" ON journeys;
DROP POLICY IF EXISTS "Delta Oscars can view their assigned journeys" ON journeys;
DROP POLICY IF EXISTS "Delta Oscars can update their assigned journey status" ON journeys;
DROP POLICY IF EXISTS "Authenticated users can view all journeys" ON journeys;

-- Admins have full access
CREATE POLICY "Admins have full access to journeys"
  ON journeys FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Delta Oscars can view their assigned journeys
CREATE POLICY "Delta Oscars can view their assigned journeys"
  ON journeys FOR SELECT
  USING (
    is_delta_oscar() AND
    assigned_do_id = auth.uid()
  );

-- Delta Oscars can update status and call signs for their assigned journeys
CREATE POLICY "Delta Oscars can update their assigned journey status"
  ON journeys FOR UPDATE
  USING (
    is_delta_oscar() AND
    assigned_do_id = auth.uid()
  )
  WITH CHECK (
    is_delta_oscar() AND
    assigned_do_id = auth.uid()
  );

-- All authenticated users can view journeys (for tracking)
CREATE POLICY "Authenticated users can view all journeys"
  ON journeys FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================================
-- 5. CHEETAHS (VEHICLES) - RLS POLICIES
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "All authenticated users can view cheetahs" ON cheetahs;
DROP POLICY IF EXISTS "Authorized users can manage cheetahs" ON cheetahs;
DROP POLICY IF EXISTS "Admins have full access to cheetahs" ON cheetahs;
DROP POLICY IF EXISTS "Tango Oscars have full access to cheetahs" ON cheetahs;
DROP POLICY IF EXISTS "Authenticated users can view cheetahs" ON cheetahs;

-- Admins have full access
CREATE POLICY "Admins have full access to cheetahs"
  ON cheetahs FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Tango Oscars have full access to cheetahs
CREATE POLICY "Tango Oscars have full access to cheetahs"
  ON cheetahs FOR ALL
  USING (is_tango_oscar())
  WITH CHECK (is_tango_oscar());

-- All authenticated users can view cheetahs
CREATE POLICY "Authenticated users can view cheetahs"
  ON cheetahs FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================================
-- 6. EAGLE SQUARES (AIRPORTS) - RLS POLICIES
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "All authenticated users can view eagle_squares" ON eagle_squares;
DROP POLICY IF EXISTS "Authorized users can manage eagle_squares" ON eagle_squares;
DROP POLICY IF EXISTS "Admins have full access to eagle_squares" ON eagle_squares;
DROP POLICY IF EXISTS "Alpha Oscars have full access to eagle_squares" ON eagle_squares;
DROP POLICY IF EXISTS "Authenticated users can view eagle_squares" ON eagle_squares;

-- Admins have full access
CREATE POLICY "Admins have full access to eagle_squares"
  ON eagle_squares FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Alpha Oscars have full access to eagle squares
CREATE POLICY "Alpha Oscars have full access to eagle_squares"
  ON eagle_squares FOR ALL
  USING (is_alpha_oscar())
  WITH CHECK (is_alpha_oscar());

-- All authenticated users can view eagle squares
CREATE POLICY "Authenticated users can view eagle_squares"
  ON eagle_squares FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================================
-- 7. NESTS (HOTELS) - RLS POLICIES
-- ============================================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "All authenticated users can view nests" ON nests;
DROP POLICY IF EXISTS "Authorized users can manage nests" ON nests;
DROP POLICY IF EXISTS "Admins have full access to nests" ON nests;
DROP POLICY IF EXISTS "Authenticated users can view nests" ON nests;

-- Admins have full access
CREATE POLICY "Admins have full access to nests"
  ON nests FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- All authenticated users can view nests
CREATE POLICY "Authenticated users can view nests"
  ON nests FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================================
-- 8. THEATRES (VENUES) - RLS POLICIES
-- ============================================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "All authenticated users can view theatres" ON theatres;
DROP POLICY IF EXISTS "Authorized users can manage theatres" ON theatres;
DROP POLICY IF EXISTS "Admins have full access to theatres" ON theatres;
DROP POLICY IF EXISTS "Authenticated users can view theatres" ON theatres;

-- Admins have full access
CREATE POLICY "Admins have full access to theatres"
  ON theatres FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- All authenticated users can view theatres
CREATE POLICY "Authenticated users can view theatres"
  ON theatres FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================================
-- 9. INCIDENTS - RLS POLICIES
-- ============================================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "All authenticated users can view incidents" ON incidents;
DROP POLICY IF EXISTS "Authorized users can manage incidents" ON incidents;
DROP POLICY IF EXISTS "Admins have full access to incidents" ON incidents;
DROP POLICY IF EXISTS "Delta Oscars can manage incidents for their journeys" ON incidents;
DROP POLICY IF EXISTS "Authenticated users can view incidents" ON incidents;

-- Admins have full access
CREATE POLICY "Admins have full access to incidents"
  ON incidents FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Delta Oscars can create and view incidents for their journeys
CREATE POLICY "Delta Oscars can manage incidents for their journeys"
  ON incidents FOR ALL
  USING (
    is_delta_oscar() AND
    (
      journey_id IN (
        SELECT id FROM journeys WHERE assigned_do_id = auth.uid()
      )
      OR reported_by = auth.uid()
      OR created_by = auth.uid()
    )
  )
  WITH CHECK (
    is_delta_oscar() AND
    (
      journey_id IN (
        SELECT id FROM journeys WHERE assigned_do_id = auth.uid()
      )
      OR reported_by = auth.uid()
      OR created_by = auth.uid()
    )
  );

-- All authenticated users can view incidents
CREATE POLICY "Authenticated users can view incidents"
  ON incidents FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================================
-- 10. PROGRAMS - RLS POLICIES
-- ============================================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "All authenticated users can view programs" ON programs;
DROP POLICY IF EXISTS "Authorized users can manage programs" ON programs;
DROP POLICY IF EXISTS "Admins have full access to programs" ON programs;
DROP POLICY IF EXISTS "Authenticated users can view programs" ON programs;

-- Admins have full access
CREATE POLICY "Admins have full access to programs"
  ON programs FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- All authenticated users can view programs
CREATE POLICY "Authenticated users can view programs"
  ON programs FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================================
-- 11. HELPER FUNCTION: ASSIGN DO TO JOURNEY
-- ============================================================================

CREATE OR REPLACE FUNCTION assign_do_to_journey(
  journey_uuid UUID,
  do_uuid UUID
)
RETURNS VOID AS $$
BEGIN
  -- Verify the user is a Delta Oscar
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = do_uuid
    AND oscar = 'delta_oscar'
    AND is_active = true
  ) THEN
    RAISE EXCEPTION 'User is not an active Delta Oscar';
  END IF;

  -- Update the journey
  UPDATE journeys
  SET assigned_do_id = do_uuid
  WHERE id = journey_uuid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journey not found';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION assign_do_to_journey TO authenticated;

-- ============================================================================
-- 12. HELPER FUNCTION: UPDATE JOURNEY CALL SIGN (FOR DOs)
-- ============================================================================

CREATE OR REPLACE FUNCTION update_journey_call_sign(
  journey_uuid UUID,
  new_status TEXT
)
RETURNS JSONB AS $$
DECLARE
  journey_record RECORD;
  updates JSONB;
BEGIN
  -- Get the journey
  SELECT * INTO journey_record
  FROM journeys
  WHERE id = journey_uuid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journey not found';
  END IF;

  -- Verify the user is assigned to this journey or is admin
  IF NOT (
    journey_record.assigned_do_id = auth.uid()
    OR is_admin()
  ) THEN
    RAISE EXCEPTION 'You are not authorized to update this journey';
  END IF;

  -- Validate status
  IF new_status NOT IN ('planned', 'first_course', 'in_progress', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid status: %', new_status;
  END IF;

  -- Build updates based on status
  updates := jsonb_build_object('status', new_status);

  -- Set actual times based on call-sign
  IF new_status = 'first_course' OR new_status = 'in_progress' THEN
    IF journey_record.actual_departure IS NULL THEN
      updates := updates || jsonb_build_object('actual_departure', NOW());
    END IF;
  ELSIF new_status = 'completed' THEN
    IF journey_record.actual_arrival IS NULL THEN
      updates := updates || jsonb_build_object('actual_arrival', NOW());
    END IF;
  END IF;

  -- Update the journey
  UPDATE journeys
  SET 
    status = new_status,
    actual_departure = COALESCE((updates->>'actual_departure')::TIMESTAMPTZ, actual_departure),
    actual_arrival = COALESCE((updates->>'actual_arrival')::TIMESTAMPTZ, actual_arrival),
    updated_at = NOW()
  WHERE id = journey_uuid;

  RETURN updates;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION update_journey_call_sign TO authenticated;

-- ============================================================================
-- 13. GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION is_admin TO authenticated;
GRANT EXECUTE ON FUNCTION is_delta_oscar TO authenticated;
GRANT EXECUTE ON FUNCTION is_tango_oscar TO authenticated;
GRANT EXECUTE ON FUNCTION is_alpha_oscar TO authenticated;
GRANT EXECUTE ON FUNCTION get_current_oscar TO authenticated;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'RBAC PERMISSIONS SYSTEM INSTALLED!';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Role-based access control configured:';
  RAISE NOTICE '  ✓ Admins (super_admin, admin, captain, HOP) - Full access to everything';
  RAISE NOTICE '  ✓ Delta Oscars (DO) - Access to assigned papas and journeys';
  RAISE NOTICE '  ✓ Tango Oscars (TO) - Full access to cheetah management';
  RAISE NOTICE '  ✓ Alpha Oscars (AO) - Full access to eagle squares management';
  RAISE NOTICE '  ✓ All authenticated users - Read access to reference data';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'New features:';
  RAISE NOTICE '  ✓ assign_do_to_journey(journey_uuid, do_uuid) - Assign DO to journey';
  RAISE NOTICE '  ✓ update_journey_call_sign(journey_uuid, status) - DOs update via call signs';
  RAISE NOTICE '============================================================================';
END $$;
