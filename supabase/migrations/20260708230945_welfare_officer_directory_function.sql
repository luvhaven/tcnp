-- Welfare's SOP responsibility includes officer welfare & wellbeing outreach,
-- which requires contact details, birthdays and emergency contacts for every
-- officer — NOT their full profile (address, gender, bio, etc. stay private).
-- Exposed only to the Head of Welfare (+ admins/command, who already see
-- everything via the base users table) through a SECURITY DEFINER function
-- so column exposure is minimized and centrally controlled in one place.
CREATE OR REPLACE FUNCTION public.get_welfare_directory()
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  phone text,
  photo_url text,
  oscar text,
  role user_role,
  team text,
  birth_month int,
  birth_day int,
  emergency_contact_name text,
  emergency_contact_phone text,
  is_active boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    u.id,
    u.full_name,
    u.email,
    u.phone,
    u.photo_url,
    u.oscar,
    u.role,
    u.team,
    EXTRACT(month FROM u.date_of_birth)::int AS birth_month,
    EXTRACT(day FROM u.date_of_birth)::int AS birth_day,
    u.emergency_contact_name,
    u.emergency_contact_phone,
    u.is_active
  FROM public.users u
  WHERE EXISTS (
    SELECT 1 FROM public.users me
    WHERE me.id = auth.uid()
      AND me.is_active = true
      AND (me.role = 'head_welfare_oscar' OR is_admin())
  )
  ORDER BY u.full_name NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_welfare_directory() TO authenticated;;
