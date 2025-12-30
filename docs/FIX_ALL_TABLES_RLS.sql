-- Migration: Fix RLS policies for ALL main tables
-- Run this in Supabase SQL Editor

-- ================================================
-- PAPAS TABLE
-- ================================================
DROP POLICY IF EXISTS "papas_insert_policy" ON papas;
DROP POLICY IF EXISTS "papas_select_policy" ON papas;
DROP POLICY IF EXISTS "papas_update_policy" ON papas;
DROP POLICY IF EXISTS "papas_delete_policy" ON papas;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON papas;
DROP POLICY IF EXISTS "Enable read for authenticated users" ON papas;

ALTER TABLE papas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "papas_select_all"
ON papas FOR SELECT TO authenticated USING (true);

CREATE POLICY "papas_insert_authenticated"
ON papas FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "papas_update_authenticated"
ON papas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "papas_delete_authenticated"
ON papas FOR DELETE TO authenticated USING (true);

-- ================================================
-- CHEETAHS TABLE
-- ================================================
DROP POLICY IF EXISTS "cheetahs_insert_policy" ON cheetahs;
DROP POLICY IF EXISTS "cheetahs_select_policy" ON cheetahs;
DROP POLICY IF EXISTS "cheetahs_update_policy" ON cheetahs;
DROP POLICY IF EXISTS "cheetahs_delete_policy" ON cheetahs;

ALTER TABLE cheetahs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cheetahs_select_all"
ON cheetahs FOR SELECT TO authenticated USING (true);

CREATE POLICY "cheetahs_insert_authenticated"
ON cheetahs FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "cheetahs_update_authenticated"
ON cheetahs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "cheetahs_delete_authenticated"
ON cheetahs FOR DELETE TO authenticated USING (true);

-- ================================================
-- PROGRAMS TABLE
-- ================================================
DROP POLICY IF EXISTS "programs_insert_policy" ON programs;
DROP POLICY IF EXISTS "programs_select_policy" ON programs;
DROP POLICY IF EXISTS "programs_update_policy" ON programs;
DROP POLICY IF EXISTS "programs_delete_policy" ON programs;

ALTER TABLE programs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "programs_select_all"
ON programs FOR SELECT TO authenticated USING (true);

CREATE POLICY "programs_insert_authenticated"
ON programs FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "programs_update_authenticated"
ON programs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "programs_delete_authenticated"
ON programs FOR DELETE TO authenticated USING (true);

-- ================================================
-- NESTS TABLE
-- ================================================
DROP POLICY IF EXISTS "nests_insert_policy" ON nests;
DROP POLICY IF EXISTS "nests_select_policy" ON nests;
DROP POLICY IF EXISTS "nests_update_policy" ON nests;
DROP POLICY IF EXISTS "nests_delete_policy" ON nests;

ALTER TABLE nests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nests_select_all"
ON nests FOR SELECT TO authenticated USING (true);

CREATE POLICY "nests_insert_authenticated"
ON nests FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "nests_update_authenticated"
ON nests FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "nests_delete_authenticated"
ON nests FOR DELETE TO authenticated USING (true);

-- ================================================
-- THEATRES TABLE
-- ================================================
DROP POLICY IF EXISTS "theatres_insert_policy" ON theatres;
DROP POLICY IF EXISTS "theatres_select_policy" ON theatres;
DROP POLICY IF EXISTS "theatres_update_policy" ON theatres;
DROP POLICY IF EXISTS "theatres_delete_policy" ON theatres;

ALTER TABLE theatres ENABLE ROW LEVEL SECURITY;

CREATE POLICY "theatres_select_all"
ON theatres FOR SELECT TO authenticated USING (true);

CREATE POLICY "theatres_insert_authenticated"
ON theatres FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "theatres_update_authenticated"
ON theatres FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "theatres_delete_authenticated"
ON theatres FOR DELETE TO authenticated USING (true);

-- Verify all policies
SELECT tablename, policyname, cmd 
FROM pg_policies 
WHERE tablename IN ('papas', 'cheetahs', 'programs', 'nests', 'theatres')
ORDER BY tablename, cmd;
