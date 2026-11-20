-- One access rule for every unit (foundation for the 2026-11-16 unit build-out).
--
-- THE RULE
--   Source of truth = an active public.unit_memberships row (access_level
--   member | sub_lead | head) in an active unit, for an active user.
--   users.role unit roles (tango_oscar, victor_oscar, noscar_den, head_* ...)
--   grant nothing beyond the membership row the legacy sync trigger creates
--   from them, and users.oscar is a display label only. A 'viewer' who is a
--   member of unit X is treated exactly like any other member of X.
--
--   Levels (each one includes the ones before it):
--     1. Platform: is_platform_admin() (rank >= 80 or has_admin_access) can do
--        everything; Command (is_admin(), rank 60) keeps its existing gates.
--        Nothing below reduces either of them.
--     2. Member of X     is_unit_member(X): reads X's operational data and makes
--                        self-service records (own routine checks, own uploads).
--     3. Programme work  can_work_unit_programme(X, P): member of X AND active on
--                        programme P AND (head/sub_lead OR a head-issued grant,
--                        e.g. a Den floor grant).
--     4. Coordinate X    can_coordinate_unit(X): head or sub_lead.
--     5. Manage X        can_manage_unit(X): head.
--
-- WHAT THIS MIGRATION DOES
--   1. Adds can_work_unit_programme().
--   2. Registers the 'serial' and 'echo' units, teaches the legacy role/Oscar
--      bridge about them (and legacy 'sierra' names), stops the loose
--      LIKE '%command%' match ('OSCAR-EF-COMMAND' is not Command), makes a
--      legacy head come from the head ROLE only (an Oscar reading "head ..."
--      no longer makes a head), turns Oscars stored as raw role keys into
--      plain unit labels, and rebuilds memberships for the users that changes.
--   3. Re-points is_alpha_oscar / is_tango_oscar / is_victor_oscar /
--      is_november_oscar / oscar_unit_matches to membership, keeping their names
--      so existing policies keep compiling.
--   4. Drops the Oscar-text ALL policies that let plain members write
--      eagle_squares, theatres, nests and cheetahs; heads keep (or get) a
--      can_manage_unit() policy. Members keep READ through the existing
--      is_active_member() select policies. Command keeps every write it had
--      (cheetahs gets its own is_admin() policy; the other three tables
--      already have one).
--   5. Routine-check inserts (nest comfort, cheetah FLOWER, EO checklist) become
--      own-row member self-service. den_checklist_logs is left to the Victor
--      routine-check migration.
--   6. Replaces unit-role entries in has_any_role(...) / role-list policies with
--      the membership level the rule assigns. Admin, Command, platform and
--      delta_oscar grants are kept exactly as they were.
--
-- Repeatable: CREATE OR REPLACE, DROP POLICY IF EXISTS, ON CONFLICT.

-- ─── 1. Programme work ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_work_unit_programme(unit_slug text, target_program uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_platform_admin()
    OR (
      target_program IS NOT NULL
      AND public.is_unit_member(unit_slug)
      AND public.is_program_active_officer(auth.uid(), target_program)
      AND (
        public.can_coordinate_unit(unit_slug)
        -- Head-issued grants. Den floor grants are the only kind today;
        -- has_den_floor_access() is the same check the Den floor policies use.
        OR (unit_slug = 'november_den' AND public.has_den_floor_access(target_program))
      )
    );
$$;

REVOKE ALL ON FUNCTION public.can_work_unit_programme(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_work_unit_programme(text, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.can_work_unit_programme(text, uuid) IS
  'Programme work in a unit: platform admin, or member of the unit AND active on the programme AND (head/sub_lead OR a head-issued grant such as a Den floor grant).';

-- ─── 2. Serial and Echo units, and the legacy bridge ────────────────────────

INSERT INTO public.units (slug, name, description, accent)
VALUES
  ('serial', 'Serial Oscar', 'Social media capture, editing and publishing', 'pink'),
  ('echo', 'Echo Oscar', 'Equipment and audio-visual support', 'slate')
ON CONFLICT (slug) DO NOTHING;

-- Which unit a legacy role / Oscar value belongs to. One definition, used by
-- the sync trigger and the backfill below.
CREATE OR REPLACE FUNCTION public.legacy_matches_unit(target_unit_slug text, target_role text, target_oscar text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  WITH v AS (
    SELECT lower(coalesce(target_role, '')) AS r, lower(btrim(coalesce(target_oscar, ''))) AS o
  )
  SELECT CASE target_unit_slug
    WHEN 'alpha' THEN v.r LIKE '%alpha%' OR v.o LIKE '%alpha%' OR v.o = 'ao'
    -- Exact Command values only. 'OSCAR-EF-COMMAND'-style values are an
    -- officer code, not the Command unit.
    WHEN 'command' THEN v.r IN ('command', 'head_of_command')
      OR v.o ~ '^(head[\s_,]*(of[\s_]+)?)?command([\s_]+(centre|center))?$'
    WHEN 'compliance' THEN v.r LIKE '%compliance%' OR v.o LIKE '%compliance%' OR v.o = 'co'
    WHEN 'echo' THEN v.r LIKE '%echo%' OR v.o LIKE '%echo%' OR v.o = 'eo'
    WHEN 'november_den' THEN public.legacy_matches_november_den(target_role, target_oscar)
    WHEN 'november_nest' THEN v.r LIKE '%noscar_nest%' OR v.o LIKE '%nest%'
    WHEN 'serial' THEN v.r ~ '(serial|sierra)' OR v.o ~ '(serial|sierra)' OR v.o = 'so'
    WHEN 'tango' THEN v.r LIKE '%tango%' OR v.o LIKE '%tango%' OR v.o = 'to'
    WHEN 'training' THEN v.r LIKE '%training%' OR v.o LIKE '%training%'
    WHEN 'victor' THEN v.r LIKE '%victor%' OR v.o LIKE '%victor%' OR v.o = 'vo'
    WHEN 'welfare' THEN v.r LIKE '%welfare%' OR v.o LIKE '%welfare%' OR v.o = 'wo'
    ELSE false
  END
  FROM v;
$$;

REVOKE ALL ON FUNCTION public.legacy_matches_unit(text, text, text) FROM PUBLIC, anon, authenticated;

-- Head detection. A legacy head comes from the head ROLE only. The Oscar is a
-- display label: before, an Oscar containing "head" plus a unit name (e.g.
-- 'head_alpha_oscar' written by create-user, or the live 'head_of_command')
-- also made a head, so an officer demoted to viewer or Delta Oscar kept head
-- power through their Oscar. Curated rows (managed_by_legacy = false) are how a
-- non-head-role officer becomes head or sub_lead. Serial (and legacy Sierra)
-- and Echo heads are added.
CREATE OR REPLACE FUNCTION public.legacy_unit_access_level(
  target_unit_slug text,
  target_role text,
  target_oscar text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN lower(coalesce(target_role, '')) = ANY (
      CASE target_unit_slug
        WHEN 'alpha' THEN ARRAY['head_alpha_oscar']
        WHEN 'command' THEN ARRAY['head_of_command']
        WHEN 'compliance' THEN ARRAY['head_compliance_oscar']
        WHEN 'echo' THEN ARRAY['head_echo_oscar']
        WHEN 'november_nest' THEN ARRAY['head_noscar_nest']
        WHEN 'november_den' THEN ARRAY['head_noscar_den']
        WHEN 'serial' THEN ARRAY['head_serial_oscar', 'head_sierra_oscar']
        WHEN 'tango' THEN ARRAY['head_tango_oscar']
        WHEN 'training' THEN ARRAY['head_training_oscar']
        WHEN 'victor' THEN ARRAY['head_victor_oscar']
        WHEN 'welfare' THEN ARRAY['head_welfare_oscar']
        ELSE ARRAY[]::text[]
      END
    )
    THEN 'head' ELSE 'member' END;
$$;

-- Rebuild one user's automatically-derived memberships. Curated rows
-- (managed_by_legacy = false, e.g. sub-leads) are never touched. A user whose
-- role and Oscar match no unit gets no membership.
CREATE OR REPLACE FUNCTION public.rebuild_legacy_unit_memberships(target_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.unit_memberships
  WHERE user_id = target_user AND managed_by_legacy = true;

  INSERT INTO public.unit_memberships (unit_id, user_id, access_level, status, managed_by_legacy)
  SELECT
    unit_record.id,
    usr.id,
    public.legacy_unit_access_level(unit_record.slug, usr.role::text, usr.oscar),
    CASE
      WHEN coalesce(usr.is_active, true)
        AND coalesce(usr.activation_status, 'active') = 'active'
      THEN 'active'
      ELSE 'inactive'
    END,
    true
  FROM public.users usr
  CROSS JOIN public.units unit_record
  WHERE usr.id = target_user
    AND public.legacy_matches_unit(unit_record.slug, usr.role::text, usr.oscar)
  ON CONFLICT (unit_id, user_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.rebuild_legacy_unit_memberships(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_legacy_unit_memberships(uuid) TO service_role;

-- Trigger body: same trigger (users_sync_legacy_unit_memberships, AFTER INSERT
-- OR UPDATE OF role, oscar, is_active, activation_status), one shared rule.
CREATE OR REPLACE FUNCTION public.sync_legacy_unit_memberships_for_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.rebuild_legacy_unit_memberships(NEW.id);
  RETURN NEW;
END;
$$;

-- An Oscar stored as a raw role key (create-user and update-user used to write
-- the role, e.g. 'head_alpha_oscar'; the Head of Command's live Oscar is
-- 'head_of_command') becomes the plain unit label. The trigger above rebuilds
-- each changed user. Heads keep their head role, so their level is unchanged.
UPDATE public.users usr
SET oscar = label_map.label
FROM (VALUES
  ('command', 'Command'), ('head_of_command', 'Command'),
  ('alpha_oscar', 'Alpha Oscar'), ('head_alpha_oscar', 'Alpha Oscar'),
  ('tango_oscar', 'Tango Oscar'), ('head_tango_oscar', 'Tango Oscar'),
  ('victor_oscar', 'Victor Oscar'), ('head_victor_oscar', 'Victor Oscar'),
  ('noscar_den', 'November (Den)'), ('head_noscar_den', 'November (Den)'),
  ('noscar_nest', 'November (Nest)'), ('head_noscar_nest', 'November (Nest)'),
  ('serial_oscar', 'Serial Oscar'), ('head_serial_oscar', 'Serial Oscar'),
  ('sierra_oscar', 'Serial Oscar'), ('head_sierra_oscar', 'Serial Oscar'),
  ('compliance_oscar', 'Compliance Oscar'), ('head_compliance_oscar', 'Compliance Oscar'),
  ('welfare_oscar', 'Welfare Oscar'), ('head_welfare_oscar', 'Welfare Oscar'),
  ('training_oscar', 'Training Oscar'), ('head_training_oscar', 'Training Oscar'),
  ('echo_oscar', 'Echo Oscar'), ('head_echo_oscar', 'Echo Oscar')
) AS label_map(role_key, label)
WHERE lower(btrim(usr.oscar)) = label_map.role_key
  AND usr.oscar IS DISTINCT FROM label_map.label;

-- Backfill only the users whose memberships this migration changes: Serial /
-- Sierra and Echo officers, anyone holding a legacy Command membership the
-- tightened match no longer gives them, and anyone whose legacy level the
-- role-only head rule changes (an Oscar-text head without the head role).
DO $backfill$
DECLARE
  affected uuid;
BEGIN
  FOR affected IN
    SELECT usr.id
    FROM public.users usr
    WHERE public.legacy_matches_unit('serial', usr.role::text, usr.oscar)
       OR public.legacy_matches_unit('echo', usr.role::text, usr.oscar)
       OR EXISTS (
         SELECT 1
         FROM public.unit_memberships membership
         JOIN public.units unit_record ON unit_record.id = membership.unit_id
         WHERE membership.user_id = usr.id
           AND membership.managed_by_legacy = true
           AND (
             (unit_record.slug = 'command' AND NOT public.legacy_matches_unit('command', usr.role::text, usr.oscar))
             OR membership.access_level IS DISTINCT FROM public.legacy_unit_access_level(unit_record.slug, usr.role::text, usr.oscar)
           )
       )
  LOOP
    PERFORM public.rebuild_legacy_unit_memberships(affected);
  END LOOP;
END;
$backfill$;

-- ─── 3. Oscar-text helpers now read membership ──────────────────────────────
-- Names and signatures are unchanged so every policy that calls them keeps
-- compiling. The Oscar text is no longer read; inactive accounts no longer pass.

CREATE OR REPLACE FUNCTION public.oscar_unit_matches(unit_pattern text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- 'november' matches november_den and november_nest; legacy 'sierra' is Serial.
  SELECT EXISTS (
    SELECT 1
    FROM public.unit_memberships membership
    JOIN public.units unit_record ON unit_record.id = membership.unit_id
    JOIN public.users user_record ON user_record.id = membership.user_id
    WHERE membership.user_id = auth.uid()
      AND membership.status = 'active'
      AND unit_record.is_active = true
      AND coalesce(user_record.is_active, true) = true
      AND coalesce(user_record.activation_status, 'active') = 'active'
      AND split_part(unit_record.slug, '_', 1) =
        CASE lower(btrim(coalesce(unit_pattern, ''))) WHEN 'sierra' THEN 'serial' ELSE lower(btrim(coalesce(unit_pattern, ''))) END
  );
$$;

CREATE OR REPLACE FUNCTION public.is_alpha_oscar()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT public.is_unit_member('alpha') $$;

CREATE OR REPLACE FUNCTION public.is_tango_oscar()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT public.is_unit_member('tango') $$;

CREATE OR REPLACE FUNCTION public.is_victor_oscar()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT public.is_unit_member('victor') $$;

CREATE OR REPLACE FUNCTION public.is_november_oscar()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT public.is_unit_member('november_den') OR public.is_unit_member('november_nest') $$;

-- ─── 4. Unit reference data: heads manage, members read ─────────────────────

-- Eagle Squares (Alpha). There was no Alpha head policy; the Oscar-text policy
-- covered heads and members alike.
DROP POLICY IF EXISTS "Alpha Oscars have full access to eagle_squares" ON public.eagle_squares;
DROP POLICY IF EXISTS eagle_squares_alpha_head_manage_v4 ON public.eagle_squares;
CREATE POLICY eagle_squares_alpha_head_manage_v4 ON public.eagle_squares
  FOR ALL TO authenticated
  USING (public.can_manage_unit('alpha'))
  WITH CHECK (public.can_manage_unit('alpha'));

-- Theatres (Victor).
DROP POLICY IF EXISTS theatres_victor_manage ON public.theatres;
DROP POLICY IF EXISTS theatres_victor_head_manage_v4 ON public.theatres;
CREATE POLICY theatres_victor_head_manage_v4 ON public.theatres
  FOR ALL TO authenticated
  USING (public.can_manage_unit('victor'))
  WITH CHECK (public.can_manage_unit('victor'));

-- Nests: the Nest head manages hotel ('nest') rows, the Den head manages Den
-- lounge ('den') rows. Before, any November member could write either.
DROP POLICY IF EXISTS nests_november_manage ON public.nests;
DROP POLICY IF EXISTS nests_november_head_manage_v4 ON public.nests;
CREATE POLICY nests_november_head_manage_v4 ON public.nests
  FOR ALL TO authenticated
  USING (public.can_manage_unit('november_nest') AND coalesce(type, 'nest'::public.nest_type) = 'nest'::public.nest_type)
  WITH CHECK (public.can_manage_unit('november_nest') AND coalesce(type, 'nest'::public.nest_type) = 'nest'::public.nest_type);
DROP POLICY IF EXISTS nests_november_den_head_manage_v4 ON public.nests;
CREATE POLICY nests_november_den_head_manage_v4 ON public.nests
  FOR ALL TO authenticated
  USING (public.can_manage_unit('november_den') AND type = 'den'::public.nest_type)
  WITH CHECK (public.can_manage_unit('november_den') AND type = 'den'::public.nest_type);

-- Cheetahs (Tango). Unlike eagle_squares, theatres and nests, cheetahs has no
-- separate 'Admins have full access' policy: cheetahs_oscar_manage was the only
-- write path for Command (is_admin(), rank 60). It is kept as its own policy so
-- dropping the Oscar-text branch does not reduce Command.
DROP POLICY IF EXISTS cheetahs_oscar_manage ON public.cheetahs;
DROP POLICY IF EXISTS cheetahs_command_manage ON public.cheetahs;
CREATE POLICY cheetahs_command_manage ON public.cheetahs
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS cheetahs_tango_head_manage_v4 ON public.cheetahs;
CREATE POLICY cheetahs_tango_head_manage_v4 ON public.cheetahs
  FOR ALL TO authenticated
  USING (public.can_manage_unit('tango'))
  WITH CHECK (public.can_manage_unit('tango'));

-- ─── 5. Routine checks: own-row member self-service ─────────────────────────

DROP POLICY IF EXISTS comfort_logs_november_insert ON public.nest_comfort_logs;
CREATE POLICY comfort_logs_november_insert ON public.nest_comfort_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    performed_by = (SELECT auth.uid())
    AND (public.is_admin() OR public.is_unit_member('november_nest'))
  );

DROP POLICY IF EXISTS flower_logs_tango_insert ON public.cheetah_flower_logs;
CREATE POLICY flower_logs_tango_insert ON public.cheetah_flower_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    performed_by = (SELECT auth.uid())
    AND (public.is_admin() OR public.is_unit_member('tango'))
  );

DROP POLICY IF EXISTS eo_logs_echo_insert ON public.eo_checklist_logs;
CREATE POLICY eo_logs_echo_insert ON public.eo_checklist_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    performed_by = (SELECT auth.uid())
    AND (public.is_admin() OR public.is_unit_member('echo'))
  );

-- ─── 6. Role lists → membership levels ──────────────────────────────────────
-- In each policy below the admin / Command / platform / delta_oscar entries are
-- kept verbatim. Unit entries become:
--   head role only           → can_manage_unit(unit)
--   head + member roles      → can_coordinate_unit(unit) OR can_work_unit_programme(unit, programme)
--   member role only         → can_work_unit_programme(unit, programme)
--   member reads             → is_unit_member(unit)
--   member own uploads       → is_unit_member(unit) AND own row

-- compliance_posts (Compliance)
DROP POLICY IF EXISTS compliance_posts_write ON public.compliance_posts;
CREATE POLICY compliance_posts_write ON public.compliance_posts
  FOR INSERT
  WITH CHECK (
    public.has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations']::text[])
    OR public.can_coordinate_unit('compliance')
    OR public.can_work_unit_programme('compliance', program_id)
  );
DROP POLICY IF EXISTS compliance_posts_update ON public.compliance_posts;
CREATE POLICY compliance_posts_update ON public.compliance_posts
  FOR UPDATE
  USING (
    public.has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations']::text[])
    OR public.can_coordinate_unit('compliance')
    OR public.can_work_unit_programme('compliance', program_id)
  );
DROP POLICY IF EXISTS compliance_posts_delete ON public.compliance_posts;
CREATE POLICY compliance_posts_delete ON public.compliance_posts
  FOR DELETE
  USING (
    public.has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations']::text[])
    OR public.can_manage_unit('compliance')
  );

-- equipment / equipment_logs (Echo)
DROP POLICY IF EXISTS equipment_manage_authorized ON public.equipment;
CREATE POLICY equipment_manage_authorized ON public.equipment
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND users.role = ANY (ARRAY['dev_admin','admin','captain','head_of_operations','head_of_command']::public.user_role[])
    )
    OR public.can_coordinate_unit('echo')
    OR public.can_work_unit_programme('echo', program_id)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND users.role = ANY (ARRAY['dev_admin','admin','captain','head_of_operations','head_of_command']::public.user_role[])
    )
    OR public.can_coordinate_unit('echo')
    OR public.can_work_unit_programme('echo', program_id)
  );

DROP POLICY IF EXISTS equipment_logs_insert_authorized ON public.equipment_logs;
CREATE POLICY equipment_logs_insert_authorized ON public.equipment_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND users.role = ANY (ARRAY['dev_admin','admin','captain','head_of_operations','head_of_command']::public.user_role[])
    )
    OR public.can_coordinate_unit('echo')
    OR public.can_work_unit_programme('echo', (
      SELECT equipment_row.program_id FROM public.equipment equipment_row
      WHERE equipment_row.id = equipment_logs.equipment_id
    ))
  );

-- flight_tracking (Alpha). The papa's programme is the row's programme.
DROP POLICY IF EXISTS "Admins can manage flight tracking" ON public.flight_tracking;
CREATE POLICY "Admins can manage flight tracking" ON public.flight_tracking
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND users.role = ANY (ARRAY['super_admin','admin','captain']::public.user_role[])
    )
    OR public.can_work_unit_programme('alpha', (
      SELECT papa_row.program_id FROM public.papas papa_row
      WHERE papa_row.id = flight_tracking.papa_id
    ))
  );

-- journey_events. The second policy carries every unit; the first keeps only
-- its non-unit roles (the unit part is covered by the second).
DROP POLICY IF EXISTS "Authorized operational roles can create journey events" ON public.journey_events;
CREATE POLICY "Authorized operational roles can create journey events" ON public.journey_events
  FOR INSERT
  WITH CHECK (
    public.has_any_role(ARRAY['super_admin','admin','captain','delta_oscar','head_of_command']::public.user_role[])
  );
DROP POLICY IF EXISTS "Operational roles can create journey events" ON public.journey_events;
CREATE POLICY "Operational roles can create journey events" ON public.journey_events
  FOR INSERT
  WITH CHECK (
    public.has_any_role(ARRAY['super_admin','admin','captain','head_of_command','delta_oscar']::public.user_role[])
    OR public.can_coordinate_unit('tango')
    OR public.can_coordinate_unit('november_den')
    OR public.can_coordinate_unit('november_nest')
    OR EXISTS (
      SELECT 1 FROM public.journeys journey_row
      WHERE journey_row.id = journey_events.journey_id
        AND (
          public.can_work_unit_programme('tango', journey_row.program_id)
          OR public.can_work_unit_programme('alpha', journey_row.program_id)
          OR public.can_work_unit_programme('november_den', journey_row.program_id)
          OR public.can_work_unit_programme('november_nest', journey_row.program_id)
          OR public.can_work_unit_programme('victor', journey_row.program_id)
        )
    )
  );

-- journey_papas (Tango member entry).
DROP POLICY IF EXISTS "Authorized users can manage journey_papas" ON public.journey_papas;
CREATE POLICY "Authorized users can manage journey_papas" ON public.journey_papas
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND (users.role)::text = ANY (ARRAY['super_admin','dev_admin','admin','captain','vice_captain','head_of_operations','head_of_command','command','delta_oscar'])
        AND coalesce(users.is_active, true) = true
    )
    OR EXISTS (
      SELECT 1 FROM public.journeys journey_row
      WHERE journey_row.id = journey_papas.journey_id
        AND public.can_work_unit_programme('tango', journey_row.program_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND (users.role)::text = ANY (ARRAY['super_admin','dev_admin','admin','captain','vice_captain','head_of_operations','head_of_command','command','delta_oscar'])
        AND coalesce(users.is_active, true) = true
    )
    OR EXISTS (
      SELECT 1 FROM public.journeys journey_row
      WHERE journey_row.id = journey_papas.journey_id
        AND public.can_work_unit_programme('tango', journey_row.program_id)
    )
  );

-- media_assets (Serial). Before this, only the legacy sierra_* roles were
-- listed, so the live head_serial_oscar and Serial members were locked out.
DROP POLICY IF EXISTS media_assets_select ON public.media_assets;
CREATE POLICY media_assets_select ON public.media_assets
  FOR SELECT
  USING (
    public.has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations']::text[])
    OR public.is_unit_member('serial')
  );
DROP POLICY IF EXISTS media_assets_write ON public.media_assets;
CREATE POLICY media_assets_write ON public.media_assets
  FOR INSERT
  WITH CHECK (
    public.has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations']::text[])
    OR public.can_coordinate_unit('serial')
    OR (public.is_unit_member('serial') AND uploaded_by = (SELECT auth.uid()))
  );
DROP POLICY IF EXISTS media_assets_update ON public.media_assets;
CREATE POLICY media_assets_update ON public.media_assets
  FOR UPDATE
  USING (
    public.has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations']::text[])
    OR public.can_coordinate_unit('serial')
    OR (public.is_unit_member('serial') AND uploaded_by = (SELECT auth.uid()))
  );
DROP POLICY IF EXISTS media_assets_delete ON public.media_assets;
CREATE POLICY media_assets_delete ON public.media_assets
  FOR DELETE
  USING (
    public.has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations']::text[])
    OR public.can_manage_unit('serial')
  );

-- noscar_assignments (Nest and Den).
DROP POLICY IF EXISTS "Admins can manage noscar assignments" ON public.noscar_assignments;
CREATE POLICY "Admins can manage noscar assignments" ON public.noscar_assignments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND users.role = ANY (ARRAY['super_admin','admin','captain','head_of_command','head_of_operations']::public.user_role[])
        AND users.is_active = true
    )
    -- A posting belongs to its site's unit: lounges (nests.type = 'den') to the
    -- Den, hotels (any other type; NULL is treated as a hotel, as NestsClient
    -- does) to the Nest. A Den coordinator or Den programme worker cannot post at
    -- a Nest hotel, and the reverse. FOR ALL with no WITH CHECK, so this USING
    -- also checks the new row (moving a posting needs both sites). A posting
    -- with no site belongs to no unit: Command and platform admins only.
    -- active members can read nests, so the lookup works under RLS.
    OR EXISTS (
      SELECT 1 FROM public.nests n
      WHERE n.id = noscar_assignments.nest_id
        AND (
          (n.type::text = 'den' AND (
            public.can_coordinate_unit('november_den')
            OR public.can_work_unit_programme('november_den', noscar_assignments.program_id)))
          OR (coalesce(n.type::text, 'nest') <> 'den' AND (
            public.can_coordinate_unit('november_nest')
            OR public.can_work_unit_programme('november_nest', noscar_assignments.program_id)))
        )
    )
  );

-- papa_accommodations (Nest data: where ministers are lodged). Every Nest
-- member reads it. From Den, only coordinators and officers doing Den work on
-- that programme read it (before: the noscar_den / head_noscar_den /
-- november_oscar roles), so a plain Den member does not see Nest records.
DROP POLICY IF EXISTS papa_accommodations_select ON public.papa_accommodations;
CREATE POLICY papa_accommodations_select ON public.papa_accommodations
  FOR SELECT
  USING (
    public.has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations']::text[])
    OR public.is_unit_member('november_nest')
    OR public.can_coordinate_unit('november_den')
    OR public.can_work_unit_programme('november_den', program_id)
    OR EXISTS (
      SELECT 1
      FROM public.journeys j
      LEFT JOIN public.journey_papas jp ON jp.journey_id = j.id
      LEFT JOIN public.journey_duty_officers jdo ON jdo.journey_id = j.id
      WHERE (j.papa_id = papa_accommodations.papa_id OR jp.papa_id = papa_accommodations.papa_id)
        AND (j.assigned_do_id = auth.uid() OR j.assigned_duty_officer_id = auth.uid() OR jdo.user_id = auth.uid())
    )
  );
DROP POLICY IF EXISTS papa_accommodations_write ON public.papa_accommodations;
CREATE POLICY papa_accommodations_write ON public.papa_accommodations
  FOR INSERT
  WITH CHECK (
    public.has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations']::text[])
    OR public.can_coordinate_unit('november_nest')
    OR public.can_work_unit_programme('november_nest', program_id)
  );
DROP POLICY IF EXISTS papa_accommodations_update ON public.papa_accommodations;
CREATE POLICY papa_accommodations_update ON public.papa_accommodations
  FOR UPDATE
  USING (
    public.has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations']::text[])
    OR public.can_coordinate_unit('november_nest')
    OR public.can_work_unit_programme('november_nest', program_id)
  );
DROP POLICY IF EXISTS papa_accommodations_delete ON public.papa_accommodations;
CREATE POLICY papa_accommodations_delete ON public.papa_accommodations
  FOR DELETE
  USING (
    public.has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations']::text[])
    OR public.can_manage_unit('november_nest')
  );

-- papa_meal_orders (Den and Nest). The Den floor policies stay as they are.
DROP POLICY IF EXISTS papa_meal_orders_insert ON public.papa_meal_orders;
CREATE POLICY papa_meal_orders_insert ON public.papa_meal_orders
  FOR INSERT
  WITH CHECK (
    (
      public.has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations']::text[])
      OR public.can_coordinate_unit('november_den')
      OR public.can_coordinate_unit('november_nest')
      OR public.can_work_unit_programme('november_den', program_id)
      OR public.can_work_unit_programme('november_nest', program_id)
    )
    AND EXISTS (SELECT 1 FROM public.papas p WHERE p.id = papa_meal_orders.papa_id)
  );
DROP POLICY IF EXISTS papa_meal_orders_update ON public.papa_meal_orders;
CREATE POLICY papa_meal_orders_update ON public.papa_meal_orders
  FOR UPDATE
  USING (
    (
      public.has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations']::text[])
      OR public.can_coordinate_unit('november_den')
      OR public.can_coordinate_unit('november_nest')
      OR public.can_work_unit_programme('november_den', program_id)
      OR public.can_work_unit_programme('november_nest', program_id)
    )
    AND EXISTS (SELECT 1 FROM public.papas p WHERE p.id = papa_meal_orders.papa_id)
  );
DROP POLICY IF EXISTS papa_meal_orders_delete ON public.papa_meal_orders;
CREATE POLICY papa_meal_orders_delete ON public.papa_meal_orders
  FOR DELETE
  USING (
    public.has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations']::text[])
    OR public.can_manage_unit('november_den')
    OR public.can_manage_unit('november_nest')
  );

-- program_menus (Den, Welfare; the Nest head was listed without Nest members).
DROP POLICY IF EXISTS program_menus_insert ON public.program_menus;
CREATE POLICY program_menus_insert ON public.program_menus
  FOR INSERT
  WITH CHECK (
    public.has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations']::text[])
    OR public.can_coordinate_unit('november_den')
    OR public.can_coordinate_unit('welfare')
    OR public.can_manage_unit('november_nest')
    OR public.can_work_unit_programme('november_den', program_id)
    OR public.can_work_unit_programme('welfare', program_id)
  );
DROP POLICY IF EXISTS program_menus_update ON public.program_menus;
CREATE POLICY program_menus_update ON public.program_menus
  FOR UPDATE
  USING (
    public.has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations']::text[])
    OR public.can_coordinate_unit('november_den')
    OR public.can_coordinate_unit('welfare')
    OR public.can_manage_unit('november_nest')
    OR public.can_work_unit_programme('november_den', program_id)
    OR public.can_work_unit_programme('welfare', program_id)
  );
DROP POLICY IF EXISTS program_menus_delete ON public.program_menus;
CREATE POLICY program_menus_delete ON public.program_menus
  FOR DELETE
  USING (
    public.has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations']::text[])
    OR public.can_manage_unit('november_den')
    OR public.can_manage_unit('november_nest')
    OR public.can_manage_unit('welfare')
  );

-- telemetry_data (Tango). The second policy carries the Tango part.
DROP POLICY IF EXISTS "Authorized transport officers can insert telemetry" ON public.telemetry_data;
CREATE POLICY "Authorized transport officers can insert telemetry" ON public.telemetry_data
  FOR INSERT
  WITH CHECK (
    public.has_any_role(ARRAY['super_admin','admin','delta_oscar']::public.user_role[])
  );
DROP POLICY IF EXISTS "Authorized roles can insert telemetry" ON public.telemetry_data;
CREATE POLICY "Authorized roles can insert telemetry" ON public.telemetry_data
  FOR INSERT
  WITH CHECK (
    public.has_any_role(ARRAY['super_admin','admin','captain','delta_oscar']::public.user_role[])
    OR public.can_coordinate_unit('tango')
    OR EXISTS (
      SELECT 1 FROM public.journeys journey_row
      WHERE journey_row.id = telemetry_data.journey_id
        AND public.can_work_unit_programme('tango', journey_row.program_id)
    )
  );

-- theatre_vips (Senior Ministers' Access: Alpha and Victor).
DROP POLICY IF EXISTS "Leadership can manage VIPs" ON public.theatre_vips;
CREATE POLICY "Leadership can manage VIPs" ON public.theatre_vips
  FOR ALL
  USING (
    auth.uid() IN (
      SELECT users.id FROM public.users
      WHERE users.role = ANY (ARRAY['super_admin','dev_admin','admin','captain','head_of_command']::public.user_role[])
    )
    OR public.can_coordinate_unit('alpha')
    OR public.can_coordinate_unit('victor')
    OR public.can_work_unit_programme('alpha', program_id)
    OR public.can_work_unit_programme('victor', program_id)
  );

-- vehicle_locations (Tango). Reads stay with can_view_all_tracking(); writes
-- are for Tango heads / sub-leads, not every member.
DROP POLICY IF EXISTS "Admins and TOs can manage vehicle locations" ON public.vehicle_locations;
CREATE POLICY "Admins and TOs can manage vehicle locations" ON public.vehicle_locations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND users.role = ANY (ARRAY['super_admin','admin']::public.user_role[])
    )
    OR public.can_coordinate_unit('tango')
  );

CREATE OR REPLACE FUNCTION public.can_view_all_tracking()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND (
        role IN ('super_admin','admin','captain','vice_captain','head_of_command','head_of_operations')
        OR public.has_title('CAPTAIN')
        OR public.has_title('VICE_CAPTAIN')
        OR public.has_title('HEAD_OF_COMMAND')
        OR public.has_title('HEAD_OF_OPERATIONS')
        OR public.has_title('COMMAND')
      )
      AND is_active = true
  ) OR public.is_unit_member('tango');
END;
$$;

-- vehicle_locations_manage used can_view_all_tracking(), which is a read
-- check. Leadership keeps it; Tango needs coordinate level to write.
DROP POLICY IF EXISTS vehicle_locations_manage ON public.vehicle_locations;
CREATE POLICY vehicle_locations_manage ON public.vehicle_locations
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND (
          users.role IN ('super_admin','admin','captain','vice_captain','head_of_command','head_of_operations')
          OR public.has_title('CAPTAIN')
          OR public.has_title('VICE_CAPTAIN')
          OR public.has_title('HEAD_OF_COMMAND')
          OR public.has_title('HEAD_OF_OPERATIONS')
          OR public.has_title('COMMAND')
        )
        AND users.is_active = true
    )
    OR public.can_coordinate_unit('tango')
  );

-- vendors (Den, Welfare; the Nest head was listed without Nest members).
CREATE OR REPLACE FUNCTION public.can_edit_vendors()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.has_any_role(ARRAY[
    'super_admin', 'dev_admin', 'admin', 'captain', 'vice_captain', 'command',
    'head_of_command', 'head_of_operations'
  ]::text[])
    OR public.can_coordinate_unit('november_den')
    OR public.can_coordinate_unit('welfare')
    OR public.can_manage_unit('november_nest');
$$;

DROP POLICY IF EXISTS vendors_insert ON public.vendors;
CREATE POLICY vendors_insert ON public.vendors
  FOR INSERT
  WITH CHECK (public.can_edit_vendors());
DROP POLICY IF EXISTS vendors_update ON public.vendors;
CREATE POLICY vendors_update ON public.vendors
  FOR UPDATE
  USING (public.can_edit_vendors());
DROP POLICY IF EXISTS vendors_delete ON public.vendors;
CREATE POLICY vendors_delete ON public.vendors
  FOR DELETE
  USING (
    public.has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations']::text[])
    OR public.can_manage_unit('november_den')
    OR public.can_manage_unit('november_nest')
    OR public.can_manage_unit('welfare')
  );

-- ─── 7. Storage ─────────────────────────────────────────────────────────────

-- vip-photos. Before, the open policies "Authenticated users can upload /
-- update / delete VIP photos" let ANY signed-in account (any unit, a viewer, a
-- pending account with a session) overwrite or delete VIP photos, which made
-- the role-list policies moot. They are dropped. Writers are now the officers
-- who manage theatre_vips: Command and admins (is_admin(), so Command is not
-- reduced) and Alpha / Victor coordinators. Reads are unchanged
-- (vip-photos_select_authenticated; the bucket is public for VIP cards).
DROP POLICY IF EXISTS "Authenticated users can upload VIP photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update VIP photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete VIP photos" ON storage.objects;
DROP POLICY IF EXISTS "Authorized Upload VIP Photos" ON storage.objects;
CREATE POLICY "Authorized Upload VIP Photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'vip-photos'
    AND (
      public.is_admin()
      OR public.can_coordinate_unit('victor')
      OR public.can_coordinate_unit('alpha')
    )
  );
DROP POLICY IF EXISTS "Authorized Update VIP Photos" ON storage.objects;
CREATE POLICY "Authorized Update VIP Photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'vip-photos'
    AND (
      public.is_admin()
      OR public.can_coordinate_unit('victor')
      OR public.can_coordinate_unit('alpha')
    )
  )
  WITH CHECK (
    bucket_id = 'vip-photos'
    AND (
      public.is_admin()
      OR public.can_coordinate_unit('victor')
      OR public.can_coordinate_unit('alpha')
    )
  );
DROP POLICY IF EXISTS "Authorized Delete VIP Photos" ON storage.objects;
CREATE POLICY "Authorized Delete VIP Photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'vip-photos'
    AND (
      public.is_admin()
      OR public.can_coordinate_unit('victor')
      OR public.can_coordinate_unit('alpha')
    )
  );

-- compliance-media (Compliance).
DROP POLICY IF EXISTS compliance_media_insert ON storage.objects;
CREATE POLICY compliance_media_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'compliance-media'
    AND (
      public.has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations']::text[])
      OR public.can_coordinate_unit('compliance')
    )
  );
DROP POLICY IF EXISTS compliance_media_delete ON storage.objects;
CREATE POLICY compliance_media_delete ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'compliance-media'
    AND (
      public.has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations']::text[])
      OR public.can_manage_unit('compliance')
    )
  );

-- Serial media. The Serial page uploads to 'serial-media'; 'sierra-media' is
-- the original bucket. Both now follow Serial membership. Members upload and
-- edit their own files, coordinators edit any, the head deletes.
-- 'serial-media' is PRIVATE: it holds raw, unapproved capture, so it must not
-- be readable by anyone holding an object URL. Reads go through signed URLs,
-- which need the SELECT policy below (Serial members, Command and admins, the
-- same people who can read media_assets). The Serial page must use
-- createSignedUrl(s) instead of getPublicUrl for this bucket.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'serial-media', 'serial-media', false, 104857600,
  ARRAY[
    'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
    'video/mp4','video/quicktime','video/webm','video/x-m4v','video/3gpp'
  ]
)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS sierra_media_insert ON storage.objects;
CREATE POLICY sierra_media_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'sierra-media'
    AND (
      public.has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations']::text[])
      OR public.is_unit_member('serial')
    )
  );
DROP POLICY IF EXISTS sierra_media_update ON storage.objects;
CREATE POLICY sierra_media_update ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'sierra-media'
    AND (
      public.has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations']::text[])
      OR public.can_coordinate_unit('serial')
      OR (public.is_unit_member('serial') AND owner_id = (SELECT auth.uid())::text)
    )
  );
DROP POLICY IF EXISTS sierra_media_delete ON storage.objects;
CREATE POLICY sierra_media_delete ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'sierra-media'
    AND (
      public.has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations']::text[])
      OR public.can_manage_unit('serial')
    )
  );

DROP POLICY IF EXISTS "serial-media_select_authenticated" ON storage.objects;
DROP POLICY IF EXISTS serial_media_select ON storage.objects;
CREATE POLICY serial_media_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'serial-media'
    AND (
      public.has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations']::text[])
      OR public.is_unit_member('serial')
    )
  );
DROP POLICY IF EXISTS serial_media_insert ON storage.objects;
CREATE POLICY serial_media_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'serial-media'
    AND (
      public.has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations']::text[])
      OR public.is_unit_member('serial')
    )
  );
DROP POLICY IF EXISTS serial_media_update ON storage.objects;
CREATE POLICY serial_media_update ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'serial-media'
    AND (
      public.has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations']::text[])
      OR public.can_coordinate_unit('serial')
      OR (public.is_unit_member('serial') AND owner_id = (SELECT auth.uid())::text)
    )
  );
DROP POLICY IF EXISTS serial_media_delete ON storage.objects;
CREATE POLICY serial_media_delete ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'serial-media'
    AND (
      public.has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations']::text[])
      OR public.can_manage_unit('serial')
    )
  );
