-- ============================================================================
-- LOCATION TRACKING SYSTEM MIGRATION (IDEMPOTENT VERSION)
-- ============================================================================
-- Safe to run multiple times - will not error if objects already exist
-- ============================================================================

-- ============================================================================
-- 1. DROP EXISTING POLICIES (if they exist)
-- ============================================================================

DO $$ 
BEGIN
  -- Drop user_locations policies
  DROP POLICY IF EXISTS "Users can view all user locations" ON user_locations;
  DROP POLICY IF EXISTS "Users can insert their own location" ON user_locations;
  DROP POLICY IF EXISTS "Users can update their own location" ON user_locations;
  
  -- Drop vehicle_locations policies
  DROP POLICY IF EXISTS "Authenticated users can view vehicle locations" ON vehicle_locations;
  DROP POLICY IF EXISTS "Admins and TOs can manage vehicle locations" ON vehicle_locations;
  
  -- Drop journey_locations policies
  DROP POLICY IF EXISTS "Authenticated users can view journey locations" ON journey_locations;
  DROP POLICY IF EXISTS "Admins and DOs can manage journey locations" ON journey_locations;
  
  -- Drop flight_tracking policies
  DROP POLICY IF EXISTS "Authenticated users can view flight tracking" ON flight_tracking;
  DROP POLICY IF EXISTS "Admins can manage flight tracking" ON flight_tracking;
END $$;

-- ============================================================================
-- 2. CREATE TABLES (with IF NOT EXISTS)
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

CREATE TABLE IF NOT EXISTS journey_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  journey_id UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  latitude NUMERIC(10, 8) NOT NULL,
  longitude NUMERIC(11, 8) NOT NULL,
  accuracy NUMERIC(10, 2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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

-- ============================================================================
-- 3. CREATE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_user_locations_user_id ON user_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_locations_created_at ON user_locations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_locations_active ON user_locations(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_vehicle_locations_cheetah_id ON vehicle_locations(cheetah_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_locations_created_at ON vehicle_locations(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_journey_locations_journey_id ON journey_locations(journey_id);
CREATE INDEX IF NOT EXISTS idx_journey_locations_created_at ON journey_locations(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_flight_tracking_icao24 ON flight_tracking(icao24);
CREATE INDEX IF NOT EXISTS idx_flight_tracking_callsign ON flight_tracking(callsign);
CREATE INDEX IF NOT EXISTS idx_flight_tracking_created_at ON flight_tracking(created_at DESC);

-- ============================================================================
-- 4. CREATE/REPLACE FUNCTIONS
-- ============================================================================

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
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION get_journey_location_trail(journey_uuid UUID)
RETURNS TABLE (
  latitude NUMERIC,
  longitude NUMERIC,
  accuracy NUMERIC,
  created_at TIMESTAMPTZ
) AS $$
  SELECT 
    latitude,
    longitude,
    accuracy,
    created_at
  FROM journey_locations
  WHERE journey_id = journey_uuid
  ORDER BY created_at ASC;
$$ LANGUAGE sql STABLE;

-- ============================================================================
-- 5. ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE user_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE flight_tracking ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6. CREATE POLICIES (after dropping old ones above)
-- ============================================================================

-- User Locations Policies
CREATE POLICY "Users can view all user locations"
  ON user_locations FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert their own location"
  ON user_locations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own location"
  ON user_locations FOR UPDATE
  USING (auth.uid() = user_id);

-- Vehicle Locations Policies
CREATE POLICY "Authenticated users can view vehicle locations"
  ON vehicle_locations FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins and TOs can manage vehicle locations"
  ON vehicle_locations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'tango_oscar', 'head_tango_oscar')
    )
  );

-- Journey Locations Policies
CREATE POLICY "Authenticated users can view journey locations"
  ON journey_locations FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins and DOs can manage journey locations"
  ON journey_locations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'captain', 'head_of_command', 'delta_oscar')
    )
  );

-- Flight Tracking Policies
CREATE POLICY "Authenticated users can view flight tracking"
  ON flight_tracking FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage flight tracking"
  ON flight_tracking FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'captain', 'alpha_oscar')
    )
  );

-- ============================================================================
-- 7. ENABLE REALTIME (conditionally)
-- ============================================================================

DO $$
BEGIN
  -- Add user_locations to realtime if not already added
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'user_locations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE user_locations;
  END IF;

  -- Add vehicle_locations to realtime if not already added
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'vehicle_locations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE vehicle_locations;
  END IF;

  -- Add journey_locations to realtime if not already added
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'journey_locations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE journey_locations;
  END IF;
END $$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Location tracking migration completed successfully!';
  RAISE NOTICE 'Tables created: user_locations, vehicle_locations, journey_locations, flight_tracking';
  RAISE NOTICE 'Functions created: get_active_user_locations, upsert_user_location';
  RAISE NOTICE 'Realtime enabled for location tables';
  RAISE NOTICE '============================================================================';
END $$;
