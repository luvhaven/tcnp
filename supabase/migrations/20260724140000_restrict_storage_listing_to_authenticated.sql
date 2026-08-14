-- Close the "public_bucket_allows_listing" advisories (WARN-level) flagged by
-- the Supabase security advisor for 6 buckets: avatars, officer-photos,
-- vip-photos, compliance-media, hospitality-media, sierra-media.
--
-- Each carried a SELECT policy on storage.objects scoped only to bucket_id,
-- granted to role `public` (i.e. including anon/logged-out requests). That
-- lets anyone on the internet enumerate every file in the bucket — a minor
-- information-disclosure risk (file names / paths can leak officer or VIP
-- identity), separate from and lower severity than the write holes fixed
-- earlier in this session.
--
-- SAFE, because:
--   · This app requires login for every feature — there is no legitimate
--     anonymous user of these buckets.
--   · No code anywhere in the app calls `.list()` on any of these six buckets
--     (grepped) — nothing depends on enumeration working at all.
--   · Public buckets (storage.buckets.public = true, confirmed true for all
--     six) serve individual files via a path that bypasses storage.objects
--     RLS entirely — this is documented Supabase behaviour. So every existing
--     <img src> / public URL the app already uses keeps working unchanged;
--     only the ability to LIST/enumerate the bucket's contents is removed.
--
-- Exact policy names dropped below were confirmed live via pg_policies before
-- writing this migration, rather than pattern-matched, since Postgres
-- normalizes stored `qual` text (adds ::text casts etc.) in ways that make
-- string-matching it fragile. vip-photos had two redundant duplicate SELECT
-- policies — both are dropped and folded into one.
--
-- Idempotent.

DROP POLICY IF EXISTS "avatars_read" ON storage.objects;
DROP POLICY IF EXISTS "Public read access to officer photos" ON storage.objects;
DROP POLICY IF EXISTS "Public View VIP Photos" ON storage.objects;
DROP POLICY IF EXISTS "Public read access to VIP photos" ON storage.objects;
DROP POLICY IF EXISTS "compliance_media_select" ON storage.objects;
DROP POLICY IF EXISTS "hospitality_media_select" ON storage.objects;
DROP POLICY IF EXISTS "sierra_media_select" ON storage.objects;

-- Also drop-and-recreate our own policy names so this migration is safe to
-- run more than once.
DROP POLICY IF EXISTS "avatars_select_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "officer-photos_select_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "vip-photos_select_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "compliance-media_select_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "hospitality-media_select_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "sierra-media_select_authenticated" ON storage.objects;

CREATE POLICY "avatars_select_authenticated" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars' AND auth.uid() IS NOT NULL);

CREATE POLICY "officer-photos_select_authenticated" ON storage.objects
  FOR SELECT USING (bucket_id = 'officer-photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "vip-photos_select_authenticated" ON storage.objects
  FOR SELECT USING (bucket_id = 'vip-photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "compliance-media_select_authenticated" ON storage.objects
  FOR SELECT USING (bucket_id = 'compliance-media' AND auth.uid() IS NOT NULL);

CREATE POLICY "hospitality-media_select_authenticated" ON storage.objects
  FOR SELECT USING (bucket_id = 'hospitality-media' AND auth.uid() IS NOT NULL);

CREATE POLICY "sierra-media_select_authenticated" ON storage.objects
  FOR SELECT USING (bucket_id = 'sierra-media' AND auth.uid() IS NOT NULL);
