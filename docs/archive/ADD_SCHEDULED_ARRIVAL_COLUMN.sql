-- Migration: Add scheduled_arrival column to journeys table
-- Run this in Supabase SQL Editor

-- Add scheduled_arrival column if it doesn't exist
ALTER TABLE journeys 
ADD COLUMN IF NOT EXISTS scheduled_arrival TIMESTAMPTZ;

-- Add a comment for documentation
COMMENT ON COLUMN journeys.scheduled_arrival IS 'Scheduled arrival time for the journey';

-- Verify the column was added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'journeys' 
AND column_name = 'scheduled_arrival';
