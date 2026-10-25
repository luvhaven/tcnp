-- Leadership receives Admin privileges without changing users.role.
-- All authorization continues to use approved, active public.users rows.
BEGIN;

CREATE OR REPLACE FUNCTION public.current_user_platform_rank()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE u.role::text
    WHEN 'super_admin' THEN 100
    WHEN 'dev_admin' THEN 80
    WHEN 'admin' THEN 80
    WHEN 'head_of_command' THEN 80
    WHEN 'captain' THEN 80
    WHEN 'vice_captain' THEN 80
    WHEN 'head_of_operations' THEN 60
    WHEN 'command' THEN 60
    WHEN 'hod' THEN 60
    WHEN 'hop' THEN 60
    ELSE 0
  END
  FROM public.users u
  WHERE u.id = auth.uid()
    AND coalesce(u.is_active, false) = true
    AND u.activation_status = 'active'
  LIMIT 1;
$$;

-- Existing has_role / has_any_role policies use this helper. Add the Admin
-- authorization claim for these three roles so every existing Admin policy
-- applies, while retaining their actual leadership role and owner-only checks.
CREATE OR REPLACE FUNCTION public.current_user_claim_roles()
RETURNS public.user_role[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce((
    SELECT CASE WHEN u.role::text IN ('head_of_command', 'captain', 'vice_captain')
      THEN ARRAY[u.role, 'admin'::public.user_role]
      ELSE ARRAY[u.role]
    END
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role IS NOT NULL
      AND coalesce(u.is_active, false) = true
      AND u.activation_status = 'active'
  ), ARRAY[]::public.user_role[]);
$$;

ALTER POLICY "Admins can view password reset requests" ON public.password_reset_requests
  USING ((SELECT public.is_platform_admin()));
ALTER POLICY "Admins can update password reset requests" ON public.password_reset_requests
  USING ((SELECT public.is_platform_admin()))
  WITH CHECK ((SELECT public.is_platform_admin()));

-- These older policies inspect users.role directly instead of the role helpers.
-- Add Admin access alongside the existing unit-specific policies.
DROP POLICY IF EXISTS audit_logs_platform_admin_select ON public.audit_logs;
CREATE POLICY audit_logs_platform_admin_select ON public.audit_logs
  FOR SELECT TO authenticated USING ((SELECT public.is_platform_admin()));

DROP POLICY IF EXISTS noscar_assignments_platform_admin_manage ON public.noscar_assignments;
CREATE POLICY noscar_assignments_platform_admin_manage ON public.noscar_assignments
  FOR ALL TO authenticated
  USING ((SELECT public.is_platform_admin()))
  WITH CHECK ((SELECT public.is_platform_admin()));

REVOKE EXECUTE ON FUNCTION public.current_user_platform_rank() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_user_claim_roles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_platform_rank() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_claim_roles() TO authenticated, service_role;

COMMIT;
