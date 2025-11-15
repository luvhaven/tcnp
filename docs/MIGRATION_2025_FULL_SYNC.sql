-- ============================================================================
-- TCNP JOURNEY MANAGEMENT - NOV 2025 FULL SYNC MIGRATION
-- ============================================================================
-- This script consolidates all structural changes introduced after DATABASE_SCHEMA.sql
-- so that a fresh Supabase project can be brought up-to-date in one run.
-- It is idempotent and can safely be re-run.
-- ============================================================================

-- ============================================================================
-- 0. PRE-REQUISITES
-- ============================================================================
-- Ensure base schema (docs/DATABASE_SCHEMA.sql) has been applied before running this script.
-- ============================================================================

-- ============================================================================
-- 1. CORE ENUM UPDATES
-- ============================================================================
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'head_of_operations';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'prof';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'duchess';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'vice_captain';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'command';

-- ============================================================================
-- 2. PROGRAMS TABLE (EVENTS)
-- ============================================================================
CREATE TABLE IF NOT EXISTS programs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  theatre_id UUID REFERENCES theatres(id) ON DELETE SET NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','active','completed','archived')),
  budget NUMERIC(15,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_programs_status ON programs(status);
CREATE INDEX IF NOT EXISTS idx_programs_theatre ON programs(theatre_id);

-- Ensure timestamp trigger helper exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_programs_updated_at ON programs;
CREATE TRIGGER update_programs_updated_at
  BEFORE UPDATE ON programs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All users can view programs" ON programs;
DROP POLICY IF EXISTS "Authorized users can manage programs" ON programs;
CREATE POLICY "All users can view programs"
  ON programs FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authorized users can manage programs"
  ON programs FOR ALL
  USING (
    has_any_role(ARRAY['super_admin','admin','captain','head_of_command','head_of_operations']::user_role[])
    OR EXISTS (
      SELECT 1 FROM users u
      JOIN official_titles ot ON ot.id = u.current_title_id
      WHERE u.id = auth.uid()
        AND ot.code IN ('ECHO_OSCAR','ECHO_OSCAR_LEAD','CAPTAIN','HEAD_OF_OPERATIONS')
    )
  );

-- ============================================================================
-- 3. USERS ENHANCEMENTS
-- ============================================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS oscar TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_title_id UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS activation_status TEXT DEFAULT 'active' CHECK (activation_status IN ('pending','active','deactivated'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

UPDATE users SET activation_status = 'active' WHERE activation_status IS NULL;

-- ============================================================================
-- 4. PAPAS (GUESTS) ENHANCEMENTS
-- ============================================================================
ALTER TABLE papas ADD COLUMN IF NOT EXISTS program_id UUID;
ALTER TABLE papas ADD COLUMN IF NOT EXISTS organization TEXT;
ALTER TABLE papas ADD COLUMN IF NOT EXISTS position TEXT;
ALTER TABLE papas ADD COLUMN IF NOT EXISTS vip_level TEXT DEFAULT 'vip' CHECK (vip_level IN ('vip','vvip','regular'));
ALTER TABLE papas ADD COLUMN IF NOT EXISTS special_requirements TEXT;
ALTER TABLE papas ADD COLUMN IF NOT EXISTS airline TEXT;
ALTER TABLE papas ADD COLUMN IF NOT EXISTS uses_stage_props BOOLEAN DEFAULT false;
ALTER TABLE papas ADD COLUMN IF NOT EXISTS needs_water_on_stage BOOLEAN DEFAULT false;
ALTER TABLE papas ADD COLUMN IF NOT EXISTS water_temperature TEXT;
ALTER TABLE papas ADD COLUMN IF NOT EXISTS has_slides BOOLEAN DEFAULT false;
ALTER TABLE papas ADD COLUMN IF NOT EXISTS needs_face_towels BOOLEAN DEFAULT false;
ALTER TABLE papas ADD COLUMN IF NOT EXISTS mic_preference TEXT;
ALTER TABLE papas ADD COLUMN IF NOT EXISTS food_preferences TEXT;
ALTER TABLE papas ADD COLUMN IF NOT EXISTS dietary_restrictions TEXT;
ALTER TABLE papas ADD COLUMN IF NOT EXISTS accommodation_preferences TEXT;
ALTER TABLE papas ADD COLUMN IF NOT EXISTS additional_notes TEXT;
ALTER TABLE papas ADD COLUMN IF NOT EXISTS speaking_schedule JSONB DEFAULT '[]'::jsonb;
ALTER TABLE papas ADD COLUMN IF NOT EXISTS entourage_count INTEGER DEFAULT 0;
ALTER TABLE papas ADD COLUMN IF NOT EXISTS personal_assistants JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_papas_program_id ON papas(program_id);

-- ============================================================================
-- 5. JOURNEYS & INCIDENTS LINKS TO PROGRAMS
-- ============================================================================
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS program_id UUID;
CREATE INDEX IF NOT EXISTS idx_journeys_program_id ON journeys(program_id);

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS program_id UUID;
CREATE INDEX IF NOT EXISTS idx_incidents_program_id ON incidents(program_id);

-- ============================================================================
-- 6. CHEETAHS (FLEET) ENHANCEMENTS
-- ============================================================================
ALTER TABLE cheetahs ADD COLUMN IF NOT EXISTS call_sign TEXT;
ALTER TABLE cheetahs ADD COLUMN IF NOT EXISTS registration_number TEXT;
ALTER TABLE cheetahs ADD COLUMN IF NOT EXISTS make TEXT;
ALTER TABLE cheetahs ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE cheetahs ADD COLUMN IF NOT EXISTS year INTEGER;
ALTER TABLE cheetahs ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE cheetahs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'available';
ALTER TABLE cheetahs ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 4;
ALTER TABLE cheetahs ADD COLUMN IF NOT EXISTS fuel_status TEXT DEFAULT 'full' CHECK (fuel_status IN ('full','three_quarters','half','quarter','empty'));
ALTER TABLE cheetahs ADD COLUMN IF NOT EXISTS program_id UUID;
ALTER TABLE cheetahs ADD COLUMN IF NOT EXISTS features TEXT;
ALTER TABLE cheetahs ADD COLUMN IF NOT EXISTS last_maintenance DATE;
ALTER TABLE cheetahs ADD COLUMN IF NOT EXISTS next_maintenance DATE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cheetahs_call_sign ON cheetahs(call_sign);
CREATE INDEX IF NOT EXISTS idx_cheetahs_program_id ON cheetahs(program_id);

UPDATE cheetahs SET registration_number = reg_no WHERE registration_number IS NULL AND reg_no IS NOT NULL;
UPDATE cheetahs SET reg_no = registration_number WHERE reg_no IS NULL AND registration_number IS NOT NULL;

-- ============================================================================
-- 7. LOCATION & FLIGHT TRACKING TABLES
-- ============================================================================
CREATE TABLE IF NOT EXISTS vehicle_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cheetah_id UUID NOT NULL REFERENCES cheetahs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  latitude NUMERIC(10,8) NOT NULL,
  longitude NUMERIC(11,8) NOT NULL,
  accuracy NUMERIC(10,2),
  speed NUMERIC(10,2),
  heading NUMERIC(5,2),
  altitude NUMERIC(10,2),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_locations_cheetah_id ON vehicle_locations(cheetah_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_locations_timestamp ON vehicle_locations(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_locations_user_id ON vehicle_locations(user_id);

ALTER TABLE vehicle_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All users can view vehicle locations" ON vehicle_locations;
DROP POLICY IF EXISTS "All users can insert vehicle locations" ON vehicle_locations;
CREATE POLICY "All users can view vehicle locations"
  ON vehicle_locations FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "Non-admin users can insert vehicle locations"
  ON vehicle_locations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND has_any_role(ARRAY['super_admin','admin']::user_role[]) IS FALSE);

CREATE TABLE IF NOT EXISTS protocol_officer_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  latitude NUMERIC(10,8) NOT NULL,
  longitude NUMERIC(11,8) NOT NULL,
  accuracy NUMERIC(10,2),
  altitude NUMERIC(10,2),
  heading NUMERIC(5,2),
  speed NUMERIC(10,2),
  battery_level INTEGER,
  is_online BOOLEAN DEFAULT true,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_protocol_officer_locations_user_id ON protocol_officer_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_protocol_officer_locations_timestamp ON protocol_officer_locations(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_protocol_officer_locations_online ON protocol_officer_locations(is_online);

ALTER TABLE protocol_officer_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "protocol_officers_insert_location" ON protocol_officer_locations;
DROP POLICY IF EXISTS "admins_view_all_locations" ON protocol_officer_locations;
DROP POLICY IF EXISTS "officers_view_own_locations" ON protocol_officer_locations;
CREATE POLICY "protocol_officers_insert_location"
  ON protocol_officer_locations FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND has_any_role(ARRAY[
      'delta_oscar','tango_oscar','head_tango_oscar','alpha_oscar','november_oscar','victor_oscar'
    ]::user_role[])
  );
CREATE POLICY "admins_view_all_locations"
  ON protocol_officer_locations FOR SELECT
  USING (
    has_any_role(ARRAY['super_admin','admin','captain','head_of_command','head_of_operations']::user_role[])
  );
CREATE POLICY "officers_view_own_locations"
  ON protocol_officer_locations FOR SELECT
  USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS flight_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  papa_id UUID REFERENCES papas(id) ON DELETE CASCADE,
  flight_number TEXT NOT NULL,
  icao24 TEXT,
  callsign TEXT,
  origin_country TEXT,
  departure_airport TEXT,
  arrival_airport TEXT,
  scheduled_departure TIMESTAMPTZ,
  scheduled_arrival TIMESTAMPTZ,
  actual_departure TIMESTAMPTZ,
  estimated_arrival TIMESTAMPTZ,
  current_latitude NUMERIC(10,8),
  current_longitude NUMERIC(11,8),
  altitude NUMERIC(10,2),
  velocity NUMERIC(10,2),
  heading NUMERIC(5,2),
  status TEXT,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flight_tracking_papa_id ON flight_tracking(papa_id);
CREATE INDEX IF NOT EXISTS idx_flight_tracking_flight_number ON flight_tracking(flight_number);
CREATE INDEX IF NOT EXISTS idx_flight_tracking_status ON flight_tracking(status);

ALTER TABLE flight_tracking ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All users can view flight tracking" ON flight_tracking;
DROP POLICY IF EXISTS "Authorized users manage flight tracking" ON flight_tracking;
CREATE POLICY "All users can view flight tracking"
  ON flight_tracking FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authorized users manage flight tracking"
  ON flight_tracking FOR ALL
  USING (
    has_any_role(ARRAY['super_admin','admin','alpha_oscar']::user_role[])
    OR EXISTS (
      SELECT 1 FROM users u
      JOIN official_titles ot ON ot.id = u.current_title_id
      WHERE u.id = auth.uid() AND ot.code IN ('ALPHA_OSCAR','ALPHA_OSCAR_LEAD')
    )
  );

-- Cleanup helper
CREATE OR REPLACE FUNCTION cleanup_old_locations()
RETURNS void AS $$
BEGIN
  DELETE FROM protocol_officer_locations
  WHERE timestamp < NOW() - INTERVAL '7 days';

  UPDATE protocol_officer_locations
  SET is_online = false
  WHERE timestamp < NOW() - INTERVAL '5 minutes'
    AND is_online = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 8. OFFICIAL TITLES & ASSIGNMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS official_titles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  is_fixed BOOLEAN DEFAULT false,
  is_team_lead BOOLEAN DEFAULT false,
  max_positions INTEGER DEFAULT 1,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS title_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id UUID NOT NULL REFERENCES official_titles(id) ON DELETE CASCADE,
  program_id UUID REFERENCES programs(id) ON DELETE SET NULL,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, title_id, program_id)
);

CREATE INDEX IF NOT EXISTS idx_official_titles_unit ON official_titles(unit);
CREATE INDEX IF NOT EXISTS idx_title_assignments_user_id ON title_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_title_assignments_title_id ON title_assignments(title_id);
CREATE INDEX IF NOT EXISTS idx_title_assignments_program_id ON title_assignments(program_id);
CREATE INDEX IF NOT EXISTS idx_title_assignments_active ON title_assignments(is_active);

ALTER TABLE official_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE title_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All users can view official titles" ON official_titles;
DROP POLICY IF EXISTS "Admins manage official titles" ON official_titles;
DROP POLICY IF EXISTS "All users can view title assignments" ON title_assignments;
DROP POLICY IF EXISTS "Admins manage title assignments" ON title_assignments;
CREATE POLICY "All users can view official titles"
  ON official_titles FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins manage official titles"
  ON official_titles FOR ALL
  USING (has_any_role(ARRAY['super_admin','admin']::user_role[]));
CREATE POLICY "All users can view title assignments"
  ON title_assignments FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins manage title assignments"
  ON title_assignments FOR ALL
  USING (has_any_role(ARRAY['super_admin','admin','captain']::user_role[]));

-- Seed leadership titles (idempotent)
INSERT INTO official_titles (code, name, unit, is_fixed, is_team_lead, max_positions, description) VALUES
  ('PROF','Prof','leadership',true,false,1,'Professor - fixed leadership position'),
  ('DUCHESS','Duchess','leadership',true,false,1,'Duchess - fixed leadership position'),
  ('CAPTAIN','Captain','leadership',false,false,1,'Captain - Head of operations'),
  ('VICE_CAPTAIN','Vice Captain','leadership',false,false,2,'Vice Captain (2 slots)'),
  ('HEAD_OF_COMMAND','Head of Command','command',false,false,1,'Head of Command Center'),
  ('HEAD_OF_OPERATIONS','Head of Operations','command',false,false,1,'Head of Field Operations'),
  ('COMMAND','Command','command',false,false,10,'Command Center Officer'),
  ('ALPHA_OSCAR','Alpha Oscar','oscar',false,false,1,'Airport Operations Officer'),
  ('ALPHA_OSCAR_LEAD','Alpha Oscar (Lead)','oscar',false,true,1,'Airport Operations Team Lead'),
  ('TANGO_OSCAR','Tango Oscar','oscar',false,false,1,'Transport Officer'),
  ('TANGO_OSCAR_LEAD','Tango Oscar (Lead)','oscar',false,true,1,'Transport Team Lead'),
  ('VICTOR_OSCAR','Victor Oscar','oscar',false,false,1,'Venue Officer'),
  ('VICTOR_OSCAR_LEAD','Victor Oscar (Lead)','oscar',false,true,1,'Venue Team Lead'),
  ('NOVEMBER_OSCAR','November Oscar','oscar',false,false,1,'Accommodation Officer'),
  ('NOVEMBER_OSCAR_LEAD','November Oscar (Lead)','oscar',false,true,1,'Accommodation Team Lead'),
  ('ECHO_OSCAR','Echo Oscar','oscar',false,false,1,'Programs & Events Officer'),
  ('ECHO_OSCAR_LEAD','Echo Oscar (Lead)','oscar',false,true,1,'Programs & Events Team Lead')
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION assign_title(
  p_user_id UUID,
  p_title_code TEXT,
  p_program_id UUID DEFAULT NULL,
  p_assigned_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_title_id UUID;
  v_assignment_id UUID;
  v_max_positions INTEGER;
  v_is_fixed BOOLEAN;
  v_current_count INTEGER;
  v_unit TEXT;
BEGIN
  SELECT id, max_positions, is_fixed, unit
  INTO v_title_id, v_max_positions, v_is_fixed, v_unit
  FROM official_titles
  WHERE code = p_title_code;

  IF v_title_id IS NULL THEN
    RAISE EXCEPTION 'Title % not found', p_title_code;
  END IF;

  IF v_is_fixed THEN
    SELECT COUNT(*) INTO v_current_count
    FROM title_assignments
    WHERE title_id = v_title_id AND is_active = true;

    IF v_current_count > 0 THEN
      RAISE EXCEPTION 'Title % is fixed and already assigned', p_title_code;
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_current_count
  FROM title_assignments
  WHERE title_id = v_title_id
    AND is_active = true
    AND (p_program_id IS NULL OR program_id = p_program_id);

  IF v_current_count >= v_max_positions THEN
    RAISE EXCEPTION 'Maximum positions (%) reached for title %', v_max_positions, p_title_code;
  END IF;

  UPDATE title_assignments
  SET is_active = false
  WHERE user_id = p_user_id
    AND (p_program_id IS NULL OR program_id = p_program_id);

  INSERT INTO title_assignments (user_id, title_id, program_id, assigned_by, is_active)
  VALUES (p_user_id, v_title_id, p_program_id, p_assigned_by, true)
  RETURNING id INTO v_assignment_id;

  IF p_program_id IS NULL THEN
    UPDATE users
    SET current_title_id = v_title_id,
        unit = v_unit
    WHERE id = p_user_id;
  END IF;

  RETURN v_assignment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION reassign_title(
  p_from_user_id UUID,
  p_to_user_id UUID,
  p_title_code TEXT,
  p_program_id UUID DEFAULT NULL,
  p_assigned_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_title_id UUID;
  v_is_fixed BOOLEAN;
  v_new_assignment UUID;
BEGIN
  SELECT id, is_fixed INTO v_title_id, v_is_fixed
  FROM official_titles
  WHERE code = p_title_code;

  IF v_title_id IS NULL THEN
    RAISE EXCEPTION 'Title % not found', p_title_code;
  END IF;

  IF v_is_fixed THEN
    RAISE EXCEPTION 'Cannot reassign fixed title %', p_title_code;
  END IF;

  UPDATE title_assignments
  SET is_active = false
  WHERE user_id = p_from_user_id
    AND title_id = v_title_id
    AND (p_program_id IS NULL OR program_id = p_program_id);

  SELECT assign_title(p_to_user_id, p_title_code, p_program_id, p_assigned_by)
  INTO v_new_assignment;

  RETURN v_new_assignment;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE VIEW current_title_assignments AS
SELECT
  ta.id,
  ta.user_id,
  u.full_name,
  u.email,
  ta.title_id,
  ot.code AS title_code,
  ot.name AS title_name,
  ot.unit,
  ot.is_fixed,
  ot.is_team_lead,
  ta.program_id,
  p.name AS program_name,
  ta.assigned_by,
  assigner.full_name AS assigned_by_name,
  ta.assigned_at,
  ta.is_active
FROM title_assignments ta
JOIN users u ON ta.user_id = u.id
JOIN official_titles ot ON ta.title_id = ot.id
LEFT JOIN programs p ON ta.program_id = p.id
LEFT JOIN users assigner ON ta.assigned_by = assigner.id
WHERE ta.is_active = true;

GRANT SELECT ON current_title_assignments TO authenticated;

-- Connect users.current_title_id foreign key after table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'users_current_title_id_fkey'
      AND table_name = 'users'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_current_title_id_fkey
      FOREIGN KEY (current_title_id)
      REFERENCES official_titles(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

-- ============================================================================
-- 9. COMMUNICATION & EXPORT TABLES
-- ============================================================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  mentions JSONB DEFAULT '[]'::jsonb,
  is_private BOOLEAN DEFAULT false,
  program_id UUID REFERENCES programs(id) ON DELETE CASCADE,
  reply_to_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  read_by JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_program_id ON chat_messages(program_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_mentions ON chat_messages USING GIN (mentions);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "active_users_insert_messages" ON chat_messages;
DROP POLICY IF EXISTS "users_view_messages" ON chat_messages;
DROP POLICY IF EXISTS "users_update_own_messages" ON chat_messages;
DROP POLICY IF EXISTS "users_delete_own_messages" ON chat_messages;
CREATE POLICY "active_users_insert_messages"
  ON chat_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_active = true)
  );
CREATE POLICY "users_view_messages"
  ON chat_messages FOR SELECT
  USING (
    (is_private = false AND deleted_at IS NULL)
    OR (sender_id = auth.uid() AND deleted_at IS NULL)
    OR (is_private = true AND mentions ? auth.uid()::text AND deleted_at IS NULL)
    OR has_any_role(ARRAY['super_admin','admin']::user_role[])
  );
CREATE POLICY "users_update_own_messages"
  ON chat_messages FOR UPDATE
  USING (sender_id = auth.uid());
CREATE POLICY "users_delete_own_messages"
  ON chat_messages FOR UPDATE
  USING (sender_id = auth.uid());

CREATE OR REPLACE FUNCTION update_chat_message_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chat_messages_update_timestamp ON chat_messages;
CREATE TRIGGER chat_messages_update_timestamp
  BEFORE UPDATE ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_message_timestamp();

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_manage_subscriptions" ON push_subscriptions;
CREATE POLICY "users_manage_subscriptions"
  ON push_subscriptions FOR ALL
  USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS program_exports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  exported_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  export_data JSONB NOT NULL,
  file_url TEXT,
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_program_exports_program_id ON program_exports(program_id);
CREATE INDEX IF NOT EXISTS idx_program_exports_exported_by ON program_exports(exported_by);
CREATE INDEX IF NOT EXISTS idx_program_exports_created_at ON program_exports(created_at DESC);

ALTER TABLE program_exports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authorized_users_export" ON program_exports;
DROP POLICY IF EXISTS "users_view_exports" ON program_exports;
CREATE POLICY "authorized_users_export"
  ON program_exports FOR INSERT
  WITH CHECK (
    exported_by = auth.uid()
    AND has_any_role(ARRAY['super_admin','admin','captain','head_of_operations']::user_role[])
  );
CREATE POLICY "users_view_exports"
  ON program_exports FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION get_unread_message_count(user_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM chat_messages
    WHERE deleted_at IS NULL
      AND (
        is_private = false
        OR (is_private = true AND mentions ? user_uuid::text)
      )
      AND NOT (read_by ? user_uuid::text)
      AND sender_id <> user_uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION mark_message_read(message_uuid UUID, user_uuid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE chat_messages
  SET read_by = read_by || jsonb_build_array(user_uuid::text)
  WHERE id = message_uuid
    AND NOT (read_by ? user_uuid::text);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION export_program_data(program_uuid UUID)
RETURNS JSONB AS $$
DECLARE
  export_data JSONB;
BEGIN
  SELECT jsonb_build_object(
    'program', (SELECT row_to_json(p.*) FROM programs p WHERE p.id = program_uuid),
    'papas', (SELECT jsonb_agg(row_to_json(pa.*)) FROM papas pa WHERE pa.program_id = program_uuid),
    'journeys', (SELECT jsonb_agg(row_to_json(j.*)) FROM journeys j WHERE j.program_id = program_uuid),
    'cheetahs', (SELECT jsonb_agg(row_to_json(c.*)) FROM cheetahs c WHERE c.program_id = program_uuid),
    'incidents', (SELECT jsonb_agg(row_to_json(i.*)) FROM incidents i WHERE i.program_id = program_uuid),
    'chat_messages', (SELECT jsonb_agg(row_to_json(cm.*)) FROM chat_messages cm WHERE cm.program_id = program_uuid),
    'flight_tracking', (SELECT jsonb_agg(row_to_json(ft.*)) FROM flight_tracking ft WHERE ft.papa_id IN (SELECT id FROM papas WHERE program_id = program_uuid)),
    'exported_at', NOW()
  ) INTO export_data;

  RETURN export_data;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 10. FOREIGN KEY ADDITIONS (PROGRAMS LINKS)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'papas_program_id_fkey'
      AND table_name = 'papas'
  ) THEN
    ALTER TABLE papas
      ADD CONSTRAINT papas_program_id_fkey
      FOREIGN KEY (program_id)
      REFERENCES programs(id) ON DELETE SET NULL;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'journeys_program_id_fkey'
      AND table_name = 'journeys'
  ) THEN
    ALTER TABLE journeys
      ADD CONSTRAINT journeys_program_id_fkey
      FOREIGN KEY (program_id)
      REFERENCES programs(id) ON DELETE SET NULL;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'incidents_program_id_fkey'
      AND table_name = 'incidents'
  ) THEN
    ALTER TABLE incidents
      ADD CONSTRAINT incidents_program_id_fkey
      FOREIGN KEY (program_id)
      REFERENCES programs(id) ON DELETE SET NULL;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'cheetahs_program_id_fkey'
      AND table_name = 'cheetahs'
  ) THEN
    ALTER TABLE cheetahs
      ADD CONSTRAINT cheetahs_program_id_fkey
      FOREIGN KEY (program_id)
      REFERENCES programs(id) ON DELETE SET NULL;
  END IF;
END;
$$;

-- ============================================================================
-- 11. AUDIT LOGGING CONSOLIDATION
-- ============================================================================
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS description TEXT;
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_type ON audit_logs(target_type);

CREATE OR REPLACE FUNCTION create_audit_log_entry(
  p_action TEXT,
  p_target_type TEXT,
  p_target_id UUID,
  p_changes JSONB DEFAULT NULL,
  p_description TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO audit_logs (user_id, action, target_type, target_id, changes, description)
  VALUES (auth.uid(), p_action, p_target_type, p_target_id, p_changes, p_description)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION audit_log_trigger()
RETURNS TRIGGER AS $$
DECLARE
  v_action TEXT;
  v_changes JSONB;
  v_description TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_changes := to_jsonb(NEW);
    v_description := 'Created ' || TG_TABLE_NAME || ' record';
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_changes := jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW));
    v_description := 'Updated ' || TG_TABLE_NAME || ' record';
  ELSE
    v_action := 'delete';
    v_changes := to_jsonb(OLD);
    v_description := 'Deleted ' || TG_TABLE_NAME || ' record';
  END IF;

  INSERT INTO audit_logs (user_id, action, target_type, target_id, changes, description)
  VALUES (auth.uid(), v_action, TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), v_changes, v_description);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper to attach trigger to table
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT unnest(ARRAY[
    'users','programs','papas','journeys','cheetahs','incidents','title_assignments',
    'official_titles','vehicle_locations','protocol_officer_locations','flight_tracking',
    'program_exports','chat_messages'
  ]) AS tbl LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%I_trigger ON %I;', rec.tbl, rec.tbl);
    EXECUTE format('CREATE TRIGGER audit_%I_trigger AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();', rec.tbl, rec.tbl);
  END LOOP;
END;
$$;

CREATE OR REPLACE VIEW audit_logs_readable AS
SELECT
  al.id,
  al.action,
  al.target_type,
  al.target_id,
  al.changes,
  al.description,
  al.created_at,
  u.full_name AS user_name,
  u.email AS user_email,
  u.oscar AS user_oscar,
  u.role AS user_role
FROM audit_logs al
LEFT JOIN users u ON al.user_id = u.id
ORDER BY al.created_at DESC;

GRANT SELECT ON audit_logs_readable TO authenticated;

-- ============================================================================
-- 12. RLS TOUCH-UPS FOR EXISTING TABLES
-- ============================================================================
DROP POLICY IF EXISTS "journeys_select_policy" ON journeys;
DROP POLICY IF EXISTS "journeys_modify_policy" ON journeys;
CREATE POLICY "journeys_select_policy"
  ON journeys FOR SELECT
  USING (
    assigned_duty_officer_id = auth.uid()
    OR has_any_role(ARRAY[
      'super_admin','admin','prof','duchess','captain','vice_captain','head_of_operations','head_of_command','command','alpha_oscar','november_oscar','tango_oscar'
    ]::user_role[])
  );
CREATE POLICY "journeys_modify_policy"
  ON journeys FOR ALL
  USING (
    assigned_duty_officer_id = auth.uid()
    OR has_any_role(ARRAY['super_admin','admin','captain','head_of_operations','head_of_command']::user_role[])
  );

DROP POLICY IF EXISTS "All users can view incidents" ON incidents;
DROP POLICY IF EXISTS "All users can create incidents" ON incidents;
DROP POLICY IF EXISTS "Authorized users can update incidents" ON incidents;
DROP POLICY IF EXISTS "Admins can delete incidents" ON incidents;
CREATE POLICY "All users can view incidents"
  ON incidents FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "All users can create incidents"
  ON incidents FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authorized users can update incidents"
  ON incidents FOR UPDATE
  USING (has_any_role(ARRAY['super_admin','admin','captain','head_of_command','head_of_operations']::user_role[]));
CREATE POLICY "Admins can delete incidents"
  ON incidents FOR DELETE
  USING (has_any_role(ARRAY['super_admin','admin']::user_role[]));

DROP POLICY IF EXISTS "View journey events based on role" ON journey_events;
DROP POLICY IF EXISTS "Field officers can create journey events" ON journey_events;
CREATE POLICY "View journey events based on role"
  ON journey_events FOR SELECT
  USING (
    has_any_role(ARRAY['super_admin','admin','captain','head_of_command','head_of_operations','prof','duchess']::user_role[])
    OR triggered_by = auth.uid()
  );
CREATE POLICY "Field officers can create journey events"
  ON journey_events FOR INSERT
  WITH CHECK (has_any_role(ARRAY['super_admin','admin','captain','delta_oscar']::user_role[]));

-- ============================================================================
-- 13. COMPLETION NOTICE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'MIGRATION 2025 FULL SYNC COMPLETED SUCCESSFULLY!';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Schema consolidated with programs, titles, tracking, chat, exports, and audit logging.';
  RAISE NOTICE 'You can now regenerate Supabase types: supabase gen types typescript --project-ref <ref>';
  RAISE NOTICE '============================================================================';
END $$;
