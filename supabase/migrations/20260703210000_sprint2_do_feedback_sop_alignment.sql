-- ================================================
-- TCNP SOP TCNP.01.08 DO Feedback Alignment
-- Run in Supabase SQL Editor
-- ================================================

ALTER TABLE public.do_feedback_forms 
  ADD COLUMN IF NOT EXISTS what_went_well text,
  ADD COLUMN IF NOT EXISTS what_didnt_go_as_plan text,
  ADD COLUMN IF NOT EXISTS team_feedback text,
  ADD COLUMN IF NOT EXISTS finance_expenses text;
