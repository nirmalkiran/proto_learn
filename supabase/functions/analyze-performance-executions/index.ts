import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ExecutionSummary {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  avgResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  p90ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  errorRate: number;
  totalBytes: number;
}

interface JobConfig {
  threads: number;
  rampup: number;
  duration: number;
}

interface ExecutionData {
  id: string;
  executedAt: string;
  status: string;
  jobConfig: JobConfig | null;
  summary: ExecutionSummary | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { projectId, executions } = body as { projectId: string; executions: ExecutionData[] };

    if (!projectId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Project ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!executions || executions.length < 2) {
      return new Response(
        JSON.stringify({ success: false, error: 'At least 2 executions are required for comparison' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Analyzing ${executions.length} executions for project ${projectId}`);

    // Fetch Azure OpenAI configuration
    const { data: configData, error: configError } = await supabase
      .from('integration_configs')
      .select('config')
      .eq('project_id', projectId)
      .eq('integration_id', 'openai')
      .eq('enabled', true)
      .maybeSingle();

    if (configError) {
      console.error('Error fetching integration config:', configError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch Azure OpenAI configuration' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!configData?.config) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Azure OpenAI not configured for this project. Please configure it in the Integrations tab.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const azureConfig = configData.config as any;

    if (!azureConfig.apiKey || !azureConfig.endpoint) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Azure OpenAI configuration incomplete. Please ensure API Key and Endpoint are configured.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build execution comparison data
    const executionDetails = executions.map((exec, idx) => {
      const config = exec.jobConfig;
      const summary = exec.summary;
      
      return `
### Execution ${idx + 1} - ${new Date(exec.executedAt).toLocaleString()}
**Status:** ${exec.status}
**Test Configuration:**
- Virtual Users: ${config?.threads || 'Unknown'}
- Ramp-up Time: ${config?.rampup || 'Unknown'}s
- Duration: ${config?.duration || 'Unknown'}s

**Performance Metrics:**
- Total Requests: ${summary?.totalRequests || 0}
- Success Count: ${summary?.successCount || 0}
- Error Count: ${summary?.errorCount || 0}
- Error Rate: ${Number(summary?.errorRate || 0).toFixed(2)}%
- Average Response Time: ${summary?.avgResponseTime || 0}ms
- Min Response Time: ${summary?.minResponseTime || 0}ms
- Max Response Time: ${summary?.maxResponseTime || 0}ms
- P90 Response Time: ${summary?.p90ResponseTime || 0}ms
- P95 Response Time: ${summary?.p95ResponseTime || 0}ms
- P99 Response Time: ${summary?.p99ResponseTime || 0}ms
- Total Data Transferred: ${((summary?.totalBytes || 0) / 1024 / 1024).toFixed(2)} MB
`;
    }).join('\n---\n');

    // Calculate trends
    const sortedByDate = [...executions].sort((a, b) => 
      new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime()
    );

    const trends = {
      responseTimeTrend: sortedByDate.length >= 2 
        ? ((sortedByDate[sortedByDate.length - 1].summary?.avgResponseTime || 0) - 
           (sortedByDate[0].summary?.avgResponseTime || 0))
        : 0,
      errorRateTrend: sortedByDate.length >= 2
        ? ((sortedByDate[sortedByDate.length - 1].summary?.errorRate || 0) - 
           (sortedByDate[0].summary?.errorRate || 0))
        : 0,
      throughputChange: sortedByDate.length >= 2
        ? ((sortedByDate[sortedByDate.length - 1].summary?.totalRequests || 0) - 
           (sortedByDate[0].summary?.totalRequests || 0))
        : 0
    };

    const prompt = `You are a senior performance engineer and technical consultant. Analyze the following performance test executions and generate a comprehensive, client-ready report.

## Test Execution Data

${executionDetails}

## Observed Trends
- Response Time Change (first to last): ${trends.responseTimeTrend > 0 ? '+' : ''}${trends.responseTimeTrend.toFixed(2)}ms
- Error Rate Change: ${trends.errorRateTrend > 0 ? '+' : ''}${trends.errorRateTrend.toFixed(2)}%
- Throughput Change: ${trends.throughputChange > 0 ? '+' : ''}${trends.throughputChange} requests

---

Generate a comprehensive performance analysis report in the following format:

# Performance Test Analysis Report

## Executive Summary
- Provide a high-level overview suitable for executives and clients
- Include key findings, overall health assessment, and critical recommendations

## Test Configuration Comparison
- Compare the test configurations across executions
- Analyze if configuration changes impacted results
- Identify the test type (load, stress, endurance, etc.) based on configuration

## Performance Metrics Analysis
- Detailed analysis of response times, throughput, and error rates
- Highlight any concerning trends or patterns
- Compare against industry benchmarks where applicable

## Performance Degradation Analysis
- Identify when and where performance degraded
- Analyze patterns (e.g., degradation under specific load levels)
- Quantify the impact of degradation

## Root Cause Analysis
- Identify potential root causes for performance issues
- Consider server-side, network, and application factors
- Rank causes by likelihood and impact

## Mitigation Recommendations
- Provide specific, actionable recommendations
- Prioritize by impact and implementation effort
- Include both quick wins and long-term improvements

## Risk Assessment
- Identify risks based on current performance
- Assess impact on user experience and business operations
- Provide risk mitigation strategies

## Conclusion
- Summary of findings
- Next steps for the team
- Recommended follow-up tests

Format the response in professional markdown suitable for sharing with clients. Use clear headings, bullet points, and tables where appropriate.`;

    // Call Azure OpenAI
    const deploymentId = azureConfig.deploymentId || 'gpt-4o';
    const apiVersion = azureConfig.apiVersion || '2024-08-01-preview';
    const endpoint = azureConfig.endpoint.replace(/\/$/, '');
    const apiUrl = `${endpoint}/openai/deployments/${deploymentId}/chat/completions?api-version=${apiVersion}`;

    console.log('Calling Azure OpenAI for analysis');

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': azureConfig.apiKey,
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are a senior performance engineer with expertise in load testing, performance analysis, and technical consulting. Generate detailed, professional reports that can be shared with clients and stakeholders.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Azure OpenAI API error:', {
        status: response.status,
        error: errorData
      });

      let errorMessage = 'Failed to generate analysis';
      if (response.status === 401 || response.status === 403) {
        errorMessage = 'Azure OpenAI authentication failed. Please check your API key.';
      } else if (response.status === 404) {
        errorMessage = `Deployment "${deploymentId}" not found. Please verify your deployment ID.`;
      } else if (errorData.error?.message) {
        errorMessage = errorData.error.message;
      }

      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiResponse = await response.json();
    const reportContent = aiResponse.choices?.[0]?.message?.content || '';

    if (!reportContent) {
      return new Response(
        JSON.stringify({ success: false, error: 'No analysis generated' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log AI usage
    const promptTokens = aiResponse.usage?.prompt_tokens || 0;
    const completionTokens = aiResponse.usage?.completion_tokens || 0;
    const totalTokens = aiResponse.usage?.total_tokens || 0;
    const cost = (promptTokens * 0.00015 / 1000) + (completionTokens * 0.0006 / 1000);

    try {
      await supabase.from('ai_usage_logs').insert({
        user_id: user.id,
        project_id: projectId,
        feature_type: 'performance_multi_execution_analysis',
        tokens_used: totalTokens,
        openai_model: `azure-${deploymentId}`,
        openai_tokens_prompt: promptTokens,
        openai_tokens_completion: completionTokens,
        openai_cost_usd: cost,
        success: true
      });
    } catch (logError) {
      console.error('Failed to log AI usage:', logError);
    }

    console.log('Multi-execution analysis completed successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        report: reportContent,
        executionsAnalyzed: executions.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in analyze-performance-executions:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
