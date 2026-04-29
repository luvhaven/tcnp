-- ============================================================================
-- COMPREHENSIVE FIX - Fix All Issues Once and For All
-- ============================================================================
-- This script fixes:
-- 1. Manage Officers access denied
-- 2. All pages failing to load
-- 3. Cheetah tracking issues
-- 4. All RLS policy conflicts
-- ============================================================================

-- ============================================================================
-- STEP 1: DISABLE RLS TEMPORARILY TO FIX POLICIES
-- ============================================================================

ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE programs DISABLE ROW LEVEL SECURITY;
ALTER TABLE journeys DISABLE ROW LEVEL SECURITY;
ALTER TABLE papas DISABLE ROW LEVEL SECURITY;
ALTER TABLE cheetahs DISABLE ROW LEVEL SECURITY;
ALTER TABLE theatres DISABLE ROW LEVEL SECURITY;
ALTER TABLE nests DISABLE ROW LEVEL SECURITY;
ALTER TABLE eagle_squares DISABLE ROW LEVEL SECURITY;
ALTER TABLE incidents DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_locations DISABLE ROW LEVEL SECURITY;
ALTER TABLE flight_tracking DISABLE ROW LEVEL SECURITY;
ALTER TABLE journey_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE official_titles DISABLE ROW LEVEL SECURITY;
ALTER TABLE title_assignments DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 2: DROP ALL EXISTING POLICIES
-- ============================================================================

-- Users
DROP POLICY IF EXISTS "Users can view their own data" ON users;
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Admins can manage users" ON users;
DROP POLICY IF EXISTS "All users can view users" ON users;
DROP POLICY IF EXISTS "Authorized users can manage users" ON users;
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON users;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON users;
DROP POLICY IF EXISTS "Enable update for users based on id" ON users;

-- Programs
DROP POLICY IF EXISTS "All authenticated users can view programs" ON programs;
DROP POLICY IF EXISTS "Authorized users can manage programs" ON programs;
DROP POLICY IF EXISTS "All users can view programs" ON programs;
DROP POLICY IF EXISTS "Enable read access for all users" ON programs;

-- Journeys
DROP POLICY IF EXISTS "All authenticated users can view journeys" ON journeys;
DROP POLICY IF EXISTS "Authorized users can manage journeys" ON journeys;
DROP POLICY IF EXISTS "All users can view journeys" ON journeys;
DROP POLICY IF EXISTS "Enable read access for all users" ON journeys;

-- Papas
DROP POLICY IF EXISTS "All authenticated users can view papas" ON papas;
DROP POLICY IF EXISTS "Authorized users can manage papas" ON papas;
DROP POLICY IF EXISTS "All users can view papas" ON papas;
DROP POLICY IF EXISTS "Enable read access for all users" ON papas;

-- Cheetahs
DROP POLICY IF EXISTS "All authenticated users can view cheetahs" ON cheetahs;
DROP POLICY IF EXISTS "Transport officers can manage cheetahs" ON cheetahs;
DROP POLICY IF EXISTS "All users can view cheetahs" ON cheetahs;
DROP POLICY IF EXISTS "Tango Oscar can manage cheetahs" ON cheetahs;
DROP POLICY IF EXISTS "Enable read access for all users" ON cheetahs;

-- Theatres
DROP POLICY IF EXISTS "All authenticated users can view theatres" ON theatres;
DROP POLICY IF EXISTS "Authorized users can manage theatres" ON theatres;
DROP POLICY IF EXISTS "All users can view theatres" ON theatres;
DROP POLICY IF EXISTS "Victor Oscar can manage theatres" ON theatres;
DROP POLICY IF EXISTS "Enable read access for all users" ON theatres;

-- Nests
DROP POLICY IF EXISTS "All authenticated users can view nests" ON nests;
DROP POLICY IF EXISTS "Authorized users can manage nests" ON nests;
DROP POLICY IF EXISTS "All users can view nests" ON nests;
DROP POLICY IF EXISTS "November Oscar can manage nests" ON nests;
DROP POLICY IF EXISTS "Enable read access for all users" ON nests;

-- Eagle Squares
DROP POLICY IF EXISTS "All authenticated users can view eagle squares" ON eagle_squares;
DROP POLICY IF EXISTS "Authorized users can manage eagle squares" ON eagle_squares;
DROP POLICY IF EXISTS "All users can view eagle squares" ON eagle_squares;
DROP POLICY IF EXISTS "Alpha Oscar can manage eagle squares" ON eagle_squares;
DROP POLICY IF EXISTS "Enable read access for all users" ON eagle_squares;

-- Incidents
DROP POLICY IF EXISTS "All authenticated users can view incidents" ON incidents;
DROP POLICY IF EXISTS "All authenticated users can create incidents" ON incidents;
DROP POLICY IF EXISTS "Authorized users can update incidents" ON incidents;
DROP POLICY IF EXISTS "All users can view incidents" ON incidents;
DROP POLICY IF EXISTS "All users can create incidents" ON incidents;
DROP POLICY IF EXISTS "Admins can delete incidents" ON incidents;
DROP POLICY IF EXISTS "Enable read access for all users" ON incidents;

-- Audit Logs
DROP POLICY IF EXISTS "Admins can view audit logs" ON audit_logs;
DROP POLICY IF EXISTS "System can create audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Authorized users can view audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON audit_logs;

-- Vehicle Locations
DROP POLICY IF EXISTS "Users can view vehicle locations" ON vehicle_locations;
DROP POLICY IF EXISTS "Users can insert vehicle locations" ON vehicle_locations;
DROP POLICY IF EXISTS "View vehicle locations based on role" ON vehicle_locations;
DROP POLICY IF EXISTS "Non-admin users can insert vehicle locations" ON vehicle_locations;
DROP POLICY IF EXISTS "All authenticated users can view vehicle locations" ON vehicle_locations;
DROP POLICY IF EXISTS "All authenticated users can insert vehicle locations" ON vehicle_locations;
DROP POLICY IF EXISTS "Enable read access for all users" ON vehicle_locations;

-- Flight Tracking
DROP POLICY IF EXISTS "All authenticated users can view flight tracking" ON flight_tracking;
DROP POLICY IF EXISTS "Authorized users can manage flight tracking" ON flight_tracking;
DROP POLICY IF EXISTS "All users can view flight tracking" ON flight_tracking;
DROP POLICY IF EXISTS "Authorized users manage flight tracking" ON flight_tracking;
DROP POLICY IF EXISTS "Enable read access for all users" ON flight_tracking;

-- Journey Events
DROP POLICY IF EXISTS "All authenticated users can view journey events" ON journey_events;
DROP POLICY IF EXISTS "Authorized users can create journey events" ON journey_events;
DROP POLICY IF EXISTS "View journey events based on role" ON journey_events;
DROP POLICY IF EXISTS "Field officers can create journey events" ON journey_events;
DROP POLICY IF EXISTS "Enable read access for all users" ON journey_events;

-- Official Titles
DROP POLICY IF EXISTS "Enable read access for all users" ON official_titles;
DROP POLICY IF EXISTS "All users can view official titles" ON official_titles;

-- Title Assignments
DROP POLICY IF EXISTS "Enable read access for all users" ON title_assignments;
DROP POLICY IF EXISTS "All users can view title assignments" ON title_assignments;

-- ============================================================================
-- STEP 3: CREATE SIMPLE, PERMISSIVE POLICIES
-- ============================================================================

-- USERS: All authenticated users can view, admins can manage
CREATE POLICY "users_select_policy" ON users
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "users_insert_policy" ON users
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "users_update_policy" ON users
  FOR UPDATE USING (
    id = auth.uid() -- Users can update themselves
    OR EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "users_delete_policy" ON users
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'super_admin'
    )
  );

-- PROGRAMS: All can view, authorized can manage
CREATE POLICY "programs_select_policy" ON programs
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "programs_modify_policy" ON programs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'captain', 'head_of_command')
    )
  );

-- JOURNEYS: All can view, authorized can manage
CREATE POLICY "journeys_select_policy" ON journeys
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "journeys_modify_policy" ON journeys
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'captain', 'head_of_command')
    )
  );

-- PAPAS: All can view, authorized can manage
CREATE POLICY "papas_select_policy" ON papas
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "papas_modify_policy" ON papas
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'captain', 'head_of_command')
    )
  );

-- CHEETAHS: All can view, transport officers can manage
CREATE POLICY "cheetahs_select_policy" ON cheetahs
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "cheetahs_modify_policy" ON cheetahs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'tango_oscar', 'head_tango_oscar')
    )
  );

-- THEATRES: All can view, venue officers can manage
CREATE POLICY "theatres_select_policy" ON theatres
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "theatres_modify_policy" ON theatres
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'victor_oscar')
    )
  );

-- NESTS: All can view, hotel officers can manage
CREATE POLICY "nests_select_policy" ON nests
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "nests_modify_policy" ON nests
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'november_oscar')
    )
  );

-- EAGLE SQUARES: All can view, airport officers can manage
CREATE POLICY "eagle_squares_select_policy" ON eagle_squares
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "eagle_squares_modify_policy" ON eagle_squares
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'alpha_oscar')
    )
  );

-- INCIDENTS: All can view and create, managers can update/delete
CREATE POLICY "incidents_select_policy" ON incidents
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "incidents_insert_policy" ON incidents
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "incidents_update_policy" ON incidents
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'captain', 'head_of_command')
    )
  );

CREATE POLICY "incidents_delete_policy" ON incidents
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
    )
  );

-- AUDIT LOGS: Admins can view, system can insert
CREATE POLICY "audit_logs_select_policy" ON audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'captain')
    )
  );

CREATE POLICY "audit_logs_insert_policy" ON audit_logs
  FOR INSERT WITH CHECK (true); -- System can always insert

-- VEHICLE LOCATIONS: All can view, non-admins can track
CREATE POLICY "vehicle_locations_select_policy" ON vehicle_locations
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "vehicle_locations_insert_policy" ON vehicle_locations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- FLIGHT TRACKING: All can view, authorized can manage
CREATE POLICY "flight_tracking_select_policy" ON flight_tracking
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "flight_tracking_modify_policy" ON flight_tracking
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'alpha_oscar')
    )
  );

-- JOURNEY EVENTS: All can view, field officers can create
CREATE POLICY "journey_events_select_policy" ON journey_events
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "journey_events_insert_policy" ON journey_events
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'captain', 'delta_oscar')
    )
  );

-- OFFICIAL TITLES: All can view
CREATE POLICY "official_titles_select_policy" ON official_titles
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- TITLE ASSIGNMENTS: All can view, admins can manage
CREATE POLICY "title_assignments_select_policy" ON title_assignments
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "title_assignments_modify_policy" ON title_assignments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'captain')
    )
  );

-- ============================================================================
-- STEP 4: RE-ENABLE RLS ON ALL TABLES
-- ============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE papas ENABLE ROW LEVEL SECURITY;
ALTER TABLE cheetahs ENABLE ROW LEVEL SECURITY;
ALTER TABLE theatres ENABLE ROW LEVEL SECURITY;
ALTER TABLE nests ENABLE ROW LEVEL SECURITY;
ALTER TABLE eagle_squares ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE flight_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE official_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE title_assignments ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'COMPREHENSIVE FIX COMPLETE!';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'All RLS Policies Recreated:';
  RAISE NOTICE '  ✓ Users - Simple, permissive policies';
  RAISE NOTICE '  ✓ Programs - All can view, authorized can manage';
  RAISE NOTICE '  ✓ Journeys - All can view, authorized can manage';
  RAISE NOTICE '  ✓ Papas - All can view, authorized can manage';
  RAISE NOTICE '  ✓ Cheetahs - All can view, TO can manage';
  RAISE NOTICE '  ✓ Theatres - All can view, VO can manage';
  RAISE NOTICE '  ✓ Nests - All can view, NO can manage';
  RAISE NOTICE '  ✓ Eagle Squares - All can view, AO can manage';
  RAISE NOTICE '  ✓ Incidents - All can view/create, managers can update';
  RAISE NOTICE '  ✓ Audit Logs - Admins can view, system can insert';
  RAISE NOTICE '  ✓ Vehicle Locations - All can view/track';
  RAISE NOTICE '  ✓ Flight Tracking - All can view, AO can manage';
  RAISE NOTICE '  ✓ Journey Events - All can view, DO can create';
  RAISE NOTICE '  ✓ Official Titles - All can view';
  RAISE NOTICE '  ✓ Title Assignments - All can view, admins can manage';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'All pages should now work without errors!';
  RAISE NOTICE '============================================================================';
END $$;
