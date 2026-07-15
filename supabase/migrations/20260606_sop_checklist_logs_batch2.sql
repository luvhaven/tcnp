-- ================================================
-- TCNP SOP Checklist Log Tables Migration (Batch 2)
-- Run in Supabase SQL Editor
-- ================================================

-- Den Facility Checklist logs (Victor Oscar - 4× per day per theatre)
create table if not exists public.den_checklist_logs (
  id uuid default gen_random_uuid() primary key,
  theatre_id uuid references public.theatres(id) on delete cascade not null,
  session text not null,                            -- e.g. 'Pre-Program (Morning)'
  checks jsonb not null default '[]',               -- array of 11 booleans
  all_passed boolean not null default false,
  performed_by uuid references public.users(id),
  performed_by_name text,
  performed_at timestamptz not null default now()
);

create index if not exists idx_den_logs_theatre_id on public.den_checklist_logs(theatre_id);
create index if not exists idx_den_logs_performed_at on public.den_checklist_logs(performed_at desc);

alter table public.den_checklist_logs enable row level security;
create policy "Authenticated can read den logs" on public.den_checklist_logs for select to authenticated using (true);
create policy "Authenticated can insert den logs" on public.den_checklist_logs for insert to authenticated with check (true);

-- ------------------------------------------------

-- DO Post-Operation Feedback Forms (Delta Oscar - after each journey)
create table if not exists public.do_feedback_forms (
  id uuid default gen_random_uuid() primary key,
  journey_id uuid references public.journeys(id) on delete cascade not null,
  submitted_by uuid references public.users(id),
  submitted_by_name text,
  overall_rating integer check (overall_rating between 1 and 5),
  principal_wellbeing text not null,
  logistics_notes text,
  accommodation_notes text,
  incidents text,
  monetary_gifts text,
  improvements text,
  submitted_at timestamptz not null default now()
);

create index if not exists idx_do_feedback_journey_id on public.do_feedback_forms(journey_id);
create index if not exists idx_do_feedback_submitted_at on public.do_feedback_forms(submitted_at desc);

alter table public.do_feedback_forms enable row level security;
-- DOs submit their own; Admins can read all
create policy "DOs can insert feedback" on public.do_feedback_forms for insert to authenticated with check (true);
create policy "Authenticated can read feedback" on public.do_feedback_forms for select to authenticated using (true);
