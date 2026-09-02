
-- 1. Expand journey_status enum with all official call signs
ALTER TYPE journey_status ADD VALUE IF NOT EXISTS 'cocktail';
ALTER TYPE journey_status ADD VALUE IF NOT EXISTS 'blue_cocktail';
ALTER TYPE journey_status ADD VALUE IF NOT EXISTS 'red_cocktail';
ALTER TYPE journey_status ADD VALUE IF NOT EXISTS 're_order';
ALTER TYPE journey_status ADD VALUE IF NOT EXISTS 'first_course';
ALTER TYPE journey_status ADD VALUE IF NOT EXISTS 'chapman';
ALTER TYPE journey_status ADD VALUE IF NOT EXISTS 'dessert';
ALTER TYPE journey_status ADD VALUE IF NOT EXISTS 'broken_arrow';

-- 2. Create journey_duty_officers junction table
CREATE TABLE IF NOT EXISTS journey_duty_officers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id uuid NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_lead    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(journey_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_jdo_user_id    ON journey_duty_officers(user_id);
CREATE INDEX IF NOT EXISTS idx_jdo_journey_id ON journey_duty_officers(journey_id);

-- Enable full row data for realtime DELETE events
ALTER TABLE journey_duty_officers REPLICA IDENTITY FULL;

-- 3. Enable RLS
ALTER TABLE journey_duty_officers ENABLE ROW LEVEL SECURITY;

-- Officers can read their own assignments, admins can read/write all
CREATE POLICY "DOs can read own assignments"
  ON journey_duty_officers FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role IN ('super_admin','dev_admin','admin','captain','head_of_command','head_of_operations','command')
    )
  );

CREATE POLICY "Admins can insert DO assignments"
  ON journey_duty_officers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role IN ('super_admin','dev_admin','admin','captain','head_of_command','head_of_operations','command')
    )
  );

CREATE POLICY "Admins can delete DO assignments"
  ON journey_duty_officers FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role IN ('super_admin','dev_admin','admin','captain','head_of_command','head_of_operations','command')
    )
  );

-- 4. Notification trigger — fires when a DO is assigned to a journey
CREATE OR REPLACE FUNCTION notify_do_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  j_record  RECORD;
  papa_name text;
  msg_body  text;
BEGIN
  SELECT j.origin, j.destination, j.scheduled_departure, j.papa_id
  INTO j_record
  FROM journeys j
  WHERE j.id = NEW.journey_id;

  IF j_record.papa_id IS NOT NULL THEN
    SELECT COALESCE(full_name, 'Unknown') INTO papa_name
    FROM papas WHERE id = j_record.papa_id;
  ELSE
    papa_name := 'Unknown Papa';
  END IF;

  msg_body := format(
    'You have been assigned as Duty Officer for %s: %s → %s',
    papa_name, j_record.origin, j_record.destination
  );

  INSERT INTO notifications (
    user_id, title, message, type, journey_id, metadata, is_read
  )
  VALUES (
    NEW.user_id,
    CASE WHEN NEW.is_lead THEN 'New Assignment — Team Lead' ELSE 'New Journey Assignment' END,
    msg_body,
    'assignment',
    NEW.journey_id,
    jsonb_build_object(
      'papa_name',           papa_name,
      'origin',              j_record.origin,
      'destination',         j_record.destination,
      'scheduled_departure', j_record.scheduled_departure,
      'is_lead',             NEW.is_lead
    ),
    false
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_do_assignment ON journey_duty_officers;
CREATE TRIGGER trg_notify_do_assignment
  AFTER INSERT ON journey_duty_officers
  FOR EACH ROW EXECUTE FUNCTION notify_do_assignment();
;
