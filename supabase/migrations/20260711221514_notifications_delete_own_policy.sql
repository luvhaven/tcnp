-- Users could never actually delete their own notifications — RLS had SELECT/UPDATE/INSERT
-- policies but no DELETE policy at all, so a .delete() call silently matched zero rows
-- (no error, no effect) while the client optimistically removed it from local state only.
-- On the next fetch (reload, new tab, remount) the "deleted" notification reappeared.
CREATE POLICY "notifications_delete_own" ON public.notifications
  FOR DELETE
  USING (user_id = auth.uid());
;
