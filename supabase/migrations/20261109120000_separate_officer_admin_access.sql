BEGIN;

-- Auth already enforces email uniqueness. Apply the same case-insensitive
-- rule to officer profiles, including writes outside the signup routes.
CREATE UNIQUE INDEX users_normalized_email_key ON public.users (lower(btrim(email)));

ALTER TABLE public.users ADD COLUMN has_admin_access boolean NOT NULL DEFAULT false;

-- Preserve all existing grants, including the previous Head of Command grant.
-- Keep legacy role values readable until those officers are assigned a base role.
UPDATE public.users SET has_admin_access = true
WHERE role::text IN ('admin', 'head_of_command');

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_team_check;
ALTER TABLE public.users ADD CONSTRAINT users_team_check
  CHECK (team IN ('strength', 'wisdom', 'swift', 'executive'));

-- Executive is a leadership assignment, never a team an officer can self-join.
-- Protect elevated role and grant changes even if a client bypasses the app.
CREATE FUNCTION public.guard_officer_access()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_trusted_backend() THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.has_admin_access OR NEW.role::text IN ('admin', 'dev_admin', 'super_admin', 'captain', 'vice_captain') THEN
        RAISE EXCEPTION 'Elevated access must be assigned by the platform owner' USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.has_admin_access IS DISTINCT FROM OLD.has_admin_access
      OR (NEW.role IS DISTINCT FROM OLD.role AND (
        OLD.has_admin_access
        OR OLD.role::text IN ('admin', 'dev_admin', 'super_admin', 'captain', 'vice_captain')
        OR NEW.role::text IN ('admin', 'dev_admin', 'super_admin', 'captain', 'vice_captain')
      ))
    THEN
      RAISE EXCEPTION 'Elevated access must be changed by the platform owner' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.role::text IN ('captain', 'vice_captain') THEN
    NEW.oscar := 'Executive';
    NEW.team := 'executive';
    NEW.is_team_head := false;
  ELSE
    IF NEW.team = 'executive' THEN NEW.team := NULL; END IF;
    IF lower(btrim(NEW.oscar)) = 'executive' THEN NEW.oscar := NULL; END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_guard_officer_access
BEFORE INSERT OR UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.guard_officer_access();

-- The Executive team represents cross-team access and has no separate room.
DROP TRIGGER IF EXISTS user_assignment_notify_team_chat ON public.users;
CREATE TRIGGER user_assignment_notify_team_chat
AFTER INSERT OR UPDATE OF team, is_active, activation_status ON public.users
FOR EACH ROW WHEN (NEW.team <> 'executive')
EXECUTE FUNCTION public.notify_team_chat_join();

UPDATE public.users
SET oscar = 'Executive', team = 'executive', is_team_head = false
WHERE role::text IN ('captain', 'vice_captain');

CREATE OR REPLACE FUNCTION public.current_user_platform_rank()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN u.role::text = 'super_admin' THEN 100
    WHEN u.has_admin_access OR u.role::text IN ('admin', 'dev_admin', 'captain', 'vice_captain') THEN 80
    WHEN u.role::text IN ('head_of_command', 'head_of_operations', 'command', 'hod', 'hop') THEN 60
    ELSE 0
  END
  FROM public.users u
  WHERE u.id = auth.uid() AND u.is_active = true AND u.activation_status = 'active';
$$;

CREATE OR REPLACE FUNCTION public.current_user_claim_roles()
RETURNS public.user_role[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce((
    SELECT CASE WHEN u.role::text <> 'admin' AND (u.has_admin_access OR u.role::text IN ('captain', 'vice_captain'))
      THEN ARRAY[u.role, 'admin'::public.user_role]
      ELSE ARRAY[u.role]
    END
    FROM public.users u
    WHERE u.id = auth.uid() AND u.is_active = true AND u.activation_status = 'active'
  ), ARRAY[]::public.user_role[]);
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.is_active = true AND u.activation_status = 'active'
      AND (u.has_admin_access OR u.role::text IN (
        'super_admin', 'dev_admin', 'admin', 'captain', 'vice_captain',
        'head_of_operations', 'head_of_command', 'command'
      ))
  );
$$;

REVOKE ALL ON FUNCTION public.guard_officer_access() FROM PUBLIC, anon, authenticated;

COMMIT;
