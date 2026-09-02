CREATE TABLE IF NOT EXISTS public.journey_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id UUID NOT NULL REFERENCES public.journeys(id) ON DELETE CASCADE,
  officer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'completed')),
  is_lead BOOLEAN NOT NULL DEFAULT false,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  notes TEXT,
  CONSTRAINT unique_journey_officer UNIQUE(journey_id, officer_id)
);

ALTER TABLE public.journey_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own assignments and admins can view all"
ON public.journey_assignments FOR SELECT
USING (
  officer_id = auth.uid() OR 
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND (role IN ('super_admin', 'admin', 'command', 'dev_admin', 'head_of_command', 'captain', 'vice_captain')
         OR email = 'doriazowan@gmail.com')
  )
);

CREATE POLICY "Admins can insert assignments"
ON public.journey_assignments FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND (role IN ('super_admin', 'admin', 'command', 'dev_admin', 'head_of_command', 'captain', 'vice_captain')
         OR email = 'doriazowan@gmail.com')
  )
);

CREATE POLICY "Users can update their own assignment status"
ON public.journey_assignments FOR UPDATE
USING (
  officer_id = auth.uid() OR 
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND (role IN ('super_admin', 'admin', 'command', 'dev_admin', 'head_of_command', 'captain', 'vice_captain')
         OR email = 'doriazowan@gmail.com')
  )
);

CREATE POLICY "Admins can delete assignments"
ON public.journey_assignments FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND (role IN ('super_admin', 'admin', 'command', 'dev_admin', 'head_of_command', 'captain', 'vice_captain')
         OR email = 'doriazowan@gmail.com')
  )
);;
