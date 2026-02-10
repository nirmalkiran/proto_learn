export interface SecurityScanConfig {
  id: string;
  project_id: string;
  name: string;
  target_url: string;
  target_urls?: string[]; // Multiple target URLs support
  target_type: 'web' | 'api';
  environment: 'dev' | 'qa' | 'prod';
  auth_type: 'none' | 'basic' | 'token' | 'oauth';
  auth_config: Record<string, unknown>;
  roles: Role[];
  scan_depth: 'low' | 'medium' | 'deep';
  enabled_categories: string[];
  rate_limit_rps: number;
  aggressive_mode: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface Role {
  name: string;
  token?: string;
  description?: string;
}

export interface SecurityScan {
  id: string;
  config_id: string;
  project_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  started_at?: string;
  completed_at?: string;
  scan_mode: 'manual' | 'agent' | 'scheduled';
  discovered_endpoints: string[];
  summary: ScanSummary;
  error_message?: string;
  baseline_scan_id?: string;
  created_at: string;
  created_by?: string;
  security_findings?: SecurityFinding[];
}

export interface ScanSummary {
  total_findings: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  endpoints_scanned: number;
  categories_tested: number;
}

export interface SecurityFinding {
  id: string;
  scan_id: string;
  project_id: string;
  owasp_category: string;
  vulnerability_name: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  affected_endpoint: string;
  http_method?: string;
  payload_used?: string;
  evidence: Record<string, unknown>;
  remediation: string;
  is_false_positive: boolean;
  is_suppressed: boolean;
  suppression_reason?: string;
  created_at: string;
}

export interface ScanLog {
  id: string;
  scan_id: string;
  action: string;
  details: Record<string, unknown>;
  timestamp: string;
}

export const OWASP_CATEGORIES = {
  A01: { name: 'Broken Access Control', description: 'Access control enforces policy such that users cannot act outside of their intended permissions.' },
  A02: { name: 'Cryptographic Failures', description: 'Failures related to cryptography which often leads to sensitive data exposure.' },
  A03: { name: 'Injection', description: 'SQL, NoSQL, OS, and LDAP injection flaws occur when untrusted data is sent to an interpreter.' },
  A04: { name: 'Insecure Design', description: 'Missing or ineffective control design. Focus on secure design patterns and principles.' },
  A05: { name: 'Security Misconfiguration', description: 'Missing security hardening across any part of the application stack.' },
  A06: { name: 'Vulnerable Components', description: 'Using components with known vulnerabilities which may undermine application defenses.' },
  A07: { name: 'Auth Failures', description: 'Identity, authentication, and session management weaknesses.' },
  A08: { name: 'Integrity Failures', description: 'Code and infrastructure that does not protect against integrity violations.' },
  A09: { name: 'Logging Failures', description: 'Insufficient logging, detection, monitoring, and active response.' },
  A10: { name: 'SSRF', description: 'Server-Side Request Forgery flaws occur when a web application fetches a remote resource without validating the user-supplied URL.' },
} as const;

export type OWASPCategoryKey = keyof typeof OWASP_CATEGORIES;

export const SEVERITY_COLORS: Record<SecurityFinding['severity'], string> = {
  critical: 'bg-red-600 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-black',
  low: 'bg-blue-500 text-white',
  info: 'bg-gray-500 text-white',
};

export const SEVERITY_ORDER: SecurityFinding['severity'][] = ['critical', 'high', 'medium', 'low', 'info'];
