import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-agent-token',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const action = pathParts[pathParts.length - 1];

    // Agent authentication via token header
    const agentToken = req.headers.get('x-agent-token');
    const authHeader = req.headers.get('Authorization');

    // === AGENT ENDPOINTS ===
    
    // Agent heartbeat
    if (action === 'heartbeat' && req.method === 'POST') {
      const { agent_id, capabilities, version } = await req.json();
      
      const { error } = await supabase
        .from('burp_agents')
        .update({
          status: 'online',
          last_heartbeat: new Date().toISOString(),
          capabilities,
          version,
        })
        .eq('id', agent_id);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Poll for pending scans
    if (action === 'poll' && req.method === 'GET') {
      const agentId = url.searchParams.get('agent_id');
      if (!agentId) {
        return new Response(JSON.stringify({ error: 'agent_id required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: scans, error } = await supabase
        .from('burp_scans')
        .select('*, profile:burp_scan_profiles(*)')
        .eq('agent_id', agentId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(5);

      if (error) throw error;

      // Get polling interval from settings
      const { data: settings } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'burp_agent_settings')
        .single();

      return new Response(JSON.stringify({
        scans: scans || [],
        poll_interval: settings?.setting_value?.poll_interval || 5,
        heartbeat_interval: settings?.setting_value?.heartbeat_interval || 30,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update scan status
    if (action === 'status' && req.method === 'POST') {
      const { scan_id, status, progress, error_message, metrics } = await req.json();

      const updateData: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (progress !== undefined) {
        updateData.progress_percentage = progress;
      }
      if (error_message) {
        updateData.error_message = error_message;
      }
      if (metrics) {
        Object.assign(updateData, {
          endpoints_discovered: metrics.endpoints_discovered,
          requests_made: metrics.requests_made,
          current_phase: metrics.current_phase,
        });
      }

      const { error } = await supabase
        .from('burp_scans')
        .update(updateData)
        .eq('id', scan_id);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Submit scan results
    if (action === 'results' && req.method === 'POST') {
      const { scan_id, findings, attack_surface, summary } = await req.json();

      // Get scan details
      const { data: scan } = await supabase
        .from('burp_scans')
        .select('project_id')
        .eq('id', scan_id)
        .single();

      if (!scan) {
        return new Response(JSON.stringify({ error: 'Scan not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Insert attack surface entries
      if (attack_surface && attack_surface.length > 0) {
        const surfaceEntries = attack_surface.map((s: any) => ({
          ...s,
          project_id: scan.project_id,
          scan_id,
        }));

        await supabase.from('burp_attack_surface').insert(surfaceEntries);
      }

      // Insert findings with deduplication
      const insertedFindings = [];
      for (const finding of findings || []) {
        // Check for existing finding with same fingerprint
        const { data: existing } = await supabase
          .from('burp_findings')
          .select('id, occurrence_count')
          .eq('project_id', scan.project_id)
          .eq('fingerprint', finding.fingerprint)
          .single();

        if (existing) {
          // Update occurrence count
          await supabase
            .from('burp_findings')
            .update({ occurrence_count: existing.occurrence_count + 1 })
            .eq('id', existing.id);
        } else {
          // Insert new finding
          const { data, error } = await supabase
            .from('burp_findings')
            .insert({
              ...finding,
              project_id: scan.project_id,
              scan_id,
              first_seen_scan_id: scan_id,
            })
            .select()
            .single();

          if (!error && data) {
            insertedFindings.push(data);
          }
        }
      }

      // Update scan with summary
      const severityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
      for (const f of findings || []) {
        const sev = f.severity?.toLowerCase();
        if (severityCounts[sev as keyof typeof severityCounts] !== undefined) {
          severityCounts[sev as keyof typeof severityCounts]++;
        }
      }

      await supabase
        .from('burp_scans')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          issues_found: findings?.length || 0,
          critical_count: severityCounts.critical,
          high_count: severityCounts.high,
          medium_count: severityCounts.medium,
          low_count: severityCounts.low,
          info_count: severityCounts.info,
          endpoints_discovered: attack_surface?.length || 0,
          requests_made: summary?.requests_made || 0,
          duration_ms: summary?.duration_ms || 0,
        })
        .eq('id', scan_id);

      // Deduplicate and sync to unified security_findings table
      await syncToUnifiedFindings(supabase, scan.project_id, scan_id, insertedFindings);

      return new Response(JSON.stringify({
        success: true,
        findings_inserted: insertedFindings.length,
        duplicates_updated: (findings?.length || 0) - insertedFindings.length,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Submit traffic logs
    if (action === 'traffic' && req.method === 'POST') {
      const { scan_id, logs } = await req.json();

      const { data: scan } = await supabase
        .from('burp_scans')
        .select('project_id')
        .eq('id', scan_id)
        .single();

      if (!scan) {
        return new Response(JSON.stringify({ error: 'Scan not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const trafficLogs = logs.map((log: any) => ({
        ...log,
        project_id: scan.project_id,
        scan_id,
      }));

      await supabase.from('burp_traffic_logs').insert(trafficLogs);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Submit OAST interactions
    if (action === 'oast' && req.method === 'POST') {
      const { scan_id, interactions } = await req.json();

      const { data: scan } = await supabase
        .from('burp_scans')
        .select('project_id')
        .eq('id', scan_id)
        .single();

      if (!scan) {
        return new Response(JSON.stringify({ error: 'Scan not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      for (const interaction of interactions || []) {
        // Check if already exists
        const { data: existing } = await supabase
          .from('burp_oast_interactions')
          .select('id')
          .eq('interaction_id', interaction.interaction_id)
          .single();

        if (!existing) {
          await supabase.from('burp_oast_interactions').insert({
            ...interaction,
            project_id: scan.project_id,
            scan_id,
          });
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Scan logs
    if (action === 'logs' && req.method === 'POST') {
      const { scan_id, logs } = await req.json();

      const scanLogs = logs.map((log: any) => ({
        scan_id,
        level: log.level || 'info',
        category: log.category || 'general',
        message: log.message,
        details: log.details,
        timestamp: log.timestamp || new Date().toISOString(),
      }));

      await supabase.from('burp_scan_logs').insert(scanLogs);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === CLIENT ENDPOINTS (require auth) ===
    
    // Verify JWT for client endpoints
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: authError } = await supabase.auth.getClaims(token);
    if (authError || !claims?.claims) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = claims.claims.sub;

    // Start a new scan
    if (action === 'start-scan' && req.method === 'POST') {
      const { project_id, name, target_urls, agent_id, profile_id, scan_mode, api_definition } = await req.json();

      // Generate run ID
      const { data: runIdData } = await supabase.rpc('generate_burp_scan_run_id');
      const runId = runIdData || `BURP-${Date.now()}`;

      const { data: scan, error } = await supabase
        .from('burp_scans')
        .insert({
          project_id,
          name,
          run_id: runId,
          target_urls,
          agent_id,
          profile_id,
          scan_mode: scan_mode || 'passive',
          api_definition_type: api_definition?.type,
          api_definition_content: api_definition?.content,
          created_by: userId,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify(scan), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Cancel a scan
    if (action === 'cancel-scan' && req.method === 'POST') {
      const { scan_id } = await req.json();

      await supabase
        .from('burp_scans')
        .update({ status: 'cancelled', completed_at: new Date().toISOString() })
        .eq('id', scan_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate report
    if (action === 'generate-report' && req.method === 'POST') {
      const { scan_id, format, options } = await req.json();

      const { data: scan } = await supabase
        .from('burp_scans')
        .select('*, findings:burp_findings(*)')
        .eq('id', scan_id)
        .single();

      if (!scan) {
        return new Response(JSON.stringify({ error: 'Scan not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Generate report content based on format
      let reportContent = '';
      const owaspMapping: Record<string, { count: number; findings: string[] }> = {};

      for (const finding of scan.findings || []) {
        const category = finding.owasp_category || 'Other';
        if (!owaspMapping[category]) {
          owaspMapping[category] = { count: 0, findings: [] };
        }
        owaspMapping[category].count++;
        owaspMapping[category].findings.push(finding.id);
      }

      if (format === 'sarif') {
        reportContent = generateSARIFReport(scan);
      } else if (format === 'json') {
        reportContent = JSON.stringify(scan, null, 2);
      } else {
        reportContent = generateHTMLReport(scan);
      }

      const { data: report, error } = await supabase
        .from('burp_reports')
        .insert({
          project_id: scan.project_id,
          scan_id,
          name: `${scan.name} - ${new Date().toISOString()}`,
          format,
          report_content: reportContent,
          include_request_response: options?.includeRequestResponse ?? true,
          include_remediation: options?.includeRemediation ?? true,
          severity_filter: options?.severityFilter || ['critical', 'high', 'medium', 'low', 'info'],
          owasp_mapping: owaspMapping,
          created_by: userId,
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify(report), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Burp agent API error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Sync Burp findings to unified security_findings table
async function syncToUnifiedFindings(supabase: any, projectId: string, scanId: string, findings: any[]) {
  for (const finding of findings) {
    // Map Burp finding to security_findings format
    const unifiedFinding = {
      project_id: projectId,
      scan_id: scanId,
      owasp_category: finding.owasp_category || 'Other',
      vulnerability_name: finding.issue_name,
      severity: finding.severity,
      confidence: finding.confidence === 'certain' ? 100 : finding.confidence === 'firm' ? 75 : 50,
      affected_endpoint: finding.url,
      http_method: finding.http_method,
      payload_used: finding.payload_used,
      evidence: {
        burp_finding_id: finding.id,
        issue_type: finding.issue_type,
        path_to_issue: finding.path_to_issue,
      },
      remediation: finding.remediation_detail || finding.remediation_background,
      is_false_positive: finding.is_false_positive,
      is_suppressed: finding.is_suppressed,
      suppression_reason: finding.suppression_reason,
    };

    try {
      await supabase.from('security_findings').insert(unifiedFinding);
    } catch (e) {
      // Ignore duplicates
    }
  }
}

function generateSARIFReport(scan: any): string {
  const sarif = {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: {
        driver: {
          name: 'Burp Suite Professional',
          version: scan.agent?.version || 'unknown',
          informationUri: 'https://portswigger.net/burp',
          rules: [],
        },
      },
      results: (scan.findings || []).map((finding: any) => ({
        ruleId: finding.issue_type,
        level: finding.severity === 'critical' || finding.severity === 'high' ? 'error' :
               finding.severity === 'medium' ? 'warning' : 'note',
        message: { text: finding.issue_name },
        locations: [{
          physicalLocation: {
            artifactLocation: { uri: finding.url },
          },
        }],
      })),
    }],
  };

  return JSON.stringify(sarif, null, 2);
}

function generateHTMLReport(scan: any): string {
  const findings = scan.findings || [];
  const severityOrder = ['critical', 'high', 'medium', 'low', 'info'];
  
  const groupedFindings = severityOrder.reduce((acc, sev) => {
    acc[sev] = findings.filter((f: any) => f.severity === sev);
    return acc;
  }, {} as Record<string, any[]>);

  return `<!DOCTYPE html>
<html>
<head>
  <title>Security Scan Report - ${scan.name}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
    .header { background: #1a1a2e; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 20px; }
    .summary-item { padding: 15px; border-radius: 8px; text-align: center; }
    .critical { background: #dc2626; color: white; }
    .high { background: #ea580c; color: white; }
    .medium { background: #ca8a04; color: black; }
    .low { background: #2563eb; color: white; }
    .info { background: #6b7280; color: white; }
    .finding { border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin-bottom: 15px; }
    .finding-header { display: flex; justify-content: space-between; align-items: center; }
    .badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
    pre { background: #f3f4f6; padding: 10px; border-radius: 4px; overflow-x: auto; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Security Scan Report</h1>
    <p><strong>Scan:</strong> ${scan.name} (${scan.run_id})</p>
    <p><strong>Completed:</strong> ${scan.completed_at}</p>
    <p><strong>Duration:</strong> ${Math.round((scan.duration_ms || 0) / 1000)}s</p>
  </div>
  
  <div class="summary">
    <div class="summary-item critical"><strong>${scan.critical_count || 0}</strong><br>Critical</div>
    <div class="summary-item high"><strong>${scan.high_count || 0}</strong><br>High</div>
    <div class="summary-item medium"><strong>${scan.medium_count || 0}</strong><br>Medium</div>
    <div class="summary-item low"><strong>${scan.low_count || 0}</strong><br>Low</div>
    <div class="summary-item info"><strong>${scan.info_count || 0}</strong><br>Info</div>
  </div>

  ${severityOrder.map(sev => {
    const items = groupedFindings[sev] || [];
    if (items.length === 0) return '';
    return `
      <h2 style="text-transform: capitalize">${sev} Severity (${items.length})</h2>
      ${items.map((f: any) => `
        <div class="finding">
          <div class="finding-header">
            <h3>${f.issue_name}</h3>
            <span class="badge ${sev}">${sev.toUpperCase()}</span>
          </div>
          <p><strong>URL:</strong> ${f.url}</p>
          <p><strong>OWASP:</strong> ${f.owasp_category || 'N/A'}</p>
          ${f.issue_detail ? `<p>${f.issue_detail}</p>` : ''}
          ${f.remediation_detail ? `<h4>Remediation</h4><p>${f.remediation_detail}</p>` : ''}
        </div>
      `).join('')}
    `;
  }).join('')}
</body>
</html>`;
}
