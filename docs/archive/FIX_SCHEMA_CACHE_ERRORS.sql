-- ============================================================================
-- FIX SCHEMA CACHE ERRORS - NESTS AND PAPAS
-- ============================================================================
-- This script fixes schema cache errors by ensuring all referenced columns exist
-- Run this in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- 1. FIX NESTS TABLE - Ensure email and phone columns exist
-- ============================================================================
-- The nests table should already have email and phone from DATABASE_SCHEMA.sql
-- But we'll ensure they exist for safety, to match the application code
ALTER TABLE nests ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE nests ADD COLUMN IF NOT EXISTS phone TEXT;

-- ============================================================================
-- 2. FIX PAPAS TABLE - Replace event_id with program_id
-- ============================================================================
-- The papas table uses program_id, not event_id
-- If event_id exists from old migrations, we need to migrate data and drop it

-- First, ensure program_id exists
ALTER TABLE papas ADD COLUMN IF NOT EXISTS program_id UUID;

-- If event_id exists, migrate data to program_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'papas' AND column_name = 'event_id'
  ) THEN
    -- Copy event_id to program_id if program_id is null
    UPDATE papas 
    SET program_id = event_id 
    WHERE program_id IS NULL AND event_id IS NOT NULL;
    
    -- Drop the old event_id column
    ALTER TABLE papas DROP COLUMN event_id;
    
    RAISE NOTICE 'Migrated event_id to program_id and dropped event_id column';
  END IF;
END $$;

-- Add foreign key constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'papas_program_id_fkey' 
    AND table_name = 'papas'
  ) THEN
    ALTER TABLE papas 
      ADD CONSTRAINT papas_program_id_fkey 
      FOREIGN KEY (program_id) 
      REFERENCES programs(id) 
      ON DELETE SET NULL;
    
    RAISE NOTICE 'Added foreign key constraint papas_program_id_fkey';
  END IF;
END $$;

-- Create index if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_papas_program_id ON papas(program_id);

-- ============================================================================
-- 3. UPDATE EXPORT FUNCTION TO USE program_id
-- ============================================================================
-- Fix the export_program_data function to use program_id instead of event_id

CREATE OR REPLACE FUNCTION export_program_data(program_uuid UUID)
RETURNS JSONB AS $$
DECLARE
  export_data JSONB;
BEGIN
  SELECT jsonb_build_object(
    'program', (SELECT row_to_json(p.*) FROM programs p WHERE p.id = program_uuid),
    'papas', (SELECT jsonb_agg(row_to_json(pa.*)) FROM papas pa WHERE pa.program_id = program_uuid),
    'journeys', (SELECT jsonb_agg(row_to_json(j.*)) FROM journeys j 
                 JOIN papas pa ON j.papa_id = pa.id 
                 WHERE pa.program_id = program_uuid),
    'cheetahs', (SELECT jsonb_agg(DISTINCT row_to_json(c.*)) FROM cheetahs c
                 JOIN journeys j ON j.assigned_cheetah_id = c.id
                 JOIN papas pa ON j.papa_id = pa.id
                 WHERE pa.program_id = program_uuid),
    'incidents', (SELECT jsonb_agg(row_to_json(i.*)) FROM incidents i WHERE i.program_id = program_uuid),
    'chat_messages', (SELECT jsonb_agg(row_to_json(cm.*)) FROM chat_messages cm WHERE cm.program_id = program_uuid),
    'theatres', (SELECT jsonb_agg(DISTINCT row_to_json(t.*)) FROM theatres t
                 JOIN journeys j ON j.assigned_theatre_id = t.id
                 JOIN papas pa ON j.papa_id = pa.id
                 WHERE pa.program_id = program_uuid),
    'nests', (SELECT jsonb_agg(DISTINCT row_to_json(n.*)) FROM nests n
              JOIN journeys j ON j.assigned_nest_id = n.id
              JOIN papas pa ON j.papa_id = pa.id
              WHERE pa.program_id = program_uuid),
    'exported_at', NOW()
  ) INTO export_data;
  
  RETURN export_data;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'SCHEMA CACHE FIX COMPLETE!';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Fixed:';
  RAISE NOTICE '  ✓ Ensured nests.email column exists';
  RAISE NOTICE '  ✓ Migrated papas.event_id to papas.program_id';
  RAISE NOTICE '  ✓ Updated export_program_data function';
  RAISE NOTICE '  ✓ Added foreign key constraints and indexes';
  RAISE NOTICE '============================================================================';
END $$;
