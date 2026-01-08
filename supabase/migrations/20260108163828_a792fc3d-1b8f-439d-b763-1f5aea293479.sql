-- Create qa_standards table
CREATE TABLE public.qa_standards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  standard_type text NOT NULL,
  rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  examples jsonb NOT NULL DEFAULT '[]'::jsonb,
  description text,
  version text DEFAULT '1.0',
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.qa_standards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own qa_standards" ON public.qa_standards FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own qa_standards" ON public.qa_standards FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own qa_standards" ON public.qa_standards FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own qa_standards" ON public.qa_standards FOR DELETE USING (auth.uid() = user_id);

-- Create ai_safety_controls table
CREATE TABLE public.ai_safety_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  confidence_threshold numeric DEFAULT 0.7,
  rate_limit_daily integer DEFAULT 100,
  require_approval_test_cases boolean DEFAULT false,
  require_approval_test_plans boolean DEFAULT false,
  require_approval_user_stories boolean DEFAULT false,
  enable_audit_logging boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, project_id)
);

ALTER TABLE public.ai_safety_controls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ai_safety_controls" ON public.ai_safety_controls FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ai_safety_controls" ON public.ai_safety_controls FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ai_safety_controls" ON public.ai_safety_controls FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own ai_safety_controls" ON public.ai_safety_controls FOR DELETE USING (auth.uid() = user_id);

-- Create self_hosted_agents table
CREATE TABLE public.self_hosted_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  agent_type text NOT NULL,
  status text DEFAULT 'offline',
  endpoint_url text,
  api_key text,
  capabilities jsonb DEFAULT '[]'::jsonb,
  last_heartbeat timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.self_hosted_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own self_hosted_agents" ON public.self_hosted_agents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own self_hosted_agents" ON public.self_hosted_agents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own self_hosted_agents" ON public.self_hosted_agents FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own self_hosted_agents" ON public.self_hosted_agents FOR DELETE USING (auth.uid() = user_id);

-- Create agent_job_queue table
CREATE TABLE public.agent_job_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  agent_id uuid REFERENCES public.self_hosted_agents(id) ON DELETE CASCADE,
  job_type text NOT NULL,
  job_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text DEFAULT 'pending',
  result jsonb,
  error_message text,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_job_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own agent_job_queue" ON public.agent_job_queue FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own agent_job_queue" ON public.agent_job_queue FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own agent_job_queue" ON public.agent_job_queue FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own agent_job_queue" ON public.agent_job_queue FOR DELETE USING (auth.uid() = user_id);

-- Create qa_proven_patterns table
CREATE TABLE public.qa_proven_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_ids uuid[] DEFAULT '{}',
  pattern_name text NOT NULL,
  pattern_type text NOT NULL,
  pattern_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  success_rate numeric DEFAULT 0,
  usage_count integer DEFAULT 0,
  tags text[] DEFAULT '{}',
  is_public boolean DEFAULT false,
  created_by text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.qa_proven_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own qa_proven_patterns" ON public.qa_proven_patterns FOR SELECT USING (auth.uid() = user_id OR is_public = true);
CREATE POLICY "Users can insert own qa_proven_patterns" ON public.qa_proven_patterns FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own qa_proven_patterns" ON public.qa_proven_patterns FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own qa_proven_patterns" ON public.qa_proven_patterns FOR DELETE USING (auth.uid() = user_id);

-- Create test_runs table
CREATE TABLE public.test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text DEFAULT 'pending',
  total_cases integer DEFAULT 0,
  passed_cases integer DEFAULT 0,
  failed_cases integer DEFAULT 0,
  skipped_cases integer DEFAULT 0,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.test_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own test_runs" ON public.test_runs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own test_runs" ON public.test_runs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own test_runs" ON public.test_runs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own test_runs" ON public.test_runs FOR DELETE USING (auth.uid() = user_id);

-- Create test_run_cases table
CREATE TABLE public.test_run_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  test_run_id uuid REFERENCES public.test_runs(id) ON DELETE CASCADE,
  test_case_id uuid REFERENCES public.test_cases(id) ON DELETE SET NULL,
  status text DEFAULT 'pending',
  actual_result text,
  notes text,
  executed_by text,
  executed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.test_run_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own test_run_cases" ON public.test_run_cases FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own test_run_cases" ON public.test_run_cases FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own test_run_cases" ON public.test_run_cases FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own test_run_cases" ON public.test_run_cases FOR DELETE USING (auth.uid() = user_id);

-- Create qa_ai_feedback table for AI audit dashboard
CREATE TABLE public.qa_ai_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  feature_type text NOT NULL,
  feedback_type text NOT NULL,
  rating integer,
  comment text,
  ai_output jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.qa_ai_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own qa_ai_feedback" ON public.qa_ai_feedback FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own qa_ai_feedback" ON public.qa_ai_feedback FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create qa_embeddings table for semantic search (without vector type for now)
CREATE TABLE public.qa_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  artifact_type text NOT NULL,
  artifact_id uuid NOT NULL,
  content text NOT NULL,
  embedding_data jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  is_approved boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.qa_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own qa_embeddings" ON public.qa_embeddings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own qa_embeddings" ON public.qa_embeddings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own qa_embeddings" ON public.qa_embeddings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own qa_embeddings" ON public.qa_embeddings FOR DELETE USING (auth.uid() = user_id);

-- Create ai_usage_logs table for analytics
CREATE TABLE public.ai_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  feature_type text NOT NULL,
  success boolean DEFAULT true,
  tokens_used integer DEFAULT 0,
  openai_tokens_prompt integer DEFAULT 0,
  openai_tokens_completion integer DEFAULT 0,
  openai_cost_usd numeric DEFAULT 0,
  openai_model text,
  execution_time_ms integer,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ai_usage_logs" ON public.ai_usage_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ai_usage_logs" ON public.ai_usage_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Add updated_at triggers
CREATE TRIGGER update_qa_standards_updated_at BEFORE UPDATE ON public.qa_standards FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ai_safety_controls_updated_at BEFORE UPDATE ON public.ai_safety_controls FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_self_hosted_agents_updated_at BEFORE UPDATE ON public.self_hosted_agents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_qa_proven_patterns_updated_at BEFORE UPDATE ON public.qa_proven_patterns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_test_runs_updated_at BEFORE UPDATE ON public.test_runs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_qa_embeddings_updated_at BEFORE UPDATE ON public.qa_embeddings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();