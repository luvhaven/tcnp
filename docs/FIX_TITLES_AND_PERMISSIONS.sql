-- ============================================================================
-- FIX TITLES AND PERMISSIONS
-- ============================================================================

-- 1. Ensure official_titles table exists
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

-- 2. Ensure title_assignments table exists
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
  UNIQUE(user_id, title_id, program_id)
);

-- 3. Seed Official Titles (Idempotent)
INSERT INTO official_titles (code, name, unit, is_fixed, is_team_lead, max_positions, description) VALUES
  -- Fixed Leadership Titles
  ('PROF', 'Prof', 'leadership', true, false, 1, 'Professor - Fixed leadership position'),
  ('DUCHESS', 'Duchess', 'leadership', true, false, 1, 'Duchess - Fixed leadership position'),
  
  -- Leadership Titles
  ('CAPTAIN', 'Captain', 'leadership', false, false, 1, 'Captain - Head of all operations'),
  ('VICE_CAPTAIN', 'Vice Captain', 'leadership', false, false, 2, 'Vice Captain - Deputy to Captain (2 positions)'),
  
  -- Command Titles
  ('HEAD_OF_COMMAND', 'Head of Command', 'command', false, false, 1, 'Head of Command Center'),
  ('HEAD_OF_OPERATIONS', 'Head of Operations', 'command', false, false, 1, 'Head of Field Operations'),
  ('COMMAND', 'Command', 'command', false, false, 1, 'Command Center Officer'),
  
  -- Oscar Units
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

-- 4. Enable RLS
ALTER TABLE official_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE title_assignments ENABLE ROW LEVEL SECURITY;

-- 5. Update RLS Policies to include dev_admin and head_of_command

-- Drop existing policies to recreate them correctly
DROP POLICY IF EXISTS "Admins can manage official titles" ON official_titles;
DROP POLICY IF EXISTS "Admins can manage title assignments" ON title_assignments;

-- Recreate policies with broader access
CREATE POLICY "Admins can manage official titles"
  ON official_titles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'dev_admin', 'head_of_command')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can manage title assignments"
  ON title_assignments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'dev_admin', 'head_of_command', 'captain')
      AND is_active = true
    )
  );

-- Ensure view policies are also correct (usually SELECT is open to all authenticated)
DROP POLICY IF EXISTS "All authenticated users can view official titles" ON official_titles;
CREATE POLICY "All authenticated users can view official titles"
  ON official_titles FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "All authenticated users can view title assignments" ON title_assignments;
CREATE POLICY "All authenticated users can view title assignments"
  ON title_assignments FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 6. Ensure assign_title function exists (from migration)
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

DO $$
BEGIN
  RAISE NOTICE '✓ Fixed official_titles table and permissions for dev_admin';
END $$;
