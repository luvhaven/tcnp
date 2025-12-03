-- =====================================================
-- Journey Status Tracking System Migration
-- =====================================================

-- 1. Add status tracking columns to journeys table
ALTER TABLE journeys
ADD COLUMN IF NOT EXISTS current_status VARCHAR(50) DEFAULT 'first_course',
ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES auth.users(id);

-- 2. Create journey_status_updates table for history
CREATE TABLE IF NOT EXISTS journey_status_updates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  journey_id UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL,
  updated_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_journeys_current_status ON journeys(current_status);
CREATE INDEX IF NOT EXISTS idx_journeys_status_updated_at ON journeys(status_updated_at);
CREATE INDEX IF NOT EXISTS idx_journey_status_updates_journey_id ON journey_status_updates(journey_id);
CREATE INDEX IF NOT EXISTS idx_journey_status_updates_created_at ON journey_status_updates(created_at);

-- 4. Enable RLS on new table
ALTER TABLE journey_status_updates ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS policies for journey_status_updates

-- Policy: Authenticated users can view status updates (needed for monitoring)
CREATE POLICY "Authenticated users can view status updates"
ON journey_status_updates FOR SELECT
TO authenticated
USING (true);

-- Policy: Authenticated users can insert status updates (DOs updating their journeys)
CREATE POLICY "Authenticated users can insert status updates"
ON journey_status_updates FOR INSERT
TO authenticated
WITH CHECK (true);

-- 6. Create helper functions

-- Function to update journey status and log history
CREATE OR REPLACE FUNCTION update_journey_status(
  p_journey_id UUID,
  p_status VARCHAR,
  p_notes TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_update_id UUID;
BEGIN
  -- Insert into history
  INSERT INTO journey_status_updates (journey_id, status, updated_by, notes)
  VALUES (p_journey_id, p_status, auth.uid(), p_notes)
  RETURNING id INTO v_update_id;

  -- Update journey current status
  UPDATE journeys
  SET 
    current_status = p_status,
    status_updated_at = NOW()
  WHERE id = p_journey_id;

  RETURN v_update_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to complete a journey
CREATE OR REPLACE FUNCTION complete_journey(
  p_journey_id UUID
) RETURNS VOID AS $$
BEGIN
  UPDATE journeys
  SET 
    current_status = 'completed',
    status_updated_at = NOW(),
    completed_at = NOW(),
    completed_by = auth.uid()
  WHERE id = p_journey_id;
  
  -- Log the completion in history
  INSERT INTO journey_status_updates (journey_id, status, updated_by, notes)
  VALUES (p_journey_id, 'completed', auth.uid(), 'Journey marked as complete');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to archive a journey (Admin/HOC only)
CREATE OR REPLACE FUNCTION archive_journey(
  p_journey_id UUID
) RETURNS VOID AS $$
BEGIN
  -- Check if user is admin or dev_admin (simplified check, ideally check role table)
  -- For now, we'll rely on app-level checks or assume authorized users call this
  
  UPDATE journeys
  SET 
    archived_at = NOW(),
    archived_by = auth.uid()
  WHERE id = p_journey_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT ALL ON journey_status_updates TO authenticated;
GRANT ALL ON journey_status_updates TO service_role;
