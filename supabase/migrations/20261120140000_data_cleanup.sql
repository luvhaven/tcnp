-- One-off data cleanup (database group, audit 2026-11-20).
--
-- Runs after 20261120130000_audit_fixes.sql (which stops the heartbeat audit
-- rows and the programme-title pointer bug from coming back). Destructive:
-- rows deleted here are not recoverable except from a backup. Row counts
-- measured against the live database on 2026-11-20 in a rolled-back trial are
-- given per statement; they will drift a little until this is applied.
--
--  1. Delete presence-heartbeat audit rows for users (#6)            ~262,400 rows
--  2. Delete notifications about deleted programmes, requests,
--     Papas, and legacy chat_message rows (s1)                           145 rows
--  3. Deactivate duplicate global titles and titles of inactive users (#15)
--  4. Put the directory title back for officers whose programme title
--     replaced it (#7)
--  5. One active row per (officer, global title) from now on (#15)
--  6. Resolve the orphan BROKEN ARROW test incident d3830d2a (#14)       1 row


-- 1. Users audit rows whose only change is last_seen / is_online / updated_at
--    (PresenceHeartbeat every 30 s). Includes rows with no change at all.
--    Real changes (role, activation, photo, title, ...) are kept.
--    The space is reused by new rows; it is returned to the operating system
--    only by a VACUUM FULL of audit_logs (run separately, it locks the table).
DELETE FROM public.audit_logs a
WHERE a.target_type = 'users'
  AND a.action = 'update'
  AND jsonb_typeof(a.changes->'before') = 'object'
  AND jsonb_typeof(a.changes->'after') = 'object'
  AND ((a.changes->'after') - ARRAY['updated_at', 'last_seen', 'is_online'])
    = ((a.changes->'before') - ARRAY['updated_at', 'last_seen', 'is_online']);


-- 2. Notifications that open a page for something that no longer exists, and
--    the legacy type 'chat_message' rows (no route).
DELETE FROM public.notifications n
WHERE n.type = 'chat_message'
   OR (
     n.metadata->>'program_id' ~ '^[0-9a-fA-F-]{36}$'
     AND NOT EXISTS (SELECT 1 FROM public.programs p WHERE p.id = (n.metadata->>'program_id')::uuid)
   )
   OR (
     n.metadata->>'kind' = 'mission_request'
     AND n.metadata ? 'request_id'
     AND NOT EXISTS (SELECT 1 FROM public.mission_requests r WHERE r.id::text = n.metadata->>'request_id')
   )
   OR (
     n.metadata->>'papa_id' ~ '^[0-9a-fA-F-]{36}$'
     AND NOT EXISTS (SELECT 1 FROM public.papas p WHERE p.id = (n.metadata->>'papa_id')::uuid)
   );


-- 3a. Duplicate active global titles: keep the newest row per (officer, title)
--     and deactivate the rest. Live: Stanley Acho CAPTAIN, Seun Adaramola
--     VICE_CAPTAIN, COMMAND 001 COMMAND, Seun Ibikunle ADMIN, Adetola
--     Amao-Kehinde ECHO_OSCAR (one extra row each).
UPDATE public.title_assignments ta
SET is_active = false
FROM (
  SELECT id, row_number() OVER (
    PARTITION BY user_id, title_id
    ORDER BY assigned_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
  ) AS rn
  FROM public.title_assignments
  WHERE is_active AND program_id IS NULL
) ranked
WHERE ta.id = ranked.id AND ranked.rn > 1;

-- 3b. Titles still active for deactivated or inactive accounts.
--     Live: Elijah Foli (deactivated) COMMAND.
UPDATE public.title_assignments ta
SET is_active = false
FROM public.users u
WHERE u.id = ta.user_id
  AND ta.is_active
  AND (coalesce(u.is_active, false) = false OR coalesce(u.activation_status, '') <> 'active');


-- 4. Directory title (users.current_title_id, users.unit) for officers whose
--    pointer is not backed by an active programme-less title. assign_title
--    used to point it at any programme title it assigned. It now points at
--    the newest active global title, or nothing. Live: Seun Ibikunle (back to
--    ADMIN), Emmanuel Osho (ECHO_OSCAR_LEAD), Babatunde Sadiq (PROF), and
--    Akintoye Ojomu, Gabriel Christopher Maude, Olisakwe Livinus and Moses
--    Omeike (no global title, so none).
UPDATE public.users u
SET current_title_id = g.title_id,
    unit = g.unit
FROM (
  SELECT target.id AS user_id, newest.title_id, newest.unit
  FROM public.users target
  LEFT JOIN LATERAL (
    SELECT ta.title_id, ot.unit
    FROM public.title_assignments ta
    JOIN public.official_titles ot ON ot.id = ta.title_id
    WHERE ta.user_id = target.id AND ta.is_active AND ta.program_id IS NULL
    ORDER BY ta.assigned_at DESC NULLS LAST, ta.created_at DESC NULLS LAST
    LIMIT 1
  ) newest ON true
  WHERE target.current_title_id IS NOT NULL
    AND coalesce(target.is_active, false)
    AND NOT EXISTS (
      SELECT 1 FROM public.title_assignments held
      WHERE held.user_id = target.id
        AND held.title_id = target.current_title_id
        AND held.is_active
        AND held.program_id IS NULL
    )
) g
WHERE u.id = g.user_id;


-- 5. title_assignments has UNIQUE (user_id, title_id, program_id), which never
--    fires for programme-less rows (NULL program_id). This partial index stops
--    a second active copy of the same global title. assign_title deactivates
--    the officer's global titles before inserting, so it is unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS title_assignments_one_active_global
  ON public.title_assignments (user_id, title_id)
  WHERE program_id IS NULL AND is_active;


-- 6. BROKEN ARROW test incident from 31 Oct: open, critical, its journey
--    deleted, so it kept the open-critical counters at 1. Resolved with a note.
UPDATE public.incidents
SET status = 'resolved',
    resolved_at = now(),
    description = description || E'\n\nResolved by data cleanup on 20 Nov 2026: this was a test Broken Arrow and its journey had been deleted.'
WHERE id = 'd3830d2a-b18f-4e57-8ded-baccd2597a01'
  AND status = 'open';

INSERT INTO public.audit_logs (user_id, action, target_type, target_id, changes, description)
SELECT NULL, 'resolve_incident', 'incident', 'd3830d2a-b18f-4e57-8ded-baccd2597a01'::uuid,
  jsonb_build_object('previous_status', 'open', 'note', 'Test Broken Arrow whose journey was deleted; resolved by data cleanup.'),
  'Resolved orphan test incident (data cleanup 2026-11-20)'
WHERE EXISTS (
  SELECT 1 FROM public.incidents
  WHERE id = 'd3830d2a-b18f-4e57-8ded-baccd2597a01' AND status = 'resolved'
    AND resolved_at > now() - interval '1 minute'
);
