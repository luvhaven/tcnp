-- Migration to add password security tracking to users table

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS password_last_changed TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS password_last_notified TIMESTAMPTZ;

-- Because existing users haven't changed their password recently, we can set their last change to NOW() 
-- so they aren't all immediately locked out, or set it to their created_at date. 
-- Let's set it to created_at so older users will be forced to rotate soon.
UPDATE public.users 
SET password_last_changed = created_at
WHERE password_last_changed IS NULL OR password_last_changed = NOW();
