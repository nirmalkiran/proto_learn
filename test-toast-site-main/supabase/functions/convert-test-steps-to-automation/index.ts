import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TestStep {
  step: string;
  expectedResult?: string;
  testData?: string;
}

interface ExtractedElement {
  name: string;
  xpath: string;
  tagName: string;
  locatorStrategy: string;
}

interface AutomationStep {
  id: string;
  type: 'navigate' | 'click' | 'input' | 'verify' | 'wait';
  description: string;
  selector?: string;
  value?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { testSteps, baseUrl, projectId, extractedElements } = await req.json();

    if (!testSteps || !Array.isArray(testSteps)) {
      return new Response(
        JSON.stringify({ error: 'Invalid test steps provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!projectId) {
      return new Response(
        JSON.stringify({ error: 'Project ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch Azure OpenAI configuration from database
    const { data: configData, error: configError } = await supabase
      .from('integration_configs')
      .select('config')
      .eq('project_id', projectId)
      .eq('integration_id', 'openai')
      .eq('enabled', true)
      .single();

    if (configError || !configData) {
      console.error('Azure OpenAI integration not configured for this project:', configError);
      return new Response(
        JSON.stringify({ 
          error: 'Azure OpenAI not configured',
          details: 'Please configure Azure OpenAI integration in the Integrations tab'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const config = configData.config as any;
    const azureEndpoint = config.endpoint;
    const azureApiKey = config.apiKey;
    const deploymentId = config.deploymentId || 'gpt-4o';
    const apiVersion = config.apiVersion || '2024-08-01-preview';

    if (!azureApiKey || !azureEndpoint || !deploymentId) {
      console.error('Incomplete Azure OpenAI configuration');
      return new Response(
        JSON.stringify({ 
          error: 'Azure OpenAI not properly configured',
          details: 'Missing endpoint, API key, or deployment ID'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate endpoint URL format
    if (!azureEndpoint.startsWith('http://') && !azureEndpoint.startsWith('https://')) {
      console.error('Invalid Azure OpenAI endpoint format:', azureEndpoint);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid Azure OpenAI endpoint',
          details: 'Endpoint must start with http:// or https://'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build system prompt with extracted elements if available
    let extractedElementsContext = '';
    if (extractedElements && Array.isArray(extractedElements) && extractedElements.length > 0) {
      extractedElementsContext = `

AVAILABLE UI ELEMENTS (extracted from page/mockup):
${extractedElements.map((el: ExtractedElement, idx: number) => `
Element ${idx + 1}:
  Name: ${el.name}
  Tag: ${el.tagName}
  Locator: ${el.locatorStrategy}
  XPath: ${el.xpath}
`).join('')}

IMPORTANT: When converting steps, prefer using the selectors from the extracted elements above when they match the step action. This ensures accurate and reliable automation.`;
    }

    const systemPrompt = `You are an expert test automation engineer. Convert natural language test steps into structured automation steps.

For each step, identify:
1. Action type: navigate, click, input, verify, or wait
2. CSS selector: The most reliable selector (prefer data-testid, id, or unique class names)
3. Value: Any input value or expected text for verification
4. Description: Clear description of what the step does
${extractedElementsContext}

Return a JSON array with this exact structure:
[
  {
    "id": "unique-id",
    "type": "navigate|click|input|verify|wait",
    "description": "Clear description",
    "selector": "css-selector (optional for navigate/wait)",
    "value": "input value or expected text (optional)"
  }
]

ACTION TYPE MAPPING (CRITICAL - follow these rules strictly):
- "input" type: Use for ANY step that involves entering/typing/filling text. Keywords: "enter", "type", "input", "fill", "write", "provide", "set", "specify", "key in", "add text", "put value"
- "click" type: Use for clicking buttons, links, checkboxes, radio buttons. Keywords: "click", "press", "tap", "select", "check", "toggle", "submit"
- "navigate" type: Use for opening URLs, going to pages. Keywords: "navigate", "go to", "open", "visit", "launch", "browse to"
- "verify" type: Use for checking/validating displayed content. Keywords: "verify", "check", "assert", "validate", "confirm", "ensure", "should see", "should display"
- "wait" type: Use for waiting/pausing. Keywords: "wait", "pause", "delay", "sleep"

Guidelines:
- For navigation steps, use type "navigate" and put URL in value
- For clicks, identify the button/link selector
- For inputs (enter/type/fill), ALWAYS use type "input" and identify the input field selector
- For verifications, use type "verify" and specify what to check
- For waits, specify duration in value (e.g., "2000" for 2 seconds)
- Make selectors as specific and reliable as possible
- If test data is provided, incorporate it into the automation step
- If extracted elements are provided, use their locators for better accuracy
- CRITICAL: Keep all "value" fields SHORT (max 100 characters). For long test data, use a descriptive placeholder like "test_value_1" or "sample_text" instead of generating very long strings.`;

    const userPrompt = `Base URL: ${baseUrl || 'Not provided'}

Natural Language Test Steps:
${testSteps.map((step: TestStep, idx: number) => `
Step ${idx + 1}:
  Action: ${step.step}
  ${step.expectedResult ? `Expected Result: ${step.expectedResult}` : ''}
  ${step.testData ? `Test Data: ${step.testData.substring(0, 200)}${step.testData.length > 200 ? '...(truncated)' : ''}` : ''}
`).join('\n')}

Convert these into structured automation steps. Return ONLY the JSON array, no additional text. Keep all value fields short (max 100 chars).`;

    console.log('Calling Azure OpenAI for step conversion...');
    console.log('Using endpoint:', azureEndpoint);
    console.log('Using deployment:', deploymentId);

    // Ensure endpoint doesn't have trailing slash
    const cleanEndpoint = azureEndpoint.replace(/\/$/, '');
    const apiUrl = `${cleanEndpoint}/openai/deployments/${deploymentId}/chat/completions?api-version=${apiVersion}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': azureApiKey,
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Azure OpenAI API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to convert steps with AI' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content;
    const finishReason = data.choices?.[0]?.finish_reason;

    if (!aiResponse) {
      console.error('No response from Azure OpenAI');
      return new Response(
        JSON.stringify({ error: 'No response from AI' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if response was truncated
    if (finishReason === 'length') {
      console.error('AI response was truncated due to token limit');
      return new Response(
        JSON.stringify({ error: 'AI response was truncated. Please try with fewer test steps.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('AI Response:', aiResponse.substring(0, 500) + (aiResponse.length > 500 ? '...' : ''));

    // Parse the JSON response
    let automationSteps: AutomationStep[];
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = aiResponse.match(/```json\n?([\s\S]*?)\n?```/) || aiResponse.match(/\[[\s\S]*\]/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : aiResponse;
      automationSteps = JSON.parse(jsonStr);

      // Ensure each step has an ID
      automationSteps = automationSteps.map((step, idx) => ({
        ...step,
        id: step.id || `step-${idx + 1}`
      }));
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      console.error('Raw response:', aiResponse);
      return new Response(
        JSON.stringify({ error: 'Failed to parse AI response', details: aiResponse }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ automationSteps }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in convert-test-steps-to-automation:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
