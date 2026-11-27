-- Location uploads from the native TCNP app while it is in the background.
--
-- The web app can only send a position while it is open on screen. The native
-- app (mobile/) keeps receiving positions with the phone locked, but that code
-- runs without the web session: no cookies, no Supabase login. It needs its
-- own credential that can do exactly one thing.
--
--   location_device_tokens   one live token per (officer, device). Only the
--                            SHA-256 hash is stored, so a database leak does
--                            not reveal a usable token. No client role can
--                            read or write the table.
--   issue_location_device_token()   called by the server after it has checked
--                            the officer's own session. A phone belongs to one
--                            officer at a time: issuing retires every other
--                            live token for that device.
--   ingest_device_location() called by the server for each upload. It resolves
--                            the token to its officer and hands the position to
--                            upsert_user_location, so every existing rule still
--                            applies: sharing must be on, the account active,
--                            one live pin per device. A token can never publish
--                            a position for anyone but its own officer.
--
-- Turning location sharing off does not need to revoke anything: uploads are
-- refused while it is off, and the app is told to stop.
--
-- No BEGIN/COMMIT: the migration runner wraps each file in its own transaction.

CREATE TABLE IF NOT EXISTS public.location_device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  platform text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS location_device_tokens_one_live_per_device
  ON public.location_device_tokens (device_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS location_device_tokens_user_idx
  ON public.location_device_tokens (user_id) WHERE revoked_at IS NULL;

ALTER TABLE public.location_device_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.location_device_tokens FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.issue_location_device_token(
  p_user_id uuid,
  p_device_id text,
  p_token_hash text,
  p_platform text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  device text := NULLIF(left(btrim(p_device_id), 64), '');
  new_id uuid;
BEGIN
  IF NOT public.is_trusted_backend() THEN
    RAISE EXCEPTION 'Only the server issues device tokens' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR device IS NULL OR p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid device token request' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = p_user_id AND u.is_active = true AND u.activation_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Account is not active' USING ERRCODE = '42501';
  END IF;

  -- Serialise per device so two requests cannot both leave a live token.
  PERFORM pg_advisory_xact_lock(hashtextextended('location_device_token:' || device, 0));
  UPDATE public.location_device_tokens SET revoked_at = now()
  WHERE device_id = device AND revoked_at IS NULL;

  INSERT INTO public.location_device_tokens (user_id, device_id, token_hash, platform)
  VALUES (p_user_id, device, p_token_hash, NULLIF(left(btrim(p_platform), 16), ''))
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_location_device_tokens(p_user_id uuid, p_device_id text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  device text := NULLIF(left(btrim(p_device_id), 64), '');
  revoked integer;
BEGIN
  IF NOT public.is_trusted_backend() THEN
    RAISE EXCEPTION 'Only the server revokes device tokens' USING ERRCODE = '42501';
  END IF;
  UPDATE public.location_device_tokens SET revoked_at = now()
  WHERE user_id = p_user_id AND revoked_at IS NULL AND (device IS NULL OR device_id = device);
  GET DIAGNOSTICS revoked = ROW_COUNT;
  RETURN revoked;
END;
$$;

-- Returns 'ok', 'invalid' (unknown or revoked token: the app must stop and ask
-- for a new one) or 'sharing_off' (the officer switched sharing off, or the
-- account is no longer active: the app must stop).
CREATE OR REPLACE FUNCTION public.ingest_device_location(
  p_token_hash text,
  p_latitude numeric,
  p_longitude numeric,
  p_accuracy numeric DEFAULT NULL,
  p_altitude numeric DEFAULT NULL,
  p_heading numeric DEFAULT NULL,
  p_speed numeric DEFAULT NULL,
  p_battery_level integer DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  token record;
BEGIN
  IF NOT public.is_trusted_backend() THEN
    RAISE EXCEPTION 'Only the server records device locations' USING ERRCODE = '42501';
  END IF;

  SELECT t.id, t.user_id, t.device_id INTO token
  FROM public.location_device_tokens t
  WHERE t.token_hash = p_token_hash AND t.revoked_at IS NULL;
  IF NOT FOUND THEN
    RETURN 'invalid';
  END IF;

  BEGIN
    PERFORM public.upsert_user_location(
      token.user_id, p_latitude, p_longitude, p_accuracy, p_altitude, p_heading, p_speed, p_battery_level, token.device_id
    );
  EXCEPTION WHEN insufficient_privilege THEN
    -- upsert_user_location refuses when sharing is off or the account is inactive.
    RETURN 'sharing_off';
  END;

  UPDATE public.location_device_tokens SET last_used_at = now() WHERE id = token.id;
  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.issue_location_device_token(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_location_device_tokens(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ingest_device_location(text, numeric, numeric, numeric, numeric, numeric, numeric, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_location_device_token(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_location_device_tokens(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ingest_device_location(text, numeric, numeric, numeric, numeric, numeric, numeric, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
