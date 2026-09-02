-- Access and privacy hardening for the unit-operations release.

-- Stop authenticated users from escalating their own operational authority by
-- writing privileged users columns directly through PostgREST. Profile fields
-- remain self-service; unit membership is managed through unit_memberships.
CREATE OR REPLACE FUNCTION public.guard_user_self_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = OLD.id THEN
    IF NEW.role IS DISTINCT FROM OLD.role
      OR NEW.oscar IS DISTINCT FROM OLD.oscar
      OR NEW.unit IS DISTINCT FROM OLD.unit
      OR NEW.team IS DISTINCT FROM OLD.team
      OR NEW.activation_status IS DISTINCT FROM OLD.activation_status
      OR NEW.is_active IS DISTINCT FROM OLD.is_active
      OR NEW.current_title_id IS DISTINCT FROM OLD.current_title_id
      OR (coalesce(NEW.is_team_head, false) = true AND coalesce(OLD.is_team_head, false) = false)
    THEN
      RAISE EXCEPTION 'Privileged account fields must be changed by an authorized administrator or Head of Unit';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_guard_self_privileged_columns ON public.users;
CREATE TRIGGER users_guard_self_privileged_columns
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.guard_user_self_privileged_columns();

-- Welfare explicitly no longer uses or exposes emergency contacts. Scrub the
-- retired values and keep them null so even legacy `users(*)` reads cannot
-- disclose them during the transition. The physical columns remain only for
-- compatibility with older generated clients.
UPDATE public.users
SET emergency_contact_name = NULL,
    emergency_contact_phone = NULL
WHERE emergency_contact_name IS NOT NULL OR emergency_contact_phone IS NOT NULL;

CREATE OR REPLACE FUNCTION public.clear_retired_emergency_contacts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.emergency_contact_name := NULL;
  NEW.emergency_contact_phone := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_clear_retired_emergency_contacts ON public.users;
CREATE TRIGGER users_clear_retired_emergency_contacts
BEFORE INSERT OR UPDATE OF emergency_contact_name, emergency_contact_phone ON public.users
FOR EACH ROW EXECUTE FUNCTION public.clear_retired_emergency_contacts();

-- The safe Welfare directory returns operational contact and birthday data
-- (month/day; never birth year).
CREATE OR REPLACE FUNCTION public.get_welfare_directory_safe()
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  phone text,
  photo_url text,
  oscar text,
  role text,
  team text,
  birth_month integer,
  birth_day integer,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id,
    u.full_name,
    u.email,
    u.phone,
    u.photo_url,
    u.oscar,
    u.role::text,
    u.team,
    extract(month FROM u.date_of_birth)::integer,
    extract(day FROM u.date_of_birth)::integer,
    coalesce(u.is_active, true)
  FROM public.users u
  WHERE public.can_manage_unit('welfare')
  ORDER BY u.full_name NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_welfare_directory_safe() TO authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.get_welfare_directory()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.get_welfare_directory() FROM authenticated';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.get_welfare_directory() FROM public';
  END IF;
END $$;

-- Replace every legacy read/update/delete policy; permissive RLS policies are
-- OR-combined, so leaving one behind would defeat the owner boundary.
DO $$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND cmd IN ('SELECT', 'UPDATE', 'DELETE', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.notifications', policy_record.policyname);
  END LOOP;
END $$;

-- Make notification dismissal reliable without broadening insert authority.
DROP POLICY IF EXISTS notifications_owner_delete ON public.notifications;
CREATE POLICY notifications_owner_delete ON public.notifications
FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_owner_select ON public.notifications;
CREATE POLICY notifications_owner_select ON public.notifications
FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_owner_update ON public.notifications;
CREATE POLICY notifications_owner_update ON public.notifications
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.guard_notification_owner_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = OLD.user_id AND NOT public.is_platform_admin() THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.title IS DISTINCT FROM OLD.title
      OR NEW.message IS DISTINCT FROM OLD.message
      OR NEW.type IS DISTINCT FROM OLD.type
      OR NEW.channel IS DISTINCT FROM OLD.channel
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.journey_id IS DISTINCT FROM OLD.journey_id
      OR NEW.metadata IS DISTINCT FROM OLD.metadata
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.sent_at IS DISTINCT FROM OLD.sent_at
      OR NEW.delivered_at IS DISTINCT FROM OLD.delivered_at
      OR (coalesce(OLD.is_read, false) = true AND coalesce(NEW.is_read, false) = false)
    THEN
      RAISE EXCEPTION 'Notification recipients may only mark a notification as read';
    END IF;
    IF coalesce(NEW.is_read, false) = true AND coalesce(OLD.is_read, false) = false THEN
      NEW.read_at := coalesce(NEW.read_at, now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_guard_owner_update ON public.notifications;
CREATE TRIGGER notifications_guard_owner_update
BEFORE UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.guard_notification_owner_update();

-- Idempotent 07:00 Africa/Lagos birthday reminder job. The HTTP cron endpoint
-- invokes this service-role-only function; a unique delivery claim prevents
-- duplicate notifications if the scheduler retries.
CREATE OR REPLACE FUNCTION public.enqueue_daily_birthday_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count integer := 0;
BEGIN
  WITH welfare_heads AS (
    SELECT DISTINCT membership.user_id AS recipient_id
    FROM public.unit_memberships membership
    JOIN public.units unit_record ON unit_record.id = membership.unit_id
    JOIN public.users recipient ON recipient.id = membership.user_id
    WHERE unit_record.slug = 'welfare'
      AND membership.status = 'active'
      AND membership.access_level = 'head'
      AND coalesce(recipient.is_active, true) = true
      AND coalesce(recipient.activation_status, 'active') = 'active'
    UNION
    SELECT user_record.id
    FROM public.users user_record
    WHERE (
        lower(coalesce(user_record.role::text, '')) = 'head_welfare_oscar'
        OR lower(coalesce(user_record.oscar, '')) LIKE '%head%welfare%'
      )
      AND coalesce(user_record.is_active, true) = true
      AND coalesce(user_record.activation_status, 'active') = 'active'
  ), birthdays AS (
    SELECT user_record.id AS target_user_id, user_record.full_name
    FROM public.users user_record
    WHERE coalesce(user_record.is_active, true) = true
      AND coalesce(user_record.activation_status, 'active') = 'active'
      AND user_record.date_of_birth IS NOT NULL
      AND extract(month FROM user_record.date_of_birth) = extract(month FROM (now() AT TIME ZONE 'Africa/Lagos'))
      AND extract(day FROM user_record.date_of_birth) = extract(day FROM (now() AT TIME ZONE 'Africa/Lagos'))
  ), claimed AS (
    INSERT INTO public.welfare_reminder_deliveries (
      kind, recipient_id, target_user_id, delivery_date
    )
    SELECT
      'birthday_0700',
      welfare_heads.recipient_id,
      birthdays.target_user_id,
      (now() AT TIME ZONE 'Africa/Lagos')::date
    FROM welfare_heads
    CROSS JOIN birthdays
    ON CONFLICT (kind, recipient_id, target_user_id, delivery_date) DO NOTHING
    RETURNING id AS delivery_id, recipient_id, target_user_id
  ), delivered AS (
    INSERT INTO public.notifications (
      user_id, title, message, type, channel, status, is_read, metadata
    )
    SELECT
      claimed.recipient_id,
      'Birthday message reminder',
      'Please send a birthday message to ' || coalesce(birthdays.full_name, 'today''s celebrant') || ' today.',
      'birthday_reminder',
      'push',
      'pending',
      false,
      jsonb_build_object(
        'kind', 'birthday_0700',
        'target_user_id', claimed.target_user_id,
        'delivery_date', (now() AT TIME ZONE 'Africa/Lagos')::date
      )
    FROM claimed
    JOIN birthdays ON birthdays.target_user_id = claimed.target_user_id
    RETURNING id, user_id, metadata
  ), linked AS (
    UPDATE public.welfare_reminder_deliveries delivery
    SET notification_id = delivered.id
    FROM delivered
    WHERE delivery.recipient_id = delivered.user_id
      AND delivery.target_user_id::text = delivered.metadata ->> 'target_user_id'
      AND delivery.kind = 'birthday_0700'
      AND delivery.delivery_date = (delivered.metadata ->> 'delivery_date')::date
      AND delivery.notification_id IS NULL
    RETURNING delivery.id
  )
  SELECT count(*) INTO inserted_count FROM linked;

  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_daily_birthday_reminders() FROM public;
REVOKE ALL ON FUNCTION public.enqueue_daily_birthday_reminders() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_daily_birthday_reminders() TO service_role;

-- Announcement fan-out: one source announcement, idempotent delivery claims,
-- and the existing notification bell as the recipient experience.
CREATE TABLE IF NOT EXISTS public.announcement_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  delivered_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT announcement_deliveries_unique UNIQUE (announcement_id, user_id)
);

ALTER TABLE public.announcement_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS dispatch_completed_at timestamptz;
DROP POLICY IF EXISTS announcement_deliveries_owner_select ON public.announcement_deliveries;
CREATE POLICY announcement_deliveries_owner_select ON public.announcement_deliveries
FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_platform_admin());
GRANT SELECT ON public.announcement_deliveries TO authenticated;

CREATE OR REPLACE FUNCTION public.dispatch_announcement(target_announcement_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delivered_count integer := 0;
BEGIN
  WITH announcement_record AS (
    SELECT announcement.*
    FROM public.announcements announcement
    WHERE announcement.id = target_announcement_id
      AND announcement.publish_at <= now()
      AND (announcement.expires_at IS NULL OR announcement.expires_at > now())
  ), recipients AS (
    SELECT DISTINCT user_record.id AS user_id
    FROM public.users user_record
    CROSS JOIN announcement_record announcement
    WHERE coalesce(user_record.is_active, true) = true
      AND coalesce(user_record.activation_status, 'active') = 'active'
      AND (
        announcement.audience_type = 'all'
        OR (announcement.audience_type = 'unit' AND announcement.unit_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.unit_memberships membership
          WHERE membership.unit_id = announcement.unit_id
            AND membership.user_id = user_record.id
            AND membership.status = 'active'
        ))
        OR (announcement.audience_type = 'team' AND user_record.team = announcement.audience ->> 'team')
        OR (announcement.audience_type = 'program' AND EXISTS (
          SELECT 1 FROM public.current_title_assignments assignment
          WHERE assignment.user_id = user_record.id
            AND assignment.program_id::text = announcement.audience ->> 'program_id'
            AND assignment.is_active = true
        ))
        OR (announcement.audience_type = 'users' AND coalesce(announcement.audience -> 'user_ids', '[]'::jsonb) ? user_record.id::text)
      )
  ), claimed AS (
    INSERT INTO public.announcement_deliveries (announcement_id, user_id)
    SELECT target_announcement_id, recipients.user_id
    FROM recipients
    ON CONFLICT (announcement_id, user_id) DO NOTHING
    RETURNING user_id
  ), delivered AS (
    INSERT INTO public.notifications (
      user_id, title, message, type, channel, status, is_read, metadata
    )
    SELECT
      claimed.user_id,
      announcement.title,
      announcement.body,
      'announcement',
      'push',
      'pending',
      false,
      jsonb_build_object(
        'kind', 'announcement',
        'announcement_id', announcement.id,
        'category', announcement.category,
        'unit_id', announcement.unit_id
      )
    FROM claimed
    CROSS JOIN announcement_record announcement
    RETURNING id, user_id, metadata
  ), linked AS (
    UPDATE public.announcement_deliveries delivery
    SET notification_id = delivered.id
    FROM delivered
    WHERE delivery.announcement_id = target_announcement_id
      AND delivery.user_id = delivered.user_id
      AND delivery.notification_id IS NULL
    RETURNING delivery.id
  )
  SELECT count(*) INTO delivered_count FROM linked;

  UPDATE public.announcements
  SET dispatch_completed_at = now(), updated_at = now()
  WHERE id = target_announcement_id;

  RETURN delivered_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.dispatch_due_announcements()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  announcement_record record;
  total_count integer := 0;
BEGIN
  FOR announcement_record IN
    SELECT id
    FROM public.announcements
    WHERE publish_at <= now()
      AND (expires_at IS NULL OR expires_at > now())
      AND dispatch_completed_at IS NULL
  LOOP
    total_count := total_count + public.dispatch_announcement(announcement_record.id);
  END LOOP;
  RETURN total_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.dispatch_new_announcement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.publish_at <= now() THEN
    PERFORM public.dispatch_announcement(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS announcements_dispatch_after_insert ON public.announcements;
CREATE TRIGGER announcements_dispatch_after_insert
AFTER INSERT ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.dispatch_new_announcement();

DROP TRIGGER IF EXISTS announcements_dispatch_after_publish_update ON public.announcements;
CREATE TRIGGER announcements_dispatch_after_publish_update
AFTER UPDATE OF publish_at ON public.announcements
FOR EACH ROW
WHEN (NEW.publish_at <= now() AND OLD.publish_at IS DISTINCT FROM NEW.publish_at)
EXECUTE FUNCTION public.dispatch_new_announcement();

REVOKE ALL ON FUNCTION public.dispatch_announcement(uuid) FROM public;
REVOKE ALL ON FUNCTION public.dispatch_announcement(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.dispatch_due_announcements() FROM public;
REVOKE ALL ON FUNCTION public.dispatch_due_announcements() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_due_announcements() TO service_role;

-- Publishing a birthday/wedding post creates or updates the team-wide source
-- announcement. Scheduled celebrations are queued for 07:00 Africa/Lagos on
-- their event date; immediate publications fan out in the same transaction.
ALTER TABLE public.welfare_celebrations
  ADD COLUMN IF NOT EXISTS announcement_id uuid REFERENCES public.announcements(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.sync_welfare_celebration_announcement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  welfare_unit_id uuid;
  announcement_publish_at timestamptz;
  linked_announcement_id uuid;
BEGIN
  SELECT id INTO welfare_unit_id FROM public.units WHERE slug = 'welfare' LIMIT 1;

  -- The relationship is system-managed. Ignore a client-supplied id on insert
  -- and preserve the trusted old id on update.
  IF TG_OP = 'INSERT' THEN
    NEW.announcement_id := NULL;
    linked_announcement_id := NULL;
  ELSE
    linked_announcement_id := OLD.announcement_id;
    NEW.announcement_id := OLD.announcement_id;
  END IF;

  IF linked_announcement_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.announcements announcement
    WHERE announcement.id = linked_announcement_id
      AND announcement.unit_id = welfare_unit_id
      AND announcement.audience ->> 'celebration_id' = NEW.id::text
  ) THEN
    linked_announcement_id := NULL;
    NEW.announcement_id := NULL;
  END IF;

  IF NEW.status NOT IN ('scheduled', 'published') THEN
    IF linked_announcement_id IS NOT NULL THEN
      UPDATE public.announcements
      SET publish_at = least(publish_at, now()),
          expires_at = now(),
          dispatch_completed_at = now(),
          updated_at = now()
      WHERE id = linked_announcement_id
        AND unit_id = welfare_unit_id
        AND audience ->> 'celebration_id' = NEW.id::text;
    END IF;
    RETURN NEW;
  END IF;

  -- A previously retired post gets a fresh announcement/delivery identity so
  -- a newly scheduled milestone is not suppressed by old delivery claims.
  IF TG_OP = 'UPDATE'
    AND OLD.status NOT IN ('scheduled', 'published')
    AND linked_announcement_id IS NOT NULL
  THEN
    linked_announcement_id := NULL;
    NEW.announcement_id := NULL;
  END IF;

  announcement_publish_at := CASE
    WHEN NEW.status = 'published' THEN now()
    ELSE ((NEW.event_date::text || ' 07:00:00')::timestamp AT TIME ZONE 'Africa/Lagos')
  END;

  IF linked_announcement_id IS NULL THEN
    INSERT INTO public.announcements (
      unit_id, title, body, category, audience_type, audience, publish_at, created_by
    ) VALUES (
      welfare_unit_id,
      NEW.title,
      coalesce(NEW.message, NEW.title),
      NEW.celebration_type,
      'all',
      jsonb_build_object('celebration_id', NEW.id, 'celebration_type', NEW.celebration_type),
      announcement_publish_at,
      NEW.created_by
    )
    RETURNING id INTO NEW.announcement_id;
  ELSE
    UPDATE public.announcements
    SET title = NEW.title,
        body = coalesce(NEW.message, NEW.title),
        category = NEW.celebration_type,
        publish_at = announcement_publish_at,
        expires_at = NULL,
        dispatch_completed_at = CASE
          WHEN TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN NULL
          ELSE dispatch_completed_at
        END,
        updated_at = now()
    WHERE id = linked_announcement_id
      AND unit_id = welfare_unit_id
      AND audience ->> 'celebration_id' = NEW.id::text;
    NEW.announcement_id := linked_announcement_id;
  END IF;

  IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS welfare_celebrations_sync_announcement ON public.welfare_celebrations;
CREATE TRIGGER welfare_celebrations_sync_announcement
BEFORE INSERT OR UPDATE OF status, title, message, event_date, celebration_type, announcement_id
ON public.welfare_celebrations
FOR EACH ROW EXECUTE FUNCTION public.sync_welfare_celebration_announcement();

CREATE OR REPLACE FUNCTION public.retire_deleted_welfare_celebration_announcement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  welfare_unit_id uuid;
BEGIN
  SELECT id INTO welfare_unit_id FROM public.units WHERE slug = 'welfare' LIMIT 1;
  IF OLD.announcement_id IS NOT NULL THEN
    UPDATE public.announcements
    SET publish_at = least(publish_at, now()),
        expires_at = now(),
        dispatch_completed_at = now(),
        updated_at = now()
    WHERE id = OLD.announcement_id
      AND unit_id = welfare_unit_id
      AND audience ->> 'celebration_id' = OLD.id::text;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS welfare_celebrations_retire_announcement_on_delete ON public.welfare_celebrations;
CREATE TRIGGER welfare_celebrations_retire_announcement_on_delete
BEFORE DELETE ON public.welfare_celebrations
FOR EACH ROW EXECUTE FUNCTION public.retire_deleted_welfare_celebration_announcement();
