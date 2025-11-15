-- ============================================================================
-- TCNP JOURNEY MANAGEMENT - SEED DATA
-- ============================================================================
-- Run this script AFTER DATABASE_SCHEMA.sql
-- This will populate your database with realistic sample data
-- ============================================================================

-- ============================================================================
-- IMPORTANT: Create Super Admin User First
-- ============================================================================
-- You need to create the super admin user in Supabase Auth first
-- Go to Authentication > Users > Add User
-- Email: doriazowan@gmail.com
-- Password: &DannyDev1&
-- Then run this script

-- Insert Super Admin into users table (replace the UUID with actual auth.users id)
-- This will be done via the application signup, but we'll insert a placeholder

-- ============================================================================
-- EAGLE SQUARES (Airports)
-- ============================================================================

INSERT INTO eagle_squares (name, code, city, country, contact, latitude, longitude, notes) VALUES
  ('Murtala Muhammed International Airport Terminal 1', 'MM1', 'Lagos', 'Nigeria', '+234-1-2790000', 6.5774, 3.3213, 'Main international terminal - Most international flights'),
  ('Murtala Muhammed International Airport Terminal 2', 'MM2', 'Lagos', 'Nigeria', '+234-1-2790000', 6.5774, 3.3213, 'Domestic terminal - Local flights');

-- ============================================================================
-- NESTS (Hotels)
-- ============================================================================

INSERT INTO nests (name, address, city, contact, latitude, longitude, room_assignments) VALUES
  ('Eko Hotel & Suites', '1415 Adetokunbo Ademola Street, Victoria Island', 'Lagos', '+234-1-2770000', 6.4281, 3.4219, '[]'),
  ('The Wheatbaker', '4 Onitolo Road, Ikoyi', 'Lagos', '+234-1-2774000', 6.4541, 3.4316, '[]'),
  ('Radisson Blu Anchorage Hotel', '1A Ozumba Mbadiwe Avenue, Victoria Island', 'Lagos', '+234-1-2772800', 6.4281, 3.4219, '[]');

-- ============================================================================
-- THEATRES (Venues)
-- ============================================================================

INSERT INTO theatres (name, address, city, gate_instructions, contact, capacity, latitude, longitude) VALUES
  ('The Covenant Nation Sanctuary', 'Plot 20, Billings Way, Oregun', 'Lagos', 'Use Gate A for VIP entrance. Security will be notified.', '+234-1-8888888', 5000, 6.5833, 3.3500),
  ('Faith Tabernacle', 'Km 10, Idiroko Road, Canaan Land, Ota', 'Ogun', 'Main gate entrance. Protocol officers stationed at gate.', '+234-1-7777777', 50000, 6.6833, 3.1833);

-- ============================================================================
-- CHEETAHS (Vehicles)
-- ============================================================================

INSERT INTO cheetahs (reg_no, driver_name, driver_phone, capacity, vehicle_type, current_status, fuel_status, last_latitude, last_longitude) VALUES
  ('LAG-001-AA', 'Emmanuel Okafor', '+2348012345601', 4, 'Toyota Camry', 'idle', 100, 6.4541, 3.4316),
  ('LAG-002-AB', 'David Adeleke', '+2348012345602', 6, 'Toyota Hiace', 'idle', 95, 6.4541, 3.4316),
  ('LAG-003-AC', 'Michael Adeyemi', '+2348012345603', 4, 'Mercedes E-Class', 'idle', 100, 6.4541, 3.4316),
  ('LAG-004-AD', 'John Okonkwo', '+2348012345604', 4, 'Toyota Camry', 'idle', 90, 6.4541, 3.4316),
  ('LAG-005-AE', 'Peter Nwankwo', '+2348012345605', 6, 'Toyota Hiace', 'maintenance', 80, 6.4541, 3.4316);

-- ============================================================================
-- PAPAS (Guests/Ministers)
-- ============================================================================

INSERT INTO papas (
  title, full_name, short_bio, nationality, passport_number, phone, email,
  arrival_country, arrival_city, flight_number, flight_provider,
  flight_departure_time, flight_arrival_time,
  needs, presentation_style, is_first_time, past_invites_count, tags
) VALUES
  (
    'Rev.', 'Emmanuel Akpere', 
    'Senior Pastor and renowned teacher with over 20 years of ministry experience. Known for powerful prophetic ministry.',
    'Nigeria', 'NGA1234567', '+2347012345678', 'rev.emmanuel@example.com',
    'Nigeria', 'Lagos', 'DA123', 'Dana Air',
    '2025-12-15 08:00:00+01', '2025-12-15 09:30:00+01',
    '{"water": true, "face_towels": true, "meal_pref": "Vegetarian", "stage_props": ["wireless_mic", "podium"], "special_requests": "Prefers room on lower floor"}',
    'Sermon with altar call', false, 3, ARRAY['VIP', 'International Speaker']
  ),
  (
    'Pastor', 'Grace Adeyemi',
    'Dynamic worship leader and conference speaker. Specializes in youth ministry and leadership development.',
    'Nigeria', 'NGA2345678', '+2348023456789', 'pastor.grace@example.com',
    'Nigeria', 'Abuja', 'AI456', 'Arik Air',
    '2025-12-15 10:00:00+01', '2025-12-15 11:15:00+01',
    '{"water": true, "face_towels": true, "meal_pref": "No restrictions", "stage_props": ["handheld_mic", "music_stand"], "special_requests": "Needs sound check 1 hour before"}',
    'Interactive teaching with Q&A', true, 0, ARRAY['First Time', 'Worship Leader']
  ),
  (
    'Bishop', 'Samuel Okonkwo',
    'Presiding Bishop with extensive international ministry. Author of 5 bestselling Christian books.',
    'Nigeria', 'NGA3456789', '+2348034567890', 'bishop.samuel@example.com',
    'USA', 'Atlanta', 'DL5678', 'Delta Airlines',
    '2025-12-14 18:00:00-05', '2025-12-15 14:30:00+01',
    '{"water": true, "face_towels": true, "meal_pref": "Pescatarian", "stage_props": ["wireless_mic", "chair", "table"], "special_requests": "Requires private prayer room"}',
    'Expository teaching', false, 5, ARRAY['VIP', 'International', 'Author']
  ),
  (
    'Dr.', 'Faith Nwosu',
    'Christian counselor and family therapist. Doctorate in Pastoral Psychology.',
    'Nigeria', 'NGA4567890', '+2348045678901', 'dr.faith@example.com',
    'Nigeria', 'Port Harcourt', 'AI789', 'Arik Air',
    '2025-12-15 12:00:00+01', '2025-12-15 13:30:00+01',
    '{"water": true, "face_towels": true, "meal_pref": "Vegetarian", "stage_props": ["handheld_mic", "chair"], "special_requests": "Prefers afternoon sessions"}',
    'Workshop style with breakout sessions', false, 2, ARRAY['Local', 'Counselor']
  ),
  (
    'Apostle', 'James Eze',
    'Church planter and apostolic leader overseeing 50+ churches across West Africa.',
    'Nigeria', 'NGA5678901', '+2348056789012', 'apostle.james@example.com',
    'Ghana', 'Accra', 'ET234', 'Ethiopian Airlines',
    '2025-12-15 06:00:00+00', '2025-12-15 12:00:00+01',
    '{"water": true, "face_towels": true, "meal_pref": "No pork", "stage_props": ["wireless_mic", "podium", "projector"], "special_requests": "Needs laptop connection for presentation"}',
    'Teaching with PowerPoint presentation', false, 4, ARRAY['International', 'Apostolic']
  ),
  (
    'Evangelist', 'Ruth Adebayo',
    'Fiery evangelist with a passion for soul winning. Leads crusades across Nigeria.',
    'Nigeria', 'NGA6789012', '+2348067890123', 'evang.ruth@example.com',
    'Nigeria', 'Lagos', 'Local', 'Road',
    NULL, '2025-12-15 15:00:00+01',
    '{"water": true, "face_towels": true, "meal_pref": "No restrictions", "stage_props": ["wireless_mic"], "special_requests": "Prefers evening sessions"}',
    'Evangelistic message with altar call', true, 0, ARRAY['First Time', 'Evangelist', 'Local']
  );

-- ============================================================================
-- USERS (Protocol Officers) - These will be created via auth signup
-- ============================================================================
-- Note: Users must first be created in Supabase Auth, then their profiles
-- will be automatically created via triggers or application logic
-- The following is a reference for the users that should be created:

-- Super Admin: doriazowan@gmail.com (already mentioned)
-- Password: &DannyDev1&

-- Additional users to create via the application:
-- 1. Captain John - captain@tcnp.org - Captain
-- 2. Sarah Williams - sarah.w@tcnp.org - Head of Command
-- 3. David Chen - david.c@tcnp.org - Delta Oscar
-- 4. Mary Johnson - mary.j@tcnp.org - Delta Oscar
-- 5. Robert Brown - robert.b@tcnp.org - Tango Oscar (Head)
-- 6. Lisa Anderson - lisa.a@tcnp.org - November Oscar
-- 7. James Wilson - james.w@tcnp.org - Victor Oscar
-- 8. Patricia Moore - patricia.m@tcnp.org - Alpha Oscar

-- ============================================================================
-- SAMPLE JOURNEYS
-- ============================================================================
-- Note: These will reference user IDs that need to be created first
-- For now, we'll create journeys without assigned DOs
-- You can update them after creating users

-- Get Papa IDs for reference
DO $$
DECLARE
  papa1_id UUID;
  papa2_id UUID;
  papa3_id UUID;
  papa4_id UUID;
  cheetah1_id UUID;
  cheetah2_id UUID;
  cheetah3_id UUID;
  nest1_id UUID;
  nest2_id UUID;
  theatre1_id UUID;
  eagle1_id UUID;
  eagle2_id UUID;
BEGIN
  -- Get IDs
  SELECT id INTO papa1_id FROM papas WHERE full_name = 'Emmanuel Akpere';
  SELECT id INTO papa2_id FROM papas WHERE full_name = 'Grace Adeyemi';
  SELECT id INTO papa3_id FROM papas WHERE full_name = 'Samuel Okonkwo';
  SELECT id INTO papa4_id FROM papas WHERE full_name = 'Faith Nwosu';
  SELECT id INTO cheetah1_id FROM cheetahs WHERE reg_no = 'LAG-001-AA';
  SELECT id INTO cheetah2_id FROM cheetahs WHERE reg_no = 'LAG-002-AB';
  SELECT id INTO cheetah3_id FROM cheetahs WHERE reg_no = 'LAG-003-AC';
  SELECT id INTO nest1_id FROM nests WHERE name = 'Eko Hotel & Suites';
  SELECT id INTO nest2_id FROM nests WHERE name = 'The Wheatbaker';
  SELECT id INTO theatre1_id FROM theatres WHERE name = 'The Covenant Nation Sanctuary';
  SELECT id INTO eagle1_id FROM eagle_squares WHERE code = 'MM1';
  SELECT id INTO eagle2_id FROM eagle_squares WHERE code = 'MM2';

  -- Journey 1: Planned - Papa arriving tomorrow
  INSERT INTO journeys (
    papa_id, status, eta, etd, origin, destination,
    assigned_cheetah_id, assigned_nest_id, assigned_theatre_id, assigned_eagle_square_id,
    telemetry_enabled, notes
  ) VALUES (
    papa1_id, 'planned', 
    '2025-12-15 09:30:00+01', NULL,
    'MM1 Airport', 'Eko Hotel & Suites',
    cheetah1_id, nest1_id, theatre1_id, eagle1_id,
    true, 'VIP guest - ensure smooth pickup'
  );

  -- Journey 2: At Nest - Papa checked in
  INSERT INTO journeys (
    papa_id, status, current_call_sign, eta, etd,
    origin, destination,
    assigned_cheetah_id, assigned_nest_id, assigned_theatre_id,
    telemetry_enabled, notes
  ) VALUES (
    papa2_id, 'at_nest', NULL,
    '2025-12-15 16:00:00+01', '2025-12-15 15:00:00+01',
    'The Wheatbaker', 'The Covenant Nation Sanctuary',
    cheetah2_id, nest2_id, theatre1_id,
    true, 'First time guest - assign experienced DO'
  );

  -- Journey 3: Enroute to Theatre
  INSERT INTO journeys (
    papa_id, status, current_call_sign, eta, etd,
    origin, destination,
    assigned_cheetah_id, assigned_nest_id, assigned_theatre_id,
    last_latitude, last_longitude, last_location_update,
    telemetry_enabled, notes
  ) VALUES (
    papa3_id, 'enroute_to_theatre', 'First Course',
    '2025-12-15 16:30:00+01', '2025-12-15 15:45:00+01',
    'Eko Hotel & Suites', 'The Covenant Nation Sanctuary',
    cheetah3_id, nest1_id, theatre1_id,
    6.5000, 3.3800, NOW(),
    true, 'International guest - high priority'
  );

  -- Journey 4: Scheduled for later
  INSERT INTO journeys (
    papa_id, status, eta, etd,
    origin, destination,
    assigned_nest_id, assigned_theatre_id, assigned_eagle_square_id,
    telemetry_enabled, notes
  ) VALUES (
    papa4_id, 'scheduled',
    '2025-12-15 13:30:00+01', NULL,
    'MM2 Airport', 'Radisson Blu Anchorage Hotel',
    nest1_id, theatre1_id, eagle2_id,
    true, 'Domestic flight - confirm arrival time'
  );

  RAISE NOTICE 'Sample journeys created successfully!';
END $$;

-- ============================================================================
-- SAMPLE JOURNEY EVENTS
-- ============================================================================

-- Add some historical events for the enroute journey
DO $$
DECLARE
  journey_id UUID;
BEGIN
  SELECT id INTO journey_id FROM journeys WHERE status = 'enroute_to_theatre' LIMIT 1;
  
  IF journey_id IS NOT NULL THEN
    INSERT INTO journey_events (journey_id, event_type, latitude, longitude, notes, created_at) VALUES
      (journey_id, 'First Course', 6.4281, 3.4219, 'Departed from Eko Hotel', NOW() - INTERVAL '15 minutes'),
      (journey_id, 'Cocktail', 6.4500, 3.4000, 'In transit - smooth traffic', NOW() - INTERVAL '10 minutes');
    
    RAISE NOTICE 'Sample journey events created!';
  END IF;
END $$;

-- ============================================================================
-- SAMPLE INCIDENTS
-- ============================================================================

INSERT INTO incidents (
  type, severity, description, latitude, longitude, status
) VALUES
  ('Traffic Delay', 'low', 'Minor traffic on Third Mainland Bridge. Estimated 10 minute delay.', 6.4833, 3.3833, 'resolved'),
  ('Vehicle Issue', 'medium', 'Cheetah LAG-005-AE reported AC malfunction. Vehicle sent for maintenance.', 6.4541, 3.4316, 'resolved');

-- ============================================================================
-- SAMPLE TELEMETRY DATA (for the active journey)
-- ============================================================================

DO $$
DECLARE
  journey_id UUID;
  cheetah_id UUID;
BEGIN
  SELECT j.id, j.assigned_cheetah_id INTO journey_id, cheetah_id 
  FROM journeys j 
  WHERE j.status = 'enroute_to_theatre' 
  LIMIT 1;
  
  IF journey_id IS NOT NULL THEN
    -- Simulate telemetry points along the route
    INSERT INTO telemetry_data (journey_id, cheetah_id, latitude, longitude, speed, heading, timestamp) VALUES
      (journey_id, cheetah_id, 6.4281, 3.4219, 0, 90, NOW() - INTERVAL '15 minutes'),
      (journey_id, cheetah_id, 6.4350, 3.4150, 45, 95, NOW() - INTERVAL '12 minutes'),
      (journey_id, cheetah_id, 6.4420, 3.4080, 50, 92, NOW() - INTERVAL '9 minutes'),
      (journey_id, cheetah_id, 6.4500, 3.4000, 48, 88, NOW() - INTERVAL '6 minutes'),
      (journey_id, cheetah_id, 6.4580, 3.3920, 52, 90, NOW() - INTERVAL '3 minutes'),
      (journey_id, cheetah_id, 6.5000, 3.3800, 45, 85, NOW());
    
    RAISE NOTICE 'Sample telemetry data created!';
  END IF;
END $$;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Seed data inserted successfully!';
  RAISE NOTICE '';
  RAISE NOTICE 'IMPORTANT NEXT STEPS:';
  RAISE NOTICE '1. Create users in Supabase Auth (Authentication > Users)';
  RAISE NOTICE '2. First user to create: doriazowan@gmail.com with password: &DannyDev1&';
  RAISE NOTICE '3. After creating users, update journeys to assign Delta Oscars';
  RAISE NOTICE '4. Configure storage buckets for avatars and documents';
  RAISE NOTICE '5. Enable real-time replication for required tables';
  RAISE NOTICE '';
  RAISE NOTICE 'Sample Data Created:';
  RAISE NOTICE '- 2 Eagle Squares (Airports)';
  RAISE NOTICE '- 3 Nests (Hotels)';
  RAISE NOTICE '- 2 Theatres (Venues)';
  RAISE NOTICE '- 5 Cheetahs (Vehicles)';
  RAISE NOTICE '- 6 Papas (Guests)';
  RAISE NOTICE '- 4 Sample Journeys';
  RAISE NOTICE '- Journey Events and Telemetry Data';
  RAISE NOTICE '============================================================================';
END $$;
