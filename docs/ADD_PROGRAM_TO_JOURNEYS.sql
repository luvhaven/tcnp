-- ============================================================================
-- ADD PROGRAM_ID TO JOURNEYS TABLE
-- ============================================================================
-- This migration adds program_id to the journeys table to link journeys
-- to specific programs, enabling the "Assign Officer to Program, Papa, 
-- and Cheetah" functionality.
-- ============================================================================

-- Add program_id column to journeys table
ALTER TABLE journeys 
ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES programs(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_journeys_program_id ON journeys(program_id);

-- Update RLS policies to include program-based filtering for DOs
-- Drop existing policy first (PostgreSQL doesn't support CREATE OR REPLACE for policies)
DROP POLICY IF EXISTS "DOs can view their assigned program journeys" ON journeys;
DROP POLICY IF EXISTS "All authenticated users can view journeys" ON journeys;

-- Create new policy with program-based filtering
CREATE POLICY "All authenticated users can view journeys"
  ON journeys FOR SELECT
  USING (
    -- Allow if user is the assigned DO
    assigned_duty_officer_id = auth.uid()
    OR
    -- Allow if user has leadership role
    has_any_role(ARRAY['super_admin', 'admin', 'captain', 'head_of_command']::user_role[])
    OR
    -- Allow if user is assigned to this program via title_assignments
    EXISTS (
      SELECT 1 FROM title_assignments ta
      WHERE ta.user_id = auth.uid()
        AND ta.program_id = journeys.program_id
        AND ta.is_active = true
    )
    OR
    -- Allow all other authenticated users to view (for backwards compatibility)
    auth.uid() IS NOT NULL
  );

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Program ID added to journeys table successfully!';
  RAISE NOTICE 'Officers can now be assigned to Program + Papa + Cheetah combinations.';
  RAISE NOTICE '============================================================================';
END $$;
