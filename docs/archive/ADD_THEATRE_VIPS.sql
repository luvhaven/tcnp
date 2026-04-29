-- ============================================================================
-- THEATRE VIPS TABLE
-- ============================================================================
-- Stores VIPs who have access to specific theatres.
-- Includes photo URL for face recognition.
-- ============================================================================

CREATE TABLE IF NOT EXISTS theatre_vips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  theatre_id UUID REFERENCES theatres(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  photo_url TEXT,
  access_level TEXT DEFAULT 'standard', -- standard, vip, vvip
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_theatre_vips_theatre_id ON theatre_vips(theatre_id);

-- RLS Policies
ALTER TABLE theatre_vips ENABLE ROW LEVEL SECURITY;

-- Victor Oscar (Theatres Manager) and Leadership can manage VIPs
-- Victor Oscar (Theatres Manager) and Leadership can manage VIPs
DROP POLICY IF EXISTS "Victor Oscar and Leadership can manage VIPs" ON theatre_vips;
CREATE POLICY "Victor Oscar and Leadership can manage VIPs"
  ON theatre_vips
  USING (
    has_any_role(ARRAY['super_admin', 'admin', 'captain', 'head_of_command', 'victor_oscar']::user_role[])
  );

-- All authenticated users can view VIPs (for verification)
-- All authenticated users can view VIPs (for verification)
DROP POLICY IF EXISTS "All authenticated users can view VIPs" ON theatre_vips;
CREATE POLICY "All authenticated users can view VIPs"
  ON theatre_vips FOR SELECT
  USING (auth.role() = 'authenticated');

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Theatre VIPs table created successfully!';
  RAISE NOTICE 'Ready for VIP Access Control implementation.';
  RAISE NOTICE '============================================================================';
END $$;
