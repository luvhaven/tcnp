-- November (Den) — Stage 3: the repository and post-operation reports.
--
-- The repository is the Den's institutional memory: SOPs, templates, guides,
-- photos and videos, searchable in one place. Reports are written in the app
-- and, the moment one is submitted, filed into the repository automatically —
-- so lessons learned are found again next year instead of being rewritten.
--
-- PRD answers honoured here: reports need no approval before they are
-- published; media is kept until the Team Lead deletes it.
--
-- Roles: every Den member and leadership (is_admin) can read. The Team Lead
-- manages the repository. Officers on a programme write its reports and add
-- media. Platform admins pass every check, as elsewhere.

-- ───────────────────────── Files ─────────────────────────

-- 1. One private bucket. Two folders, so the rules can tell them apart:
--      library/…  curated by the Team Lead
--      reports/…  media attached to reports by the officers who wrote them
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'den-repository', 'den-repository', false, 52428800,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic',
    'video/mp4', 'video/quicktime', 'video/webm',
    'application/pdf', 'text/plain', 'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS den_repository_files_select ON storage.objects;
CREATE POLICY den_repository_files_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'den-repository' AND (public.is_admin() OR public.is_unit_member('november_den')));

DROP POLICY IF EXISTS den_repository_files_insert ON storage.objects;
CREATE POLICY den_repository_files_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'den-repository'
  AND (
    ((storage.foldername(name))[1] = 'library' AND public.can_manage_unit('november_den'))
    OR ((storage.foldername(name))[1] = 'reports' AND (public.is_platform_admin() OR public.is_unit_member('november_den')))
  )
);

-- Files are a record. Only the Team Lead (or a platform admin) removes one;
-- an uploader may remove their own report media, e.g. a wrong photo.
DROP POLICY IF EXISTS den_repository_files_delete ON storage.objects;
CREATE POLICY den_repository_files_delete ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'den-repository'
  AND (
    public.can_manage_unit('november_den')
    OR ((storage.foldername(name))[1] = 'reports' AND owner_id = auth.uid()::text)
  )
);

-- ───────────────────────── Repository ─────────────────────────

CREATE TABLE IF NOT EXISTS public.den_repository_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'other',
  kind text NOT NULL DEFAULT 'document',
  -- Exactly what the item is: a stored file, a link, or text written here.
  storage_path text,
  file_name text,
  mime_type text,
  size_bytes bigint,
  external_url text,
  body text,
  tags text[] NOT NULL DEFAULT '{}',
  program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL,
  source_report_id uuid,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Filled by a trigger (below) from everything a search should find.
  search tsvector,
  CONSTRAINT den_repository_items_title CHECK (length(btrim(title)) > 0),
  CONSTRAINT den_repository_items_category CHECK (category IN ('sop', 'template', 'guide', 'report', 'media', 'vendor', 'other')),
  CONSTRAINT den_repository_items_kind CHECK (kind IN ('document', 'image', 'video', 'link', 'note', 'report')),
  CONSTRAINT den_repository_items_has_content CHECK (
    storage_path IS NOT NULL OR external_url IS NOT NULL OR nullif(btrim(coalesce(body, '')), '') IS NOT NULL
  ),
  CONSTRAINT den_repository_items_safe_url CHECK (external_url IS NULL OR external_url ~* '^https://')
);

CREATE INDEX IF NOT EXISTS idx_den_repository_items_search ON public.den_repository_items USING gin (search);
CREATE INDEX IF NOT EXISTS idx_den_repository_items_category ON public.den_repository_items(category, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS den_repository_items_one_per_report
  ON public.den_repository_items(source_report_id) WHERE source_report_id IS NOT NULL;

-- Kept by trigger rather than as a generated column: joining the tags array
-- into text is not an immutable expression, which a generated column requires.
-- Weighted so a match in the title or tags ranks above one in the body.
CREATE OR REPLACE FUNCTION public.den_repository_items_index()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.search :=
    setweight(to_tsvector('simple', coalesce(NEW.title, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(array_to_string(NEW.tags, ' '), '')), 'A')
    || setweight(to_tsvector('simple', coalesce(NEW.description, '')), 'B')
    || setweight(to_tsvector('simple', coalesce(NEW.file_name, '')), 'C')
    || setweight(to_tsvector('simple', coalesce(NEW.body, '')), 'D');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS den_repository_items_index ON public.den_repository_items;
CREATE TRIGGER den_repository_items_index
BEFORE INSERT OR UPDATE ON public.den_repository_items
FOR EACH ROW EXECUTE FUNCTION public.den_repository_items_index();

DROP TRIGGER IF EXISTS den_repository_items_set_updated_at ON public.den_repository_items;
CREATE TRIGGER den_repository_items_set_updated_at
BEFORE UPDATE ON public.den_repository_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.den_repository_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS den_repository_items_select ON public.den_repository_items;
CREATE POLICY den_repository_items_select ON public.den_repository_items
FOR SELECT TO authenticated USING (public.is_admin() OR public.is_unit_member('november_den'));

DROP POLICY IF EXISTS den_repository_items_manage ON public.den_repository_items;
CREATE POLICY den_repository_items_manage ON public.den_repository_items
FOR ALL TO authenticated
USING (public.can_manage_unit('november_den'))
WITH CHECK (public.can_manage_unit('november_den'));

-- ───────────────────────── Reports ─────────────────────────

CREATE TABLE IF NOT EXISTS public.den_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  -- post_operation: the programme's official report, one per programme.
  -- field: an officer's own account of a shift or an incident.
  report_type text NOT NULL DEFAULT 'post_operation',
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  summary text,
  what_went_well text,
  what_did_not_go_well text,
  guest_feedback text,
  recommendations text,
  lessons_learned text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT den_reports_title CHECK (length(btrim(title)) > 0),
  CONSTRAINT den_reports_type CHECK (report_type IN ('post_operation', 'field')),
  CONSTRAINT den_reports_status CHECK (status IN ('draft', 'submitted'))
);

CREATE UNIQUE INDEX IF NOT EXISTS den_reports_one_post_operation
  ON public.den_reports(program_id) WHERE report_type = 'post_operation';
CREATE INDEX IF NOT EXISTS idx_den_reports_program ON public.den_reports(program_id, created_at DESC);

DROP TRIGGER IF EXISTS den_reports_set_updated_at ON public.den_reports;
CREATE TRIGGER den_reports_set_updated_at
BEFORE UPDATE ON public.den_reports
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.den_repository_items
  DROP CONSTRAINT IF EXISTS den_repository_items_source_report_fkey;
ALTER TABLE public.den_repository_items
  ADD CONSTRAINT den_repository_items_source_report_fkey
  FOREIGN KEY (source_report_id) REFERENCES public.den_reports(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.den_report_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.den_reports(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  caption text,
  uploaded_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_den_report_media_report ON public.den_report_media(report_id, created_at);

ALTER TABLE public.den_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.den_report_media ENABLE ROW LEVEL SECURITY;

-- Who may change a report: its author, or the head / a sub-lead.
CREATE OR REPLACE FUNCTION public.can_edit_den_report(target_report uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.den_reports report
    WHERE report.id = target_report
      AND (
        public.can_coordinate_unit('november_den')
        OR (report.created_by = auth.uid() AND public.is_unit_member('november_den'))
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_edit_den_report(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_den_report(uuid) TO authenticated, service_role;

-- A draft is its author's and the coordinators'. A submitted report is
-- published to the whole Den and leadership at once — no approval step.
DROP POLICY IF EXISTS den_reports_select ON public.den_reports;
CREATE POLICY den_reports_select ON public.den_reports
FOR SELECT TO authenticated
USING (
  (status = 'submitted' AND (public.is_admin() OR public.is_unit_member('november_den')))
  OR created_by = auth.uid()
  OR public.can_coordinate_unit('november_den')
);

-- The official report is opened by the head or a sub-lead. A field report by
-- any officer doing that programme's work.
DROP POLICY IF EXISTS den_reports_insert ON public.den_reports;
CREATE POLICY den_reports_insert ON public.den_reports
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (
    public.can_coordinate_unit('november_den')
    OR (report_type = 'field' AND public.den_can_take_programme_work(auth.uid(), program_id))
  )
);

DROP POLICY IF EXISTS den_reports_update ON public.den_reports;
CREATE POLICY den_reports_update ON public.den_reports
FOR UPDATE TO authenticated
USING (public.can_edit_den_report(id))
WITH CHECK (public.can_edit_den_report(id));

DROP POLICY IF EXISTS den_reports_delete ON public.den_reports;
CREATE POLICY den_reports_delete ON public.den_reports
FOR DELETE TO authenticated
USING (public.can_manage_unit('november_den') OR (created_by = auth.uid() AND status = 'draft'));

DROP POLICY IF EXISTS den_report_media_select ON public.den_report_media;
CREATE POLICY den_report_media_select ON public.den_report_media
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.den_reports report WHERE report.id = den_report_media.report_id));

DROP POLICY IF EXISTS den_report_media_insert ON public.den_report_media;
CREATE POLICY den_report_media_insert ON public.den_report_media
FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND public.can_edit_den_report(report_id)
  AND storage_path LIKE 'reports/' || report_id::text || '/%'
);

DROP POLICY IF EXISTS den_report_media_update ON public.den_report_media;
CREATE POLICY den_report_media_update ON public.den_report_media
FOR UPDATE TO authenticated
USING (public.can_edit_den_report(report_id))
WITH CHECK (public.can_edit_den_report(report_id) AND storage_path LIKE 'reports/' || report_id::text || '/%');

DROP POLICY IF EXISTS den_report_media_delete ON public.den_report_media;
CREATE POLICY den_report_media_delete ON public.den_report_media
FOR DELETE TO authenticated
USING (public.can_manage_unit('november_den') OR uploaded_by = auth.uid());

-- 2. submitted_at is set by the database, and a submitted report stays
-- submitted: it can still be corrected, but not quietly withdrawn.
CREATE OR REPLACE FUNCTION public.guard_den_report_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.submitted_at := CASE WHEN NEW.status = 'submitted' THEN now() ELSE NULL END;
    RETURN NEW;
  END IF;

  IF OLD.status = 'submitted' AND NEW.status <> 'submitted'
     AND NOT public.is_trusted_backend()
     AND NOT public.can_manage_unit('november_den') THEN
    RAISE EXCEPTION 'A submitted report can only be reopened by the head of November (Den)' USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'submitted' AND OLD.status <> 'submitted' THEN
    NEW.submitted_at := now();
  ELSIF NEW.status <> 'submitted' THEN
    NEW.submitted_at := NULL;
  ELSE
    NEW.submitted_at := OLD.submitted_at;
  END IF;
  -- Authorship and programme never change after the fact.
  NEW.created_by := OLD.created_by;
  NEW.program_id := OLD.program_id;
  NEW.report_type := OLD.report_type;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS den_reports_guard_status ON public.den_reports;
CREATE TRIGGER den_reports_guard_status
BEFORE INSERT OR UPDATE ON public.den_reports
FOR EACH ROW EXECUTE FUNCTION public.guard_den_report_status();

-- 3. "When the report is completed, it is stored in the repository." Filing is
-- done by the database, so it cannot be forgotten, and is kept in step when a
-- submitted report is corrected.
CREATE OR REPLACE FUNCTION public.file_den_report_in_repository()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  program_label text;
  compiled text;
BEGIN
  IF NEW.status <> 'submitted' THEN
    -- Reopened by the head: take the filed copy out until it is submitted again.
    DELETE FROM public.den_repository_items WHERE source_report_id = NEW.id;
    RETURN NEW;
  END IF;

  SELECT name INTO program_label FROM public.programs WHERE id = NEW.program_id;
  compiled := concat_ws(E'\n\n',
    nullif(btrim(coalesce(NEW.summary, '')), ''),
    CASE WHEN nullif(btrim(coalesce(NEW.what_went_well, '')), '') IS NOT NULL THEN 'What went well: ' || NEW.what_went_well END,
    CASE WHEN nullif(btrim(coalesce(NEW.what_did_not_go_well, '')), '') IS NOT NULL THEN 'What did not go well: ' || NEW.what_did_not_go_well END,
    CASE WHEN nullif(btrim(coalesce(NEW.guest_feedback, '')), '') IS NOT NULL THEN 'Guest feedback: ' || NEW.guest_feedback END,
    CASE WHEN nullif(btrim(coalesce(NEW.recommendations, '')), '') IS NOT NULL THEN 'Recommendations: ' || NEW.recommendations END,
    CASE WHEN nullif(btrim(coalesce(NEW.lessons_learned, '')), '') IS NOT NULL THEN 'Lessons learned: ' || NEW.lessons_learned END
  );

  INSERT INTO public.den_repository_items (
    title, description, category, kind, body, tags, program_id, source_report_id, created_by
  )
  VALUES (
    NEW.title,
    CASE WHEN NEW.report_type = 'post_operation' THEN 'Post-operation report' ELSE 'Field report' END
      || coalesce(' — ' || program_label, ''),
    'report',
    'report',
    coalesce(nullif(compiled, ''), NEW.title),
    ARRAY['report', NEW.report_type],
    NEW.program_id,
    NEW.id,
    NEW.created_by
  )
  ON CONFLICT (source_report_id) WHERE source_report_id IS NOT NULL
  DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    body = EXCLUDED.body,
    program_id = EXCLUDED.program_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS den_reports_file_in_repository ON public.den_reports;
CREATE TRIGGER den_reports_file_in_repository
AFTER INSERT OR UPDATE ON public.den_reports
FOR EACH ROW EXECUTE FUNCTION public.file_den_report_in_repository();

-- 4. Which programmes still owe a post-operation report: ended, with a Den
-- plan, and nothing submitted. Counts and names only.
CREATE OR REPLACE FUNCTION public.den_outstanding_reports()
RETURNS TABLE (program_id uuid, program_name text, end_date date, has_draft boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT program.id, program.name, program.end_date,
    EXISTS (SELECT 1 FROM public.den_reports r WHERE r.program_id = program.id AND r.report_type = 'post_operation')
  FROM public.programs program
  WHERE (public.is_admin() OR public.is_unit_member('november_den'))
    AND coalesce(program.end_date, program.start_date) < CURRENT_DATE
    AND EXISTS (SELECT 1 FROM public.den_operations plan WHERE plan.program_id = program.id AND plan.status <> 'archived')
    AND NOT EXISTS (
      SELECT 1 FROM public.den_reports r
      WHERE r.program_id = program.id AND r.report_type = 'post_operation' AND r.status = 'submitted'
    )
  ORDER BY program.end_date DESC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.den_outstanding_reports() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.den_outstanding_reports() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
