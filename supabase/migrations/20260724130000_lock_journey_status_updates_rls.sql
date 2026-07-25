-- Close a second unrestricted-write hole found in the same live audit pass.
--
-- journey_status_updates carried a single policy, jsu_authenticated_all, granting
-- FOR ALL (insert/update/delete) to every authenticated user with USING(true)
-- and WITH CHECK(true) — the same escalation class as the programs holes.
--
-- The table is dead: 0 rows and not referenced anywhere in the application code
-- (the live journey flow uses journeys.status + journey_events). Locking it is
-- therefore zero-risk and correct hygiene — a wide-open table is a latent hole
-- the moment anything starts writing to it. If it is ever revived, a purpose-fit
-- policy should be written then.
--
-- Two policies not touched, by design (verified in the same pass):
--   · notifications.notifications_insert_all — INSERT only; select/update/delete
--     are scoped to user_id = auth.uid(). Cross-user INSERT is required (assigning
--     a DO, chat @mentions create a row for another user). Low-risk by design.
--   · audit_logs.audit_logs_insert — append-only (no update/delete policy exists),
--     written from SECURITY DEFINER triggers and many call sites. Standard audit.
--
-- Idempotent.

ALTER TABLE public.journey_status_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jsu_authenticated_all" ON public.journey_status_updates;

DROP POLICY IF EXISTS "journey_status_updates_select_authenticated" ON public.journey_status_updates;
CREATE POLICY "journey_status_updates_select_authenticated" ON public.journey_status_updates
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "journey_status_updates_admin_write" ON public.journey_status_updates;
CREATE POLICY "journey_status_updates_admin_write" ON public.journey_status_updates
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
