-- New storage buckets for unit media and finance documents
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('sierra-media', 'sierra-media', true),
  ('compliance-media', 'compliance-media', true),
  ('hospitality-media', 'hospitality-media', true),
  ('finance-documents', 'finance-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Sierra media: unit + leadership can upload/manage
CREATE POLICY sierra_media_insert ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'sierra-media' AND has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_sierra_oscar','sierra_oscar']::text[])
);
CREATE POLICY sierra_media_update ON storage.objects FOR UPDATE USING (
  bucket_id = 'sierra-media' AND has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_sierra_oscar','sierra_oscar']::text[])
);
CREATE POLICY sierra_media_delete ON storage.objects FOR DELETE USING (
  bucket_id = 'sierra-media' AND has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_sierra_oscar']::text[])
);
CREATE POLICY sierra_media_select ON storage.objects FOR SELECT USING (bucket_id = 'sierra-media');

-- Compliance media
CREATE POLICY compliance_media_insert ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'compliance-media' AND has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_compliance_oscar','compliance_oscar']::text[])
);
CREATE POLICY compliance_media_delete ON storage.objects FOR DELETE USING (
  bucket_id = 'compliance-media' AND has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_compliance_oscar']::text[])
);
CREATE POLICY compliance_media_select ON storage.objects FOR SELECT USING (bucket_id = 'compliance-media');

-- Hospitality media
CREATE POLICY hospitality_media_insert ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'hospitality-media' AND has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_hospitality_oscar','hospitality_oscar']::text[])
);
CREATE POLICY hospitality_media_delete ON storage.objects FOR DELETE USING (
  bucket_id = 'hospitality-media' AND has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_hospitality_oscar']::text[])
);
CREATE POLICY hospitality_media_select ON storage.objects FOR SELECT USING (bucket_id = 'hospitality-media');

-- Finance documents: private — leadership only, including reads (signed URLs)
CREATE POLICY finance_docs_insert ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'finance-documents' AND has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations']::text[])
);
CREATE POLICY finance_docs_select ON storage.objects FOR SELECT USING (
  bucket_id = 'finance-documents' AND has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations']::text[])
);
CREATE POLICY finance_docs_delete ON storage.objects FOR DELETE USING (
  bucket_id = 'finance-documents' AND has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations']::text[])
);;
