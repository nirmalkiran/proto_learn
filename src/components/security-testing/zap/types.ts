// OWASP ZAP Agent Integration Types

export type ZapScanMode = 'spider' | 'ajax_spider' | 'active' | 'passive' | 'full';
export type ZapScanStatus = 'pending' | 'spidering' | 'scanning' | 'completed' | 'failed' | 'cancelled' | 'paused';
export type ZapSeverity = 'info' | 'low' | 'medium' | 'high';
export type ZapConfidence = 'confirmed' | 'high' | 'medium' | 'low' | 'user_confirmed' | 'false_positive';

export interface ZapAgent {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  zap_api_url: string;
  zap_api_key_encrypted?: string;
  status: 'online' | 'offline' | 'busy';
  last_heartbeat?: string;
  capabilities: ZapAgentCapabilities;
  version?: string;
  is_daemon_mode: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ZapAgentCapabilities {
  spider: boolean;
  ajax_spider: boolean;
  active_scan: boolean;
  passive_scan: boolean;
  fuzzer: boolean;
  websocket: boolean;
  openapi: boolean;
  graphql: boolean;
  soap: boolean;
}

export interface ZapScanProfile {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  profile_type: 'quick' | 'standard' | 'full' | 'api';
  scan_mode: ZapScanMode;
  spider_enabled: boolean;
  ajax_spider_enabled: boolean;
  active_scan_enabled: boolean;
  passive_scan_enabled: boolean;
  spider_max_depth: number;
  spider_max_children: number;
  spider_max_duration: number;
  ajax_spider_max_duration: number;
  ajax_spider_max_crawl_depth: number;
  handle_cookies: boolean;
  follow_redirects: boolean;
  scan_policy: string;
  attack_strength: 'low' | 'medium' | 'high' | 'insane';
  alert_threshold: 'low' | 'medium' | 'high';
  max_rule_duration_minutes: number;
  thread_per_host: number;
  delay_in_ms: number;
  context_name?: string;
  include_in_scope: string[];
  exclude_from_scope: string[];
  technology_detection: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ZapScan {
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
  status: ZapScanStatus;
  scan_mode: ZapScanMode;
  progress_percentage: number;
  current_phase?: string;
  spider_progress?: number;
  active_scan_progress?: number;
  scheduled_at?: string;
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
  urls_discovered: number;
  requests_made: number;
  alerts_found: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  info_count: number;
  baseline_scan_id?: string;
  new_alerts_count: number;
  resolved_alerts_count: number;
  error_message?: string;
  environment: 'dev' | 'qa' | 'prod';
  triggered_by: 'manual' | 'scheduled' | 'cicd' | 'webhook';
  created_by: string;
  created_at: string;
  updated_at: string;
  // Joined data
  agent?: ZapAgent;
  profile?: ZapScanProfile;
}

export interface ZapAlert {
  id: string;
  project_id: string;
  scan_id: string;
  plugin_id: string;
  alert_ref: string;
  alert_name: string;
  risk: ZapSeverity;
  confidence: ZapConfidence;
  cwe_id?: number;
  wasc_id?: number;
  url: string;
  method?: string;
  param?: string;
  attack?: string;
  evidence?: string;
  description?: string;
  solution?: string;
  reference?: string;
  other_info?: string;
  tags: Record<string, string>;
  source: 'active' | 'passive' | 'spider' | 'fuzzer';
  message_id?: string;
  status: 'new' | 'confirmed' | 'false_positive' | 'accepted_risk' | 'fixed';
  is_false_positive: boolean;
  is_suppressed: boolean;
  suppression_reason?: string;
  assigned_to?: string;
  fingerprint?: string;
  first_seen_scan_id?: string;
  occurrence_count: number;
  created_at: string;
  updated_at: string;
}

export interface ZapContext {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  include_regexes: string[];
  exclude_regexes: string[];
  in_scope: boolean;
  auth_config?: ZapAuthConfig;
  session_management?: ZapSessionConfig;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ZapAuthConfig {
  type: 'form' | 'json' | 'http_basic' | 'script' | 'manual';
  login_url?: string;
  login_request_data?: string;
  username_param?: string;
  password_param?: string;
  logged_in_indicator?: string;
  logged_out_indicator?: string;
}

export interface ZapSessionConfig {
  type: 'cookie' | 'http_auth' | 'script';
}

// Severity color mapping
export const ZAP_SEVERITY_COLORS: Record<ZapSeverity, string> = {
  high: 'bg-red-600 text-white',
  medium: 'bg-orange-500 text-white',
  low: 'bg-yellow-500 text-black',
  info: 'bg-blue-500 text-white',
};

export const ZAP_CONFIDENCE_COLORS: Record<ZapConfidence, string> = {
  confirmed: 'bg-green-600 text-white',
  user_confirmed: 'bg-green-600 text-white',
  high: 'bg-blue-500 text-white',
  medium: 'bg-yellow-500 text-black',
  low: 'bg-gray-400 text-white',
  false_positive: 'bg-gray-500 text-white',
};

export const ZAP_STATUS_COLORS: Record<ZapScanStatus, string> = {
  pending: 'bg-gray-500 text-white',
  spidering: 'bg-blue-500 text-white',
  scanning: 'bg-purple-500 text-white',
  completed: 'bg-green-600 text-white',
  failed: 'bg-red-600 text-white',
  cancelled: 'bg-gray-600 text-white',
  paused: 'bg-yellow-500 text-black',
};

// Default scan profile templates
export const DEFAULT_ZAP_PROFILES: Partial<ZapScanProfile>[] = [
  {
    name: 'Quick Scan - Spider Only',
    description: 'Fast reconnaissance with spider only. No active attacks.',
    profile_type: 'quick',
    scan_mode: 'spider',
    spider_enabled: true,
    ajax_spider_enabled: false,
    active_scan_enabled: false,
    passive_scan_enabled: true,
    spider_max_depth: 5,
    spider_max_children: 10,
    spider_max_duration: 5,
    attack_strength: 'low',
    alert_threshold: 'medium',
    thread_per_host: 2,
  },
  {
    name: 'Standard Scan - Balanced',
    description: 'Balanced scanning with spider and active scan.',
    profile_type: 'standard',
    scan_mode: 'active',
    spider_enabled: true,
    ajax_spider_enabled: true,
    active_scan_enabled: true,
    passive_scan_enabled: true,
    spider_max_depth: 10,
    spider_max_children: 20,
    spider_max_duration: 15,
    ajax_spider_max_duration: 10,
    attack_strength: 'medium',
    alert_threshold: 'medium',
    thread_per_host: 4,
  },
  {
    name: 'Full Scan - Comprehensive',
    description: 'Full scanning with all features enabled.',
    profile_type: 'full',
    scan_mode: 'full',
    spider_enabled: true,
    ajax_spider_enabled: true,
    active_scan_enabled: true,
    passive_scan_enabled: true,
    spider_max_depth: 20,
    spider_max_children: 50,
    spider_max_duration: 30,
    ajax_spider_max_duration: 20,
    attack_strength: 'high',
    alert_threshold: 'low',
    thread_per_host: 8,
    technology_detection: true,
  },
  {
    name: 'API Scan',
    description: 'Optimized for API testing with OpenAPI/GraphQL support.',
    profile_type: 'api',
    scan_mode: 'active',
    spider_enabled: false,
    ajax_spider_enabled: false,
    active_scan_enabled: true,
    passive_scan_enabled: true,
    attack_strength: 'medium',
    alert_threshold: 'medium',
    thread_per_host: 4,
  },
];
