-- Victor Routine Check (SOP TCNP.01.09), 2026-11-16.
--
-- The SOP requires every Victor Oscar to run the 11-item "Routine Check for
-- Victor Oscar" before and during each day's operation, rechecked at least
-- four times. The app already had public.den_checklist_logs (one row per
-- check round) but it had no programme, stored bare booleans, and its live
-- INSERT policy let any account whose Oscar text contained "victor" log a
-- check for anyone. This migration:
--
--   1. Adds program_id (the operation the round belongs to) and notes.
--      `session` stays the round label ('Pre-operation', 'Round 2', ...).
--      Old rows keep program_id NULL and stay readable. The theatre link
--      becomes ON DELETE RESTRICT so deleting a venue cannot erase rounds.
--   2. Adds light shape checks (NOT VALID, so they bind new rows only):
--      checks is a JSON array, the round label is 1-60 characters, notes are
--      at most 2000 characters.
--   3. A BEFORE INSERT trigger stamps the server time, the performer's name
--      (from public.users only; the client's value is ignored) and
--      all_passed (every check done, and for labelled rows every item of
--      the routine list present), so a client cannot backdate a round or
--      claim "all clear" for an unticked or shortened list.
--   4. INSERT: own row only, by a Victor member or Command/admin
--      (performed_by = auth.uid() AND (is_admin() OR is_unit_member('victor'))).
--   5. SELECT: Victor members, Command/admin, and the officer who logged the
--      round. Other units no longer read Victor's checks.
--   No UPDATE or DELETE policy: a logged round is a record and is not edited.
--
-- Depends on 20261116170000_unit_access_single_rule.sql (is_unit_member is
-- membership based there). Idempotent; no BEGIN/COMMIT.

-- ─── 1. Columns ─────────────────────────────────────────────────────────────

ALTER TABLE public.den_checklist_logs
  ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON TABLE public.den_checklist_logs IS
  'Victor Routine Check rounds (SOP TCNP.01.09): one row per round per theatre and programme.';
COMMENT ON COLUMN public.den_checklist_logs.session IS
  'Round label: Pre-operation, Round 2, Round 3, ... (at least 4 rounds per operation day).';
COMMENT ON COLUMN public.den_checklist_logs.checks IS
  'Snapshot of the list as ticked: [{key, label, done}]. Rows before 2026-11-16 hold a bare boolean array.';
COMMENT ON COLUMN public.den_checklist_logs.program_id IS
  'The programme (operation) this round belongs to. NULL only on rows logged before programmes were recorded.';

-- A logged round is a record, so deleting a venue must not silently erase
-- its rounds: the theatre link was ON DELETE CASCADE and becomes RESTRICT.
-- (theatre_id is NOT NULL, so SET NULL is not an option.) Added NOT VALID
-- then validated, so the check of existing rows does not hold the strong lock.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'den_checklist_logs_theatre_id_fkey'
             AND conrelid = 'public.den_checklist_logs'::regclass AND confdeltype <> 'r') THEN
    ALTER TABLE public.den_checklist_logs DROP CONSTRAINT den_checklist_logs_theatre_id_fkey;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'den_checklist_logs_theatre_id_fkey'
                 AND conrelid = 'public.den_checklist_logs'::regclass) THEN
    ALTER TABLE public.den_checklist_logs
      ADD CONSTRAINT den_checklist_logs_theatre_id_fkey FOREIGN KEY (theatre_id)
      REFERENCES public.theatres(id) ON DELETE RESTRICT NOT VALID;
    ALTER TABLE public.den_checklist_logs VALIDATE CONSTRAINT den_checklist_logs_theatre_id_fkey;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_den_logs_program_theatre_at
  ON public.den_checklist_logs (program_id, theatre_id, performed_at DESC);

-- ─── 2. Shape checks (new rows) ─────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'den_checklist_logs_checks_array'
                 AND conrelid = 'public.den_checklist_logs'::regclass) THEN
    ALTER TABLE public.den_checklist_logs
      ADD CONSTRAINT den_checklist_logs_checks_array CHECK (jsonb_typeof(checks) = 'array') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'den_checklist_logs_session_length'
                 AND conrelid = 'public.den_checklist_logs'::regclass) THEN
    ALTER TABLE public.den_checklist_logs
      ADD CONSTRAINT den_checklist_logs_session_length CHECK (char_length(btrim(session)) BETWEEN 1 AND 60) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'den_checklist_logs_notes_length'
                 AND conrelid = 'public.den_checklist_logs'::regclass) THEN
    ALTER TABLE public.den_checklist_logs
      ADD CONSTRAINT den_checklist_logs_notes_length CHECK (notes IS NULL OR char_length(notes) <= 2000) NOT VALID;
  END IF;
END
$$;

-- ─── 3. Server-stamped fields ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.den_checklist_logs_stamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.performed_at := now();
  NEW.session := btrim(NEW.session);
  NEW.notes := NULLIF(btrim(coalesce(NEW.notes, '')), '');
  -- The name always comes from public.users, never from the client: a
  -- member with no full_name yet gets their email, then 'Unknown officer'.
  NEW.performed_by_name := coalesce(
    (SELECT coalesce(NULLIF(btrim(u.full_name), ''), NULLIF(btrim(u.email), ''))
       FROM public.users u WHERE u.id = NEW.performed_by),
    'Unknown officer'
  );
  -- All clear only when the list is non-empty and every item is done
  -- (a labelled {done: true} item, or true in an old boolean array).
  NEW.all_passed := jsonb_typeof(NEW.checks) = 'array'
    AND jsonb_array_length(NEW.checks) > 0
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(NEW.checks) AS item(value)
      WHERE NOT (
        item.value = 'true'::jsonb
        OR (jsonb_typeof(item.value) = 'object' AND item.value -> 'done' = 'true'::jsonb)
      )
    );
  -- A labelled (new-format) round is all clear only when every item of the
  -- routine list is present and done, so a hand-made one-item list sent
  -- straight to the API cannot be stamped "All clear". The keys must match
  -- VICTOR_ROUTINE_ITEMS in components/theatre/DenChecklist.tsx (the tests
  -- compare the two). Old boolean rows keep the rule above.
  IF NEW.all_passed AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(NEW.checks) AS item(value)
    WHERE jsonb_typeof(item.value) = 'object'
  ) THEN
    NEW.all_passed := NOT EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        -- routine-keys:start
        'oscar_seats', 'entourage_seats', 'entourage_hop', 'entry_exit_tu',
        'den_toilets', 'den_mics_echo', 'mic_type_do', 'media_do',
        'oscars_planted', 'papa_path_clear', 'security_contact',
        'protocol_lounge', 'exits_safe'
        -- routine-keys:end
      ]) AS required(key)
      WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(NEW.checks) AS item(value)
        WHERE jsonb_typeof(item.value) = 'object'
          AND item.value ->> 'key' = required.key
          AND item.value -> 'done' = 'true'::jsonb
      )
    );
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.den_checklist_logs_stamp() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS den_checklist_logs_stamp ON public.den_checklist_logs;
CREATE TRIGGER den_checklist_logs_stamp
  BEFORE INSERT ON public.den_checklist_logs
  FOR EACH ROW EXECUTE FUNCTION public.den_checklist_logs_stamp();

-- ─── 4 & 5. Policies ────────────────────────────────────────────────────────

ALTER TABLE public.den_checklist_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can insert den logs" ON public.den_checklist_logs;
DROP POLICY IF EXISTS den_logs_victor_insert ON public.den_checklist_logs;
CREATE POLICY den_logs_victor_insert ON public.den_checklist_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    performed_by = (SELECT auth.uid())
    AND (public.is_admin() OR public.is_unit_member('victor'))
  );

DROP POLICY IF EXISTS "Authenticated can read den logs" ON public.den_checklist_logs;
DROP POLICY IF EXISTS den_logs_victor_select ON public.den_checklist_logs;
CREATE POLICY den_logs_victor_select ON public.den_checklist_logs
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.is_unit_member('victor')
    OR performed_by = (SELECT auth.uid())
  );
