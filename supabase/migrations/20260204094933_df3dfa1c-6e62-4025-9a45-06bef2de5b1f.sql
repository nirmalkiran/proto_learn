-- Create ZAP agent status type
DO $$ BEGIN
  CREATE TYPE zap_scan_status AS ENUM ('pending', 'spidering', 'scanning', 'completed', 'failed', 'cancelled', 'paused');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE zap_severity AS ENUM ('info', 'low', 'medium', 'high');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE zap_confidence AS ENUM ('confirmed', 'high', 'medium', 'low', 'user_confirmed', 'false_positive');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE zap_scan_mode AS ENUM ('spider', 'ajax_spider', 'active', 'passive', 'full');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ZAP Agents table
CREATE TABLE IF NOT EXISTS public.zap_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  zap_api_url TEXT NOT NULL DEFAULT 'http://127.0.0.1:8080',
  zap_api_key_encrypted TEXT,
  status TEXT NOT NULL DEFAULT 'offline',
  last_heartbeat TIMESTAMPTZ,
  capabilities JSONB DEFAULT '{"spider": true, "ajax_spider": true, "active_scan": true, "passive_scan": true, "fuzzer": false, "websocket": false, "openapi": true, "graphql": false, "soap": false}'::jsonb,
  version TEXT,
  is_daemon_mode BOOLEAN DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ZAP Scan Profiles table
CREATE TABLE IF NOT EXISTS public.zap_scan_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  profile_type TEXT NOT NULL DEFAULT 'standard',
  scan_mode zap_scan_mode NOT NULL DEFAULT 'active',
  spider_enabled BOOLEAN DEFAULT true,
  ajax_spider_enabled BOOLEAN DEFAULT false,
  active_scan_enabled BOOLEAN DEFAULT true,
  passive_scan_enabled BOOLEAN DEFAULT true,
  spider_max_depth INTEGER DEFAULT 10,
  spider_max_children INTEGER DEFAULT 20,
  spider_max_duration INTEGER DEFAULT 15,
  ajax_spider_max_duration INTEGER DEFAULT 10,
  ajax_spider_max_crawl_depth INTEGER DEFAULT 10,
  handle_cookies BOOLEAN DEFAULT true,
  follow_redirects BOOLEAN DEFAULT true,
  scan_policy TEXT,
  attack_strength TEXT DEFAULT 'medium',
  alert_threshold TEXT DEFAULT 'medium',
  max_rule_duration_minutes INTEGER DEFAULT 5,
  thread_per_host INTEGER DEFAULT 4,
  delay_in_ms INTEGER DEFAULT 0,
  context_name TEXT,
  include_in_scope JSONB DEFAULT '[]'::jsonb,
  exclude_from_scope JSONB DEFAULT '[]'::jsonb,
  technology_detection BOOLEAN DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ZAP Scans table
CREATE TABLE IF NOT EXISTS public.zap_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  config_id UUID,
  profile_id UUID REFERENCES public.zap_scan_profiles(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES public.zap_agents(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  run_id TEXT NOT NULL,
  target_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  scope_includes JSONB DEFAULT '[]'::jsonb,
  scope_excludes JSONB DEFAULT '[]'::jsonb,
  api_definition_type TEXT,
  api_definition_content TEXT,
  status zap_scan_status NOT NULL DEFAULT 'pending',
  scan_mode zap_scan_mode NOT NULL DEFAULT 'active',
  progress_percentage INTEGER DEFAULT 0,
  current_phase TEXT,
  spider_progress INTEGER DEFAULT 0,
  active_scan_progress INTEGER DEFAULT 0,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  urls_discovered INTEGER DEFAULT 0,
  requests_made INTEGER DEFAULT 0,
  alerts_found INTEGER DEFAULT 0,
  high_count INTEGER DEFAULT 0,
  medium_count INTEGER DEFAULT 0,
  low_count INTEGER DEFAULT 0,
  info_count INTEGER DEFAULT 0,
  baseline_scan_id UUID,
  new_alerts_count INTEGER DEFAULT 0,
  resolved_alerts_count INTEGER DEFAULT 0,
  error_message TEXT,
  environment TEXT DEFAULT 'dev',
  triggered_by TEXT DEFAULT 'manual',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ZAP Alerts table
CREATE TABLE IF NOT EXISTS public.zap_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scan_id UUID NOT NULL REFERENCES public.zap_scans(id) ON DELETE CASCADE,
  plugin_id TEXT NOT NULL,
  alert_ref TEXT NOT NULL,
  alert_name TEXT NOT NULL,
  risk zap_severity NOT NULL DEFAULT 'info',
  confidence zap_confidence NOT NULL DEFAULT 'medium',
  cwe_id INTEGER,
  wasc_id INTEGER,
  url TEXT NOT NULL,
  method TEXT,
  param TEXT,
  attack TEXT,
  evidence TEXT,
  description TEXT,
  solution TEXT,
  reference TEXT,
  other_info TEXT,
  tags JSONB DEFAULT '{}'::jsonb,
  source TEXT DEFAULT 'active',
  message_id TEXT,
  status TEXT DEFAULT 'new',
  is_false_positive BOOLEAN DEFAULT false,
  is_suppressed BOOLEAN DEFAULT false,
  suppression_reason TEXT,
  assigned_to UUID,
  fingerprint TEXT,
  first_seen_scan_id UUID,
  occurrence_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_zap_agents_project ON public.zap_agents(project_id);
CREATE INDEX IF NOT EXISTS idx_zap_scan_profiles_project ON public.zap_scan_profiles(project_id);
CREATE INDEX IF NOT EXISTS idx_zap_scans_project ON public.zap_scans(project_id);
CREATE INDEX IF NOT EXISTS idx_zap_scans_status ON public.zap_scans(status);
CREATE INDEX IF NOT EXISTS idx_zap_alerts_scan ON public.zap_alerts(scan_id);
CREATE INDEX IF NOT EXISTS idx_zap_alerts_risk ON public.zap_alerts(risk);

-- Enable RLS
ALTER TABLE public.zap_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zap_scan_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zap_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zap_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for zap_agents
CREATE POLICY "Users can view ZAP agents in their projects" ON public.zap_agents
  FOR SELECT USING (public.is_project_member(project_id));

CREATE POLICY "Users can insert ZAP agents in their projects" ON public.zap_agents
  FOR INSERT WITH CHECK (public.is_project_member(project_id));

CREATE POLICY "Users can update ZAP agents in their projects" ON public.zap_agents
  FOR UPDATE USING (public.is_project_member(project_id));

CREATE POLICY "Users can delete ZAP agents in their projects" ON public.zap_agents
  FOR DELETE USING (public.is_project_member(project_id));

-- RLS Policies for zap_scan_profiles
CREATE POLICY "Users can view ZAP profiles in their projects" ON public.zap_scan_profiles
  FOR SELECT USING (public.is_project_member(project_id));

CREATE POLICY "Users can insert ZAP profiles in their projects" ON public.zap_scan_profiles
  FOR INSERT WITH CHECK (public.is_project_member(project_id));

CREATE POLICY "Users can update ZAP profiles in their projects" ON public.zap_scan_profiles
  FOR UPDATE USING (public.is_project_member(project_id));

CREATE POLICY "Users can delete ZAP profiles in their projects" ON public.zap_scan_profiles
  FOR DELETE USING (public.is_project_member(project_id));

-- RLS Policies for zap_scans
CREATE POLICY "Users can view ZAP scans in their projects" ON public.zap_scans
  FOR SELECT USING (public.is_project_member(project_id));

CREATE POLICY "Users can insert ZAP scans in their projects" ON public.zap_scans
  FOR INSERT WITH CHECK (public.is_project_member(project_id));

CREATE POLICY "Users can update ZAP scans in their projects" ON public.zap_scans
  FOR UPDATE USING (public.is_project_member(project_id));

CREATE POLICY "Users can delete ZAP scans in their projects" ON public.zap_scans
  FOR DELETE USING (public.is_project_member(project_id));

-- RLS Policies for zap_alerts
CREATE POLICY "Users can view ZAP alerts in their projects" ON public.zap_alerts
  FOR SELECT USING (public.is_project_member(project_id));

CREATE POLICY "Users can insert ZAP alerts in their projects" ON public.zap_alerts
  FOR INSERT WITH CHECK (public.is_project_member(project_id));

CREATE POLICY "Users can update ZAP alerts in their projects" ON public.zap_alerts
  FOR UPDATE USING (public.is_project_member(project_id));

CREATE POLICY "Users can delete ZAP alerts in their projects" ON public.zap_alerts
  FOR DELETE USING (public.is_project_member(project_id));

-- Triggers for updated_at
CREATE TRIGGER update_zap_agents_updated_at
  BEFORE UPDATE ON public.zap_agents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_zap_scan_profiles_updated_at
  BEFORE UPDATE ON public.zap_scan_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_zap_scans_updated_at
  BEFORE UPDATE ON public.zap_scans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_zap_alerts_updated_at
  BEFORE UPDATE ON public.zap_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();