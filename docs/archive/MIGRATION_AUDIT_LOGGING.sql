-- ============================================================================
-- AUDIT LOGGING SYSTEM
-- ============================================================================
-- This migration creates triggers for automatic audit logging
-- ============================================================================

-- ============================================================================
-- 1. CREATE AUDIT LOG FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION create_audit_log()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_action TEXT;
  v_changes JSONB;
BEGIN
  -- Get current user ID
  v_user_id := auth.uid();
  
  -- Determine action
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_changes := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_changes := jsonb_build_object(
      'before', to_jsonb(OLD),
      'after', to_jsonb(NEW)
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_changes := to_jsonb(OLD);
  END IF;
  
  -- Insert audit log
  INSERT INTO audit_logs (
    user_id,
    action,
    target_type,
    target_id,
    changes
  ) VALUES (
    v_user_id,
    v_action,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    v_changes
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. CREATE TRIGGERS FOR AUDIT LOGGING
-- ============================================================================

-- Users table
DROP TRIGGER IF EXISTS audit_users ON users;
DROP TRIGGER IF EXISTS audit_users_trigger ON users;
CREATE TRIGGER audit_users_trigger
  AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW
  EXECUTE FUNCTION create_audit_log();

-- Programs table
DROP TRIGGER IF EXISTS audit_programs ON programs;
CREATE TRIGGER audit_programs
  AFTER INSERT OR UPDATE OR DELETE ON programs
  FOR EACH ROW
  EXECUTE FUNCTION create_audit_log();

-- Journeys table
DROP TRIGGER IF EXISTS audit_journeys ON journeys;
CREATE TRIGGER audit_journeys
  AFTER INSERT OR UPDATE OR DELETE ON journeys
  FOR EACH ROW
  EXECUTE FUNCTION create_audit_log();

-- Papas table
DROP TRIGGER IF EXISTS audit_papas ON papas;
CREATE TRIGGER audit_papas
  AFTER INSERT OR UPDATE OR DELETE ON papas
  FOR EACH ROW
  EXECUTE FUNCTION create_audit_log();

-- Cheetahs table
DROP TRIGGER IF EXISTS audit_cheetahs ON cheetahs;
CREATE TRIGGER audit_cheetahs
  AFTER INSERT OR UPDATE OR DELETE ON cheetahs
  FOR EACH ROW
  EXECUTE FUNCTION create_audit_log();

-- Incidents table
DROP TRIGGER IF EXISTS audit_incidents ON incidents;
CREATE TRIGGER audit_incidents
  AFTER INSERT OR UPDATE OR DELETE ON incidents
  FOR EACH ROW
  EXECUTE FUNCTION create_audit_log();

-- Title assignments table
DROP TRIGGER IF EXISTS audit_title_assignments ON title_assignments;
CREATE TRIGGER audit_title_assignments
  AFTER INSERT OR UPDATE OR DELETE ON title_assignments
  FOR EACH ROW
  EXECUTE FUNCTION create_audit_log();

-- Eagle squares table
DROP TRIGGER IF EXISTS audit_eagle_squares ON eagle_squares;
CREATE TRIGGER audit_eagle_squares
  AFTER INSERT OR UPDATE OR DELETE ON eagle_squares
  FOR EACH ROW
  EXECUTE FUNCTION create_audit_log();

-- Nests table
DROP TRIGGER IF EXISTS audit_nests ON nests;
CREATE TRIGGER audit_nests
  AFTER INSERT OR UPDATE OR DELETE ON nests
  FOR EACH ROW
  EXECUTE FUNCTION create_audit_log();

-- Theatres table
DROP TRIGGER IF EXISTS audit_theatres ON theatres;
CREATE TRIGGER audit_theatres
  AFTER INSERT OR UPDATE OR DELETE ON theatres
  FOR EACH ROW
  EXECUTE FUNCTION create_audit_log();

-- ============================================================================
-- 3. CREATE VIEW FOR READABLE AUDIT LOGS
-- ============================================================================

CREATE OR REPLACE VIEW audit_logs_readable AS
SELECT 
  al.id,
  al.action,
  al.target_type,
  al.target_id,
  al.changes,
  al.created_at,
  u.full_name as user_name,
  u.email as user_email,
  u.oscar as user_oscar,
  u.role as user_role
FROM audit_logs al
LEFT JOIN users u ON al.user_id = u.id
ORDER BY al.created_at DESC;

-- Grant access to view
GRANT SELECT ON audit_logs_readable TO authenticated;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'AUDIT LOGGING SYSTEM CREATED SUCCESSFULLY!';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Audit Triggers Created For:';
  RAISE NOTICE '  ✓ Users';
  RAISE NOTICE '  ✓ Programs';
  RAISE NOTICE '  ✓ Journeys';
  RAISE NOTICE '  ✓ Papas';
  RAISE NOTICE '  ✓ Cheetahs';
  RAISE NOTICE '  ✓ Incidents';
  RAISE NOTICE '  ✓ Title Assignments';
  RAISE NOTICE '  ✓ Eagle Squares';
  RAISE NOTICE '  ✓ Nests';
  RAISE NOTICE '  ✓ Theatres';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'All CRUD operations will now be automatically logged!';
  RAISE NOTICE '============================================================================';
END $$;
