-- Migration to add password security tracking to users table

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS password_last_changed TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS password_last_notified TIMESTAMPTZ;

-- Existing users retain a meaningful password-age baseline.
UPDATE public.users
SET password_last_changed = created_at
WHERE password_last_changed IS NULL;
