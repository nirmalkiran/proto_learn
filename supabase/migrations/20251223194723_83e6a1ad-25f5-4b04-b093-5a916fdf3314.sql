-- Create nocode_test_suites table
CREATE TABLE public.nocode_test_suites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on nocode_test_suites
ALTER TABLE public.nocode_test_suites ENABLE ROW LEVEL SECURITY;

-- RLS policies for nocode_test_suites
CREATE POLICY "Users can view own test suites" ON public.nocode_test_suites FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own test suites" ON public.nocode_test_suites FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own test suites" ON public.nocode_test_suites FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own test suites" ON public.nocode_test_suites FOR DELETE USING (auth.uid() = user_id);

-- Create nocode_suite_tests table (junction table for suites and tests)
CREATE TABLE public.nocode_suite_tests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  suite_id UUID NOT NULL REFERENCES public.nocode_test_suites(id) ON DELETE CASCADE,
  test_id UUID NOT NULL REFERENCES public.nocode_tests(id) ON DELETE CASCADE,
  execution_order INTEGER NOT NULL DEFAULT 0,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on nocode_suite_tests
ALTER TABLE public.nocode_suite_tests ENABLE ROW LEVEL SECURITY;

-- RLS policies for nocode_suite_tests
CREATE POLICY "Users can view own suite tests" ON public.nocode_suite_tests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own suite tests" ON public.nocode_suite_tests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own suite tests" ON public.nocode_suite_tests FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own suite tests" ON public.nocode_suite_tests FOR DELETE USING (auth.uid() = user_id);

-- Create nocode_suite_executions table
CREATE TABLE public.nocode_suite_executions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  suite_id UUID NOT NULL REFERENCES public.nocode_test_suites(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  total_tests INTEGER NOT NULL DEFAULT 0,
  passed_tests INTEGER NOT NULL DEFAULT 0,
  failed_tests INTEGER NOT NULL DEFAULT 0,
  results JSONB DEFAULT '[]'::jsonb,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on nocode_suite_executions
ALTER TABLE public.nocode_suite_executions ENABLE ROW LEVEL SECURITY;

-- RLS policies for nocode_suite_executions
CREATE POLICY "Users can view own suite executions" ON public.nocode_suite_executions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own suite executions" ON public.nocode_suite_executions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own suite executions" ON public.nocode_suite_executions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own suite executions" ON public.nocode_suite_executions FOR DELETE USING (auth.uid() = user_id);

-- Create nocode_test_executions table for individual test runs
CREATE TABLE public.nocode_test_executions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_id UUID NOT NULL REFERENCES public.nocode_tests(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_ms INTEGER,
  results JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on nocode_test_executions
ALTER TABLE public.nocode_test_executions ENABLE ROW LEVEL SECURITY;

-- RLS policies for nocode_test_executions
CREATE POLICY "Users can view own test executions" ON public.nocode_test_executions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own test executions" ON public.nocode_test_executions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own test executions" ON public.nocode_test_executions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own test executions" ON public.nocode_test_executions FOR DELETE USING (auth.uid() = user_id);

-- Add structured_steps column to test_cases table
ALTER TABLE public.test_cases ADD COLUMN IF NOT EXISTS structured_steps JSONB DEFAULT '[]'::jsonb;

-- Add git columns to projects table for Git integration
ALTER TABLE public.projects 
  ADD COLUMN IF NOT EXISTS git_repository_url TEXT,
  ADD COLUMN IF NOT EXISTS git_branch TEXT DEFAULT 'main',
  ADD COLUMN IF NOT EXISTS git_sync_status TEXT DEFAULT 'disconnected',
  ADD COLUMN IF NOT EXISTS git_last_sync TIMESTAMP WITH TIME ZONE;

-- Enable realtime for nocode_test_executions
ALTER PUBLICATION supabase_realtime ADD TABLE public.nocode_test_executions;