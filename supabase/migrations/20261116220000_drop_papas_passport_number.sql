-- Drop papas.passport_number (split out of 20261116173000_papa_private_details.sql).
--
-- APPLY ONLY AFTER the new front end (PapasClient / PapaFormTabs writing
-- passports to papa_private_details through lib/papa-privacy) is live on
-- Vercel. The front end before this release sends passport_number on every
-- Papa create and edit; once the column is gone PostgREST rejects those
-- writes (PGRST204) and nobody can add or edit a Papa.
--
-- Copies any passport written to papas since 20261116173000 into
-- papa_private_details (never overwriting one already there), then drops the
-- column. Depends on 20261116173000. Repeatable; no BEGIN/COMMIT.

DO $drop_passport$
BEGIN
  IF to_regclass('public.papa_private_details') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261116173000_papa_private_details.sql first';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'papas' AND column_name = 'passport_number'
  ) THEN
    EXECUTE $sql$
      INSERT INTO public.papa_private_details (papa_id, passport_number)
      SELECT p.id, btrim(p.passport_number)
      FROM public.papas p
      WHERE nullif(btrim(p.passport_number), '') IS NOT NULL
      ON CONFLICT (papa_id) DO UPDATE
        SET passport_number = EXCLUDED.passport_number
        WHERE public.papa_private_details.passport_number IS NULL
    $sql$;
    ALTER TABLE public.papas DROP COLUMN passport_number;
  END IF;
END
$drop_passport$;
