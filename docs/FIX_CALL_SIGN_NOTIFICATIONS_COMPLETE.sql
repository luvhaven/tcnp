-- ============================================================================
-- COMPLETE FIX: CALL SIGN NOTIFICATIONS AND REALTIME UPDATES
-- ============================================================================
-- This script provides a comprehensive fix for:
-- 1. Ensures current_call_sign column exists
-- 2. Creates/updates notifications table with proper RLS
-- 3. Updates update_journey_call_sign function to notify dev_admin and admins
-- 4. Enables realtime for notifications table
-- ============================================================================

-- ============================================================================
-- STEP 1: ENSURE CURRENT_CALL_SIGN COLUMN EXISTS
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journeys' AND column_name = 'current_call_sign'
  ) THEN
    ALTER TABLE journeys ADD COLUMN current_call_sign TEXT DEFAULT 'planned';
    RAISE NOTICE '✓ Added current_call_sign column to journeys table';
  ELSE
    RAISE NOTICE '✓ current_call_sign column already exists';
  END IF;
END $$;

-- ============================================================================
-- STEP 2: ENSURE NOTIFICATIONS TABLE EXISTS WITH PROPER SCHEMA
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  priority TEXT DEFAULT 'medium',
  is_read BOOLEAN DEFAULT false,
  journey_id UUID REFERENCES journeys(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_journey_id ON notifications(journey_id);

-- ============================================================================
-- STEP 3: SET UP RLS POLICIES FOR NOTIFICATIONS
-- ============================================================================

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;
DROP POLICY IF EXISTS "System can insert notifications" ON notifications;

-- Users can view their own notifications
CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- System can insert notifications for any user
CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- STEP 4: UPDATE update_journey_call_sign FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION update_journey_call_sign(
  journey_uuid UUID,
  new_status TEXT
)
RETURNS JSONB AS $$
DECLARE
  journey_record RECORD;
  updates JSONB;
  papa_name TEXT;
  do_name TEXT;
  admin_user RECORD;
  notification_count INTEGER := 0;
BEGIN
  -- Get the journey with related data
  SELECT j.*, p.full_name as papa_full_name
  INTO journey_record
  FROM journeys j
  LEFT JOIN papas p ON j.papa_id = p.id
  WHERE j.id = journey_uuid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journey not found';
  END IF;

  papa_name := COALESCE(journey_record.papa_full_name, 'Unknown Papa');

  -- Verify the user is assigned to this journey or is admin
  IF NOT (
    journey_record.assigned_do_id = auth.uid()
    OR journey_record.assigned_duty_officer_id = auth.uid()
    OR is_admin()
  ) THEN
    RAISE EXCEPTION 'You are not authorized to update this journey';
  END IF;

  -- Get DO name for notification
  SELECT full_name INTO do_name
  FROM users
  WHERE id = auth.uid();

  do_name := COALESCE(do_name, 'Unknown Officer');

  -- Validate status (accept both journey_status and call_sign values)
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

  -- Set actual times based on call-sign
  IF new_status IN ('first_course', 'in_progress', 'departing_nest', 'departing_theatre') THEN
    IF journey_record.actual_departure IS NULL THEN
      updates := updates || jsonb_build_object('actual_departure', NOW());
    END IF;
  ELSIF new_status = 'completed' THEN
    IF journey_record.actual_arrival IS NULL THEN
      updates := updates || jsonb_build_object('actual_arrival', NOW());
    END IF;
  END IF;

  -- Update the journey with current_call_sign
  UPDATE journeys
  SET 
    current_call_sign = new_status,
    status = CASE 
      WHEN new_status IN ('broken_arrow', 'distress') THEN 'distress'
      WHEN new_status = 'completed' THEN 'completed'
      WHEN new_status = 'planned' THEN 'planned'
      WHEN new_status IN ('scheduled', 'arriving', 'at_nest') THEN 'scheduled'
      ELSE 'active'
    END,
    actual_departure = COALESCE((updates->>'actual_departure')::TIMESTAMPTZ, actual_departure),
    actual_arrival = COALESCE((updates->>'actual_arrival')::TIMESTAMPTZ, actual_arrival),
    updated_at = NOW()
  WHERE id = journey_uuid;

  -- Create notifications for all admins AND dev_admin
  FOR admin_user IN
    SELECT id, full_name FROM users
    WHERE role IN ('dev_admin', 'super_admin', 'admin', 'captain', 'head_of_operations', 'head_of_command')
    AND is_active = true
    AND id != auth.uid()  -- Don't notify the user who made the update
  LOOP
    INSERT INTO notifications (
      user_id,
      title,
      message,
      type,
      priority,
      journey_id,
      created_at
    ) VALUES (
      admin_user.id,
      'Journey Call Sign Updated',
      format('%s updated call sign to "%s" for %s', do_name, new_status, papa_name),
      'journey_update',
      CASE 
        WHEN new_status IN ('broken_arrow', 'distress') THEN 'high'
        ELSE 'medium'
      END,
      journey_uuid,
      NOW()
    );
    notification_count := notification_count + 1;
  END LOOP;

  RAISE NOTICE 'Created % notification(s) for admins', notification_count;

  RETURN updates;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure permissions are granted
GRANT EXECUTE ON FUNCTION update_journey_call_sign TO authenticated;

-- ============================================================================
-- STEP 5: ENABLE REALTIME FOR NOTIFICATIONS
-- ============================================================================

-- Enable realtime publication for notifications table
DO $$
BEGIN
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
  has_current_call_sign BOOLEAN;
  has_notifications_table BOOLEAN;
  notification_policies_count INTEGER;
BEGIN
  -- Check current_call_sign column
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journeys' AND column_name = 'current_call_sign'
  ) INTO has_current_call_sign;

  -- Check notifications table
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'notifications'
  ) INTO has_notifications_table;

  -- Count notification RLS policies
  SELECT COUNT(*) INTO notification_policies_count
  FROM pg_policies
  WHERE tablename = 'notifications';

  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'CALL SIGN NOTIFICATION SYSTEM - INSTALLATION COMPLETE!';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Verification:';
  RAISE NOTICE '  % current_call_sign column exists in journeys table', 
    CASE WHEN has_current_call_sign THEN '✓' ELSE '✗' END;
  RAISE NOTICE '  % notifications table exists', 
    CASE WHEN has_notifications_table THEN '✓' ELSE '✗' END;
  RAISE NOTICE '  % RLS policies on notifications table', notification_policies_count;
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Features enabled:';
  RAISE NOTICE '  ✓ Admins and dev_admin receive notifications when DO updates call sign';
  RAISE NOTICE '  ✓ Notifications include DO name, call sign, and Papa name';
  RAISE NOTICE '  ✓ High priority for broken_arrow/distress, medium for others';
  RAISE NOTICE '  ✓ Updates current_call_sign field for realtime sync';
  RAISE NOTICE '  ✓ Realtime enabled for instant notification delivery';
  RAISE NOTICE '============================================================================';
END $$;
