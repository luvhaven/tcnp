-- Fix for "could not identify an equality operator for type json" error
-- This error occurs because DISTINCT is applied to json type (from row_to_json)
-- We switch to to_jsonb which supports equality comparison

CREATE OR REPLACE FUNCTION export_program_data(program_uuid UUID)
RETURNS JSONB AS $$
DECLARE
  export_data JSONB;
BEGIN
  SELECT jsonb_build_object(
    'program', (SELECT to_jsonb(p.*) FROM programs p WHERE p.id = program_uuid),
    'papas', (SELECT jsonb_agg(to_jsonb(pa.*)) FROM papas pa WHERE pa.program_id = program_uuid),
    'journeys', (SELECT jsonb_agg(to_jsonb(j.*)) FROM journeys j 
                 JOIN papas pa ON j.papa_id = pa.id 
                 WHERE pa.program_id = program_uuid),
    'cheetahs', (SELECT jsonb_agg(DISTINCT to_jsonb(c.*)) FROM cheetahs c
                 JOIN journeys j ON j.assigned_cheetah_id = c.id
                 JOIN papas pa ON j.papa_id = pa.id
                 WHERE pa.program_id = program_uuid),
    'incidents', (SELECT jsonb_agg(to_jsonb(i.*)) FROM incidents i WHERE i.program_id = program_uuid),
    'chat_messages', (SELECT jsonb_agg(to_jsonb(cm.*)) FROM chat_messages cm WHERE cm.program_id = program_uuid),
    'theatres', (SELECT jsonb_agg(DISTINCT to_jsonb(t.*)) FROM theatres t
                 JOIN journeys j ON j.assigned_theatre_id = t.id
                 JOIN papas pa ON j.papa_id = pa.id
                 WHERE pa.program_id = program_uuid),
    'nests', (SELECT jsonb_agg(DISTINCT to_jsonb(n.*)) FROM nests n
              JOIN journeys j ON j.assigned_nest_id = n.id
              JOIN papas pa ON j.papa_id = pa.id
              WHERE pa.program_id = program_uuid),
    'exported_at', NOW()
  ) INTO export_data;
  
  RETURN export_data;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
