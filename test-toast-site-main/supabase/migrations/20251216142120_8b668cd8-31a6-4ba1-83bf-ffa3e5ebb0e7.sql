-- Create test_runs table
CREATE TABLE public.test_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  run_type TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'not_started',
  description TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create test_run_cases junction table
CREATE TABLE public.test_run_cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_run_id UUID NOT NULL REFERENCES public.test_runs(id) ON DELETE CASCADE,
  test_case_id UUID NOT NULL REFERENCES public.test_cases(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_run',
  executed_at TIMESTAMP WITH TIME ZONE,
  executed_by UUID,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(test_run_id, test_case_id)
);

-- Enable RLS
ALTER TABLE public.test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_run_cases ENABLE ROW LEVEL SECURITY;

-- RLS policies for test_runs
CREATE POLICY "Users can view test runs in their projects"
ON public.test_runs FOR SELECT
USING (is_project_member(project_id, auth.uid()) OR (EXISTS (SELECT 1 FROM projects WHERE projects.id = test_runs.project_id AND projects.created_by = auth.uid())));

CREATE POLICY "Users can create test runs in their projects"
ON public.test_runs FOR INSERT
WITH CHECK (is_project_member(project_id, auth.uid()) OR (EXISTS (SELECT 1 FROM projects WHERE projects.id = test_runs.project_id AND projects.created_by = auth.uid())));

CREATE POLICY "Users can update test runs in their projects"
ON public.test_runs FOR UPDATE
USING (is_project_member(project_id, auth.uid()) OR (EXISTS (SELECT 1 FROM projects WHERE projects.id = test_runs.project_id AND projects.created_by = auth.uid())));

CREATE POLICY "Users can delete test runs in their projects"
ON public.test_runs FOR DELETE
USING (is_project_member(project_id, auth.uid()) OR (EXISTS (SELECT 1 FROM projects WHERE projects.id = test_runs.project_id AND projects.created_by = auth.uid())));

-- RLS policies for test_run_cases
CREATE POLICY "Users can view test run cases"
ON public.test_run_cases FOR SELECT
USING (EXISTS (SELECT 1 FROM test_runs WHERE test_runs.id = test_run_cases.test_run_id AND (is_project_member(test_runs.project_id, auth.uid()) OR EXISTS (SELECT 1 FROM projects WHERE projects.id = test_runs.project_id AND projects.created_by = auth.uid()))));

CREATE POLICY "Users can create test run cases"
ON public.test_run_cases FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM test_runs WHERE test_runs.id = test_run_cases.test_run_id AND (is_project_member(test_runs.project_id, auth.uid()) OR EXISTS (SELECT 1 FROM projects WHERE projects.id = test_runs.project_id AND projects.created_by = auth.uid()))));

CREATE POLICY "Users can update test run cases"
ON public.test_run_cases FOR UPDATE
USING (EXISTS (SELECT 1 FROM test_runs WHERE test_runs.id = test_run_cases.test_run_id AND (is_project_member(test_runs.project_id, auth.uid()) OR EXISTS (SELECT 1 FROM projects WHERE projects.id = test_runs.project_id AND projects.created_by = auth.uid()))));

CREATE POLICY "Users can delete test run cases"
ON public.test_run_cases FOR DELETE
USING (EXISTS (SELECT 1 FROM test_runs WHERE test_runs.id = test_run_cases.test_run_id AND (is_project_member(test_runs.project_id, auth.uid()) OR EXISTS (SELECT 1 FROM projects WHERE projects.id = test_runs.project_id AND projects.created_by = auth.uid()))));

-- Create indexes
CREATE INDEX idx_test_runs_project_id ON public.test_runs(project_id);
CREATE INDEX idx_test_run_cases_test_run_id ON public.test_run_cases(test_run_id);
CREATE INDEX idx_test_run_cases_test_case_id ON public.test_run_cases(test_case_id);

-- Trigger for updated_at
CREATE TRIGGER update_test_runs_updated_at
BEFORE UPDATE ON public.test_runs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();