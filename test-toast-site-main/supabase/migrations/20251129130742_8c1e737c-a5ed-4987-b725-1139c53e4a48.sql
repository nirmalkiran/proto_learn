-- Create test suites table
CREATE TABLE public.nocode_test_suites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create junction table for suite-test relationships
CREATE TABLE public.nocode_suite_tests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  suite_id UUID NOT NULL REFERENCES public.nocode_test_suites(id) ON DELETE CASCADE,
  test_id UUID NOT NULL REFERENCES public.nocode_tests(id) ON DELETE CASCADE,
  execution_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(suite_id, test_id)
);

-- Create suite executions table
CREATE TABLE public.nocode_suite_executions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  suite_id UUID NOT NULL REFERENCES public.nocode_test_suites(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  executed_by UUID NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  total_tests INTEGER DEFAULT 0,
  passed_tests INTEGER DEFAULT 0,
  failed_tests INTEGER DEFAULT 0,
  results JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.nocode_test_suites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nocode_suite_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nocode_suite_executions ENABLE ROW LEVEL SECURITY;

-- RLS policies for nocode_test_suites
CREATE POLICY "Users can view suites in their projects" ON public.nocode_test_suites
  FOR SELECT USING (is_project_member(project_id));

CREATE POLICY "Users can create suites in their projects" ON public.nocode_test_suites
  FOR INSERT WITH CHECK (is_project_member(project_id) AND auth.uid() = created_by);

CREATE POLICY "Users can update suites in their projects" ON public.nocode_test_suites
  FOR UPDATE USING (is_project_member(project_id));

CREATE POLICY "Users can delete suites in their projects" ON public.nocode_test_suites
  FOR DELETE USING (is_project_member(project_id));

-- RLS policies for nocode_suite_tests
CREATE POLICY "Users can view suite tests" ON public.nocode_suite_tests
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.nocode_test_suites s 
    WHERE s.id = suite_id AND is_project_member(s.project_id)
  ));

CREATE POLICY "Users can manage suite tests" ON public.nocode_suite_tests
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.nocode_test_suites s 
    WHERE s.id = suite_id AND is_project_member(s.project_id)
  ));

-- RLS policies for nocode_suite_executions
CREATE POLICY "Users can view suite executions in their projects" ON public.nocode_suite_executions
  FOR SELECT USING (is_project_member(project_id));

CREATE POLICY "Users can create suite executions" ON public.nocode_suite_executions
  FOR INSERT WITH CHECK (is_project_member(project_id) AND auth.uid() = executed_by);

CREATE POLICY "Users can update suite executions in their projects" ON public.nocode_suite_executions
  FOR UPDATE USING (is_project_member(project_id));

-- Create updated_at trigger for suites
CREATE TRIGGER update_nocode_test_suites_updated_at
  BEFORE UPDATE ON public.nocode_test_suites
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();