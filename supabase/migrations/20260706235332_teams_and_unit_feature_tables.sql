-- ─── Officer teams ───────────────────────────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS team text CHECK (team IN ('strength','wisdom','swift')),
  ADD COLUMN IF NOT EXISTS is_team_head boolean NOT NULL DEFAULT false;

-- Team chat channel tag (null = existing global/program chat behaviour)
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS team text CHECK (team IN ('strength','wisdom','swift')),
  ADD COLUMN IF NOT EXISTS flagged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flagged_by uuid REFERENCES public.users(id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_team ON public.chat_messages(team) WHERE team IS NOT NULL;

-- vice_captain gains admin-level privileges platform-wide
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role IN (
      'super_admin','dev_admin','admin','captain','vice_captain',
      'head_of_operations','head_of_command','command'
    )
    AND is_active = true
  );
$$;

-- ─── Sierra: media assets ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL,
  papa_id uuid REFERENCES public.papas(id) ON DELETE SET NULL,
  uploaded_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title text,
  caption text,
  category text NOT NULL DEFAULT 'other' CHECK (category IN ('arrival','pickup','eagle_square','theatre','bts','other')),
  media_type text NOT NULL DEFAULT 'image' CHECK (media_type IN ('image','video')),
  storage_path text NOT NULL,
  status text NOT NULL DEFAULT 'raw' CHECK (status IN ('raw','editing','edited','posted')),
  instagram_url text,
  taken_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_media_assets_program ON public.media_assets(program_id);
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY media_assets_select ON public.media_assets FOR SELECT USING (
  has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_sierra_oscar','sierra_oscar']::text[])
);
CREATE POLICY media_assets_write ON public.media_assets FOR INSERT WITH CHECK (
  has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_sierra_oscar','sierra_oscar']::text[])
);
CREATE POLICY media_assets_update ON public.media_assets FOR UPDATE USING (
  has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_sierra_oscar','sierra_oscar']::text[])
);
CREATE POLICY media_assets_delete ON public.media_assets FOR DELETE USING (
  has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_sierra_oscar']::text[])
);

-- ─── Lounge / Welfare: program menus ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.program_menus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid REFERENCES public.programs(id) ON DELETE CASCADE,
  menu_date date NOT NULL DEFAULT CURRENT_DATE,
  meal_type text NOT NULL DEFAULT 'lunch' CHECK (meal_type IN ('breakfast','lunch','dinner','snacks','all_day')),
  title text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  is_menu_of_day boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_program_menus_program_date ON public.program_menus(program_id, menu_date);
ALTER TABLE public.program_menus ENABLE ROW LEVEL SECURITY;
-- Menus are visible to every authenticated officer (menu of the day is broadcast content)
CREATE POLICY program_menus_select ON public.program_menus FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY program_menus_insert ON public.program_menus FOR INSERT WITH CHECK (
  has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_noscar_den','noscar_den','head_noscar_nest','november_oscar','welfare_oscar','head_welfare_oscar']::text[])
);
CREATE POLICY program_menus_update ON public.program_menus FOR UPDATE USING (
  has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_noscar_den','noscar_den','head_noscar_nest','november_oscar','welfare_oscar','head_welfare_oscar']::text[])
);
CREATE POLICY program_menus_delete ON public.program_menus FOR DELETE USING (
  has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_noscar_den','head_noscar_nest','head_welfare_oscar']::text[])
);

-- ─── Nest: papa accommodations ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.papa_accommodations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid REFERENCES public.programs(id) ON DELETE CASCADE,
  papa_id uuid NOT NULL REFERENCES public.papas(id) ON DELETE CASCADE,
  nest_id uuid REFERENCES public.nests(id) ON DELETE SET NULL,
  hotel_name text NOT NULL,
  location text,
  room_info text,
  check_in date,
  check_out date,
  distance_km numeric,
  travel_duration_mins integer,
  notes text,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_papa_accommodations_program ON public.papa_accommodations(program_id);
ALTER TABLE public.papa_accommodations ENABLE ROW LEVEL SECURITY;
-- Managers see all; a DO sees only accommodations of papas on journeys they are assigned to
CREATE POLICY papa_accommodations_select ON public.papa_accommodations FOR SELECT USING (
  has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_noscar_nest','noscar_nest','head_noscar_den','noscar_den','november_oscar']::text[])
  OR EXISTS (
    SELECT 1 FROM public.journeys j
    LEFT JOIN public.journey_papas jp ON jp.journey_id = j.id
    LEFT JOIN public.journey_duty_officers jdo ON jdo.journey_id = j.id
    WHERE (j.papa_id = papa_accommodations.papa_id OR jp.papa_id = papa_accommodations.papa_id)
      AND (j.assigned_do_id = auth.uid() OR j.assigned_duty_officer_id = auth.uid() OR jdo.user_id = auth.uid())
  )
);
CREATE POLICY papa_accommodations_write ON public.papa_accommodations FOR INSERT WITH CHECK (
  has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_noscar_nest','noscar_nest','november_oscar']::text[])
);
CREATE POLICY papa_accommodations_update ON public.papa_accommodations FOR UPDATE USING (
  has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_noscar_nest','noscar_nest','november_oscar']::text[])
);
CREATE POLICY papa_accommodations_delete ON public.papa_accommodations FOR DELETE USING (
  has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_noscar_nest']::text[])
);

-- ─── Compliance: grooming + outfits ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.compliance_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_type text NOT NULL DEFAULT 'grooming' CHECK (post_type IN ('grooming','outfit_of_day','general_outfit')),
  title text NOT NULL,
  body text,
  image_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL,
  event_date date,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.compliance_posts ENABLE ROW LEVEL SECURITY;
-- Outfit/grooming guidance is meant to be seen by every officer
CREATE POLICY compliance_posts_select ON public.compliance_posts FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY compliance_posts_write ON public.compliance_posts FOR INSERT WITH CHECK (
  has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_compliance_oscar','compliance_oscar']::text[])
);
CREATE POLICY compliance_posts_update ON public.compliance_posts FOR UPDATE USING (
  has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_compliance_oscar','compliance_oscar']::text[])
);
CREATE POLICY compliance_posts_delete ON public.compliance_posts FOR DELETE USING (
  has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_compliance_oscar']::text[])
);

-- ─── Victor: seat arrangements ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.seat_arrangements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  theatre_id uuid REFERENCES public.theatres(id) ON DELETE SET NULL,
  arrangement_date date NOT NULL DEFAULT CURRENT_DATE,
  session_name text NOT NULL,
  session_order integer NOT NULL DEFAULT 1,
  layout jsonb NOT NULL DEFAULT '{"rows": []}'::jsonb,
  notes text,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_seat_arrangements_program_date ON public.seat_arrangements(program_id, arrangement_date, session_order);
ALTER TABLE public.seat_arrangements ENABLE ROW LEVEL SECURITY;
CREATE POLICY seat_arrangements_select ON public.seat_arrangements FOR SELECT USING (
  has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_victor_oscar','victor_oscar','delta_oscar']::text[])
);
CREATE POLICY seat_arrangements_write ON public.seat_arrangements FOR INSERT WITH CHECK (
  has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_victor_oscar']::text[])
);
CREATE POLICY seat_arrangements_update ON public.seat_arrangements FOR UPDATE USING (
  has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_victor_oscar']::text[])
);
CREATE POLICY seat_arrangements_delete ON public.seat_arrangements FOR DELETE USING (
  has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_victor_oscar']::text[])
);

-- ─── Finance documents ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.finance_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL DEFAULT 'report' CHECK (category IN ('report','budget','receipt','invoice','statement','other')),
  period text,
  program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint,
  notes text,
  uploaded_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.finance_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_documents_select ON public.finance_documents FOR SELECT USING (
  has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations']::text[])
);
CREATE POLICY finance_documents_write ON public.finance_documents FOR INSERT WITH CHECK (
  has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations']::text[])
);
CREATE POLICY finance_documents_delete ON public.finance_documents FOR DELETE USING (
  has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations']::text[])
);

-- ─── Training schedules ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.training_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  description text,
  location text,
  session_date date NOT NULL,
  start_time time,
  end_time time,
  speakers jsonb NOT NULL DEFAULT '[]'::jsonb,
  resources jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.training_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY training_schedules_select ON public.training_schedules FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY training_schedules_write ON public.training_schedules FOR INSERT WITH CHECK (is_admin());
CREATE POLICY training_schedules_update ON public.training_schedules FOR UPDATE USING (is_admin());
CREATE POLICY training_schedules_delete ON public.training_schedules FOR DELETE USING (is_admin());

-- ─── Hospitality places ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hospitality_places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'sightseeing' CHECK (category IN ('restaurant','sightseeing','culture','shopping','nature','entertainment','relaxation','other')),
  description text,
  address text,
  city text DEFAULT 'Lagos',
  latitude numeric,
  longitude numeric,
  image_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  tips text,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hospitality_places ENABLE ROW LEVEL SECURITY;
CREATE POLICY hospitality_places_select ON public.hospitality_places FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY hospitality_places_write ON public.hospitality_places FOR INSERT WITH CHECK (
  has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_hospitality_oscar','hospitality_oscar']::text[])
);
CREATE POLICY hospitality_places_update ON public.hospitality_places FOR UPDATE USING (
  has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_hospitality_oscar','hospitality_oscar']::text[])
);
CREATE POLICY hospitality_places_delete ON public.hospitality_places FOR DELETE USING (
  has_any_role(ARRAY['super_admin','dev_admin','admin','captain','vice_captain','command','head_of_command','head_of_operations','head_hospitality_oscar']::text[])
);

-- ─── Mission availability requests ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mission_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text,
  deadline timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mission_requests_program ON public.mission_requests(program_id);
ALTER TABLE public.mission_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY mission_requests_select ON public.mission_requests FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY mission_requests_write ON public.mission_requests FOR INSERT WITH CHECK (is_admin());
CREATE POLICY mission_requests_update ON public.mission_requests FOR UPDATE USING (is_admin());
CREATE POLICY mission_requests_delete ON public.mission_requests FOR DELETE USING (is_admin());

CREATE TABLE IF NOT EXISTS public.mission_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.mission_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  response text NOT NULL CHECK (response IN ('yes','no')),
  note text,
  responded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, user_id)
);
ALTER TABLE public.mission_responses ENABLE ROW LEVEL SECURITY;
-- Officers see/manage their own response; admins see all
CREATE POLICY mission_responses_select ON public.mission_responses FOR SELECT USING (
  user_id = auth.uid() OR is_admin()
);
CREATE POLICY mission_responses_insert ON public.mission_responses FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY mission_responses_update ON public.mission_responses FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY mission_responses_delete ON public.mission_responses FOR DELETE USING (user_id = auth.uid() OR is_admin());;
