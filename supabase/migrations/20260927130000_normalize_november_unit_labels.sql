-- Hospitality is a responsibility within November (Nest), not a standalone
-- Oscar. Normalize user-facing unit names while retaining historic enum values
-- for safe compatibility with older clients and imported records.
UPDATE public.units
SET name = 'November (Nest)',
    description = 'Accommodation, room readiness, guest reception, and hospitality operations',
    updated_at = now()
WHERE slug = 'november_nest';

UPDATE public.users
SET oscar = CASE
  WHEN lower(coalesce(oscar, '')) LIKE '%hospitality%' THEN
    CASE WHEN lower(oscar) LIKE '%head%' THEN 'Head, November (Nest)' ELSE 'November (Nest)' END
  WHEN (lower(coalesce(oscar, '')) LIKE '%november%' OR lower(coalesce(oscar, '')) LIKE '%noscar%')
    AND (lower(oscar) LIKE '%theatre%' OR lower(oscar) LIKE '%theater%') THEN
    CASE WHEN lower(oscar) LIKE '%head%' THEN 'Head, November (Den)' ELSE 'November (Den)' END
  WHEN lower(coalesce(oscar, '')) LIKE '%november%den%'
    OR lower(coalesce(oscar, '')) LIKE '%noscar%den%' THEN
    CASE WHEN lower(oscar) LIKE '%head%' THEN 'Head, November (Den)' ELSE 'November (Den)' END
  WHEN lower(coalesce(oscar, '')) LIKE '%november%nest%'
    OR lower(coalesce(oscar, '')) LIKE '%noscar%nest%' THEN
    CASE WHEN lower(oscar) LIKE '%head%' THEN 'Head, November (Nest)' ELSE 'November (Nest)' END
  ELSE oscar
END,
updated_at = now()
WHERE lower(coalesce(oscar, '')) LIKE '%hospitality%'
   OR ((lower(coalesce(oscar, '')) LIKE '%november%' OR lower(coalesce(oscar, '')) LIKE '%noscar%')
       AND (lower(oscar) LIKE '%theatre%' OR lower(oscar) LIKE '%theater%'))
   OR lower(coalesce(oscar, '')) LIKE '%november%den%'
   OR lower(coalesce(oscar, '')) LIKE '%noscar%den%'
   OR lower(coalesce(oscar, '')) LIKE '%november%nest%'
   OR lower(coalesce(oscar, '')) LIKE '%noscar%nest%';
