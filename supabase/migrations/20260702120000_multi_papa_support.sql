CREATE TABLE IF NOT EXISTS public.journey_papas (
    journey_id uuid REFERENCES public.journeys(id) ON DELETE CASCADE,
    papa_id uuid REFERENCES public.papas(id) ON DELETE CASCADE,
    is_primary boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    PRIMARY KEY (journey_id, papa_id)
);

-- Backfill data from journeys.papa_id
INSERT INTO public.journey_papas (journey_id, papa_id, is_primary)
SELECT id, papa_id, true
FROM public.journeys
WHERE papa_id IS NOT NULL;

-- Configure RLS for the new junction table
ALTER TABLE public.journey_papas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can view journey_papas" 
    ON public.journey_papas FOR SELECT 
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authorized users can manage journey_papas" 
    ON public.journey_papas FOR ALL 
    USING (EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
        AND users.role IN ('super_admin', 'admin', 'captain', 'head_of_command', 'delta_oscar', 'tango_oscar')
        AND users.is_active = true
    ));
