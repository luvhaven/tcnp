-- Sharing is explicit server-side consent, not merely a stopped GPS watcher.
BEGIN;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS location_sharing_enabled boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.location_sharing_is_enabled(target_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.users WHERE id=target_user_id AND location_sharing_enabled=true AND is_active=true AND activation_status='active');
$$;

CREATE OR REPLACE FUNCTION public.guard_location_sharing_consent()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.location_sharing_enabled=true AND OLD.location_sharing_enabled IS DISTINCT FROM true THEN
  IF NOT public.is_trusted_backend() AND auth.uid() IS DISTINCT FROM NEW.id THEN
   RAISE EXCEPTION 'Only the officer can enable their location sharing' USING ERRCODE='42501';
  END IF;
  IF NEW.is_active IS DISTINCT FROM true OR NEW.activation_status<>'active' THEN
   RAISE EXCEPTION 'An active account is required to share location' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS users_guard_location_consent ON public.users;
CREATE TRIGGER users_guard_location_consent BEFORE UPDATE OF location_sharing_enabled ON public.users FOR EACH ROW EXECUTE FUNCTION public.guard_location_sharing_consent();

CREATE OR REPLACE FUNCTION public.unpublish_user_location()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.location_sharing_enabled=false OR NEW.is_active IS DISTINCT FROM true OR NEW.activation_status<>'active' THEN
  -- Remove only the published position; inactive historical records are retained.
  -- DELETE also wakes existing map subscribers without exposing coordinates.
  DELETE FROM public.user_locations WHERE user_id=NEW.id AND is_active=true;
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS users_unpublish_location ON public.users;
CREATE TRIGGER users_unpublish_location AFTER UPDATE OF location_sharing_enabled,is_active,activation_status ON public.users FOR EACH ROW EXECUTE FUNCTION public.unpublish_user_location();

CREATE OR REPLACE FUNCTION public.set_location_sharing(sharing_enabled boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target_id uuid:=auth.uid();
BEGIN
 IF target_id IS NULL OR sharing_enabled IS NULL THEN RAISE EXCEPTION 'Sign in to change location sharing' USING ERRCODE='42501'; END IF;
 IF sharing_enabled AND NOT public.is_active_member() THEN RAISE EXCEPTION 'An active account is required to share location' USING ERRCODE='42501'; END IF;
 -- The same user-row lock is acquired by uploads, so an old write cannot win
 -- after the off transition has completed.
 PERFORM 1 FROM public.users WHERE id=target_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account unavailable' USING ERRCODE='42501'; END IF;
 UPDATE public.users SET location_sharing_enabled=sharing_enabled WHERE id=target_id;
 RETURN sharing_enabled;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_user_location(p_user_id uuid,p_latitude numeric,p_longitude numeric,p_accuracy numeric DEFAULT NULL::numeric,p_altitude numeric DEFAULT NULL::numeric,p_heading numeric DEFAULT NULL::numeric,p_speed numeric DEFAULT NULL::numeric,p_battery_level integer DEFAULT NULL::integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE location_id uuid; allowed boolean;
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
 INSERT INTO public.user_locations(user_id,latitude,longitude,accuracy,altitude,heading,speed,battery_level)
 VALUES(p_user_id,p_latitude,p_longitude,p_accuracy,p_altitude,p_heading,p_speed,p_battery_level) RETURNING id INTO location_id;
 RETURN location_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_published_location()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE allowed boolean;
BEGIN
 IF NEW.is_active=true THEN
  SELECT location_sharing_enabled AND is_active AND activation_status='active' INTO allowed FROM public.users WHERE id=NEW.user_id FOR UPDATE;
  IF allowed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Location sharing is off' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS user_locations_guard_publishing ON public.user_locations;
CREATE TRIGGER user_locations_guard_publishing BEFORE INSERT OR UPDATE ON public.user_locations FOR EACH ROW EXECUTE FUNCTION public.guard_published_location();

CREATE OR REPLACE FUNCTION public.get_active_user_locations()
RETURNS TABLE(user_id uuid,full_name text,oscar text,role public.user_role,latitude numeric,longitude numeric,accuracy numeric,speed numeric,heading numeric,battery_level integer,updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT DISTINCT ON (ul.user_id) u.id,u.full_name,u.oscar,u.role,ul.latitude,ul.longitude,ul.accuracy,ul.speed,ul.heading,ul.battery_level,ul.updated_at
 FROM public.user_locations ul JOIN public.users u ON u.id=ul.user_id
 WHERE (public.is_trusted_backend() OR public.is_active_member()) AND ul.is_active=true
 AND u.location_sharing_enabled=true AND u.is_active=true AND u.activation_status='active'
 AND ul.updated_at>now()-interval '30 minutes' ORDER BY ul.user_id,ul.updated_at DESC;
$$;
DROP POLICY IF EXISTS user_locations_sharing_guard ON public.user_locations;
CREATE POLICY user_locations_sharing_guard ON public.user_locations AS RESTRICTIVE FOR SELECT TO authenticated
USING(public.is_active_member() AND public.location_sharing_is_enabled(user_id) AND is_active=true);
-- All app uploads use the locked RPC. Prevent direct legacy writes bypassing it.
REVOKE INSERT,UPDATE,DELETE ON public.user_locations FROM anon,authenticated;
REVOKE ALL ON FUNCTION public.set_location_sharing(boolean),public.location_sharing_is_enabled(uuid),public.upsert_user_location(uuid,numeric,numeric,numeric,numeric,numeric,numeric,integer),public.get_active_user_locations() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_location_sharing(boolean),public.location_sharing_is_enabled(uuid),public.upsert_user_location(uuid,numeric,numeric,numeric,numeric,numeric,numeric,integer),public.get_active_user_locations() TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.guard_location_sharing_consent(),public.unpublish_user_location(),public.guard_published_location() FROM PUBLIC,anon,authenticated;
COMMENT ON FUNCTION public.set_location_sharing(boolean) IS 'TCNP explicit sharing consent v1: off unpublishes current location and blocks late uploads.';
NOTIFY pgrst,'reload schema';
COMMIT;
