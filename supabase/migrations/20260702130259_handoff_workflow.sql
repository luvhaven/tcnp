-- Add status and acknowledgment tracking to journey_duty_officers for standard shift handoffs
ALTER TABLE public.journey_duty_officers 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;

-- Backfill existing records to automatically be acknowledged
UPDATE public.journey_duty_officers 
SET status = 'acknowledged', acknowledged_at = now() 
WHERE status = 'pending' OR status IS NULL;;
