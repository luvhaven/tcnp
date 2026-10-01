-- ============================================================
-- Fix prevent_user_role_escalation and is_admin to allow service_role
-- and platform administrators to update user status and roles
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT 
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR current_user IN ('postgres', 'service_role', 'supabase_admin')
    OR EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN (
        'super_admin','dev_admin','admin','captain','vice_captain',
        'head_of_operations','head_of_command','command'
      )
      AND is_active = true
    );
$$;

CREATE OR REPLACE FUNCTION public.prevent_user_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role / backend / superuser bypass
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- If auth.uid() is null (backend service role or direct DB client), allow
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Platform administrators can update any user's role and active status
  IF is_admin() THEN
    RETURN NEW;
  END IF;

  -- If a non-admin is updating their own record, block privilege changes
  IF auth.uid() = NEW.id THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Cannot change own role' USING ERRCODE = '42501';
    END IF;
    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      RAISE EXCEPTION 'Cannot change own active status' USING ERRCODE = '42501';
    END IF;
    IF NEW.activation_status IS DISTINCT FROM OLD.activation_status THEN
      RAISE EXCEPTION 'Cannot change own activation status' USING ERRCODE = '42501';
    END IF;
  ELSE
    -- Non-admin attempting to update another user
    RAISE EXCEPTION 'Unauthorized to modify other users' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
