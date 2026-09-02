-- Run recurring operational jobs inside Supabase instead of Vercel Cron.
-- This avoids Vercel Hobby's once-per-day scheduling restriction and keeps
-- database-only work close to the data with no public HTTP dependency.

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'tcnp-dispatch-announcements',
  '*/5 * * * *',
  $$SELECT public.dispatch_due_announcements();$$
);

SELECT cron.schedule(
  'tcnp-welfare-birthdays',
  '0 6 * * *',
  $$SELECT public.enqueue_daily_birthday_reminders();$$
);
