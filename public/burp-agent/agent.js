#!/usr/bin/env node
/**
 * Burp Suite Self-Hosted Agent
 * 
 * This agent connects to the platform and orchestrates Burp Suite Professional
 * for automated security testing.
 */

import { createClient } from '@supabase/supabase-js';

// Configuration from environment
const config = {
  supabaseUrl: process.env.SUPABASE_URL || 'https://lghzmijzfpvrcvogxpew.supabase.co',
  supabaseKey: process.env.SUPABASE_ANON_KEY,
  agentId: process.env.AGENT_ID,
  projectId: process.env.PROJECT_ID,
  agentToken: process.env.AGENT_TOKEN,
  burpApiUrl: process.env.BURP_API_URL || 'http://127.0.0.1:1337',
  burpApiKey: process.env.BURP_API_KEY,
  pollInterval: parseInt(process.env.POLL_INTERVAL || '5') * 1000,
  heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || '30') * 1000,
};

// Validate configuration
function validateConfig() {
  const required = ['supabaseKey', 'agentId', 'projectId', 'burpApiKey'];
  const missing = required.filter(key => !config[key]);
  if (missing.length > 0) {
    console.error(`Missing required configuration: ${missing.join(', ')}`);
    console.error('Please set the following environment variables:');
    console.error('  SUPABASE_ANON_KEY, AGENT_ID, PROJECT_ID, BURP_API_KEY');
    process.exit(1);
  }
}

// Supabase client
const supabase = createClient(config.supabaseUrl, config.supabaseKey);

// Burp Suite REST API wrapper
class BurpClient {
  constructor(baseUrl, apiKey) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  async request(method, endpoint, body = null) {
    const url = `${this.baseUrl}${endpoint}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey && { 'Authorization': this.apiKey }),
      },
    };
    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Burp API error: ${response.status} - ${text}`);
    }
    return response.json().catch(() => ({}));
  }

  // Scanner endpoints
  async getVersion() {
    return this.request('GET', '/v0.1/version');
  }

  async getScanConfigs() {
    return this.request('GET', '/v0.1/scan_configs');
  }

  async startScan(scanConfig) {
    return this.request('POST', '/v0.1/scan', scanConfig);
  }

  async getScanStatus(taskId) {
    return this.request('GET', `/v0.1/scan/${taskId}`);
  }

  async getScanIssues(taskId) {
    return this.request('GET', `/v0.1/scan/${taskId}/issues`);
  }

  async cancelScan(taskId) {
    return this.request('DELETE', `/v0.1/scan/${taskId}`);
  }

  // Site map endpoints
  async getSiteMap(url) {
    return this.request('GET', `/v0.1/sitemap?url=${encodeURIComponent(url)}`);
  }

  // Proxy endpoints
  async getProxyHistory(start = 0, count = 100) {
    return this.request('GET', `/v0.1/proxy/history?start=${start}&count=${count}`);
  }

  // Intruder endpoints
  async startIntruderAttack(attackConfig) {
    return this.request('POST', '/v0.1/intruder', attackConfig);
  }

  async getIntruderStatus(attackId) {
    return this.request('GET', `/v0.1/intruder/${attackId}`);
  }

  // OAST/Collaborator endpoints
  async getCollaboratorInteractions() {
    return this.request('GET', '/v0.1/collaborator/interactions');
  }

  // Extensions
  async getExtensions() {
    return this.request('GET', '/v0.1/extensions');
  }

  async enableExtension(extensionId) {
    return this.request('POST', `/v0.1/extensions/${extensionId}/enable`);
  }
}

// Main Agent class
class BurpAgent {
  constructor() {
    this.burp = new BurpClient(config.burpApiUrl, config.burpApiKey);
    this.activeTasks = new Map();
    this.isRunning = false;
  }

  async start() {
    validateConfig();
    console.log('🔐 Burp Suite Agent Starting...');

    // Test Burp connection
    try {
      const version = await this.burp.getVersion();
      console.log(`✅ Connected to Burp Suite ${version.version || 'Professional'}`);
    } catch (error) {
      console.error('❌ Failed to connect to Burp Suite:', error.message);
      console.error('Make sure Burp Suite is running with REST API enabled on', config.burpApiUrl);
      process.exit(1);
    }

    // Register agent
    await this.registerAgent();

    this.isRunning = true;

    // Start polling loops
    this.pollForJobs();
    this.sendHeartbeat();
    this.monitorActiveTasks();

    console.log('🚀 Agent is running. Press Ctrl+C to stop.');

    // Handle shutdown
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  async registerAgent() {
    try {
      const burpVersion = await this.burp.getVersion();
      const { error } = await supabase
        .from('burp_agents')
        .upsert({
          id: config.agentId,
          project_id: config.projectId,
          status: 'online',
          last_heartbeat: new Date().toISOString(),
          version: burpVersion.version,
          capabilities: {
            scanner: true,
            crawler: true,
            collaborator: true,
            intruder: true,
          },
        }, { onConflict: 'id' });

      if (error) throw error;
      console.log('✅ Agent registered with platform');
    } catch (error) {
      console.error('Failed to register agent:', error.message);
    }
  }

  async pollForJobs() {
    while (this.isRunning) {
      try {
        // Get pending scans assigned to this agent
        const { data: pendingScans, error } = await supabase
          .from('burp_scans')
          .select('*, profile:burp_scan_profiles(*)')
          .eq('agent_id', config.agentId)
          .eq('status', 'pending')
          .order('created_at', { ascending: true })
          .limit(1);

        if (error) throw error;

        if (pendingScans && pendingScans.length > 0) {
          const scan = pendingScans[0];
          console.log(`📋 Starting scan: ${scan.name} (${scan.run_id})`);
          await this.executeScan(scan);
        }
      } catch (error) {
        console.error('Poll error:', error.message);
      }

      await this.sleep(config.pollInterval);
    }
  }

  async sendHeartbeat() {
    while (this.isRunning) {
      try {
        await supabase
          .from('burp_agents')
          .update({
            status: 'online',
            last_heartbeat: new Date().toISOString(),
          })
          .eq('id', config.agentId);
      } catch (error) {
        console.error('Heartbeat error:', error.message);
      }

      await this.sleep(config.heartbeatInterval);
    }
  }

  async monitorActiveTasks() {
    while (this.isRunning) {
      for (const [scanId, taskInfo] of this.activeTasks) {
        try {
          const status = await this.burp.getScanStatus(taskInfo.burpTaskId);
          
          // Update progress
          const progress = status.scan_metrics?.crawl_requests_made || 0;
          await this.updateScanProgress(scanId, {
            progress_percentage: Math.min(status.scan_metrics?.percent_complete || 0, 100),
            current_phase: status.scan_status,
            requests_made: progress,
          });

          // Check if completed
          if (status.scan_status === 'succeeded' || status.scan_status === 'failed') {
            await this.completeScan(scanId, taskInfo.burpTaskId, status);
            this.activeTasks.delete(scanId);
          }
        } catch (error) {
          console.error(`Monitor error for scan ${scanId}:`, error.message);
        }
      }

      await this.sleep(5000);
    }
  }

  async executeScan(scan) {
    try {
      // Update status to crawling
      await this.updateScanStatus(scan.id, 'crawling');

      // Build Burp scan configuration
      const scanConfig = {
        urls: scan.target_urls || [scan.target_url],
        scope: {
          include: scan.scope_includes || scan.target_urls?.map(u => ({ rule: u })),
          exclude: scan.scope_excludes?.map(u => ({ rule: u })) || [],
        },
        scan_configurations: [],
      };

      // Apply profile settings
      if (scan.profile) {
        if (scan.profile.active_scan_enabled) {
          scanConfig.scan_configurations.push({ name: 'Audit checks - all except time-based detection methods' });
        } else if (scan.profile.passive_scan_enabled) {
          scanConfig.scan_configurations.push({ name: 'Audit checks - passive' });
        }
      }

      // Start the scan in Burp
      const result = await this.burp.startScan(scanConfig);
      const burpTaskId = result.task_id;

      console.log(`🔍 Burp scan started with task ID: ${burpTaskId}`);

      // Track the active task
      this.activeTasks.set(scan.id, {
        burpTaskId,
        startedAt: new Date(),
      });

      // Update status to scanning
      await this.updateScanStatus(scan.id, 'scanning', {
        started_at: new Date().toISOString(),
      });

      // Log scan start
      await this.logScanEvent(scan.id, 'info', 'scan', `Scan started with Burp task ID: ${burpTaskId}`);

    } catch (error) {
      console.error(`Failed to execute scan ${scan.id}:`, error.message);
      await this.updateScanStatus(scan.id, 'failed', {
        error_message: error.message,
        completed_at: new Date().toISOString(),
      });
      await this.logScanEvent(scan.id, 'error', 'scan', `Scan failed: ${error.message}`);
    }
  }

  async completeScan(scanId, burpTaskId, status) {
    try {
      console.log(`✅ Scan ${scanId} completed`);

      // Fetch issues from Burp
      const issues = await this.burp.getScanIssues(burpTaskId);
      
      // Process and store findings
      const findings = await this.processFindings(scanId, issues);

      // Calculate severity counts
      const severityCounts = {
        critical: 0, high: 0, medium: 0, low: 0, info: 0
      };
      findings.forEach(f => {
        const sev = f.severity.toLowerCase();
        if (severityCounts[sev] !== undefined) {
          severityCounts[sev]++;
        }
      });

      // Update scan with completion data
      await this.updateScanStatus(scanId, 'completed', {
        completed_at: new Date().toISOString(),
        issues_found: findings.length,
        critical_count: severityCounts.critical,
        high_count: severityCounts.high,
        medium_count: severityCounts.medium,
        low_count: severityCounts.low,
        info_count: severityCounts.info,
        endpoints_discovered: status.scan_metrics?.crawl_unique_locations || 0,
        requests_made: status.scan_metrics?.crawl_requests_made || 0,
        duration_ms: status.scan_metrics?.scan_duration_in_milliseconds || 0,
      });

      await this.logScanEvent(scanId, 'info', 'scan', `Scan completed with ${findings.length} findings`);

    } catch (error) {
      console.error(`Failed to complete scan ${scanId}:`, error.message);
      await this.updateScanStatus(scanId, 'failed', {
        error_message: error.message,
        completed_at: new Date().toISOString(),
      });
    }
  }

  async processFindings(scanId, issues) {
    const findings = [];

    for (const issue of issues.issues || []) {
      const finding = {
        project_id: config.projectId,
        scan_id: scanId,
        issue_type: issue.type_index?.toString() || 'unknown',
        issue_name: issue.name || 'Unknown Issue',
        severity: this.mapSeverity(issue.severity),
        confidence: this.mapConfidence(issue.confidence),
        host: issue.host || '',
        path: issue.path || '',
        url: `${issue.protocol || 'https'}://${issue.host}${issue.path}`,
        http_method: issue.http_service?.protocol || 'GET',
        issue_detail: issue.issue_detail,
        issue_background: issue.issue_background,
        remediation_detail: issue.remediation_detail,
        remediation_background: issue.remediation_background,
        request_base64: issue.request_base64,
        response_base64: issue.response_base64,
        path_to_issue: this.extractPathToIssue(issue),
        owasp_category: this.mapToOWASP(issue.type_index),
        is_dom_based: issue.type_index >= 1048832 && issue.type_index <= 1048847,
      };

      // Insert finding
      const { data, error } = await supabase
        .from('burp_findings')
        .insert(finding)
        .select()
        .single();

      if (!error && data) {
        findings.push(data);
      }
    }

    return findings;
  }

  mapSeverity(burpSeverity) {
    const map = {
      'high': 'high',
      'medium': 'medium',
      'low': 'low',
      'information': 'info',
      'info': 'info',
    };
    return map[burpSeverity?.toLowerCase()] || 'info';
  }

  mapConfidence(burpConfidence) {
    const map = {
      'certain': 'certain',
      'firm': 'firm',
      'tentative': 'tentative',
    };
    return map[burpConfidence?.toLowerCase()] || 'tentative';
  }

  mapToOWASP(typeIndex) {
    // Map Burp issue type indices to OWASP Top 10 categories
    // This is a simplified mapping - extend as needed
    if (typeIndex >= 1048576 && typeIndex <= 1048591) return 'A03'; // Injection
    if (typeIndex >= 1048592 && typeIndex <= 1048607) return 'A07'; // Auth Failures
    if (typeIndex >= 1048608 && typeIndex <= 1048623) return 'A01'; // Broken Access Control
    if (typeIndex >= 1048624 && typeIndex <= 1048639) return 'A02'; // Cryptographic Failures
    if (typeIndex >= 1048640 && typeIndex <= 1048655) return 'A05'; // Security Misconfiguration
    if (typeIndex >= 1048832 && typeIndex <= 1048847) return 'A03'; // DOM-based (client-side injection)
    return 'A10'; // Default to SSRF/Other
  }

  extractPathToIssue(issue) {
    // Extract reproduction steps from issue details
    const steps = [];
    if (issue.path) {
      steps.push({
        step_number: 1,
        action: 'navigate',
        url: `${issue.protocol}://${issue.host}${issue.path}`,
        description: 'Navigate to the vulnerable URL',
      });
    }
    if (issue.request_base64) {
      steps.push({
        step_number: 2,
        action: 'send_request',
        description: 'Send the crafted request (see request details)',
      });
    }
    return steps;
  }

  async updateScanStatus(scanId, status, additionalFields = {}) {
    await supabase
      .from('burp_scans')
      .update({
        status,
        updated_at: new Date().toISOString(),
        ...additionalFields,
      })
      .eq('id', scanId);
  }

  async updateScanProgress(scanId, progress) {
    await supabase
      .from('burp_scans')
      .update({
        ...progress,
        updated_at: new Date().toISOString(),
      })
      .eq('id', scanId);
  }

  async logScanEvent(scanId, level, category, message, details = null) {
    await supabase
      .from('burp_scan_logs')
      .insert({
        scan_id: scanId,
        level,
        category,
        message,
        details,
        timestamp: new Date().toISOString(),
      });
  }

  async shutdown() {
    console.log('\n🛑 Shutting down agent...');
    this.isRunning = false;

    // Cancel active tasks
    for (const [scanId, taskInfo] of this.activeTasks) {
      try {
        await this.burp.cancelScan(taskInfo.burpTaskId);
        await this.updateScanStatus(scanId, 'cancelled');
      } catch (error) {
        console.error(`Failed to cancel scan ${scanId}:`, error.message);
      }
    }

    // Update agent status
    await supabase
      .from('burp_agents')
      .update({ status: 'offline' })
      .eq('id', config.agentId);

    console.log('👋 Agent stopped');
    process.exit(0);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Start the agent
const agent = new BurpAgent();
agent.start().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
