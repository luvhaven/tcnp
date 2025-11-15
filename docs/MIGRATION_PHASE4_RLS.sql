-- ============================================================================
-- PHASE 4: ROLE-BASED ACCESS CONTROL & RLS POLICIES
-- ============================================================================
-- This migration implements comprehensive role-based access control
-- for all features based on official titles and roles
-- ============================================================================

-- ============================================================================
-- 1. CREATE HELPER FUNCTIONS FOR ROLE CHECKS
-- ============================================================================

-- Check if user has specific role
CREATE OR REPLACE FUNCTION has_role(p_role TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = p_role
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user has any of the specified roles
CREATE OR REPLACE FUNCTION has_any_role(p_roles TEXT[])
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = ANY(p_roles)
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user has specific title
CREATE OR REPLACE FUNCTION has_title(p_title_code TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users u
    JOIN official_titles ot ON u.current_title_id = ot.id
    WHERE u.id = auth.uid()
    AND ot.code = p_title_code
    AND u.is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user is Super Admin or Admin (excluded from GPS tracking)
CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND (
      email = 'doriazowan@gmail.com' 
      OR email = 'tcnpjourney@outlook.com'
      OR role IN ('super_admin', 'admin')
    )
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user can view all tracking (Captain, HOP, Head of Command, etc.)
CREATE OR REPLACE FUNCTION can_view_all_tracking()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND (
      role IN ('super_admin', 'admin', 'captain', 'head_of_command', 'tango_oscar', 'head_tango_oscar')
      OR EXISTS (
        SELECT 1 FROM official_titles ot
        WHERE ot.id = users.current_title_id
        AND ot.code IN ('CAPTAIN', 'VICE_CAPTAIN', 'HEAD_OF_COMMAND', 'HEAD_OF_OPERATIONS', 'COMMAND')
      )
    )
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user can view call sign updates
CREATE OR REPLACE FUNCTION can_view_call_signs()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND (
      role IN ('super_admin', 'admin', 'captain', 'head_of_command')
      OR EXISTS (
        SELECT 1 FROM official_titles ot
        WHERE ot.id = users.current_title_id
        AND ot.code IN ('PROF', 'DUCHESS', 'CAPTAIN', 'VICE_CAPTAIN', 'HEAD_OF_COMMAND', 'HEAD_OF_OPERATIONS', 'COMMAND')
      )
    )
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- 2. UPDATE RLS POLICIES FOR VEHICLE_LOCATIONS (Cheetah Tracking)
-- ============================================================================

-- Drop ALL existing policies
DROP POLICY IF EXISTS "Users can view vehicle locations" ON vehicle_locations;
DROP POLICY IF EXISTS "Users can insert vehicle locations" ON vehicle_locations;
DROP POLICY IF EXISTS "View vehicle locations based on role" ON vehicle_locations;
DROP POLICY IF EXISTS "Non-admin users can insert vehicle locations" ON vehicle_locations;
DROP POLICY IF EXISTS "All authenticated users can view vehicle locations" ON vehicle_locations;
DROP POLICY IF EXISTS "All authenticated users can insert vehicle locations" ON vehicle_locations;

-- View policy: Admins and authorized roles can view all, DOs can view only their own
CREATE POLICY "View vehicle locations based on role"
  ON vehicle_locations FOR SELECT
  USING (
    can_view_all_tracking() -- Admins, Captain, HOP, TO, etc.
    OR user_id = auth.uid() -- DOs can see their own
  );

-- Insert policy: Only non-admin users can track (exclude Super Admin and Admin)
CREATE POLICY "Non-admin users can insert vehicle locations"
  ON vehicle_locations FOR INSERT
  WITH CHECK (
    NOT is_admin_user() -- Exclude Super Admin and Admin from tracking
    AND auth.uid() IS NOT NULL
  );

-- ============================================================================
-- 3. UPDATE RLS POLICIES FOR FLIGHT_TRACKING (Eagle Tracking)
-- ============================================================================

-- Drop ALL existing policies
DROP POLICY IF EXISTS "All authenticated users can view flight tracking" ON flight_tracking;
DROP POLICY IF EXISTS "Authorized users can manage flight tracking" ON flight_tracking;
DROP POLICY IF EXISTS "All users can view flight tracking" ON flight_tracking;
DROP POLICY IF EXISTS "Authorized users manage flight tracking" ON flight_tracking;

-- View policy: All authenticated users can view
CREATE POLICY "All users can view flight tracking"
  ON flight_tracking FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Manage policy: Super Admin, Admin, Alpha Oscar
CREATE POLICY "Authorized users manage flight tracking"
  ON flight_tracking FOR ALL
  USING (
    has_any_role(ARRAY['super_admin', 'admin', 'alpha_oscar'])
    OR has_title('ALPHA_OSCAR')
    OR has_title('ALPHA_OSCAR_LEAD')
  );

-- ============================================================================
-- 4. UPDATE RLS POLICIES FOR JOURNEY_EVENTS (Call Sign Updates)
-- ============================================================================

-- Drop ALL existing policies
DROP POLICY IF EXISTS "All authenticated users can view journey events" ON journey_events;
DROP POLICY IF EXISTS "Authorized users can create journey events" ON journey_events;
DROP POLICY IF EXISTS "View journey events based on role" ON journey_events;
DROP POLICY IF EXISTS "Field officers can create journey events" ON journey_events;

-- View policy: Authorized roles can view all, others can view their own
CREATE POLICY "View journey events based on role"
  ON journey_events FOR SELECT
  USING (
    can_view_call_signs() -- Admins, Captain, Prof, Duchess, etc.
    OR triggered_by = auth.uid() -- User's own updates
  );

-- Insert policy: DOs and field officers can create
CREATE POLICY "Field officers can create journey events"
  ON journey_events FOR INSERT
  WITH CHECK (
    has_any_role(ARRAY['delta_oscar', 'super_admin', 'admin', 'captain'])
    AND auth.uid() IS NOT NULL
  );

-- ============================================================================
-- 5. UPDATE RLS POLICIES FOR INCIDENTS
-- ============================================================================

-- Drop ALL existing policies
DROP POLICY IF EXISTS "All authenticated users can view incidents" ON incidents;
DROP POLICY IF EXISTS "All authenticated users can create incidents" ON incidents;
DROP POLICY IF EXISTS "Authorized users can update incidents" ON incidents;
DROP POLICY IF EXISTS "All users can view incidents" ON incidents;
DROP POLICY IF EXISTS "All users can create incidents" ON incidents;
DROP POLICY IF EXISTS "Authorized users can update incidents" ON incidents;
DROP POLICY IF EXISTS "Admins can delete incidents" ON incidents;

-- View policy: All authenticated users
CREATE POLICY "All users can view incidents"
  ON incidents FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Create policy: All authenticated users
CREATE POLICY "All users can create incidents"
  ON incidents FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Update policy: Admins, Captain, Head of Command, HOP
CREATE POLICY "Authorized users can update incidents"
  ON incidents FOR UPDATE
  USING (
    has_any_role(ARRAY['super_admin', 'admin', 'captain', 'head_of_command'])
    OR has_title('CAPTAIN')
    OR has_title('HEAD_OF_COMMAND')
    OR has_title('HEAD_OF_OPERATIONS')
  );

-- Delete policy: Super Admin and Admin only
CREATE POLICY "Admins can delete incidents"
  ON incidents FOR DELETE
  USING (has_any_role(ARRAY['super_admin', 'admin']));

-- ============================================================================
-- 6. UPDATE RLS POLICIES FOR AUDIT_LOGS
-- ============================================================================

-- Drop ALL existing policies
DROP POLICY IF EXISTS "Admins can view audit logs" ON audit_logs;
DROP POLICY IF EXISTS "System can create audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Authorized users can view audit logs" ON audit_logs;
DROP POLICY IF EXISTS "System can create audit logs" ON audit_logs;

-- View policy: Super Admin, Admin, Captain
CREATE POLICY "Authorized users can view audit logs"
  ON audit_logs FOR SELECT
  USING (
    has_any_role(ARRAY['super_admin', 'admin', 'captain'])
    OR has_title('CAPTAIN')
  );

-- Insert policy: System can always insert
CREATE POLICY "System can create audit logs"
  ON audit_logs FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- 7. UPDATE RLS POLICIES FOR CHEETAHS (Fleet Management)
-- ============================================================================

-- Drop ALL existing policies
DROP POLICY IF EXISTS "All authenticated users can view cheetahs" ON cheetahs;
DROP POLICY IF EXISTS "Transport officers can manage cheetahs" ON cheetahs;
DROP POLICY IF EXISTS "All users can view cheetahs" ON cheetahs;
DROP POLICY IF EXISTS "Tango Oscar can manage cheetahs" ON cheetahs;

-- View policy: All authenticated users
CREATE POLICY "All users can view cheetahs"
  ON cheetahs FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Manage policy: Tango Oscar and admins
CREATE POLICY "Tango Oscar can manage cheetahs"
  ON cheetahs FOR ALL
  USING (
    has_any_role(ARRAY['super_admin', 'admin', 'tango_oscar', 'head_tango_oscar'])
    OR has_title('TANGO_OSCAR')
    OR has_title('TANGO_OSCAR_LEAD')
  );

-- ============================================================================
-- 8. UPDATE RLS POLICIES FOR EAGLE_SQUARES (Airports)
-- ============================================================================

-- Drop ALL existing policies
DROP POLICY IF EXISTS "All authenticated users can view eagle squares" ON eagle_squares;
DROP POLICY IF EXISTS "Authorized users can manage eagle squares" ON eagle_squares;
DROP POLICY IF EXISTS "All users can view eagle squares" ON eagle_squares;
DROP POLICY IF EXISTS "Alpha Oscar can manage eagle squares" ON eagle_squares;

-- View policy: All authenticated users
CREATE POLICY "All users can view eagle squares"
  ON eagle_squares FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Manage policy: Alpha Oscar and admins
CREATE POLICY "Alpha Oscar can manage eagle squares"
  ON eagle_squares FOR ALL
  USING (
    has_any_role(ARRAY['super_admin', 'admin', 'alpha_oscar'])
    OR has_title('ALPHA_OSCAR')
    OR has_title('ALPHA_OSCAR_LEAD')
  );

-- ============================================================================
-- 9. UPDATE RLS POLICIES FOR NESTS (Hotels)
-- ============================================================================

-- Drop ALL existing policies
DROP POLICY IF EXISTS "All authenticated users can view nests" ON nests;
DROP POLICY IF EXISTS "Authorized users can manage nests" ON nests;
DROP POLICY IF EXISTS "All users can view nests" ON nests;
DROP POLICY IF EXISTS "November Oscar can manage nests" ON nests;

-- View policy: All authenticated users
CREATE POLICY "All users can view nests"
  ON nests FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Manage policy: November Oscar and admins
CREATE POLICY "November Oscar can manage nests"
  ON nests FOR ALL
  USING (
    has_any_role(ARRAY['super_admin', 'admin', 'november_oscar'])
    OR has_title('NOVEMBER_OSCAR')
    OR has_title('NOVEMBER_OSCAR_LEAD')
  );

-- ============================================================================
-- 10. UPDATE RLS POLICIES FOR THEATRES (Venues)
-- ============================================================================

-- Drop ALL existing policies
DROP POLICY IF EXISTS "All authenticated users can view theatres" ON theatres;
DROP POLICY IF EXISTS "Authorized users can manage theatres" ON theatres;
DROP POLICY IF EXISTS "All users can view theatres" ON theatres;
DROP POLICY IF EXISTS "Victor Oscar can manage theatres" ON theatres;

-- View policy: All authenticated users
CREATE POLICY "All users can view theatres"
  ON theatres FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Manage policy: Victor Oscar and admins
CREATE POLICY "Victor Oscar can manage theatres"
  ON theatres FOR ALL
  USING (
    has_any_role(ARRAY['super_admin', 'admin', 'victor_oscar'])
    OR has_title('VICTOR_OSCAR')
    OR has_title('VICTOR_OSCAR_LEAD')
  );

-- ============================================================================
-- 11. UPDATE RLS POLICIES FOR PROGRAMS
-- ============================================================================

-- Drop ALL existing policies
DROP POLICY IF EXISTS "All authenticated users can view programs" ON programs;
DROP POLICY IF EXISTS "Authorized users can manage programs" ON programs;
DROP POLICY IF EXISTS "All users can view programs" ON programs;
DROP POLICY IF EXISTS "Authorized users can manage programs" ON programs;

-- View policy: All authenticated users
CREATE POLICY "All users can view programs"
  ON programs FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Manage policy: Echo Oscar, admins, and leadership
CREATE POLICY "Authorized users can manage programs"
  ON programs FOR ALL
  USING (
    has_any_role(ARRAY['super_admin', 'admin', 'captain', 'head_of_command'])
    OR has_title('ECHO_OSCAR')
    OR has_title('ECHO_OSCAR_LEAD')
    OR has_title('CAPTAIN')
    OR has_title('HEAD_OF_OPERATIONS')
  );

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'PHASE 4 RLS POLICIES CREATED SUCCESSFULLY!';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Role-Based Access Control:';
  RAISE NOTICE '  ✓ Cheetah Tracking: Admins excluded from GPS, authorized roles can view all';
  RAISE NOTICE '  ✓ Eagle Tracking: Alpha Oscar can manage, all can view';
  RAISE NOTICE '  ✓ Call Sign Updates: DOs can send, authorized roles can view';
  RAISE NOTICE '  ✓ Incidents: All can create/view, managers can update';
  RAISE NOTICE '  ✓ Audit Logs: Admins and Captain can view';
  RAISE NOTICE '  ✓ Fleet: Tango Oscar can manage';
  RAISE NOTICE '  ✓ Airports: Alpha Oscar can manage';
  RAISE NOTICE '  ✓ Hotels: November Oscar can manage';
  RAISE NOTICE '  ✓ Venues: Victor Oscar can manage';
  RAISE NOTICE '  ✓ Programs: Echo Oscar and leadership can manage';
  RAISE NOTICE '============================================================================';
END $$;
