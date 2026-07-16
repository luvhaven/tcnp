-- ============================================================
-- Migration: Sierra → Serial
-- Renames the Sierra Oscar unit to Serial Oscar throughout:
--   1. user_role enum: adds serial_oscar + head_serial_oscar,
--      migrates existing rows, then removes old enum values
--   2. users.oscar text column: updates stored text values
--   3. Storage bucket: renamed via Supabase UI (see note below)
-- ============================================================

-- Step 1: Add the new enum values to user_role
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'serial_oscar';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'head_serial_oscar';

-- PostgreSQL requires newly added enum values to be committed before they can be used
-- in an UPDATE query within the same transaction.
COMMIT;

-- Step 2: Migrate existing rows in users.role
UPDATE public.users
SET role = 'serial_oscar'
WHERE role = 'sierra_oscar';

UPDATE public.users
SET role = 'head_serial_oscar'
WHERE role = 'head_sierra_oscar';

-- Step 3: Migrate the oscar text column (free-text, various spellings users may have entered)
UPDATE public.users
SET oscar = 'Serial Oscar'
WHERE oscar IN ('Sierra Oscar', 'sierra oscar', 'Sierra', 'sierra', 'so', 'SO', 'sierra_oscar');

-- Step 4: NOTE — PostgreSQL does not support DROP VALUE on enums.
-- The old 'sierra_oscar' and 'head_sierra_oscar' values remain on the enum
-- but will no longer be assigned to any rows. If a hard cleanup is ever
-- needed, create a new enum type, swap the column, and drop the old type.
-- For now this migration is safe and complete for all active data.
