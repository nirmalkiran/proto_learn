// Burp Suite Agent Integration Types

export type BurpScanMode = 'passive' | 'active' | 'crawl' | 'audit';
export type BurpScanStatus = 'pending' | 'crawling' | 'scanning' | 'completed' | 'failed' | 'cancelled' | 'paused';
export type BurpSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type BurpConfidence = 'certain' | 'firm' | 'tentative';

export interface BurpAgent {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  burp_api_url: string;
  burp_api_key_encrypted?: string;
  status: 'online' | 'offline' | 'busy';
  last_heartbeat?: string;
  capabilities: BurpAgentCapabilities;
  version?: string;
  license_type: 'professional' | 'enterprise' | 'community';
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface BurpAgentCapabilities {
  scanner: boolean;
  crawler: boolean;
  collaborator: boolean;
  intruder: boolean;
  turboIntruder?: boolean;
  domInvader?: boolean;
}

export interface BurpScanProfile {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  profile_type: 'beginner' | 'standard' | 'enterprise';
  scan_mode: BurpScanMode;
  crawl_enabled: boolean;
  active_scan_enabled: boolean;
  passive_scan_enabled: boolean;
  crawl_depth: number;
  crawl_max_urls: number;
  follow_redirects: boolean;
  handle_javascript: boolean;
  scan_insertion_points: string[];
  scan_categories: string[];
  requests_per_second: number;
  concurrent_requests: number;
  delay_between_requests_ms: number;
  destructive_tests_enabled: boolean;
  oast_enabled: boolean;
  fuzzing_enabled: boolean;
  brute_force_enabled: boolean;
  dom_analysis_enabled: boolean;
  dom_invader_enabled: boolean;
  bchecks: BCheck[];
  match_replace_rules: MatchReplaceRule[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface BCheck {
  id: string;
  name: string;
  code: string;
  enabled: boolean;
}

export interface MatchReplaceRule {
  id: string;
  type: 'request_header' | 'request_body' | 'response_header' | 'response_body';
  match: string;
  replace: string;
  enabled: boolean;
  regex: boolean;
}

export interface BurpScan {
  id: string;
  project_id: string;
  config_id?: string;
  profile_id?: string;
  agent_id?: string;
  name: string;
  run_id: string;
  target_urls: string[];
  scope_includes: string[];
  scope_excludes: string[];
  api_definition_type?: 'openapi' | 'graphql' | 'soap';
  api_definition_content?: string;
  status: BurpScanStatus;
  scan_mode: BurpScanMode;
  progress_percentage: number;
  current_phase?: string;
  scheduled_at?: string;
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
  endpoints_discovered: number;
  requests_made: number;
  issues_found: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  info_count: number;
  baseline_scan_id?: string;
  new_issues_count: number;
  resolved_issues_count: number;
  error_message?: string;
  environment: 'dev' | 'qa' | 'prod';
  triggered_by: 'manual' | 'scheduled' | 'cicd' | 'webhook';
  ci_cd_context?: CICDContext;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Joined data
  agent?: BurpAgent;
  profile?: BurpScanProfile;
}

export interface CICDContext {
  pipeline_id?: string;
  job_id?: string;
  commit_sha?: string;
  branch?: string;
  repository?: string;
}

export interface BurpAttackSurface {
  id: string;
  project_id: string;
  scan_id: string;
  url: string;
  method: string;
  path: string;
  host: string;
  port: number;
  protocol: string;
  query_params: Parameter[];
  body_params: Parameter[];
  path_params: Parameter[];
  headers: Parameter[];
  cookies: Parameter[];
  content_type?: string;
  response_type?: string;
  response_length?: number;
  discovery_source: 'crawl' | 'openapi' | 'graphql' | 'manual';
  api_operation_id?: string;
  requires_auth: boolean;
  auth_type?: string;
  has_file_upload: boolean;
  has_json_input: boolean;
  has_xml_input: boolean;
  accepts_user_input: boolean;
  is_active: boolean;
  last_tested_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Parameter {
  name: string;
  value?: string;
  type?: string;
  required?: boolean;
}

export interface BurpFinding {
  id: string;
  project_id: string;
  scan_id: string;
  surface_id?: string;
  issue_type: string;
  issue_name: string;
  severity: BurpSeverity;
  confidence: BurpConfidence;
  owasp_category?: string;
  cwe_id?: number;
  host: string;
  path: string;
  url: string;
  http_method?: string;
  request_base64?: string;
  response_base64?: string;
  payload_used?: string;
  insertion_point?: string;
  path_to_issue: PathToIssueStep[];
  issue_detail?: string;
  issue_background?: string;
  remediation_detail?: string;
  remediation_background?: string;
  reference_urls: string[];
  oast_interaction_id?: string;
  oast_data?: OASTData;
  is_dom_based: boolean;
  source_sink_info?: SourceSinkInfo;
  status: 'new' | 'confirmed' | 'false_positive' | 'accepted_risk' | 'fixed';
  is_false_positive: boolean;
  is_suppressed: boolean;
  suppression_reason?: string;
  assigned_to?: string;
  fingerprint?: string;
  first_seen_scan_id?: string;
  occurrence_count: number;
  ai_analysis?: AIAnalysis;
  ai_confidence_score?: number;
  created_at: string;
  updated_at: string;
}

export interface PathToIssueStep {
  step_number: number;
  action: string;
  url?: string;
  method?: string;
  description: string;
}

export interface OASTData {
  interaction_type: 'dns' | 'http' | 'smtp';
  timestamp: string;
  client_ip?: string;
  details?: Record<string, unknown>;
}

export interface SourceSinkInfo {
  source: string;
  sink: string;
  taint_flow: string[];
}

export interface AIAnalysis {
  summary: string;
  exploitability: 'trivial' | 'easy' | 'moderate' | 'difficult';
  impact: string;
  false_positive_likelihood: number;
  recommended_action: string;
}

export interface BurpTrafficLog {
  id: string;
  project_id: string;
  scan_id?: string;
  request_id: string;
  timestamp: string;
  url: string;
  method: string;
  host: string;
  path: string;
  port?: number;
  protocol?: string;
  request_headers?: Record<string, string>;
  request_body_base64?: string;
  request_content_type?: string;
  response_status?: number;
  response_headers?: Record<string, string>;
  response_body_base64?: string;
  response_content_type?: string;
  response_length?: number;
  time_to_first_byte_ms?: number;
  total_time_ms?: number;
  was_modified: boolean;
  modification_notes?: string;
  tags: string[];
  annotations?: string;
  is_websocket: boolean;
  websocket_messages?: WebSocketMessage[];
  http_version: string;
  created_at: string;
}

export interface WebSocketMessage {
  direction: 'incoming' | 'outgoing';
  timestamp: string;
  data: string;
  opcode: number;
}

export interface BurpIntruderAttack {
  id: string;
  project_id: string;
  scan_id?: string;
  name: string;
  attack_type: 'sniper' | 'battering_ram' | 'pitchfork' | 'cluster_bomb';
  target_url: string;
  base_request_base64: string;
  payload_positions: PayloadPosition[];
  payload_sets: PayloadSet[];
  requests_per_second: number;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'cancelled';
  started_at?: string;
  completed_at?: string;
  requests_made: number;
  interesting_responses: IntruderResponse[];
  requires_approval: boolean;
  approved_by?: string;
  approved_at?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PayloadPosition {
  id: string;
  start: number;
  end: number;
  original_value: string;
}

export interface PayloadSet {
  id: string;
  name: string;
  type: 'simple_list' | 'runtime_file' | 'custom' | 'brute_forcer';
  payloads: string[];
  encoding?: string;
}

export interface IntruderResponse {
  payload: string;
  status_code: number;
  length: number;
  response_time_ms: number;
  error?: string;
  interesting_markers: string[];
}

export interface BurpOASTInteraction {
  id: string;
  project_id: string;
  scan_id?: string;
  finding_id?: string;
  interaction_id: string;
  interaction_type: 'dns' | 'http' | 'smtp';
  client_ip?: string;
  timestamp: string;
  dns_query_type?: string;
  dns_query?: string;
  http_request_base64?: string;
  http_response_base64?: string;
  smtp_conversation?: string;
  payload_id?: string;
  correlated_at?: string;
  created_at: string;
}

export interface BurpCustomExtension {
  id: string;
  project_id?: string;
  name: string;
  extension_type: 'bcheck' | 'bambda' | 'bapp';
  description?: string;
  code_content?: string;
  bapp_id?: string;
  bapp_version?: string;
  is_enabled: boolean;
  is_approved: boolean;
  approved_by?: string;
  version: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface BurpReport {
  id: string;
  project_id: string;
  scan_id: string;
  name: string;
  format: 'html' | 'json' | 'sarif' | 'xml';
  report_content?: string;
  report_storage_path?: string;
  include_request_response: boolean;
  include_remediation: boolean;
  severity_filter: BurpSeverity[];
  owasp_mapping?: OWASPMapping;
  generated_pocs: GeneratedPOC[];
  created_by: string;
  created_at: string;
}

export interface OWASPMapping {
  [category: string]: {
    count: number;
    findings: string[];
  };
}

export interface GeneratedPOC {
  finding_id: string;
  poc_type: 'csrf' | 'xss' | 'sqli' | 'ssrf' | 'other';
  code: string;
  language: 'html' | 'javascript' | 'python' | 'curl';
}

export interface BurpCICDJob {
  id: string;
  project_id: string;
  scan_id?: string;
  pipeline_id?: string;
  job_id?: string;
  commit_sha?: string;
  branch?: string;
  profile_id?: string;
  timeout_minutes: number;
  fail_on_severity: BurpSeverity;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'timeout';
  exit_code?: number;
  scan_summary?: ScanSummary;
  baseline_comparison?: BaselineComparison;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

export interface ScanSummary {
  total_issues: number;
  by_severity: Record<BurpSeverity, number>;
  by_confidence: Record<BurpConfidence, number>;
  endpoints_scanned: number;
  requests_made: number;
  duration_ms: number;
}

export interface BaselineComparison {
  baseline_scan_id: string;
  new_issues: number;
  resolved_issues: number;
  unchanged_issues: number;
  new_issue_ids: string[];
  resolved_issue_ids: string[];
}

// Severity color mapping
export const BURP_SEVERITY_COLORS: Record<BurpSeverity, string> = {
  critical: 'bg-red-600 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-black',
  low: 'bg-blue-500 text-white',
  info: 'bg-gray-500 text-white',
};

export const BURP_CONFIDENCE_COLORS: Record<BurpConfidence, string> = {
  certain: 'bg-green-600 text-white',
  firm: 'bg-yellow-500 text-black',
  tentative: 'bg-gray-400 text-white',
};

export const BURP_STATUS_COLORS: Record<BurpScanStatus, string> = {
  pending: 'bg-gray-500 text-white',
  crawling: 'bg-blue-500 text-white',
  scanning: 'bg-purple-500 text-white',
  completed: 'bg-green-600 text-white',
  failed: 'bg-red-600 text-white',
  cancelled: 'bg-gray-600 text-white',
  paused: 'bg-yellow-500 text-black',
};

// Default scan profile templates
export const DEFAULT_SCAN_PROFILES: Partial<BurpScanProfile>[] = [
  {
    name: 'Beginner - Passive Only',
    description: 'Safe passive scanning with no active attacks. Ideal for initial reconnaissance.',
    profile_type: 'beginner',
    scan_mode: 'passive',
    crawl_enabled: true,
    active_scan_enabled: false,
    passive_scan_enabled: true,
    crawl_depth: 3,
    crawl_max_urls: 500,
    requests_per_second: 5,
    destructive_tests_enabled: false,
    oast_enabled: false,
    fuzzing_enabled: false,
    brute_force_enabled: false,
  },
  {
    name: 'Standard - Balanced Scan',
    description: 'Balanced scanning with passive analysis and targeted active tests.',
    profile_type: 'standard',
    scan_mode: 'active',
    crawl_enabled: true,
    active_scan_enabled: true,
    passive_scan_enabled: true,
    crawl_depth: 5,
    crawl_max_urls: 1000,
    requests_per_second: 10,
    destructive_tests_enabled: false,
    oast_enabled: true,
    fuzzing_enabled: false,
    brute_force_enabled: false,
  },
  {
    name: 'Enterprise - Comprehensive',
    description: 'Full-featured scanning including OAST, fuzzing, and advanced attacks.',
    profile_type: 'enterprise',
    scan_mode: 'audit',
    crawl_enabled: true,
    active_scan_enabled: true,
    passive_scan_enabled: true,
    crawl_depth: 10,
    crawl_max_urls: 5000,
    requests_per_second: 20,
    destructive_tests_enabled: false,
    oast_enabled: true,
    fuzzing_enabled: true,
    brute_force_enabled: false,
    dom_analysis_enabled: true,
    dom_invader_enabled: true,
  },
];
