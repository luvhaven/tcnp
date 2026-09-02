-- Revert the earlier Hospitality write grant on papas — Hospitality doesn't
-- actually reference the papas table anywhere in the app. Command Centre
-- owns the Papa roster (create/edit/delete); "Admins have full access to
-- papas" (is_admin()) already covers Command Centre since role='command'
-- is in is_admin()'s role list.
DROP POLICY IF EXISTS "papas_hospitality_manage" ON public.papas;

-- Stage-linkage helpers: each unit only sees a Papa once there's a real
-- operational link to that Papa at their own stage of the operation (set
-- at planning time via the journeys row, so advance-prep visibility works
-- the same way the SOP describes, e.g. Alpha gets flight info a week out).
CREATE OR REPLACE FUNCTION public.papa_used_eagle_square(target_papa_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM papas p WHERE p.id = target_papa_id AND p.flight_number IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM journeys j
    LEFT JOIN journey_papas jp ON jp.journey_id = j.id
    WHERE (j.papa_id = target_papa_id OR jp.papa_id = target_papa_id)
      AND j.assigned_eagle_square_id IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.papa_uses_cheetah(target_papa_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM journeys j
    LEFT JOIN journey_papas jp ON jp.journey_id = j.id
    WHERE (j.papa_id = target_papa_id OR jp.papa_id = target_papa_id)
      AND j.assigned_cheetah_id IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.papa_has_nest(target_papa_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM papa_accommodations pa WHERE pa.papa_id = target_papa_id
  ) OR EXISTS (
    SELECT 1 FROM journeys j
    LEFT JOIN journey_papas jp ON jp.journey_id = j.id
    WHERE (j.papa_id = target_papa_id OR jp.papa_id = target_papa_id)
      AND j.assigned_nest_id IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.papa_has_theatre(target_papa_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM journeys j
    LEFT JOIN journey_papas jp ON jp.journey_id = j.id
    WHERE (j.papa_id = target_papa_id OR jp.papa_id = target_papa_id)
      AND j.assigned_theatre_id IS NOT NULL
  );
$$;

-- Replace the blanket "any authenticated user sees every Papa's full
-- record" policy with per-unit stage scoping. Command Centre/Admin keep
-- full access. Delta Oscar's existing "assigned to me" policy is untouched.
-- Echo shares Victor's theatre signal — its checklist/briefing work happens
-- at the theatre/Den (mic setup, water on stage), same as Victor's.
DROP POLICY IF EXISTS "Authenticated users can view basic papa info" ON public.papas;
CREATE POLICY "papas_select_stage_scoped" ON public.papas
  FOR SELECT
  USING (
    is_admin()
    OR (is_alpha_oscar() AND papa_used_eagle_square(id))
    OR (is_tango_oscar() AND papa_uses_cheetah(id))
    OR (is_november_oscar() AND papa_has_nest(id))
    OR (is_victor_oscar() AND papa_has_theatre(id))
    OR (oscar_unit_matches('echo') AND papa_has_theatre(id))
  );

-- Public "basic identity" view: name/title/photo only, no sensitive fields.
-- Used by cross-unit features that legitimately show every Papa's name
-- regardless of stage (team-chat room picker, program schedule, journey/
-- accommodation "select a Papa" dropdowns at creation time — before a
-- stage-link even exists yet). Owned by the migration role, so it reads
-- past the stage-scoped RLS above by design (documented Postgres/Supabase
-- view behavior) while only ever exposing non-sensitive columns.
CREATE OR REPLACE VIEW public.papas_basic
WITH (security_invoker = false) AS
SELECT id, full_name, title, profile_photo_url, program_id
FROM public.papas
WHERE is_deleted IS NOT TRUE;

GRANT SELECT ON public.papas_basic TO authenticated;
;
