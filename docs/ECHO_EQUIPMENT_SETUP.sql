-- ============================================================================
-- ECHO EQUIPMENT MANAGEMENT SYSTEM
-- Run this script in Supabase SQL Editor to add equipment tracking
-- ============================================================================

-- 1. ADD NEW ROLES TO user_role ENUM
DO $$
BEGIN
  -- Add echo_oscar if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'echo_oscar' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
  ) THEN
    ALTER TYPE user_role ADD VALUE 'echo_oscar';
  END IF;

  -- Add head_echo_oscar if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'head_echo_oscar' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
  ) THEN
    ALTER TYPE user_role ADD VALUE 'head_echo_oscar';
  END IF;
END $$;

-- 2. CREATE EQUIPMENT TABLE
CREATE TABLE IF NOT EXISTS equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID REFERENCES programs(id) ON DELETE SET NULL,
  name VARCHAR(150) NOT NULL,
  type VARCHAR(50) NOT NULL, -- 'sound', 'microphone', 'presentation', 'camera', 'lighting', 'cables', 'other'
  subtype VARCHAR(100), -- More specific categorization
  quantity INTEGER DEFAULT 1,
  status VARCHAR(30) DEFAULT 'available', -- 'available', 'in_use', 'maintenance', 'damaged', 'retired'
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  serial_number VARCHAR(100),
  location VARCHAR(150),
  additional_info TEXT, -- Open field for any extra details
  last_checked_at TIMESTAMPTZ,
  last_checked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. CREATE INDEXES
CREATE INDEX IF NOT EXISTS idx_equipment_program_id ON equipment(program_id);
CREATE INDEX IF NOT EXISTS idx_equipment_type ON equipment(type);
CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status);
CREATE INDEX IF NOT EXISTS idx_equipment_assigned_to ON equipment(assigned_to);

-- 4. ENABLE RLS
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;

-- 5. RLS POLICIES
-- Allow all authenticated users to view equipment
DROP POLICY IF EXISTS "equipment_select_authenticated" ON equipment;
CREATE POLICY "equipment_select_authenticated"
  ON equipment FOR SELECT TO authenticated
  USING (true);

-- Allow Echo Oscars, Head Echo Oscars, and Admins to manage equipment
DROP POLICY IF EXISTS "equipment_manage_authorized" ON equipment;
CREATE POLICY "equipment_manage_authorized"
  ON equipment FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('dev_admin', 'admin', 'captain', 'head_of_operations', 'head_of_command', 'echo_oscar', 'head_echo_oscar')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('dev_admin', 'admin', 'captain', 'head_of_operations', 'head_of_command', 'echo_oscar', 'head_echo_oscar')
    )
  );

-- 6. GRANT PERMISSIONS
GRANT ALL ON equipment TO authenticated;
GRANT ALL ON equipment TO service_role;

-- 7. ENABLE REALTIME
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE equipment;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

-- 8. CREATE EQUIPMENT HISTORY TABLE (for check-in/check-out tracking)
CREATE TABLE IF NOT EXISTS equipment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL, -- 'checked_out', 'checked_in', 'maintenance', 'status_change', 'assigned', 'unassigned'
  previous_status VARCHAR(30),
  new_status VARCHAR(30),
  notes TEXT,
  performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equipment_logs_equipment_id ON equipment_logs(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_logs_created_at ON equipment_logs(created_at DESC);

ALTER TABLE equipment_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "equipment_logs_select_authenticated" ON equipment_logs;
CREATE POLICY "equipment_logs_select_authenticated"
  ON equipment_logs FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "equipment_logs_insert_authorized" ON equipment_logs;
CREATE POLICY "equipment_logs_insert_authorized"
  ON equipment_logs FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('dev_admin', 'admin', 'captain', 'head_of_operations', 'head_of_command', 'echo_oscar', 'head_echo_oscar')
    )
  );

GRANT ALL ON equipment_logs TO authenticated;
GRANT ALL ON equipment_logs TO service_role;

-- 9. VERIFICATION
DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'ECHO EQUIPMENT SYSTEM CREATED!';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Tables Created:';
  RAISE NOTICE '  ✓ equipment - Main equipment inventory';
  RAISE NOTICE '  ✓ equipment_logs - Check-in/check-out history';
  RAISE NOTICE 'Roles Added:';
  RAISE NOTICE '  ✓ echo_oscar - Echo team member';
  RAISE NOTICE '  ✓ head_echo_oscar - Echo team lead';
  RAISE NOTICE 'Realtime Enabled: Yes';
  RAISE NOTICE '============================================================================';
END $$;
