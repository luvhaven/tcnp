-- =====================================================
-- Journey & Officer Enhancements Migration
-- =====================================================

-- 1. Add ETD/ETA columns to journeys table
ALTER TABLE journeys
ADD COLUMN IF NOT EXISTS etd TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS eta TIMESTAMPTZ;

-- 2. Add photo_url column to users table for officer headshots
ALTER TABLE users
ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- 3. Create storage bucket for officer photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'officer-photos',
    'officer-photos',
    true,
    5242880,  -- 5MB file size limit
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- 4. Create RLS policies for officer-photos bucket

-- Policy: Allow authenticated users to upload officer photos
CREATE POLICY "Authenticated users can upload officer photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'officer-photos'
);

-- Policy: Allow public read access to officer photos
CREATE POLICY "Public read access to officer photos"
ON storage.objects
FOR SELECT
TO public
USING (
    bucket_id = 'officer-photos'
);

-- Policy: Allow authenticated users to update officer photos
CREATE POLICY "Authenticated users can update officer photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'officer-photos'
)
WITH CHECK (
    bucket_id = 'officer-photos'
);

-- Policy: Allow authenticated users to delete officer photos
CREATE POLICY "Authenticated users can delete officer photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'officer-photos'
);

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Journey & Officer enhancements migration completed successfully!';
END $$;
