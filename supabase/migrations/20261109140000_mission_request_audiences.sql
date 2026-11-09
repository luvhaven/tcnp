-- A null audience marks requests sent before recipients were recorded.
ALTER TABLE public.mission_requests ADD COLUMN audience text
  CHECK (audience IN ('all', 'male', 'female', 'swift', 'strength', 'wisdom'));

CREATE TABLE public.mission_request_recipients (
  request_id uuid NOT NULL REFERENCES public.mission_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  PRIMARY KEY (request_id, user_id)
);
CREATE INDEX mission_request_recipients_user_idx ON public.mission_request_recipients(user_id);

ALTER TABLE public.mission_request_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mission_request_recipients FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.mission_request_recipients TO authenticated;
CREATE POLICY mission_request_recipients_select ON public.mission_request_recipients
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

ALTER POLICY mission_requests_select ON public.mission_requests TO authenticated USING (
  (SELECT public.is_active_member()) AND (
    audience IS NULL OR (SELECT public.is_admin()) OR EXISTS (
      SELECT 1 FROM public.mission_request_recipients AS recipient
      WHERE recipient.request_id = mission_requests.id
        AND recipient.user_id = (SELECT auth.uid())
    )
  )
);

CREATE FUNCTION public.can_respond_to_mission_request(target_request_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mission_requests AS request
    WHERE request.id = target_request_id AND (
      request.audience IS NULL OR EXISTS (
        SELECT 1 FROM public.mission_request_recipients AS recipient
        WHERE recipient.request_id = request.id AND recipient.user_id = (SELECT auth.uid())
      )
    )
  );
$$;
REVOKE ALL ON FUNCTION public.can_respond_to_mission_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_respond_to_mission_request(uuid) TO authenticated;

ALTER POLICY mission_responses_insert ON public.mission_responses WITH CHECK (
  user_id = (SELECT auth.uid()) AND public.can_respond_to_mission_request(request_id)
);

-- Responses can still be edited, but cannot be moved onto an unaddressed request.
ALTER POLICY mission_responses_update ON public.mission_responses WITH CHECK (
  user_id = (SELECT auth.uid()) AND public.can_respond_to_mission_request(request_id)
);

CREATE FUNCTION public.send_mission_availability_request(
  target_program_id uuid,
  request_title text,
  request_message text,
  request_deadline timestamptz,
  sender_id uuid,
  request_audience text,
  notification_message text
)
RETURNS TABLE (request_id uuid, recipients integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH eligible AS MATERIALIZED (
    SELECT id FROM public.users
    WHERE is_active = true AND activation_status = 'active' AND is_directory_hidden = false
      AND CASE request_audience
        WHEN 'all' THEN true
        WHEN 'male' THEN gender = 'male'
        WHEN 'female' THEN gender = 'female'
        WHEN 'swift' THEN team = 'swift'
        WHEN 'strength' THEN team = 'strength'
        WHEN 'wisdom' THEN team = 'wisdom'
        ELSE false
      END
  ), new_request AS (
    INSERT INTO public.mission_requests (program_id, title, message, deadline, created_by, audience)
    SELECT target_program_id, request_title, request_message, request_deadline, sender_id, request_audience
    WHERE EXISTS (SELECT 1 FROM eligible)
    RETURNING id
  ), addressed AS (
    INSERT INTO public.mission_request_recipients (request_id, user_id)
    SELECT new_request.id, eligible.id FROM new_request CROSS JOIN eligible
    RETURNING mission_request_recipients.request_id, user_id
  ), notified AS (
    INSERT INTO public.notifications (user_id, title, message, type, channel, metadata, is_read)
    SELECT addressed.user_id, '🎖️ ' || request_title, notification_message, 'alert', 'push',
      jsonb_build_object('kind', 'mission_request', 'request_id', addressed.request_id, 'program_id', target_program_id),
      false
    FROM addressed
    RETURNING id
  )
  SELECT (SELECT id FROM new_request), (SELECT count(*)::integer FROM notified);
$$;

REVOKE ALL ON FUNCTION public.send_mission_availability_request(uuid, text, text, timestamptz, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_mission_availability_request(uuid, text, text, timestamptz, uuid, text, text)
  TO service_role;
