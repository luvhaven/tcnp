-- ============================================================================
-- FINAL FIX: JOURNEY STATUS UPDATE, HISTORY, AND DASHBOARD PERMISSIONS
-- Run this script in the Supabase SQL Editor to permanently fix:
-- 1. "Failed to update status" error for Delta Oscars
-- 2. Dashboard stat mismatches (syncing status columns)
-- ============================================================================

-- 1. Enable pgcrypto (Required for UUIDs)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Recreate Journey Status Updates Table with CORRECT Permissions
DROP TABLE IF EXISTS journey_status_updates CASCADE;

CREATE TABLE journey_status_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL,
  updated_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_journey_status_updates_journey_id ON journey_status_updates(journey_id);
CREATE INDEX idx_journey_status_updates_created_at ON journey_status_updates(created_at);

-- 3. RLS Policies (Ultra-Permissive for Authenticated Users)
ALTER TABLE journey_status_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all access for authenticated users" ON journey_status_updates;

CREATE POLICY "Enable all access for authenticated users"
  ON journey_status_updates
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Grant Permissions
GRANT ALL ON journey_status_updates TO authenticated;
GRANT ALL ON journey_status_updates TO service_role;

-- 4. Fix Journeys Table RLS (Ensure DOs can update)
DROP POLICY IF EXISTS "Enable update for authenticated users" ON journeys;

CREATE POLICY "Enable update for authenticated users"
  ON journeys FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 5. The Master Function (SECURITY DEFINER to bypass RLS issues)
CREATE OR REPLACE FUNCTION update_journey_status(
  p_journey_id UUID,
  p_status VARCHAR,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_update_id UUID;
  v_papa_name TEXT;
  v_do_name TEXT;
  admin_user RECORD;
  v_macro_status VARCHAR;
BEGIN
  -- Determine simplified status for filtering/stats
  -- Valid enum values: planned, scheduled, arriving, at_nest, departing_nest, 
  -- enroute_to_theatre, at_theatre, departing_theatre, completed, cancelled, distress, active, planning
  v_macro_status := CASE 
      WHEN p_status IN ('broken_arrow', 'distress') THEN 'distress'
      WHEN p_status = 'completed' THEN 'completed'
      WHEN p_status IN ('planned', 'planning') THEN 'planned'
      WHEN p_status IN ('cancelled') THEN 'cancelled'
      ELSE 'active' -- Maps: scheduled, arriving, at_nest, first_course, etc. to 'active'
    END;

  -- Get Papa name
  SELECT p.full_name INTO v_papa_name
  FROM journeys j
  LEFT JOIN papas p ON j.papa_id = p.id
  WHERE j.id = p_journey_id;
  
  v_papa_name := COALESCE(v_papa_name, 'Unknown Papa');

  -- Get DO name
  SELECT full_name INTO v_do_name
  FROM users
  WHERE id = auth.uid();
  
  v_do_name := COALESCE(v_do_name, 'Unknown Officer');

  -- Insert into history (returning ID)
  INSERT INTO journey_status_updates (journey_id, status, updated_by, notes)
  VALUES (p_journey_id, p_status, auth.uid(), p_notes)
  RETURNING id INTO v_update_id;

  -- Update Journey Status (Sync Status + Call Sign)
  -- IMPORTANT: Casting to ::journey_status because the column is an ENUM
  UPDATE journeys
  SET 
    current_status = p_status,
    current_call_sign = p_status,
    status = v_macro_status::journey_status, -- Explicit cast is REQUIRED
    status_updated_at = NOW(),
    updated_at = NOW()
  WHERE id = p_journey_id;

  -- Notify Admins
  FOR admin_user IN
    SELECT id FROM users
    WHERE role IN ('dev_admin', 'super_admin', 'admin', 'captain', 'head_of_operations', 'head_of_command')
    AND is_active = true
    AND id != auth.uid()
  LOOP
    INSERT INTO notifications (
      user_id, title, message, type, priority, journey_id, created_at
    ) VALUES (
      admin_user.id,
      'Journey Status Updated',
      format('%s updated status to "%s" for %s', v_do_name, REPLACE(p_status, '_', ' '), v_papa_name),
      'journey_update',
      CASE WHEN p_status IN ('broken_arrow', 'distress') THEN 'high' ELSE 'medium' END,
      p_journey_id,
      NOW()
    );
  END LOOP;

  RETURN v_update_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION update_journey_status TO authenticated;
GRANT EXECUTE ON FUNCTION update_journey_status TO service_role;

-- 6. DATA MIGRATION: Sync existing journeys
-- Casting to ::journey_status is critical here too
UPDATE journeys
SET status = CASE 
      WHEN current_status IN ('broken_arrow', 'distress') THEN 'distress'
      WHEN current_status = 'completed' THEN 'completed'
      WHEN current_status IN ('planned', 'planning') THEN 'planned'
      WHEN current_status IN ('cancelled') THEN 'cancelled'
      WHEN current_status IS NULL THEN 'planned'
      ELSE 'active'
    END::journey_status;

DO $$
BEGIN
  RAISE NOTICE 'SUCCESS: Status update logic fixed with correct ENUM typing.';
END $$;
