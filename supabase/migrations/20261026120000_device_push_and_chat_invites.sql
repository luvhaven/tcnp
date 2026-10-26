-- Durable, private Web Push delivery. No existing notifications are resent.
BEGIN;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS vault;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

CREATE TABLE IF NOT EXISTS public.device_push_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 session_id uuid NOT NULL REFERENCES auth.sessions(id) ON DELETE CASCADE,
 endpoint text NOT NULL UNIQUE, p256dh text NOT NULL, auth_key text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS device_push_user ON public.device_push_subscriptions(user_id);
CREATE TABLE IF NOT EXISTS public.notification_push_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
 subscription_id uuid NOT NULL REFERENCES public.device_push_subscriptions(id) ON DELETE CASCADE,
 attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(), locked_until timestamptz,
 lease_id uuid, delivered_at timestamptz, failed_at timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(notification_id,subscription_id)
);
CREATE INDEX IF NOT EXISTS push_outbox_pending ON public.notification_push_outbox(available_at) WHERE delivered_at IS NULL AND failed_at IS NULL;
CREATE TABLE IF NOT EXISTS public.device_push_config (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), public_key text NOT NULL, subject text NOT NULL,
 private_secret_id uuid NOT NULL, dispatch_secret_id uuid NOT NULL, dispatch_url text NOT NULL
);
ALTER TABLE public.device_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_push_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_push_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.device_push_subscriptions,public.notification_push_outbox,public.device_push_config FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.device_push_subscriptions,public.notification_push_outbox,public.device_push_config TO service_role;

CREATE OR REPLACE FUNCTION public.get_device_push_config() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('publicKey',c.public_key,'subject',c.subject,'privateKey',p.decrypted_secret,'dispatchSecret',d.decrypted_secret)
 FROM public.device_push_config c JOIN vault.decrypted_secrets p ON p.id=c.private_secret_id JOIN vault.decrypted_secrets d ON d.id=c.dispatch_secret_id;
$$;
CREATE OR REPLACE FUNCTION public.kick_notification_push() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE config public.device_push_config%ROWTYPE; secret text; request_id bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.notification_push_outbox WHERE delivered_at IS NULL AND failed_at IS NULL AND available_at<=now() AND (locked_until IS NULL OR locked_until<now())) THEN RETURN 0; END IF;
 SELECT * INTO config FROM public.device_push_config LIMIT 1;
 IF NOT FOUND THEN RETURN 0; END IF;
 SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE id=config.dispatch_secret_id;
 SELECT net.http_post(url:=config.dispatch_url,body:='{}'::jsonb,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||secret),timeout_milliseconds:=55000) INTO request_id;
 RETURN request_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.configure_device_push(p_public_key text,p_private_key text,p_subject text,p_dispatch_secret text,p_dispatch_url text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE private_id uuid; dispatch_id uuid; existing public.device_push_config%ROWTYPE;
BEGIN
 IF p_public_key !~ '^[A-Za-z0-9_-]{87}$' OR p_private_key !~ '^[A-Za-z0-9_-]{43}$' OR length(p_dispatch_secret)<40
 OR p_subject !~ '^https://' OR p_dispatch_url<>'https://tcnp.vercel.app/api/notifications/dispatch' THEN RAISE EXCEPTION 'Invalid device push configuration'; END IF;
 SELECT * INTO existing FROM public.device_push_config LIMIT 1;
 IF FOUND THEN
  IF existing.public_key<>p_public_key THEN RAISE EXCEPTION 'Push keys are already configured; do not rotate registered device keys'; END IF;
  RETURN true;
 END IF;
 SELECT vault.create_secret(p_private_key,'tcnp_device_push_private','Web Push signing key') INTO private_id;
 SELECT vault.create_secret(p_dispatch_secret,'tcnp_device_push_dispatch','Push dispatcher authentication') INTO dispatch_id;
 INSERT INTO public.device_push_config VALUES(true,p_public_key,p_subject,private_id,dispatch_id,p_dispatch_url);
 PERFORM cron.schedule('tcnp-device-push-retry','* * * * *','SELECT public.kick_notification_push()');
 PERFORM public.kick_notification_push();
 RETURN true;
END;
$$;
CREATE OR REPLACE FUNCTION public.enqueue_device_push() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 INSERT INTO public.notification_push_outbox(notification_id,subscription_id)
 SELECT NEW.id,s.id FROM public.device_push_subscriptions s JOIN public.users u ON u.id=s.user_id
 WHERE s.user_id=NEW.user_id AND u.is_active=true AND u.activation_status='active' ON CONFLICT DO NOTHING;
 BEGIN PERFORM public.kick_notification_push(); EXCEPTION WHEN OTHERS THEN RAISE LOG 'Push dispatch deferred to retry job'; END;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notifications_enqueue_device_push ON public.notifications;
CREATE TRIGGER notifications_enqueue_device_push AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.enqueue_device_push();

CREATE OR REPLACE FUNCTION public.claim_notification_push(batch_size integer DEFAULT 25) RETURNS SETOF public.notification_push_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 UPDATE public.notification_push_outbox SET failed_at=now(),last_error='expired' WHERE delivered_at IS NULL AND failed_at IS NULL
 AND (created_at<now()-interval '24 hours' OR (attempts>=8 AND coalesce(locked_until,now()-interval '1 second')<now()));
 RETURN QUERY UPDATE public.notification_push_outbox o SET attempts=o.attempts+1,locked_until=now()+interval '120 seconds',lease_id=gen_random_uuid()
 WHERE o.id IN (SELECT q.id FROM public.notification_push_outbox q WHERE q.delivered_at IS NULL AND q.failed_at IS NULL AND q.attempts<8 AND q.available_at<=now()
 AND (q.locked_until IS NULL OR q.locked_until<now()) ORDER BY q.created_at LIMIT greatest(1,least(batch_size,30)) FOR UPDATE SKIP LOCKED) RETURNING o.*;
END;
$$;
CREATE OR REPLACE FUNCTION public.settle_notification_push(job_id uuid,delivery_lease uuid,delivered boolean,error_code text DEFAULT NULL,retry_seconds integer DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 UPDATE public.notification_push_outbox SET delivered_at=CASE WHEN delivered THEN now() ELSE NULL END,
 failed_at=CASE WHEN NOT delivered AND (retry_seconds IS NULL OR attempts>=8) THEN now() ELSE NULL END,
 available_at=now()+make_interval(secs=>greatest(15,least(coalesce(retry_seconds,60),3600))),
 locked_until=NULL,lease_id=NULL,last_error=left(error_code,80) WHERE id=job_id AND lease_id=delivery_lease AND delivered_at IS NULL AND failed_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.notify_chat_room_join() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE program_name text; papa_name text; room_url text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=NEW.user_id AND is_active=true AND activation_status='active') THEN RETURN NEW; END IF;
 SELECT name INTO program_name FROM public.programs p WHERE p.id=NEW.program_id AND lower(coalesce(p.status::text,'')) NOT IN ('archived','cancelled','deleted')
 AND coalesce((to_jsonb(p)->>'is_archived')::boolean,false)=false AND coalesce((to_jsonb(p)->>'is_deleted')::boolean,false)=false;
 IF NOT FOUND THEN RETURN NEW; END IF;
 room_url:='/chat?programId='||NEW.program_id;
 IF NEW.papa_id IS NOT NULL THEN
  SELECT full_name INTO papa_name FROM public.papas WHERE id=NEW.papa_id AND program_id=NEW.program_id AND coalesce(is_deleted,false)=false;
  IF NOT FOUND THEN RETURN NEW; END IF;
  room_url:=room_url||'&papaId='||NEW.papa_id;
 END IF;
 INSERT INTO public.notifications(id,user_id,title,message,type,channel,metadata)
 VALUES(md5('chat-room-join:'||NEW.id)::uuid,NEW.user_id,'Added to a chat room',
 'You can now join '||coalesce(papa_name||' — ','')||program_name||CASE WHEN papa_name IS NULL THEN ' Program chat.' ELSE ' Papa chat.' END,'chat','push',jsonb_build_object('kind','chat_room_join','url',room_url))
 ON CONFLICT(id) DO NOTHING;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS chat_room_notify_join ON public.chat_room_memberships;
CREATE TRIGGER chat_room_notify_join AFTER INSERT ON public.chat_room_memberships FOR EACH ROW EXECUTE FUNCTION public.notify_chat_room_join();
CREATE OR REPLACE FUNCTION public.notify_program_chat_join() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE program_name text;
BEGIN
 IF NEW.program_id IS NULL OR NEW.is_active IS DISTINCT FROM true THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN IF OLD.program_id IS NOT DISTINCT FROM NEW.program_id AND OLD.user_id=NEW.user_id AND OLD.is_active=true THEN RETURN NEW; END IF; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=NEW.user_id AND is_active=true AND activation_status='active') THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM public.current_title_assignments a WHERE a.user_id=NEW.user_id AND a.program_id=NEW.program_id AND a.id<>NEW.id)
 OR EXISTS(SELECT 1 FROM public.chat_room_memberships WHERE user_id=NEW.user_id AND program_id=NEW.program_id AND papa_id IS NULL) THEN RETURN NEW; END IF;
 SELECT name INTO program_name FROM public.programs p WHERE p.id=NEW.program_id AND lower(coalesce(p.status::text,'')) NOT IN ('archived','cancelled','deleted')
 AND coalesce((to_jsonb(p)->>'is_archived')::boolean,false)=false AND coalesce((to_jsonb(p)->>'is_deleted')::boolean,false)=false;
 IF NOT FOUND THEN RETURN NEW; END IF;
 INSERT INTO public.notifications(user_id,title,message,type,channel,metadata)
 VALUES(NEW.user_id,'Added to Program chat','Your program assignment gives you access to '||program_name||' Program chat.','chat','push',jsonb_build_object('kind','chat_room_join','url','/chat?programId='||NEW.program_id));
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS title_assignment_notify_chat ON public.title_assignments;
CREATE TRIGGER title_assignment_notify_chat AFTER INSERT OR UPDATE ON public.title_assignments FOR EACH ROW EXECUTE FUNCTION public.notify_program_chat_join();
CREATE OR REPLACE FUNCTION public.notify_team_chat_join() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.team IS NULL OR NEW.is_active IS DISTINCT FROM true OR NEW.activation_status<>'active' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN IF OLD.team IS NOT DISTINCT FROM NEW.team AND OLD.is_active=true AND OLD.activation_status='active' THEN RETURN NEW; END IF; END IF;
 INSERT INTO public.notifications(user_id,title,message,type,channel,metadata)
 VALUES(NEW.id,'Added to Team chat','Your team assignment gives you access to '||initcap(NEW.team::text)||' Team chat.','chat','push',jsonb_build_object('kind','chat_room_join','url','/chat?team='||NEW.team::text));
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS user_assignment_notify_team_chat ON public.users;
CREATE TRIGGER user_assignment_notify_team_chat AFTER INSERT OR UPDATE OF team,is_active,activation_status ON public.users FOR EACH ROW EXECUTE FUNCTION public.notify_team_chat_join();
REVOKE ALL ON FUNCTION public.get_device_push_config(),public.kick_notification_push(),public.configure_device_push(text,text,text,text,text),public.claim_notification_push(integer),public.settle_notification_push(uuid,uuid,boolean,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_device_push_config(),public.kick_notification_push(),public.configure_device_push(text,text,text,text,text),public.claim_notification_push(integer),public.settle_notification_push(uuid,uuid,boolean,text,integer) TO service_role;
REVOKE ALL ON FUNCTION public.enqueue_device_push(),public.notify_chat_room_join(),public.notify_program_chat_join(),public.notify_team_chat_join() FROM PUBLIC,anon,authenticated;
COMMENT ON FUNCTION public.configure_device_push(text,text,text,text,text) IS 'TCNP private device push, durable retries and room invitations v1';
NOTIFY pgrst,'reload schema';
COMMIT;
