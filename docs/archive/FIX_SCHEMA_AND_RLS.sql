-- ============================================================================
-- FIX_SCHEMA_AND_RLS.sql
-- Comprehensive schema & RLS repair to restore admin access and page data
-- ============================================================================

-- 1. Recreate helper functions for role checks --------------------------------
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

CREATE OR REPLACE FUNCTION has_title(p_title_code TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM users u
    JOIN official_titles ot ON ot.id = u.current_title_id
    WHERE u.id = auth.uid()
      AND ot.code = p_title_code
      AND u.is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND (
        role IN ('super_admin', 'admin')
        OR email IN ('doriazowan@gmail.com', 'tcnpjourney@outlook.com')
      )
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION can_view_all_tracking()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND (
        role IN ('super_admin','admin','captain','vice_captain','head_of_command','head_of_operations','tango_oscar','head_tango_oscar')
        OR has_title('CAPTAIN')
        OR has_title('VICE_CAPTAIN')
        OR has_title('HEAD_OF_COMMAND')
        OR has_title('HEAD_OF_OPERATIONS')
        OR has_title('COMMAND')
      )
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION can_view_call_signs()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND (
        role IN ('super_admin','admin','captain','head_of_command','prof','duchess')
        OR has_title('PROF')
        OR has_title('DUCHESS')
        OR has_title('CAPTAIN')
        OR has_title('VICE_CAPTAIN')
        OR has_title('HEAD_OF_COMMAND')
        OR has_title('HEAD_OF_OPERATIONS')
        OR has_title('COMMAND')
      )
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 2. Ensure key columns exist --------------------------------------------------
ALTER TABLE theatres ADD COLUMN IF NOT EXISTS facilities TEXT;
ALTER TABLE theatres ADD COLUMN IF NOT EXISTS venue_type TEXT;
ALTER TABLE eagle_squares ADD COLUMN IF NOT EXISTS facilities TEXT;
ALTER TABLE eagle_squares ADD COLUMN IF NOT EXISTS latitude NUMERIC;
ALTER TABLE eagle_squares ADD COLUMN IF NOT EXISTS longitude NUMERIC;
ALTER TABLE vehicle_locations ADD COLUMN IF NOT EXISTS accuracy NUMERIC;
ALTER TABLE nests ADD COLUMN IF NOT EXISTS rating INTEGER;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS organization_name TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS organization_email TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS organization_phone TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN DEFAULT true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS sms_notifications BOOLEAN DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS push_notifications BOOLEAN DEFAULT true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'light';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Africa/Lagos';

-- 3. Reset RLS for critical tables --------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE official_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE title_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE eagle_squares ENABLE ROW LEVEL SECURITY;
ALTER TABLE nests ENABLE ROW LEVEL SECURITY;
ALTER TABLE theatres ENABLE ROW LEVEL SECURITY;
ALTER TABLE cheetahs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE flight_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies that clash (users)
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON users;', rec.policyname);
  END LOOP;
END $$;

-- Recreate users policies
CREATE POLICY users_select_self
  ON users FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY users_select_admin
  ON users FOR SELECT
  TO authenticated
  USING (has_any_role(ARRAY['super_admin','admin']));

CREATE POLICY users_update_self
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY users_manage_admin
  ON users FOR ALL
  TO authenticated
  USING (has_any_role(ARRAY['super_admin','admin']));

-- Official titles
DO $$
DECLARE rec RECORD;
BEGIN
  FOR rec IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='official_titles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON official_titles;', rec.policyname);
  END LOOP;
END $$;

CREATE POLICY official_titles_view
  ON official_titles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY official_titles_manage
  ON official_titles FOR ALL
  TO authenticated
  USING (has_any_role(ARRAY['super_admin','admin']));

-- Title assignments
DO $$
DECLARE rec RECORD;
BEGIN
  FOR rec IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='title_assignments'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON title_assignments;', rec.policyname);
  END LOOP;
END $$;

CREATE POLICY title_assignments_view
  ON title_assignments FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY title_assignments_manage
  ON title_assignments FOR ALL
  TO authenticated
  USING (has_any_role(ARRAY['super_admin','admin']));

-- Eagle Squares (airports)
DO $$
DECLARE rec RECORD;
BEGIN
  FOR rec IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='eagle_squares'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON eagle_squares;', rec.policyname);
  END LOOP;
END $$;

CREATE POLICY eagle_squares_view
  ON eagle_squares FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY eagle_squares_manage
  ON eagle_squares FOR ALL
  TO authenticated
  USING (has_any_role(ARRAY['super_admin','admin','captain','vice_captain','head_of_command','head_of_operations']));

-- Nests (hotels)
DO $$
DECLARE rec RECORD;
BEGIN
  FOR rec IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='nests'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON nests;', rec.policyname);
  END LOOP;
END $$;

CREATE POLICY nests_view
  ON nests FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY nests_manage
  ON nests FOR ALL
  TO authenticated
  USING (has_any_role(ARRAY['super_admin','admin','captain','vice_captain','head_of_command','head_of_operations']));

-- Theatres (venues)
DO $$
DECLARE rec RECORD;
BEGIN
  FOR rec IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='theatres'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON theatres;', rec.policyname);
  END LOOP;
END $$;

CREATE POLICY theatres_view
  ON theatres FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY theatres_manage
  ON theatres FOR ALL
  TO authenticated
  USING (has_any_role(ARRAY['super_admin','admin','captain','vice_captain','head_of_command','head_of_operations']));

-- Cheetahs (vehicles)
DO $$
DECLARE rec RECORD;
BEGIN
  FOR rec IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='cheetahs'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON cheetahs;', rec.policyname);
  END LOOP;
END $$;

CREATE POLICY cheetahs_view
  ON cheetahs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY cheetahs_manage
  ON cheetahs FOR ALL
  TO authenticated
  USING (has_any_role(ARRAY['super_admin','admin','captain','vice_captain','head_of_command']));

-- Vehicle locations
DO $$
DECLARE rec RECORD;
BEGIN
  FOR rec IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='vehicle_locations'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON vehicle_locations;', rec.policyname);
  END LOOP;
END $$;

CREATE POLICY vehicle_locations_view
  ON vehicle_locations FOR SELECT
  TO authenticated
  USING (can_view_all_tracking() OR user_id = auth.uid());

CREATE POLICY vehicle_locations_insert
  ON vehicle_locations FOR INSERT
  TO authenticated
  WITH CHECK (NOT is_admin_user());

CREATE POLICY vehicle_locations_manage
  ON vehicle_locations FOR UPDATE
  TO authenticated
  USING (can_view_all_tracking());

-- Flight tracking
DO $$
DECLARE rec RECORD;
BEGIN
  FOR rec IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='flight_tracking'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON flight_tracking;', rec.policyname);
  END LOOP;
END $$;

CREATE POLICY flight_tracking_view
  ON flight_tracking FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY flight_tracking_manage
  ON flight_tracking FOR ALL
  TO authenticated
  USING (has_any_role(ARRAY['super_admin','admin','alpha_oscar']) OR has_title('ALPHA_OSCAR') OR has_title('ALPHA_OSCAR_LEAD'));

-- Journey events
DO $$
DECLARE rec RECORD;
BEGIN
  FOR rec IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='journey_events'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON journey_events;', rec.policyname);
  END LOOP;
END $$;

CREATE POLICY journey_events_view
  ON journey_events FOR SELECT
  TO authenticated
  USING (can_view_call_signs() OR triggered_by = auth.uid());

CREATE POLICY journey_events_insert
  ON journey_events FOR INSERT
  TO authenticated
  WITH CHECK (has_any_role(ARRAY['super_admin','admin','captain','delta_oscar','tango_oscar']));

-- Incidents
DO $$
DECLARE rec RECORD;
BEGIN
  FOR rec IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='incidents'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON incidents;', rec.policyname);
  END LOOP;
END $$;

CREATE POLICY incidents_view
  ON incidents FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY incidents_manage
  ON incidents FOR ALL
  TO authenticated
  USING (has_any_role(ARRAY['super_admin','admin','captain','head_of_operations','head_of_command']));

-- Settings table
DO $$
DECLARE rec RECORD;
BEGIN
  FOR rec IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='settings'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON settings;', rec.policyname);
  END LOOP;
END $$;

CREATE POLICY settings_view_own
  ON settings FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY settings_manage_own
  ON settings FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Audit logs (read-only for admin roles)
DO $$
DECLARE rec RECORD;
BEGIN
  FOR rec IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='audit_logs'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON audit_logs;', rec.policyname);
  END LOOP;
END $$;

CREATE POLICY audit_logs_view
  ON audit_logs FOR SELECT
  TO authenticated
  USING (has_any_role(ARRAY['super_admin','admin','captain','head_of_operations']));

CREATE POLICY audit_logs_insert
  ON audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 4. Grant essential permissions ----------------------------------------------
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- 5. Ensure default settings row per user -------------------------------------
INSERT INTO settings (user_id)
SELECT id
FROM users
WHERE id NOT IN (SELECT user_id FROM settings)
ON CONFLICT DO NOTHING;

-- Final status ---------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE 'FIX_SCHEMA_AND_RLS.sql completed successfully.';
END $$;
