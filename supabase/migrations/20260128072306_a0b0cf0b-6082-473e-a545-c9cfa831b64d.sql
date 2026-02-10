-- =============================================
-- BURP SUITE AGENT INTEGRATION SCHEMA
-- Comprehensive security testing platform
-- =============================================

-- Enum for scan modes
CREATE TYPE burp_scan_mode AS ENUM ('passive', 'active', 'crawl', 'audit');

-- Enum for scan status
CREATE TYPE burp_scan_status AS ENUM ('pending', 'crawling', 'scanning', 'completed', 'failed', 'cancelled', 'paused');

-- Enum for finding severity
CREATE TYPE burp_severity AS ENUM ('info', 'low', 'medium', 'high', 'critical');

-- Enum for confidence levels
CREATE TYPE burp_confidence AS ENUM ('certain', 'firm', 'tentative');

-- =============================================
-- BURP AGENTS - Self-hosted agent registration
-- =============================================
CREATE TABLE public.burp_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    burp_api_url TEXT NOT NULL,
    burp_api_key_encrypted TEXT,
    status TEXT NOT NULL DEFAULT 'offline',
    last_heartbeat TIMESTAMPTZ,
    capabilities JSONB DEFAULT '{"scanner": true, "crawler": true, "collaborator": false, "intruder": false}'::jsonb,
    version TEXT,
    license_type TEXT DEFAULT 'professional',
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- BURP SCAN PROFILES - Reusable scan configurations
-- =============================================
CREATE TABLE public.burp_scan_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    profile_type TEXT NOT NULL DEFAULT 'standard',
    scan_mode burp_scan_mode NOT NULL DEFAULT 'passive',
    crawl_enabled BOOLEAN DEFAULT true,
    active_scan_enabled BOOLEAN DEFAULT false,
    passive_scan_enabled BOOLEAN DEFAULT true,
    crawl_depth INTEGER DEFAULT 5,
    crawl_max_urls INTEGER DEFAULT 1000,
    follow_redirects BOOLEAN DEFAULT true,
    handle_javascript BOOLEAN DEFAULT true,
    scan_insertion_points JSONB DEFAULT '["url", "body", "cookie", "header"]'::jsonb,
    scan_categories JSONB DEFAULT '[]'::jsonb,
    requests_per_second INTEGER DEFAULT 10,
    concurrent_requests INTEGER DEFAULT 5,
    delay_between_requests_ms INTEGER DEFAULT 100,
    destructive_tests_enabled BOOLEAN DEFAULT false,
    oast_enabled BOOLEAN DEFAULT false,
    fuzzing_enabled BOOLEAN DEFAULT false,
    brute_force_enabled BOOLEAN DEFAULT false,
    dom_analysis_enabled BOOLEAN DEFAULT true,
    dom_invader_enabled BOOLEAN DEFAULT false,
    bchecks JSONB DEFAULT '[]'::jsonb,
    match_replace_rules JSONB DEFAULT '[]'::jsonb,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(project_id, name)
);

-- =============================================
-- BURP SCANS - Scan execution records
-- =============================================
CREATE TABLE public.burp_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    config_id UUID REFERENCES public.security_scan_configs(id) ON DELETE SET NULL,
    profile_id UUID REFERENCES public.burp_scan_profiles(id) ON DELETE SET NULL,
    agent_id UUID REFERENCES public.burp_agents(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    run_id TEXT NOT NULL UNIQUE,
    target_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
    scope_includes JSONB DEFAULT '[]'::jsonb,
    scope_excludes JSONB DEFAULT '[]'::jsonb,
    api_definition_type TEXT,
    api_definition_content TEXT,
    status burp_scan_status NOT NULL DEFAULT 'pending',
    scan_mode burp_scan_mode NOT NULL DEFAULT 'passive',
    progress_percentage INTEGER DEFAULT 0,
    current_phase TEXT,
    scheduled_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    endpoints_discovered INTEGER DEFAULT 0,
    requests_made INTEGER DEFAULT 0,
    issues_found INTEGER DEFAULT 0,
    critical_count INTEGER DEFAULT 0,
    high_count INTEGER DEFAULT 0,
    medium_count INTEGER DEFAULT 0,
    low_count INTEGER DEFAULT 0,
    info_count INTEGER DEFAULT 0,
    baseline_scan_id UUID REFERENCES public.burp_scans(id),
    new_issues_count INTEGER DEFAULT 0,
    resolved_issues_count INTEGER DEFAULT 0,
    error_message TEXT,
    environment TEXT DEFAULT 'dev',
    triggered_by TEXT DEFAULT 'manual',
    ci_cd_context JSONB,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- BURP ATTACK SURFACE - Discovered endpoints
-- =============================================
CREATE TABLE public.burp_attack_surface (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    scan_id UUID NOT NULL REFERENCES public.burp_scans(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'GET',
    path TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER DEFAULT 443,
    protocol TEXT DEFAULT 'https',
    query_params JSONB DEFAULT '[]'::jsonb,
    body_params JSONB DEFAULT '[]'::jsonb,
    path_params JSONB DEFAULT '[]'::jsonb,
    headers JSONB DEFAULT '[]'::jsonb,
    cookies JSONB DEFAULT '[]'::jsonb,
    content_type TEXT,
    response_type TEXT,
    response_length INTEGER,
    discovery_source TEXT DEFAULT 'crawl',
    api_operation_id TEXT,
    requires_auth BOOLEAN DEFAULT false,
    auth_type TEXT,
    has_file_upload BOOLEAN DEFAULT false,
    has_json_input BOOLEAN DEFAULT false,
    has_xml_input BOOLEAN DEFAULT false,
    accepts_user_input BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    last_tested_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(scan_id, method, url)
);

-- =============================================
-- BURP FINDINGS - Vulnerability discoveries
-- =============================================
CREATE TABLE public.burp_findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    scan_id UUID NOT NULL REFERENCES public.burp_scans(id) ON DELETE CASCADE,
    surface_id UUID REFERENCES public.burp_attack_surface(id) ON DELETE SET NULL,
    issue_type TEXT NOT NULL,
    issue_name TEXT NOT NULL,
    severity burp_severity NOT NULL DEFAULT 'info',
    confidence burp_confidence NOT NULL DEFAULT 'tentative',
    owasp_category TEXT,
    cwe_id INTEGER,
    host TEXT NOT NULL,
    path TEXT NOT NULL,
    url TEXT NOT NULL,
    http_method TEXT,
    request_base64 TEXT,
    response_base64 TEXT,
    payload_used TEXT,
    insertion_point TEXT,
    path_to_issue JSONB DEFAULT '[]'::jsonb,
    issue_detail TEXT,
    issue_background TEXT,
    remediation_detail TEXT,
    remediation_background TEXT,
    reference_urls JSONB DEFAULT '[]'::jsonb,
    oast_interaction_id TEXT,
    oast_data JSONB,
    is_dom_based BOOLEAN DEFAULT false,
    source_sink_info JSONB,
    status TEXT DEFAULT 'new',
    is_false_positive BOOLEAN DEFAULT false,
    is_suppressed BOOLEAN DEFAULT false,
    suppression_reason TEXT,
    assigned_to UUID,
    fingerprint TEXT,
    first_seen_scan_id UUID,
    occurrence_count INTEGER DEFAULT 1,
    ai_analysis JSONB,
    ai_confidence_score NUMERIC(3,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- BURP TRAFFIC LOGS - Proxy history
-- =============================================
CREATE TABLE public.burp_traffic_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    scan_id UUID REFERENCES public.burp_scans(id) ON DELETE CASCADE,
    request_id TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    url TEXT NOT NULL,
    method TEXT NOT NULL,
    host TEXT NOT NULL,
    path TEXT NOT NULL,
    port INTEGER,
    protocol TEXT,
    request_headers JSONB,
    request_body_base64 TEXT,
    request_content_type TEXT,
    response_status INTEGER,
    response_headers JSONB,
    response_body_base64 TEXT,
    response_content_type TEXT,
    response_length INTEGER,
    time_to_first_byte_ms INTEGER,
    total_time_ms INTEGER,
    was_modified BOOLEAN DEFAULT false,
    modification_notes TEXT,
    tags JSONB DEFAULT '[]'::jsonb,
    annotations TEXT,
    is_websocket BOOLEAN DEFAULT false,
    websocket_messages JSONB,
    http_version TEXT DEFAULT '1.1',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- BURP SCAN LOGS - Detailed scan activity
-- =============================================
CREATE TABLE public.burp_scan_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id UUID NOT NULL REFERENCES public.burp_scans(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    level TEXT NOT NULL DEFAULT 'info',
    category TEXT NOT NULL,
    message TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- BURP INTRUDER ATTACKS - Fuzzing/Brute-force
-- =============================================
CREATE TABLE public.burp_intruder_attacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    scan_id UUID REFERENCES public.burp_scans(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    attack_type TEXT NOT NULL,
    target_url TEXT NOT NULL,
    base_request_base64 TEXT NOT NULL,
    payload_positions JSONB NOT NULL,
    payload_sets JSONB NOT NULL,
    requests_per_second INTEGER DEFAULT 5,
    status TEXT DEFAULT 'pending',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    requests_made INTEGER DEFAULT 0,
    interesting_responses JSONB DEFAULT '[]'::jsonb,
    requires_approval BOOLEAN DEFAULT false,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- BURP OAST INTERACTIONS - Collaborator data
-- =============================================
CREATE TABLE public.burp_oast_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    scan_id UUID REFERENCES public.burp_scans(id) ON DELETE SET NULL,
    finding_id UUID REFERENCES public.burp_findings(id) ON DELETE SET NULL,
    interaction_id TEXT NOT NULL UNIQUE,
    interaction_type TEXT NOT NULL,
    client_ip TEXT,
    timestamp TIMESTAMPTZ NOT NULL,
    dns_query_type TEXT,
    dns_query TEXT,
    http_request_base64 TEXT,
    http_response_base64 TEXT,
    smtp_conversation TEXT,
    payload_id TEXT,
    correlated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- BURP CUSTOM EXTENSIONS - BChecks, Bambdas
-- =============================================
CREATE TABLE public.burp_custom_extensions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    extension_type TEXT NOT NULL,
    description TEXT,
    code_content TEXT,
    bapp_id TEXT,
    bapp_version TEXT,
    is_enabled BOOLEAN DEFAULT true,
    is_approved BOOLEAN DEFAULT false,
    approved_by UUID,
    version TEXT DEFAULT '1.0.0',
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- BURP REPORTS - Generated reports
-- =============================================
CREATE TABLE public.burp_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    scan_id UUID NOT NULL REFERENCES public.burp_scans(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    format TEXT NOT NULL DEFAULT 'html',
    report_content TEXT,
    report_storage_path TEXT,
    include_request_response BOOLEAN DEFAULT true,
    include_remediation BOOLEAN DEFAULT true,
    severity_filter burp_severity[] DEFAULT '{critical, high, medium, low, info}'::burp_severity[],
    owasp_mapping JSONB,
    generated_pocs JSONB DEFAULT '[]'::jsonb,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- BURP CI/CD JOBS - Pipeline integration
-- =============================================
CREATE TABLE public.burp_cicd_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    scan_id UUID REFERENCES public.burp_scans(id) ON DELETE SET NULL,
    pipeline_id TEXT,
    job_id TEXT,
    commit_sha TEXT,
    branch TEXT,
    profile_id UUID REFERENCES public.burp_scan_profiles(id),
    timeout_minutes INTEGER DEFAULT 60,
    fail_on_severity burp_severity DEFAULT 'high',
    status TEXT DEFAULT 'pending',
    exit_code INTEGER,
    scan_summary JSONB,
    baseline_comparison JSONB,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================
CREATE INDEX idx_burp_agents_project ON public.burp_agents(project_id);
CREATE INDEX idx_burp_agents_status ON public.burp_agents(status);
CREATE INDEX idx_burp_scan_profiles_project ON public.burp_scan_profiles(project_id);
CREATE INDEX idx_burp_scans_project ON public.burp_scans(project_id);
CREATE INDEX idx_burp_scans_status ON public.burp_scans(status);
CREATE INDEX idx_burp_scans_run_id ON public.burp_scans(run_id);
CREATE INDEX idx_burp_scans_agent ON public.burp_scans(agent_id);
CREATE INDEX idx_burp_attack_surface_project ON public.burp_attack_surface(project_id);
CREATE INDEX idx_burp_attack_surface_scan ON public.burp_attack_surface(scan_id);
CREATE INDEX idx_burp_attack_surface_url ON public.burp_attack_surface(url);
CREATE INDEX idx_burp_findings_project ON public.burp_findings(project_id);
CREATE INDEX idx_burp_findings_scan ON public.burp_findings(scan_id);
CREATE INDEX idx_burp_findings_severity ON public.burp_findings(severity);
CREATE INDEX idx_burp_findings_status ON public.burp_findings(status);
CREATE INDEX idx_burp_findings_fingerprint ON public.burp_findings(fingerprint);
CREATE INDEX idx_burp_traffic_logs_project ON public.burp_traffic_logs(project_id);
CREATE INDEX idx_burp_traffic_logs_scan ON public.burp_traffic_logs(scan_id);
CREATE INDEX idx_burp_traffic_logs_timestamp ON public.burp_traffic_logs(timestamp DESC);
CREATE INDEX idx_burp_scan_logs_scan ON public.burp_scan_logs(scan_id);
CREATE INDEX idx_burp_scan_logs_timestamp ON public.burp_scan_logs(timestamp DESC);
CREATE INDEX idx_burp_oast_scan ON public.burp_oast_interactions(scan_id);
CREATE INDEX idx_burp_oast_interaction_id ON public.burp_oast_interactions(interaction_id);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
ALTER TABLE public.burp_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Project members can view agents" ON public.burp_agents FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "Project members can manage agents" ON public.burp_agents FOR ALL USING (is_project_member(project_id)) WITH CHECK (is_project_member(project_id));

ALTER TABLE public.burp_scan_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Project members can view profiles" ON public.burp_scan_profiles FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "Project members can manage profiles" ON public.burp_scan_profiles FOR ALL USING (is_project_member(project_id)) WITH CHECK (is_project_member(project_id));

ALTER TABLE public.burp_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Project members can view scans" ON public.burp_scans FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "Project members can manage scans" ON public.burp_scans FOR ALL USING (is_project_member(project_id)) WITH CHECK (is_project_member(project_id));

ALTER TABLE public.burp_attack_surface ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Project members can view attack surface" ON public.burp_attack_surface FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "Project members can manage attack surface" ON public.burp_attack_surface FOR ALL USING (is_project_member(project_id)) WITH CHECK (is_project_member(project_id));

ALTER TABLE public.burp_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Project members can view findings" ON public.burp_findings FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "Project members can manage findings" ON public.burp_findings FOR ALL USING (is_project_member(project_id)) WITH CHECK (is_project_member(project_id));

ALTER TABLE public.burp_traffic_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Project members can view traffic logs" ON public.burp_traffic_logs FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "Project members can manage traffic logs" ON public.burp_traffic_logs FOR ALL USING (is_project_member(project_id)) WITH CHECK (is_project_member(project_id));

ALTER TABLE public.burp_scan_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Project members can view scan logs" ON public.burp_scan_logs FOR SELECT USING (EXISTS (SELECT 1 FROM public.burp_scans s WHERE s.id = burp_scan_logs.scan_id AND is_project_member(s.project_id)));
CREATE POLICY "Project members can manage scan logs" ON public.burp_scan_logs FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.burp_scans s WHERE s.id = burp_scan_logs.scan_id AND is_project_member(s.project_id)));

ALTER TABLE public.burp_intruder_attacks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Project members can view intruder attacks" ON public.burp_intruder_attacks FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "Project members can manage intruder attacks" ON public.burp_intruder_attacks FOR ALL USING (is_project_member(project_id)) WITH CHECK (is_project_member(project_id));

ALTER TABLE public.burp_oast_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Project members can view oast interactions" ON public.burp_oast_interactions FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "Project members can manage oast interactions" ON public.burp_oast_interactions FOR ALL USING (is_project_member(project_id)) WITH CHECK (is_project_member(project_id));

ALTER TABLE public.burp_custom_extensions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Project members can view extensions" ON public.burp_custom_extensions FOR SELECT USING (project_id IS NULL OR is_project_member(project_id));
CREATE POLICY "Project members can manage extensions" ON public.burp_custom_extensions FOR ALL USING (project_id IS NULL OR is_project_member(project_id)) WITH CHECK (project_id IS NULL OR is_project_member(project_id));

ALTER TABLE public.burp_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Project members can view reports" ON public.burp_reports FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "Project members can manage reports" ON public.burp_reports FOR ALL USING (is_project_member(project_id)) WITH CHECK (is_project_member(project_id));

ALTER TABLE public.burp_cicd_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Project members can view cicd jobs" ON public.burp_cicd_jobs FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "Project members can manage cicd jobs" ON public.burp_cicd_jobs FOR ALL USING (is_project_member(project_id)) WITH CHECK (is_project_member(project_id));

-- =============================================
-- UPDATE TRIGGERS
-- =============================================
CREATE TRIGGER update_burp_agents_updated_at BEFORE UPDATE ON public.burp_agents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_burp_scan_profiles_updated_at BEFORE UPDATE ON public.burp_scan_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_burp_scans_updated_at BEFORE UPDATE ON public.burp_scans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_burp_attack_surface_updated_at BEFORE UPDATE ON public.burp_attack_surface FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_burp_findings_updated_at BEFORE UPDATE ON public.burp_findings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_burp_intruder_attacks_updated_at BEFORE UPDATE ON public.burp_intruder_attacks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_burp_custom_extensions_updated_at BEFORE UPDATE ON public.burp_custom_extensions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- HELPER FUNCTIONS
-- =============================================
CREATE OR REPLACE FUNCTION public.generate_burp_scan_run_id()
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
            WHEN run_id ~ '^BURP-[0-9]+$'
            THEN CAST(SUBSTRING(run_id FROM 6) AS INTEGER)
            ELSE 0 
        END
    ), 0) + 1 INTO next_num
    FROM burp_scans;
    
    run_id := 'BURP-' || LPAD(next_num::text, 6, '0');
    RETURN run_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_burp_finding_fingerprint()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.fingerprint := md5(
        COALESCE(NEW.issue_type, '') || 
        COALESCE(NEW.host, '') || 
        COALESCE(NEW.path, '') || 
        COALESCE(NEW.http_method, '') ||
        COALESCE(NEW.insertion_point, '')
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER calculate_burp_finding_fingerprint_trigger
    BEFORE INSERT OR UPDATE ON public.burp_findings
    FOR EACH ROW EXECUTE FUNCTION public.calculate_burp_finding_fingerprint();