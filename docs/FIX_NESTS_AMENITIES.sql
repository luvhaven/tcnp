-- ============================================================================
-- FIX_NESTS_AMENITIES.sql
-- Adds the missing amenities column to the nests table and aligns seed data.
-- Run in Supabase SQL after other migrations.
-- ============================================================================

ALTER TABLE nests
  ADD COLUMN IF NOT EXISTS amenities TEXT;

-- Optional: backfill existing rows with empty string instead of null
UPDATE nests
SET amenities = COALESCE(amenities, '')
WHERE amenities IS NULL;
