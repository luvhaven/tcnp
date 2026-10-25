-- Structured residential location replaces the profile's free-form address input.
-- Keep existing address and city values intact; do not guess how to split them.
BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS local_government_area text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS nearest_bus_stop_landmark text;

COMMIT;
