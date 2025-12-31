-- ============================================================================
-- UNIFIED FIX: CALL SIGN NOTIFICATIONS AND REALTIME UPDATES
-- ============================================================================
-- This script fixes:
-- 1. update_journey_status function (used by My Operations page)
-- 2. update_journey_call_sign function (used by Ops Monitor page)
-- Both will now notify admins and dev_admin
-- ============================================================================

-- ============================================================================
-- STEP 1: ENSURE REQUIRED COLUMNS EXIST
-- ============================================================================

DO $$
BEGIN
  -- Ensure current_status column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journeys' AND column_name = 'current_status'
  ) THEN
    ALTER TABLE journeys ADD COLUMN current_status TEXT DEFAULT 'planned';
    RAISE NOTICE '✓ Added current_status column';
  END IF;

  -- Ensure current_call_sign column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journeys' AND column_name = 'current_call_sign'
  ) THEN
    ALTER TABLE journeys ADD COLUMN current_call_sign TEXT DEFAULT 'planned';
    RAISE NOTICE '✓ Added current_call_sign column';
  END IF;

  -- Ensure status_updated_at column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journeys' AND column_name = 'status_updated_at'
  ) THEN
    ALTER TABLE journeys ADD COLUMN status_updated_at TIMESTAMPTZ DEFAULT NOW();
    RAISE NOTICE '✓ Added status_updated_at column';
  END IF;
END $$;

-- ============================================================================
-- STEP 2: UPDATE update_journey_status (USED BY MY OPERATIONS PAGE)
-- ============================================================================

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
  -- Get Papa name for notification
  SELECT p.full_name INTO v_papa_name
  FROM journeys j
  LEFT JOIN papas p ON j.papa_id = p.id
  WHERE j.id = p_journey_id;
  
  v_papa_name := COALESCE(v_papa_name, 'Unknown Papa');

  -- Get DO name for notification
  SELECT full_name INTO v_do_name
  FROM users
  WHERE id = auth.uid();
  
  v_do_name := COALESCE(v_do_name, 'Unknown Officer');

  -- Insert into history
  INSERT INTO journey_status_updates (journey_id, status, updated_by, notes)
  VALUES (p_journey_id, p_status, auth.uid(), p_notes)
  RETURNING id INTO v_update_id;

  -- Update journey with both current_status AND current_call_sign for consistency
  UPDATE journeys
  SET 
    current_status = p_status,
    current_call_sign = p_status,
    status_updated_at = NOW(),
    updated_at = NOW()
  WHERE id = p_journey_id;

  -- Create notifications for all admins AND dev_admin
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

-- ============================================================================
-- STEP 3: UPDATE update_journey_call_sign (USED BY OPS MONITOR PAGE)
-- ============================================================================

CREATE OR REPLACE FUNCTION update_journey_call_sign(
  journey_uuid UUID,
  new_status TEXT
)
RETURNS JSONB AS $$
DECLARE
  journey_rec RECORD;
  updates JSONB;
  papa_name TEXT;
  do_name TEXT;
  admin_user RECORD;
  notification_count INTEGER := 0;
BEGIN
  -- Get the journey with related data
  SELECT j.id, j.papa_id, j.assigned_do_id, j.assigned_duty_officer_id, p.full_name as papa_full_name
  INTO journey_rec
  FROM journeys j
  LEFT JOIN papas p ON j.papa_id = p.id
  WHERE j.id = journey_uuid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journey not found';
  END IF;

  papa_name := COALESCE(journey_rec.papa_full_name, 'Unknown Papa');

  -- Verify the user is assigned to this journey or is admin
  IF NOT (
    journey_rec.assigned_do_id = auth.uid()
    OR journey_rec.assigned_duty_officer_id = auth.uid()
    OR is_admin()
  ) THEN
    RAISE EXCEPTION 'You are not authorized to update this journey';
  END IF;

  -- Get DO name for notification
  SELECT full_name INTO do_name
  FROM users
  WHERE id = auth.uid();

  do_name := COALESCE(do_name, 'Unknown Officer');

  -- Validate status
  IF new_status NOT IN (
    'planned', 'scheduled', 'first_course', 'chapman', 'dessert', 
    'broken_arrow', 'in_progress', 'completed', 'cancelled',
    'arriving', 'at_nest', 'departing_nest', 'enroute_to_theatre',
    'at_theatre', 'departing_theatre', 'active', 'planning', 'distress'
  ) THEN
    RAISE EXCEPTION 'Invalid status: %', new_status;
  END IF;

  -- Build updates
  updates := jsonb_build_object('current_call_sign', new_status);

  -- Update the journey with both fields for consistency
  UPDATE journeys
  SET 
    current_call_sign = new_status,
    current_status = new_status,
    status_updated_at = NOW(),
    updated_at = NOW()
  WHERE id = journey_uuid;

  -- Create notifications for all admins AND dev_admin
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
      'Journey Call Sign Updated',
      format('%s updated call sign to "%s" for %s', do_name, new_status, papa_name),
      'journey_update',
      CASE WHEN new_status IN ('broken_arrow', 'distress') THEN 'high' ELSE 'medium' END,
      journey_uuid,
      NOW()
    );
    notification_count := notification_count + 1;
  END LOOP;

  RAISE NOTICE 'Created % notification(s) for admins', notification_count;

  RETURN updates;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 4: GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION update_journey_status TO authenticated;
GRANT EXECUTE ON FUNCTION update_journey_call_sign TO authenticated;

-- ============================================================================
-- STEP 5: ENABLE REALTIME FOR JOURNEYS TABLE
-- ============================================================================

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE journeys;
    RAISE NOTICE '✓ Added journeys to realtime publication';
  EXCEPTION
    WHEN duplicate_object THEN
      RAISE NOTICE '✓ Journeys already in realtime publication';
  END;
  
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
    RAISE NOTICE '✓ Added notifications to realtime publication';
  EXCEPTION
    WHEN duplicate_object THEN
      RAISE NOTICE '✓ Notifications already in realtime publication';
  END;
END $$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
  admin_count INTEGER;
BEGIN
  -- Count admins who will receive notifications
  SELECT COUNT(*) INTO admin_count
  FROM users
  WHERE role IN ('dev_admin', 'super_admin', 'admin', 'captain', 'head_of_operations', 'head_of_command')
  AND is_active = true;

  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'UNIFIED CALL SIGN NOTIFICATION SYSTEM - COMPLETE!';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Fixed functions:';
  RAISE NOTICE '  ✓ update_journey_status() - used by My Operations page';
  RAISE NOTICE '  ✓ update_journey_call_sign() - used by Ops Monitor page';
  RAISE NOTICE 'Both functions now:';
  RAISE NOTICE '  ✓ Update both current_status AND current_call_sign fields';
  RAISE NOTICE '  ✓ Create notifications for % admin users', admin_count;
  RAISE NOTICE '  ✓ Include dev_admin in notification recipients';
  RAISE NOTICE '  ✓ Realtime enabled for instant updates';
  RAISE NOTICE '============================================================================';
END $$;
