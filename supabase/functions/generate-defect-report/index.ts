import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get user from auth
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const startTime = Date.now();
    
    const {
      scenario,
      steps,
      expectedResult,
      actualResult,
      priority,
      projectId,
      azureOpenAiConfig
    } = await req.json();

    console.log('Request body:', {
      scenario: scenario?.length || 0,
      steps: steps?.length || 0,
      expectedResult: expectedResult?.length || 0,
      actualResult: actualResult?.length || 0,
      priority,
      projectId,
      hasAzureConfig: !!azureOpenAiConfig
    });

    // Validate required fields
    if (!scenario?.trim()) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Scenario is required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!azureOpenAiConfig?.apiKey || !azureOpenAiConfig?.endpoint || !azureOpenAiConfig?.deploymentId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Azure OpenAI configuration is incomplete. Please check your API key, endpoint, and deployment ID.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Construct the Azure OpenAI URL
    const { endpoint, deploymentId, apiVersion = '2024-02-15-preview' } = azureOpenAiConfig;
    const azureUrl = `${endpoint.replace(/\/$/, '')}/openai/deployments/${deploymentId}/chat/completions?api-version=${apiVersion}`;

    // Prepare the prompt for defect report generation
    const systemPrompt = `You are an expert QA engineer. Generate a comprehensive defect report based on the provided information. 
    Return your response as a JSON object with the following structure:
    {
      "title": "Clear, concise defect title",
      "stepsToReproduce": ["Step 1", "Step 2", "Step 3"],
      "actualResult": "What actually happened",
      "expectedResult": "What should have happened", 
      "priority": "P1|P2|P3|P4",
      "severity": "1 - Critical|2 - High|3 - Medium|4 - Low"
    }`;

    const userPrompt = `Generate a defect report for the following:

    Scenario: ${scenario}
    ${steps ? `Steps/Logs: ${steps}` : ''}
    ${expectedResult ? `Expected Result: ${expectedResult}` : ''}
    ${actualResult ? `Actual Result: ${actualResult}` : ''}
    Priority Level: ${priority || 'medium'}

    Please provide a comprehensive defect report with clear steps to reproduce the issue.`;

    console.log('Making request to Azure OpenAI...');

    // Call Azure OpenAI API
    const response = await fetch(azureUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${azureOpenAiConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 1500,
        temperature: 0.7
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Azure OpenAI API Error:', response.status, errorText);
      
      return new Response(JSON.stringify({
        success: false,
        error: `Azure OpenAI API error: ${response.status} - ${errorText}`
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    console.log('Azure OpenAI Response:', data);

    if (!data.choices || !data.choices[0]?.message?.content) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No response content from Azure OpenAI'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const generatedContent = data.choices[0].message.content;
    console.log('Generated content:', generatedContent);

    // Try to parse the JSON response
    let defectReport;
    try {
      // Extract JSON from the response (in case there's extra text)
      const jsonMatch = generatedContent.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : generatedContent;
      defectReport = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse JSON response:', parseError);
      // Fallback: return the raw text
      defectReport = {
        title: "Generated Defect Report",
        stepsToReproduce: ["Review the detailed description below"],
        actualResult: generatedContent,
        expectedResult: expectedResult || "Application should work correctly",
        priority: "P3",
        severity: "3 - Medium"
      };
    }

    // Ensure required fields exist
    if (!defectReport.title) defectReport.title = "Generated Defect Report";
    if (!defectReport.stepsToReproduce || !Array.isArray(defectReport.stepsToReproduce)) {
      defectReport.stepsToReproduce = ["Please review the scenario and logs provided"];
    }
    if (!defectReport.actualResult) defectReport.actualResult = actualResult || "Unexpected behavior occurred";
    if (!defectReport.expectedResult) defectReport.expectedResult = expectedResult || "Application should work correctly";
    if (!defectReport.priority) defectReport.priority = "P3";
    if (!defectReport.severity) defectReport.severity = "3 - Medium";

    // Calculate usage statistics
    const endTime = Date.now();
    const executionTime = endTime - startTime;
    const usage = data.usage || {};
    
    // Log AI usage for analytics
    try {
      await supabase.from('ai_usage_logs').insert({
        user_id: user.id,
        project_id: projectId,
        feature_type: 'defect_generation',
        success: true,
        execution_time_ms: executionTime,
        tokens_used: usage.total_tokens || (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
        openai_model: 'azure-openai', // Azure OpenAI model
        openai_tokens_prompt: usage.prompt_tokens || 0,
        openai_tokens_completion: usage.completion_tokens || 0,
        openai_cost_usd: 0 // Azure OpenAI cost calculation would need pricing info
      });
    } catch (logError) {
      console.error('Failed to log AI usage:', logError);
      // Don't fail the request if logging fails
    }

    return new Response(JSON.stringify({
      success: true,
      report: generatedContent,
      parsedReport: defectReport
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-defect-report function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});