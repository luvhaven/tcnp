-- Declining signups, with an audit trail of every signup decision.
--
-- Builds on 20261116170000_unit_access_single_rule.sql (load it first).
--
-- WHAT THIS MIGRATION DOES
--   1. users.activation_status accepts 'declined' (beside pending, active and
--      deactivated). A declined account keeps its row (and auth user), so the
--      decision stays on record and an admin can reopen it.
--   2. signup_decisions: one append-only row per approve / decline / reopen,
--      with who decided and when. A decline needs a reason. RLS is on; only
--      admins and Command (is_admin()) can read it; nobody writes it directly
--      (decide_signup() and the service role do).
--   3. can_decide_signup(target): who may approve or decline a pending signup.
--      Platform admins decide every signup. Otherwise the caller must be the
--      HEAD of the applicant's unit (can_manage_unit), where the applicant's
--      unit is read from the role and Oscar on the applicant's own users row
--      (legacy_matches_unit), never from membership rows, which a head can
--      add for anyone. A Command applicant needs the Head of Command or an
--      admin. The caller's own Oscar text and role grant nothing here; only an
--      active head membership does.
--   4. decide_signup(target, decision, reason): the one write path, called as
--      the signed-in approver. It locks the user row, re-checks the state and
--      the authority above, changes the status, writes the audit row and, on a
--      decline, signs the person out everywhere. Reopen (declined -> pending)
--      is for admins and Command only (is_admin()).
--   5. revoke_user_sessions(target): global sign-out by user id (deletes the
--      user's auth sessions and refresh tokens). Service role only. The
--      Supabase admin API signOut() needs the user's own JWT, so calling it
--      with a user id never revoked anything.
--
-- Repeatable: IF NOT EXISTS, CREATE OR REPLACE, DROP ... IF EXISTS.

-- ─── 1. 'declined' status ───────────────────────────────────────────────────

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_activation_status_check;
ALTER TABLE public.users ADD CONSTRAINT users_activation_status_check
  CHECK (activation_status = ANY (ARRAY['pending'::text, 'active'::text, 'deactivated'::text, 'declined'::text]));

-- ─── 2. Audit table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.signup_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  decision text NOT NULL,
  reason text,
  decided_by uuid,
  decided_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signup_decisions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT signup_decisions_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT signup_decisions_decision_check CHECK (decision IN ('approved', 'declined', 'reopened')),
  CONSTRAINT signup_decisions_reason_length CHECK (reason IS NULL OR char_length(btrim(reason)) BETWEEN 3 AND 500),
  CONSTRAINT signup_decisions_declined_needs_reason CHECK (decision <> 'declined' OR reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS signup_decisions_user_idx ON public.signup_decisions (user_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS signup_decisions_recent_idx ON public.signup_decisions (decision, decided_at DESC);
CREATE INDEX IF NOT EXISTS signup_decisions_decided_by_idx ON public.signup_decisions (decided_by);

COMMENT ON TABLE public.signup_decisions IS
  'Append-only audit of signup approvals, declines (with reason) and reopenings. Written by decide_signup() and the service role.';

ALTER TABLE public.signup_decisions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.signup_decisions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.signup_decisions TO authenticated;
GRANT ALL ON public.signup_decisions TO service_role;

DROP POLICY IF EXISTS signup_decisions_admin_select ON public.signup_decisions;
CREATE POLICY signup_decisions_admin_select ON public.signup_decisions
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Append-only: a recorded decision is never edited. Deleting the applicant
-- cascades (that is the admin delete-user path). Deleting the officer who
-- DECIDED it runs the decided_by FK's ON DELETE SET NULL, which Postgres does
-- as an UPDATE: that one change (decided_by -> NULL, everything else equal)
-- is allowed, or deleting any approver would fail.
CREATE OR REPLACE FUNCTION public.signup_decisions_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.decided_by IS NULL
     AND OLD.decided_by IS NOT NULL
     AND (NEW.id, NEW.user_id, NEW.decision, NEW.reason, NEW.decided_at)
         IS NOT DISTINCT FROM (OLD.id, OLD.user_id, OLD.decision, OLD.reason, OLD.decided_at)
     AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = OLD.decided_by)
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Signup decisions cannot be edited' USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.signup_decisions_append_only() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS signup_decisions_append_only ON public.signup_decisions;
CREATE TRIGGER signup_decisions_append_only
  BEFORE UPDATE ON public.signup_decisions
  FOR EACH ROW EXECUTE FUNCTION public.signup_decisions_append_only();

-- ─── 5. Global sign-out by user id (defined before decide_signup uses it) ───

CREATE OR REPLACE FUNCTION public.revoke_user_sessions(target_user uuid)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  removed integer := 0;
BEGIN
  IF target_user IS NULL THEN
    RETURN 0;
  END IF;
  -- Refresh tokens go with their session (ON DELETE CASCADE); the second
  -- delete catches legacy tokens that have no session.
  DELETE FROM auth.sessions WHERE user_id = target_user;
  GET DIAGNOSTICS removed = ROW_COUNT;
  DELETE FROM auth.refresh_tokens WHERE user_id = target_user::text;
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_user_sessions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_sessions(uuid) TO service_role;

COMMENT ON FUNCTION public.revoke_user_sessions(uuid) IS
  'Signs a user out everywhere (deletes their auth sessions and refresh tokens). Service role only.';

-- ─── 3. Who may approve or decline ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_decide_signup(target_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND target_user IS NOT NULL
    AND target_user <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users caller
      WHERE caller.id = auth.uid()
        AND caller.is_active = true
        AND caller.activation_status = 'active'
    )
    AND (
      public.is_platform_admin()
      OR EXISTS (
        -- The applicant's unit comes from the role and Oscar on their own
        -- users row (the Oscar they chose at signup), never from membership
        -- rows: a unit head can add a membership row for anyone in their own
        -- unit, which must not hand them another unit's applicant. A Command
        -- applicant can only be decided by the Head of Command (or an admin),
        -- even when their role or Oscar also matches another unit.
        SELECT 1
        FROM public.users applicant
        WHERE applicant.id = target_user
          AND CASE
            WHEN public.legacy_matches_unit('command', applicant.role::text, applicant.oscar)
              THEN public.can_manage_unit('command')
            ELSE EXISTS (
              SELECT 1
              FROM public.units unit_record
              WHERE public.legacy_matches_unit(unit_record.slug, applicant.role::text, applicant.oscar)
                AND public.can_manage_unit(unit_record.slug)
            )
          END
      )
    );
$$;

REVOKE ALL ON FUNCTION public.can_decide_signup(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_decide_signup(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.can_decide_signup(uuid) IS
  'Approve/decline authority for a signup: platform admin, or head (can_manage_unit) of the unit the applicant''s own role/Oscar names (legacy_matches_unit); Command applicants need the Head of Command.';

-- ─── 4. The decision itself ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.decide_signup(
  target_user uuid,
  signup_decision text,
  decision_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller uuid := auth.uid();
  wanted text := lower(btrim(coalesce(signup_decision, '')));
  clean_reason text := nullif(btrim(coalesce(decision_reason, '')), '');
  applicant record;
  next_status text;
  next_active boolean;
  new_decision uuid;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Sign in to decide signups' USING ERRCODE = '42501';
  END IF;

  wanted := CASE wanted
    WHEN 'approve' THEN 'approved'
    WHEN 'decline' THEN 'declined'
    WHEN 'reopen' THEN 'reopened'
    ELSE wanted
  END;
  IF wanted NOT IN ('approved', 'declined', 'reopened') THEN
    RAISE EXCEPTION 'Unknown signup decision' USING ERRCODE = '22023';
  END IF;
  IF wanted = 'declined' AND (clean_reason IS NULL OR char_length(clean_reason) < 3) THEN
    RAISE EXCEPTION 'Give a reason (at least 3 characters) to decline a signup' USING ERRCODE = '22023';
  END IF;
  IF clean_reason IS NOT NULL AND char_length(clean_reason) > 500 THEN
    RAISE EXCEPTION 'Keep the reason under 500 characters' USING ERRCODE = '22023';
  END IF;
  IF target_user IS NULL OR target_user = caller THEN
    RAISE EXCEPTION 'You cannot decide your own signup' USING ERRCODE = '42501';
  END IF;

  SELECT id, activation_status, coalesce(is_directory_hidden, false) AS hidden
  INTO applicant
  FROM public.users
  WHERE id = target_user
  FOR UPDATE;

  IF NOT FOUND OR applicant.hidden THEN
    RAISE EXCEPTION 'Officer not found' USING ERRCODE = 'P0002';
  END IF;

  IF wanted = 'reopened' THEN
    -- Admin and Command only (SQL is_admin(); it also requires an active caller).
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only an admin or Command can reopen a declined signup' USING ERRCODE = '42501';
    END IF;
    IF applicant.activation_status IS DISTINCT FROM 'declined' THEN
      RAISE EXCEPTION 'This signup is not declined' USING ERRCODE = '55000';
    END IF;
    next_status := 'pending';
    next_active := false;
  ELSE
    IF NOT public.can_decide_signup(target_user) THEN
      RAISE EXCEPTION 'You can only decide signups into your own unit' USING ERRCODE = '42501';
    END IF;
    IF applicant.activation_status IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'This signup is no longer pending' USING ERRCODE = '55000';
    END IF;
    next_status := CASE WHEN wanted = 'approved' THEN 'active' ELSE 'declined' END;
    next_active := wanted = 'approved';
  END IF;

  UPDATE public.users
  SET activation_status = next_status, is_active = next_active
  WHERE id = target_user;

  INSERT INTO public.signup_decisions (user_id, decision, reason, decided_by)
  VALUES (target_user, wanted, clean_reason, caller)
  RETURNING id INTO new_decision;

  IF wanted = 'declined' THEN
    PERFORM public.revoke_user_sessions(target_user);
  END IF;

  RETURN jsonb_build_object(
    'id', target_user,
    'decision', wanted,
    'decision_id', new_decision,
    'activation_status', next_status,
    'is_active', next_active
  );
END;
$$;

REVOKE ALL ON FUNCTION public.decide_signup(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_signup(uuid, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.decide_signup(uuid, text, text) IS
  'Approve / decline (reason required) a pending signup, or reopen a declined one (admins and Command). Writes signup_decisions; a decline signs the person out everywhere.';
