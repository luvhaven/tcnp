-- ============================================================================
-- LOCATION TRACKING SYSTEM MIGRATION
-- ============================================================================
-- Real-time location tracking for protocol officers, journeys, and vehicles
-- ============================================================================

-- ============================================================================
-- 1. USER LOCATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  latitude NUMERIC(10, 8) NOT NULL,
  longitude NUMERIC(11, 8) NOT NULL,
  accuracy NUMERIC(10, 2),
  altitude NUMERIC(10, 2),
  heading NUMERIC(5, 2),
  speed NUMERIC(10, 2),
  battery_level INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_locations_user_id ON user_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_locations_created_at ON user_locations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_locations_active ON user_locations(is_active) WHERE is_active = true;

-- ============================================================================
-- 2. VEHICLE LOCATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS vehicle_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cheetah_id UUID NOT NULL REFERENCES cheetahs(id) ON DELETE CASCADE,
  latitude NUMERIC(10, 8) NOT NULL,
  longitude NUMERIC(11, 8) NOT NULL,
  accuracy NUMERIC(10, 2),
  heading NUMERIC(5, 2),
  speed NUMERIC(10, 2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_locations_cheetah_id ON vehicle_locations(cheetah_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_locations_created_at ON vehicle_locations(created_at DESC);

-- ============================================================================
-- 3. JOURNEY LOCATIONS TABLE (Breadcrumb trail)
-- ============================================================================

CREATE TABLE IF NOT EXISTS journey_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  journey_id UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  latitude NUMERIC(10, 8) NOT NULL,
  longitude NUMERIC(11, 8) NOT NULL,
  accuracy NUMERIC(10, 2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journey_locations_journey_id ON journey_locations(journey_id);
CREATE INDEX IF NOT EXISTS idx_journey_locations_created_at ON journey_locations(created_at DESC);

-- ============================================================================
-- 4. FLIGHT TRACKING TABLE (OpenSky API data)
-- ============================================================================

CREATE TABLE IF NOT EXISTS flight_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flight_id TEXT,
  icao24 TEXT,
  callsign TEXT,
  origin_country TEXT,
  latitude NUMERIC(10, 8),
  longitude NUMERIC(11, 8),
  altitude NUMERIC(10, 2),
  velocity NUMERIC(10, 2),
  heading NUMERIC(5, 2),
  vertical_rate NUMERIC(10, 2),
  on_ground BOOLEAN DEFAULT false,
  last_contact TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
DECLARE
  column_exists BOOLEAN;
BEGIN
  -- Ensure flight_tracking table has necessary columns
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'flight_tracking'
      AND column_name = 'flight_id'
  ) INTO column_exists;
  IF NOT column_exists THEN
    ALTER TABLE flight_tracking ADD COLUMN flight_id TEXT;
  END IF;

  -- Ensure created_at column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'flight_tracking'
      AND column_name = 'created_at'
  ) INTO column_exists;

  IF NOT column_exists THEN
    ALTER TABLE flight_tracking ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
  END IF;

  -- Ensure updated_at column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'flight_tracking'
      AND column_name = 'updated_at'
  ) INTO column_exists;

  IF NOT column_exists THEN
    ALTER TABLE flight_tracking ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;

  -- Backfill flight_id values from existing data
  UPDATE flight_tracking
  SET flight_id = COALESCE(
    NULLIF(TRIM(flight_id), ''),
    NULLIF(TRIM(callsign), ''),
    NULLIF(TRIM(icao24), '')
  )
  WHERE flight_id IS NULL OR flight_id = '';

  -- Fallback for records without any identifier
  UPDATE flight_tracking
  SET flight_id = CONCAT('unknown_', id::text)
  WHERE flight_id IS NULL OR flight_id = '';

  -- Enforce constraints and indexes
  ALTER TABLE flight_tracking ALTER COLUMN flight_id SET NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_flight_tracking_flight_id_unique ON flight_tracking(flight_id);
  CREATE INDEX IF NOT EXISTS idx_flight_tracking_icao24 ON flight_tracking(icao24);
  CREATE INDEX IF NOT EXISTS idx_flight_tracking_updated_at ON flight_tracking(updated_at DESC);
END $$;

-- ============================================================================
-- 5. RLS POLICIES
-- ============================================================================

-- User Locations
ALTER TABLE user_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own location"
  ON user_locations FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own location"
  ON user_locations FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all user locations"
  ON user_locations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'captain', 'head_of_operations')
    )
  );

CREATE POLICY "Users can view their own location"
  ON user_locations FOR SELECT
  USING (user_id = auth.uid());

-- Vehicle Locations
ALTER TABLE vehicle_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view vehicle locations"
  ON vehicle_locations FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins and TOs can manage vehicle locations"
  ON vehicle_locations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND (
        role IN ('super_admin', 'admin', 'captain', 'head_of_operations')
        OR oscar = 'tango_oscar'
      )
    )
  );

-- Journey Locations
ALTER TABLE journey_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view journey locations"
  ON journey_locations FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins and DOs can manage journey locations"
  ON journey_locations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND (
        role IN ('super_admin', 'admin', 'captain', 'head_of_operations')
        OR oscar = 'delta_oscar'
      )
    )
  );

-- Flight Tracking
ALTER TABLE flight_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view flight tracking"
  ON flight_tracking FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage flight tracking"
  ON flight_tracking FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'captain', 'head_of_operations')
    )
  );

-- ============================================================================
-- 6. HELPER FUNCTIONS
-- ============================================================================

-- Get latest location for a user
CREATE OR REPLACE FUNCTION get_user_latest_location(user_uuid UUID)
RETURNS TABLE (
  latitude NUMERIC,
  longitude NUMERIC,
  accuracy NUMERIC,
  updated_at TIMESTAMPTZ
) AS $$
  SELECT 
    latitude,
    longitude,
    accuracy,
    updated_at
  FROM user_locations
  WHERE user_id = user_uuid
  AND is_active = true
  ORDER BY updated_at DESC
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Get all active user locations (for live map)
CREATE OR REPLACE FUNCTION get_active_user_locations()
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  oscar TEXT,
  role user_role,
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
  AND ul.updated_at > NOW() - INTERVAL '10 minutes'
  ORDER BY ul.user_id, ul.updated_at DESC;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Update or insert user location (upsert pattern)
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

  -- Insert new location
  INSERT INTO user_locations (
    user_id, latitude, longitude, accuracy, altitude, heading, speed, battery_level
  )
  VALUES (
    p_user_id, p_latitude, p_longitude, p_accuracy, p_altitude, p_heading, p_speed, p_battery_level
  )
  RETURNING id INTO location_id;

  RETURN location_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_user_latest_location TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_user_locations TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_user_location TO authenticated;

-- ============================================================================
-- 7. REALTIME PUBLICATION
-- ============================================================================

-- Enable realtime for location tables
ALTER PUBLICATION supabase_realtime ADD TABLE user_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE vehicle_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE journey_locations;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'LOCATION TRACKING SYSTEM INSTALLED!';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  ✓ user_locations - Real-time protocol officer tracking';
  RAISE NOTICE '  ✓ vehicle_locations - Cheetah (vehicle) tracking';
  RAISE NOTICE '  ✓ journey_locations - Journey breadcrumb trails';
  RAISE NOTICE '  ✓ flight_tracking - OpenSky API flight data';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Helper functions:';
  RAISE NOTICE '  ✓ get_user_latest_location(user_uuid)';
  RAISE NOTICE '  ✓ get_active_user_locations()';
  RAISE NOTICE '  ✓ upsert_user_location(...)';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Realtime enabled for all location tables';
  RAISE NOTICE '============================================================================';
END $$;
