-- Create table for visual regression baselines
CREATE TABLE public.nocode_visual_baselines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_id UUID NOT NULL REFERENCES public.nocode_tests(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL,
  step_name TEXT NOT NULL,
  baseline_image TEXT NOT NULL,
  threshold NUMERIC DEFAULT 0.1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  UNIQUE(test_id, step_id)
);

-- Enable RLS
ALTER TABLE public.nocode_visual_baselines ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view baselines for their project tests"
ON public.nocode_visual_baselines
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.nocode_tests t
    JOIN public.project_members pm ON t.project_id = pm.project_id
    WHERE t.id = nocode_visual_baselines.test_id
    AND pm.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert baselines for their project tests"
ON public.nocode_visual_baselines
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.nocode_tests t
    JOIN public.project_members pm ON t.project_id = pm.project_id
    WHERE t.id = nocode_visual_baselines.test_id
    AND pm.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update baselines for their project tests"
ON public.nocode_visual_baselines
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.nocode_tests t
    JOIN public.project_members pm ON t.project_id = pm.project_id
    WHERE t.id = nocode_visual_baselines.test_id
    AND pm.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete baselines for their project tests"
ON public.nocode_visual_baselines
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.nocode_tests t
    JOIN public.project_members pm ON t.project_id = pm.project_id
    WHERE t.id = nocode_visual_baselines.test_id
    AND pm.user_id = auth.uid()
  )
);

-- Add trigger for timestamps
CREATE TRIGGER update_nocode_visual_baselines_updated_at
BEFORE UPDATE ON public.nocode_visual_baselines
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();