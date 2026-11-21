-- A Papa who arrives in his own transport has no return escort: the DO stays with
-- him at the Theatre and completes duty once he has left in his own transport.
-- Self-arrival is journey_type 'self_arrival' or an origin of 'Self-Driven'. The
-- row is read through to_jsonb so the functions do not depend on either column.
BEGIN;
ALTER TABLE public.journeys DROP CONSTRAINT IF EXISTS journeys_do_completion_reason_check;
ALTER TABLE public.journeys ADD CONSTRAINT journeys_do_completion_reason_check CHECK (do_completion_reason IN ('nest_settled','flight_departed','flight_landed','papa_departed'));

CREATE OR REPLACE FUNCTION public.guard_do_duty_completion()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE theatre_bound boolean; completing boolean; self_arrival boolean;
BEGIN
  IF public.is_trusted_backend() THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.papa_id IS NOT NULL AND (NEW.status::text='completed' OR NEW.do_return_destination IS NOT NULL OR NEW.do_completion_reason IS NOT NULL) THEN
      RAISE EXCEPTION 'Create an active Papa duty, then record its escort and final checkpoint' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.papa_id IS DISTINCT FROM NEW.papa_id AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only an administrator can change the Papa assigned to a duty' USING ERRCODE='42501';
  END IF;
  IF OLD.status::text='completed' AND NEW.status::text='completed' AND OLD.papa_id IS DISTINCT FROM NEW.papa_id THEN
    RAISE EXCEPTION 'Reopen the duty before changing its Papa' USING ERRCODE='23514';
  END IF;
  IF OLD.papa_id IS NOT NULL AND OLD.status::text='completed' AND NEW.status::text<>'completed' THEN
    IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Only an administrator can reopen a completed duty' USING ERRCODE='42501'; END IF;
    NEW.do_return_destination:=NULL; NEW.do_completion_reason:=NULL; NEW.completed_at:=NULL; NEW.completed_by:=NULL;
    RETURN NEW;
  END IF;
  completing := NEW.status::text='completed' AND (OLD.status::text<>'completed' OR OLD.papa_id IS DISTINCT FROM NEW.papa_id);
  IF NEW.papa_id IS NOT NULL AND NOT completing AND (NEW.completed_at IS DISTINCT FROM OLD.completed_at OR NEW.completed_by IS DISTINCT FROM OLD.completed_by) THEN
    RAISE EXCEPTION 'Completion attribution is recorded with the final checkpoint' USING ERRCODE='42501';
  END IF;
  IF NEW.do_return_destination IS DISTINCT FROM OLD.do_return_destination
    OR NEW.do_completion_reason IS DISTINCT FROM OLD.do_completion_reason OR (completing AND NEW.papa_id IS NOT NULL) THEN
    IF NOT public.can_confirm_do_duty(OLD.id) THEN RAISE EXCEPTION 'Only the assigned DO or an administrator can confirm this duty' USING ERRCODE='42501'; END IF;
    IF OLD.status::text IN ('completed','cancelled') THEN RAISE EXCEPTION 'This duty is already closed' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW.do_return_destination IS DISTINCT FROM OLD.do_return_destination AND NOT completing THEN
    IF OLD.status::text NOT IN ('chapman','dessert') AND OLD.do_return_destination IS NULL THEN
      RAISE EXCEPTION 'Record theatre arrival before starting the return escort' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NOT completing AND NEW.do_completion_reason IS DISTINCT FROM OLD.do_completion_reason THEN
    RAISE EXCEPTION 'A final checkpoint is recorded only when duty is completed' USING ERRCODE='23514';
  END IF;
  IF completing AND NEW.papa_id IS NOT NULL THEN
    IF NEW.do_completion_reason IS NULL THEN RAISE EXCEPTION 'Confirm Papa is settled at the Nest or the flight has taken off or landed' USING ERRCODE='23514'; END IF;
    theatre_bound := coalesce(OLD.destination,'') ~* '(theatre|theater|venue|church)' OR OLD.assigned_theatre_id IS NOT NULL;
    IF coalesce(OLD.destination,'') ~* '(nest|hotel|eagle|airport)' THEN theatre_bound:=false; END IF;
    self_arrival := coalesce((to_jsonb(OLD)->>'journey_type'='self_arrival' OR coalesce(to_jsonb(OLD)->>'origin','') ~* 'self[- ]?driven'), false);
    IF NEW.do_completion_reason='papa_departed' AND (NOT self_arrival OR OLD.do_return_destination IS NOT NULL) THEN RAISE EXCEPTION 'Only a self-arrival Papa can leave in his own transport' USING ERRCODE='23514'; END IF;
    IF self_arrival THEN theatre_bound:=false; END IF;
    IF theatre_bound AND OLD.do_return_destination IS NULL THEN RAISE EXCEPTION 'Duty continues at the theatre; record the return escort first' USING ERRCODE='23514'; END IF;
    IF OLD.do_return_destination IS NULL AND coalesce(OLD.destination,'') ~* '(nest|hotel)' AND NEW.do_completion_reason<>'nest_settled' THEN RAISE EXCEPTION 'Confirm Nest settlement' USING ERRCODE='23514'; END IF;
    IF OLD.do_return_destination IS NULL AND coalesce(OLD.destination,'') ~* '(eagle|airport)' AND NEW.do_completion_reason NOT IN ('flight_departed','flight_landed') THEN RAISE EXCEPTION 'Confirm flight departure or landing' USING ERRCODE='23514'; END IF;
    IF OLD.do_return_destination='nest' AND NEW.do_completion_reason<>'nest_settled' THEN RAISE EXCEPTION 'Confirm Papa is settled at the Nest' USING ERRCODE='23514'; END IF;
    IF OLD.do_return_destination='eagle_square' AND NEW.do_completion_reason NOT IN ('flight_departed','flight_landed') THEN RAISE EXCEPTION 'Confirm Papa flight departure or landing' USING ERRCODE='23514'; END IF;
    NEW.do_return_destination:=CASE WHEN NEW.do_completion_reason='nest_settled' THEN 'nest' WHEN NEW.do_completion_reason='papa_departed' THEN NULL ELSE 'eagle_square' END;
    NEW.completed_at:=now(); NEW.completed_by:=auth.uid(); NEW.status_updated_at:=now(); NEW.updated_at:=now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_do_journey(target_journey_id uuid, completion_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE journey public.journeys%ROWTYPE; theatre_bound boolean; self_arrival boolean;
BEGIN
  IF NOT public.can_confirm_do_duty(target_journey_id) THEN RAISE EXCEPTION 'Only the assigned DO or an administrator can complete this duty' USING ERRCODE='42501'; END IF;
  SELECT * INTO journey FROM public.journeys WHERE id=target_journey_id FOR UPDATE;
  IF NOT FOUND OR journey.status::text IN ('completed','cancelled') THEN RAISE EXCEPTION 'This duty is already closed or unavailable' USING ERRCODE='23514'; END IF;
  IF journey.papa_id IS NOT NULL THEN
    IF completion_reason IS NULL OR completion_reason NOT IN ('nest_settled','flight_departed','flight_landed','papa_departed') THEN RAISE EXCEPTION 'Choose a verified final checkpoint' USING ERRCODE='22023'; END IF;
    theatre_bound:=coalesce(journey.destination,'') ~* '(theatre|theater|venue|church)' OR journey.assigned_theatre_id IS NOT NULL;
    IF coalesce(journey.destination,'') ~* '(nest|hotel|eagle|airport)' THEN theatre_bound:=false; END IF;
    self_arrival := coalesce((to_jsonb(journey)->>'journey_type'='self_arrival' OR coalesce(to_jsonb(journey)->>'origin','') ~* 'self[- ]?driven'), false);
    IF completion_reason='papa_departed' AND (NOT self_arrival OR journey.do_return_destination IS NOT NULL) THEN RAISE EXCEPTION 'Only a self-arrival Papa can leave in his own transport' USING ERRCODE='23514'; END IF;
    IF self_arrival THEN theatre_bound:=false; END IF;
    IF theatre_bound AND journey.do_return_destination IS NULL THEN RAISE EXCEPTION 'Remain with Papa at the theatre and record the return escort first' USING ERRCODE='23514'; END IF;
    IF journey.do_return_destination='nest' AND completion_reason<>'nest_settled' THEN RAISE EXCEPTION 'Confirm Papa is settled at the Nest' USING ERRCODE='23514'; END IF;
    IF journey.do_return_destination='eagle_square' AND completion_reason NOT IN ('flight_departed','flight_landed') THEN RAISE EXCEPTION 'Confirm Papa flight departure or landing' USING ERRCODE='23514'; END IF;
  ELSE completion_reason:=NULL;
  END IF;
  UPDATE public.journeys SET status='completed',do_completion_reason=completion_reason,
    do_return_destination=CASE WHEN completion_reason='nest_settled' THEN 'nest' WHEN completion_reason IN ('flight_departed','flight_landed') THEN 'eagle_square' ELSE do_return_destination END,
    completed_at=now(),completed_by=auth.uid(),status_updated_at=now(),updated_at=now() WHERE id=target_journey_id RETURNING * INTO journey;
  RETURN to_jsonb(journey);
END;
$$;
NOTIFY pgrst,'reload schema';
COMMIT;
