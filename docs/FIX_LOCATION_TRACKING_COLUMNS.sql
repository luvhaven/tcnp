-- ============================================================================
-- FIX: LOCATION TELEMETRY COLUMNS & RPC
-- Run this script to ensure Speed and Battery Level are correctly stored and retrieved.
-- ============================================================================

-- 1. Ensure columns exist with correct types
DO $$
BEGIN
  -- Add battery_level if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_locations' AND column_name = 'battery_level') THEN
    ALTER TABLE user_locations ADD COLUMN battery_level INTEGER;
  END IF;

  -- Add speed if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_locations' AND column_name = 'speed') THEN
    ALTER TABLE user_locations ADD COLUMN speed NUMERIC(10, 2);
  END IF;
  
   -- Add speed if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_locations' AND column_name = 'heading') THEN
    ALTER TABLE user_locations ADD COLUMN heading NUMERIC(5, 2);
  END IF;
END $$;

-- 2. Update the UPSERT function to explicitly accept and store these values
CREATE OR REPLACE FUNCTION upsert_user_location(
  p_user_id UUID,
  p_latitude NUMERIC,
  p_longitude NUMERIC,
  p_accuracy NUMERIC DEFAULT NULL,
  p_altitude NUMERIC DEFAULT NULL,
  p_heading NUMERIC DEFAULT NULL,
  p_speed NUMERIC DEFAULT NULL,
  p_battery_level INTEGER DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  location_id UUID;
BEGIN
  -- Deactivate old locations
  UPDATE user_locations
  SET is_active = false
  WHERE user_id = p_user_id
  AND is_active = true;

  -- Insert new location with all telemetry
  INSERT INTO user_locations (
    user_id, latitude, longitude, accuracy, altitude, heading, speed, battery_level, is_active
  )
  VALUES (
    p_user_id, p_latitude, p_longitude, p_accuracy, p_altitude, p_heading, p_speed, p_battery_level, true
  )
  RETURNING id INTO location_id;

  RETURN location_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update the FETCH function to return these columns
CREATE OR REPLACE FUNCTION get_active_user_locations()
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  oscar TEXT,
  role user_role, -- Ensure this matches your existing ENUM type, or use TEXT if unsure
  latitude NUMERIC,
  longitude NUMERIC,
  accuracy NUMERIC,
  speed NUMERIC,
  heading NUMERIC,
  battery_level INTEGER,
  updated_at TIMESTAMPTZ
) AS $$
  SELECT DISTINCT ON (ul.user_id)
    u.id as user_id,
    u.full_name,
    u.oscar,
    u.role,
    ul.latitude,
    ul.longitude,
    ul.accuracy,
    ul.speed,
    ul.heading,
    ul.battery_level,
    ul.updated_at
  FROM user_locations ul
  JOIN users u ON u.id = ul.user_id
  WHERE ul.is_active = true
  AND u.is_active = true
  AND ul.updated_at > NOW() - INTERVAL '10 minutes' -- Consider active if updated in last 10m
  ORDER BY ul.user_id, ul.updated_at DESC;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Grant permissions just in case
GRANT EXECUTE ON FUNCTION upsert_user_location TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_user_locations TO authenticated;
