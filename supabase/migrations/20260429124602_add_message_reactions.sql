
-- Message reactions table for emoji reactions on chat messages
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID        NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  emoji       TEXT        NOT NULL CHECK (char_length(emoji) <= 8),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, user_id, emoji)
);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can see reactions
CREATE POLICY "reactions_select" ON public.message_reactions
  FOR SELECT USING (auth.role() = 'authenticated');

-- Users can only insert their own reactions
CREATE POLICY "reactions_insert" ON public.message_reactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own reactions
CREATE POLICY "reactions_delete" ON public.message_reactions
  FOR DELETE USING (auth.uid() = user_id);

-- Enable realtime for reactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
;
