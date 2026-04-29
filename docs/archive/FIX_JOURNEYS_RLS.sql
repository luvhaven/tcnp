-- Migration: Fix RLS policies for journeys table
-- Run this in Supabase SQL Editor

-- First, let's see existing policies
-- SELECT * FROM pg_policies WHERE tablename = 'journeys';

-- Drop existing restrictive policies and recreate with proper permissions
DROP POLICY IF EXISTS "journeys_insert_policy" ON journeys;
DROP POLICY IF EXISTS "journeys_select_policy" ON journeys;
DROP POLICY IF EXISTS "journeys_update_policy" ON journeys;
DROP POLICY IF EXISTS "journeys_delete_policy" ON journeys;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON journeys;
DROP POLICY IF EXISTS "Enable read for authenticated users" ON journeys;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON journeys;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON journeys;

-- Ensure RLS is enabled
ALTER TABLE journeys ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to SELECT all journeys
CREATE POLICY "journeys_select_all"
ON journeys FOR SELECT
TO authenticated
USING (true);

-- Allow authenticated users to INSERT journeys
CREATE POLICY "journeys_insert_authenticated"
ON journeys FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to UPDATE journeys
CREATE POLICY "journeys_update_authenticated"
ON journeys FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Allow authenticated users to DELETE journeys (admins only in practice via app logic)
CREATE POLICY "journeys_delete_authenticated"
ON journeys FOR DELETE
TO authenticated
USING (true);

-- Verify policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies 
WHERE tablename = 'journeys';
