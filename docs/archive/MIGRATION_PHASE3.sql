-- ============================================================================
-- TCNP JOURNEY MANAGEMENT - PHASE 3 MIGRATION
-- ============================================================================
-- This migration adds:
-- 1. Programs table and relationships
-- 2. Fuel status and program_id to cheetahs
-- 3. User management enhancements (full_name, phone, oscar)
-- 4. Updated Super Admin profile
-- 5. Fresh seed data
-- ============================================================================

-- ============================================================================
-- 1. CREATE PROGRAMS TABLE
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
-- 2. ADD PROGRAM RELATIONSHIPS TO EXISTING TABLES
-- ============================================================================

-- Add program_id to cheetahs
ALTER TABLE cheetahs ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES programs(id) ON DELETE SET NULL;
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
-- 3. ENHANCE USERS TABLE FOR PROTOCOL OFFICERS
-- ============================================================================

-- Add full_name and phone to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS oscar TEXT; -- Officer call sign

-- Add user management fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS activation_status TEXT DEFAULT 'pending' CHECK (activation_status IN ('pending', 'active', 'deactivated'));

-- Update existing users to be active
UPDATE users SET activation_status = 'active', is_active = true WHERE activation_status IS NULL OR activation_status = 'pending';

-- ============================================================================
-- 4. UPDATE SUPER ADMIN PROFILE
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
-- 5. CREATE LOCATION TRACKING TABLE FOR VEHICLES
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
-- 6. CREATE FLIGHT TRACKING TABLE
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
-- 7. INSERT SAMPLE PROGRAMS
-- ============================================================================

INSERT INTO programs (name, description, start_date, end_date, status) VALUES
  ('Presidential Visit 2024', 'State visit and official ceremony', '2024-12-01', '2024-12-03', 'planning'),
  ('Annual Conference 2024', 'Year-end conference and awards', '2024-12-15', '2024-12-20', 'planning'),
  ('Diplomatic Summit', 'International diplomatic meeting', '2025-01-10', '2025-01-12', 'planning')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 8. INSERT SAMPLE PAPAS (GUESTS)
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
-- 9. INSERT SAMPLE CHEETAHS (VEHICLES)
-- ============================================================================

INSERT INTO cheetahs (call_sign, registration_number, make, model, year, color, status, capacity, fuel_status) VALUES
  ('CHT-001', 'ABC-123-XY', 'Toyota', 'Land Cruiser', 2023, 'Black', 'available', 6, 'full'),
  ('CHT-002', 'ABC-124-XY', 'Mercedes', 'S-Class', 2024, 'Black', 'available', 4, 'full'),
  ('CHT-003', 'ABC-125-XY', 'Toyota', 'Camry', 2023, 'Silver', 'available', 4, 'three_quarters'),
  ('CHT-004', 'ABC-126-XY', 'Toyota', 'Hiace', 2022, 'White', 'maintenance', 12, 'half'),
  ('CHT-005', 'ABC-127-XY', 'BMW', '7 Series', 2024, 'Black', 'available', 4, 'full')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 10. INSERT SAMPLE AIRPORTS
-- ============================================================================

INSERT INTO eagle_squares (name, code, city, country, latitude, longitude) VALUES
  ('Nnamdi Azikiwe International Airport', 'ABV', 'Abuja', 'Nigeria', 9.0065, 7.2631),
  ('Murtala Muhammed International Airport', 'LOS', 'Lagos', 'Nigeria', 6.5774, 3.3213),
  ('Port Harcourt International Airport', 'PHC', 'Port Harcourt', 'Nigeria', 5.0155, 6.9496)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 11. INSERT SAMPLE HOTELS
-- ============================================================================

INSERT INTO nests (name, address, city, phone, email, rating, amenities) VALUES
  ('Transcorp Hilton', '1 Aguiyi Ironsi Street, Maitama', 'Abuja', '+234-9-4617000', 'info@transcorphotels.com', 5, 'Pool, Gym, Spa, Restaurant, Conference rooms'),
  ('Eko Hotel & Suites', '1415 Adetokunbo Ademola Street, Victoria Island', 'Lagos', '+234-1-2770000', 'info@ekohotels.com', 5, 'Pool, Gym, Multiple restaurants, Event halls'),
  ('Sheraton Abuja', 'Ladi Kwali Way, Maitama', 'Abuja', '+234-9-4612000', 'info@sheratonabuja.com', 5, 'Pool, Gym, Business center, Restaurant')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 12. INSERT SAMPLE VENUES
-- ============================================================================

INSERT INTO theatres (name, address, city, capacity, venue_type, facilities) VALUES
  ('Aso Rock Villa', 'Three Arms Zone', 'Abuja', 500, 'Government Building', 'Security checkpoints, VIP lounge, Press room'),
  ('International Conference Centre', 'Central Business District', 'Abuja', 5000, 'Conference Center', 'Multiple halls, AV equipment, Parking'),
  ('National Theatre', 'Iganmu', 'Lagos', 3000, 'Theatre', 'Stage, Backstage, Dressing rooms, Parking')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 13. CREATE FUNCTION TO AUTO-UPDATE TIMESTAMPS
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
-- 14. GRANT PERMISSIONS
-- ============================================================================

-- Grant access to authenticated users
GRANT ALL ON programs TO authenticated;
GRANT ALL ON vehicle_locations TO authenticated;
GRANT ALL ON flight_tracking TO authenticated;

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
