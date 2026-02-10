import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// OWASP Top 10 Categories
const OWASP_CATEGORIES = {
  A01: 'Broken Access Control',
  A02: 'Cryptographic Failures',
  A03: 'Injection',
  A04: 'Insecure Design',
  A05: 'Security Misconfiguration',
  A06: 'Vulnerable Components',
  A07: 'Auth Failures',
  A08: 'Integrity Failures',
  A09: 'Logging Failures',
  A10: 'SSRF',
};

// Safe injection payloads (non-destructive)
const SAFE_PAYLOADS = {
  sql: [
    "' OR '1'='1",
    "1' AND '1'='1",
    "1; SELECT 1--",
    "' UNION SELECT NULL--",
    "1' ORDER BY 1--",
  ],
  xss: [
    "<script>alert(1)</script>",
    "javascript:alert(1)",
    "<img src=x onerror=alert(1)>",
    "'><script>alert(1)</script>",
    "<svg onload=alert(1)>",
  ],
  command: [
    "; echo test",
    "| echo test",
    "$(echo test)",
    "`echo test`",
  ],
  path: [
    "../../../etc/passwd",
    "....//....//....//etc/passwd",
    "%2e%2e%2f%2e%2e%2f",
  ],
  ssrf: [
    "http://localhost:80",
    "http://127.0.0.1",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]",
  ],
};

// Security headers to check
const SECURITY_HEADERS = [
  { header: 'Strict-Transport-Security', severity: 'high', category: 'A02' },
  { header: 'X-Content-Type-Options', severity: 'medium', category: 'A05' },
  { header: 'X-Frame-Options', severity: 'medium', category: 'A05' },
  { header: 'X-XSS-Protection', severity: 'low', category: 'A05' },
  { header: 'Content-Security-Policy', severity: 'high', category: 'A05' },
  { header: 'Referrer-Policy', severity: 'low', category: 'A05' },
  { header: 'Permissions-Policy', severity: 'low', category: 'A05' },
];

// Common admin/sensitive paths
const SENSITIVE_PATHS = [
  '/admin', '/administrator', '/wp-admin', '/phpmyadmin',
  '/.git', '/.env', '/config', '/backup',
  '/api/debug', '/debug', '/test', '/swagger',
  '/.htaccess', '/server-status', '/info.php',
];

interface ScanConfig {
  id: string;
  target_url: string;
  target_urls?: string[]; // Additional target URLs
  target_type: 'web' | 'api';
  auth_type: string;
  auth_config: Record<string, unknown>;
  roles: Array<{ name: string; token?: string }>;
  scan_depth: 'low' | 'medium' | 'deep';
  enabled_categories: string[];
  rate_limit_rps: number;
  aggressive_mode: boolean;
}

interface Finding {
  owasp_category: string;
  vulnerability_name: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  affected_endpoint: string;
  http_method?: string;
  payload_used?: string;
  evidence: Record<string, unknown>;
  remediation: string;
}

// Rate limiter
class RateLimiter {
  private lastRequest = 0;
  private minInterval: number;

  constructor(rps: number) {
    this.minInterval = 1000 / rps;
  }

  async wait() {
    const now = Date.now();
    const elapsed = now - this.lastRequest;
    if (elapsed < this.minInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minInterval - elapsed));
    }
    this.lastRequest = Date.now();
  }
}

// Logger for audit trail
async function logAction(
  supabase: ReturnType<typeof createClient>,
  scanId: string,
  action: string,
  details: Record<string, unknown>
) {
  await supabase.from('security_scan_logs').insert({
    scan_id: scanId,
    action,
    details,
    timestamp: new Date().toISOString(),
  });
}

// Fetch with timeout
async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<Response> {
  const { timeout = 10000, ...fetchOptions } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

// Get auth headers based on config
function getAuthHeaders(config: ScanConfig, role?: { name: string; token?: string }): Record<string, string> {
  const headers: Record<string, string> = {};
  
  if (config.auth_type === 'none') return headers;
  
  if (config.auth_type === 'basic' && config.auth_config.username && config.auth_config.password) {
    const creds = btoa(`${config.auth_config.username}:${config.auth_config.password}`);
    headers['Authorization'] = `Basic ${creds}`;
  } else if (config.auth_type === 'token') {
    const token = role?.token || config.auth_config.token as string;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }
  
  return headers;
}

// A01: Broken Access Control Tests
async function testBrokenAccessControl(
  config: ScanConfig,
  rateLimiter: RateLimiter,
  endpoints: string[]
): Promise<Finding[]> {
  const findings: Finding[] = [];
  
  if (config.roles.length < 2) {
    return findings; // Need at least 2 roles for access control testing
  }

  for (const endpoint of endpoints) {
    for (let i = 0; i < config.roles.length; i++) {
      for (let j = i + 1; j < config.roles.length; j++) {
        await rateLimiter.wait();
        
        const role1 = config.roles[i];
        const role2 = config.roles[j];
        
        try {
          // Test if lower privilege role can access higher privilege endpoints
          const headers1 = getAuthHeaders(config, role1);
          const headers2 = getAuthHeaders(config, role2);
          
          const response1 = await fetchWithTimeout(`${config.target_url}${endpoint}`, { headers: headers1 });
          await rateLimiter.wait();
          const response2 = await fetchWithTimeout(`${config.target_url}${endpoint}`, { headers: headers2 });
          
          // If both succeed when one should fail, it's a potential IDOR/access control issue
          if (response1.ok && response2.ok) {
            findings.push({
              owasp_category: 'A01',
              vulnerability_name: 'Potential Horizontal Privilege Escalation',
              severity: 'high',
              confidence: 60,
              affected_endpoint: endpoint,
              http_method: 'GET',
              evidence: {
                role1: role1.name,
                role2: role2.name,
                status1: response1.status,
                status2: response2.status,
              },
              remediation: 'Implement proper authorization checks to ensure users can only access their own resources.',
            });
          }
        } catch (error) {
          // Network errors are expected for some tests
        }
      }
    }
  }
  
  return findings;
}

// A02: Cryptographic Failures Tests
async function testCryptographicFailures(
  config: ScanConfig,
  rateLimiter: RateLimiter
): Promise<Finding[]> {
  const findings: Finding[] = [];
  
  await rateLimiter.wait();
  
  try {
    // Check HTTPS
    const url = new URL(config.target_url);
    if (url.protocol !== 'https:') {
      findings.push({
        owasp_category: 'A02',
        vulnerability_name: 'Missing HTTPS',
        severity: 'high',
        confidence: 100,
        affected_endpoint: '/',
        evidence: { protocol: url.protocol },
        remediation: 'Enable HTTPS with a valid TLS certificate.',
      });
    }
    
    // Check security headers
    const response = await fetchWithTimeout(config.target_url);
    
    for (const { header, severity, category } of SECURITY_HEADERS) {
      if (!response.headers.get(header)) {
        findings.push({
          owasp_category: category,
          vulnerability_name: `Missing ${header} Header`,
          severity: severity as Finding['severity'],
          confidence: 95,
          affected_endpoint: '/',
          evidence: { missing_header: header },
          remediation: `Add the ${header} header to HTTP responses.`,
        });
      }
    }
    
    // Check for sensitive data in response
    const text = await response.text();
    const sensitivePatterns = [
      { pattern: /password['"]\s*:\s*['"][^'"]+['"]/gi, name: 'Password in response' },
      { pattern: /api[_-]?key['"]\s*:\s*['"][^'"]+['"]/gi, name: 'API key in response' },
      { pattern: /secret['"]\s*:\s*['"][^'"]+['"]/gi, name: 'Secret in response' },
    ];
    
    for (const { pattern, name } of sensitivePatterns) {
      if (pattern.test(text)) {
        findings.push({
          owasp_category: 'A02',
          vulnerability_name: name,
          severity: 'high',
          confidence: 70,
          affected_endpoint: '/',
          evidence: { pattern: pattern.toString() },
          remediation: 'Remove sensitive data from responses or use proper encryption.',
        });
      }
    }
  } catch (error) {
    // Connection errors
  }
  
  return findings;
}

// A03: Injection Tests
async function testInjection(
  config: ScanConfig,
  rateLimiter: RateLimiter,
  endpoints: string[]
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const headers = getAuthHeaders(config);
  
  for (const endpoint of endpoints) {
    // SQL Injection tests
    for (const payload of SAFE_PAYLOADS.sql) {
      if (!config.aggressive_mode && SAFE_PAYLOADS.sql.indexOf(payload) > 2) continue;
      
      await rateLimiter.wait();
      
      try {
        const testUrl = `${config.target_url}${endpoint}?id=${encodeURIComponent(payload)}`;
        const response = await fetchWithTimeout(testUrl, { headers });
        const text = await response.text();
        
        // Check for SQL error patterns
        const sqlErrors = [
          /sql syntax/i, /mysql_/i, /sqlite_/i, /postgresql/i,
          /ORA-\d{5}/i, /SQL Server/i, /unclosed quotation/i,
        ];
        
        for (const pattern of sqlErrors) {
          if (pattern.test(text)) {
            findings.push({
              owasp_category: 'A03',
              vulnerability_name: 'SQL Injection',
              severity: 'critical',
              confidence: 85,
              affected_endpoint: endpoint,
              http_method: 'GET',
              payload_used: payload,
              evidence: { matched_pattern: pattern.toString() },
              remediation: 'Use parameterized queries or prepared statements.',
            });
            break;
          }
        }
      } catch (error) {
        // Expected for some tests
      }
    }
    
    // XSS tests
    for (const payload of SAFE_PAYLOADS.xss.slice(0, config.scan_depth === 'deep' ? undefined : 2)) {
      await rateLimiter.wait();
      
      try {
        const testUrl = `${config.target_url}${endpoint}?q=${encodeURIComponent(payload)}`;
        const response = await fetchWithTimeout(testUrl, { headers });
        const text = await response.text();
        
        if (text.includes(payload)) {
          findings.push({
            owasp_category: 'A03',
            vulnerability_name: 'Reflected XSS',
            severity: 'high',
            confidence: 80,
            affected_endpoint: endpoint,
            http_method: 'GET',
            payload_used: payload,
            evidence: { payload_reflected: true },
            remediation: 'Sanitize and encode all user input before rendering.',
          });
          break;
        }
      } catch (error) {
        // Expected
      }
    }
  }
  
  return findings;
}

// A05: Security Misconfiguration Tests
async function testSecurityMisconfiguration(
  config: ScanConfig,
  rateLimiter: RateLimiter
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const headers = getAuthHeaders(config);
  
  // Check sensitive paths
  for (const path of SENSITIVE_PATHS) {
    await rateLimiter.wait();
    
    try {
      const response = await fetchWithTimeout(`${config.target_url}${path}`, { headers });
      
      if (response.ok) {
        findings.push({
          owasp_category: 'A05',
          vulnerability_name: 'Exposed Sensitive Path',
          severity: path.includes('admin') ? 'high' : 'medium',
          confidence: 75,
          affected_endpoint: path,
          http_method: 'GET',
          evidence: { status: response.status },
          remediation: 'Restrict access to sensitive paths or remove them from production.',
        });
      }
    } catch (error) {
      // Expected
    }
  }
  
  // Check HTTP methods
  const dangerousMethods = ['TRACE', 'OPTIONS', 'PUT', 'DELETE'];
  for (const method of dangerousMethods) {
    await rateLimiter.wait();
    
    try {
      const response = await fetchWithTimeout(config.target_url, { method, headers });
      
      if (response.ok && method === 'TRACE') {
        findings.push({
          owasp_category: 'A05',
          vulnerability_name: 'HTTP TRACE Method Enabled',
          severity: 'medium',
          confidence: 90,
          affected_endpoint: '/',
          http_method: 'TRACE',
          evidence: { status: response.status },
          remediation: 'Disable TRACE method on the web server.',
        });
      }
    } catch (error) {
      // Expected
    }
  }
  
  return findings;
}

// A07: Authentication Failures Tests
async function testAuthFailures(
  config: ScanConfig,
  rateLimiter: RateLimiter
): Promise<Finding[]> {
  const findings: Finding[] = [];
  
  // Test for rate limiting on auth endpoints
  const authPaths = ['/login', '/auth', '/api/auth', '/api/login'];
  
  for (const path of authPaths) {
    const attempts: number[] = [];
    
    for (let i = 0; i < 5; i++) {
      await rateLimiter.wait();
      
      try {
        const start = Date.now();
        const response = await fetchWithTimeout(`${config.target_url}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'test', password: 'test' }),
        });
        attempts.push(Date.now() - start);
        
        if (i === 4 && response.status !== 429) {
          findings.push({
            owasp_category: 'A07',
            vulnerability_name: 'Missing Rate Limiting on Auth',
            severity: 'high',
            confidence: 70,
            affected_endpoint: path,
            http_method: 'POST',
            evidence: { attempts: 5, no_429: true },
            remediation: 'Implement rate limiting on authentication endpoints.',
          });
        }
      } catch (error) {
        break; // Endpoint doesn't exist
      }
    }
  }
  
  return findings;
}

// A04: Insecure Design Tests
async function testInsecureDesign(
  config: ScanConfig,
  rateLimiter: RateLimiter,
  endpoints: string[]
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const headers = getAuthHeaders(config);
  
  // Check for predictable resource IDs (IDOR patterns)
  const idPatterns = [
    { pattern: /\/users\/(\d+)/, name: 'Numeric User ID' },
    { pattern: /\/orders\/(\d+)/, name: 'Numeric Order ID' },
    { pattern: /\/files\/(\d+)/, name: 'Numeric File ID' },
    { pattern: /\/documents\/(\d+)/, name: 'Numeric Document ID' },
  ];
  
  for (const endpoint of endpoints) {
    for (const { pattern, name } of idPatterns) {
      if (pattern.test(endpoint)) {
        await rateLimiter.wait();
        
        try {
          // Try incrementing/decrementing ID to test for IDOR
          const match = endpoint.match(pattern);
          if (match) {
            const id = parseInt(match[1]);
            const testIds = [id - 1, id + 1, id + 100];
            
            for (const testId of testIds) {
              if (testId <= 0) continue;
              
              const testEndpoint = endpoint.replace(pattern, endpoint.match(pattern)![0].replace(match[1], testId.toString()));
              const response = await fetchWithTimeout(`${config.target_url}${testEndpoint}`, { headers });
              
              if (response.ok) {
                findings.push({
                  owasp_category: 'A04',
                  vulnerability_name: 'Predictable Resource ID (Potential IDOR)',
                  severity: 'high',
                  confidence: 55,
                  affected_endpoint: endpoint,
                  http_method: 'GET',
                  evidence: { 
                    pattern: name, 
                    original_id: id, 
                    tested_id: testId,
                    accessible: true 
                  },
                  remediation: 'Use UUIDs or unpredictable identifiers for resources. Implement proper authorization checks.',
                });
                break;
              }
            }
          }
        } catch (error) {
          // Expected for some tests
        }
      }
    }
  }
  
  // Check for missing CSRF protection
  await rateLimiter.wait();
  try {
    const response = await fetchWithTimeout(config.target_url, { headers });
    const text = await response.text();
    
    // Check for forms without CSRF tokens
    const formRegex = /<form[^>]*method=["']post["'][^>]*>/gi;
    const csrfTokenRegex = /csrf|_token|authenticity_token/i;
    
    if (formRegex.test(text) && !csrfTokenRegex.test(text)) {
      findings.push({
        owasp_category: 'A04',
        vulnerability_name: 'Missing CSRF Protection',
        severity: 'medium',
        confidence: 60,
        affected_endpoint: '/',
        http_method: 'GET',
        evidence: { forms_without_csrf: true },
        remediation: 'Implement CSRF tokens for all state-changing operations.',
      });
    }
  } catch (error) {
    // Expected
  }
  
  // Check for lack of rate limiting on sensitive operations
  const sensitiveEndpoints = ['/register', '/signup', '/password-reset', '/forgot-password'];
  for (const sensitiveEndpoint of sensitiveEndpoints) {
    await rateLimiter.wait();
    try {
      const response = await fetchWithTimeout(`${config.target_url}${sensitiveEndpoint}`, { 
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@test.com' }),
      });
      
      if (response.ok || response.status === 400) {
        // Endpoint exists - check for rate limiting header
        if (!response.headers.get('X-RateLimit-Limit') && !response.headers.get('RateLimit-Limit')) {
          findings.push({
            owasp_category: 'A04',
            vulnerability_name: 'Missing Rate Limiting on Sensitive Endpoint',
            severity: 'medium',
            confidence: 50,
            affected_endpoint: sensitiveEndpoint,
            http_method: 'POST',
            evidence: { no_rate_limit_header: true },
            remediation: 'Implement rate limiting on sensitive operations to prevent abuse.',
          });
        }
      }
    } catch (error) {
      // Endpoint doesn't exist
    }
  }
  
  return findings;
}

// A06: Vulnerable and Outdated Components Tests
async function testVulnerableComponents(
  config: ScanConfig,
  rateLimiter: RateLimiter
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const headers = getAuthHeaders(config);
  
  await rateLimiter.wait();
  
  try {
    const response = await fetchWithTimeout(config.target_url, { headers });
    const responseHeaders = Object.fromEntries(response.headers.entries());
    const text = await response.text();
    
    // Check server headers for version disclosure
    const versionHeaders = ['Server', 'X-Powered-By', 'X-AspNet-Version', 'X-AspNetMvc-Version'];
    for (const headerName of versionHeaders) {
      const headerValue = response.headers.get(headerName);
      if (headerValue) {
        // Check for known vulnerable version patterns
        const versionMatch = headerValue.match(/(\d+\.?\d*\.?\d*)/);
        if (versionMatch) {
          findings.push({
            owasp_category: 'A06',
            vulnerability_name: 'Server Version Disclosure',
            severity: 'low',
            confidence: 90,
            affected_endpoint: '/',
            evidence: { header: headerName, value: headerValue },
            remediation: `Remove or obscure the ${headerName} header to prevent version disclosure.`,
          });
        }
      }
    }
    
    // Check for known vulnerable JavaScript libraries in HTML
    const vulnerableLibPatterns = [
      { pattern: /jquery[.-]1\.[0-9]/i, name: 'jQuery 1.x', severity: 'medium' as const },
      { pattern: /jquery[.-]2\.[0-2]/i, name: 'jQuery 2.0-2.2', severity: 'low' as const },
      { pattern: /angular[.-]1\.[0-5]/i, name: 'AngularJS 1.0-1.5', severity: 'high' as const },
      { pattern: /bootstrap[.-][23]\./i, name: 'Bootstrap 2.x/3.x', severity: 'low' as const },
      { pattern: /moment[.-][12]\./i, name: 'Moment.js (deprecated)', severity: 'info' as const },
      { pattern: /lodash[.-][34]\./i, name: 'Lodash 3.x/4.x (check CVEs)', severity: 'low' as const },
    ];
    
    for (const { pattern, name, severity } of vulnerableLibPatterns) {
      if (pattern.test(text)) {
        findings.push({
          owasp_category: 'A06',
          vulnerability_name: `Potentially Outdated Library: ${name}`,
          severity,
          confidence: 70,
          affected_endpoint: '/',
          evidence: { library: name, pattern: pattern.toString() },
          remediation: `Update ${name} to the latest secure version.`,
        });
      }
    }
    
    // Check for WordPress/CMS version disclosure
    const cmsPatterns = [
      { pattern: /wp-content|wp-includes/i, cms: 'WordPress' },
      { pattern: /drupal\.js|Drupal\.settings/i, cms: 'Drupal' },
      { pattern: /joomla!/i, cms: 'Joomla' },
    ];
    
    for (const { pattern, cms } of cmsPatterns) {
      if (pattern.test(text)) {
        // Look for version meta tags
        const versionMeta = text.match(/<meta[^>]*generator[^>]*content=["']([^"']+)["']/i);
        findings.push({
          owasp_category: 'A06',
          vulnerability_name: `${cms} Detected`,
          severity: versionMeta ? 'medium' : 'info',
          confidence: 85,
          affected_endpoint: '/',
          evidence: { cms, version_disclosed: !!versionMeta, version: versionMeta?.[1] },
          remediation: `Keep ${cms} and all plugins/themes updated. Remove version disclosure from meta tags.`,
        });
      }
    }
    
  } catch (error) {
    console.error('Vulnerable components test error:', error);
  }
  
  return findings;
}

// A08: Software and Data Integrity Failures Tests
async function testIntegrityFailures(
  config: ScanConfig,
  rateLimiter: RateLimiter
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const headers = getAuthHeaders(config);
  
  await rateLimiter.wait();
  
  try {
    const response = await fetchWithTimeout(config.target_url, { headers });
    const text = await response.text();
    
    // Check for scripts loaded without integrity attributes (SRI)
    const scriptTags = text.matchAll(/<script[^>]*src=["']([^"']+)["'][^>]*>/gi);
    let scriptsWithoutSRI = 0;
    const externalScripts: string[] = [];
    
    for (const match of scriptTags) {
      const fullTag = match[0];
      const src = match[1];
      
      // Check if it's an external script (CDN)
      if (src.startsWith('http') || src.startsWith('//')) {
        externalScripts.push(src);
        if (!fullTag.includes('integrity=')) {
          scriptsWithoutSRI++;
        }
      }
    }
    
    if (scriptsWithoutSRI > 0) {
      findings.push({
        owasp_category: 'A08',
        vulnerability_name: 'External Scripts Without Subresource Integrity',
        severity: 'medium',
        confidence: 95,
        affected_endpoint: '/',
        evidence: { 
          scripts_without_sri: scriptsWithoutSRI,
          total_external_scripts: externalScripts.length,
          examples: externalScripts.slice(0, 3)
        },
        remediation: 'Add integrity and crossorigin attributes to all external script tags for Subresource Integrity (SRI).',
      });
    }
    
    // Check for stylesheets without SRI
    const linkTags = text.matchAll(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']stylesheet["'][^>]*>/gi);
    let stylesWithoutSRI = 0;
    
    for (const match of linkTags) {
      const fullTag = match[0];
      const href = match[1];
      
      if (href.startsWith('http') || href.startsWith('//')) {
        if (!fullTag.includes('integrity=')) {
          stylesWithoutSRI++;
        }
      }
    }
    
    if (stylesWithoutSRI > 0) {
      findings.push({
        owasp_category: 'A08',
        vulnerability_name: 'External Stylesheets Without Subresource Integrity',
        severity: 'low',
        confidence: 95,
        affected_endpoint: '/',
        evidence: { stylesheets_without_sri: stylesWithoutSRI },
        remediation: 'Add integrity attributes to external stylesheet links.',
      });
    }
    
    // Check for insecure deserialization patterns (JSON parsing hints)
    const deserializationPatterns = [
      { pattern: /eval\s*\([^)]*\)/gi, name: 'eval() usage', severity: 'high' as const },
      { pattern: /Function\s*\([^)]*\)/gi, name: 'Function constructor', severity: 'high' as const },
      { pattern: /innerHTML\s*=/gi, name: 'innerHTML assignment', severity: 'medium' as const },
      { pattern: /document\.write/gi, name: 'document.write usage', severity: 'medium' as const },
    ];
    
    for (const { pattern, name, severity } of deserializationPatterns) {
      if (pattern.test(text)) {
        findings.push({
          owasp_category: 'A08',
          vulnerability_name: `Potential Unsafe Code Pattern: ${name}`,
          severity,
          confidence: 40,
          affected_endpoint: '/',
          evidence: { pattern: name },
          remediation: `Review and avoid ${name} as it can lead to code injection vulnerabilities.`,
        });
      }
    }
    
  } catch (error) {
    console.error('Integrity failures test error:', error);
  }
  
  // Check for unsigned cookies
  await rateLimiter.wait();
  try {
    const response = await fetchWithTimeout(config.target_url, { headers });
    const setCookieHeaders = response.headers.getSetCookie?.() || [];
    
    for (const cookie of setCookieHeaders) {
      const hasSecure = cookie.toLowerCase().includes('secure');
      const hasHttpOnly = cookie.toLowerCase().includes('httponly');
      const hasSameSite = cookie.toLowerCase().includes('samesite');
      
      if (!hasSecure || !hasHttpOnly) {
        findings.push({
          owasp_category: 'A08',
          vulnerability_name: 'Insecure Cookie Configuration',
          severity: 'medium',
          confidence: 90,
          affected_endpoint: '/',
          evidence: { 
            secure: hasSecure, 
            httpOnly: hasHttpOnly, 
            sameSite: hasSameSite,
            cookie: cookie.split('=')[0]
          },
          remediation: 'Set Secure, HttpOnly, and SameSite attributes on all cookies.',
        });
      }
    }
  } catch (error) {
    // Expected
  }
  
  return findings;
}

// A09: Security Logging and Monitoring Failures Tests
async function testLoggingFailures(
  config: ScanConfig,
  rateLimiter: RateLimiter
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const headers = getAuthHeaders(config);
  
  // Test for verbose error messages (information disclosure)
  const errorTriggers = [
    { path: '/api/undefined', method: 'GET' },
    { path: '/api/null', method: 'GET' },
    { path: '/', method: 'POST', body: '{"invalid": json}' },
    { path: '/api', method: 'DELETE' },
  ];
  
  for (const trigger of errorTriggers) {
    await rateLimiter.wait();
    
    try {
      const response = await fetchWithTimeout(`${config.target_url}${trigger.path}`, {
        method: trigger.method,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: trigger.body,
      });
      
      const text = await response.text();
      
      // Check for stack traces in error responses
      const stackTracePatterns = [
        /at\s+\w+\s+\([^)]+:\d+:\d+\)/i, // JavaScript stack trace
        /File\s+"[^"]+",\s+line\s+\d+/i, // Python traceback
        /\.java:\d+\)/i, // Java stack trace
        /\.php:\d+/i, // PHP error
        /\.rb:\d+:in/i, // Ruby traceback
        /Traceback \(most recent call last\)/i, // Python
        /Exception in thread/i, // Java
      ];
      
      for (const pattern of stackTracePatterns) {
        if (pattern.test(text)) {
          findings.push({
            owasp_category: 'A09',
            vulnerability_name: 'Stack Trace Exposure',
            severity: 'medium',
            confidence: 85,
            affected_endpoint: trigger.path,
            http_method: trigger.method,
            evidence: { pattern: pattern.toString(), status: response.status },
            remediation: 'Configure error handling to show generic error messages in production. Log detailed errors server-side only.',
          });
          break;
        }
      }
      
      // Check for database error exposure
      const dbErrorPatterns = [
        /mysql|postgresql|sqlite|mongodb|oracle/i,
        /SQL syntax|query error|database error/i,
        /SQLSTATE\[/i,
        /pg_query|mysql_query|mysqli/i,
      ];
      
      for (const pattern of dbErrorPatterns) {
        if (pattern.test(text)) {
          findings.push({
            owasp_category: 'A09',
            vulnerability_name: 'Database Error Information Disclosure',
            severity: 'high',
            confidence: 80,
            affected_endpoint: trigger.path,
            http_method: trigger.method,
            evidence: { pattern: pattern.toString() },
            remediation: 'Never expose database error details to users. Use generic error messages.',
          });
          break;
        }
      }
    } catch (error) {
      // Expected for invalid requests
    }
  }
  
  // Check if error logging seems to be in place (by checking response timing/patterns)
  await rateLimiter.wait();
  try {
    // Test multiple failed logins to see if there's any indication of monitoring
    const loginPaths = ['/login', '/auth/login', '/api/auth/login'];
    
    for (const loginPath of loginPaths) {
      const responses: number[] = [];
      
      for (let i = 0; i < 3; i++) {
        await rateLimiter.wait();
        try {
          const start = Date.now();
          const response = await fetchWithTimeout(`${config.target_url}${loginPath}`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', password: 'wrongpassword' + i }),
          });
          responses.push(Date.now() - start);
          
          // If we get identical fast responses, rate limiting might not be in place
          if (i === 2 && response.status !== 429 && responses.every(r => r < 1000)) {
            findings.push({
              owasp_category: 'A09',
              vulnerability_name: 'No Apparent Brute Force Protection',
              severity: 'medium',
              confidence: 50,
              affected_endpoint: loginPath,
              http_method: 'POST',
              evidence: { 
                attempts: 3, 
                avg_response_time: Math.round(responses.reduce((a, b) => a + b, 0) / responses.length),
                no_429: true
              },
              remediation: 'Implement account lockout, rate limiting, and alerting for multiple failed login attempts.',
            });
          }
        } catch (error) {
          break; // Endpoint doesn't exist
        }
      }
    }
  } catch (error) {
    // Expected
  }
  
  // Check for security headers that indicate monitoring
  await rateLimiter.wait();
  try {
    const response = await fetchWithTimeout(config.target_url, { headers });
    
    // Check for Report-To or NEL headers (Network Error Logging)
    if (!response.headers.get('Report-To') && !response.headers.get('NEL')) {
      findings.push({
        owasp_category: 'A09',
        vulnerability_name: 'No Network Error Logging Headers',
        severity: 'info',
        confidence: 70,
        affected_endpoint: '/',
        evidence: { missing: ['Report-To', 'NEL'] },
        remediation: 'Consider implementing Report-To and NEL headers for client-side error monitoring.',
      });
    }
  } catch (error) {
    // Expected
  }
  
  return findings;
}

// A10: SSRF Tests
async function testSSRF(
  config: ScanConfig,
  rateLimiter: RateLimiter,
  endpoints: string[]
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const headers = getAuthHeaders(config);
  
  if (!config.aggressive_mode) {
    return findings; // SSRF tests require opt-in
  }
  
  for (const endpoint of endpoints) {
    for (const payload of SAFE_PAYLOADS.ssrf) {
      await rateLimiter.wait();
      
      try {
        const testUrl = `${config.target_url}${endpoint}?url=${encodeURIComponent(payload)}`;
        const response = await fetchWithTimeout(testUrl, { headers, timeout: 5000 });
        
        // Check for signs of SSRF
        const text = await response.text();
        if (text.includes('localhost') || text.includes('127.0.0.1') || text.includes('meta-data')) {
          findings.push({
            owasp_category: 'A10',
            vulnerability_name: 'Potential SSRF',
            severity: 'high',
            confidence: 65,
            affected_endpoint: endpoint,
            http_method: 'GET',
            payload_used: payload,
            evidence: { response_contains_internal: true },
            remediation: 'Validate and sanitize all user-supplied URLs. Block internal IP ranges.',
          });
          break;
        }
      } catch (error) {
        // Expected
      }
    }
  }
  
  return findings;
}

// Discover endpoints from target
async function discoverEndpoints(
  config: ScanConfig,
  rateLimiter: RateLimiter
): Promise<string[]> {
  const endpoints = new Set<string>(['/']);
  const headers = getAuthHeaders(config);
  
  await rateLimiter.wait();
  
  try {
    // Try common API paths
    const commonPaths = [
      '/api', '/api/v1', '/api/v2', '/graphql',
      '/users', '/items', '/products', '/orders',
      '/health', '/status', '/version',
    ];
    
    for (const path of commonPaths) {
      await rateLimiter.wait();
      try {
        const response = await fetchWithTimeout(`${config.target_url}${path}`, { headers });
        if (response.ok || response.status === 401 || response.status === 403) {
          endpoints.add(path);
        }
      } catch {
        // Endpoint doesn't exist
      }
    }
    
    // Try to fetch and parse HTML for links
    const response = await fetchWithTimeout(config.target_url, { headers });
    const html = await response.text();
    
    // Extract links
    const linkRegex = /href=["']([^"']+)["']/g;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      if (href.startsWith('/') && !href.startsWith('//')) {
        endpoints.add(href.split('?')[0]);
      }
    }
    
    // Extract API endpoints from JavaScript
    const apiRegex = /["']\/api[^"']+["']/g;
    while ((match = apiRegex.exec(html)) !== null) {
      const api = match[0].replace(/["']/g, '').split('?')[0];
      endpoints.add(api);
    }
  } catch (error) {
    console.error('Endpoint discovery error:', error);
  }
  
  return Array.from(endpoints).slice(0, config.scan_depth === 'deep' ? 50 : 20);
}

// Main scan orchestrator
async function runSecurityScan(
  supabase: ReturnType<typeof createClient>,
  scanId: string,
  config: ScanConfig
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const rateLimiter = new RateLimiter(config.rate_limit_rps);
  
  await logAction(supabase, scanId, 'scan_started', { config_id: config.id });
  
  // Update scan status
  await supabase.from('security_scans').update({
    status: 'running',
    started_at: new Date().toISOString(),
  }).eq('id', scanId);
  
  try {
    // Get all target URLs (primary + additional)
    const allTargetUrls = [config.target_url];
    if (config.target_urls && config.target_urls.length > 0) {
      allTargetUrls.push(...config.target_urls);
    }
    
    // Deduplicate URLs
    const uniqueTargetUrls = [...new Set(allTargetUrls.filter(url => url && url.trim()))];
    
    await logAction(supabase, scanId, 'targets_configured', { 
      count: uniqueTargetUrls.length,
      urls: uniqueTargetUrls 
    });
    
    const allEndpoints: string[] = [];
    
    // Scan each target URL
    for (const targetUrl of uniqueTargetUrls) {
      // Create a config copy with the current target URL
      const targetConfig = { ...config, target_url: targetUrl };
      
      await logAction(supabase, scanId, 'target_scan_started', { target_url: targetUrl });
      
      // Phase 1: Endpoint Discovery for this target
      await logAction(supabase, scanId, 'discovery_started', { target_url: targetUrl });
      const endpoints = await discoverEndpoints(targetConfig, rateLimiter);
      allEndpoints.push(...endpoints.map(ep => `${targetUrl}${ep}`));
      await logAction(supabase, scanId, 'discovery_completed', { 
        target_url: targetUrl, 
        count: endpoints.length 
      });
      
      // Phase 2: Run enabled test modules for this target
      const categoryTests: Record<string, () => Promise<Finding[]>> = {
        A01: () => testBrokenAccessControl(targetConfig, rateLimiter, endpoints),
        A02: () => testCryptographicFailures(targetConfig, rateLimiter),
        A03: () => testInjection(targetConfig, rateLimiter, endpoints),
        A04: () => testInsecureDesign(targetConfig, rateLimiter, endpoints),
        A05: () => testSecurityMisconfiguration(targetConfig, rateLimiter),
        A06: () => testVulnerableComponents(targetConfig, rateLimiter),
        A07: () => testAuthFailures(targetConfig, rateLimiter),
        A08: () => testIntegrityFailures(targetConfig, rateLimiter),
        A09: () => testLoggingFailures(targetConfig, rateLimiter),
        A10: () => testSSRF(targetConfig, rateLimiter, endpoints),
      };
      
      for (const category of config.enabled_categories) {
        if (categoryTests[category]) {
          await logAction(supabase, scanId, 'test_module_started', { category, target_url: targetUrl });
          try {
            const categoryFindings = await categoryTests[category]();
            findings.push(...categoryFindings);
            await logAction(supabase, scanId, 'test_module_completed', { 
              category,
              target_url: targetUrl,
              findings_count: categoryFindings.length 
            });
          } catch (error) {
            await logAction(supabase, scanId, 'test_module_error', { 
              category,
              target_url: targetUrl,
              error: error instanceof Error ? error.message : 'Unknown error' 
            });
          }
        }
      }
      
      await logAction(supabase, scanId, 'target_scan_completed', { target_url: targetUrl });
    }
    
    // Update discovered endpoints (all targets combined)
    await supabase.from('security_scans').update({
      discovered_endpoints: allEndpoints,
    }).eq('id', scanId);
    
    // Insert findings
    if (findings.length > 0) {
      const { data: scanData } = await supabase.from('security_scans')
        .select('project_id')
        .eq('id', scanId)
        .single();
      
      if (scanData) {
        await supabase.from('security_findings').insert(
          findings.map(f => ({
            scan_id: scanId,
            project_id: scanData.project_id,
            ...f,
          }))
        );
      }
    }
    
    // Calculate summary
    const summary = {
      total_findings: findings.length,
      critical: findings.filter(f => f.severity === 'critical').length,
      high: findings.filter(f => f.severity === 'high').length,
      medium: findings.filter(f => f.severity === 'medium').length,
      low: findings.filter(f => f.severity === 'low').length,
      info: findings.filter(f => f.severity === 'info').length,
      endpoints_scanned: allEndpoints.length,
      categories_tested: config.enabled_categories.length,
      targets_scanned: uniqueTargetUrls.length,
    };
    
    await supabase.from('security_scans').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      summary,
    }).eq('id', scanId);
    
    await logAction(supabase, scanId, 'scan_completed', summary);
    
  } catch (error) {
    await supabase.from('security_scans').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: error instanceof Error ? error.message : 'Unknown error',
    }).eq('id', scanId);
    
    await logAction(supabase, scanId, 'scan_failed', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
  
  return findings;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, scanId, configId, projectId } = await req.json();

    if (action === 'start') {
      // Get config
      const { data: config, error: configError } = await supabase
        .from('security_scan_configs')
        .select('*')
        .eq('id', configId)
        .single();

      if (configError || !config) {
        throw new Error('Scan configuration not found');
      }

      // Create scan record
      const { data: scan, error: scanError } = await supabase
        .from('security_scans')
        .insert({
          config_id: configId,
          project_id: config.project_id,
          status: 'pending',
          scan_mode: 'manual',
        })
        .select()
        .single();

      if (scanError || !scan) {
        throw new Error('Failed to create scan record');
      }

      // Run scan in background
      EdgeRuntime.waitUntil(runSecurityScan(supabase, scan.id, config as ScanConfig));

      return new Response(
        JSON.stringify({ success: true, scanId: scan.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'status') {
      const { data: scan, error } = await supabase
        .from('security_scans')
        .select('*, security_findings(*)')
        .eq('id', scanId)
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, scan }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'export') {
      const { data: scan, error: scanError } = await supabase
        .from('security_scans')
        .select('*, security_scan_configs(*), security_findings(*)')
        .eq('id', scanId)
        .single();

      if (scanError) throw scanError;

      const { format = 'json' } = await req.json().catch(() => ({}));

      if (format === 'sarif') {
        // SARIF format for CI/CD integration
        const sarif = {
          $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
          version: '2.1.0',
          runs: [{
            tool: {
              driver: {
                name: 'WISPR Security Scanner',
                version: '1.0.0',
                rules: scan.security_findings.map((f: Finding) => ({
                  id: `${f.owasp_category}-${f.vulnerability_name.replace(/\s/g, '-')}`,
                  name: f.vulnerability_name,
                  shortDescription: { text: f.vulnerability_name },
                  fullDescription: { text: f.remediation },
                  defaultConfiguration: {
                    level: f.severity === 'critical' || f.severity === 'high' ? 'error' : 'warning',
                  },
                })),
              },
            },
            results: scan.security_findings.map((f: Finding) => ({
              ruleId: `${f.owasp_category}-${f.vulnerability_name.replace(/\s/g, '-')}`,
              level: f.severity === 'critical' || f.severity === 'high' ? 'error' : 'warning',
              message: { text: `${f.vulnerability_name} at ${f.affected_endpoint}` },
              locations: [{
                physicalLocation: {
                  artifactLocation: { uri: f.affected_endpoint },
                },
              }],
            })),
          }],
        };

        return new Response(
          JSON.stringify(sarif),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Default JSON format
      return new Response(
        JSON.stringify({ success: true, report: scan }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Security scan error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
