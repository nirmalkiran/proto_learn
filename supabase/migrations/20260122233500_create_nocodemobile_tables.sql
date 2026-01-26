-- Create nocodemobile_test_executions table for mobile test runs
CREATE TABLE IF NOT EXISTS public.nocodemobile_test_executions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  test_id uuid REFERENCES public.nocode_tests(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('SUCCESS', 'FAILED', 'RUNNING', 'QUEUED')),
  started_at timestamptz DEFAULT now() NOT NULL,
  completed_at timestamptz,
  duration_ms integer,
  error_message text,
  results jsonb,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS on nocodemobile_test_executions
ALTER TABLE public.nocodemobile_test_executions ENABLE ROW LEVEL SECURITY;

-- RLS policies for nocodemobile_test_executions
DO $$ BEGIN
  CREATE POLICY "Users can view own mobile test executions" ON public.nocodemobile_test_executions FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert own mobile test executions" ON public.nocodemobile_test_executions FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own mobile test executions" ON public.nocodemobile_test_executions FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own mobile test executions" ON public.nocodemobile_test_executions FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Create nocodemobile_suite_executions table for mobile suite runs
CREATE TABLE IF NOT EXISTS public.nocodemobile_suite_executions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  suite_id uuid REFERENCES public.nocode_test_suites(id) ON DELETE CASCADE,
  status text NOT NULL,
  started_at timestamptz DEFAULT now() NOT NULL,
  completed_at timestamptz,
  passed_tests integer DEFAULT 0 NOT NULL,
  failed_tests integer DEFAULT 0 NOT NULL,
  total_tests integer DEFAULT 0 NOT NULL,
  results jsonb,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS on nocodemobile_suite_executions
ALTER TABLE public.nocodemobile_suite_executions ENABLE ROW LEVEL SECURITY;

-- RLS policies for nocodemobile_suite_executions
DO $$ BEGIN
  CREATE POLICY "Users can view own mobile suite executions" ON public.nocodemobile_suite_executions FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert own mobile suite executions" ON public.nocodemobile_suite_executions FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own mobile suite executions" ON public.nocodemobile_suite_executions FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own mobile suite executions" ON public.nocodemobile_suite_executions FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Enable realtime for both tables
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.nocodemobile_test_executions;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.nocodemobile_suite_executions;
EXCEPTION WHEN others THEN NULL; END $$;
