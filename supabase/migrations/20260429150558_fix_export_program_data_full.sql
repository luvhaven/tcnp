
CREATE OR REPLACE FUNCTION public.export_program_data(program_uuid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  export_data JSONB;
BEGIN
  SELECT jsonb_build_object(
    'program', (SELECT to_jsonb(p.*) FROM programs p WHERE p.id = program_uuid),

    'papas', (SELECT jsonb_agg(to_jsonb(pa.*)) FROM papas pa WHERE pa.program_id = program_uuid),

    'journeys', (
      SELECT jsonb_agg(
        to_jsonb(j.*) ||
        jsonb_build_object(
          'papa_name', pa.full_name,
          'papa_title', pa.title,
          'cheetah_call_sign', c.call_sign,
          'cheetah_reg', c.registration_number,
          'nest_name', n.name,
          'theatre_name', t.name,
          'eagle_square_name', es.name,
          'eagle_square_code', es.code
        )
      )
      FROM journeys j
      JOIN papas pa ON j.papa_id = pa.id
      LEFT JOIN cheetahs c ON j.assigned_cheetah_id = c.id
      LEFT JOIN nests n ON j.assigned_nest_id = n.id
      LEFT JOIN theatres t ON j.assigned_theatre_id = t.id
      LEFT JOIN eagle_squares es ON j.assigned_eagle_square_id = es.id
      WHERE pa.program_id = program_uuid
    ),

    'cheetahs', (
      SELECT jsonb_agg(DISTINCT to_jsonb(c.*))
      FROM cheetahs c
      JOIN journeys j ON j.assigned_cheetah_id = c.id
      JOIN papas pa ON j.papa_id = pa.id
      WHERE pa.program_id = program_uuid
    ),

    'incidents', (
      SELECT jsonb_agg(
        to_jsonb(i.*) ||
        jsonb_build_object('reporter_name', u.full_name, 'reporter_oscar', u.oscar)
      )
      FROM incidents i
      LEFT JOIN users u ON i.reported_by = u.id
      WHERE i.program_id = program_uuid
    ),

    'chat_messages', (
      SELECT jsonb_agg(
        to_jsonb(cm.*) ||
        jsonb_build_object('sender_name', u.full_name, 'sender_oscar', u.oscar)
      )
      FROM chat_messages cm
      LEFT JOIN users u ON cm.sender_id = u.id
      WHERE cm.program_id = program_uuid
        AND cm.deleted_at IS NULL
    ),

    'theatres', (
      SELECT jsonb_agg(DISTINCT to_jsonb(t.*))
      FROM theatres t
      JOIN journeys j ON j.assigned_theatre_id = t.id
      JOIN papas pa ON j.papa_id = pa.id
      WHERE pa.program_id = program_uuid
    ),

    'nests', (
      SELECT jsonb_agg(DISTINCT to_jsonb(n.*))
      FROM nests n
      JOIN journeys j ON j.assigned_nest_id = n.id
      JOIN papas pa ON j.papa_id = pa.id
      WHERE pa.program_id = program_uuid
    ),

    'eagle_squares', (
      SELECT jsonb_agg(DISTINCT to_jsonb(es.*))
      FROM eagle_squares es
      JOIN journeys j ON j.assigned_eagle_square_id = es.id
      JOIN papas pa ON j.papa_id = pa.id
      WHERE pa.program_id = program_uuid
    ),

    'flight_tracking', (
      SELECT jsonb_agg(to_jsonb(ft.*))
      FROM flight_tracking ft
      WHERE ft.papa_id IN (SELECT id FROM papas WHERE program_id = program_uuid)
    ),

    'equipment', (SELECT jsonb_agg(to_jsonb(e.*)) FROM equipment e WHERE e.program_id = program_uuid),

    'equipment_logs', (
      SELECT jsonb_agg(to_jsonb(el.*))
      FROM equipment_logs el
      JOIN equipment e ON el.equipment_id = e.id
      WHERE e.program_id = program_uuid
    ),

    'staff_assignments', (
      SELECT jsonb_agg(jsonb_build_object(
        'user_name', u.full_name,
        'user_email', u.email,
        'user_oscar', u.oscar,
        'title_name', ta.title_name,
        'title_code', ta.title_code,
        'assigned_at', ta.assigned_at,
        'is_team_lead', ta.is_team_lead
      ))
      FROM current_title_assignments ta
      JOIN users u ON ta.user_id = u.id
      WHERE ta.program_id = program_uuid
        AND ta.is_active = true
    ),

    'exported_at', NOW()
  ) INTO export_data;

  RETURN export_data;
END;
$$;
;
