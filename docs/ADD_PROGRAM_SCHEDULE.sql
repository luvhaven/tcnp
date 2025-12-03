-- ============================================================================
-- ADVANCED PROGRAMS MANAGEMENT
-- ============================================================================
-- Schema for managing multi-day program schedules and speaker sessions.
-- ============================================================================

-- Program Days (e.g., Day 1, Day 2)
CREATE TABLE IF NOT EXISTS program_days (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID REFERENCES programs(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  title TEXT, -- e.g., "Opening Ceremony", "Conference Day 1"
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(program_id, date)
);

-- Program Sessions (e.g., Morning Session, Evening Session)
CREATE TYPE session_type AS ENUM ('morning', 'afternoon', 'evening', 'special');

CREATE TABLE IF NOT EXISTS program_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  day_id UUID REFERENCES program_days(id) ON DELETE CASCADE,
  title TEXT NOT NULL, -- e.g., "Morning Worship", "Plenary Session"
  session_type session_type DEFAULT 'morning',
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  venue TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Session Speakers (Assigning Papas to Sessions)
CREATE TABLE IF NOT EXISTS session_speakers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES program_sessions(id) ON DELETE CASCADE,
  papa_id UUID REFERENCES papas(id) ON DELETE CASCADE,
  topic TEXT,
  time_slot TIME, -- Specific time they are speaking within the session
  duration_minutes INTEGER,
  is_keynote BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE program_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_speakers ENABLE ROW LEVEL SECURITY;

-- Read access for all authenticated users
-- Read access for all authenticated users
DROP POLICY IF EXISTS "Authenticated users can view program schedules" ON program_days;
CREATE POLICY "Authenticated users can view program schedules" ON program_days FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can view program sessions" ON program_sessions;
CREATE POLICY "Authenticated users can view program sessions" ON program_sessions FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can view session speakers" ON session_speakers;
CREATE POLICY "Authenticated users can view session speakers" ON session_speakers FOR SELECT USING (auth.role() = 'authenticated');

-- Write access for Leadership and Admins
-- Write access for Leadership and Admins
DROP POLICY IF EXISTS "Leadership can manage program schedules" ON program_days;
CREATE POLICY "Leadership can manage program schedules" ON program_days USING (
  has_any_role(ARRAY['super_admin', 'admin', 'captain', 'head_of_command']::user_role[])
);

DROP POLICY IF EXISTS "Leadership can manage program sessions" ON program_sessions;
CREATE POLICY "Leadership can manage program sessions" ON program_sessions USING (
  has_any_role(ARRAY['super_admin', 'admin', 'captain', 'head_of_command']::user_role[])
);

DROP POLICY IF EXISTS "Leadership can manage session speakers" ON session_speakers;
CREATE POLICY "Leadership can manage session speakers" ON session_speakers USING (
  has_any_role(ARRAY['super_admin', 'admin', 'captain', 'head_of_command']::user_role[])
);

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Program Schedule tables created successfully!';
  RAISE NOTICE 'Ready for Advanced Programs Management implementation.';
  RAISE NOTICE '============================================================================';
END $$;
