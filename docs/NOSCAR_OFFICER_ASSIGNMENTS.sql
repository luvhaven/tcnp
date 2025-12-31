-- ============================================================================
-- NOSCAR OFFICER ASSIGNMENTS MIGRATION
-- ============================================================================
-- This migration adds:
-- 1. program_id and type columns to nests table
-- 2. noscar_assignments table for officer assignments with active/inactive status
-- ============================================================================

-- Add type and phone columns to nests table if not exists
DO $$
BEGIN
  -- Add type column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'nests' AND column_name = 'type') THEN
    ALTER TABLE nests ADD COLUMN type TEXT DEFAULT 'nest';
    COMMENT ON COLUMN nests.type IS 'Type of NOscar location: nest (hotel) or theatre (private/venue)';
  END IF;
  
  -- Add program_id column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'nests' AND column_name = 'program_id') THEN
    ALTER TABLE nests ADD COLUMN program_id UUID REFERENCES programs(id) ON DELETE SET NULL;
    COMMENT ON COLUMN nests.program_id IS 'The program this NOscar location is associated with';
  END IF;
  
  -- Add phone column if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'nests' AND column_name = 'phone') THEN
    ALTER TABLE nests ADD COLUMN phone TEXT;
  END IF;
END $$;

-- Create NOscar assignments table for officer management
CREATE TABLE IF NOT EXISTS noscar_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nest_id UUID REFERENCES nests(id) ON DELETE CASCADE,
  assignment_type TEXT NOT NULL CHECK (assignment_type IN ('theatre', 'nest')),
  program_id UUID REFERENCES programs(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  assigned_date DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, nest_id, program_id, assigned_date)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_noscar_assignments_user_id ON noscar_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_noscar_assignments_nest_id ON noscar_assignments(nest_id);
CREATE INDEX IF NOT EXISTS idx_noscar_assignments_program_id ON noscar_assignments(program_id);
CREATE INDEX IF NOT EXISTS idx_noscar_assignments_assigned_date ON noscar_assignments(assigned_date);
CREATE INDEX IF NOT EXISTS idx_noscar_assignments_is_active ON noscar_assignments(is_active);
CREATE INDEX IF NOT EXISTS idx_nests_program_id ON nests(program_id);
CREATE INDEX IF NOT EXISTS idx_nests_type ON nests(type);

-- Enable RLS on noscar_assignments
ALTER TABLE noscar_assignments ENABLE ROW LEVEL SECURITY;

-- RLS policies for noscar_assignments
DROP POLICY IF EXISTS "Authenticated users can view noscar assignments" ON noscar_assignments;
CREATE POLICY "Authenticated users can view noscar assignments"
ON noscar_assignments FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins can manage noscar assignments" ON noscar_assignments;
CREATE POLICY "Admins can manage noscar assignments"
ON noscar_assignments FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND role IN ('super_admin', 'admin', 'captain', 'head_of_command', 'november_oscar', 'head_november_oscar')
    AND is_active = true
  )
);

-- Grant permissions
GRANT ALL ON noscar_assignments TO authenticated;
GRANT ALL ON noscar_assignments TO service_role;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_noscar_assignments_updated_at ON noscar_assignments;
CREATE TRIGGER update_noscar_assignments_updated_at 
  BEFORE UPDATE ON noscar_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'NOscar officer assignments migration completed successfully!';
  RAISE NOTICE 'Added: type, program_id columns to nests table';
  RAISE NOTICE 'Created: noscar_assignments table with RLS policies';
  RAISE NOTICE '============================================================================';
END $$;
