-- TCNP Unit Operations Foundation
-- Additive foundation for scoped unit administration, multi-venue programmes,
-- deployments, and audience-aware announcements. Existing role/oscar columns
-- are intentionally retained while memberships become the source of truth for
-- new unit workspaces.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  accent text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT units_slug_format CHECK (slug ~ '^[a-z0-9_]+$')
);

INSERT INTO public.units (slug, name, description, accent)
VALUES
  ('alpha', 'Alpha Oscar', 'Airport reception and aviation operations', 'violet'),
  ('command', 'Command', 'Central operational oversight', 'orange'),
  ('compliance', 'Compliance Oscar', 'Standards, awards, bonding and internal events', 'emerald'),
  ('november_nest', 'November Oscar — Nest', 'Accommodation and guest-room operations', 'sky'),
  ('tango', 'Tango Oscar', 'Fleet, drivers and ground transport', 'amber'),
  ('training', 'Training Unit', 'Recruitment, learning and member development', 'blue'),
  ('victor', 'Victor Oscar', 'Venue, seating and guest reception operations', 'rose'),
  ('welfare', 'Welfare Oscar', 'Prayer, celebrations and member care', 'fuchsia')
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    accent = EXCLUDED.accent,
    updated_at = now();

CREATE TABLE IF NOT EXISTS public.unit_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  access_level text NOT NULL DEFAULT 'member',
  status text NOT NULL DEFAULT 'active',
  managed_by_legacy boolean NOT NULL DEFAULT false,
  assigned_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unit_memberships_access_level CHECK (access_level IN ('member', 'head')),
  CONSTRAINT unit_memberships_status CHECK (status IN ('active', 'inactive')),
  CONSTRAINT unit_memberships_unique_user UNIQUE (unit_id, user_id)
);

ALTER TABLE public.unit_memberships
  ADD COLUMN IF NOT EXISTS managed_by_legacy boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_unit_memberships_user ON public.unit_memberships(user_id, status);
CREATE INDEX IF NOT EXISTS idx_unit_memberships_unit ON public.unit_memberships(unit_id, status, access_level);

-- Legacy role/Oscar data may briefly disagree during reassignment. Determine
-- head access against the specific unit so a stale Oscar can never grant head
-- powers in a second unit.
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
  SELECT CASE WHEN
    (target_unit_slug = 'alpha' AND (
      lower(coalesce(target_role, '')) = 'head_alpha_oscar'
      OR (lower(coalesce(target_oscar, '')) LIKE '%head%' AND lower(coalesce(target_oscar, '')) LIKE '%alpha%')
    ))
    OR (target_unit_slug = 'command' AND (
      lower(coalesce(target_role, '')) = 'head_of_command'
      OR (lower(coalesce(target_oscar, '')) LIKE '%head%' AND lower(coalesce(target_oscar, '')) LIKE '%command%')
    ))
    OR (target_unit_slug = 'compliance' AND (
      lower(coalesce(target_role, '')) = 'head_compliance_oscar'
      OR (lower(coalesce(target_oscar, '')) LIKE '%head%' AND lower(coalesce(target_oscar, '')) LIKE '%compliance%')
    ))
    OR (target_unit_slug = 'november_nest' AND (
      lower(coalesce(target_role, '')) = 'head_noscar_nest'
      OR (
        lower(coalesce(target_oscar, '')) LIKE '%head%'
        AND lower(coalesce(target_oscar, '')) LIKE '%nest%'
        AND (lower(coalesce(target_oscar, '')) LIKE '%november%' OR lower(coalesce(target_oscar, '')) LIKE '%noscar%')
      )
    ))
    OR (target_unit_slug = 'tango' AND (
      lower(coalesce(target_role, '')) = 'head_tango_oscar'
      OR (lower(coalesce(target_oscar, '')) LIKE '%head%' AND lower(coalesce(target_oscar, '')) LIKE '%tango%')
    ))
    OR (target_unit_slug = 'training' AND (
      lower(coalesce(target_role, '')) = 'head_training_oscar'
      OR (lower(coalesce(target_oscar, '')) LIKE '%head%' AND lower(coalesce(target_oscar, '')) LIKE '%training%')
    ))
    OR (target_unit_slug = 'victor' AND (
      lower(coalesce(target_role, '')) = 'head_victor_oscar'
      OR (lower(coalesce(target_oscar, '')) LIKE '%head%' AND lower(coalesce(target_oscar, '')) LIKE '%victor%')
    ))
    OR (target_unit_slug = 'welfare' AND (
      lower(coalesce(target_role, '')) = 'head_welfare_oscar'
      OR (lower(coalesce(target_oscar, '')) LIKE '%head%' AND lower(coalesce(target_oscar, '')) LIKE '%welfare%')
    ))
  THEN 'head' ELSE 'member' END;
$$;

-- Backfill memberships conservatively from legacy role/oscar text. This is
-- repeatable and never removes or downgrades a manually curated membership.
INSERT INTO public.unit_memberships (unit_id, user_id, access_level, status, managed_by_legacy)
SELECT
  u.id,
  usr.id,
  public.legacy_unit_access_level(u.slug, usr.role::text, usr.oscar),
  CASE
    WHEN coalesce(usr.is_active, true)
      AND coalesce(usr.activation_status, 'active') = 'active'
    THEN 'active'
    ELSE 'inactive'
  END
  , true
FROM public.users usr
JOIN public.units u ON
  (u.slug = 'alpha' AND (lower(coalesce(usr.role::text, '')) LIKE '%alpha%' OR lower(coalesce(usr.oscar, '')) LIKE '%alpha%' OR lower(coalesce(usr.oscar, '')) = 'ao'))
  OR (u.slug = 'command' AND (lower(coalesce(usr.role::text, '')) IN ('command', 'head_of_command') OR lower(coalesce(usr.oscar, '')) LIKE '%command%'))
  OR (u.slug = 'compliance' AND (lower(coalesce(usr.role::text, '')) LIKE '%compliance%' OR lower(coalesce(usr.oscar, '')) LIKE '%compliance%' OR lower(coalesce(usr.oscar, '')) = 'co'))
  OR (u.slug = 'november_nest' AND ((lower(coalesce(usr.role::text, '')) LIKE '%noscar%nested%' OR lower(coalesce(usr.role::text, '')) LIKE '%noscar_nest%') OR lower(coalesce(usr.oscar, '')) LIKE '%nest%'))
  OR (u.slug = 'tango' AND (lower(coalesce(usr.role::text, '')) LIKE '%tango%' OR lower(coalesce(usr.oscar, '')) LIKE '%tango%' OR lower(coalesce(usr.oscar, '')) = 'to'))
  OR (u.slug = 'training' AND (lower(coalesce(usr.role::text, '')) LIKE '%training%' OR lower(coalesce(usr.oscar, '')) LIKE '%training%'))
  OR (u.slug = 'victor' AND (lower(coalesce(usr.role::text, '')) LIKE '%victor%' OR lower(coalesce(usr.oscar, '')) LIKE '%victor%' OR lower(coalesce(usr.oscar, '')) = 'vo'))
  OR (u.slug = 'welfare' AND (lower(coalesce(usr.role::text, '')) LIKE '%welfare%' OR lower(coalesce(usr.oscar, '')) LIKE '%welfare%' OR lower(coalesce(usr.oscar, '')) = 'wo'))
ON CONFLICT (unit_id, user_id) DO NOTHING;

-- Keep only automatically-derived memberships synchronized as accounts are
-- created, approved or reassigned. Memberships curated by a Head of Unit keep
-- managed_by_legacy=false and are never removed by this compatibility bridge.
CREATE OR REPLACE FUNCTION public.sync_legacy_unit_memberships_for_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.unit_memberships
  WHERE user_id = NEW.id AND managed_by_legacy = true;

  INSERT INTO public.unit_memberships (
    unit_id, user_id, access_level, status, managed_by_legacy
  )
  SELECT
    unit_record.id,
    NEW.id,
    public.legacy_unit_access_level(unit_record.slug, NEW.role::text, NEW.oscar),
    CASE
      WHEN coalesce(NEW.is_active, true)
        AND coalesce(NEW.activation_status, 'active') = 'active'
      THEN 'active'
      ELSE 'inactive'
    END,
    true
  FROM public.units unit_record
  WHERE
    (unit_record.slug = 'alpha' AND (lower(coalesce(NEW.role::text, '')) LIKE '%alpha%' OR lower(coalesce(NEW.oscar, '')) LIKE '%alpha%' OR lower(coalesce(NEW.oscar, '')) = 'ao'))
    OR (unit_record.slug = 'command' AND (lower(coalesce(NEW.role::text, '')) IN ('command', 'head_of_command') OR lower(coalesce(NEW.oscar, '')) LIKE '%command%'))
    OR (unit_record.slug = 'compliance' AND (lower(coalesce(NEW.role::text, '')) LIKE '%compliance%' OR lower(coalesce(NEW.oscar, '')) LIKE '%compliance%' OR lower(coalesce(NEW.oscar, '')) = 'co'))
    OR (unit_record.slug = 'november_nest' AND (lower(coalesce(NEW.role::text, '')) LIKE '%noscar_nest%' OR lower(coalesce(NEW.oscar, '')) LIKE '%nest%'))
    OR (unit_record.slug = 'tango' AND (lower(coalesce(NEW.role::text, '')) LIKE '%tango%' OR lower(coalesce(NEW.oscar, '')) LIKE '%tango%' OR lower(coalesce(NEW.oscar, '')) = 'to'))
    OR (unit_record.slug = 'training' AND (lower(coalesce(NEW.role::text, '')) LIKE '%training%' OR lower(coalesce(NEW.oscar, '')) LIKE '%training%'))
    OR (unit_record.slug = 'victor' AND (lower(coalesce(NEW.role::text, '')) LIKE '%victor%' OR lower(coalesce(NEW.oscar, '')) LIKE '%victor%' OR lower(coalesce(NEW.oscar, '')) = 'vo'))
    OR (unit_record.slug = 'welfare' AND (lower(coalesce(NEW.role::text, '')) LIKE '%welfare%' OR lower(coalesce(NEW.oscar, '')) LIKE '%welfare%' OR lower(coalesce(NEW.oscar, '')) = 'wo'))
  ON CONFLICT (unit_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_sync_legacy_unit_memberships ON public.users;
CREATE TRIGGER users_sync_legacy_unit_memberships
AFTER INSERT OR UPDATE OF role, oscar, is_active, activation_status ON public.users
FOR EACH ROW EXECUTE FUNCTION public.sync_legacy_unit_memberships_for_user();

CREATE OR REPLACE FUNCTION public.current_user_platform_rank()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE lower(coalesce(role::text, ''))
    WHEN 'super_admin' THEN 100
    WHEN 'dev_admin' THEN 80
    WHEN 'admin' THEN 80
    WHEN 'captain' THEN 60
    WHEN 'vice_captain' THEN 60
    WHEN 'head_of_operations' THEN 60
    WHEN 'head_of_command' THEN 60
    WHEN 'command' THEN 60
    WHEN 'hod' THEN 60
    WHEN 'hop' THEN 60
    ELSE 0
  END
  FROM public.users
  WHERE id = auth.uid()
    AND coalesce(is_active, true) = true
    AND coalesce(activation_status, 'active') = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(public.current_user_platform_rank(), 0) >= 80;
$$;

CREATE OR REPLACE FUNCTION public.is_unit_member(unit_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.unit_memberships membership
    JOIN public.units unit_record ON unit_record.id = membership.unit_id
    JOIN public.users user_record ON user_record.id = membership.user_id
    WHERE membership.user_id = auth.uid()
      AND membership.status = 'active'
      AND unit_record.slug = unit_slug
      AND unit_record.is_active = true
      AND coalesce(user_record.is_active, true) = true
      AND coalesce(user_record.activation_status, 'active') = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_unit(unit_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin() OR EXISTS (
    SELECT 1
    FROM public.unit_memberships membership
    JOIN public.units unit_record ON unit_record.id = membership.unit_id
    JOIN public.users user_record ON user_record.id = membership.user_id
    WHERE membership.user_id = auth.uid()
      AND membership.status = 'active'
      AND membership.access_level = 'head'
      AND unit_record.slug = unit_slug
      AND unit_record.is_active = true
      AND coalesce(user_record.is_active, true) = true
      AND coalesce(user_record.activation_status, 'active') = 'active'
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_user_platform_rank() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_unit_member(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_unit(text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.program_venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  theatre_id uuid REFERENCES public.theatres(id) ON DELETE SET NULL,
  label text NOT NULL,
  timezone text NOT NULL DEFAULT 'Africa/Lagos',
  starts_at timestamptz,
  ends_at timestamptz,
  status text NOT NULL DEFAULT 'planned',
  is_primary boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT program_venues_status CHECK (status IN ('planned', 'active', 'completed', 'cancelled')),
  CONSTRAINT program_venues_time_order CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_program_venues_program_theatre
  ON public.program_venues(program_id, theatre_id)
  WHERE theatre_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_program_venues_program_status ON public.program_venues(program_id, status);

INSERT INTO public.program_venues (program_id, theatre_id, label, is_primary, status)
SELECT p.id, p.theatre_id, coalesce(t.name, p.name || ' — Primary Venue'), true,
  CASE WHEN p.status::text = 'active' THEN 'active' WHEN p.status::text = 'completed' THEN 'completed' ELSE 'planned' END
FROM public.programs p
LEFT JOIN public.theatres t ON t.id = p.theatre_id
WHERE p.theatre_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.unit_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_venue_id uuid NOT NULL REFERENCES public.program_venues(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  lead_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'planned',
  readiness integer NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unit_deployments_status CHECK (status IN ('planned', 'briefing', 'ready', 'live', 'complete', 'blocked')),
  CONSTRAINT unit_deployments_readiness CHECK (readiness BETWEEN 0 AND 100),
  CONSTRAINT unit_deployments_unique UNIQUE (program_venue_id, unit_id)
);

CREATE TABLE IF NOT EXISTS public.unit_deployment_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id uuid NOT NULL REFERENCES public.unit_deployments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  shift_start timestamptz,
  shift_end timestamptz,
  assigned_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deployment_members_role CHECK (role IN ('lead', 'member', 'support')),
  CONSTRAINT deployment_members_time_order CHECK (shift_end IS NULL OR shift_start IS NULL OR shift_end >= shift_start),
  CONSTRAINT deployment_members_unique UNIQUE (deployment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_unit_deployments_venue ON public.unit_deployments(program_venue_id, unit_id);
CREATE INDEX IF NOT EXISTS idx_unit_deployment_members_user ON public.unit_deployment_members(user_id);

CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid REFERENCES public.units(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  audience_type text NOT NULL DEFAULT 'unit',
  audience jsonb NOT NULL DEFAULT '{}'::jsonb,
  publish_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT announcements_audience_type CHECK (audience_type IN ('all', 'unit', 'team', 'program', 'users')),
  CONSTRAINT announcements_expiry CHECK (expires_at IS NULL OR expires_at >= publish_at)
);

CREATE INDEX IF NOT EXISTS idx_announcements_publish ON public.announcements(publish_at DESC, expires_at);
CREATE INDEX IF NOT EXISTS idx_announcements_unit ON public.announcements(unit_id, publish_at DESC);

DROP TRIGGER IF EXISTS units_set_updated_at ON public.units;
CREATE TRIGGER units_set_updated_at BEFORE UPDATE ON public.units
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS unit_memberships_set_updated_at ON public.unit_memberships;
CREATE TRIGGER unit_memberships_set_updated_at BEFORE UPDATE ON public.unit_memberships
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS program_venues_set_updated_at ON public.program_venues;
CREATE TRIGGER program_venues_set_updated_at BEFORE UPDATE ON public.program_venues
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS unit_deployments_set_updated_at ON public.unit_deployments;
CREATE TRIGGER unit_deployments_set_updated_at BEFORE UPDATE ON public.unit_deployments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS announcements_set_updated_at ON public.announcements;
CREATE TRIGGER announcements_set_updated_at BEFORE UPDATE ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_deployment_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS units_select_authenticated ON public.units;
CREATE POLICY units_select_authenticated ON public.units
FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS units_admin_write ON public.units;
CREATE POLICY units_admin_write ON public.units
FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS unit_memberships_scoped_select ON public.unit_memberships;
CREATE POLICY unit_memberships_scoped_select ON public.unit_memberships
FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR public.is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM public.units u
    WHERE u.id = unit_memberships.unit_id AND public.can_manage_unit(u.slug)
  )
);
DROP POLICY IF EXISTS unit_memberships_scoped_write ON public.unit_memberships;
CREATE POLICY unit_memberships_scoped_write ON public.unit_memberships
FOR ALL TO authenticated
USING (
  public.is_platform_admin()
  OR EXISTS (SELECT 1 FROM public.units u WHERE u.id = unit_memberships.unit_id AND public.can_manage_unit(u.slug))
)
WITH CHECK (
  public.is_platform_admin()
  OR EXISTS (SELECT 1 FROM public.units u WHERE u.id = unit_memberships.unit_id AND public.can_manage_unit(u.slug))
);

DROP POLICY IF EXISTS program_venues_select_authenticated ON public.program_venues;
CREATE POLICY program_venues_select_authenticated ON public.program_venues
FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS program_venues_manage ON public.program_venues;
CREATE POLICY program_venues_manage ON public.program_venues
FOR ALL TO authenticated
USING (public.is_platform_admin() OR public.can_manage_unit('victor'))
WITH CHECK (public.is_platform_admin() OR public.can_manage_unit('victor'));

DROP POLICY IF EXISTS unit_deployments_select_authenticated ON public.unit_deployments;
CREATE POLICY unit_deployments_select_authenticated ON public.unit_deployments
FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS unit_deployments_scoped_write ON public.unit_deployments;
CREATE POLICY unit_deployments_scoped_write ON public.unit_deployments
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.units u WHERE u.id = unit_deployments.unit_id AND public.can_manage_unit(u.slug))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.units u WHERE u.id = unit_deployments.unit_id AND public.can_manage_unit(u.slug))
);

DROP POLICY IF EXISTS unit_deployment_members_select_authenticated ON public.unit_deployment_members;
CREATE POLICY unit_deployment_members_select_authenticated ON public.unit_deployment_members
FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS unit_deployment_members_scoped_write ON public.unit_deployment_members;
CREATE POLICY unit_deployment_members_scoped_write ON public.unit_deployment_members
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.unit_deployments d
    JOIN public.units u ON u.id = d.unit_id
    WHERE d.id = unit_deployment_members.deployment_id AND public.can_manage_unit(u.slug)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.unit_deployments d
    JOIN public.units u ON u.id = d.unit_id
    WHERE d.id = unit_deployment_members.deployment_id AND public.can_manage_unit(u.slug)
  )
);

DROP POLICY IF EXISTS announcements_scoped_select ON public.announcements;
CREATE POLICY announcements_scoped_select ON public.announcements
FOR SELECT TO authenticated USING (
  publish_at <= now()
  AND (expires_at IS NULL OR expires_at > now())
  AND (
    audience_type = 'all'
    OR created_by = auth.uid()
    OR public.is_platform_admin()
    OR (audience_type = 'unit' AND unit_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.unit_memberships m
      WHERE m.unit_id = announcements.unit_id AND m.user_id = auth.uid() AND m.status = 'active'
    ))
    OR (
      audience_type = 'team'
      AND EXISTS (
        SELECT 1 FROM public.users viewer
        WHERE viewer.id = auth.uid()
          AND viewer.team IS NOT NULL
          AND viewer.team = audience ->> 'team'
      )
    )
    OR (
      audience_type = 'program'
      AND EXISTS (
        SELECT 1 FROM public.current_title_assignments assignment
        WHERE assignment.user_id = auth.uid()
          AND assignment.program_id::text = audience ->> 'program_id'
          AND assignment.is_active = true
      )
    )
    OR (
      audience_type = 'users'
      AND coalesce(audience -> 'user_ids', '[]'::jsonb) ? auth.uid()::text
    )
  )
);
DROP POLICY IF EXISTS announcements_scoped_write ON public.announcements;
CREATE POLICY announcements_scoped_write ON public.announcements
FOR ALL TO authenticated
USING (
  public.is_platform_admin()
  OR (unit_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.units u WHERE u.id = announcements.unit_id AND public.can_manage_unit(u.slug)
  ))
)
WITH CHECK (
  public.is_platform_admin()
  OR (unit_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.units u WHERE u.id = announcements.unit_id AND public.can_manage_unit(u.slug)
  ))
);

GRANT SELECT ON public.units, public.program_venues, public.unit_deployments, public.unit_deployment_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.unit_memberships, public.announcements TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.program_venues, public.unit_deployments, public.unit_deployment_members TO authenticated;
