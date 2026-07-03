-- ============================================================================
-- Sprint 1: Security Hardening (Phase 4)
-- Date: 2026-07-03
-- Purpose: Closes RLS escalation vulnerabilities identified in the 2026 audit.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Patch `users` table role-escalation vulnerability
-- ----------------------------------------------------------------------------
-- Original: CREATE POLICY "Users can update their own profile" ON users FOR UPDATE USING (auth.uid() = id);
-- Exploit: A non-admin user could PATCH their own row and set role='super_admin'
-- Fix: Force the NEW role column to strictly match the OLD role column.
DROP POLICY IF EXISTS "Users can update their own profile" ON users;
CREATE POLICY "Users can update their own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- Prevent role escalation by ensuring the new role equals the existing role
    AND role = (SELECT role FROM users WHERE id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 2. Restrict `notifications` wildcard INSERT
-- ----------------------------------------------------------------------------
-- Original: CREATE POLICY "System can create notifications" ON notifications FOR INSERT WITH CHECK (true);
-- Exploit: Any authenticated user could spam arbitrary notifications to any other user.
-- Fix: Restrict to admins and captains.
DROP POLICY IF EXISTS "System can create notifications" ON notifications;
CREATE POLICY "Only admins can create notifications"
  ON notifications FOR INSERT
  WITH CHECK (has_any_role(ARRAY['super_admin', 'admin', 'captain']::user_role[]));

-- ----------------------------------------------------------------------------
-- 3. Remove `audit_logs` client-side INSERT vector
-- ----------------------------------------------------------------------------
-- Original: CREATE POLICY "System can create audit logs" ON audit_logs FOR INSERT WITH CHECK (true);
-- Exploit: Any authenticated user could forge fake audit logs via the client API.
-- Fix: Delete policy. The `create_audit_log` function is SECURITY DEFINER and bypasses
-- RLS automatically. Removing the policy disables the client-side REST INSERT entirely.
DROP POLICY IF EXISTS "System can create audit logs" ON audit_logs;

-- ----------------------------------------------------------------------------
-- 4. Restrict `journey_events` (Call-Sign) action spoofing
-- ----------------------------------------------------------------------------
-- Original: CREATE POLICY "Authorized users can create journey events" ON journey_events FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
-- Exploit: A 'viewer' or 'media' user could artificially trigger "Broken Arrow".
-- Fix: Limit to active operational roles.
DROP POLICY IF EXISTS "Authorized users can create journey events" ON journey_events;
CREATE POLICY "Authorized operational roles can create journey events"
  ON journey_events FOR INSERT
  WITH CHECK (has_any_role(ARRAY['super_admin','admin','captain','delta_oscar','tango_oscar','head_of_command']::user_role[]));

-- ----------------------------------------------------------------------------
-- 5. Restrict `telemetry_data` ghosting
-- ----------------------------------------------------------------------------
-- Original: CREATE POLICY "System can insert telemetry" ON telemetry_data FOR INSERT WITH CHECK (true);
-- Exploit: Viewers could spam false GPS coordinates to arbitrary Cheetahs.
-- Fix: Restrict insertion to transport officers and operational leads.
DROP POLICY IF EXISTS "System can insert telemetry" ON telemetry_data;
CREATE POLICY "Authorized transport officers can insert telemetry"
  ON telemetry_data FOR INSERT
  WITH CHECK (has_any_role(ARRAY['super_admin', 'admin', 'tango_oscar', 'head_tango_oscar', 'delta_oscar']::user_role[]));
