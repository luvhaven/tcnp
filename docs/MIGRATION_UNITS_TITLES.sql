-- ============================================================================
-- PROTOCOL OFFICER UNITS AND TITLES SYSTEM
-- ============================================================================
-- This migration adds:
-- 1. Units and official titles for Protocol Officers
-- 2. Team lead designation for each Oscar unit
-- 3. Title assignment and reassignment tracking
-- 4. Fixed titles (Prof, Duchess) that cannot be reassigned
-- ============================================================================

-- ============================================================================
-- 1. CREATE OFFICIAL TITLES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS official_titles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL, -- 'leadership', 'command', 'oscar'
  is_fixed BOOLEAN DEFAULT false, -- Prof and Duchess are fixed
  is_team_lead BOOLEAN DEFAULT false, -- For Oscar team leads
  max_positions INTEGER DEFAULT 1, -- Vice Captain has 2 positions
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. CREATE TITLE ASSIGNMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS title_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id UUID NOT NULL REFERENCES official_titles(id) ON DELETE CASCADE,
  program_id UUID REFERENCES programs(id) ON DELETE SET NULL, -- NULL = permanent assignment
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, title_id, program_id) -- One user can't have same title twice in same program
);

-- ============================================================================
-- 3. ADD TITLE COLUMNS TO USERS TABLE
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS current_title_id UUID REFERENCES official_titles(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS unit TEXT; -- 'leadership', 'command', 'oscar'

-- ============================================================================
-- 4. INSERT OFFICIAL TITLES
-- ============================================================================

INSERT INTO official_titles (code, name, unit, is_fixed, is_team_lead, max_positions, description) VALUES
  -- Fixed Leadership Titles (Cannot be reassigned)
  ('PROF', 'Prof', 'leadership', true, false, 1, 'Professor - Fixed leadership position'),
  ('DUCHESS', 'Duchess', 'leadership', true, false, 1, 'Duchess - Fixed leadership position'),
  
  -- Leadership Titles (Reassignable)
  ('CAPTAIN', 'Captain', 'leadership', false, false, 1, 'Captain - Head of all operations'),
  ('VICE_CAPTAIN', 'Vice Captain', 'leadership', false, false, 2, 'Vice Captain - Deputy to Captain (2 positions)'),
  
  -- Command Titles (Reassignable)
  ('HEAD_OF_COMMAND', 'Head of Command', 'command', false, false, 1, 'Head of Command Center'),
  ('HEAD_OF_OPERATIONS', 'Head of Operations', 'command', false, false, 1, 'Head of Field Operations'),
  ('COMMAND', 'Command', 'command', false, false, 1, 'Command Center Officer'),
  
  -- Oscar Units (Reassignable, with team leads)
  ('ALPHA_OSCAR', 'Alpha Oscar', 'oscar', false, false, 1, 'Airport Operations Officer'),
  ('ALPHA_OSCAR_LEAD', 'Alpha Oscar (Team Lead)', 'oscar', false, true, 1, 'Airport Operations Team Lead'),
  
  ('TANGO_OSCAR', 'Tango Oscar', 'oscar', false, false, 1, 'Transport Officer'),
  ('TANGO_OSCAR_LEAD', 'Tango Oscar (Team Lead)', 'oscar', false, true, 1, 'Transport Team Lead'),
  
  ('VICTOR_OSCAR', 'Victor Oscar', 'oscar', false, false, 1, 'Venue Officer'),
  ('VICTOR_OSCAR_LEAD', 'Victor Oscar (Team Lead)', 'oscar', false, true, 1, 'Venue Team Lead'),
  
  ('NOVEMBER_OSCAR', 'November Oscar', 'oscar', false, false, 1, 'Nest (Hotel) Officer'),
  ('NOVEMBER_OSCAR_LEAD', 'November Oscar (Team Lead)', 'oscar', false, true, 1, 'Nest Team Lead'),
  
  ('ECHO_OSCAR', 'Echo Oscar', 'oscar', false, false, 1, 'Event Coordination Officer'),
  ('ECHO_OSCAR_LEAD', 'Echo Oscar (Team Lead)', 'oscar', false, true, 1, 'Event Coordination Team Lead')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 5. CREATE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_title_assignments_user ON title_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_title_assignments_title ON title_assignments(title_id);
CREATE INDEX IF NOT EXISTS idx_title_assignments_program ON title_assignments(program_id);
CREATE INDEX IF NOT EXISTS idx_title_assignments_active ON title_assignments(is_active);
CREATE INDEX IF NOT EXISTS idx_users_current_title ON users(current_title_id);
CREATE INDEX IF NOT EXISTS idx_users_unit ON users(unit);
CREATE INDEX IF NOT EXISTS idx_official_titles_unit ON official_titles(unit);
CREATE INDEX IF NOT EXISTS idx_official_titles_code ON official_titles(code);

-- ============================================================================
-- 6. CREATE FUNCTION TO ASSIGN TITLE
-- ============================================================================

CREATE OR REPLACE FUNCTION assign_title(
  p_user_id UUID,
  p_title_code TEXT,
  p_program_id UUID DEFAULT NULL,
  p_assigned_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_title_id UUID;
  v_assignment_id UUID;
  v_is_fixed BOOLEAN;
  v_max_positions INTEGER;
  v_current_count INTEGER;
  v_unit TEXT;
BEGIN
  -- Get title details
  SELECT id, is_fixed, max_positions, unit 
  INTO v_title_id, v_is_fixed, v_max_positions, v_unit
  FROM official_titles 
  WHERE code = p_title_code;
  
  IF v_title_id IS NULL THEN
    RAISE EXCEPTION 'Title % not found', p_title_code;
  END IF;
  
  -- Check if title is fixed and already assigned
  IF v_is_fixed THEN
    SELECT COUNT(*) INTO v_current_count
    FROM title_assignments
    WHERE title_id = v_title_id AND is_active = true;
    
    IF v_current_count > 0 THEN
      RAISE EXCEPTION 'Title % is fixed and already assigned', p_title_code;
    END IF;
  END IF;
  
  -- Check max positions
  SELECT COUNT(*) INTO v_current_count
  FROM title_assignments
  WHERE title_id = v_title_id 
    AND is_active = true
    AND (p_program_id IS NULL OR program_id = p_program_id);
  
  IF v_current_count >= v_max_positions THEN
    RAISE EXCEPTION 'Maximum positions (%) reached for title %', v_max_positions, p_title_code;
  END IF;
  
  -- Deactivate previous assignments for this user in this program
  UPDATE title_assignments
  SET is_active = false
  WHERE user_id = p_user_id 
    AND (p_program_id IS NULL OR program_id = p_program_id);
  
  -- Create new assignment
  INSERT INTO title_assignments (user_id, title_id, program_id, assigned_by, is_active)
  VALUES (p_user_id, v_title_id, p_program_id, p_assigned_by, true)
  RETURNING id INTO v_assignment_id;
  
  -- Update user's current title if it's a permanent assignment
  IF p_program_id IS NULL THEN
    UPDATE users 
    SET current_title_id = v_title_id, unit = v_unit
    WHERE id = p_user_id;
  END IF;
  
  RETURN v_assignment_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. CREATE FUNCTION TO REASSIGN TITLE
-- ============================================================================

CREATE OR REPLACE FUNCTION reassign_title(
  p_from_user_id UUID,
  p_to_user_id UUID,
  p_title_code TEXT,
  p_program_id UUID DEFAULT NULL,
  p_assigned_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_title_id UUID;
  v_is_fixed BOOLEAN;
  v_assignment_id UUID;
BEGIN
  -- Get title details
  SELECT id, is_fixed INTO v_title_id, v_is_fixed
  FROM official_titles 
  WHERE code = p_title_code;
  
  IF v_title_id IS NULL THEN
    RAISE EXCEPTION 'Title % not found', p_title_code;
  END IF;
  
  -- Check if title is fixed
  IF v_is_fixed THEN
    RAISE EXCEPTION 'Cannot reassign fixed title %', p_title_code;
  END IF;
  
  -- Deactivate old assignment
  UPDATE title_assignments
  SET is_active = false
  WHERE user_id = p_from_user_id 
    AND title_id = v_title_id
    AND (p_program_id IS NULL OR program_id = p_program_id);
  
  -- Assign to new user
  SELECT assign_title(p_to_user_id, p_title_code, p_program_id, p_assigned_by)
  INTO v_assignment_id;
  
  RETURN v_assignment_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. CREATE VIEW FOR CURRENT ASSIGNMENTS
-- ============================================================================

CREATE OR REPLACE VIEW current_title_assignments AS
SELECT 
  ta.id,
  ta.user_id,
  u.full_name,
  u.email,
  ta.title_id,
  ot.code as title_code,
  ot.name as title_name,
  ot.unit,
  ot.is_fixed,
  ot.is_team_lead,
  ta.program_id,
  p.name as program_name,
  ta.assigned_by,
  assigner.full_name as assigned_by_name,
  ta.assigned_at,
  ta.is_active
FROM title_assignments ta
JOIN users u ON ta.user_id = u.id
JOIN official_titles ot ON ta.title_id = ot.id
LEFT JOIN programs p ON ta.program_id = p.id
LEFT JOIN users assigner ON ta.assigned_by = assigner.id
WHERE ta.is_active = true;

-- ============================================================================
-- 9. ENABLE RLS
-- ============================================================================

ALTER TABLE official_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE title_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for official_titles
CREATE POLICY "All authenticated users can view official titles"
  ON official_titles FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage official titles"
  ON official_titles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

-- RLS Policies for title_assignments
CREATE POLICY "All authenticated users can view title assignments"
  ON title_assignments FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage title assignments"
  ON title_assignments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'captain')
      AND is_active = true
    )
  );

-- ============================================================================
-- 10. GRANT PERMISSIONS
-- ============================================================================

GRANT ALL ON official_titles TO authenticated;
GRANT ALL ON title_assignments TO authenticated;
GRANT SELECT ON current_title_assignments TO authenticated;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Verify the migration
SELECT 'Official Titles created' as status, COUNT(*) as count FROM official_titles;
SELECT 'Title Assignments ready' as status, COUNT(*) as count FROM title_assignments;

DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'UNITS AND TITLES SYSTEM CREATED SUCCESSFULLY!';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Official Titles Available:';
  RAISE NOTICE '  FIXED TITLES (Cannot be reassigned):';
  RAISE NOTICE '    - Prof';
  RAISE NOTICE '    - Duchess';
  RAISE NOTICE '';
  RAISE NOTICE '  LEADERSHIP (Reassignable):';
  RAISE NOTICE '    - Captain';
  RAISE NOTICE '    - Vice Captain (2 positions)';
  RAISE NOTICE '';
  RAISE NOTICE '  COMMAND (Reassignable):';
  RAISE NOTICE '    - Head of Command';
  RAISE NOTICE '    - Head of Operations';
  RAISE NOTICE '    - Command';
  RAISE NOTICE '';
  RAISE NOTICE '  OSCAR UNITS (Reassignable, with Team Leads):';
  RAISE NOTICE '    - Alpha Oscar / Alpha Oscar (Team Lead)';
  RAISE NOTICE '    - Tango Oscar / Tango Oscar (Team Lead)';
  RAISE NOTICE '    - Victor Oscar / Victor Oscar (Team Lead)';
  RAISE NOTICE '    - November Oscar / November Oscar (Team Lead)';
  RAISE NOTICE '    - Echo Oscar / Echo Oscar (Team Lead)';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Functions Created:';
  RAISE NOTICE '  - assign_title(user_id, title_code, program_id, assigned_by)';
  RAISE NOTICE '  - reassign_title(from_user, to_user, title_code, program_id, assigned_by)';
  RAISE NOTICE '============================================================================';
END $$;
