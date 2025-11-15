-- ============================================================================
-- CHAT SYSTEM AND PWA ENHANCEMENTS MIGRATION
-- ============================================================================
-- This migration adds:
-- 1. Real-time chat system with @mentions
-- 2. Push notification subscriptions
-- 3. Program export tracking
-- ============================================================================

-- ============================================================================
-- 1. CREATE CHAT MESSAGES TABLE
-- ============================================================================

DROP TABLE IF EXISTS chat_messages CASCADE;

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  mentions JSONB DEFAULT '[]'::jsonb, -- Array of user IDs mentioned
  is_private BOOLEAN DEFAULT false, -- True if only visible to mentioned users
  program_id UUID REFERENCES programs(id) ON DELETE CASCADE,
  reply_to_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  read_by JSONB DEFAULT '[]'::jsonb, -- Array of user IDs who read the message
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Create indexes
CREATE INDEX idx_chat_messages_sender_id ON chat_messages(sender_id);
CREATE INDEX idx_chat_messages_program_id ON chat_messages(program_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at DESC);
CREATE INDEX idx_chat_messages_mentions ON chat_messages USING GIN (mentions);

-- Enable RLS
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Active users can insert messages
CREATE POLICY "active_users_insert_messages" ON chat_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND is_active = true
    )
  );

-- Policy: Users can view messages they're involved in
CREATE POLICY "users_view_messages" ON chat_messages
  FOR SELECT USING (
    -- Public messages (not private)
    (is_private = false AND deleted_at IS NULL)
    OR
    -- Private messages where user is sender
    (sender_id = auth.uid() AND deleted_at IS NULL)
    OR
    -- Private messages where user is mentioned
    (is_private = true AND mentions ? auth.uid()::text AND deleted_at IS NULL)
    OR
    -- Admins can see all messages
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

-- Policy: Users can update their own messages
CREATE POLICY "users_update_own_messages" ON chat_messages
  FOR UPDATE USING (sender_id = auth.uid());

-- Policy: Users can delete their own messages (soft delete)
CREATE POLICY "users_delete_own_messages" ON chat_messages
  FOR UPDATE USING (sender_id = auth.uid());

-- ============================================================================
-- 2. CREATE PUSH NOTIFICATION SUBSCRIPTIONS TABLE
-- ============================================================================

DROP TABLE IF EXISTS push_subscriptions CASCADE;

CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

-- Create indexes
CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- Enable RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can manage their own subscriptions
CREATE POLICY "users_manage_subscriptions" ON push_subscriptions
  FOR ALL USING (user_id = auth.uid());

-- ============================================================================
-- 3. CREATE PROGRAM EXPORTS TABLE
-- ============================================================================

DROP TABLE IF EXISTS program_exports CASCADE;

CREATE TABLE program_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  exported_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  export_data JSONB NOT NULL,
  file_url TEXT,
  status VARCHAR(50) DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_program_exports_program_id ON program_exports(program_id);
CREATE INDEX idx_program_exports_exported_by ON program_exports(exported_by);
CREATE INDEX idx_program_exports_created_at ON program_exports(created_at DESC);

-- Enable RLS
ALTER TABLE program_exports ENABLE ROW LEVEL SECURITY;

-- Policy: Admins and authorized users can export
CREATE POLICY "authorized_users_export" ON program_exports
  FOR INSERT WITH CHECK (
    exported_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'captain', 'head_of_operations')
      AND is_active = true
    )
  );

-- Policy: Users can view exports
CREATE POLICY "users_view_exports" ON program_exports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND is_active = true
    )
  );

-- ============================================================================
-- 4. CREATE FUNCTION TO GET UNREAD MESSAGE COUNT
-- ============================================================================

CREATE OR REPLACE FUNCTION get_unread_message_count(user_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM chat_messages
    WHERE deleted_at IS NULL
    AND (
      -- Public messages
      (is_private = false)
      OR
      -- Private messages where user is mentioned
      (is_private = true AND mentions ? user_uuid::text)
    )
    AND NOT (read_by ? user_uuid::text)
    AND sender_id != user_uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. CREATE FUNCTION TO MARK MESSAGE AS READ
-- ============================================================================

CREATE OR REPLACE FUNCTION mark_message_read(message_uuid UUID, user_uuid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE chat_messages
  SET read_by = read_by || jsonb_build_array(user_uuid::text)
  WHERE id = message_uuid
  AND NOT (read_by ? user_uuid::text);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. CREATE FUNCTION TO EXPORT PROGRAM DATA
-- ============================================================================

CREATE OR REPLACE FUNCTION export_program_data(program_uuid UUID)
RETURNS JSONB AS $$
DECLARE
  export_data JSONB;
BEGIN
  SELECT jsonb_build_object(
    'program', (SELECT row_to_json(p.*) FROM programs p WHERE p.id = program_uuid),
    'papas', (SELECT jsonb_agg(row_to_json(pa.*)) FROM papas pa WHERE pa.event_id = program_uuid),
    'journeys', (SELECT jsonb_agg(row_to_json(j.*)) FROM journeys j 
                 JOIN papas pa ON j.papa_id = pa.id 
                 WHERE pa.event_id = program_uuid),
    'cheetahs', (SELECT jsonb_agg(DISTINCT row_to_json(c.*)) FROM cheetahs c
                 JOIN journeys j ON j.assigned_cheetah_id = c.id
                 JOIN papas pa ON j.papa_id = pa.id
                 WHERE pa.event_id = program_uuid),
    'incidents', (SELECT jsonb_agg(row_to_json(i.*)) FROM incidents i WHERE i.program_id = program_uuid),
    'chat_messages', (SELECT jsonb_agg(row_to_json(cm.*)) FROM chat_messages cm WHERE cm.program_id = program_uuid),
    'theatres', (SELECT jsonb_agg(DISTINCT row_to_json(t.*)) FROM theatres t
                 JOIN journeys j ON j.assigned_theatre_id = t.id
                 JOIN papas pa ON j.papa_id = pa.id
                 WHERE pa.event_id = program_uuid),
    'nests', (SELECT jsonb_agg(DISTINCT row_to_json(n.*)) FROM nests n
              JOIN journeys j ON j.assigned_nest_id = n.id
              JOIN papas pa ON j.papa_id = pa.id
              WHERE pa.event_id = program_uuid),
    'exported_at', NOW()
  ) INTO export_data;
  
  RETURN export_data;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 7. CREATE TRIGGER FOR MESSAGE TIMESTAMPS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_chat_message_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chat_messages_update_timestamp
  BEFORE UPDATE ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_message_timestamp();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'CHAT AND PWA MIGRATION COMPLETE!';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Completed:';
  RAISE NOTICE '  ✓ Created chat_messages table';
  RAISE NOTICE '  ✓ Created push_subscriptions table';
  RAISE NOTICE '  ✓ Created program_exports table';
  RAISE NOTICE '  ✓ Added RLS policies for chat';
  RAISE NOTICE '  ✓ Created unread message count function';
  RAISE NOTICE '  ✓ Created mark message read function';
  RAISE NOTICE '  ✓ Created export program data function';
  RAISE NOTICE '  ✓ Created message timestamp trigger';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Next: Implement chat UI and PWA features';
  RAISE NOTICE '============================================================================';
END $$;
