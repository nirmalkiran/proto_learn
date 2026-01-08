import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
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
    const { csvFiles, reportName, aiProvider, projectId } = body;

    if (!csvFiles || !Array.isArray(csvFiles) || csvFiles.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'CSV files are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!reportName) {
      return new Response(
        JSON.stringify({ success: false, error: 'Report name is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!projectId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Project ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Generating performance report using ${aiProvider || 'azure-openai'}`);

    // Fetch Azure OpenAI configuration from integration_configs
    const { data: configData, error: configError } = await supabase
      .from('integration_configs')
      .select('config')
      .eq('project_id', projectId)
      .eq('integration_id', 'openai')
      .eq('enabled', true)
      .maybeSingle();

    console.log('Integration config fetch result:', { 
      hasData: !!configData, 
      error: configError?.message,
      projectId 
    });

    if (configError) {
      console.error('Error fetching integration config:', configError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to fetch Azure OpenAI configuration',
          details: configError.message 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!configData?.config) {
      console.error('No Azure OpenAI configuration found for project:', projectId);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Azure OpenAI not configured for this project. Please configure it in the Integrations tab.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const azureConfig = configData.config as any;
    
    console.log('Azure config validation:', {
      hasApiKey: !!azureConfig.apiKey,
      hasEndpoint: !!azureConfig.endpoint,
      hasDeploymentId: !!azureConfig.deploymentId,
      enabled: azureConfig.enabled
    });

    // Validate configuration - check for apiKey and endpoint
    if (!azureConfig.apiKey || !azureConfig.endpoint) {
      console.error('Azure OpenAI configuration incomplete:', {
        hasApiKey: !!azureConfig.apiKey,
        hasEndpoint: !!azureConfig.endpoint
      });
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Azure OpenAI configuration incomplete. Please ensure API Key and Endpoint are configured in the Integrations tab.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse CSV data
    const csvData = csvFiles.map((file: any) => ({
      name: file.name,
      content: file.content
    }));

    // Create prompt for performance analysis
    const prompt = `Analyze the following JMeter performance test results and generate a comprehensive performance report.

CSV Files:
${csvData.map((file: any) => `
=== ${file.name} ===
${file.content}
`).join('\n')}

Please provide a detailed performance analysis report including:
1. **Executive Summary** - Overall test results and key findings
2. **Test Configuration** - Details about the test setup
3. **Performance Metrics Analysis**
   - Response time statistics (min, max, avg, percentiles)
   - Throughput analysis
   - Error rate analysis
   - Latency breakdown
4. **Endpoint Performance Breakdown** - Performance by API endpoint/label
5. **Error Analysis** - Detailed analysis of failed requests
6. **Bottleneck Identification** - Potential performance bottlenecks
7. **Trends and Patterns** - Any notable trends in the data
8. **Recommendations** - Actionable suggestions for improvement
9. **Conclusion** - Summary and next steps

Format the report in a professional, easy-to-read format with clear sections and bullet points.`;

    // Prepare Azure OpenAI API call
    const deploymentId = azureConfig.deploymentId || 'gpt-4o';
    const apiVersion = azureConfig.apiVersion || '2024-08-01-preview';
    const endpoint = azureConfig.endpoint.replace(/\/$/, '');
    
    const apiUrl = `${endpoint}/openai/deployments/${deploymentId}/chat/completions?api-version=${apiVersion}`;

    console.log('Calling Azure OpenAI:', { 
      endpoint: endpoint,
      deploymentId,
      apiVersion 
    });

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
            content: 'You are a senior performance engineer with expertise in analyzing JMeter test results and providing actionable performance insights. Generate comprehensive, data-driven performance reports.'
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
        statusText: response.statusText,
        error: errorData
      });
      
      let errorMessage = 'Failed to generate report from Azure OpenAI';
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
        JSON.stringify({ success: false, error: 'No content generated from AI' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Save report to database
    const csvFilesMetadata = csvFiles.map((file: any) => ({
      name: file.name,
      size: file.size || file.content?.length || 0
    }));

    const { data: reportData, error: insertError } = await supabase
      .from('performance_reports')
      .insert({
        project_id: projectId,
        report_name: reportName,
        report_content: reportContent,
        ai_provider: aiProvider || 'azure-openai',
        csv_files_metadata: csvFilesMetadata,
        created_by: user.id,
        status: 'completed'
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error saving report:', insertError);
      // Still return success since report was generated
      return new Response(
        JSON.stringify({ 
          success: true, 
          report: reportContent,
          warning: 'Report generated but could not be saved to database'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
        feature_type: 'performance_report_generation',
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

    console.log('Performance report generated successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        report: reportData,
        reportContent: reportContent
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-performance-report function:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message, status: 500 }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
