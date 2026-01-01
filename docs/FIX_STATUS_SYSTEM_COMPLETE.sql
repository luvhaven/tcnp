-- ============================================================================
-- COMPLETE STATUS UPDATE SYSTEM FIX
-- ============================================================================
-- This script fixes ALL issues with journey status updates, notifications,
-- and realtime subscriptions. Run this ONCE in the Supabase SQL Editor.
-- ============================================================================

-- 0. ENABLE REQUIRED EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. JOURNEY STATUS UPDATES TABLE (History)
-- ============================================================================
-- Drop and recreate to ensure clean state
DROP TABLE IF EXISTS journey_status_updates CASCADE;

CREATE TABLE journey_status_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL,
  updated_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_jsu_journey_id ON journey_status_updates(journey_id);
CREATE INDEX idx_jsu_created_at ON journey_status_updates(created_at DESC);

-- RLS: Allow authenticated users full access
ALTER TABLE journey_status_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jsu_authenticated_all" ON journey_status_updates;
CREATE POLICY "jsu_authenticated_all"
  ON journey_status_updates FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

GRANT ALL ON journey_status_updates TO authenticated;
GRANT ALL ON journey_status_updates TO service_role;

-- ============================================================================
-- 2. FIX JOURNEYS TABLE RLS
-- ============================================================================
-- Ensure DOs can UPDATE journeys
DROP POLICY IF EXISTS "journeys_update_authenticated" ON journeys;
CREATE POLICY "journeys_update_authenticated"
  ON journeys FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

-- Ensure SELECT access for authenticated users
DROP POLICY IF EXISTS "journeys_select_authenticated" ON journeys;
CREATE POLICY "journeys_select_authenticated"
  ON journeys FOR SELECT TO authenticated
  USING (true);

-- ============================================================================
-- 3. UPDATE_JOURNEY_STATUS FUNCTION
-- ============================================================================
-- SECURITY DEFINER bypasses RLS for internal operations
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
  v_macro_status VARCHAR;
  admin_rec RECORD;
BEGIN
  -- 1. Determine macro status for the enum column
  v_macro_status := CASE 
    WHEN p_status IN ('broken_arrow', 'distress') THEN 'distress'
    WHEN p_status = 'completed' THEN 'completed'
    WHEN p_status = 'cancelled' THEN 'cancelled'
    WHEN p_status IN ('planned', 'planning') THEN 'planned'
    ELSE 'active'
  END;

  -- 2. Get Papa name for notification message
  SELECT COALESCE(p.full_name, 'Unknown Papa') INTO v_papa_name
  FROM journeys j
  LEFT JOIN papas p ON j.papa_id = p.id
  WHERE j.id = p_journey_id;

  -- 3. Get DO name for notification message
  SELECT COALESCE(full_name, 'Unknown Officer') INTO v_do_name
  FROM users
  WHERE id = auth.uid();

  -- 4. Insert history record
  INSERT INTO journey_status_updates (journey_id, status, updated_by, notes)
  VALUES (p_journey_id, p_status, auth.uid(), p_notes)
  RETURNING id INTO v_update_id;

  -- 5. Update journey record
  UPDATE journeys
  SET 
    current_status = p_status,
    current_call_sign = p_status,
    status = v_macro_status::journey_status,
    status_updated_at = NOW(),
    updated_at = NOW()
  WHERE id = p_journey_id;

  -- 6. Send notifications to admins
  FOR admin_rec IN
    SELECT id FROM users
    WHERE role IN ('dev_admin', 'super_admin', 'admin', 'captain', 'head_of_operations', 'head_of_command')
    AND is_active = true
    AND id != auth.uid()
  LOOP
    INSERT INTO notifications (
      user_id, title, message, type, priority, journey_id, created_at
    ) VALUES (
      admin_rec.id,
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

GRANT EXECUTE ON FUNCTION update_journey_status(UUID, VARCHAR, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_journey_status(UUID, VARCHAR, TEXT) TO service_role;

-- ============================================================================
-- 4. COMPLETE_JOURNEY FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION complete_journey(p_journey_id UUID)
RETURNS VOID AS $$
DECLARE
  v_papa_name TEXT;
  v_do_name TEXT;
  admin_rec RECORD;
BEGIN
  -- Get names for notification
  SELECT COALESCE(p.full_name, 'Unknown Papa') INTO v_papa_name
  FROM journeys j
  LEFT JOIN papas p ON j.papa_id = p.id
  WHERE j.id = p_journey_id;

  SELECT COALESCE(full_name, 'Unknown Officer') INTO v_do_name
  FROM users
  WHERE id = auth.uid();

  -- Update journey
  UPDATE journeys
  SET 
    current_status = 'completed',
    current_call_sign = 'completed',
    status = 'completed'::journey_status,
    status_updated_at = NOW(),
    updated_at = NOW()
  WHERE id = p_journey_id;

  -- Insert history
  INSERT INTO journey_status_updates (journey_id, status, updated_by, notes)
  VALUES (p_journey_id, 'completed', auth.uid(), 'Journey marked as complete');

  -- Notify admins
  FOR admin_rec IN
    SELECT id FROM users
    WHERE role IN ('dev_admin', 'super_admin', 'admin', 'captain', 'head_of_operations', 'head_of_command')
    AND is_active = true
    AND id != auth.uid()
  LOOP
    INSERT INTO notifications (
      user_id, title, message, type, priority, journey_id, created_at
    ) VALUES (
      admin_rec.id,
      'Journey Completed',
      format('%s completed journey for %s', v_do_name, v_papa_name),
      'journey_update',
      'low',
      p_journey_id,
      NOW()
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION complete_journey(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_journey(UUID) TO service_role;

-- ============================================================================
-- 5. ENABLE REALTIME
-- ============================================================================
-- Add tables to realtime publication (safe if already added)
DO $$
BEGIN
  -- These commands will error if already added, so we catch exceptions
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE journeys;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE journey_status_updates;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

-- ============================================================================
-- 6. DATA SYNC: Fix any journeys with NULL status
-- ============================================================================
UPDATE journeys
SET status = CASE 
    WHEN current_status IN ('broken_arrow', 'distress') THEN 'distress'
    WHEN current_status = 'completed' THEN 'completed'
    WHEN current_status = 'cancelled' THEN 'cancelled'
    WHEN current_status IN ('planned', 'planning') THEN 'planned'
    WHEN current_status IS NULL THEN 'planned'
    ELSE 'active'
  END::journey_status
WHERE status IS NULL OR current_status IS NOT NULL;

-- ============================================================================
-- 7. NOTIFICATIONS TABLE PERMISSIONS
-- ============================================================================
-- Ensure notifications table has proper RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_insert_all" ON notifications;
CREATE POLICY "notifications_insert_all"
  ON notifications FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
CREATE POLICY "notifications_select_own"
  ON notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
CREATE POLICY "notifications_update_own"
  ON notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

GRANT ALL ON notifications TO authenticated;
GRANT ALL ON notifications TO service_role;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'STATUS UPDATE SYSTEM FIX COMPLETE!';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Components Fixed:';
  RAISE NOTICE '  ✓ journey_status_updates table (history)';
  RAISE NOTICE '  ✓ update_journey_status() function';
  RAISE NOTICE '  ✓ complete_journey() function';
  RAISE NOTICE '  ✓ journeys table RLS policies';
  RAISE NOTICE '  ✓ notifications table RLS policies';
  RAISE NOTICE '  ✓ Realtime enabled for journeys, notifications, journey_status_updates';
  RAISE NOTICE '  ✓ Data sync for existing journeys';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Test by updating a journey status as a Delta Oscar.';
  RAISE NOTICE '============================================================================';
END $$;
