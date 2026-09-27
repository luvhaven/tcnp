-- Hospitality is now a responsibility of November (Nest), not a standalone unit.
-- Preserve existing people and content while moving authority to Nest roles.

UPDATE public.users
SET role = CASE role::text
  WHEN 'head_hospitality_oscar' THEN 'head_noscar_nest'::user_role
  WHEN 'hospitality_oscar' THEN 'noscar_nest'::user_role
  ELSE role
END
WHERE role::text IN ('head_hospitality_oscar', 'hospitality_oscar');

UPDATE public.users
SET oscar = CASE
  WHEN lower(coalesce(oscar, '')) LIKE '%head%hospitality%' THEN 'Head November Oscar (Nest)'
  ELSE 'November Oscar (Nest)'
END
WHERE lower(coalesce(oscar, '')) LIKE '%hospitality%'
   OR lower(coalesce(oscar, '')) IN ('ho', 'hospitality_oscar');

DROP POLICY IF EXISTS hospitality_places_write ON public.hospitality_places;
DROP POLICY IF EXISTS hospitality_places_update ON public.hospitality_places;
DROP POLICY IF EXISTS hospitality_places_delete ON public.hospitality_places;

CREATE POLICY hospitality_places_write
ON public.hospitality_places FOR INSERT
WITH CHECK (public.can_manage_unit('november_nest'));

CREATE POLICY hospitality_places_update
ON public.hospitality_places FOR UPDATE
USING (public.can_manage_unit('november_nest'))
WITH CHECK (public.can_manage_unit('november_nest'));

CREATE POLICY hospitality_places_delete
ON public.hospitality_places FOR DELETE
USING (public.can_manage_unit('november_nest'));

DROP POLICY IF EXISTS hospitality_media_insert ON storage.objects;
DROP POLICY IF EXISTS hospitality_media_delete ON storage.objects;

CREATE POLICY hospitality_media_insert
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'hospitality-media' AND public.can_manage_unit('november_nest'));

CREATE POLICY hospitality_media_delete
ON storage.objects FOR DELETE
USING (bucket_id = 'hospitality-media' AND public.can_manage_unit('november_nest'));
