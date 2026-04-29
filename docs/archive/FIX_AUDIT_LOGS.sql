-- ============================================================================
-- FIX_AUDIT_LOGS.sql
-- Rebuilds the audit logging infrastructure so every data change is captured
-- with actor, action, target, change payload, and timestamp metadata.
-- Run this script in the Supabase SQL editor.
-- ============================================================================

-- 1. Ensure audit_logs table has the expected columns and indexes
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_type ON audit_logs(target_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- 2. Recreate the unified audit trigger function
DROP FUNCTION IF EXISTS audit_log_trigger CASCADE;
DROP FUNCTION IF EXISTS create_audit_log_entry CASCADE;

CREATE OR REPLACE FUNCTION audit_log_trigger()
RETURNS TRIGGER AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_action TEXT := lower(TG_OP);
  v_target UUID := COALESCE(NEW.id, OLD.id);
  v_changes JSONB;
  v_description TEXT;
  v_new JSONB := COALESCE(to_jsonb(NEW), '{}'::jsonb);
  v_old JSONB := COALESCE(to_jsonb(OLD), '{}'::jsonb);
BEGIN
  IF v_actor IS NULL THEN
    v_actor := COALESCE(
      NULLIF(v_new->>'updated_by', '')::uuid,
      NULLIF(v_old->>'updated_by', '')::uuid,
      NULLIF(v_new->>'created_by', '')::uuid,
      NULLIF(v_old->>'created_by', '')::uuid,
      NULLIF(v_new->>'assigned_by', '')::uuid,
      NULLIF(v_old->>'assigned_by', '')::uuid,
      NULLIF(v_new->>'user_id', '')::uuid,
      NULLIF(v_old->>'user_id', '')::uuid
    );
  END IF;

  IF v_actor IS NOT NULL THEN
    PERFORM 1 FROM users WHERE id = v_actor;
    IF NOT FOUND THEN
      v_actor := NULL;
    END IF;
  END IF;

  v_changes := CASE TG_OP
    WHEN 'INSERT' THEN jsonb_build_object('after', v_new)
    WHEN 'UPDATE' THEN jsonb_build_object('before', v_old, 'after', v_new)
    ELSE jsonb_build_object('before', v_old)
  END;

  v_description := CONCAT(initcap(v_action), ' on ', TG_TABLE_NAME);

  PERFORM set_config('row_security', 'off', true);

  INSERT INTO audit_logs (
    user_id,
    action,
    target_type,
    target_id,
    changes,
    description,
    metadata,
    created_at
  ) VALUES (
    v_actor,
    v_action,
    TG_TABLE_NAME,
    v_target,
    v_changes,
    v_description,
    jsonb_build_object(
      'trigger', TG_NAME,
      'schema', TG_TABLE_SCHEMA,
      'table', TG_TABLE_NAME
    ),
    NOW()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Attach triggers to all core tables we need to audit
DO $$
DECLARE
  table_name TEXT;
  tables TEXT[] := ARRAY[
    'users','programs','papas','journeys','journey_events','cheetahs','incidents',
    'title_assignments','official_titles','vehicle_locations','protocol_officer_locations',
    'flight_tracking','nests','theatres','eagle_squares','program_exports','chat_messages'
  ];
BEGIN
  FOREACH table_name IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%I_trigger ON %I;', table_name, table_name);
    EXECUTE format(
      'CREATE TRIGGER audit_%1$I_trigger
         AFTER INSERT OR UPDATE OR DELETE ON %1$I
         FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();',
      table_name
    );
  END LOOP;
END;
$$;

-- 4. Helpful view for admin dashboard consumption
DROP VIEW IF EXISTS audit_logs_readable;
CREATE VIEW audit_logs_readable AS
  SELECT
    al.id,
    al.user_id,
    u.full_name AS user_full_name,
    u.email AS user_email,
    u.role AS user_role,
    u.oscar AS user_oscar,
    al.action,
    al.target_type,
    al.target_id,
    al.description,
    al.changes,
    al.metadata,
    al.created_at
  FROM audit_logs al
  LEFT JOIN users u ON u.id = al.user_id;

-- 5. Success notice
DO $$
BEGIN
  RAISE NOTICE 'Audit logging triggers recreated successfully.';
END;
$$;
