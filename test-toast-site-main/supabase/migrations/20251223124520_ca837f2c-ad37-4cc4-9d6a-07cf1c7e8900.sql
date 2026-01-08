-- =============================================
-- WISPR Self-Hosted Execution Agent Schema
-- =============================================

-- 1. Agent Registry Table
CREATE TABLE public.self_hosted_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  agent_id TEXT UNIQUE NOT NULL,  -- e.g., "WISPR-RUNNER-IND-01"
  agent_name TEXT NOT NULL,
  api_token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offline',  -- online, offline, busy
  capacity INTEGER NOT NULL DEFAULT 4,
  running_jobs INTEGER NOT NULL DEFAULT 0,
  config JSONB DEFAULT '{}'::jsonb,  -- agent.config.json settings
  browsers TEXT[] DEFAULT ARRAY['chromium'],
  last_heartbeat TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Agent Job Queue Table
CREATE TABLE public.agent_job_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES public.self_hosted_agents(id) ON DELETE SET NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  test_id UUID NOT NULL REFERENCES public.nocode_tests(id) ON DELETE CASCADE,
  run_id TEXT UNIQUE NOT NULL,  -- "RUN-10291"
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, assigned, running, completed, failed, cancelled
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  base_url TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  retries INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 2,
  assigned_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Agent Execution Results Table
CREATE TABLE public.agent_execution_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.agent_job_queue(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.self_hosted_agents(id) ON DELETE SET NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL,  -- passed, failed, error
  duration_ms INTEGER,
  total_steps INTEGER NOT NULL DEFAULT 0,
  passed_steps INTEGER NOT NULL DEFAULT 0,
  failed_steps INTEGER NOT NULL DEFAULT 0,
  artifact_url TEXT,
  screenshots JSONB DEFAULT '[]'::jsonb,
  video_url TEXT,
  trace_url TEXT,
  error_message TEXT,
  results JSONB DEFAULT '[]'::jsonb,  -- Step-by-step results
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Agent Activity Logs (for audit trail)
CREATE TABLE public.agent_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES public.self_hosted_agents(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,  -- heartbeat, job_started, job_completed, error, connected, disconnected
  event_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_self_hosted_agents_project ON public.self_hosted_agents(project_id);
CREATE INDEX idx_self_hosted_agents_status ON public.self_hosted_agents(status);
CREATE INDEX idx_agent_job_queue_project ON public.agent_job_queue(project_id);
CREATE INDEX idx_agent_job_queue_status ON public.agent_job_queue(status);
CREATE INDEX idx_agent_job_queue_agent ON public.agent_job_queue(agent_id);
CREATE INDEX idx_agent_execution_results_job ON public.agent_execution_results(job_id);
CREATE INDEX idx_agent_activity_logs_agent ON public.agent_activity_logs(agent_id);

-- Enable RLS
ALTER TABLE public.self_hosted_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_job_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_execution_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_activity_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for self_hosted_agents
CREATE POLICY "Project members can view agents"
  ON public.self_hosted_agents FOR SELECT
  USING (is_project_member(project_id));

CREATE POLICY "Project members can create agents"
  ON public.self_hosted_agents FOR INSERT
  WITH CHECK (is_project_member(project_id) AND auth.uid() = created_by);

CREATE POLICY "Project members can update agents"
  ON public.self_hosted_agents FOR UPDATE
  USING (is_project_member(project_id));

CREATE POLICY "Project members can delete agents"
  ON public.self_hosted_agents FOR DELETE
  USING (is_project_member(project_id));

-- RLS Policies for agent_job_queue
CREATE POLICY "Project members can view jobs"
  ON public.agent_job_queue FOR SELECT
  USING (is_project_member(project_id));

CREATE POLICY "Project members can create jobs"
  ON public.agent_job_queue FOR INSERT
  WITH CHECK (is_project_member(project_id) AND auth.uid() = created_by);

CREATE POLICY "Project members can update jobs"
  ON public.agent_job_queue FOR UPDATE
  USING (is_project_member(project_id));

CREATE POLICY "Project members can delete jobs"
  ON public.agent_job_queue FOR DELETE
  USING (is_project_member(project_id));

-- RLS Policies for agent_execution_results
CREATE POLICY "Project members can view results"
  ON public.agent_execution_results FOR SELECT
  USING (is_project_member(project_id));

CREATE POLICY "Project members can create results"
  ON public.agent_execution_results FOR INSERT
  WITH CHECK (is_project_member(project_id));

-- RLS Policies for agent_activity_logs
CREATE POLICY "Project members can view activity logs"
  ON public.agent_activity_logs FOR SELECT
  USING (is_project_member(project_id));

CREATE POLICY "Project members can create activity logs"
  ON public.agent_activity_logs FOR INSERT
  WITH CHECK (is_project_member(project_id));

-- Function to generate unique run ID
CREATE OR REPLACE FUNCTION public.generate_agent_run_id()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num INTEGER;
  run_id TEXT;
BEGIN
  SELECT COALESCE(MAX(
    CASE 
      WHEN run_id ~ '^RUN-[0-9]+$'
      THEN CAST(SUBSTRING(run_id FROM 5) AS INTEGER)
      ELSE 0 
    END
  ), 0) + 1 INTO next_num
  FROM agent_job_queue;
  
  run_id := 'RUN-' || LPAD(next_num::text, 5, '0');
  RETURN run_id;
END;
$$;

-- Trigger to update updated_at
CREATE TRIGGER update_self_hosted_agents_updated_at
  BEFORE UPDATE ON public.self_hosted_agents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_agent_job_queue_updated_at
  BEFORE UPDATE ON public.agent_job_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();