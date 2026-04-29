-- ============================================================================
-- UPDATE NESTS TO NOSCAR
-- ============================================================================
-- Renaming concept of "Nests" to "NOscar" with types "Den" and "Nest".
-- ============================================================================

-- Create nest_type enum
DO $$ BEGIN
    CREATE TYPE nest_type AS ENUM ('den', 'nest');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add type column to nests table
ALTER TABLE nests 
ADD COLUMN IF NOT EXISTS type nest_type DEFAULT 'nest';

-- Update existing records to 'nest' (default)
UPDATE nests SET type = 'nest' WHERE type IS NULL;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Nests table updated successfully!';
  RAISE NOTICE 'Added type column with values: den, nest.';
  RAISE NOTICE '============================================================================';
END $$;
