-- Close a live privilege-escalation hole on the programs table.
--
-- Confirmed against the live database (2026-07-25): alongside the correct
-- admin-only policies, programs carried three rogue policies granting write
-- access to EVERY authenticated user, and because permissive RLS policies are
-- OR'd together these overrode the admin ones entirely:
--
--   programs_delete_authenticated  DELETE  role authenticated  USING (true)
--   programs_insert_authenticated  INSERT  role authenticated  CHECK (true)
--   programs_update_authenticated  UPDATE  role authenticated  USING/CHECK (true)
--
-- That is exactly the reported bug: any logged-in officer, down to a Delta
-- Oscar, could delete or edit any program. The ProgramsClient UI gate (commit
-- dcf40ef) hid the buttons; this removes the actual server-side hole.
--
-- End state for programs: exactly two policies —
--   · SELECT for any authenticated user (every list view needs it)
--   · ALL (insert/update/delete) restricted to is_admin(), the SECURITY DEFINER
--     helper already used by the previous "Admins have full access" policy.
--
-- The schedule sub-tables (program_days, program_sessions, session_speakers)
-- were checked in the same pass and are already correctly restricted to
-- leadership via has_any_role(...), so they are deliberately left untouched.
-- theatre_vips (Victor-Oscar owned) is likewise out of scope here.
--
-- Idempotent: safe to run more than once.

ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;

-- Drop the three write holes, plus the redundant duplicate SELECT and ALL
-- policies that had accumulated, so we end with one clean pair.
DROP POLICY IF EXISTS "programs_delete_authenticated" ON public.programs;
DROP POLICY IF EXISTS "programs_insert_authenticated" ON public.programs;
DROP POLICY IF EXISTS "programs_update_authenticated" ON public.programs;
DROP POLICY IF EXISTS "programs_modify_policy" ON public.programs;              -- dup admin-write
DROP POLICY IF EXISTS "Admins have full access to programs" ON public.programs; -- superseded below
DROP POLICY IF EXISTS "programs_select_all" ON public.programs;                 -- dup select
DROP POLICY IF EXISTS "All users can view programs" ON public.programs;         -- dup select
DROP POLICY IF EXISTS "Authenticated users can view programs" ON public.programs;-- dup select

-- Canonical pair.
DROP POLICY IF EXISTS "programs_select_authenticated" ON public.programs;
CREATE POLICY "programs_select_authenticated" ON public.programs
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "programs_admin_write" ON public.programs;
CREATE POLICY "programs_admin_write" ON public.programs
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
