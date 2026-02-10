-- Security scan configurations table
CREATE TABLE public.security_scan_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_url TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT 'web' CHECK (target_type IN ('web', 'api')),
  environment TEXT NOT NULL DEFAULT 'dev' CHECK (environment IN ('dev', 'qa', 'prod')),
  auth_type TEXT NOT NULL DEFAULT 'none' CHECK (auth_type IN ('none', 'basic', 'token', 'oauth')),
  auth_config JSONB DEFAULT '{}',
  roles JSONB DEFAULT '[]',
  scan_depth TEXT NOT NULL DEFAULT 'medium' CHECK (scan_depth IN ('low', 'medium', 'deep')),
  enabled_categories TEXT[] DEFAULT ARRAY['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10'],
  rate_limit_rps INTEGER DEFAULT 10,
  aggressive_mode BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Security scan executions table
CREATE TABLE public.security_scans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  config_id UUID NOT NULL REFERENCES public.security_scan_configs(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  scan_mode TEXT DEFAULT 'manual' CHECK (scan_mode IN ('manual', 'agent', 'scheduled')),
  discovered_endpoints JSONB DEFAULT '[]',
  summary JSONB DEFAULT '{}',
  error_message TEXT,
  baseline_scan_id UUID REFERENCES public.security_scans(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Security findings table
CREATE TABLE public.security_findings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id UUID NOT NULL REFERENCES public.security_scans(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owasp_category TEXT NOT NULL,
  vulnerability_name TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  confidence INTEGER NOT NULL DEFAULT 50 CHECK (confidence >= 0 AND confidence <= 100),
  affected_endpoint TEXT NOT NULL,
  http_method TEXT,
  payload_used TEXT,
  evidence JSONB DEFAULT '{}',
  remediation TEXT,
  is_false_positive BOOLEAN DEFAULT false,
  is_suppressed BOOLEAN DEFAULT false,
  suppression_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Security scan audit log
CREATE TABLE public.security_scan_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id UUID NOT NULL REFERENCES public.security_scans(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.security_scan_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_scan_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for security_scan_configs
CREATE POLICY "Users can view security configs for their projects"
ON public.security_scan_configs FOR SELECT
USING (EXISTS (SELECT 1 FROM public.project_members pm WHERE pm.project_id = security_scan_configs.project_id AND pm.user_id = auth.uid()));

CREATE POLICY "Users can create security configs for their projects"
ON public.security_scan_configs FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.project_members pm WHERE pm.project_id = security_scan_configs.project_id AND pm.user_id = auth.uid()));

CREATE POLICY "Users can update security configs for their projects"
ON public.security_scan_configs FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.project_members pm WHERE pm.project_id = security_scan_configs.project_id AND pm.user_id = auth.uid()));

CREATE POLICY "Users can delete security configs for their projects"
ON public.security_scan_configs FOR DELETE
USING (EXISTS (SELECT 1 FROM public.project_members pm WHERE pm.project_id = security_scan_configs.project_id AND pm.user_id = auth.uid()));

-- RLS Policies for security_scans
CREATE POLICY "Users can view scans for their projects"
ON public.security_scans FOR SELECT
USING (EXISTS (SELECT 1 FROM public.project_members pm WHERE pm.project_id = security_scans.project_id AND pm.user_id = auth.uid()));

CREATE POLICY "Users can create scans for their projects"
ON public.security_scans FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.project_members pm WHERE pm.project_id = security_scans.project_id AND pm.user_id = auth.uid()));

CREATE POLICY "Users can update scans for their projects"
ON public.security_scans FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.project_members pm WHERE pm.project_id = security_scans.project_id AND pm.user_id = auth.uid()));

-- RLS Policies for security_findings
CREATE POLICY "Users can view findings for their projects"
ON public.security_findings FOR SELECT
USING (EXISTS (SELECT 1 FROM public.project_members pm WHERE pm.project_id = security_findings.project_id AND pm.user_id = auth.uid()));

CREATE POLICY "Users can update findings for their projects"
ON public.security_findings FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.project_members pm WHERE pm.project_id = security_findings.project_id AND pm.user_id = auth.uid()));

CREATE POLICY "System can insert findings"
ON public.security_findings FOR INSERT
WITH CHECK (true);

-- RLS Policies for security_scan_logs
CREATE POLICY "Users can view logs for their scans"
ON public.security_scan_logs FOR SELECT
USING (EXISTS (SELECT 1 FROM public.security_scans s JOIN public.project_members pm ON pm.project_id = s.project_id WHERE s.id = security_scan_logs.scan_id AND pm.user_id = auth.uid()));

CREATE POLICY "System can insert logs"
ON public.security_scan_logs FOR INSERT
WITH CHECK (true);

-- Indexes for performance
CREATE INDEX idx_security_scan_configs_project ON public.security_scan_configs(project_id);
CREATE INDEX idx_security_scans_config ON public.security_scans(config_id);
CREATE INDEX idx_security_scans_project ON public.security_scans(project_id);
CREATE INDEX idx_security_scans_status ON public.security_scans(status);
CREATE INDEX idx_security_findings_scan ON public.security_findings(scan_id);
CREATE INDEX idx_security_findings_severity ON public.security_findings(severity);
CREATE INDEX idx_security_findings_category ON public.security_findings(owasp_category);

-- Trigger for updated_at
CREATE TRIGGER update_security_scan_configs_updated_at
BEFORE UPDATE ON public.security_scan_configs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();