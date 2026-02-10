
-- Instructions table
CREATE TABLE public.qa_instructions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  instruction_text TEXT NOT NULL,
  parsed_intent JSONB,
  intent_type TEXT,
  target_agents TEXT[] DEFAULT '{}',
  scope JSONB DEFAULT '{}',
  constraints JSONB DEFAULT '{}',
  risk_level TEXT DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
  confidence NUMERIC(4,2),
  approval_required BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  status TEXT DEFAULT 'created' CHECK (status IN ('created', 'validated', 'pending_approval', 'approved', 'in_progress', 'completed', 'failed', 'partially_completed', 'cancelled')),
  error_message TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Instruction-to-agent mapping
CREATE TABLE public.qa_instruction_agents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instruction_id UUID NOT NULL REFERENCES public.qa_instructions(id) ON DELETE CASCADE,
  agent_type TEXT NOT NULL,
  execution_order INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'skipped')),
  payload JSONB DEFAULT '{}',
  result_summary JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Instruction-to-job mapping
CREATE TABLE public.qa_instruction_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instruction_id UUID NOT NULL REFERENCES public.qa_instructions(id) ON DELETE CASCADE,
  instruction_agent_id UUID REFERENCES public.qa_instruction_agents(id) ON DELETE SET NULL,
  job_type TEXT NOT NULL,
  job_reference_id TEXT,
  job_reference_table TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit trail
CREATE TABLE public.qa_instruction_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instruction_id UUID NOT NULL REFERENCES public.qa_instructions(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor_id UUID REFERENCES auth.users(id),
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.qa_instructions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_instruction_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_instruction_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_instruction_audit ENABLE ROW LEVEL SECURITY;

-- RLS policies for qa_instructions
CREATE POLICY "Users can view instructions in their projects" ON public.qa_instructions
  FOR SELECT USING (public.is_project_member(project_id));
CREATE POLICY "Users can create instructions in their projects" ON public.qa_instructions
  FOR INSERT WITH CHECK (public.is_project_member(project_id) AND auth.uid() = created_by);
CREATE POLICY "Users can update instructions in their projects" ON public.qa_instructions
  FOR UPDATE USING (public.is_project_member(project_id));

-- RLS policies for qa_instruction_agents
CREATE POLICY "Users can view instruction agents" ON public.qa_instruction_agents
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.qa_instructions qi WHERE qi.id = instruction_id AND public.is_project_member(qi.project_id)));
CREATE POLICY "Users can manage instruction agents" ON public.qa_instruction_agents
  FOR ALL USING (EXISTS (SELECT 1 FROM public.qa_instructions qi WHERE qi.id = instruction_id AND public.is_project_member(qi.project_id)));

-- RLS policies for qa_instruction_jobs
CREATE POLICY "Users can view instruction jobs" ON public.qa_instruction_jobs
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.qa_instructions qi WHERE qi.id = instruction_id AND public.is_project_member(qi.project_id)));
CREATE POLICY "Users can manage instruction jobs" ON public.qa_instruction_jobs
  FOR ALL USING (EXISTS (SELECT 1 FROM public.qa_instructions qi WHERE qi.id = instruction_id AND public.is_project_member(qi.project_id)));

-- RLS policies for qa_instruction_audit
CREATE POLICY "Users can view instruction audit" ON public.qa_instruction_audit
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.qa_instructions qi WHERE qi.id = instruction_id AND public.is_project_member(qi.project_id)));
CREATE POLICY "Service can insert audit logs" ON public.qa_instruction_audit
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.qa_instructions qi WHERE qi.id = instruction_id AND public.is_project_member(qi.project_id)));

-- Triggers for updated_at
CREATE TRIGGER update_qa_instructions_updated_at BEFORE UPDATE ON public.qa_instructions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_qa_instruction_jobs_updated_at BEFORE UPDATE ON public.qa_instruction_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Index for performance
CREATE INDEX idx_qa_instructions_project_id ON public.qa_instructions(project_id);
CREATE INDEX idx_qa_instructions_status ON public.qa_instructions(status);
CREATE INDEX idx_qa_instruction_agents_instruction_id ON public.qa_instruction_agents(instruction_id);
CREATE INDEX idx_qa_instruction_jobs_instruction_id ON public.qa_instruction_jobs(instruction_id);
CREATE INDEX idx_qa_instruction_audit_instruction_id ON public.qa_instruction_audit(instruction_id);
