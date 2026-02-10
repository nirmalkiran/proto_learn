-- Create table for scheduled triggers
CREATE TABLE public.agent_scheduled_triggers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('schedule', 'deployment')),
  -- Schedule configuration (for schedule type)
  schedule_type TEXT CHECK (schedule_type IN ('daily', 'weekly', 'hourly')),
  schedule_time TIME,
  schedule_day_of_week INTEGER CHECK (schedule_day_of_week >= 0 AND schedule_day_of_week <= 6),
  schedule_timezone TEXT DEFAULT 'UTC',
  -- Deployment configuration (for deployment type)
  deployment_environment TEXT CHECK (deployment_environment IN ('QA', 'UAT', 'Staging', 'Production')),
  deployment_webhook_secret TEXT,
  -- Execution configuration
  target_type TEXT NOT NULL CHECK (target_type IN ('test', 'suite')),
  target_id UUID NOT NULL,
  agent_id UUID REFERENCES public.self_hosted_agents(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  last_triggered_at TIMESTAMP WITH TIME ZONE,
  next_scheduled_at TIMESTAMP WITH TIME ZONE,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for trigger execution history
CREATE TABLE public.agent_trigger_executions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trigger_id UUID NOT NULL REFERENCES public.agent_scheduled_triggers(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  triggered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  trigger_source TEXT NOT NULL CHECK (trigger_source IN ('schedule', 'deployment', 'manual')),
  deployment_info JSONB,
  job_id UUID REFERENCES public.agent_job_queue(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_scheduled_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_trigger_executions ENABLE ROW LEVEL SECURITY;

-- RLS policies for agent_scheduled_triggers
CREATE POLICY "Users can view triggers for their projects"
ON public.agent_scheduled_triggers
FOR SELECT
USING (public.is_project_member(project_id));

CREATE POLICY "Users can create triggers for their projects"
ON public.agent_scheduled_triggers
FOR INSERT
WITH CHECK (public.is_project_member(project_id));

CREATE POLICY "Users can update triggers for their projects"
ON public.agent_scheduled_triggers
FOR UPDATE
USING (public.is_project_member(project_id));

CREATE POLICY "Users can delete triggers for their projects"
ON public.agent_scheduled_triggers
FOR DELETE
USING (public.is_project_member(project_id));

-- RLS policies for agent_trigger_executions
CREATE POLICY "Users can view trigger executions for their projects"
ON public.agent_trigger_executions
FOR SELECT
USING (public.is_project_member(project_id));

CREATE POLICY "Users can create trigger executions for their projects"
ON public.agent_trigger_executions
FOR INSERT
WITH CHECK (public.is_project_member(project_id));

-- Create indexes for performance
CREATE INDEX idx_agent_scheduled_triggers_project_id ON public.agent_scheduled_triggers(project_id);
CREATE INDEX idx_agent_scheduled_triggers_next_scheduled ON public.agent_scheduled_triggers(next_scheduled_at) WHERE is_active = true;
CREATE INDEX idx_agent_trigger_executions_trigger_id ON public.agent_trigger_executions(trigger_id);
CREATE INDEX idx_agent_trigger_executions_project_id ON public.agent_trigger_executions(project_id);

-- Trigger to update updated_at
CREATE TRIGGER update_agent_scheduled_triggers_updated_at
BEFORE UPDATE ON public.agent_scheduled_triggers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();