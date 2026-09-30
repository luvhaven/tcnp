-- Reserve permanent platform ownership and support hiding only its officer
-- directory profile without removing the authentication account.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_directory_hidden boolean NOT NULL DEFAULT false;

-- Normalize legacy/misassigned super-admin roles before enforcing the owner.
UPDATE public.users
SET role = 'admin'::public.user_role
WHERE role::text = 'super_admin'
  AND lower(email) <> 'doriazowan@gmail.com';

UPDATE public.users
SET role = 'super_admin'::public.user_role,
    activation_status = 'active',
    is_active = true
WHERE lower(email) = 'doriazowan@gmail.com';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users WHERE lower(email) = 'doriazowan@gmail.com' AND role::text = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Permanent platform owner doriazowan@gmail.com must exist before applying this migration';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS users_single_super_admin_idx
  ON public.users (role)
  WHERE role = 'super_admin'::public.user_role;

CREATE OR REPLACE FUNCTION public.guard_permanent_platform_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  owner_email constant text := 'doriazowan@gmail.com';
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF lower(OLD.email) = owner_email OR OLD.role::text = 'super_admin' THEN
      RAISE EXCEPTION 'The permanent platform owner account cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role::text = 'super_admin' AND lower(NEW.email) <> owner_email THEN
      RAISE EXCEPTION 'Only the permanent platform owner may hold Super Admin';
    END IF;
    IF lower(NEW.email) = owner_email THEN
      NEW.role := 'super_admin'::public.user_role;
      NEW.activation_status := 'active';
      NEW.is_active := true;
    END IF;
    RETURN NEW;
  END IF;

  IF lower(OLD.email) = owner_email OR OLD.role::text = 'super_admin' THEN
    IF lower(NEW.email) <> owner_email
      OR NEW.role::text <> 'super_admin'
      OR NEW.activation_status IS DISTINCT FROM 'active'
      OR NEW.is_active IS DISTINCT FROM true
    THEN
      RAISE EXCEPTION 'The permanent platform owner identity and authority cannot be changed';
    END IF;
    IF NEW.is_directory_hidden IS DISTINCT FROM OLD.is_directory_hidden
      AND (auth.uid() IS DISTINCT FROM OLD.id OR NEW.is_directory_hidden IS DISTINCT FROM true)
    THEN
      RAISE EXCEPTION 'Only the permanent owner may remove their officer profile, and removal cannot be reversed';
    END IF;
  ELSIF NEW.role::text = 'super_admin' OR lower(NEW.email) = owner_email THEN
    RAISE EXCEPTION 'Only the permanent platform owner may hold Super Admin';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_guard_permanent_platform_owner ON public.users;
CREATE TRIGGER users_guard_permanent_platform_owner
BEFORE INSERT OR UPDATE OR DELETE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.guard_permanent_platform_owner();

-- Authenticated clients can continue reading visible profiles and their own
-- hidden row; RLS ensures the owner remains invisible to every other user.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_select_visible_profiles ON public.users;
CREATE POLICY users_select_visible_profiles ON public.users
FOR SELECT TO authenticated
USING (id = (SELECT auth.uid()) OR is_directory_hidden = false);

CREATE OR REPLACE FUNCTION public.get_welfare_directory_safe()
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  phone text,
  photo_url text,
  oscar text,
  role text,
  team text,
  birth_month integer,
  birth_day integer,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.id, u.full_name, u.email, u.phone, u.photo_url, u.oscar,
    u.role::text, u.team,
    extract(month FROM u.date_of_birth)::integer,
    extract(day FROM u.date_of_birth)::integer,
    coalesce(u.is_active, true)
  FROM public.users AS u
  WHERE public.can_manage_unit('welfare')
    AND (u.is_directory_hidden = false OR u.id = (SELECT auth.uid()))
  ORDER BY u.full_name NULLS LAST;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_permanent_platform_owner() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_welfare_directory_safe() TO authenticated;
