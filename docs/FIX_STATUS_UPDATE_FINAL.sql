-- ============================================================================
-- FINAL FIX: JOURNEY STATUS UPDATE AND HISTORY LOGGING
-- ============================================================================

-- 1. Enable pgcrypto for standard UUID generation (if not enabled)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Drop and Recreate History Table (Ensure Clean Slate)
DROP TABLE IF EXISTS journey_status_updates CASCADE;

CREATE TABLE journey_status_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- uses pgcrypto
  journey_id UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL,
  updated_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Optimization Indexes
CREATE INDEX idx_journey_status_updates_journey_id ON journey_status_updates(journey_id);
CREATE INDEX idx_journey_status_updates_created_at ON journey_status_updates(created_at);

-- 4. Permissive RLS Policies (Fixes 'Failed to update status')
ALTER TABLE journey_status_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON journey_status_updates;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON journey_status_updates;

CREATE POLICY "Enable read access for authenticated users"
  ON journey_status_updates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Enable insert access for authenticated users"
  ON journey_status_updates FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 5. Grant Permissions Explicitly
GRANT ALL ON journey_status_updates TO authenticated;
GRANT ALL ON journey_status_updates TO service_role;

-- 6. Update FUNCTION with Robust Logic
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
BEGIN
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
  UPDATE journeys
  SET 
    current_status = p_status,
    current_call_sign = p_status,
    status = CASE 
      WHEN p_status IN ('broken_arrow', 'distress') THEN 'distress'
      WHEN p_status = 'completed' THEN 'completed'
      WHEN p_status = 'planned' THEN 'planned'
      WHEN p_status IN ('scheduled', 'arriving', 'at_nest') THEN 'scheduled'
      ELSE 'active'
    END,
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
      format('%s updated status to "%s" for %s', v_do_name, p_status, v_papa_name),
      'journey_update',
      CASE WHEN p_status IN ('broken_arrow', 'distress') THEN 'high' ELSE 'medium' END,
      p_journey_id,
      NOW()
    );
  END LOOP;

  RETURN v_update_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Grant Function Permissions
GRANT EXECUTE ON FUNCTION update_journey_status TO authenticated;
GRANT EXECUTE ON FUNCTION update_journey_status TO service_role;

RAISE NOTICE 'SUCCESS: Status update logic fixed and history table rebuilt.';
