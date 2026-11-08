-- One live map pin per physical device.
--
-- Positions were already de-duplicated per officer, but a phone shared between
-- officers (A signs out, B signs in) kept A's pin live for up to 30 minutes at
-- the same spot as B's, so one device showed as several people. Uploads now
-- carry a stable per-device id; a new upload retires any other officer's live
-- pin from the same device.
--
-- The new p_device_id parameter defaults to NULL, so the app keeps working
-- before and after this migration (the client falls back when it is missing).
BEGIN;

ALTER TABLE public.user_locations ADD COLUMN IF NOT EXISTS device_id text;
CREATE INDEX IF NOT EXISTS user_locations_active_device_idx
  ON public.user_locations (device_id) WHERE is_active = true AND device_id IS NOT NULL;

DROP FUNCTION IF EXISTS public.upsert_user_location(uuid,numeric,numeric,numeric,numeric,numeric,numeric,integer);

CREATE OR REPLACE FUNCTION public.upsert_user_location(
  p_user_id uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_accuracy numeric DEFAULT NULL::numeric,
  p_altitude numeric DEFAULT NULL::numeric,
  p_heading numeric DEFAULT NULL::numeric,
  p_speed numeric DEFAULT NULL::numeric,
  p_battery_level integer DEFAULT NULL::integer,
  p_device_id text DEFAULT NULL::text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE location_id uuid; allowed boolean; device text := NULLIF(left(btrim(p_device_id), 64), '');
BEGIN
 IF NOT public.is_trusted_backend() AND (p_user_id IS DISTINCT FROM auth.uid() OR NOT public.is_active_member()) THEN
  RAISE EXCEPTION 'You can only report your own location' USING ERRCODE='42501';
 END IF;
 SELECT location_sharing_enabled AND is_active AND activation_status='active' INTO allowed FROM public.users WHERE id=p_user_id FOR UPDATE;
 IF allowed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Location sharing is off' USING ERRCODE='42501'; END IF;
 IF p_latitude IS NULL OR p_longitude IS NULL OR p_latitude NOT BETWEEN -90 AND 90 OR p_longitude NOT BETWEEN -180 AND 180 THEN
  RAISE EXCEPTION 'Invalid location' USING ERRCODE='22023';
 END IF;
 UPDATE public.user_locations SET is_active=false WHERE user_id=p_user_id AND is_active=true;
 IF device IS NOT NULL THEN
  -- This phone now belongs to p_user_id; retire whoever reported from it before.
  UPDATE public.user_locations SET is_active=false
   WHERE device_id=device AND is_active=true AND user_id<>p_user_id;
 END IF;
 INSERT INTO public.user_locations(user_id,latitude,longitude,accuracy,altitude,heading,speed,battery_level,device_id)
 VALUES(p_user_id,p_latitude,p_longitude,p_accuracy,p_altitude,p_heading,p_speed,p_battery_level,device) RETURNING id INTO location_id;
 RETURN location_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_user_location(uuid,numeric,numeric,numeric,numeric,numeric,numeric,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.upsert_user_location(uuid,numeric,numeric,numeric,numeric,numeric,numeric,integer,text) TO authenticated,service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
