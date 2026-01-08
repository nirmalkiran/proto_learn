import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TestStep {
  id: string;
  type: 'navigate' | 'click' | 'type' | 'verify' | 'wait';
  selector?: string;
  value?: string;
  description: string;
}

interface StepResult {
  status: string;
  error?: string;
  step?: TestStep;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { testId, projectId, executionResults, testSteps, applyFix, proposedFixes } = await req.json();

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // If applying fixes, update the test steps
    if (applyFix && proposedFixes) {
      console.log('Applying fixes to test:', testId);
      
      const { error: updateError } = await supabaseClient
        .from('nocode_tests')
        .update({ steps: proposedFixes })
        .eq('id', testId);

      if (updateError) {
        throw new Error(`Failed to apply fixes: ${updateError.message}`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Fixes applied successfully',
          updatedSteps: proposedFixes,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Azure OpenAI config
    const { data: azureConfig } = await supabaseClient
      .from('integration_configs')
      .select('config')
      .eq('project_id', projectId)
      .eq('integration_id', 'openai')
      .single();

    const config = azureConfig?.config as any;
    
    // Check for Lovable AI or Azure OpenAI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    let apiEndpoint: string;
    let apiKey: string;
    let modelName: string;

    if (config?.azure_endpoint && config?.api_key) {
      // Use Azure OpenAI
      apiEndpoint = `${config.azure_endpoint}/openai/deployments/${config.deployment_name}/chat/completions?api-version=2024-02-15-preview`;
      apiKey = config.api_key;
      modelName = config.deployment_name;
    } else if (LOVABLE_API_KEY) {
      // Use Lovable AI
      apiEndpoint = 'https://ai.gateway.lovable.dev/v1/chat/completions';
      apiKey = LOVABLE_API_KEY;
      modelName = 'google/gemini-2.5-flash';
    } else {
      throw new Error('No AI configuration found. Please configure Azure OpenAI or ensure Lovable AI is available.');
    }

    // Find failed steps
    const failedSteps = executionResults
      .map((result: StepResult, index: number) => ({ ...result, originalIndex: index }))
      .filter((result: StepResult & { originalIndex: number }) => result.status === 'failed');

    if (failedSteps.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No failed steps to analyze',
          fixes: [],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Analyzing', failedSteps.length, 'failed steps');

    // Build prompt for AI analysis
    const prompt = `You are an expert test automation engineer specializing in fixing failing UI test steps.

Analyze the following failed test steps and provide fixes. The test uses Playwright for browser automation.

## Test Steps (Full Context):
${JSON.stringify(testSteps, null, 2)}

## Failed Steps with Errors:
${failedSteps.map((f: any) => `
Step ${f.originalIndex + 1}:
- Type: ${f.step?.type}
- Selector: ${f.step?.selector || 'N/A'}
- Value: ${f.step?.value || 'N/A'}
- Description: ${f.step?.description}
- Error: ${f.error}
`).join('\n')}

## Common Issues and Fixes:
1. **Element not found**: The selector might be incorrect. Try using more robust selectors like:
   - data-testid attributes: [data-testid="login-button"]
   - aria-labels: [aria-label="Submit"]
   - Role-based: button:has-text("Login")
   - CSS combinations: .form-group input[type="email"]

2. **Timeout errors**: Element might take time to appear. Add wait steps or use more specific selectors.

3. **Element not interactable**: Element might be hidden or covered. Check selector specificity.

4. **Text verification failed**: Expected text might be different. Check for dynamic content.

## Instructions:
Provide the COMPLETE fixed test steps array. For each step:
1. Keep working steps unchanged
2. Fix broken selectors with more robust alternatives
3. Add wait steps if timing issues are suspected
4. Improve descriptions to be more specific

Respond with ONLY valid JSON in this exact format:
{
  "analysis": "Brief explanation of what went wrong and how it was fixed",
  "fixes": [
    {
      "stepIndex": 0,
      "issue": "Description of the issue",
      "fix": "Description of the fix applied"
    }
  ],
  "fixedSteps": [
    // Complete array of ALL test steps with fixes applied
    {
      "id": "step-id",
      "type": "click",
      "selector": "fixed-selector",
      "value": "value-if-any",
      "description": "step description"
    }
  ]
}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (config?.azure_endpoint) {
      headers['api-key'] = apiKey;
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: 'You are an expert test automation engineer. Always respond with valid JSON only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || '';

    console.log('AI Response received, parsing...');

    // Parse JSON from response
    let parsedResult;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      console.log('Raw content:', content);
      throw new Error('Failed to parse AI response');
    }

    return new Response(
      JSON.stringify({
        success: true,
        analysis: parsedResult.analysis,
        fixes: parsedResult.fixes || [],
        fixedSteps: parsedResult.fixedSteps || [],
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Auto-heal error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
