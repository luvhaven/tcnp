-- ============================================================================
-- SETTINGS TABLE MIGRATION
-- ============================================================================
-- Creates the settings table for application configuration
-- ============================================================================

-- ============================================================================
-- 1. CREATE SETTINGS TABLE
-- ============================================================================

-- Drop table if exists to recreate cleanly
DROP TABLE IF EXISTS settings CASCADE;

CREATE TABLE settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  
  -- Organization Settings
  organization_name VARCHAR(255) DEFAULT 'TCNP Journey Management',
  organization_logo TEXT,
  organization_email VARCHAR(255),
  organization_phone VARCHAR(50),
  address TEXT,
  
  -- Notification Settings
  email_notifications BOOLEAN DEFAULT true,
  sms_notifications BOOLEAN DEFAULT false,
  push_notifications BOOLEAN DEFAULT true,
  notification_sound BOOLEAN DEFAULT true,
  
  -- Journey Settings
  default_journey_duration INTEGER DEFAULT 60, -- minutes
  auto_assign_vehicles BOOLEAN DEFAULT false,
  require_journey_approval BOOLEAN DEFAULT true,
  
  -- Security Settings
  session_timeout INTEGER DEFAULT 30, -- minutes
  require_2fa BOOLEAN DEFAULT false,
  password_expiry_days INTEGER DEFAULT 90,
  
  -- Display Settings
  theme VARCHAR(20) DEFAULT 'light', -- light, dark, auto
  language VARCHAR(10) DEFAULT 'en',
  timezone VARCHAR(50) DEFAULT 'Africa/Lagos',
  date_format VARCHAR(20) DEFAULT 'DD/MM/YYYY',
  time_format VARCHAR(10) DEFAULT '24h',
  
  -- Map Settings
  default_map_center_lat DECIMAL(10, 8) DEFAULT 9.0765, -- Abuja
  default_map_center_lng DECIMAL(11, 8) DEFAULT 7.3986,
  default_map_zoom INTEGER DEFAULT 12,
  map_provider VARCHAR(50) DEFAULT 'openstreetmap',
  
  -- Tracking Settings
  location_update_interval INTEGER DEFAULT 30, -- seconds
  enable_offline_mode BOOLEAN DEFAULT true,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. ADD FOREIGN KEY CONSTRAINT AND INDEXES
-- ============================================================================

-- Add foreign key constraint to users table
ALTER TABLE settings 
  ADD CONSTRAINT fk_settings_user_id 
  FOREIGN KEY (user_id) 
  REFERENCES users(id) 
  ON DELETE CASCADE;

-- Add unique constraint - one settings record per user
ALTER TABLE settings 
  ADD CONSTRAINT unique_settings_user_id 
  UNIQUE (user_id);

-- Create index for faster lookups
CREATE INDEX idx_settings_user_id ON settings(user_id);

-- ============================================================================
-- 3. CREATE RLS POLICIES
-- ============================================================================

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Users can view their own settings
CREATE POLICY "settings_select_policy" ON settings
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
    )
  );

-- Users can update their own settings
CREATE POLICY "settings_update_policy" ON settings
  FOR UPDATE USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
    )
  );

-- Users can insert their own settings
CREATE POLICY "settings_insert_policy" ON settings
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
    )
  );

-- Only admins can delete settings
CREATE POLICY "settings_delete_policy" ON settings
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
    )
  );

-- ============================================================================
-- 4. CREATE DEFAULT SETTINGS FOR EXISTING USERS
-- ============================================================================

-- Insert default settings for users who don't have any
INSERT INTO settings (user_id, organization_name)
SELECT id, 'TCNP Journey Management'
FROM users
WHERE id NOT IN (SELECT user_id FROM settings WHERE user_id IS NOT NULL)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 5. CREATE TRIGGER FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS settings_updated_at_trigger ON settings;
CREATE TRIGGER settings_updated_at_trigger
  BEFORE UPDATE ON settings
  FOR EACH ROW
  EXECUTE FUNCTION update_settings_updated_at();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'SETTINGS TABLE MIGRATION COMPLETE!';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Settings table created with:';
  RAISE NOTICE '  ✓ Organization settings';
  RAISE NOTICE '  ✓ Notification preferences';
  RAISE NOTICE '  ✓ Journey configuration';
  RAISE NOTICE '  ✓ Security settings';
  RAISE NOTICE '  ✓ Display preferences';
  RAISE NOTICE '  ✓ Map configuration';
  RAISE NOTICE '  ✓ Tracking settings';
  RAISE NOTICE '  ✓ RLS policies';
  RAISE NOTICE '  ✓ Default settings for existing users';
  RAISE NOTICE '============================================================================';
END $$;
