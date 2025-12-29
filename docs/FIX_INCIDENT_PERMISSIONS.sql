-- ============================================================================
-- FIX INCIDENT PERMISSIONS FOR DELTA OSCARS
-- ============================================================================
-- Ensures Delta Oscars can report incidents
-- ============================================================================

-- Drop existing insert policy
DROP POLICY IF EXISTS "All users can create incidents" ON incidents;
DROP POLICY IF EXISTS "All authenticated users can create incidents" ON incidents;
DROP POLICY IF EXISTS "Authenticated users can create incidents" ON incidents;

-- Create new insert policy allowing all authenticated users (including DOs)
CREATE POLICY "All authenticated users can report incidents"
  ON incidents FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Ensure DOs can view all incidents (they need this for their work)
DROP POLICY IF EXISTS "All authenticated users can view incidents" ON incidents;
DROP POLICY IF EXISTS "All users can view incidents" ON incidents;

CREATE POLICY "All authenticated users can view incidents"
  ON incidents FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Incident permissions updated successfully!';
  RAISE NOTICE 'Delta Oscars can now report and view incidents';
  RAISE NOTICE '============================================================================';
END $$;
