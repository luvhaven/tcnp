-- FIX EXPORT COMPREHENSIVE
-- Updates the export function to include Equipment (Echo) and Staff Assignments.

CREATE OR REPLACE FUNCTION export_program_data(program_uuid UUID)
RETURNS JSONB AS $$
DECLARE
  export_data JSONB;
BEGIN
  SELECT jsonb_build_object(
    'program', (SELECT to_jsonb(p.*) FROM programs p WHERE p.id = program_uuid),
    
    -- 1. PAPAS (Protocol Officers assigned)
    'papas', (SELECT jsonb_agg(to_jsonb(pa.*)) FROM papas pa WHERE pa.program_id = program_uuid),
    
    -- 2. JOURNEYS (Movements)
    'journeys', (SELECT jsonb_agg(to_jsonb(j.*)) FROM journeys j 
                 JOIN papas pa ON j.papa_id = pa.id 
                 WHERE pa.program_id = program_uuid),
                 
    -- 3. CHEETAHS (Vehicles assigned to journeys)
    'cheetahs', (SELECT jsonb_agg(DISTINCT to_jsonb(c.*)) FROM cheetahs c
                 JOIN journeys j ON j.assigned_cheetah_id = c.id
                 JOIN papas pa ON j.papa_id = pa.id
                 WHERE pa.program_id = program_uuid),
                 
    -- 4. INCIDENTS
    'incidents', (SELECT jsonb_agg(to_jsonb(i.*)) FROM incidents i WHERE i.program_id = program_uuid),
    
    -- 5. CHAT MESSAGES
    'chat_messages', (SELECT jsonb_agg(to_jsonb(cm.*)) FROM chat_messages cm WHERE cm.program_id = program_uuid),
    
    -- 6. THEATRES (Locations used)
    'theatres', (SELECT jsonb_agg(DISTINCT to_jsonb(t.*)) FROM theatres t
                 JOIN journeys j ON j.assigned_theatre_id = t.id
                 JOIN papas pa ON j.papa_id = pa.id
                 WHERE pa.program_id = program_uuid),
                 
    -- 7. NESTS (Locations used)
    'nests', (SELECT jsonb_agg(DISTINCT to_jsonb(n.*)) FROM nests n
              JOIN journeys j ON j.assigned_nest_id = n.id
              JOIN papas pa ON j.papa_id = pa.id
              WHERE pa.program_id = program_uuid),
              
    -- 8. FLIGHT TRACKING
    'flight_tracking', (SELECT jsonb_agg(to_jsonb(ft.*)) FROM flight_tracking ft 
                        WHERE ft.papa_id IN (SELECT id FROM papas WHERE program_id = program_uuid)),

    -- 9. EQUIPMENT (Echo Module)
    'equipment', (SELECT jsonb_agg(to_jsonb(e.*)) FROM equipment e WHERE e.program_id = program_uuid),
    
    -- 10. EQUIPMENT LOGS (History for relevant equipment)
    'equipment_logs', (SELECT jsonb_agg(to_jsonb(el.*)) FROM equipment_logs el
                       JOIN equipment e ON el.equipment_id = e.id
                       WHERE e.program_id = program_uuid),
                       
    -- 11. STAFF ASSIGNMENTS (Title Assignments linked to program)
    'staff_assignments', (
      SELECT jsonb_agg(jsonb_build_object(
        'assignment', to_jsonb(ta.*),
        'user_name', u.full_name,
        'user_email', u.email,
        'title_name', ot.name,
        'title_code', ot.code
      ))
      FROM title_assignments ta
      JOIN users u ON ta.user_id = u.id
      JOIN official_titles ot ON ta.title_id = ot.id
      WHERE ta.program_id = program_uuid
    ),

    'exported_at', NOW()
  ) INTO export_data;
  
  RETURN export_data;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verification
DO $$
BEGIN
  RAISE NOTICE 'Updated export_program_data function to include Equipment and Staff Assignments.';
END $$;
