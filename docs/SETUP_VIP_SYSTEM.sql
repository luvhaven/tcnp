-- ============================================================================
-- SETUP VIP SYSTEM
-- ============================================================================
-- 1. Add face_descriptor column to theatre_vips
-- 2. Create vip-photos storage bucket
-- 3. Set up RLS for storage
-- ============================================================================

-- 1. Add face_descriptor column
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'theatre_vips' AND column_name = 'face_descriptor') THEN
        ALTER TABLE theatre_vips ADD COLUMN face_descriptor JSONB;
    END IF;
END $$;

-- 2. Create Storage Bucket (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('vip-photos', 'vip-photos', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage RLS Policies

-- Allow authenticated users to view photos (for verification)
DROP POLICY IF EXISTS "Public View VIP Photos" ON storage.objects;
CREATE POLICY "Public View VIP Photos"
ON storage.objects FOR SELECT
USING ( bucket_id = 'vip-photos' );

-- Allow authorized users to upload photos
DROP POLICY IF EXISTS "Authorized Upload VIP Photos" ON storage.objects;
CREATE POLICY "Authorized Upload VIP Photos"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'vip-photos' AND
    auth.uid() IN (
        SELECT id FROM users WHERE role IN ('super_admin', 'dev_admin', 'admin', 'captain', 'head_of_command', 'victor_oscar')
    )
);

-- Allow authorized users to delete photos
DROP POLICY IF EXISTS "Authorized Delete VIP Photos" ON storage.objects;
CREATE POLICY "Authorized Delete VIP Photos"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'vip-photos' AND
    auth.uid() IN (
        SELECT id FROM users WHERE role IN ('super_admin', 'dev_admin', 'admin', 'captain', 'head_of_command', 'victor_oscar')
    )
);

-- Notify completion
DO $$
BEGIN
  RAISE NOTICE 'VIP System Setup Completed Successfully';
END $$;
