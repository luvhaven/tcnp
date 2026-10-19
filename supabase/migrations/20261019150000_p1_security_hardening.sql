-- P1 security hardening (audit 2026-10-19)
--
-- 1. Storage: VIP and officer photo writes are limited to the people who manage them.
--    Every write policy on those two buckets is replaced, whatever its name.
-- 2. Storage: unit media buckets get MIME allow-lists and size limits (mirrored
--    client-side in lib/security/upload-validation.ts).
-- 3. notifications / audit_logs: a browser can only write rows for itself.
--    Cross-user notifications are sent by API routes (service role) or by
--    SECURITY DEFINER functions, neither of which goes through these policies.
-- 4. SOP checklist logs: the logged performer must be the caller.
--
-- Idempotent. Not yet applied to the live database.

BEGIN;

-- ─── 1. Photo bucket write policies ─────────────────────────────────────────

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT policyname, cmd
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      AND (
        coalesce(qual, '') ~ '(vip|officer)-photos'
        OR coalesce(with_check, '') ~ '(vip|officer)-photos'
      )
  LOOP
    IF rec.cmd = 'ALL' THEN
      -- A FOR ALL policy also grants reads; leave it for a human to split.
      RAISE WARNING 'storage.objects policy "%" is FOR ALL on a photo bucket; review it by hand', rec.policyname;
    ELSE
      EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', rec.policyname);
    END IF;
  END LOOP;
END $$;

-- VIP photos: Victor unit managers (heads and platform admins) plus the roles the
-- earlier "Authorized … VIP Photos" policies allowed.
CREATE POLICY "vip-photos_insert_managers" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'vip-photos'
    AND (SELECT public.is_active_member())
    AND (
      (SELECT public.can_manage_unit('victor'))
      OR (SELECT public.has_any_role(ARRAY['super_admin','dev_admin','admin','captain','head_of_command','victor_oscar']::text[]))
    )
  );

CREATE POLICY "vip-photos_update_managers" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'vip-photos'
    AND (SELECT public.is_active_member())
    AND (
      (SELECT public.can_manage_unit('victor'))
      OR (SELECT public.has_any_role(ARRAY['super_admin','dev_admin','admin','captain','head_of_command','victor_oscar']::text[]))
    )
  )
  WITH CHECK (bucket_id = 'vip-photos');

CREATE POLICY "vip-photos_delete_managers" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'vip-photos'
    AND (SELECT public.is_active_member())
    AND (
      (SELECT public.can_manage_unit('victor'))
      OR (SELECT public.has_any_role(ARRAY['super_admin','dev_admin','admin','captain','head_of_command','victor_oscar']::text[]))
    )
  );

-- Officer photos: only the officer directory editors (platform administrators),
-- matching canManageOfficers in OfficersClient.
CREATE POLICY "officer-photos_insert_admins" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'officer-photos' AND (SELECT public.is_platform_admin()));

CREATE POLICY "officer-photos_update_admins" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'officer-photos' AND (SELECT public.is_platform_admin()))
  WITH CHECK (bucket_id = 'officer-photos');

CREATE POLICY "officer-photos_delete_admins" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'officer-photos' AND (SELECT public.is_platform_admin()));

-- ─── 2. Bucket MIME / size limits ───────────────────────────────────────────

UPDATE storage.buckets
SET file_size_limit = 5242880, -- 5 MB
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif']
WHERE id IN ('vip-photos', 'officer-photos');

UPDATE storage.buckets
SET file_size_limit = 10485760, -- 10 MB
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif']
WHERE id IN ('compliance-media', 'hospitality-media');

-- Social media assets include video. 'sierra-media' is the original bucket name;
-- the Serial page uploads to 'serial-media'.
UPDATE storage.buckets
SET file_size_limit = 104857600, -- 100 MB (the project-wide upload cap still applies)
    allowed_mime_types = ARRAY[
      'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
      'video/mp4','video/quicktime','video/webm','video/x-m4v','video/3gpp'
    ]
WHERE id IN ('sierra-media', 'serial-media');

UPDATE storage.buckets
SET file_size_limit = 20971520, -- 20 MB
    allowed_mime_types = ARRAY[
      'application/pdf',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif'
    ]
WHERE id = 'finance-documents';

-- ─── 3. notifications / audit_logs inserts ──────────────────────────────────

-- Warn (without failing) if a SECURITY INVOKER function writes to either table:
-- it runs as the caller and would now be held to the self-only rule below.
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT p.prosecdef
      AND p.prosrc ~* 'insert\s+into\s+(public\.)?(notifications|audit_logs)\M'
  LOOP
    RAISE WARNING 'SECURITY INVOKER function % writes notifications/audit_logs; check it still works for its callers', rec.fn;
  END LOOP;
END $$;

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT tablename, policyname, cmd, with_check, qual
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('notifications', 'audit_logs')
      AND cmd IN ('INSERT', 'ALL')
  LOOP
    IF rec.cmd = 'INSERT' THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rec.policyname, rec.tablename);
    ELSIF coalesce(rec.with_check, rec.qual, 'true') !~ 'auth\.uid\(\)' THEN
      -- A FOR ALL policy also grants reads; leave it for a human to split.
      RAISE WARNING 'public.% policy "%" is FOR ALL without an auth.uid() check; review it by hand', rec.tablename, rec.policyname;
    END IF;
  END LOOP;
END $$;

CREATE POLICY notifications_insert_own ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT public.is_active_member()));

CREATE POLICY audit_logs_insert_own ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT public.is_active_member()));

-- ─── 4. SOP checklist logs: performer is the caller ─────────────────────────

DROP POLICY IF EXISTS "Authenticated can insert flower logs" ON public.cheetah_flower_logs;
DROP POLICY IF EXISTS "flower_logs_tango_insert" ON public.cheetah_flower_logs;
CREATE POLICY "flower_logs_tango_insert" ON public.cheetah_flower_logs
  FOR INSERT TO authenticated
  WITH CHECK (performed_by = (SELECT auth.uid()) AND (is_admin() OR is_tango_oscar()));

DROP POLICY IF EXISTS "Authenticated can insert den logs" ON public.den_checklist_logs;
DROP POLICY IF EXISTS "den_logs_victor_insert" ON public.den_checklist_logs;
CREATE POLICY "den_logs_victor_insert" ON public.den_checklist_logs
  FOR INSERT TO authenticated
  WITH CHECK (performed_by = (SELECT auth.uid()) AND (is_admin() OR is_victor_oscar()));

DROP POLICY IF EXISTS "Authenticated can insert comfort logs" ON public.nest_comfort_logs;
DROP POLICY IF EXISTS "comfort_logs_november_insert" ON public.nest_comfort_logs;
CREATE POLICY "comfort_logs_november_insert" ON public.nest_comfort_logs
  FOR INSERT TO authenticated
  WITH CHECK (performed_by = (SELECT auth.uid()) AND (is_admin() OR is_november_oscar()));

DROP POLICY IF EXISTS "Authenticated can insert EO logs" ON public.eo_checklist_logs;
DROP POLICY IF EXISTS "eo_logs_echo_insert" ON public.eo_checklist_logs;
CREATE POLICY "eo_logs_echo_insert" ON public.eo_checklist_logs
  FOR INSERT TO authenticated
  WITH CHECK (performed_by = (SELECT auth.uid()) AND (is_admin() OR oscar_unit_matches('echo')));

-- do_feedback_forms already requires submitted_by = auth.uid()
-- (20260927120000_secure_do_assignment_and_feedback_workflow.sql).

COMMIT;
