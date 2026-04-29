--============================================================================
-- CHAT READ TRACKING
-- ============================================================================
-- Adds function to mark chat messages as read and calculate unread counts
-- ============================================================================

-- Function to mark all messages in a program as read by current user
CREATE OR REPLACE FUNCTION mark_messages_as_read(
  p_user_id UUID,
  p_program_id UUID
)
RETURNS void AS $$
BEGIN
  -- Update read_by array to include current user if not already present
  UPDATE chat_messages
  SET read_by = CASE
    WHEN read_by ? p_user_id::text THEN read_by
    ELSE COALESCE(read_by, '[]'::jsonb) || to_jsonb(p_user_id)
  END
  WHERE program_id = p_program_id
    AND sender_id != p_user_id  -- Don't mark own messages as read
    AND NOT (read_by ? p_user_id::text);  -- Only update if not already read
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get unread message count for a user in a program
CREATE OR REPLACE FUNCTION get_unread_count(
  p_user_id UUID,
  p_program_id UUID
)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM chat_messages
    WHERE program_id = p_program_id
      AND sender_id != p_user_id  -- Don't count own messages
      AND NOT (read_by ? p_user_id::text)  -- Count messages user hasn't read
      AND deleted_at IS NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Chat read tracking functions created successfully!';
  RAISE NOTICE 'Functions: mark_messages_as_read(), get_unread_count()';
  RAISE NOTICE '============================================================================';
END $$;
