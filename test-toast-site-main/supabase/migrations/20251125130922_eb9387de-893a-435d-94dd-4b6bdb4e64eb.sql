-- Create table for no-code automation tests
CREATE TABLE IF NOT EXISTS public.nocode_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  base_url TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create table for no-code test executions
CREATE TABLE IF NOT EXISTS public.nocode_test_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES public.nocode_tests(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('running', 'passed', 'failed', 'cancelled')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  results JSONB,
  error_message TEXT,
  executed_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.nocode_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nocode_test_executions ENABLE ROW LEVEL SECURITY;

-- Create policies for nocode_tests
CREATE POLICY "Users can view tests in their projects"
  ON public.nocode_tests FOR SELECT
  USING (is_project_member(project_id));

CREATE POLICY "Users can create tests in their projects"
  ON public.nocode_tests FOR INSERT
  WITH CHECK (is_project_member(project_id) AND auth.uid() = created_by);

CREATE POLICY "Users can update tests in their projects"
  ON public.nocode_tests FOR UPDATE
  USING (is_project_member(project_id));

CREATE POLICY "Users can delete tests in their projects"
  ON public.nocode_tests FOR DELETE
  USING (is_project_member(project_id));

-- Create policies for nocode_test_executions
CREATE POLICY "Users can view executions in their projects"
  ON public.nocode_test_executions FOR SELECT
  USING (is_project_member(project_id));

CREATE POLICY "Users can create executions in their projects"
  ON public.nocode_test_executions FOR INSERT
  WITH CHECK (is_project_member(project_id) AND auth.uid() = executed_by);

CREATE POLICY "Users can update executions in their projects"
  ON public.nocode_test_executions FOR UPDATE
  USING (is_project_member(project_id));

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_nocode_tests_project_id ON public.nocode_tests(project_id);
CREATE INDEX IF NOT EXISTS idx_nocode_tests_status ON public.nocode_tests(status);
CREATE INDEX IF NOT EXISTS idx_nocode_test_executions_test_id ON public.nocode_test_executions(test_id);
CREATE INDEX IF NOT EXISTS idx_nocode_test_executions_project_id ON public.nocode_test_executions(project_id);
CREATE INDEX IF NOT EXISTS idx_nocode_test_executions_status ON public.nocode_test_executions(status);

-- Create trigger for updated_at
CREATE TRIGGER update_nocode_tests_updated_at
  BEFORE UPDATE ON public.nocode_tests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();