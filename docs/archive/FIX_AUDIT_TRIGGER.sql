-- ============================================================================
-- FIX AUDIT LOG FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Drop all existing audit triggers first
DROP TRIGGER IF EXISTS audit_users_trigger ON users;
DROP TRIGGER IF EXISTS audit_programs_trigger ON programs;
DROP TRIGGER IF EXISTS audit_papas_trigger ON papas;
DROP TRIGGER IF EXISTS audit_journeys_trigger ON journeys;
DROP TRIGGER IF EXISTS audit_cheetahs_trigger ON cheetahs;
DROP TRIGGER IF EXISTS audit_incidents_trigger ON incidents;
DROP TRIGGER IF EXISTS audit_title_assignments_trigger ON title_assignments;
DROP TRIGGER IF EXISTS audit_official_titles_trigger ON official_titles;
DROP TRIGGER IF EXISTS audit_vehicle_locations_trigger ON vehicle_locations;
DROP TRIGGER IF EXISTS audit_protocol_officer_locations_trigger ON protocol_officer_locations;
DROP TRIGGER IF EXISTS audit_flight_tracking_trigger ON flight_tracking;
DROP TRIGGER IF EXISTS audit_program_exports_trigger ON program_exports;
DROP TRIGGER IF EXISTS audit_chat_messages_trigger ON chat_messages;

-- Drop conflicting functions
DROP FUNCTION IF EXISTS log_audit_event CASCADE;
DROP FUNCTION IF EXISTS handle_profile_update_audit CASCADE;
DROP TRIGGER IF EXISTS profile_update_audit_trigger ON users;

-- Make status column nullable
ALTER TABLE audit_logs ALTER COLUMN status DROP NOT NULL;
ALTER TABLE audit_logs ALTER COLUMN status SET DEFAULT 'completed';

-- Make other audit_logs columns nullable if they exist
DO $$
BEGIN
  -- Make all extended audit columns nullable
  ALTER TABLE audit_logs ALTER COLUMN user_email DROP NOT NULL;
  ALTER TABLE audit_logs ALTER COLUMN user_role DROP NOT NULL;
  ALTER TABLE audit_logs ALTER COLUMN ip_address DROP NOT NULL;
  ALTER TABLE audit_logs ALTER COLUMN user_agent DROP NOT NULL;
  ALTER TABLE audit_logs ALTER COLUMN error_code DROP NOT NULL;
  ALTER TABLE audit_logs ALTER COLUMN error_message DROP NOT NULL;
  ALTER TABLE audit_logs ALTER COLUMN metadata DROP NOT NULL;
  ALTER TABLE audit_logs ALTER COLUMN request_id DROP NOT NULL;
  ALTER TABLE audit_logs ALTER COLUMN session_id DROP NOT NULL;
  ALTER TABLE audit_logs ALTER COLUMN device_info DROP NOT NULL;
  ALTER TABLE audit_logs ALTER COLUMN execution_time_ms DROP NOT NULL;
  ALTER TABLE audit_logs ALTER COLUMN path DROP NOT NULL;
  ALTER TABLE audit_logs ALTER COLUMN method DROP NOT NULL;
  ALTER TABLE audit_logs ALTER COLUMN params DROP NOT NULL;
  ALTER TABLE audit_logs ALTER COLUMN headers DROP NOT NULL;
EXCEPTION
  WHEN undefined_column THEN NULL;
END $$;

-- Recreate the simple audit log trigger function
CREATE OR REPLACE FUNCTION audit_log_trigger()
RETURNS TRIGGER AS $$
DECLARE
  v_action TEXT;
  v_changes JSONB;
  v_description TEXT;
  v_user_id UUID := auth.uid();
  v_new JSONB;
  v_old JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_new := to_jsonb(NEW);
    v_changes := v_new;
    v_description := 'Created ' || TG_TABLE_NAME || ' record';
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_new := to_jsonb(NEW);
    v_old := to_jsonb(OLD);
    v_changes := jsonb_build_object(
      'before', v_old,
      'after', v_new
    );
    v_description := 'Updated ' || TG_TABLE_NAME || ' record';
  ELSE
    v_action := 'delete';
    v_old := to_jsonb(OLD);
    v_changes := v_old;
    v_description := 'Deleted ' || TG_TABLE_NAME || ' record';
  END IF;

  IF v_user_id IS NULL THEN
    IF v_new IS NULL THEN
      v_new := '{}'::jsonb;
    END IF;

    IF v_old IS NULL THEN
      v_old := '{}'::jsonb;
    END IF;

    v_user_id := COALESCE(
      NULLIF(v_new->>'updated_by', '')::uuid,
      NULLIF(v_old->>'updated_by', '')::uuid,
      NULLIF(v_new->>'created_by', '')::uuid,
      NULLIF(v_old->>'created_by', '')::uuid,
      NULLIF(v_new->>'assigned_by', '')::uuid,
      NULLIF(v_old->>'assigned_by', '')::uuid,
      NULLIF(v_new->>'user_id', '')::uuid,
      NULLIF(v_old->>'user_id', '')::uuid,
      NULLIF(v_new->>'id', '')::uuid,
      NULLIF(v_old->>'id', '')::uuid
    );
  END IF;

  INSERT INTO audit_logs (
    user_id, 
    action, 
    target_type, 
    target_id, 
    changes, 
    description,
    status,
    created_at
  )
  VALUES (
    v_user_id, 
    v_action, 
    TG_TABLE_NAME, 
    COALESCE(NEW.id, OLD.id), 
    v_changes, 
    v_description,
    'completed',
    NOW()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate all audit triggers
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT unnest(ARRAY[
    'users','programs','papas','journeys','cheetahs','incidents','title_assignments',
    'official_titles','vehicle_locations','protocol_officer_locations','flight_tracking',
    'program_exports','chat_messages'
  ]) AS tbl LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%I_trigger ON %I;', rec.tbl, rec.tbl);
    EXECUTE format('CREATE TRIGGER audit_%I_trigger AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();', rec.tbl, rec.tbl);
  END LOOP;
END;
$$;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '✓ Audit log functions and triggers fixed successfully';
  RAISE NOTICE '============================================================================';
END $$;
