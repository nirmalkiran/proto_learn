import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Generate API flow function called');
    const startTime = Date.now();

    // Get user from auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header missing' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { endpoints, azureConfig, flowDescription, projectId } = body;

    // Input validation
    if (!endpoints || !Array.isArray(endpoints) || endpoints.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Endpoints array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate Azure OpenAI config
    if (!azureConfig || !azureConfig.endpoint || !azureConfig.apiKey || !azureConfig.deploymentId) {
      return new Response(
        JSON.stringify({ error: 'Azure OpenAI configuration is required (endpoint, apiKey, deploymentId)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Generating API flow for ${endpoints.length} endpoints`);

    // Build endpoints context for the AI
    const endpointsContext = endpoints.map((ep: any) => {
      const testCasesInfo = ep.testCases?.map((tc: any) => ({
        id: tc.id,
        name: tc.name,
        type: tc.type,
        method: tc.method,
        expectedStatus: tc.expectedStatus,
        hasBody: !!tc.body,
        hasParameters: !!tc.parameters && Object.keys(tc.parameters).length > 0
      })) || [];

      return {
        id: ep.id,
        method: ep.method,
        path: ep.path,
        summary: ep.summary,
        description: ep.description,
        tags: ep.tags,
        hasRequestBody: !!ep.requestBody,
        parameters: ep.parameters?.map((p: any) => ({
          name: p.name,
          in: p.in,
          required: p.required
        })),
        testCases: testCasesInfo
      };
    });

    const prompt = `You are an expert API testing specialist. Analyze the following API endpoints and their test cases to generate logical End-to-End (E2E) API test flows.

## Available Endpoints and Test Cases:
${JSON.stringify(endpointsContext, null, 2)}

${flowDescription ? `## User Requirements:\n${flowDescription}\n` : ''}

## Task:
Generate 2-4 meaningful E2E API flows that chain multiple API calls together in a logical sequence. Each flow should:

1. **Represent a real business workflow** (e.g., "Create User → Login → Update Profile → Delete User")
2. **Include variable extraction** from responses to pass data between steps (e.g., extract user ID from create response, use in subsequent calls)
3. **Include variable injection** to use extracted data in subsequent requests
4. **Follow logical order** (create before update, authenticate before protected operations)
5. **Cover different scenarios** (happy path, edge cases if applicable)

## Response Format:
Return a JSON array of flow objects with this exact structure:
[
  {
    "name": "Flow Name",
    "description": "Brief description of what this flow tests",
    "steps": [
      {
        "endpointId": "endpoint-id-from-input",
        "testCaseId": "test-case-id-from-input",
        "order": 0,
        "extractVariables": [
          {
            "variableName": "userId",
            "source": "response_body",
            "jsonPath": "$.data.id"
          }
        ],
        "injectVariables": []
      },
      {
        "endpointId": "another-endpoint-id",
        "testCaseId": "another-test-case-id",
        "order": 1,
        "extractVariables": [],
        "injectVariables": [
          {
            "variableName": "userId",
            "target": "path",
            "paramName": "id"
          }
        ]
      }
    ]
  }
]

IMPORTANT:
- Use ONLY the endpoint IDs and test case IDs provided in the input
- Each step must reference valid endpointId and testCaseId from the available endpoints
- Variable names should be descriptive (userId, authToken, createdItemId, etc.)
- jsonPath should follow JSONPath syntax ($.data.id, $.token, $.items[0].id)
- source can be "response_body" or "response_header"
- target can be "path", "query", "header", or "body"

Return ONLY valid JSON. No markdown, no explanations.`;

    // Build Azure OpenAI endpoint
    const azureEndpoint = `${azureConfig.endpoint}/openai/deployments/${azureConfig.deploymentId}/chat/completions?api-version=${azureConfig.apiVersion}`;
    
    console.log('Calling Azure OpenAI...');
    const response = await fetch(azureEndpoint, {
      method: 'POST',
      headers: {
        'api-key': azureConfig.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are an expert API testing specialist who generates comprehensive E2E API test flows. Return only valid JSON arrays without any markdown formatting or explanations.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 3000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Azure OpenAI API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `Azure OpenAI API error: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    // Calculate cost
    const promptTokens = data.usage?.prompt_tokens || 0;
    const completionTokens = data.usage?.completion_tokens || 0;
    const totalTokens = data.usage?.total_tokens || 0;
    const cost = (promptTokens * 0.00003 / 1000) + (completionTokens * 0.00006 / 1000);

    // Log usage
    try {
      await supabase.from('ai_usage_logs').insert({
        user_id: user.id,
        project_id: projectId,
        feature_type: 'api_flow_generation',
        tokens_used: totalTokens,
        openai_model: `azure-${azureConfig.deploymentId}`,
        openai_tokens_prompt: promptTokens,
        openai_tokens_completion: completionTokens,
        openai_cost_usd: cost,
        execution_time_ms: Date.now() - startTime,
        success: true
      });
    } catch (logError) {
      console.error('Failed to log AI usage:', logError);
    }

    try {
      // Try to extract JSON array
      let sanitizedContent = content;
      const jsonMatch = sanitizedContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        sanitizedContent = jsonMatch[0];
      }
      
      const generatedFlows = JSON.parse(sanitizedContent);
      
      // Enrich flows with IDs and timestamps
      const enrichedFlows = generatedFlows.map((flow: any) => ({
        ...flow,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        steps: flow.steps.map((step: any) => ({
          ...step,
          id: crypto.randomUUID()
        }))
      }));

      console.log(`Generated ${enrichedFlows.length} API flows`);

      return new Response(
        JSON.stringify({
          success: true,
          flows: enrichedFlows
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (parseError) {
      console.error('Failed to parse OpenAI response as JSON:', parseError);
      console.log('Raw content:', content);
      
      return new Response(
        JSON.stringify({
          error: 'Failed to parse generated flows',
          details: 'Azure OpenAI response was not valid JSON',
          rawContent: content
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Error in generate-api-flow function:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to generate API flows',
        details: error.message
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
