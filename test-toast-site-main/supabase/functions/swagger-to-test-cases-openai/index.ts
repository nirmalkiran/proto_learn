// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
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
    console.log('Swagger to test cases function called');
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
    const { swaggerSpec, azureConfig, customPrompt, projectId, endpointCount } = body;

    // Input validation
    if (!swaggerSpec || typeof swaggerSpec !== 'object') {
      return new Response(
        JSON.stringify({ error: 'Valid Swagger specification is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate Azure OpenAI config with detailed error messages
    if (!azureConfig) {
      return new Response(
        JSON.stringify({ 
          error: 'Azure OpenAI configuration incomplete',
          details: 'Missing Azure OpenAI configuration object'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!azureConfig.endpoint) {
      return new Response(
        JSON.stringify({ 
          error: 'Azure OpenAI configuration incomplete',
          details: 'Missing API endpoint'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!azureConfig.apiKey) {
      return new Response(
        JSON.stringify({ 
          error: 'Azure OpenAI configuration incomplete',
          details: 'Missing API key'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!azureConfig.deploymentId) {
      return new Response(
        JSON.stringify({ 
          error: 'Azure OpenAI configuration incomplete',
          details: 'Missing deployment name'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Generating test cases from Swagger spec`);

    // Extract API endpoints from Swagger spec
    const paths = swaggerSpec.paths || {};
    const apiEndpoints = Object.keys(paths).map(path => {
      const methods = paths[path];
      return Object.keys(methods).filter(m => !m.startsWith('x-')).map(method => ({
        path,
        method: method.toUpperCase(),
        ...methods[method]
      }));
    }).flat();

    const numEndpoints = endpointCount || apiEndpoints.length;
    // Calculate test cases per endpoint: aim for 3-5 per endpoint
    const testsPerEndpoint = numEndpoints <= 10 ? 5 : (numEndpoints <= 30 ? 3 : 2);
    const totalTestsTarget = numEndpoints * testsPerEndpoint;

    let prompt = `Generate comprehensive test cases for the following REST API based on the Swagger/OpenAPI specification:

API Title: ${swaggerSpec.info?.title || 'API'}
Description: ${swaggerSpec.info?.description || 'No description provided'}
Version: ${swaggerSpec.info?.version || '1.0.0'}

API Endpoints (${apiEndpoints.length} total):
${apiEndpoints.map(endpoint => 
  `${endpoint.method} ${endpoint.path} - ${endpoint.summary || endpoint.description || 'No description'}`
).join('\n')}

Full Swagger Specification:
${JSON.stringify(swaggerSpec, null, 2)}`;

    // Add custom prompt instructions if provided
    if (customPrompt && customPrompt.trim()) {
      prompt += `

ADDITIONAL CUSTOM REQUIREMENTS:
${customPrompt.trim()}

Please ensure the test cases incorporate these custom requirements along with the standard API test types listed below.`;
    }

    prompt += `

CRITICAL REQUIREMENT: Generate ${testsPerEndpoint} test cases PER ENDPOINT. You have ${apiEndpoints.length} endpoints, so generate approximately ${totalTestsTarget} test cases total.

For EACH endpoint, generate test cases that include:
1. At least 1 positive test scenario (happy path with valid data)
2. At least 1 negative test scenario (invalid inputs, missing required fields)
3. Additional tests for edge cases, authentication, or validation as appropriate

Make sure EVERY endpoint listed above has its own test cases. Do NOT skip any endpoints.

Format the response as a JSON array of test case objects with the following structure:
{
  "id": "API_TC001",
  "title": "Test case title",
  "description": "Detailed test case description",
  "type": "positive|negative|edge|boundary|auth|validation|error|performance",
  "priority": "high|medium|low",
  "endpoint": "/exact/path/from/spec",
  "method": "GET|POST|PUT|DELETE|PATCH",
  "headers": {"Content-Type": "application/json", "Authorization": "Bearer {token}"},
  "requestBody": {},
  "steps": ["Step 1", "Step 2", "Step 3"],
  "expectedResult": "Expected outcome",
  "expectedStatusCode": 200,
  "testData": "Sample test data, input values, or data sets needed for this test case",
  "category": "functional|security|performance|integration"
}

IMPORTANT: 
- The "endpoint" field MUST match the exact path from the specification (e.g., "/users/{id}", "/products")
- Generate tests for ALL ${apiEndpoints.length} endpoints
- Total test cases should be approximately ${totalTestsTarget}

CRITICAL: Return ONLY a valid JSON array. Do not include markdown code blocks, explanations, or any text outside the JSON array.`;

    // Build Azure OpenAI endpoint from user config
    const azureEndpoint = `${azureConfig.endpoint}/openai/deployments/${azureConfig.deploymentId}/chat/completions?api-version=${azureConfig.apiVersion || '2024-02-15-preview'}`;
    
    console.log('Calling Azure OpenAI with endpoint:', azureEndpoint.split('?')[0]);
    
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
            content: 'You are an API testing expert who generates comprehensive test cases for REST APIs based on Swagger/OpenAPI specifications. Return ONLY a valid JSON array with proper closing brackets. Never truncate the response.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 16000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Azure OpenAI API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ 
          error: `Azure OpenAI API error: ${response.status}`,
          details: errorText
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    let content = data.choices[0].message.content;

    console.log('Response finish reason:', data.choices[0].finish_reason);
    console.log('Response content length:', content?.length);

    // Check if response was truncated
    if (data.choices[0].finish_reason === 'length') {
      console.warn('Response was truncated due to max_tokens limit');
      return new Response(
        JSON.stringify({
          error: 'Response truncated',
          details: 'The generated test cases were too long. Please try with a smaller Swagger specification or fewer endpoints.',
          finishReason: 'length'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Clean up the content - remove markdown code blocks if present
    if (content.includes('```json')) {
      content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    } else if (content.includes('```')) {
      content = content.replace(/```\n?/g, '');
    }
    content = content.trim();

    // Calculate cost (Azure OpenAI gpt-4o pricing may vary - using standard rates as estimate)
    const promptTokens = data.usage?.prompt_tokens || 0;
    const completionTokens = data.usage?.completion_tokens || 0;
    const totalTokens = data.usage?.total_tokens || 0;
    const cost = (promptTokens * 0.00003 / 1000) + (completionTokens * 0.00006 / 1000); // GPT-4o Azure pricing estimate

    // Log usage to analytics
    try {
      await supabase.from('ai_usage_logs').insert({
        user_id: user.id,
        project_id: projectId || null,
        feature_type: 'swagger_test_case_generation',
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
      // Validate JSON structure before parsing
      if (!content.startsWith('[') && !content.startsWith('{')) {
        throw new Error('Response does not start with valid JSON');
      }

      // Parse the JSON response from OpenAI
      let testCases;
      try {
        testCases = JSON.parse(content);
      } catch (jsonError) {
        console.error('Initial JSON parse failed, attempting to fix incomplete JSON');
        
        // Try to fix incomplete JSON by ensuring it ends with closing brackets
        let fixedContent = content.trim();
        const openBrackets = (fixedContent.match(/\[/g) || []).length;
        const closeBrackets = (fixedContent.match(/\]/g) || []).length;
        const openBraces = (fixedContent.match(/\{/g) || []).length;
        const closeBraces = (fixedContent.match(/\}/g) || []).length;
        
        // Remove incomplete last object if exists
        const lastCompleteObject = fixedContent.lastIndexOf('},');
        if (lastCompleteObject > 0 && openBrackets > closeBrackets) {
          fixedContent = fixedContent.substring(0, lastCompleteObject + 1);
        }
        
        // Add missing closing brackets
        for (let i = 0; i < (openBraces - closeBraces); i++) {
          fixedContent += '}';
        }
        for (let i = 0; i < (openBrackets - closeBrackets); i++) {
          fixedContent += ']';
        }
        
        console.log('Attempting to parse fixed JSON');
        testCases = JSON.parse(fixedContent);
      }
      
      // Add additional metadata
      const enrichedTestCases = testCases.map((testCase: any, index: number) => ({
        ...testCase,
        id: testCase.id || `API_TC${String(index + 1).padStart(3, '0')}`,
        apiTitle: swaggerSpec.info?.title || 'API',
        generatedAt: new Date().toISOString(),
        source: `Azure OpenAI ${azureConfig.deploymentId}`,
        swaggerVersion: swaggerSpec.info?.version || '1.0.0'
      }));

      // Convert test cases to CSV format for UI compatibility
      const csvHeaders = ['ID', 'Title', 'Description', 'Type', 'Priority', 'Endpoint', 'Method', 'Steps', 'Expected Result', 'Status Code', 'Test Data', 'Category', 'Assertions', 'Parameters', 'Headers', 'Body', 'Authorization'];
      const csvData = [
        csvHeaders,
        ...enrichedTestCases.map(tc => [
          tc.id || '',
          tc.title || '',
          tc.description || '',
          tc.type || '',
          tc.priority || '',
          tc.endpoint || '',
          tc.method || '',
          Array.isArray(tc.steps) ? tc.steps.join('; ') : (tc.steps || ''),
          tc.expectedResult || '',
          tc.expectedStatusCode?.toString() || '',
          typeof tc.testData === 'object' ? JSON.stringify(tc.testData) : (tc.testData || ''),
          tc.category || '',
          JSON.stringify([{type: 'status_code', condition: 'equals', value: tc.expectedStatusCode?.toString() || '200', description: 'Verify status code'}]),
          JSON.stringify([]), // Parameters
          JSON.stringify(tc.headers || {}), // Headers
          typeof tc.requestBody === 'object' ? JSON.stringify(tc.requestBody, null, 2) : (tc.requestBody || ''), // Body
          JSON.stringify({type: 'none', token: ''}) // Authorization
        ])
      ];

      // Generate Postman collection
      const postmanCollection = {
        info: {
          name: `${swaggerSpec.info?.title || 'API'} Test Collection`,
          description: `Generated test collection for ${swaggerSpec.info?.title || 'API'}`,
          schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
        },
        item: enrichedTestCases.map(tc => ({
          name: tc.title,
          request: {
            method: tc.method || 'GET',
            header: Object.entries(tc.headers || {}).map(([key, value]) => ({
              key,
              value: value.toString(),
              type: 'text'
            })),
            body: tc.requestBody ? {
              mode: 'raw',
              raw: JSON.stringify(tc.requestBody, null, 2),
              options: {
                raw: {
                  language: 'json'
                }
              }
            } : undefined,
            url: {
              raw: `{{baseUrl}}${tc.endpoint?.replace(/^[A-Z]+\s+/, '') || '/'}`,
              host: ['{{baseUrl}}'],
              path: (tc.endpoint?.replace(/^[A-Z]+\s+/, '') || '/').split('/').filter(Boolean)
            },
            description: tc.description
          },
          response: []
        })),
        variable: [
          {
            key: "baseUrl",
            value: swaggerSpec.servers?.[0]?.url || "https://api.example.com",
            type: "string"
          }
        ]
      };

      console.log(`Generated ${enrichedTestCases.length} API test cases from Swagger spec`);

      return new Response(
        JSON.stringify({
          success: true,
          csvData,
          postmanCollection,
          testCases: enrichedTestCases,
          metadata: {
            provider: 'Azure OpenAI',
            model: azureConfig.deploymentId,
            totalTests: enrichedTestCases.length,
            generatedAt: new Date().toISOString()
          },
          apiInfo: {
            title: swaggerSpec.info?.title || 'API',
            version: swaggerSpec.info?.version || '1.0.0',
            description: swaggerSpec.info?.description || 'No description provided'
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (parseError) {
      console.error('Failed to parse OpenAI response as JSON:', parseError);
      console.log('Raw content:', content);
      
      // Log failed usage
      try {
        await supabase.from('ai_usage_logs').insert({
          user_id: user.id,
          project_id: projectId || null,
          feature_type: 'swagger_test_case_generation',
          tokens_used: data.usage?.total_tokens || 0,
          openai_model: `azure-${azureConfig.deploymentId}`,
          openai_tokens_prompt: data.usage?.prompt_tokens || 0,
          openai_tokens_completion: data.usage?.completion_tokens || 0,
          openai_cost_usd: ((data.usage?.prompt_tokens || 0) * 0.00015 / 1000) + ((data.usage?.completion_tokens || 0) * 0.0006 / 1000),
          execution_time_ms: Date.now() - startTime,
          success: false
        });
      } catch (logError) {
        console.error('Failed to log AI usage:', logError);
      }
      
      return new Response(
        JSON.stringify({
          error: 'Failed to parse generated test cases',
          details: 'Azure OpenAI response was not valid JSON',
          rawContent: content
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Error in swagger-to-test-cases-openai function:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to generate test cases from Swagger spec',
        details: error.message
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});