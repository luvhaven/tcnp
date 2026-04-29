-- ============================================================================
-- SEED_REAL_DATA.sql
-- Populates the database with realistic sample data for testing
-- ============================================================================

-- Clear existing data (optional: remove if you want to keep existing records)
TRUNCATE TABLE
  vehicle_locations,
  flight_tracking,
  journey_events,
  incidents,
  program_exports,
  chat_messages,
  title_assignments,
  cheetahs,
  nests,
  theatres,
  eagle_squares,
  papas,
  journeys,
  programs
  RESTART IDENTITY CASCADE;

-- Insert programs
INSERT INTO programs (id, name, description, start_date, end_date, status, theatre_id)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'The Covenant Nation Inauguration', 'Week-long inauguration events for dignitaries', '2025-01-10', '2025-01-17', 'active', NULL),
  ('22222222-2222-2222-2222-222222222222', 'Economic Summit 2025', 'International summit on economic resilience', '2025-02-05', '2025-02-12', 'planning', NULL),
  ('33333333-3333-3333-3333-333333333333', 'Leadership Masterclass', 'Closed-door leadership sessions for top executives', '2025-03-20', '2025-03-22', 'planning', NULL);

-- Insert theatres (venues)
INSERT INTO theatres (id, name, address, city, capacity, venue_type, facilities)
VALUES
  ('aaaaaaa1-0000-0000-0000-aaaaaaaa0001', 'Aso Rock Banquet Hall', 'Three Arms Zone', 'Abuja', 1200, 'Government Facility', 'Presidential security, VIP parking, helipad, conference suites'),
  ('aaaaaaa2-0000-0000-0000-aaaaaaaa0002', 'Eko Convention Center', '1415 Adetokunbo Ademola Street', 'Lagos', 5000, 'Convention Center', '5-star hospitality, multi-stage halls, secure parking'),
  ('aaaaaaa3-0000-0000-0000-aaaaaaaa0003', 'Civic Center', 'Ozumba Mbadiwe Ave', 'Lagos', 1500, 'Event Hall', 'Waterfront access, high-speed internet, media facilities');

-- Link programs to venues
UPDATE programs SET theatre_id = 'aaaaaaa1-0000-0000-0000-aaaaaaaa0001' WHERE id = '11111111-1111-1111-1111-111111111111';
UPDATE programs SET theatre_id = 'aaaaaaa2-0000-0000-0000-aaaaaaaa0002' WHERE id = '22222222-2222-2222-2222-222222222222';

-- Insert eagle squares (airports)
INSERT INTO eagle_squares (id, name, code, city, country, latitude, longitude, facilities)
VALUES
  ('bbbbbbb1-0000-0000-0000-bbbbbbbb0001', 'Nnamdi Azikiwe International Airport', 'ABV', 'Abuja', 'Nigeria', 9.0065, 7.2631, 'VIP lounge, Customs, Immigration, Presidential hangar'),
  ('bbbbbbb2-0000-0000-0000-bbbbbbbb0002', 'Murtala Muhammed International Airport', 'LOS', 'Lagos', 'Nigeria', 6.5774, 3.3211, 'Protocol lounges, private terminals, executive transit'),
  ('bbbbbbb3-0000-0000-0000-bbbbbbbb0003', 'Victor Attah International Airport', 'QUO', 'Uyo', 'Nigeria', 4.8720, 8.0935, 'Protocol processing, secured apron, VIP access');

-- Insert nests (hotels)
INSERT INTO nests (id, name, city, address, rating, facilities)
VALUES
  ('ccccccc1-0000-0000-0000-cccccccc0001', 'Transcorp Hilton Abuja', 'Abuja', '1 Aguiyi Ironsi St', 5, 'Executive suites, presidential floor, bulletproof transport'),
  ('ccccccc2-0000-0000-0000-cccccccc0002', 'Eko Hotels & Suites', 'Lagos', 'Adetokunbo Ademola St', 5, 'Ocean view suites, high-security concierge, helipad'),
  ('ccccccc3-0000-0000-0000-cccccccc0003', 'Ibom Icon Hotel & Golf Resort', 'Uyo', 'Nwaniba Road', 5, 'Private villas, 18-hole golf course, protocol coordination');

-- Insert journeys (event schedules)
INSERT INTO journeys (id, program_id, name, description, start_date, end_date, status)
VALUES
  ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'Inaugural Parade', 'Parade and state reception', '2025-01-10', '2025-01-11', 'active'),
  ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 'Presidential Gala Dinner', 'State dinner with visiting heads of state', '2025-01-14', '2025-01-14', 'planning'),
  ('66666666-6666-6666-6666-666666666666', '22222222-2222-2222-2222-222222222222', 'Economic Summit Opening', 'Opening ceremony and keynote', '2025-02-05', '2025-02-05', 'planning');

-- Insert papas (VIP guests)
INSERT INTO papas (id, program_id, full_name, title, country, arrival_date, departure_date, accommodations, entourage_size)
VALUES
  ('77777777-7777-7777-7777-777777777777', '11111111-1111-1111-1111-111111111111', 'His Excellency John Mensah', 'President of Ghana', 'Ghana', '2025-01-10', '2025-01-15', 'Transcorp Hilton Abuja', 12),
  ('88888888-8888-8888-8888-888888888888', '11111111-1111-1111-1111-111111111111', 'Her Excellency Dr. Amina Gawayo', 'Vice President of Kenya', 'Kenya', '2025-01-11', '2025-01-14', 'Transcorp Hilton Abuja', 8),
  ('99999999-9999-9999-9999-999999999999', '22222222-2222-2222-2222-222222222222', 'Mr. Richard Lawson', 'World Bank Country Director', 'USA', '2025-02-05', '2025-02-08', 'Eko Hotels & Suites', 4);

-- Insert cheetahs (transport vehicles)
INSERT INTO cheetahs (id, program_id, name, model, reg_no, registration_number, plate_number, capacity, driver_name, driver_phone, current_status)
VALUES
  ('ddddddd1-0000-0000-0000-dddddddd0001', '11111111-1111-1111-1111-111111111111', 'Alpha Convoy', 'Mercedes-Maybach S680', 'TCN-001', 'TCN-001', 'TCN-001', 4, 'James Okafor', '+2348011111111', 'active'),
  ('ddddddd2-0000-0000-0000-dddddddd0002', '11111111-1111-1111-1111-111111111111', 'Security Detail', 'Toyota Land Cruiser', 'TCN-112', 'TCN-112', 'TCN-112', 7, 'Sarah Bassey', '+2348022222222', 'active'),
  ('ddddddd3-0000-0000-0000-dddddddd0003', '22222222-2222-2222-2222-222222222222', 'Summit Shuttle', 'Mercedes Sprinter', 'TCN-210', 'TCN-210', 'TCN-210', 12, 'Akeem Sule', '+2348033333333', 'maintenance');

-- Insert title assignments for admin users
WITH admin_users AS (
  SELECT id, email FROM users WHERE email IN ('doriazowan@gmail.com', 'tcnpjourney@outlook.com')
)
INSERT INTO title_assignments (user_id, title_id, notes, is_active)
SELECT au.id, ot.id, 'System seeded assignment', true
FROM admin_users au
JOIN official_titles ot
  ON (
    (au.email = 'doriazowan@gmail.com' AND ot.code = 'COMMANDER_IN_CHIEF') OR
    (au.email = 'tcnpjourney@outlook.com' AND ot.code = 'COMMAND')
  )
ON CONFLICT (user_id, title_id, program_id) DO UPDATE SET is_active = true;

-- Insert vehicle locations (live tracking samples)
INSERT INTO vehicle_locations (id, user_id, latitude, longitude, speed, heading, accuracy, created_at)
SELECT
  gen_random_uuid(),
  u.id,
  9.0641 + (random() * 0.01),
  7.4893 + (random() * 0.01),
  (random() * 50)::numeric,
  (random() * 360)::numeric,
  5 + (random() * 10),
  NOW() - (random() * interval '2 hours')
FROM users u
WHERE u.role IN ('delta_oscar', 'tango_oscar')
LIMIT 10;

-- Insert flight tracking data
INSERT INTO flight_tracking (id, papa_id, flight_number, tail_number, airline, status, departure_airport_id, arrival_airport_id, scheduled_departure, scheduled_arrival)
VALUES
  (gen_random_uuid(), '77777777-7777-7777-7777-777777777777', 'AP-910', '5N-FGT', 'Air Peace', 'en_route', 'bbbbbbb2-0000-0000-0000-bbbbbbbb0002', 'bbbbbbb1-0000-0000-0000-bbbbbbbb0001', '2025-01-10 08:45:00+01', '2025-01-10 10:05:00+01'),
  (gen_random_uuid(), '88888888-8888-8888-8888-888888888888', 'ET-903', 'ET-903', 'Ethiopian Airlines', 'landed', 'bbbbbbb1-0000-0000-0000-bbbbbbbb0001', 'bbbbbbb2-0000-0000-0000-bbbbbbbb0002', '2025-01-11 07:30:00+01', '2025-01-11 09:15:00+01');

-- Insert journey events (call sign updates)
INSERT INTO journey_events (id, journey_id, event_type, description, triggered_by, triggered_at)
SELECT
  gen_random_uuid(),
  '44444444-4444-4444-4444-444444444444',
  'checkpoint_update',
  'Convoy departed Eagle Square and is en route to Villa',
  u.id,
  NOW() - interval '45 minutes'
FROM users u
WHERE u.role IN ('delta_oscar')
LIMIT 1;

-- Insert incidents
INSERT INTO incidents (id, program_id, type, description, status, reported_by, reported_at)
SELECT
  gen_random_uuid(),
  '11111111-1111-1111-1111-111111111111',
  'security_alert',
  'Minor disruption reported near entry checkpoint, resolved on site.',
  'resolved',
  u.id,
  NOW() - interval '15 minutes'
FROM users u
WHERE u.role IN ('tango_oscar')
LIMIT 1;

-- Insert default settings for admin accounts
INSERT INTO settings (user_id, organization_name, organization_email, organization_phone, address, email_notifications, sms_notifications, push_notifications, theme, timezone)
SELECT
  u.id,
  'The Covenant Nation Protocol',
  'protocol@tcnp.org',
  '+234 805 123 4567',
  '1 Covenant Boulevard, Lagos, Nigeria',
  true,
  true,
  true,
  'light',
  'Africa/Lagos'
FROM users u
WHERE u.email IN ('doriazowan@gmail.com', 'tcnpjourney@outlook.com')
ON CONFLICT (user_id) DO UPDATE SET
  organization_name = EXCLUDED.organization_name,
  organization_email = EXCLUDED.organization_email,
  organization_phone = EXCLUDED.organization_phone,
  address = EXCLUDED.address,
  email_notifications = EXCLUDED.email_notifications,
  sms_notifications = EXCLUDED.sms_notifications,
  push_notifications = EXCLUDED.push_notifications,
  theme = EXCLUDED.theme,
  timezone = EXCLUDED.timezone;

DO $$
BEGIN
  RAISE NOTICE 'Realistic seed data inserted successfully.';
END $$;
