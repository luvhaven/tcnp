-- ============================================================================
-- FIX_ENUM_CAST_ERRORS.sql
-- Fixes "operator does not exist: user_role = text" errors by ensuring
-- all role/enum columns use proper casting and indexes
-- ============================================================================

-- 1. Drop and recreate indexes with proper casting for user_role
DROP INDEX IF EXISTS idx_users_role;
CREATE INDEX idx_users_role ON users(role);

-- 2. Ensure role column is properly typed as user_role enum
-- (This should already be correct, but we verify it)
DO $$
BEGIN
  -- Check if role column exists and is of correct type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'users' 
    AND column_name = 'role'
    AND udt_name != 'user_role'
  ) THEN
    -- If it's not the enum type, alter it
    ALTER TABLE users ALTER COLUMN role TYPE user_role USING role::user_role;
  END IF;
END $$;

-- 3. Update RLS policies to use proper enum casting
DROP POLICY IF EXISTS "Users can view their own data" ON users;
CREATE POLICY "Users can view their own data"
  ON users FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can view all users" ON users;
CREATE POLICY "Admins can view all users"
  ON users FOR SELECT
  USING (has_any_role(ARRAY['super_admin','admin']::user_role[]));

DROP POLICY IF EXISTS "Admins can update users" ON users;
CREATE POLICY "Admins can update users"
  ON users FOR UPDATE
  USING (has_any_role(ARRAY['super_admin','admin']::user_role[]));

DROP POLICY IF EXISTS "Admins can insert users" ON users;
CREATE POLICY "Admins can insert users"
  ON users FOR INSERT
  WITH CHECK (has_any_role(ARRAY['super_admin','admin']::user_role[]));

DROP POLICY IF EXISTS "Admins can delete users" ON users;
CREATE POLICY "Admins can delete users"
  ON users FOR DELETE
  USING (has_any_role(ARRAY['super_admin','admin']::user_role[]));

-- 4. Drop and recreate helper functions with proper type handling
DROP FUNCTION IF EXISTS is_valid_user_role(text) CASCADE;
DROP FUNCTION IF EXISTS current_user_claim_roles() CASCADE;
DROP FUNCTION IF EXISTS has_claim_role(user_role) CASCADE;
DROP FUNCTION IF EXISTS has_claim_role(text) CASCADE;
DROP FUNCTION IF EXISTS has_any_claim_role(user_role[]) CASCADE;
DROP FUNCTION IF EXISTS has_any_claim_role(text[]) CASCADE;
DROP FUNCTION IF EXISTS has_role(user_role) CASCADE;
DROP FUNCTION IF EXISTS has_role(text) CASCADE;
DROP FUNCTION IF EXISTS has_any_role(user_role[]) CASCADE;
DROP FUNCTION IF EXISTS has_any_role(text[]) CASCADE;
DROP FUNCTION IF EXISTS is_admin_user() CASCADE;
DROP FUNCTION IF EXISTS has_program_admin_access() CASCADE;

CREATE FUNCTION is_valid_user_role(p_role text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_role IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'user_role'::regtype
      AND enumlabel = p_role
  );
END;
$$;

CREATE FUNCTION current_user_claim_roles()
RETURNS user_role[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims jsonb;
  roles  user_role[] := ARRAY[]::user_role[];
  token_role text;
BEGIN
  claims := auth.jwt();

  IF claims IS NOT NULL THEN
    token_role := claims ->> 'role';
    IF token_role IS NOT NULL AND is_valid_user_role(token_role) THEN
      roles := roles || token_role::user_role;
    END IF;

    token_role := claims #>> '{user_metadata,role}';
    IF token_role IS NOT NULL AND is_valid_user_role(token_role) THEN
      roles := roles || token_role::user_role;
    END IF;

    token_role := claims #>> '{app_metadata,role}';
    IF token_role IS NOT NULL AND is_valid_user_role(token_role) THEN
      roles := roles || token_role::user_role;
    END IF;

    IF claims ? 'roles' THEN
      FOR token_role IN
        SELECT value::text
        FROM jsonb_array_elements(claims -> 'roles') AS roles(value)
      LOOP
        IF token_role IS NOT NULL AND is_valid_user_role(token_role) THEN
          roles := roles || token_role::user_role;
        END IF;
      END LOOP;
    END IF;
  END IF;

  RETURN roles;
END;
$$;

CREATE FUNCTION has_claim_role(p_role user_role)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claim_roles user_role[];
BEGIN
  IF p_role IS NULL THEN
    RETURN FALSE;
  END IF;

  claim_roles := current_user_claim_roles();
  RETURN claim_roles IS NOT NULL AND array_length(claim_roles, 1) IS NOT NULL AND p_role = ANY(claim_roles);
END;
$$;

CREATE FUNCTION has_claim_role(p_role text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_valid_user_role(p_role) THEN
    RETURN FALSE;
  END IF;

  RETURN has_claim_role(p_role::user_role);
END;
$$;

CREATE FUNCTION has_any_claim_role(p_roles user_role[])
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate user_role;
BEGIN
  IF p_roles IS NULL OR array_length(p_roles, 1) IS NULL THEN
    RETURN FALSE;
  END IF;

  FOREACH candidate IN ARRAY p_roles LOOP
    IF has_claim_role(candidate) THEN
      RETURN TRUE;
    END IF;
  END LOOP;

  RETURN FALSE;
END;
$$;

CREATE FUNCTION has_any_claim_role(p_roles text[])
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate text;
BEGIN
  IF p_roles IS NULL OR array_length(p_roles, 1) IS NULL THEN
    RETURN FALSE;
  END IF;

  FOREACH candidate IN ARRAY p_roles LOOP
    IF has_claim_role(candidate) THEN
      RETURN TRUE;
    END IF;
  END LOOP;

  RETURN FALSE;
END;
$$;

CREATE FUNCTION has_role(p_role user_role)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN has_claim_role(p_role);
END;
$$;

CREATE FUNCTION has_role(p_role text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_valid_user_role(p_role) THEN
    RETURN FALSE;
  END IF;

  RETURN has_role(p_role::user_role);
END;
$$;

CREATE FUNCTION has_any_role(p_roles user_role[])
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN has_any_claim_role(p_roles);
END;
$$;

CREATE FUNCTION has_any_role(p_roles text[])
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  valid_roles user_role[] := ARRAY[]::user_role[];
  role_text text;
BEGIN
  IF p_roles IS NULL OR array_length(p_roles, 1) IS NULL THEN
    RETURN FALSE;
  END IF;

  FOREACH role_text IN ARRAY p_roles LOOP
    IF is_valid_user_role(role_text) THEN
      valid_roles := valid_roles || role_text::user_role;
    END IF;
  END LOOP;

  IF valid_roles IS NULL OR array_length(valid_roles, 1) IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN has_any_role(valid_roles);
END;
$$;

CREATE FUNCTION is_admin_user()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN has_any_role(ARRAY['super_admin','admin']::user_role[]);
END;
$$;

CREATE FUNCTION has_program_admin_access()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  required_roles user_role[] := ARRAY['super_admin','admin','captain','head_of_command','head_of_operations']::user_role[];
BEGIN
  IF has_any_claim_role(required_roles) THEN
    RETURN TRUE;
  END IF;

  RETURN has_any_role_from_db(required_roles);
END;
$$;

-- 5. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_users_activation_status ON users(activation_status);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 6. Recreate manage policies with explicit WITH CHECK clauses
DROP POLICY IF EXISTS official_titles_manage ON official_titles;
CREATE POLICY official_titles_manage
  ON official_titles FOR ALL
  USING (has_any_role(ARRAY['super_admin','admin']::user_role[]))
  WITH CHECK (has_any_role(ARRAY['super_admin','admin']::user_role[]));

DROP POLICY IF EXISTS title_assignments_manage ON title_assignments;
CREATE POLICY title_assignments_manage
  ON title_assignments FOR ALL
  USING (has_any_role(ARRAY['super_admin','admin']::user_role[]))
  WITH CHECK (has_any_role(ARRAY['super_admin','admin']::user_role[]));

DROP POLICY IF EXISTS eagle_squares_manage ON eagle_squares;
CREATE POLICY eagle_squares_manage
  ON eagle_squares FOR ALL
  USING (has_any_role(ARRAY['super_admin','admin','captain','vice_captain','head_of_command','head_of_operations']::user_role[]))
  WITH CHECK (has_any_role(ARRAY['super_admin','admin','captain','vice_captain','head_of_command','head_of_operations']::user_role[]));

DROP POLICY IF EXISTS nests_manage ON nests;
CREATE POLICY nests_manage
  ON nests FOR ALL
  USING (has_any_role(ARRAY['super_admin','admin','captain','vice_captain','head_of_command','head_of_operations']::user_role[]))
  WITH CHECK (has_any_role(ARRAY['super_admin','admin','captain','vice_captain','head_of_command','head_of_operations']::user_role[]));

DROP POLICY IF EXISTS theatres_manage ON theatres;
CREATE POLICY theatres_manage
  ON theatres FOR ALL
  USING (has_any_role(ARRAY['super_admin','admin','captain','vice_captain','head_of_command','head_of_operations']::user_role[]))
  WITH CHECK (has_any_role(ARRAY['super_admin','admin','captain','vice_captain','head_of_command','head_of_operations']::user_role[]));

DROP POLICY IF EXISTS cheetahs_manage ON cheetahs;
CREATE POLICY cheetahs_manage
  ON cheetahs FOR ALL
  USING (has_any_role(ARRAY['super_admin','admin','captain','vice_captain','head_of_command']::user_role[]))
  WITH CHECK (has_any_role(ARRAY['super_admin','admin','captain','vice_captain','head_of_command']::user_role[]));

DROP POLICY IF EXISTS incidents_manage ON incidents;
CREATE POLICY incidents_manage
  ON incidents FOR ALL
  USING (has_any_role(ARRAY['super_admin','admin','captain','head_of_operations','head_of_command']::user_role[]))
  WITH CHECK (has_any_role(ARRAY['super_admin','admin','captain','head_of_operations','head_of_command']::user_role[]));

DROP POLICY IF EXISTS "Authorized users can manage programs" ON programs;
CREATE POLICY "Authorized users can manage programs"
  ON programs FOR ALL
  USING (has_program_admin_access())
  WITH CHECK (has_program_admin_access());

-- 7. Verify all enum columns are properly typed
DO $$
BEGIN
  -- journey_status
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'journeys' 
    AND column_name = 'status'
    AND udt_name != 'journey_status'
  ) THEN
    ALTER TABLE journeys ALTER COLUMN status TYPE journey_status USING status::journey_status;
  END IF;

  -- vehicle_status
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'cheetahs' 
    AND column_name = 'current_status'
    AND udt_name != 'vehicle_status'
  ) THEN
    ALTER TABLE cheetahs ALTER COLUMN current_status TYPE vehicle_status USING current_status::vehicle_status;
  END IF;
END $$;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'FIX_ENUM_CAST_ERRORS.sql completed successfully. All enum casting issues resolved.';
END $$;
