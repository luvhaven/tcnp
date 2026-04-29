-- ============================================================================
-- TCNP JOURNEY MANAGEMENT - PHASE 3 MIGRATION (FIXED)
-- ============================================================================
-- This migration adds:
-- 1. Missing columns to papas table (organization, position, vip_level)
-- 2. Programs table and relationships
-- 3. Fuel status and program_id to cheetahs
-- 4. User management enhancements (full_name, phone, oscar)
-- 5. Vehicle and flight tracking tables
-- 6. Updated Super Admin profile
-- 7. Fresh seed data
-- ============================================================================

-- ============================================================================
-- 1. ADD MISSING COLUMNS TO PAPAS TABLE
-- ============================================================================

ALTER TABLE papas ADD COLUMN IF NOT EXISTS organization TEXT;
ALTER TABLE papas ADD COLUMN IF NOT EXISTS position TEXT;
ALTER TABLE papas ADD COLUMN IF NOT EXISTS vip_level TEXT DEFAULT 'vip' CHECK (vip_level IN ('vip', 'vvip', 'regular'));
ALTER TABLE papas ADD COLUMN IF NOT EXISTS special_requirements TEXT;

-- ============================================================================
-- 2. CREATE PROGRAMS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS programs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  theatre_id UUID REFERENCES theatres(id) ON DELETE SET NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'completed', 'archived')),
  budget DECIMAL(15,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_programs_status ON programs(status);
CREATE INDEX IF NOT EXISTS idx_programs_theatre ON programs(theatre_id);

-- ============================================================================
-- 3. ADD PROGRAM RELATIONSHIPS TO EXISTING TABLES
-- ============================================================================

-- Add program_id to cheetahs
ALTER TABLE cheetahs ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES programs(id) ON DELETE SET NULL;

-- Drop the old INTEGER fuel_status column if it exists and create new TEXT column
DO $$ 
BEGIN
  -- Check if fuel_status exists as INTEGER and drop it
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'cheetahs' 
    AND column_name = 'fuel_status' 
    AND data_type = 'integer'
  ) THEN
    ALTER TABLE cheetahs DROP COLUMN fuel_status;
  END IF;
END $$;

-- Add fuel_status as TEXT
ALTER TABLE cheetahs ADD COLUMN IF NOT EXISTS fuel_status TEXT DEFAULT 'full' CHECK (fuel_status IN ('full', 'three_quarters', 'half', 'quarter', 'empty'));

-- Add program_id to journeys
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES programs(id) ON DELETE SET NULL;

-- Add program_id to papas
ALTER TABLE papas ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES programs(id) ON DELETE SET NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_cheetahs_program ON cheetahs(program_id);
CREATE INDEX IF NOT EXISTS idx_journeys_program ON journeys(program_id);
CREATE INDEX IF NOT EXISTS idx_papas_program ON papas(program_id);

-- ============================================================================
-- 4. ENHANCE USERS TABLE FOR PROTOCOL OFFICERS
-- ============================================================================

-- Add full_name and phone to users table (if not already present)
-- Note: users table already has full_name in schema, but adding IF NOT EXISTS for safety
ALTER TABLE users ADD COLUMN IF NOT EXISTS oscar TEXT; -- Officer call sign

-- Add user management fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS activation_status TEXT DEFAULT 'active' CHECK (activation_status IN ('pending', 'active', 'deactivated'));

-- Update existing users to be active
UPDATE users SET activation_status = 'active' WHERE activation_status IS NULL;

-- ============================================================================
-- 5. UPDATE SUPER ADMIN PROFILE
-- ============================================================================

-- Update Super Admin user (replace with actual auth.users id after signup)
-- This assumes the super admin has already signed up with email: doriazowan@gmail.com
UPDATE users 
SET 
  full_name = 'Daniel Oriazowan',
  phone = '+2348026381777',
  oscar = 'OSCAR-ALPHA',
  activation_status = 'active',
  is_active = true
WHERE email = 'doriazowan@gmail.com';

-- ============================================================================
-- 6. CREATE LOCATION TRACKING TABLE FOR VEHICLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS vehicle_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cheetah_id UUID NOT NULL REFERENCES cheetahs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- DO tracking this vehicle
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  accuracy DECIMAL(10, 2), -- GPS accuracy in meters
  speed DECIMAL(10, 2), -- Speed in km/h
  heading DECIMAL(5, 2), -- Direction in degrees (0-360)
  altitude DECIMAL(10, 2), -- Altitude in meters
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_locations_cheetah ON vehicle_locations(cheetah_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_locations_timestamp ON vehicle_locations(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_locations_user ON vehicle_locations(user_id);

-- ============================================================================
-- 7. CREATE FLIGHT TRACKING TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS flight_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  papa_id UUID REFERENCES papas(id) ON DELETE CASCADE,
  flight_number TEXT NOT NULL,
  icao24 TEXT, -- Aircraft transponder code from OpenSky
  callsign TEXT,
  origin_country TEXT,
  departure_airport TEXT,
  arrival_airport TEXT,
  scheduled_departure TIMESTAMPTZ,
  scheduled_arrival TIMESTAMPTZ,
  actual_departure TIMESTAMPTZ,
  estimated_arrival TIMESTAMPTZ,
  current_latitude DECIMAL(10, 8),
  current_longitude DECIMAL(11, 8),
  altitude DECIMAL(10, 2),
  velocity DECIMAL(10, 2),
  heading DECIMAL(5, 2),
  status TEXT, -- 'scheduled', 'departed', 'in_air', 'landed', 'delayed', 'cancelled'
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flight_tracking_papa ON flight_tracking(papa_id);
CREATE INDEX IF NOT EXISTS idx_flight_tracking_flight ON flight_tracking(flight_number);
CREATE INDEX IF NOT EXISTS idx_flight_tracking_status ON flight_tracking(status);

-- ============================================================================
-- 8. INSERT SAMPLE PROGRAMS
-- ============================================================================

INSERT INTO programs (name, description, start_date, end_date, status) VALUES
  ('Presidential Visit 2024', 'State visit and official ceremony', '2024-12-01', '2024-12-03', 'planning'),
  ('Annual Conference 2024', 'Year-end conference and awards', '2024-12-15', '2024-12-20', 'planning'),
  ('Diplomatic Summit', 'International diplomatic meeting', '2025-01-10', '2025-01-12', 'planning')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 9. INSERT SAMPLE PAPAS (GUESTS) - USING CORRECT COLUMNS
-- ============================================================================

INSERT INTO papas (title, full_name, organization, position, vip_level, phone, email, special_requirements) VALUES
  ('Hon.', 'Minister John Okafor', 'Federal Ministry of Finance', 'Minister', 'vvip', '+2348012345601', 'minister.okafor@gov.ng', 'Requires security detail'),
  ('Dr.', 'Sarah Adeyemi', 'Ministry of Health', 'Permanent Secretary', 'vip', '+2348012345602', 'dr.adeyemi@health.gov.ng', 'Dietary restrictions: Vegetarian'),
  ('Prof.', 'Ibrahim Mohammed', 'University of Lagos', 'Vice Chancellor', 'vip', '+2348012345603', 'prof.ibrahim@unilag.edu.ng', NULL),
  ('Chief', 'Emeka Nwosu', 'Traditional Council', 'Traditional Ruler', 'vvip', '+2348012345604', 'chief.nwosu@council.org', 'Requires traditional protocol'),
  ('Mrs.', 'Grace Okonkwo', 'Women Affairs Commission', 'Commissioner', 'vip', '+2348012345605', 'grace.okonkwo@wac.gov.ng', NULL),
  ('Amb.', 'David Adeleke', 'Foreign Affairs', 'Ambassador', 'vvip', '+2348012345606', 'amb.adeleke@foreign.gov.ng', 'International protocol required')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 10. UPDATE CHEETAHS TABLE - ADD MISSING COLUMNS
-- ============================================================================

-- Add columns that match the Cheetahs page expectations
ALTER TABLE cheetahs ADD COLUMN IF NOT EXISTS call_sign TEXT;
ALTER TABLE cheetahs ADD COLUMN IF NOT EXISTS registration_number TEXT;
ALTER TABLE cheetahs ADD COLUMN IF NOT EXISTS make TEXT;
ALTER TABLE cheetahs ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE cheetahs ADD COLUMN IF NOT EXISTS year INTEGER;
ALTER TABLE cheetahs ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE cheetahs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'available';
ALTER TABLE cheetahs ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 4;

-- Create unique index on call_sign if it doesn't exist
CREATE UNIQUE INDEX IF NOT EXISTS idx_cheetahs_call_sign ON cheetahs(call_sign);

-- Sync registration_number with reg_no for existing records
UPDATE cheetahs SET registration_number = reg_no WHERE registration_number IS NULL AND reg_no IS NOT NULL;
UPDATE cheetahs SET reg_no = registration_number WHERE reg_no IS NULL AND registration_number IS NOT NULL;

-- ============================================================================
-- 11. INSERT SAMPLE CHEETAHS (VEHICLES) - USING CORRECT COLUMNS
-- ============================================================================

-- Note: Inserting into both reg_no (schema) and registration_number (app expects)
INSERT INTO cheetahs (call_sign, reg_no, registration_number, make, model, year, color, status, capacity, fuel_status, driver_name, driver_phone) VALUES
  ('CHT-001', 'ABC-123-XY', 'ABC-123-XY', 'Toyota', 'Land Cruiser', 2023, 'Black', 'available', 6, 'full', 'John Driver', '+2348011111111'),
  ('CHT-002', 'ABC-124-XY', 'ABC-124-XY', 'Mercedes', 'S-Class', 2024, 'Black', 'available', 4, 'full', 'Mary Driver', '+2348022222222'),
  ('CHT-003', 'ABC-125-XY', 'ABC-125-XY', 'Toyota', 'Camry', 2023, 'Silver', 'available', 4, 'three_quarters', 'Peter Driver', '+2348033333333'),
  ('CHT-004', 'ABC-126-XY', 'ABC-126-XY', 'Toyota', 'Hiace', 2022, 'White', 'maintenance', 12, 'half', 'Grace Driver', '+2348044444444'),
  ('CHT-005', 'ABC-127-XY', 'ABC-127-XY', 'BMW', '7 Series', 2024, 'Black', 'available', 4, 'full', 'David Driver', '+2348055555555')
ON CONFLICT (call_sign) DO NOTHING;

-- ============================================================================
-- 12. INSERT SAMPLE AIRPORTS (IF NOT EXISTS)
-- ============================================================================

INSERT INTO eagle_squares (name, code, city, country, latitude, longitude) VALUES
  ('Nnamdi Azikiwe International Airport', 'ABV', 'Abuja', 'Nigeria', 9.0065, 7.2631),
  ('Murtala Muhammed International Airport', 'LOS', 'Lagos', 'Nigeria', 6.5774, 3.3213),
  ('Port Harcourt International Airport', 'PHC', 'Port Harcourt', 'Nigeria', 5.0155, 6.9496)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 13. INSERT SAMPLE HOTELS (IF NOT EXISTS)
-- ============================================================================

INSERT INTO nests (name, address, city, contact) VALUES
  ('Transcorp Hilton', '1 Aguiyi Ironsi Street, Maitama', 'Abuja', '+234-9-4617000'),
  ('Eko Hotel & Suites', '1415 Adetokunbo Ademola Street, Victoria Island', 'Lagos', '+234-1-2770000'),
  ('Sheraton Abuja', 'Ladi Kwali Way, Maitama', 'Abuja', '+234-9-4612000')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 14. INSERT SAMPLE VENUES (IF NOT EXISTS)
-- ============================================================================

INSERT INTO theatres (name, address, city, capacity) VALUES
  ('Aso Rock Villa', 'Three Arms Zone', 'Abuja', 500),
  ('International Conference Centre', 'Central Business District', 'Abuja', 5000),
  ('National Theatre', 'Iganmu', 'Lagos', 3000)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 15. CREATE FUNCTION TO AUTO-UPDATE TIMESTAMPS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for programs
DROP TRIGGER IF EXISTS update_programs_updated_at ON programs;
CREATE TRIGGER update_programs_updated_at 
  BEFORE UPDATE ON programs 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 16. GRANT PERMISSIONS
-- ============================================================================

-- Grant access to authenticated users
GRANT ALL ON programs TO authenticated;
GRANT ALL ON vehicle_locations TO authenticated;
GRANT ALL ON flight_tracking TO authenticated;

-- ============================================================================
-- 17. ENABLE RLS ON NEW TABLES
-- ============================================================================

ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE flight_tracking ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for programs
CREATE POLICY "All authenticated users can view programs"
  ON programs FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authorized users can manage programs"
  ON programs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'captain', 'head_of_command')
      AND is_active = true
    )
  );

-- Create RLS policies for vehicle_locations
CREATE POLICY "All authenticated users can view vehicle locations"
  ON vehicle_locations FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert vehicle locations"
  ON vehicle_locations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Create RLS policies for flight_tracking
CREATE POLICY "All authenticated users can view flight tracking"
  ON flight_tracking FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authorized users can manage flight tracking"
  ON flight_tracking FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'captain', 'alpha_oscar')
      AND is_active = true
    )
  );

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Verify the migration
SELECT 'Programs table created' as status, COUNT(*) as count FROM programs;
SELECT 'Papas inserted' as status, COUNT(*) as count FROM papas;
SELECT 'Cheetahs inserted' as status, COUNT(*) as count FROM cheetahs;
SELECT 'Eagle Squares inserted' as status, COUNT(*) as count FROM eagle_squares;
SELECT 'Nests inserted' as status, COUNT(*) as count FROM nests;
SELECT 'Theatres inserted' as status, COUNT(*) as count FROM theatres;

-- Show success message
DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'PHASE 3 MIGRATION COMPLETED SUCCESSFULLY!';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Created:';
  RAISE NOTICE '  - Programs table with 3 sample programs';
  RAISE NOTICE '  - Vehicle locations tracking table';
  RAISE NOTICE '  - Flight tracking table';
  RAISE NOTICE 'Added:';
  RAISE NOTICE '  - 6 Papas (Guests) with organization and position';
  RAISE NOTICE '  - 5 Cheetahs (Vehicles) with fuel status';
  RAISE NOTICE '  - 3 Airports, 3 Hotels, 3 Venues';
  RAISE NOTICE 'Enhanced:';
  RAISE NOTICE '  - Users table with OSCAR call signs';
  RAISE NOTICE '  - Papas table with VIP levels and organizations';
  RAISE NOTICE '  - Cheetahs table with fuel status and programs';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Refresh your application';
  RAISE NOTICE '  2. Dashboard should show 6 Papas and 5 Cheetahs';
  RAISE NOTICE '  3. Test all new features';
  RAISE NOTICE '============================================================================';
END $$;
