-- Migration: Add ALL missing date/time columns to journeys table
-- Run this in Supabase SQL Editor

-- Add scheduled_departure column if it doesn't exist
ALTER TABLE journeys 
ADD COLUMN IF NOT EXISTS scheduled_departure TIMESTAMPTZ;

-- Add scheduled_arrival column if it doesn't exist
ALTER TABLE journeys 
ADD COLUMN IF NOT EXISTS scheduled_arrival TIMESTAMPTZ;

-- Add ETD (Estimated Time of Departure) column if it doesn't exist
ALTER TABLE journeys 
ADD COLUMN IF NOT EXISTS etd TIMESTAMPTZ;

-- Add ETA (Estimated Time of Arrival) column if it doesn't exist
ALTER TABLE journeys 
ADD COLUMN IF NOT EXISTS eta TIMESTAMPTZ;

-- Add comments for documentation
COMMENT ON COLUMN journeys.scheduled_departure IS 'Scheduled departure time for the journey';
COMMENT ON COLUMN journeys.scheduled_arrival IS 'Scheduled arrival time for the journey';
COMMENT ON COLUMN journeys.etd IS 'Estimated time of departure';
COMMENT ON COLUMN journeys.eta IS 'Estimated time of arrival';

-- Verify all columns were added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'journeys' 
AND column_name IN ('scheduled_departure', 'scheduled_arrival', 'etd', 'eta')
ORDER BY column_name;
