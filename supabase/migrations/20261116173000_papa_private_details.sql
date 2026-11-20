-- Papa passport privacy (2026-11-16).
--
-- Passport numbers move out of public.papas into public.papa_private_details,
-- which only these people can read or write:
--   can_view_papa_passport(papa) = is_admin() OR can_coordinate_unit('alpha')
-- (Command / platform admins, plus the Alpha head and sub-leads who handle
-- immigration). Ordinary members of any unit, Delta Oscars and other units no
-- longer see passports. DELETE is is_admin() only.
--
-- Also in this file:
--   * export_program_data is admin/Command only, and its Papa rows carry no
--     phone, email or passport (personal-assistant phone/email removed too).
--   * program_exports: read your own exports, or all as is_admin(); only
--     is_admin() can store one.
--   * papas_basic: anon loses every privilege; authenticated keeps SELECT
--     only (the view bypasses papas RLS, so writes through it are revoked).
--   * Audit: papa_private_details is never attached to the generic audit
--     triggers (they copy whole rows). Its own trigger records which fields
--     changed, never their values.
--
-- Depends on 20261116170000_unit_access_single_rule.sql (can_coordinate_unit
-- semantics). Idempotent; no BEGIN/COMMIT.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. The private table
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.papa_private_details (
  papa_id uuid PRIMARY KEY REFERENCES public.papas(id) ON DELETE CASCADE,
  passport_number text,
  passport_country text,
  passport_expiry date,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT papa_private_details_passport_number_length
    CHECK (passport_number IS NULL OR char_length(passport_number) BETWEEN 1 AND 64),
  CONSTRAINT papa_private_details_passport_country_length
    CHECK (passport_country IS NULL OR char_length(passport_country) BETWEEN 1 AND 80)
);

COMMENT ON TABLE public.papa_private_details IS
  'Papa passport details. Readable and writable only through can_view_papa_passport() (is_admin() or an Alpha head/sub-lead). Never attach the generic audit triggers: they copy whole rows into audit_logs.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Who may see / edit a Papa''s passport
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_view_papa_passport(target_papa uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT target_papa IS NOT NULL
    AND (public.is_admin() OR public.can_coordinate_unit('alpha'));
$$;

COMMENT ON FUNCTION public.can_view_papa_passport(uuid) IS
  'Passport access: is_admin() (Command and platform admins) OR can_coordinate_unit(''alpha'') (Alpha head or sub-lead). Client mirror: lib/papa-privacy.ts canViewPapaPassport.';

REVOKE ALL ON FUNCTION public.can_view_papa_passport(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_papa_passport(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_view_papa_passport(uuid) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Normalise + stamp writes
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.stamp_papa_private_details()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.papa_id IS DISTINCT FROM OLD.papa_id THEN
    RAISE EXCEPTION 'A passport record cannot be moved to another Papa' USING ERRCODE = '22023';
  END IF;
  NEW.passport_number := nullif(btrim(NEW.passport_number), '');
  NEW.passport_country := nullif(btrim(NEW.passport_country), '');
  NEW.updated_at := now();
  -- The signed-in writer is recorded; a client cannot name someone else.
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_papa_private_details() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stamp_papa_private_details() FROM anon;

DROP TRIGGER IF EXISTS papa_private_details_stamp ON public.papa_private_details;
CREATE TRIGGER papa_private_details_stamp
  BEFORE INSERT OR UPDATE ON public.papa_private_details
  FOR EACH ROW EXECUTE FUNCTION public.stamp_papa_private_details();

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Audit: field names only, never values
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.audit_papa_private_details()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_papa uuid := COALESCE(NEW.papa_id, OLD.papa_id);
  v_fields text[] := ARRAY[]::text[];
  v_action text := lower(TG_OP);
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.passport_number IS DISTINCT FROM OLD.passport_number THEN v_fields := array_append(v_fields, 'passport_number'); END IF;
    IF NEW.passport_country IS DISTINCT FROM OLD.passport_country THEN v_fields := array_append(v_fields, 'passport_country'); END IF;
    IF NEW.passport_expiry IS DISTINCT FROM OLD.passport_expiry THEN v_fields := array_append(v_fields, 'passport_expiry'); END IF;
    IF cardinality(v_fields) = 0 THEN
      RETURN NULL;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.passport_number IS NOT NULL THEN v_fields := array_append(v_fields, 'passport_number'); END IF;
    IF NEW.passport_country IS NOT NULL THEN v_fields := array_append(v_fields, 'passport_country'); END IF;
    IF NEW.passport_expiry IS NOT NULL THEN v_fields := array_append(v_fields, 'passport_expiry'); END IF;
  ELSE
    IF OLD.passport_number IS NOT NULL THEN v_fields := array_append(v_fields, 'passport_number'); END IF;
    IF OLD.passport_country IS NOT NULL THEN v_fields := array_append(v_fields, 'passport_country'); END IF;
    IF OLD.passport_expiry IS NOT NULL THEN v_fields := array_append(v_fields, 'passport_expiry'); END IF;
  END IF;

  IF v_actor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_actor) THEN
    v_actor := NULL;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, target_type, target_id, changes, description, metadata, created_at)
  VALUES (
    v_actor,
    v_action,
    'papa_private_details',
    v_papa,
    jsonb_build_object('fields', to_jsonb(v_fields)),
    initcap(v_action) || ' Papa passport details',
    jsonb_build_object('trigger', TG_NAME, 'schema', TG_TABLE_SCHEMA, 'table', TG_TABLE_NAME, 'values_logged', false),
    now()
  );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_papa_private_details() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_papa_private_details() FROM anon;

DROP TRIGGER IF EXISTS papa_private_details_audit ON public.papa_private_details;
CREATE TRIGGER papa_private_details_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.papa_private_details
  FOR EACH ROW EXECUTE FUNCTION public.audit_papa_private_details();

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Row-level security
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.papa_private_details ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.papa_private_details FROM PUBLIC;
REVOKE ALL ON public.papa_private_details FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.papa_private_details TO authenticated;
GRANT ALL ON public.papa_private_details TO service_role;

DROP POLICY IF EXISTS papa_private_details_select ON public.papa_private_details;
CREATE POLICY papa_private_details_select ON public.papa_private_details
  FOR SELECT TO authenticated
  USING (public.can_view_papa_passport(papa_id));

DROP POLICY IF EXISTS papa_private_details_insert ON public.papa_private_details;
CREATE POLICY papa_private_details_insert ON public.papa_private_details
  FOR INSERT TO authenticated
  WITH CHECK (public.can_view_papa_passport(papa_id));

DROP POLICY IF EXISTS papa_private_details_update ON public.papa_private_details;
CREATE POLICY papa_private_details_update ON public.papa_private_details
  FOR UPDATE TO authenticated
  USING (public.can_view_papa_passport(papa_id))
  WITH CHECK (public.can_view_papa_passport(papa_id));

DROP POLICY IF EXISTS papa_private_details_delete ON public.papa_private_details;
CREATE POLICY papa_private_details_delete ON public.papa_private_details
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Backfill papas.passport_number into the private table
--    (0 live rows hold a passport). The column itself is NOT dropped here:
--    the front end live before this release still sends passport_number on
--    every Papa create/edit, and PostgREST would reject those writes once the
--    column is gone. 20261116220000_drop_papas_passport_number.sql copies any
--    late values again and drops it, applied after the new front end is live.
-- ───────────────────────────────────────────────────────────────────────────
DO $backfill$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'papas' AND column_name = 'passport_number'
  ) THEN
    EXECUTE $sql$
      INSERT INTO public.papa_private_details (papa_id, passport_number)
      SELECT p.id, btrim(p.passport_number)
      FROM public.papas p
      WHERE nullif(btrim(p.passport_number), '') IS NOT NULL
      ON CONFLICT (papa_id) DO UPDATE
        SET passport_number = EXCLUDED.passport_number
        WHERE public.papa_private_details.passport_number IS NULL
    $sql$;
  END IF;
END
$backfill$;

-- ───────────────────────────────────────────────────────────────────────────
-- 7. Programme export: admin/Command only, no Papa contact or passport data
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.export_program_data(program_uuid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  -- Was: any active member, for any programme. The export bypasses RLS, so it
  -- is limited to the people who already see everything (is_admin()).
  IF NOT public.is_trusted_backend() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized to export program data' USING ERRCODE = '42501';
  END IF;
  RETURN public.export_program_data_unchecked(program_uuid);
END;
$function$;

CREATE OR REPLACE FUNCTION public.export_program_data_unchecked(program_uuid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  export_data JSONB;
BEGIN
  SELECT jsonb_build_object(
    'program', (SELECT to_jsonb(p.*) FROM programs p WHERE p.id = program_uuid),

    -- No phone, email or passport for Papas; personal assistants keep their
    -- name and role but lose phone and email.
    'papas', (
      SELECT jsonb_agg(
        (to_jsonb(pa.*) - 'phone' - 'email' - 'passport_number')
        || jsonb_build_object('personal_assistants', (
          SELECT coalesce(jsonb_agg(
            CASE WHEN jsonb_typeof(assistant) = 'object' THEN assistant - 'phone' - 'email' ELSE assistant END
          ), '[]'::jsonb)
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(to_jsonb(pa.personal_assistants)) = 'array' THEN to_jsonb(pa.personal_assistants) ELSE '[]'::jsonb END
          ) AS assistant
        ))
      )
      FROM papas pa WHERE pa.program_id = program_uuid
    ),

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
$function$;

REVOKE ALL ON FUNCTION public.export_program_data(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.export_program_data(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.export_program_data(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.export_program_data_unchecked(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.export_program_data_unchecked(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.export_program_data_unchecked(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.export_program_data_unchecked(uuid) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 8. Stored exports: your own, or all for is_admin(); only is_admin() stores
-- ───────────────────────────────────────────────────────────────────────────
REVOKE ALL ON public.program_exports FROM anon;

DROP POLICY IF EXISTS allow_select_authenticated ON public.program_exports;
DROP POLICY IF EXISTS program_exports_select_own_or_admin ON public.program_exports;
CREATE POLICY program_exports_select_own_or_admin ON public.program_exports
  FOR SELECT TO authenticated
  USING (exported_by = (SELECT auth.uid()) OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS allow_insert_own_exports ON public.program_exports;
DROP POLICY IF EXISTS program_exports_insert_admin ON public.program_exports;
CREATE POLICY program_exports_insert_admin ON public.program_exports
  FOR INSERT TO authenticated
  WITH CHECK (exported_by = (SELECT auth.uid()) AND (SELECT public.is_admin()));

-- ───────────────────────────────────────────────────────────────────────────
-- 9. papas_basic: no anonymous access, read-only for signed-in officers
--    (security_invoker = false, so the view bypasses papas RLS; a write
--    through it would too).
-- ───────────────────────────────────────────────────────────────────────────
REVOKE ALL ON public.papas_basic FROM anon;
REVOKE ALL ON public.papas_basic FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.papas_basic FROM authenticated;
GRANT SELECT ON public.papas_basic TO authenticated;
GRANT SELECT ON public.papas_basic TO service_role;
