-- ============================================================================
-- ENHANCEMENTS MIGRATION
-- ============================================================================
-- This migration adds:
-- 1. New roles (Prof, Vice Captain, Echo Oscar leads, Command, etc.)
-- 2. Extended Papa fields (Presentation, Preferences, Speaking)
-- 3. Improved audit logging
-- ============================================================================

-- ============================================================================
-- 1. ADD NEW ROLES TO ENUM
-- ============================================================================

-- Add new roles to user_role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'prof';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'duchess';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'vice_captain';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'command';

-- Note: Echo Oscar, November Oscar, Victor Oscar, Alpha Oscar leads 
-- are handled via the official_titles system

-- ============================================================================
-- 2. EXTEND PAPAS TABLE WITH NEW FIELDS
-- ============================================================================

-- Basic Info (already exists)
-- Add missing basic fields if needed
ALTER TABLE papas ADD COLUMN IF NOT EXISTS passport_number VARCHAR(50);
ALTER TABLE papas ADD COLUMN IF NOT EXISTS airline VARCHAR(100);
ALTER TABLE papas ADD COLUMN IF NOT EXISTS flight_number VARCHAR(20);
ALTER TABLE papas ADD COLUMN IF NOT EXISTS arrival_city VARCHAR(100);
ALTER TABLE papas ADD COLUMN IF NOT EXISTS arrival_country VARCHAR(100);
ALTER TABLE papas ADD COLUMN IF NOT EXISTS nationality VARCHAR(100);
ALTER TABLE papas ADD COLUMN IF NOT EXISTS short_bio TEXT;

-- Presentation Tab
ALTER TABLE papas ADD COLUMN IF NOT EXISTS uses_stage_props BOOLEAN DEFAULT false;
ALTER TABLE papas ADD COLUMN IF NOT EXISTS needs_water_on_stage BOOLEAN DEFAULT false;
ALTER TABLE papas ADD COLUMN IF NOT EXISTS water_temperature VARCHAR(50);
ALTER TABLE papas ADD COLUMN IF NOT EXISTS has_slides BOOLEAN DEFAULT false;
ALTER TABLE papas ADD COLUMN IF NOT EXISTS needs_face_towels BOOLEAN DEFAULT false;
ALTER TABLE papas ADD COLUMN IF NOT EXISTS mic_preference VARCHAR(100);
ALTER TABLE papas ADD COLUMN IF NOT EXISTS presentation_style TEXT;
ALTER TABLE papas ADD COLUMN IF NOT EXISTS special_requirements TEXT;

-- Preferences Tab
ALTER TABLE papas ADD COLUMN IF NOT EXISTS food_preferences TEXT;
ALTER TABLE papas ADD COLUMN IF NOT EXISTS dietary_restrictions TEXT;
ALTER TABLE papas ADD COLUMN IF NOT EXISTS accommodation_preferences TEXT;
ALTER TABLE papas ADD COLUMN IF NOT EXISTS additional_notes TEXT;

-- Speaking Tab
ALTER TABLE papas ADD COLUMN IF NOT EXISTS speaking_schedule JSONB DEFAULT '[]'::jsonb;

-- Entourage Tab
ALTER TABLE papas ADD COLUMN IF NOT EXISTS entourage_count INTEGER DEFAULT 0;
ALTER TABLE papas ADD COLUMN IF NOT EXISTS personal_assistants JSONB DEFAULT '[]'::jsonb;

-- ============================================================================
-- 3. IMPROVE AUDIT LOGS TABLE
-- ============================================================================

-- Add more descriptive fields to audit logs
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_type ON audit_logs(target_type);

-- ============================================================================
-- 4. UPDATE AUDIT LOG FUNCTION TO BE MORE DESCRIPTIVE
-- ============================================================================

CREATE OR REPLACE FUNCTION create_audit_log()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_action TEXT;
  v_changes JSONB;
  v_description TEXT;
BEGIN
  -- Get current user ID
  v_user_id := auth.uid();
  
  -- Determine action
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_changes := to_jsonb(NEW);
    v_description := 'Created new ' || TG_TABLE_NAME || ' record';
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_changes := jsonb_build_object(
      'before', to_jsonb(OLD),
      'after', to_jsonb(NEW)
    );
    v_description := 'Updated ' || TG_TABLE_NAME || ' record';
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_changes := to_jsonb(OLD);
    v_description := 'Deleted ' || TG_TABLE_NAME || ' record';
  END IF;
  
  -- Insert audit log with description
  INSERT INTO audit_logs (
    user_id,
    action,
    target_type,
    target_id,
    changes,
    description
  ) VALUES (
    v_user_id,
    v_action,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    v_changes,
    v_description
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. CREATE EAGLE SQUARES VIEW WITH PAPA ARRIVALS/DEPARTURES
-- ============================================================================

CREATE OR REPLACE VIEW eagle_squares_with_flights AS
SELECT 
  es.*,
  -- Arriving flights
  (
    SELECT json_agg(json_build_object(
      'id', ft.id,
      'papa_id', ft.papa_id,
      'papa_name', p.full_name,
      'papa_title', p.title,
      'flight_number', ft.flight_number,
      'scheduled_arrival', ft.scheduled_arrival,
      'estimated_arrival', ft.estimated_arrival,
      'status', ft.status,
      'type', 'arrival'
    ))
    FROM flight_tracking ft
    JOIN papas p ON ft.papa_id = p.id
    WHERE ft.arrival_airport = es.code
    AND ft.status IN ('scheduled', 'in_flight', 'approaching')
  ) as arriving_flights,
  -- Departing flights
  (
    SELECT json_agg(json_build_object(
      'id', ft.id,
      'papa_id', ft.papa_id,
      'papa_name', p.full_name,
      'papa_title', p.title,
      'flight_number', ft.flight_number,
      'scheduled_departure', ft.scheduled_departure,
      'actual_departure', ft.actual_departure,
      'status', ft.status,
      'type', 'departure'
    ))
    FROM flight_tracking ft
    JOIN papas p ON ft.papa_id = p.id
    WHERE ft.departure_airport = es.code
    AND ft.status IN ('scheduled', 'boarding', 'departed')
  ) as departing_flights
FROM eagle_squares es;

-- Grant access to view
GRANT SELECT ON eagle_squares_with_flights TO authenticated;

-- ============================================================================
-- 6. ADD OFFICIAL TITLES FOR NEW ROLES
-- ============================================================================

-- Insert new official titles if they don't exist
INSERT INTO official_titles (code, name, unit, is_fixed, is_team_lead, max_positions, description)
VALUES 
  ('PROF', 'Prof', 'LEADERSHIP', true, false, 1, 'Professor - View only, above Captain, below Admin'),
  ('DUCHESS', 'Duchess', 'LEADERSHIP', true, false, 1, 'Duchess - View only, above Captain, below Admin'),
  ('VICE_CAPTAIN', 'Vice Captain', 'LEADERSHIP', true, false, 1, 'Vice Captain - Below Captain'),
  ('COMMAND', 'Command', 'OPERATIONS', false, false, 10, 'Command Center Officer'),
  ('HEAD_ECHO_OSCAR', 'Head, Echo Oscar', 'EVENTS', true, true, 1, 'Head of Events & Programs'),
  ('HEAD_NOVEMBER_OSCAR', 'Head, November Oscar', 'ACCOMMODATION', true, true, 1, 'Head of Hotels & Accommodation'),
  ('HEAD_VICTOR_OSCAR', 'Head, Victor Oscar', 'VENUES', true, true, 1, 'Head of Venues & Theatres'),
  ('HEAD_ALPHA_OSCAR', 'Head, Alpha Oscar', 'AIRPORTS', true, true, 1, 'Head of Airports & Flight Operations')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'ENHANCEMENTS MIGRATION COMPLETE!';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'New Features Added:';
  RAISE NOTICE '  ✓ New roles: Prof, Duchess, Vice Captain, Command';
  RAISE NOTICE '  ✓ Extended Papa fields: Presentation, Preferences, Speaking, Entourage';
  RAISE NOTICE '  ✓ Improved audit logging with descriptions';
  RAISE NOTICE '  ✓ Eagle Squares view with arrivals/departures';
  RAISE NOTICE '  ✓ New official titles for heads of departments';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Next: Update frontend components to use new fields';
  RAISE NOTICE '============================================================================';
END $$;
