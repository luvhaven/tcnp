-- ================================================
-- TCNP SOP Checklist Log Tables Migration
-- Run in Supabase SQL Editor
-- ================================================

-- FLOWER Checklist logs (Tango Oscar - per vehicle pre-op check)
create table if not exists public.cheetah_flower_logs (
  id uuid default gen_random_uuid() primary key,
  cheetah_id uuid references public.cheetahs(id) on delete cascade not null,
  checks jsonb not null default '{}',               -- { F: bool, L: bool, O: bool, W: bool, E: bool, R: bool }
  all_passed boolean not null default false,
  performed_by uuid references public.users(id),
  performed_by_name text,
  performed_at timestamptz not null default now()
);

-- Index for fast per-cheetah lookup
create index if not exists idx_flower_logs_cheetah_id on public.cheetah_flower_logs(cheetah_id);
create index if not exists idx_flower_logs_performed_at on public.cheetah_flower_logs(performed_at desc);

-- RLS: authenticated users can insert; authenticated users can read
alter table public.cheetah_flower_logs enable row level security;
create policy "Authenticated can read flower logs" on public.cheetah_flower_logs for select to authenticated using (true);
create policy "Authenticated can insert flower logs" on public.cheetah_flower_logs for insert to authenticated with check (true);

-- ------------------------------------------------

-- Nest Comfort Checklist logs (November Oscar - per nest cave check)
create table if not exists public.nest_comfort_logs (
  id uuid default gen_random_uuid() primary key,
  nest_id uuid references public.nests(id) on delete cascade not null,
  checks jsonb not null default '[]',               -- array of 17 booleans
  all_passed boolean not null default false,
  performed_by uuid references public.users(id),
  performed_by_name text,
  performed_at timestamptz not null default now()
);

create index if not exists idx_comfort_logs_nest_id on public.nest_comfort_logs(nest_id);
create index if not exists idx_comfort_logs_performed_at on public.nest_comfort_logs(performed_at desc);

alter table public.nest_comfort_logs enable row level security;
create policy "Authenticated can read comfort logs" on public.nest_comfort_logs for select to authenticated using (true);
create policy "Authenticated can insert comfort logs" on public.nest_comfort_logs for insert to authenticated with check (true);

-- ------------------------------------------------

-- EO Equipment Checklist logs (Echo Oscar - per program pre-op equipment check)
create table if not exists public.eo_checklist_logs (
  id uuid default gen_random_uuid() primary key,
  program_id uuid references public.programs(id) on delete set null,
  checks jsonb not null default '[]',               -- array of 9 booleans
  all_passed boolean not null default false,
  performed_by uuid references public.users(id),
  performed_by_name text,
  performed_at timestamptz not null default now()
);

create index if not exists idx_eo_logs_program_id on public.eo_checklist_logs(program_id);
create index if not exists idx_eo_logs_performed_at on public.eo_checklist_logs(performed_at desc);

alter table public.eo_checklist_logs enable row level security;
create policy "Authenticated can read EO logs" on public.eo_checklist_logs for select to authenticated using (true);
create policy "Authenticated can insert EO logs" on public.eo_checklist_logs for insert to authenticated with check (true);
