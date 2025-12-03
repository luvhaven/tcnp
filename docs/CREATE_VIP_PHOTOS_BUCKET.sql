-- =====================================================
-- VIP Photos Storage Bucket Setup
-- =====================================================
-- This script creates a storage bucket for VIP photos
-- and sets up the necessary policies for public access
-- =====================================================

-- Create the storage bucket for VIP photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'vip-photos',
    'vip-photos',
    true,  -- Public bucket for easy access
    5242880,  -- 5MB file size limit
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- Storage Policies
-- =====================================================

-- Policy: Allow authenticated users to upload VIP photos
CREATE POLICY "Authenticated users can upload VIP photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'vip-photos'
);

-- Policy: Allow public read access to VIP photos
CREATE POLICY "Public read access to VIP photos"
ON storage.objects
FOR SELECT
TO public
USING (
    bucket_id = 'vip-photos'
);

-- Policy: Allow authenticated users to update their uploaded photos
CREATE POLICY "Authenticated users can update VIP photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'vip-photos'
)
WITH CHECK (
    bucket_id = 'vip-photos'
);

-- Policy: Allow authenticated users to delete VIP photos
CREATE POLICY "Authenticated users can delete VIP photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'vip-photos'
);

-- =====================================================
-- Verification
-- =====================================================
-- Run this to verify the bucket was created successfully:
-- SELECT * FROM storage.buckets WHERE id = 'vip-photos';
