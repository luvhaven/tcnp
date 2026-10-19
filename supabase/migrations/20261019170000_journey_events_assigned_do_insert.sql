-- Let any officer assigned as Duty Officer on a journey log its call signs.
--
-- "Operational roles can create journey events" (last defined in
-- 20260712092559_split_november_oscar_journey_events_rls.sql) only checks the
-- caller's permanent role. Officers are assigned as DO per journey regardless
-- of their permanent Oscar (e.g. a head_alpha_oscar or victor lead covering a
-- run), and for them journeys.status updated but the journey_events INSERT was
-- rejected — so traffic / route broadcasts, which exist ONLY as event rows,
-- never reached the Ops Monitor.
--
-- The role list below is preserved exactly; the only change is the added
-- public.is_assigned_do_for_journey(journey_id) branch. That helper
-- (20260901091000_guest_transport_accommodation_operations.sql) covers the
-- legacy lead columns and journey_duty_officers, excludes rejected
-- assignments, soft-deleted journeys and inactive accounts.
--
-- Idempotent: DROP IF EXISTS + CREATE.

DROP POLICY IF EXISTS "Operational roles can create journey events" ON public.journey_events;

CREATE POLICY "Operational roles can create journey events"
  ON public.journey_events FOR INSERT
  WITH CHECK (
    has_any_role(ARRAY[
      'super_admin'::user_role, 'admin'::user_role, 'captain'::user_role, 'head_of_command'::user_role,
      'delta_oscar'::user_role, 'tango_oscar'::user_role, 'head_tango_oscar'::user_role,
      'alpha_oscar'::user_role, 'november_oscar'::user_role,
      'noscar_den'::user_role, 'head_noscar_den'::user_role,
      'noscar_nest'::user_role, 'head_noscar_nest'::user_role,
      'victor_oscar'::user_role
    ])
    OR public.is_assigned_do_for_journey(journey_id)
  );
