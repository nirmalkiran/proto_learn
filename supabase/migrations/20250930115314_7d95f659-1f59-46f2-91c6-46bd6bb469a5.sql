-- Create AutomationResult table
CREATE TABLE public.automation_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id TEXT NOT NULL,
  json_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_id UUID NOT NULL,
  project_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX idx_automation_results_run_id ON public.automation_results(run_id);
CREATE INDEX idx_automation_results_project_id ON public.automation_results(project_id);
CREATE INDEX idx_automation_results_user_id ON public.automation_results(user_id);

-- Enable Row Level Security
ALTER TABLE public.automation_results ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own automation results"
ON public.automation_results
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own automation results"
ON public.automation_results
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own automation results"
ON public.automation_results
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own automation results"
ON public.automation_results
FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Project members can view automation results"
ON public.automation_results
FOR SELECT
USING (
  project_id IS NOT NULL AND 
  (is_project_member(project_id, auth.uid()) OR 
   EXISTS (SELECT 1 FROM projects WHERE id = automation_results.project_id AND created_by = auth.uid()))
);