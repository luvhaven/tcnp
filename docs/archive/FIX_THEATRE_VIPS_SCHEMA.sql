-- ============================================================================
-- FIX THEATRE VIPS SCHEMA
-- ============================================================================
-- Adds missing columns that are used in the VIP Management Panel
-- ============================================================================

-- Add contact_info column
ALTER TABLE theatre_vips ADD COLUMN IF NOT EXISTS contact_info TEXT;

-- Add organization column
ALTER TABLE theatre_vips ADD COLUMN IF NOT EXISTS organization TEXT;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Theatre VIPs schema updated successfully!';
  RAISE NOTICE 'Added columns: contact_info, organization';
  RAISE NOTICE '============================================================================';
END $$;
