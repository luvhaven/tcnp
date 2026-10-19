-- Training becomes a selectable Oscar at signup, like every other unit.
-- Adds its member/head roles and official titles so admins can assign them.

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'training_oscar';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'head_training_oscar';

INSERT INTO official_titles (code, name, unit, is_fixed, is_team_lead, max_positions, description)
VALUES
  ('TRAINING_OSCAR', 'Training Oscar', 'oscar', false, false, 20, 'Training Officer'),
  ('TRAINING_OSCAR_LEAD', 'Team Lead - Training', 'oscar', false, true, 1, 'Training Team Lead')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    unit = EXCLUDED.unit,
    is_team_lead = EXCLUDED.is_team_lead,
    description = EXCLUDED.description;
