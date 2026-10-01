-- ============================================================
-- Fix official_titles names to match sidebar naming convention
-- and add missing Oscar units (Serial, Compliance, Welfare, November Den)
-- Also fix assign_title RPC to allow program role reassignment
-- ============================================================

-- Rename existing team lead titles to "Team Lead - <Unit>" format
UPDATE official_titles SET name = 'Team Lead - November (Nest)' WHERE code = 'NOVEMBER_OSCAR_LEAD';
UPDATE official_titles SET name = 'November (Nest)' WHERE code = 'NOVEMBER_OSCAR';
UPDATE official_titles SET name = 'Team Lead - Alpha' WHERE code = 'ALPHA_OSCAR_LEAD';
UPDATE official_titles SET name = 'Team Lead - Tango' WHERE code = 'TANGO_OSCAR_LEAD';
UPDATE official_titles SET name = 'Team Lead - Victor' WHERE code = 'VICTOR_OSCAR_LEAD';
UPDATE official_titles SET name = 'Team Lead - Echo' WHERE code = 'ECHO_OSCAR_LEAD';
UPDATE official_titles SET name = 'Team Lead - Delta Oscar', is_team_lead = true WHERE code = 'DELTA_OSCAR_LEAD';

-- Insert missing Oscar units
INSERT INTO official_titles (code, name, unit, is_fixed, is_team_lead, max_positions, description)
VALUES
  ('NOVEMBER_DEN', 'November (Den)', 'oscar', false, false, 20, 'Den (Residence) Officer'),
  ('NOVEMBER_DEN_LEAD', 'Team Lead - November (Den)', 'oscar', false, true, 1, 'Den (Residence) Team Lead'),
  ('SERIAL_OSCAR', 'Serial Oscar', 'oscar', false, false, 20, 'Serial / Media Officer'),
  ('SERIAL_OSCAR_LEAD', 'Team Lead - Serial', 'oscar', false, true, 1, 'Serial / Media Team Lead'),
  ('COMPLIANCE_OSCAR', 'Compliance Oscar', 'oscar', false, false, 20, 'Compliance Officer'),
  ('COMPLIANCE_OSCAR_LEAD', 'Team Lead - Compliance', 'oscar', false, true, 1, 'Compliance Team Lead'),
  ('WELFARE_OSCAR', 'Welfare Oscar', 'oscar', false, false, 20, 'Welfare Officer'),
  ('WELFARE_OSCAR_LEAD', 'Team Lead - Welfare', 'oscar', false, true, 1, 'Welfare Team Lead')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    unit = EXCLUDED.unit,
    is_team_lead = EXCLUDED.is_team_lead,
    description = EXCLUDED.description;

-- Move legacy titles out of main units
UPDATE official_titles SET unit = 'legacy' WHERE code IN ('HEAD_NOVEMBER_OSCAR', 'HEAD_ALPHA_OSCAR', 'HEAD_VICTOR_OSCAR', 'HEAD_ECHO_OSCAR');

-- Fix assign_title RPC: deactivate the user's old assignment BEFORE checking
-- max_positions so that reassignment (changing program role) doesn't fail
-- with "Maximum positions reached" or "Title is fixed and already assigned".
CREATE OR REPLACE FUNCTION assign_title(
  p_user_id UUID,
  p_title_code TEXT,
  p_program_id UUID DEFAULT NULL,
  p_assigned_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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

  -- Deactivate previous assignments for this user in this program / scope FIRST
  -- so that the same slot can be reused when re-assigning
  UPDATE title_assignments
  SET is_active = false
  WHERE user_id = p_user_id 
    AND is_active = true
    AND (
      (p_program_id IS NULL AND program_id IS NULL)
      OR (p_program_id IS NOT NULL AND program_id = p_program_id)
    );
  
  -- Check if title is fixed and already assigned to another officer
  IF v_is_fixed THEN
    SELECT COUNT(*) INTO v_current_count
    FROM title_assignments
    WHERE title_id = v_title_id 
      AND is_active = true
      AND user_id != p_user_id
      AND (
        (p_program_id IS NULL AND program_id IS NULL)
        OR (p_program_id IS NOT NULL AND program_id = p_program_id)
      );
    
    IF v_current_count > 0 THEN
      RAISE EXCEPTION 'Title % is fixed and already assigned to another officer', p_title_code;
    END IF;
  END IF;
  
  -- Check max positions (excluding other officers vs capacity)
  SELECT COUNT(*) INTO v_current_count
  FROM title_assignments
  WHERE title_id = v_title_id 
    AND is_active = true
    AND user_id != p_user_id
    AND (
      (p_program_id IS NULL AND program_id IS NULL)
      OR (p_program_id IS NOT NULL AND program_id = p_program_id)
    );
  
  IF v_current_count >= v_max_positions THEN
    RAISE EXCEPTION 'Maximum positions (%) reached for title %', v_max_positions, p_title_code;
  END IF;
  
  -- Create new assignment
  INSERT INTO title_assignments (user_id, title_id, program_id, assigned_by, is_active)
  VALUES (p_user_id, v_title_id, p_program_id, p_assigned_by, true)
  RETURNING id INTO v_assignment_id;
  
  -- Always update user's current title and unit so it reflects on their profile
  UPDATE users 
  SET current_title_id = v_title_id, unit = v_unit
  WHERE id = p_user_id;
  
  RETURN v_assignment_id;
END;
$$;
