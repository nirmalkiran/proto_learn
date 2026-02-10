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

    console.log(`[ZAP Agent API] Action: ${action}, Method: ${req.method}`);

    // === AGENT ENDPOINTS (no auth required - agents use service role via edge function) ===

    // Agent heartbeat
    if (action === 'heartbeat' && req.method === 'POST') {
      const { agent_id, capabilities, version } = await req.json();

      if (!agent_id) {
        return new Response(JSON.stringify({ error: 'agent_id required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`[ZAP Heartbeat] Agent: ${agent_id}, Version: ${version}`);

      const updateData: Record<string, unknown> = {
        status: 'online',
        last_heartbeat: new Date().toISOString(),
      };
      if (capabilities) updateData.capabilities = capabilities;
      if (version) updateData.version = version;

      const { error } = await supabase
        .from('zap_agents')
        .update(updateData)
        .eq('id', agent_id);

      if (error) {
        console.error('[ZAP Heartbeat] Error:', error);
        throw error;
      }

      console.log(`[ZAP Heartbeat] Success for agent: ${agent_id}`);

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

      // Get the agent's project_id
      const { data: agent } = await supabase
        .from('zap_agents')
        .select('project_id')
        .eq('id', agentId)
        .single();

      if (!agent) {
        return new Response(JSON.stringify({ error: 'Agent not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Fetch scans assigned to this agent OR unassigned scans in the same project
      const { data: scans, error } = await supabase
        .from('zap_scans')
        .select('*, profile:zap_scan_profiles(*)')
        .eq('project_id', agent.project_id)
        .eq('status', 'pending')
        .or(`agent_id.eq.${agentId},agent_id.is.null`)
        .order('created_at', { ascending: true })
        .limit(5);

      if (error) throw error;

      // Auto-assign unassigned scans to this agent
      for (const scan of scans || []) {
        if (!scan.agent_id) {
          await supabase
            .from('zap_scans')
            .update({ agent_id: agentId })
            .eq('id', scan.id);
          scan.agent_id = agentId;
        }
      }

      console.log(`[ZAP Poll] Agent ${agentId}: ${(scans || []).length} pending scan(s)`);

      return new Response(JSON.stringify({
        scans: scans || [],
        poll_interval: 5,
        heartbeat_interval: 30,
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

      if (progress !== undefined) updateData.progress_percentage = progress;
      if (error_message) updateData.error_message = error_message;
      if (metrics) {
        if (metrics.spider_progress !== undefined) updateData.spider_progress = metrics.spider_progress;
        if (metrics.active_scan_progress !== undefined) updateData.active_scan_progress = metrics.active_scan_progress;
        if (metrics.urls_discovered !== undefined) updateData.urls_discovered = metrics.urls_discovered;
        if (metrics.requests_made !== undefined) updateData.requests_made = metrics.requests_made;
        if (metrics.current_phase) updateData.current_phase = metrics.current_phase;
      }

      if (status === 'spidering' || status === 'scanning') {
        if (!updateData.started_at) {
          const { data: scan } = await supabase.from('zap_scans').select('started_at').eq('id', scan_id).single();
          if (scan && !scan.started_at) updateData.started_at = new Date().toISOString();
        }
      }

      const { error } = await supabase
        .from('zap_scans')
        .update(updateData)
        .eq('id', scan_id);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Submit scan results (alerts)
    if (action === 'results' && req.method === 'POST') {
      const { scan_id, alerts, summary } = await req.json();

      const { data: scan } = await supabase
        .from('zap_scans')
        .select('project_id')
        .eq('id', scan_id)
        .single();

      if (!scan) {
        return new Response(JSON.stringify({ error: 'Scan not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let insertedCount = 0;
      for (const alert of alerts || []) {
        const { error } = await supabase.from('zap_alerts').insert({
          project_id: scan.project_id,
          scan_id,
          plugin_id: alert.pluginId || alert.plugin_id || '',
          alert_ref: alert.alertRef || alert.alert_ref || alert.pluginId || '',
          alert_name: alert.alert || alert.alert_name || 'Unknown',
          risk: (alert.risk || 'info').toLowerCase(),
          confidence: (alert.confidence || 'low').toLowerCase(),
          cwe_id: parseInt(alert.cweid || alert.cwe_id) || null,
          wasc_id: parseInt(alert.wascid || alert.wasc_id) || null,
          url: alert.url || '',
          method: alert.method,
          param: alert.param,
          attack: alert.attack,
          evidence: alert.evidence,
          description: alert.description,
          solution: alert.solution,
          reference: alert.reference,
          other_info: alert.other || alert.other_info,
          source: alert.source || 'active',
          status: 'new',
          tags: alert.tags || {},
          is_false_positive: false,
          is_suppressed: false,
          occurrence_count: 1,
        });

        if (!error) insertedCount++;
      }

      // Update scan summary
      const severityCounts = { high: 0, medium: 0, low: 0, info: 0 };
      for (const a of alerts || []) {
        const risk = (a.risk || 'info').toLowerCase();
        if (severityCounts[risk as keyof typeof severityCounts] !== undefined) {
          severityCounts[risk as keyof typeof severityCounts]++;
        }
      }

      await supabase
        .from('zap_scans')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          alerts_found: alerts?.length || 0,
          high_count: severityCounts.high,
          medium_count: severityCounts.medium,
          low_count: severityCounts.low,
          info_count: severityCounts.info,
          urls_discovered: summary?.urls_discovered || 0,
          requests_made: summary?.requests_made || 0,
          duration_ms: summary?.duration_ms || 0,
        })
        .eq('id', scan_id);

      console.log(`[ZAP Results] Scan ${scan_id}: ${insertedCount} alerts inserted`);

      return new Response(JSON.stringify({
        success: true,
        alerts_inserted: insertedCount,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === CLIENT ENDPOINTS (require auth) ===

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Start a new scan
    if (action === 'start-scan' && req.method === 'POST') {
      const { project_id, name, target_urls, agent_id, profile_id, scan_mode } = await req.json();

      const runId = `ZAP-${String(Date.now()).slice(-6)}`;

      const { data: scan, error } = await supabase
        .from('zap_scans')
        .insert({
          project_id,
          name,
          run_id: runId,
          target_urls,
          agent_id,
          profile_id,
          scan_mode: scan_mode || 'full',
          created_by: user.id,
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
        .from('zap_scans')
        .update({ status: 'cancelled', completed_at: new Date().toISOString() })
        .eq('id', scan_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('ZAP agent API error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
