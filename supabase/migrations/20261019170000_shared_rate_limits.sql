-- Shared API rate limits (audit 2026-10-19, P1 #13)
--
-- The in-memory limiter is per server instance, so a client spread across
-- instances got a fresh allowance on each. Counters now live here, written only
-- by the server (service role) through rate_limit_hit().
--
-- Idempotent. Not yet applied to the live database; until it is, the app falls
-- back to its in-memory limiter.

BEGIN;

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  key text PRIMARY KEY,
  hits integer NOT NULL,
  reset_at timestamptz NOT NULL
);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role and definer functions touch this table.
REVOKE ALL ON public.api_rate_limits FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_reset_at ON public.api_rate_limits(reset_at);

-- Counts one hit against `p_key` in a fixed window and returns whether it is allowed.
CREATE OR REPLACE FUNCTION public.rate_limit_hit(p_key text, p_limit integer, p_window_ms integer)
RETURNS TABLE(allowed boolean, remaining integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hits integer;
BEGIN
  IF p_key IS NULL OR length(p_key) > 300 OR p_limit < 1 OR p_window_ms < 1 THEN
    RAISE EXCEPTION 'invalid rate limit arguments';
  END IF;

  INSERT INTO public.api_rate_limits AS r (key, hits, reset_at)
  VALUES (p_key, 1, now() + make_interval(secs => p_window_ms / 1000.0))
  ON CONFLICT (key) DO UPDATE
    SET hits = CASE WHEN r.reset_at <= now() THEN 1 ELSE r.hits + 1 END,
        reset_at = CASE WHEN r.reset_at <= now() THEN EXCLUDED.reset_at ELSE r.reset_at END
  RETURNING r.hits INTO v_hits;

  -- Opportunistic cleanup of long-expired windows.
  IF random() < 0.01 THEN
    DELETE FROM public.api_rate_limits WHERE reset_at < now() - interval '1 hour';
  END IF;

  RETURN QUERY SELECT v_hits <= p_limit, greatest(p_limit - v_hits, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.rate_limit_hit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(text, integer, integer) TO service_role;

COMMIT;
