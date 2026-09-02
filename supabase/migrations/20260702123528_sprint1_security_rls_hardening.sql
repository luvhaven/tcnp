-- SPRINT 1: Security Hardening — RLS Policy Fixes
-- TCNP Journey Management | 2026-07-02

-- 1. FIX users UPDATE: prevent role self-escalation
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
DROP POLICY IF EXISTS "Admins can update users" ON public.users;
CREATE POLICY "Users can update own non-sensitive fields" ON public.users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT role FROM public.users WHERE id = auth.uid()) AND is_active = (SELECT is_active FROM public.users WHERE id = auth.uid()));
CREATE POLICY "Admins can update any user" ON public.users FOR UPDATE
  USING (has_any_role(ARRAY['super_admin', 'admin', 'captain', 'head_of_command']::user_role[]));

-- 2. FIX notifications INSERT: admins only
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;
CREATE POLICY "Admins and captains can create notifications" ON public.notifications FOR INSERT
  WITH CHECK (has_any_role(ARRAY['super_admin', 'admin', 'captain', 'head_of_command']::user_role[]));

-- 3. FIX audit_logs INSERT: remove client-side forgery
DROP POLICY IF EXISTS "System can create audit logs" ON public.audit_logs;
CREATE POLICY "Only system functions can insert audit logs" ON public.audit_logs FOR INSERT
  WITH CHECK (has_role('super_admin'::user_role));

-- 4. FIX telemetry_data INSERT: restrict to operational roles
DROP POLICY IF EXISTS "System can insert telemetry" ON public.telemetry_data;
CREATE POLICY "Authorized roles can insert telemetry" ON public.telemetry_data FOR INSERT
  WITH CHECK (has_any_role(ARRAY['super_admin', 'admin', 'captain', 'delta_oscar', 'tango_oscar', 'head_tango_oscar']::user_role[]));

-- 5. FIX journey_events INSERT: require operational roles
DROP POLICY IF EXISTS "Authorized users can create journey events" ON public.journey_events;
CREATE POLICY "Operational roles can create journey events" ON public.journey_events FOR INSERT
  WITH CHECK (has_any_role(ARRAY['super_admin','admin','captain','head_of_command','delta_oscar','tango_oscar','head_tango_oscar','alpha_oscar','november_oscar','victor_oscar']::user_role[]));

-- 6. BONUS: composite telemetry index
CREATE INDEX IF NOT EXISTS idx_telemetry_cheetah_timestamp ON public.telemetry_data (cheetah_id, timestamp DESC);;
