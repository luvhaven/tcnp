-- ============================================================================
-- FIX: ADD NOTIFICATIONS TO CALL SIGN UPDATES
-- ============================================================================
-- This script enhances the update_journey_call_sign function to create
-- notifications for admins when a DO updates a journey call sign
-- ============================================================================

-- Drop and recreate the function with notification support
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
      ELSE 'active'
    END,
    actual_departure = COALESCE((updates->>'actual_departure')::TIMESTAMPTZ, actual_departure),
    actual_arrival = COALESCE((updates->>'actual_arrival')::TIMESTAMPTZ, actual_arrival),
    updated_at = NOW()
  WHERE id = journey_uuid;

  -- Create notifications for all admins
  FOR admin_user IN
    SELECT id FROM users
    WHERE role IN ('super_admin', 'admin', 'captain', 'head_of_operations', 'head_of_command')
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
      format('%s updated call sign to %s for %s', do_name, new_status, papa_name),
      'journey_update',
      CASE 
        WHEN new_status IN ('broken_arrow', 'distress') THEN 'high'
        ELSE 'medium'
      END,
      journey_uuid,
      NOW()
    );
  END LOOP;

  RETURN updates;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure permissions are granted
GRANT EXECUTE ON FUNCTION update_journey_call_sign TO authenticated;

-- Verification
DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'CALL SIGN NOTIFICATION FIX APPLIED!';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Changes made:';
  RAISE NOTICE '  ✓ update_journey_call_sign() now creates notifications for admins';
  RAISE NOTICE '  ✓ Notifications include DO name, new call sign, and Papa name';
  RAISE NOTICE '  ✓ High priority for broken_arrow/distress, medium for others';
  RAISE NOTICE '  ✓ Updates current_call_sign field instead of status';
  RAISE NOTICE '============================================================================';
END $$;
