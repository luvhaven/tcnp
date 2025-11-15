-- ============================================================================
-- TCNP JOURNEY MANAGEMENT - COMPLETE DATABASE SCHEMA
-- ============================================================================
-- Run this entire script in your Supabase SQL Editor
-- ============================================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ============================================================================
-- CUSTOM TYPES
-- ============================================================================

CREATE TYPE user_role AS ENUM (
  'super_admin',
  'admin',
  'captain',
  'head_of_command',
  'delta_oscar',
  'tango_oscar',
  'head_tango_oscar',
  'alpha_oscar',
  'november_oscar',
  'victor_oscar',
  'viewer',
  'media',
  'external'
);

CREATE TYPE journey_status AS ENUM (
  'planned',
  'scheduled',
  'arriving',
  'at_nest',
  'departing_nest',
  'enroute_to_theatre',
  'at_theatre',
  'departing_theatre',
  'completed',
  'cancelled',
  'distress'
);

CREATE TYPE call_sign AS ENUM (
  'First Course',
  'Chapman',
  'Dessert',
  'Cocktail',
  'Blue Cocktail',
  'Red Cocktail',
  'Re-order',
  'Broken Arrow'
);

CREATE TYPE vehicle_status AS ENUM (
  'idle',
  'on_mission',
  'maintenance',
  'disabled'
);

CREATE TYPE incident_severity AS ENUM (
  'low',
  'medium',
  'high',
  'critical'
);

CREATE TYPE notification_channel AS ENUM (
  'email',
  'sms',
  'push',
  'whatsapp'
);

CREATE TYPE notification_status AS ENUM (
  'pending',
  'sent',
  'failed',
  'delivered'
);

-- ============================================================================
-- TABLES
-- ============================================================================

-- Roles table
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name user_role UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users table (extends Supabase auth.users)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  role user_role NOT NULL DEFAULT 'viewer',
  is_active BOOLEAN DEFAULT true,
  is_online BOOLEAN DEFAULT false,
  last_seen TIMESTAMPTZ,
  avatar_url TEXT,
  timezone TEXT DEFAULT 'Africa/Lagos',
  notification_preferences JSONB DEFAULT '{"email": true, "sms": false, "push": true}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Papas table (guests/ministers)
CREATE TABLE papas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT,
  full_name TEXT NOT NULL,
  short_bio TEXT,
  nationality TEXT,
  passport_number TEXT,
  phone TEXT,
  email TEXT,
  arrival_country TEXT,
  arrival_city TEXT,
  flight_number TEXT,
  flight_provider TEXT,
  flight_departure_time TIMESTAMPTZ,
  flight_arrival_time TIMESTAMPTZ,
  needs JSONB DEFAULT '{}',
  presentation_style TEXT,
  notes TEXT,
  profile_photo_url TEXT,
  is_first_time BOOLEAN DEFAULT true,
  past_invites_count INTEGER DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Eagle Squares table (airports)
CREATE TABLE eagle_squares (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  contact TEXT,
  notes TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Nests table (hotels)
CREATE TABLE nests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT DEFAULT 'Lagos',
  contact TEXT,
  room_assignments JSONB DEFAULT '[]',
  check_in_time TIME DEFAULT '14:00',
  check_out_time TIME DEFAULT '12:00',
  latitude NUMERIC,
  longitude NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Theatres table (venues)
CREATE TABLE theatres (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT DEFAULT 'Lagos',
  gate_instructions TEXT,
  contact TEXT,
  capacity INTEGER,
  latitude NUMERIC,
  longitude NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cheetahs table (vehicles)
CREATE TABLE cheetahs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reg_no TEXT UNIQUE NOT NULL,
  driver_name TEXT NOT NULL,
  driver_phone TEXT NOT NULL,
  capacity INTEGER DEFAULT 4,
  vehicle_type TEXT DEFAULT 'Sedan',
  current_status vehicle_status DEFAULT 'idle',
  telemetry_device_id TEXT,
  last_latitude NUMERIC,
  last_longitude NUMERIC,
  last_location_update TIMESTAMPTZ,
  fuel_status INTEGER DEFAULT 100,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Journeys table
CREATE TABLE journeys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  papa_id UUID NOT NULL REFERENCES papas(id) ON DELETE CASCADE,
  status journey_status DEFAULT 'planned',
  current_call_sign call_sign,
  eta TIMESTAMPTZ,
  etd TIMESTAMPTZ,
  origin TEXT,
  destination TEXT,
  assigned_cheetah_id UUID REFERENCES cheetahs(id),
  assigned_duty_officer_id UUID REFERENCES users(id),
  assigned_nest_id UUID REFERENCES nests(id),
  assigned_theatre_id UUID REFERENCES theatres(id),
  assigned_eagle_square_id UUID REFERENCES eagle_squares(id),
  route_geojson JSONB,
  last_latitude NUMERIC,
  last_longitude NUMERIC,
  last_location_update TIMESTAMPTZ,
  telemetry_enabled BOOLEAN DEFAULT true,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Journey Events table (call-sign history)
CREATE TABLE journey_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  journey_id UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  event_type call_sign NOT NULL,
  triggered_by UUID REFERENCES users(id),
  latitude NUMERIC,
  longitude NUMERIC,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Incidents table
CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  journey_id UUID REFERENCES journeys(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  severity incident_severity NOT NULL,
  description TEXT NOT NULL,
  latitude NUMERIC,
  longitude NUMERIC,
  reported_by UUID REFERENCES users(id),
  status TEXT DEFAULT 'open',
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications table
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL,
  channel notification_channel NOT NULL,
  status notification_status DEFAULT 'pending',
  metadata JSONB DEFAULT '{}',
  read_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notification Templates table
CREATE TABLE notification_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  channels notification_channel[] NOT NULL,
  variables TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Logs table
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID,
  changes JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Settings table
CREATE TABLE settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Telemetry Data table (for vehicle tracking)
CREATE TABLE telemetry_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  journey_id UUID REFERENCES journeys(id) ON DELETE CASCADE,
  cheetah_id UUID REFERENCES cheetahs(id) ON DELETE CASCADE,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  speed NUMERIC,
  heading NUMERIC,
  altitude NUMERIC,
  accuracy NUMERIC,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_is_active ON users(is_active);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_is_online ON users(is_online);
CREATE INDEX idx_papas_full_name ON papas(full_name);
CREATE INDEX idx_papas_flight_number ON papas(flight_number);
CREATE INDEX idx_journeys_papa_id ON journeys(papa_id);
CREATE INDEX idx_journeys_status ON journeys(status);
CREATE INDEX idx_journeys_assigned_do ON journeys(assigned_duty_officer_id);
CREATE INDEX idx_journeys_created_at ON journeys(created_at DESC);
CREATE INDEX idx_journey_events_journey_id ON journey_events(journey_id);
CREATE INDEX idx_journey_events_created_at ON journey_events(created_at DESC);
CREATE INDEX idx_cheetahs_status ON cheetahs(current_status);
CREATE INDEX idx_cheetahs_reg_no ON cheetahs(reg_no);
CREATE INDEX idx_incidents_journey_id ON incidents(journey_id);
CREATE INDEX idx_incidents_status ON incidents(status);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_read_at ON notifications(read_at);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_telemetry_journey_id ON telemetry_data(journey_id);
CREATE INDEX idx_telemetry_timestamp ON telemetry_data(timestamp DESC);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_papas_updated_at BEFORE UPDATE ON papas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_journeys_updated_at BEFORE UPDATE ON journeys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_nests_updated_at BEFORE UPDATE ON nests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_theatres_updated_at BEFORE UPDATE ON theatres
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cheetahs_updated_at BEFORE UPDATE ON cheetahs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_incidents_updated_at BEFORE UPDATE ON incidents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_eagle_squares_updated_at BEFORE UPDATE ON eagle_squares
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_templates_updated_at BEFORE UPDATE ON notification_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE papas ENABLE ROW LEVEL SECURITY;
ALTER TABLE journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cheetahs ENABLE ROW LEVEL SECURITY;
ALTER TABLE nests ENABLE ROW LEVEL SECURITY;
ALTER TABLE theatres ENABLE ROW LEVEL SECURITY;
ALTER TABLE eagle_squares ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_data ENABLE ROW LEVEL SECURITY;

-- Helper functions for RLS
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
  SELECT role FROM users WHERE id = auth.uid() AND is_active = true;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION has_role(required_role user_role)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = required_role
    AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION has_any_role(required_roles user_role[])
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = ANY(required_roles)
    AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Users policies
CREATE POLICY "Users can view their own profile"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all users"
  ON users FOR SELECT
  USING (has_any_role(ARRAY['super_admin', 'admin', 'captain', 'head_of_command']::user_role[]));

CREATE POLICY "Admins can update users"
  ON users FOR UPDATE
  USING (has_any_role(ARRAY['super_admin', 'admin', 'captain', 'head_of_command']::user_role[]));

CREATE POLICY "Users can update their own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can insert users"
  ON users FOR INSERT
  WITH CHECK (has_any_role(ARRAY['super_admin', 'admin', 'captain', 'head_of_command']::user_role[]));

-- Papas policies
CREATE POLICY "All authenticated users can view papas"
  ON papas FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authorized users can manage papas"
  ON papas FOR ALL
  USING (has_any_role(ARRAY['super_admin', 'admin', 'captain', 'head_of_command', 'delta_oscar']::user_role[]));

-- Journeys policies
CREATE POLICY "All authenticated users can view journeys"
  ON journeys FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "DOs can update their assigned journeys"
  ON journeys FOR UPDATE
  USING (
    assigned_duty_officer_id = auth.uid() 
    OR has_any_role(ARRAY['super_admin', 'admin', 'captain', 'head_of_command']::user_role[])
  );

CREATE POLICY "Authorized users can create journeys"
  ON journeys FOR INSERT
  WITH CHECK (has_any_role(ARRAY['super_admin', 'admin', 'captain', 'head_of_command', 'delta_oscar', 'tango_oscar']::user_role[]));

CREATE POLICY "Admins can delete journeys"
  ON journeys FOR DELETE
  USING (has_any_role(ARRAY['super_admin', 'admin']::user_role[]));

-- Journey events policies
CREATE POLICY "All authenticated users can view journey events"
  ON journey_events FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authorized users can create journey events"
  ON journey_events FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Cheetahs policies
CREATE POLICY "All authenticated users can view cheetahs"
  ON cheetahs FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Transport officers can manage cheetahs"
  ON cheetahs FOR ALL
  USING (has_any_role(ARRAY['super_admin', 'admin', 'tango_oscar', 'head_tango_oscar']::user_role[]));

-- Nests policies
CREATE POLICY "All authenticated users can view nests"
  ON nests FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authorized users can manage nests"
  ON nests FOR ALL
  USING (has_any_role(ARRAY['super_admin', 'admin', 'captain', 'november_oscar']::user_role[]));

-- Theatres policies
CREATE POLICY "All authenticated users can view theatres"
  ON theatres FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authorized users can manage theatres"
  ON theatres FOR ALL
  USING (has_any_role(ARRAY['super_admin', 'admin', 'captain', 'victor_oscar']::user_role[]));

-- Eagle squares policies
CREATE POLICY "All authenticated users can view eagle squares"
  ON eagle_squares FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authorized users can manage eagle squares"
  ON eagle_squares FOR ALL
  USING (has_any_role(ARRAY['super_admin', 'admin', 'captain', 'alpha_oscar']::user_role[]));

-- Incidents policies
CREATE POLICY "All authenticated users can view incidents"
  ON incidents FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "All authenticated users can create incidents"
  ON incidents FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authorized users can update incidents"
  ON incidents FOR UPDATE
  USING (has_any_role(ARRAY['super_admin', 'admin', 'captain', 'head_of_command']::user_role[]));

-- Notifications policies
CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "System can create notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid());

-- Notification templates policies
CREATE POLICY "All authenticated users can view templates"
  ON notification_templates FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage templates"
  ON notification_templates FOR ALL
  USING (has_any_role(ARRAY['super_admin', 'admin']::user_role[]));

-- Audit logs policies
CREATE POLICY "Admins can view audit logs"
  ON audit_logs FOR SELECT
  USING (has_any_role(ARRAY['super_admin', 'admin', 'captain']::user_role[]));

CREATE POLICY "System can create audit logs"
  ON audit_logs FOR INSERT
  WITH CHECK (true);

-- Settings policies
CREATE POLICY "All authenticated users can view settings"
  ON settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage settings"
  ON settings FOR ALL
  USING (has_any_role(ARRAY['super_admin', 'admin']::user_role[]));

-- Telemetry policies
CREATE POLICY "All authenticated users can view telemetry"
  ON telemetry_data FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "System can insert telemetry"
  ON telemetry_data FOR INSERT
  WITH CHECK (true);

-- Roles policies
CREATE POLICY "All authenticated users can view roles"
  ON roles FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Super admins can manage roles"
  ON roles FOR ALL
  USING (has_role('super_admin'::user_role));

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to create audit log
CREATE OR REPLACE FUNCTION create_audit_log(
  p_action TEXT,
  p_target_type TEXT,
  p_target_id UUID,
  p_changes JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO audit_logs (user_id, action, target_type, target_id, changes)
  VALUES (auth.uid(), p_action, p_target_type, p_target_id, p_changes)
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update user online status
CREATE OR REPLACE FUNCTION update_user_online_status(p_is_online BOOLEAN)
RETURNS VOID AS $$
BEGIN
  UPDATE users
  SET is_online = p_is_online,
      last_seen = CASE WHEN p_is_online = false THEN NOW() ELSE last_seen END
  WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Insert default roles
INSERT INTO roles (name, display_name, permissions) VALUES
  ('super_admin', 'Super Administrator', '["all"]'),
  ('admin', 'Administrator', '["manage_users", "manage_all_entities", "view_audit_logs"]'),
  ('captain', 'Captain / Head of Operation', '["manage_users", "view_all", "manage_journeys"]'),
  ('head_of_command', 'Head of Command Center', '["view_all", "manage_journeys", "view_audit_logs"]'),
  ('delta_oscar', 'Delta Oscar (DO)', '["manage_assigned_journeys", "create_incidents", "view_papas"]'),
  ('tango_oscar', 'Tango Oscar (TO)', '["manage_cheetahs", "view_journeys"]'),
  ('head_tango_oscar', 'Head Tango Oscar', '["manage_cheetahs", "manage_fleet", "view_all"]'),
  ('alpha_oscar', 'Alpha Oscar (AO)', '["manage_eagle_squares", "view_flights", "update_eta"]'),
  ('november_oscar', 'November Oscar (NO)', '["manage_nests", "manage_rooms", "view_journeys"]'),
  ('victor_oscar', 'Victor Oscar (VO)', '["manage_theatres", "confirm_arrivals", "view_journeys"]'),
  ('viewer', 'Viewer', '["view_journeys", "view_papas"]'),
  ('media', 'Media / Mike Uniform', '["view_arrival_times"]'),
  ('external', 'External Partner', '["view_limited"]')
ON CONFLICT (name) DO NOTHING;

-- Insert default notification templates
INSERT INTO notification_templates (name, title, body, channels, variables) VALUES
  ('arrival_at_nest', 'Papa Arrived at Nest', '{papa_name} has arrived at {nest_name} - Room {room}. Checked in at {time}.', ARRAY['email', 'push']::notification_channel[], ARRAY['papa_name', 'nest_name', 'room', 'time']),
  ('first_course', 'First Course - Departing to Theatre', '{papa_name} is leaving {nest_name} for {theatre_name}. ETA: {eta}. Cheetah: {cheetah}.', ARRAY['email', 'sms', 'push']::notification_channel[], ARRAY['papa_name', 'nest_name', 'theatre_name', 'eta', 'cheetah']),
  ('chapman', 'Chapman - Arrived at Theatre', '{papa_name} has arrived at {theatre_name} gate. Please prepare for reception.', ARRAY['email', 'push']::notification_channel[], ARRAY['papa_name', 'theatre_name']),
  ('broken_arrow', 'EMERGENCY - Broken Arrow', 'EMERGENCY: {papa_name} | Journey {journey_id}. Last known location: {location}. Immediate action required. Contact: {driver_phone}', ARRAY['email', 'sms', 'push']::notification_channel[], ARRAY['papa_name', 'journey_id', 'location', 'driver_phone']),
  ('dessert', 'Dessert - Returning to Nest', '{papa_name} is departing {theatre_name} and returning to {nest_name}. ETA: {eta}.', ARRAY['push']::notification_channel[], ARRAY['papa_name', 'theatre_name', 'nest_name', 'eta'])
ON CONFLICT (name) DO NOTHING;

-- Insert default settings
INSERT INTO settings (key, value, description) VALUES
  ('app_name', '"TCNP Journey Management"', 'Application name'),
  ('app_logo_url', '"/logo.png"', 'Application logo URL'),
  ('app_favicon_url', '"/favicon.ico"', 'Application favicon URL'),
  ('theme', '"light"', 'Default theme (light/dark)'),
  ('map_provider', '"openstreetmap"', 'Map provider (openstreetmap/mapbox)'),
  ('telemetry_frequency', '15', 'Telemetry update frequency in seconds'),
  ('emergency_contacts', '[]', 'Emergency contact numbers for Broken Arrow'),
  ('notification_enabled', 'true', 'Global notification toggle')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Database schema created successfully!';
  RAISE NOTICE 'Next step: Run the SEED_DATA.sql script to populate with sample data';
  RAISE NOTICE '============================================================================';
END $$;
