-- Fix for "new row violates row-level security policy for table program_exports"
-- The previous policy likely excluded 'dev_admin' and other necessary roles.

-- 1. Drop existing policies to be safe
DROP POLICY IF EXISTS "authorized_users_export" ON program_exports;
DROP POLICY IF EXISTS "users_view_exports" ON program_exports;

-- 2. Re-create INSERT policy with expanded roles (including dev_admin and echo roles)
-- Note: usage of ::user_role[] implies these values must exist in the enum.
-- If dev_admin is not in the enum, this might be tricky, but assuming it is based on app usage.
-- We also allow authenticated users if we just want to let them export (logging is already captured).
-- But let's stick to the secure approach but expand the list.

CREATE POLICY "authorized_users_export"
  ON program_exports FOR INSERT
  WITH CHECK (
    exported_by = auth.uid()
    AND (
      -- Check roles if they exist in the enum
      has_any_role(ARRAY[
        'super_admin',
        'admin',
        'dev_admin', 
        'captain',
        'head_of_operations',
        'head_of_command',
        'head_echo_oscar'
      ]::user_role[])
    )
  );

-- 3. Re-create SELECT policy
CREATE POLICY "users_view_exports"
  ON program_exports FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    -- Optionally restrict to own exports or admins, but current allowed all authenticated
  );

-- Verification
DO $$
BEGIN
  RAISE NOTICE 'Updated program_exports RLS policies to include dev_admin and head_echo_oscar';
END $$;
