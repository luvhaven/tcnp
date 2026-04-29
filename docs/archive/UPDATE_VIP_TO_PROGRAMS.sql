-- ============================================================================
-- UPDATE VIP SYSTEM TO PROGRAM-BASED
-- ============================================================================
-- Changes VIP system from theatre-based to program-based
-- VIPs are now registered for specific programs
-- ============================================================================

-- 1. Add program_id column to theatre_vips
ALTER TABLE theatre_vips ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES programs(id) ON DELETE CASCADE;

-- 2. Make theatre_id nullable (keeping for reference but not required)
ALTER TABLE theatre_vips ALTER COLUMN theatre_id DROP NOT NULL;

-- 3. Add index for program-based lookups
CREATE INDEX IF NOT EXISTS idx_theatre_vips_program_id ON theatre_vips(program_id);

-- 4. Add title column for VIP titles (e.g., "Hon. Minister", "Senator", etc.)
ALTER TABLE theatre_vips ADD COLUMN IF NOT EXISTS title TEXT;

-- 5. Update RLS policies to work with programs
DROP POLICY IF EXISTS "Victor Oscar and Leadership can manage VIPs" ON theatre_vips;
CREATE POLICY "Leadership can manage VIPs"
  ON theatre_vips
  FOR ALL
  USING (
    auth.uid() IN (
        SELECT id FROM users WHERE role IN ('super_admin', 'dev_admin', 'admin', 'captain', 'head_of_command', 'victor_oscar', 'alpha_oscar', 'head_alpha_oscar')
    )
  );

-- 6. Update view policy
DROP POLICY IF EXISTS "All authenticated users can view VIPs" ON theatre_vips;
CREATE POLICY "All authenticated users can view VIPs"
  ON theatre_vips FOR SELECT
  USING (auth.role() = 'authenticated');

-- Notify completion
DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'VIP System updated to program-based successfully!';
  RAISE NOTICE 'VIPs can now be registered for specific programs.';
  RAISE NOTICE '============================================================================';
END $$;
