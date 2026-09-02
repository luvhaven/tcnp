DROP POLICY IF EXISTS "Operational roles can create journey events" ON journey_events;

CREATE POLICY "Operational roles can create journey events"
  ON journey_events FOR INSERT
  WITH CHECK (has_any_role(ARRAY[
    'super_admin'::user_role, 'admin'::user_role, 'captain'::user_role, 'head_of_command'::user_role,
    'delta_oscar'::user_role, 'tango_oscar'::user_role, 'head_tango_oscar'::user_role,
    'alpha_oscar'::user_role, 'november_oscar'::user_role,
    'noscar_den'::user_role, 'head_noscar_den'::user_role,
    'noscar_nest'::user_role, 'head_noscar_nest'::user_role,
    'victor_oscar'::user_role
  ]));;
