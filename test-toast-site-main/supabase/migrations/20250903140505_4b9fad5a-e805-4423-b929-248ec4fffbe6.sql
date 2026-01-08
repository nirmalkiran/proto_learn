-- Create table for saved test plans
CREATE TABLE public.saved_test_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL,
  content text NOT NULL,
  testing_scope text[] DEFAULT '{}',
  project_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.saved_test_plans ENABLE ROW LEVEL SECURITY;

-- Create policies for saved test plans
CREATE POLICY "Users can view test plans from their projects or as project members"
ON public.saved_test_plans
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = saved_test_plans.project_id 
    AND projects.created_by = auth.uid()
  ) 
  OR is_project_member(project_id, auth.uid())
);

CREATE POLICY "Users can create test plans in their projects"
ON public.saved_test_plans
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = saved_test_plans.project_id 
    AND projects.created_by = auth.uid()
  )
  AND auth.uid() = user_id
);

CREATE POLICY "Users can update test plans in their projects"
ON public.saved_test_plans
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = saved_test_plans.project_id 
    AND projects.created_by = auth.uid()
  )
  AND auth.uid() = user_id
);

CREATE POLICY "Users can delete test plans in their projects"
ON public.saved_test_plans
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = saved_test_plans.project_id 
    AND projects.created_by = auth.uid()
  )
  AND auth.uid() = user_id
);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_saved_test_plans_updated_at
BEFORE UPDATE ON public.saved_test_plans
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();