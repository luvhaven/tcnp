-- ============================================================
-- Migration: Oscar Documents (SOPs & Code of Conduct)
-- ============================================================

CREATE TYPE public.document_type AS ENUM ('sop', 'code_of_conduct');

CREATE TABLE IF NOT EXISTS public.oscar_documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  oscar text NOT NULL,
  doc_type public.document_type NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.oscar_documents ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read the documents
CREATE POLICY "Allow authenticated read access" 
ON public.oscar_documents 
FOR SELECT 
TO authenticated 
USING (true);

-- Allow admins to insert/update/delete documents
CREATE POLICY "Admins can manage documents" 
ON public.oscar_documents 
FOR ALL 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE users.id = auth.uid() 
    AND role IN ('super_admin', 'dev_admin', 'admin', 'captain', 'head_of_command', 'head_of_operations', 'command')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE users.id = auth.uid() 
    AND role IN ('super_admin', 'dev_admin', 'admin', 'captain', 'head_of_command', 'head_of_operations', 'command')
  )
);

-- Note: In Supabase, the public.users table is usually a profile table tied to auth.users.
-- We reference auth.users for created_by to avoid circular logic during profile creation,
-- but the RLS checks the public.users table for the role.
