-- Compliance: grooming / dress-code inspections and recognitions.
--
-- Basis: SOP TCNP.01.02 "Personal Grooming / Dress Code" and the During
-- Operation rule "Dress-code, appearance and personal hygiene strictly as
-- required". Depends on 20261116170000_unit_access_single_rule.sql
-- (can_coordinate_unit, is_unit_member, is_admin, is_active_member).
--
-- 1. compliance_inspections: one officer, one day, optionally one programme.
--    The checklist holds the TCNP.01.02 items, each 'pass' | 'fail' | 'na'.
--    Score and outcome are computed here, never trusted from the client.
--    Write: can_coordinate_unit('compliance') OR is_admin(); nobody writes
--    their own inspection. Read: coordinators, admin/Command, and the
--    inspected officer (own rows only). The officer acknowledges through
--    compliance_acknowledge_inspection(); they have no UPDATE policy.
--    The officer is notified (kind 'compliance_inspection') when the outcome
--    is not compliant.
-- 2. compliance_recognitions: ad-hoc awards (Best dressed, Most improved...).
--    Manage: can_coordinate_unit('compliance') OR is_admin() (Command keeps
--    oversight, e.g. hiding an unsuitable public entry); nobody recognises
--    themselves. Read: public rows by any
--    active member; private rows by the officer, coordinators and
--    admin/Command. The officer is notified (kind 'compliance_recognition').
--
-- Idempotent: IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS.

-- ───────────────────────── Checklist items ─────────────────────────
CREATE OR REPLACE FUNCTION public.compliance_inspection_item_keys()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY[
    'haircut',        -- decent haircut / style
    'manicure',       -- well manicured and pedicured
    'hygiene',        -- good personal hygiene
    'dress_code',     -- the dress code determined for the event
    'apparel_spec',   -- on-duty apparel of the approved type and kind
    'black_shoes',    -- comfortable black shoes
    'jewellery',      -- no heavy jewellery
    'makeup',         -- moderate make-up (female POs; 'na' otherwise)
    'clean_apparel'   -- apparel clean
  ]::text[];
$$;

CREATE OR REPLACE FUNCTION public.compliance_inspection_item_label(item_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE item_key
    WHEN 'haircut' THEN 'Haircut / style'
    WHEN 'manicure' THEN 'Manicure & pedicure'
    WHEN 'hygiene' THEN 'Personal hygiene'
    WHEN 'dress_code' THEN 'Event dress code'
    WHEN 'apparel_spec' THEN 'Approved on-duty apparel'
    WHEN 'black_shoes' THEN 'Black shoes'
    WHEN 'jewellery' THEN 'No heavy jewellery'
    WHEN 'makeup' THEN 'Moderate make-up'
    WHEN 'clean_apparel' THEN 'Clean apparel'
    ELSE item_key
  END;
$$;

REVOKE ALL ON FUNCTION public.compliance_inspection_item_keys() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compliance_inspection_item_keys() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.compliance_inspection_item_label(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compliance_inspection_item_label(text) TO authenticated, service_role;

-- ───────────────────────── Inspections ─────────────────────────
CREATE TABLE IF NOT EXISTS public.compliance_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- CASCADE, not SET NULL: a programme's inspections go with it. SET NULL
  -- could collide with the officer's no-programme row for the same day on
  -- compliance_inspections_one_per_day and make the programme delete fail.
  program_id uuid REFERENCES public.programs(id) ON DELETE CASCADE,
  inspected_on date NOT NULL DEFAULT ((now() AT TIME ZONE 'Africa/Lagos')::date),
  inspector_id uuid REFERENCES public.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  score numeric(5,2) NOT NULL DEFAULT 0,
  outcome text NOT NULL DEFAULT 'non_compliant',
  notes text,
  follow_up_due date,
  acknowledged_at timestamptz,
  officer_comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compliance_inspections_score_range CHECK (score >= 0 AND score <= 100),
  CONSTRAINT compliance_inspections_outcome CHECK (outcome IN ('compliant', 'minor', 'non_compliant')),
  CONSTRAINT compliance_inspections_checklist_object CHECK (jsonb_typeof(checklist) = 'object'),
  CONSTRAINT compliance_inspections_notes_length CHECK (notes IS NULL OR char_length(notes) <= 2000),
  CONSTRAINT compliance_inspections_comment_length CHECK (officer_comment IS NULL OR char_length(officer_comment) <= 500),
  CONSTRAINT compliance_inspections_follow_up_order CHECK (follow_up_due IS NULL OR follow_up_due >= inspected_on)
);

-- One inspection per officer per programme (or none) per day. A same-day
-- re-check edits that record.
CREATE UNIQUE INDEX IF NOT EXISTS compliance_inspections_one_per_day
  ON public.compliance_inspections (officer_id, coalesce(program_id, '00000000-0000-0000-0000-000000000000'::uuid), inspected_on);
CREATE INDEX IF NOT EXISTS idx_compliance_inspections_officer_day
  ON public.compliance_inspections (officer_id, inspected_on DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_inspections_program_day
  ON public.compliance_inspections (program_id, inspected_on DESC);

ALTER TABLE public.compliance_inspections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.compliance_inspections FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.compliance_inspections TO authenticated;

-- Validates the checklist, computes score + outcome, pins who did what.
-- Score = pass / (pass + fail) * 100; 'na' is left out. Outcome: no fails =
-- compliant; score >= 75 = minor; otherwise non_compliant. lib mirror:
-- components/compliance/inspection-logic.ts (scoreInspection).
CREATE OR REPLACE FUNCTION public.compliance_inspection_prepare()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  me uuid := auth.uid();
  item_key text;
  item_value text;
  passes int := 0;
  fails int := 0;
BEGIN
  IF NEW.checklist IS NULL OR jsonb_typeof(NEW.checklist) <> 'object' THEN
    RAISE EXCEPTION 'The checklist must list each item as pass, fail or n/a' USING ERRCODE = '22023';
  END IF;

  FOR item_key, item_value IN SELECT key, value FROM jsonb_each_text(NEW.checklist) LOOP
    IF NOT (item_key = ANY (public.compliance_inspection_item_keys())) THEN
      RAISE EXCEPTION 'Unknown checklist item: %', item_key USING ERRCODE = '22023';
    END IF;
    IF item_value = 'pass' THEN passes := passes + 1;
    ELSIF item_value = 'fail' THEN fails := fails + 1;
    ELSIF item_value IS DISTINCT FROM 'na' THEN
      RAISE EXCEPTION 'Checklist item % must be pass, fail or n/a', item_key USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF passes + fails = 0 THEN
    RAISE EXCEPTION 'Mark at least one checklist item as pass or fail' USING ERRCODE = '22023';
  END IF;

  NEW.score := round(passes * 100.0 / (passes + fails), 2);
  NEW.outcome := CASE
    WHEN fails = 0 THEN 'compliant'
    WHEN NEW.score >= 75 THEN 'minor'
    ELSE 'non_compliant'
  END;
  NEW.notes := nullif(btrim(NEW.notes), '');
  NEW.updated_at := now();

  IF TG_OP = 'INSERT' THEN
    IF me IS NOT NULL THEN
      NEW.inspector_id := me;
      IF NEW.officer_id = me THEN
        RAISE EXCEPTION 'You cannot inspect yourself' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = NEW.officer_id AND coalesce(u.is_active, false)) THEN
      RAISE EXCEPTION 'Only an active officer can be inspected' USING ERRCODE = '22023';
    END IF;
    -- Only the officer acknowledges, and only through the RPC.
    NEW.acknowledged_at := NULL;
    NEW.officer_comment := NULL;
    NEW.created_at := now();
  ELSE
    IF NEW.officer_id IS DISTINCT FROM OLD.officer_id THEN
      RAISE EXCEPTION 'An inspection cannot be moved to another officer' USING ERRCODE = '22023';
    END IF;
    -- Pinned, except when the inspector's account is gone: the FK's
    -- ON DELETE SET NULL must be allowed to clear it, or the row would keep
    -- pointing at a deleted user (Postgres skips the FK re-check when the
    -- key ends up unchanged).
    IF NOT (NEW.inspector_id IS NULL AND OLD.inspector_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = OLD.inspector_id)) THEN
      NEW.inspector_id := OLD.inspector_id;
    END IF;
    NEW.created_at := OLD.created_at;
    IF me IS DISTINCT FROM OLD.officer_id THEN
      NEW.acknowledged_at := OLD.acknowledged_at;
      NEW.officer_comment := OLD.officer_comment;
    END IF;
    -- A changed result needs a fresh acknowledgement.
    IF NEW.checklist IS DISTINCT FROM OLD.checklist THEN
      NEW.acknowledged_at := NULL;
      NEW.officer_comment := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.compliance_inspection_prepare() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS compliance_inspections_prepare ON public.compliance_inspections;
CREATE TRIGGER compliance_inspections_prepare
BEFORE INSERT OR UPDATE ON public.compliance_inspections
FOR EACH ROW EXECUTE FUNCTION public.compliance_inspection_prepare();

-- Tell the officer when a check found something to fix.
CREATE OR REPLACE FUNCTION public.notify_compliance_inspection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  program_label text;
  failed_items text;
BEGIN
  IF NEW.outcome = 'compliant' THEN RETURN NEW; END IF;
  -- On an edit, tell the officer again when the outcome changed or when the
  -- failed items changed (the prepare trigger then also cleared any earlier
  -- acknowledgement, so the officer must be told there is something new).
  IF TG_OP = 'UPDATE'
     AND NEW.outcome IS NOT DISTINCT FROM OLD.outcome
     AND NOT (OLD.acknowledged_at IS NOT NULL AND NEW.acknowledged_at IS NULL)
     AND ARRAY(
       SELECT k FROM unnest(public.compliance_inspection_item_keys()) AS k
       WHERE NEW.checklist ->> k = 'fail' ORDER BY k
     ) IS NOT DISTINCT FROM ARRAY(
       SELECT k FROM unnest(public.compliance_inspection_item_keys()) AS k
       WHERE OLD.checklist ->> k = 'fail' ORDER BY k
     )
  THEN RETURN NEW; END IF;
  IF NEW.officer_id = auth.uid() THEN RETURN NEW; END IF;

  SELECT name INTO program_label FROM public.programs WHERE id = NEW.program_id;
  SELECT string_agg(public.compliance_inspection_item_label(item.key), ', ' ORDER BY item.ord)
  INTO failed_items
  FROM unnest(public.compliance_inspection_item_keys()) WITH ORDINALITY AS item(key, ord)
  WHERE NEW.checklist ->> item.key = 'fail';

  INSERT INTO public.notifications (user_id, title, message, type, channel, metadata, is_read)
  VALUES (
    NEW.officer_id,
    CASE NEW.outcome WHEN 'minor' THEN 'Grooming check: minor issues' ELSE 'Grooming check: action needed' END,
    'Score ' || to_char(NEW.score, 'FM990') || '%'
      || coalesce(' — ' || program_label, '')
      || coalesce('. To fix: ' || failed_items, '')
      || '. Open Compliance to review and acknowledge.',
    CASE NEW.outcome WHEN 'minor' THEN 'info' ELSE 'alert' END,
    'push',
    jsonb_build_object(
      'kind', 'compliance_inspection',
      'unit_slug', 'compliance',
      'inspection_id', NEW.id,
      'program_id', NEW.program_id,
      'outcome', NEW.outcome
    ),
    false
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_compliance_inspection() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS compliance_inspections_notify ON public.compliance_inspections;
CREATE TRIGGER compliance_inspections_notify
AFTER INSERT OR UPDATE OF checklist ON public.compliance_inspections
FOR EACH ROW EXECUTE FUNCTION public.notify_compliance_inspection();

DROP POLICY IF EXISTS compliance_inspections_select ON public.compliance_inspections;
CREATE POLICY compliance_inspections_select ON public.compliance_inspections FOR SELECT TO authenticated
USING (
  officer_id = auth.uid()
  OR public.can_coordinate_unit('compliance')
  OR public.is_admin()
);

DROP POLICY IF EXISTS compliance_inspections_insert ON public.compliance_inspections;
CREATE POLICY compliance_inspections_insert ON public.compliance_inspections FOR INSERT TO authenticated
WITH CHECK (
  officer_id <> auth.uid()
  AND (public.can_coordinate_unit('compliance') OR public.is_admin())
);

DROP POLICY IF EXISTS compliance_inspections_update ON public.compliance_inspections;
CREATE POLICY compliance_inspections_update ON public.compliance_inspections FOR UPDATE TO authenticated
USING (
  officer_id <> auth.uid()
  AND (public.can_coordinate_unit('compliance') OR public.is_admin())
)
WITH CHECK (
  officer_id <> auth.uid()
  AND (public.can_coordinate_unit('compliance') OR public.is_admin())
);

DROP POLICY IF EXISTS compliance_inspections_delete ON public.compliance_inspections;
CREATE POLICY compliance_inspections_delete ON public.compliance_inspections FOR DELETE TO authenticated
USING (
  officer_id <> auth.uid()
  AND (public.can_coordinate_unit('compliance') OR public.is_admin())
);

-- The inspected officer acknowledges (optionally with a short comment).
-- Idempotent: a second call returns the first acknowledgement.
CREATE OR REPLACE FUNCTION public.compliance_acknowledge_inspection(target_inspection uuid, note text DEFAULT NULL)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  me uuid := auth.uid();
  stamp timestamptz;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Sign in to acknowledge an inspection' USING ERRCODE = '42501';
  END IF;
  IF note IS NOT NULL AND char_length(note) > 500 THEN
    RAISE EXCEPTION 'Keep the comment under 500 characters' USING ERRCODE = '22023';
  END IF;

  UPDATE public.compliance_inspections inspection
  SET acknowledged_at = now(),
      officer_comment = nullif(btrim(note), '')
  WHERE inspection.id = target_inspection
    AND inspection.officer_id = me
    AND inspection.acknowledged_at IS NULL
  RETURNING inspection.acknowledged_at INTO stamp;

  IF stamp IS NOT NULL THEN RETURN stamp; END IF;

  SELECT inspection.acknowledged_at INTO stamp
  FROM public.compliance_inspections inspection
  WHERE inspection.id = target_inspection AND inspection.officer_id = me;
  IF stamp IS NULL THEN
    RAISE EXCEPTION 'This inspection is not yours to acknowledge' USING ERRCODE = '42501';
  END IF;
  RETURN stamp;
END;
$$;

REVOKE ALL ON FUNCTION public.compliance_acknowledge_inspection(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compliance_acknowledge_inspection(uuid, text) TO authenticated, service_role;

-- ───────────────────────── Recognitions ─────────────────────────
CREATE TABLE IF NOT EXISTS public.compliance_recognitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL,
  award_type text NOT NULL DEFAULT 'commendation',
  title text NOT NULL,
  citation text,
  awarded_on date NOT NULL DEFAULT ((now() AT TIME ZONE 'Africa/Lagos')::date),
  awarded_by uuid REFERENCES public.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  visibility text NOT NULL DEFAULT 'public',
  nominee_id uuid REFERENCES public.compliance_award_nominees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compliance_recognitions_award_type CHECK (award_type IN ('best_dressed', 'most_improved', 'excellence', 'commendation', 'other')),
  CONSTRAINT compliance_recognitions_visibility CHECK (visibility IN ('public', 'private')),
  CONSTRAINT compliance_recognitions_title_length CHECK (char_length(btrim(title)) BETWEEN 2 AND 120),
  CONSTRAINT compliance_recognitions_citation_length CHECK (citation IS NULL OR char_length(citation) <= 1000)
);

CREATE INDEX IF NOT EXISTS idx_compliance_recognitions_awarded
  ON public.compliance_recognitions (awarded_on DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_recognitions_officer
  ON public.compliance_recognitions (officer_id, awarded_on DESC);
-- A formal award winner goes on the wall once.
CREATE UNIQUE INDEX IF NOT EXISTS compliance_recognitions_one_per_nominee
  ON public.compliance_recognitions (nominee_id) WHERE nominee_id IS NOT NULL;

ALTER TABLE public.compliance_recognitions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.compliance_recognitions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.compliance_recognitions TO authenticated;

CREATE OR REPLACE FUNCTION public.compliance_recognition_prepare()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  me uuid := auth.uid();
  linked_user uuid;
BEGIN
  NEW.title := btrim(NEW.title);
  NEW.citation := nullif(btrim(NEW.citation), '');
  NEW.updated_at := now();

  IF NEW.nominee_id IS NOT NULL THEN
    SELECT nominee.nominee_user_id INTO linked_user
    FROM public.compliance_award_nominees nominee WHERE nominee.id = NEW.nominee_id;
    IF linked_user IS DISTINCT FROM NEW.officer_id THEN
      RAISE EXCEPTION 'The linked award nominee is a different officer' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF me IS NOT NULL THEN
      NEW.awarded_by := me;
      IF NEW.officer_id = me THEN
        RAISE EXCEPTION 'You cannot recognise yourself' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = NEW.officer_id AND coalesce(u.is_active, false)) THEN
      RAISE EXCEPTION 'Only an active officer can be recognised' USING ERRCODE = '22023';
    END IF;
    NEW.created_at := now();
  ELSE
    IF NEW.officer_id IS DISTINCT FROM OLD.officer_id THEN
      RAISE EXCEPTION 'A recognition cannot be moved to another officer' USING ERRCODE = '22023';
    END IF;
    -- Pinned, except when the awarder's account is gone (FK ON DELETE SET NULL).
    IF NOT (NEW.awarded_by IS NULL AND OLD.awarded_by IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = OLD.awarded_by)) THEN
      NEW.awarded_by := OLD.awarded_by;
    END IF;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.compliance_recognition_prepare() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS compliance_recognitions_prepare ON public.compliance_recognitions;
CREATE TRIGGER compliance_recognitions_prepare
BEFORE INSERT OR UPDATE ON public.compliance_recognitions
FOR EACH ROW EXECUTE FUNCTION public.compliance_recognition_prepare();

CREATE OR REPLACE FUNCTION public.notify_compliance_recognition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  program_label text;
BEGIN
  IF NEW.officer_id = auth.uid() THEN RETURN NEW; END IF;
  SELECT name INTO program_label FROM public.programs WHERE id = NEW.program_id;

  INSERT INTO public.notifications (user_id, title, message, type, channel, metadata, is_read)
  VALUES (
    NEW.officer_id,
    'You have been recognised',
    NEW.title || coalesce(' — ' || program_label, '') || '. Well done from Compliance.',
    'info',
    'push',
    jsonb_build_object(
      'kind', 'compliance_recognition',
      'unit_slug', 'compliance',
      'recognition_id', NEW.id,
      'program_id', NEW.program_id,
      'visibility', NEW.visibility
    ),
    false
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_compliance_recognition() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS compliance_recognitions_notify ON public.compliance_recognitions;
CREATE TRIGGER compliance_recognitions_notify
AFTER INSERT ON public.compliance_recognitions
FOR EACH ROW EXECUTE FUNCTION public.notify_compliance_recognition();

DROP POLICY IF EXISTS compliance_recognitions_select ON public.compliance_recognitions;
CREATE POLICY compliance_recognitions_select ON public.compliance_recognitions FOR SELECT TO authenticated
USING (
  (visibility = 'public' AND public.is_active_member())
  OR officer_id = auth.uid()
  OR public.can_coordinate_unit('compliance')
  OR public.is_admin()
);

DROP POLICY IF EXISTS compliance_recognitions_insert ON public.compliance_recognitions;
CREATE POLICY compliance_recognitions_insert ON public.compliance_recognitions FOR INSERT TO authenticated
WITH CHECK (officer_id <> auth.uid() AND (public.can_coordinate_unit('compliance') OR public.is_admin()));

DROP POLICY IF EXISTS compliance_recognitions_update ON public.compliance_recognitions;
CREATE POLICY compliance_recognitions_update ON public.compliance_recognitions FOR UPDATE TO authenticated
USING (officer_id <> auth.uid() AND (public.can_coordinate_unit('compliance') OR public.is_admin()))
WITH CHECK (officer_id <> auth.uid() AND (public.can_coordinate_unit('compliance') OR public.is_admin()));

DROP POLICY IF EXISTS compliance_recognitions_delete ON public.compliance_recognitions;
CREATE POLICY compliance_recognitions_delete ON public.compliance_recognitions FOR DELETE TO authenticated
USING (officer_id <> auth.uid() AND (public.can_coordinate_unit('compliance') OR public.is_admin()));
