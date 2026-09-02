-- The flagged_by FK created a second users<->chat_messages relationship which breaks
-- PostgREST embedded joins like chat_messages.select('users(...)'). Keep the column
-- as a plain uuid — it is informational only.
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_flagged_by_fkey;;
