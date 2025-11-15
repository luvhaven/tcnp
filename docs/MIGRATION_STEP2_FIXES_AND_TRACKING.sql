-- ============================================================================
-- STEP 2: FIXES AND LIVE TRACKING
-- ============================================================================
-- Run this AFTER MIGRATION_STEP1_ADD_ROLE.sql has been committed
-- ============================================================================

-- ============================================================================
-- 1. FIX CASCADE DELETE FOR CHEETAHS
-- ============================================================================

-- Drop existing foreign key constraint
ALTER TABLE journeys 
  DROP CONSTRAINT IF EXISTS journeys_assigned_cheetah_id_fkey;

-- Add new constraint with SET NULL on delete
ALTER TABLE journeys 
  ADD CONSTRAINT journeys_assigned_cheetah_id_fkey 
  FOREIGN KEY (assigned_cheetah_id) 
  REFERENCES cheetahs(id) 
  ON DELETE SET NULL;

-- Also fix for vehicle_locations if exists
ALTER TABLE vehicle_locations 
  DROP CONSTRAINT IF EXISTS vehicle_locations_cheetah_id_fkey;

ALTER TABLE vehicle_locations 
  ADD CONSTRAINT vehicle_locations_cheetah_id_fkey 
  FOREIGN KEY (cheetah_id) 
  REFERENCES cheetahs(id) 
  ON DELETE CASCADE;

-- ============================================================================
-- 2. UPDATE JOURNEY RLS POLICIES FOR EXTENDED VISIBILITY
-- ============================================================================

-- Drop existing journey policies
DROP POLICY IF EXISTS "journeys_select_policy" ON journeys;
DROP POLICY IF EXISTS "journeys_modify_policy" ON journeys;
DROP POLICY IF EXISTS "Authorized users can manage journeys" ON journeys;
DROP POLICY IF EXISTS "All authenticated users can view journeys" ON journeys;

-- Create new comprehensive select policy
CREATE POLICY "journeys_select_policy" ON journeys
  FOR SELECT USING (
    -- Assigned Duty Officer can view their journeys
    assigned_duty_officer_id = auth.uid()
    OR
    -- Leadership and management can view all
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN (
        'super_admin',
        'admin',
        'prof',
        'duchess',
        'captain',
        'vice_captain',
        'head_of_operations',
        'head_of_command',
        'command',
        'alpha_oscar',
        'november_oscar',
        'tango_oscar'
      )
      AND is_active = true
    )
  );

-- Create new modify policy
CREATE POLICY "journeys_modify_policy" ON journeys
  FOR ALL USING (
    -- Assigned Duty Officer can update their journeys
    assigned_duty_officer_id = auth.uid()
    OR
    -- Management can manage all journeys
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN (
        'super_admin',
        'admin',
        'captain',
        'head_of_operations',
        'head_of_command'
      )
      AND is_active = true
    )
  );

-- ============================================================================
-- 3. CREATE PROTOCOL_OFFICER_LOCATIONS TABLE FOR LIVE TRACKING
-- ============================================================================

-- Drop if exists
DROP TABLE IF EXISTS protocol_officer_locations CASCADE;

CREATE TABLE protocol_officer_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  accuracy DECIMAL(10, 2),
  altitude DECIMAL(10, 2),
  heading DECIMAL(5, 2),
  speed DECIMAL(10, 2),
  battery_level INTEGER,
  is_online BOOLEAN DEFAULT true,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_protocol_officer_locations_user_id ON protocol_officer_locations(user_id);
CREATE INDEX idx_protocol_officer_locations_timestamp ON protocol_officer_locations(timestamp DESC);
CREATE INDEX idx_protocol_officer_locations_is_online ON protocol_officer_locations(is_online);

-- Enable RLS
ALTER TABLE protocol_officer_locations ENABLE ROW LEVEL SECURITY;

-- Policy: Protocol officers can insert their own locations
CREATE POLICY "protocol_officers_insert_location" ON protocol_officer_locations
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN (
        'delta_oscar',
        'tango_oscar',
        'head_tango_oscar',
        'alpha_oscar',
        'november_oscar',
        'victor_oscar'
      )
      AND is_active = true
    )
  );

-- Policy: Admins can view all locations
CREATE POLICY "admins_view_all_locations" ON protocol_officer_locations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

-- Policy: Officers can view their own locations
CREATE POLICY "officers_view_own_locations" ON protocol_officer_locations
  FOR SELECT USING (user_id = auth.uid());

-- ============================================================================
-- 4. CREATE FUNCTION TO CLEAN OLD LOCATION DATA
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_locations()
RETURNS void AS $$
BEGIN
  -- Delete location records older than 7 days
  DELETE FROM protocol_officer_locations
  WHERE timestamp < NOW() - INTERVAL '7 days';
  
  -- Mark users as offline if no location update in 5 minutes
  UPDATE protocol_officer_locations
  SET is_online = false
  WHERE timestamp < NOW() - INTERVAL '5 minutes'
  AND is_online = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. UPDATE OFFICIAL TITLES FOR HEAD OF OPERATIONS
-- ============================================================================

INSERT INTO official_titles (code, name, unit, is_fixed, is_team_lead, max_positions, description)
VALUES 
  ('HEAD_OF_OPERATIONS', 'Head of Operations', 'OPERATIONS', true, true, 1, 'Head of Operations - Oversees all operational activities')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- ============================================================================
-- MIGRATION STEP 2 COMPLETE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'STEP 2 COMPLETE: ALL FIXES AND ENHANCEMENTS APPLIED!';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Completed:';
  RAISE NOTICE '  ✓ Fixed cascade delete for cheetahs';
  RAISE NOTICE '  ✓ Updated journey visibility policies';
  RAISE NOTICE '  ✓ Created protocol_officer_locations table';
  RAISE NOTICE '  ✓ Added live tracking RLS policies';
  RAISE NOTICE '  ✓ Created cleanup function';
  RAISE NOTICE '  ✓ Updated official titles';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Next: Test all features and deploy!';
  RAISE NOTICE '============================================================================';
END $$;
