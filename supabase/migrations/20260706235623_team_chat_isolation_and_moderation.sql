-- Team channel isolation: team messages are only visible to members of that team
-- (plus platform admins). Global/program chat (team IS NULL) keeps existing rules.
DROP POLICY IF EXISTS users_view_messages ON public.chat_messages;
CREATE POLICY users_view_messages ON public.chat_messages FOR SELECT USING (
  (
    -- team-scoped visibility gate
    team IS NULL
    OR team = (SELECT u.team FROM public.users u WHERE u.id = auth.uid())
    OR is_admin()
  )
  AND (
    ((is_private = false) AND (deleted_at IS NULL))
    OR (sender_id = auth.uid())
    OR ((is_private = true) AND (mentions ? (auth.uid())::text) AND (deleted_at IS NULL))
    OR is_admin()
  )
);

-- Senders may only post into their own team's channel (admins may post anywhere)
DROP POLICY IF EXISTS active_users_insert_messages ON public.chat_messages;
CREATE POLICY active_users_insert_messages ON public.chat_messages FOR INSERT WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_active = true)
  AND (
    team IS NULL
    OR team = (SELECT u.team FROM public.users u WHERE u.id = auth.uid())
    OR is_admin()
  )
);

-- Moderation: admins and the head of the same team can update (soft-delete/flag)
-- messages in that team's channel
CREATE POLICY team_heads_moderate_messages ON public.chat_messages FOR UPDATE USING (
  is_admin()
  OR (
    team IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.is_team_head = true AND u.team = chat_messages.team AND u.is_active = true
    )
  )
);;
