-- ============================================================
-- USER LOCATIONS & LIVE TRACKING
-- Migration: 20260702190000_user_locations_and_tracking.sql
-- ============================================================

-- 1. Create the user_locations table
CREATE TABLE IF NOT EXISTS public.user_locations (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid         NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  latitude       double precision NOT NULL,
  longitude      double precision NOT NULL,
  accuracy       double precision,
  altitude       double precision,
  heading        double precision,
  speed          double precision,
  battery_level  integer,
  updated_at     timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (user_id)   -- one row per user, updated in-place
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_locations_user_id   ON public.user_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_locations_updated   ON public.user_locations(updated_at DESC);

-- Enable RLS
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to see all locations (needed for the live map)
CREATE POLICY "All authenticated users can view locations"
  ON public.user_locations FOR SELECT
  TO authenticated
  USING (true);

-- Users can only insert/update their own location
CREATE POLICY "Users can upsert their own location"
  ON public.user_locations FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own location"
  ON public.user_locations FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 2. upsert_user_location RPC
--    Called client-side every ~10s to push current GPS fix.
-- ============================================================

-- Drop any existing overloaded variants to avoid 'not unique' error
DROP FUNCTION IF EXISTS public.upsert_user_location(uuid, double precision, double precision, double precision, double precision, double precision, double precision, integer);
DROP FUNCTION IF EXISTS public.upsert_user_location(uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric);
DROP FUNCTION IF EXISTS public.upsert_user_location(uuid, float8, float8, float8, float8, float8, float8, int4);
DROP FUNCTION IF EXISTS public.upsert_user_location CASCADE;

CREATE OR REPLACE FUNCTION public.upsert_user_location(
  p_user_id     uuid,
  p_latitude    double precision,
  p_longitude   double precision,
  p_accuracy    double precision  DEFAULT NULL,
  p_altitude    double precision  DEFAULT NULL,
  p_heading     double precision  DEFAULT NULL,
  p_speed       double precision  DEFAULT NULL,
  p_battery_level integer        DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER   -- run as owner to bypass RLS on the upsert
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_locations (
    user_id, latitude, longitude, accuracy,
    altitude, heading, speed, battery_level, updated_at
  )
  VALUES (
    p_user_id, p_latitude, p_longitude, p_accuracy,
    p_altitude, p_heading, p_speed, p_battery_level, now()
  )
  ON CONFLICT (user_id) DO UPDATE
    SET latitude      = EXCLUDED.latitude,
        longitude     = EXCLUDED.longitude,
        accuracy      = EXCLUDED.accuracy,
        altitude      = EXCLUDED.altitude,
        heading       = EXCLUDED.heading,
        speed         = EXCLUDED.speed,
        battery_level = EXCLUDED.battery_level,
        updated_at    = now();
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.upsert_user_location TO authenticated;

-- ============================================================
-- 3. get_active_user_locations RPC
--    Returns enriched location rows joined with the users table.
--    "Active" = updated within the last 24 hours.
-- ============================================================

-- Drop any existing overloaded variants
DROP FUNCTION IF EXISTS public.get_active_user_locations();
DROP FUNCTION IF EXISTS public.get_active_user_locations CASCADE;

CREATE OR REPLACE FUNCTION public.get_active_user_locations()
RETURNS TABLE (
  user_id       uuid,
  full_name     text,
  oscar         text,
  role          text,
  latitude      double precision,
  longitude     double precision,
  accuracy      double precision,
  speed         double precision,
  heading       double precision,
  battery_level integer,
  updated_at    timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ul.user_id,
    u.full_name,
    u.oscar,
    u.role,
    ul.latitude,
    ul.longitude,
    ul.accuracy,
    ul.speed,
    ul.heading,
    ul.battery_level,
    ul.updated_at
  FROM public.user_locations ul
  INNER JOIN public.users u ON u.id = ul.user_id
  WHERE ul.updated_at >= now() - interval '24 hours'
    AND u.is_active = true
  ORDER BY ul.updated_at DESC;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_active_user_locations TO authenticated;

-- Enable replication for realtime (so the live map receives push updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_locations;
