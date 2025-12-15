import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const startTime = Date.now();
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    let userId = null;
    let projectId = null;
    
    if (authHeader) {
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
      userId = user?.id;
    }
    
    const { htmlDom, mockupImages, azureConfig, projectId: reqProjectId } = await req.json();
    projectId = reqProjectId;
    
    if (!htmlDom && (!mockupImages || mockupImages.length === 0)) {
      return new Response(
        JSON.stringify({ error: 'Either HTML DOM or mockup images are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if Azure OpenAI config is provided
    const useAzure = azureConfig && azureConfig.endpoint && azureConfig.apiKey && azureConfig.deploymentId;
    
    console.log('Azure config check:', {
      hasConfig: !!azureConfig,
      hasEndpoint: !!azureConfig?.endpoint,
      hasApiKey: !!azureConfig?.apiKey,
      hasDeploymentId: !!azureConfig?.deploymentId,
      useAzure
    });
    
    if (!useAzure) {
      // Fallback to OpenAI
      const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
      if (!OPENAI_API_KEY) {
        console.error('No Azure config provided and OPENAI_API_KEY not configured');
        return new Response(
          JSON.stringify({ error: 'AI configuration not found. Please configure Azure OpenAI in integrations.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log(`Using ${useAzure ? 'Azure OpenAI' : 'OpenAI'} for element extraction`);

    // Prepare messages for OpenAI
    const messages: any[] = [
      {
        role: 'system',
        content: `You are an expert test automation engineer. Extract interactive UI elements from the provided HTML DOM structure. 
For each element, provide:
1. A descriptive camelCase name (e.g., loginButton, emailInput, submitBtn)
2. The most reliable locator strategy using ONLY valid Selenium @FindBy strategies:
   - id (highest priority if available)
   - name
   - className (for class attributes)
   - css (for CSS selectors)
   - xpath (fallback for complex locators)
   - linkText (for links with exact text)
   - partialLinkText (for links with partial text)
   - tagName (rarely used)
   
   IMPORTANT LOCATOR FORMAT:
   - For standard attributes: Use format attribute="value" (e.g., id="loginBtn", name="username")
   - For custom attributes (data-testid, formcontrolname, ng-model, etc.): Use format attribute="value" (e.g., formcontrolname="activity")
   - The code generator will convert custom attributes to xpath automatically
   - DO NOT add "xpath = " prefix yourself
   
3. The HTML tag name
4. The complete XPath

Focus on interactive elements: buttons, inputs, links, selects, textareas, and elements with click handlers.
Avoid duplicate elements - only include unique, identifiable elements.`
      }
    ];

    // Add HTML DOM as text content if provided
    const userContent: any[] = [];
    
    if (htmlDom) {
      userContent.push({
        type: 'text',
        text: `Extract UI elements from this HTML DOM:\n\n${htmlDom}`
      });
    } else {
      userContent.push({
        type: 'text',
        text: `Extract UI elements from the provided mockup images. Identify interactive elements like buttons, inputs, links, and other UI components.`
      });
    }

    // Add mockup images if provided
    if (mockupImages && Array.isArray(mockupImages) && mockupImages.length > 0) {
      for (const imageData of mockupImages) {
        userContent.push({
          type: 'image_url',
          image_url: {
            url: imageData // Should be base64 data URL
          }
        });
      }
    }

    messages.push({
      role: 'user',
      content: userContent
    });

    console.log(`Calling ${useAzure ? 'Azure OpenAI' : 'OpenAI'} to extract elements...`);

    let apiUrl: string;
    let apiHeaders: Record<string, string>;
    let requestBody: any;

    const toolsDefinition = [
      {
        type: 'function',
        function: {
          name: 'extract_ui_elements',
          description: 'Extract interactive UI elements with their locators from HTML',
          parameters: {
            type: 'object',
            properties: {
              elements: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: {
                      type: 'string',
                      description: 'Descriptive camelCase name for the element'
                    },
                    locatorStrategy: {
                      type: 'string',
                      description: 'Locator strategy (e.g., "id = \'loginBtn\'" or "className = \'submit-button\'")'
                    },
                    tagName: {
                      type: 'string',
                      description: 'HTML tag name (e.g., button, input, a)'
                    },
                    xpath: {
                      type: 'string',
                      description: 'Complete XPath for the element'
                    }
                  },
                  required: ['name', 'locatorStrategy', 'tagName', 'xpath']
                }
              }
            },
            required: ['elements']
          }
        }
      }
    ];

    if (useAzure) {
      // Azure OpenAI configuration
      const { endpoint, apiKey, deploymentId } = azureConfig;
      apiUrl = `${endpoint}/openai/deployments/${deploymentId}/chat/completions?api-version=2024-08-01-preview`;
      apiHeaders = {
        'api-key': apiKey,
        'Content-Type': 'application/json',
      };
      requestBody = {
        messages: messages,
        tools: toolsDefinition,
        tool_choice: { type: 'function', function: { name: 'extract_ui_elements' } }
      };
      console.log('Azure OpenAI URL:', apiUrl);
    } else {
      // OpenAI configuration
      const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
      apiUrl = 'https://api.openai.com/v1/chat/completions';
      apiHeaders = {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      };
      requestBody = {
        model: 'gpt-4o',
        messages: messages,
        tools: toolsDefinition,
        tool_choice: { type: 'function', function: { name: 'extract_ui_elements' } }
      };
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: apiHeaders,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${useAzure ? 'Azure OpenAI' : 'OpenAI'} API error:`, response.status, errorText);
      return new Response(
        JSON.stringify({ 
          error: `Failed to extract elements from ${useAzure ? 'Azure OpenAI' : 'OpenAI'}`,
          details: `Status: ${response.status}`,
          message: errorText.substring(0, 200)
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('OpenAI response received');

    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || !toolCall.function?.arguments) {
      console.error('No tool call in response');
      return new Response(
        JSON.stringify({ error: 'Failed to extract elements - no results from AI' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const extractedData = JSON.parse(toolCall.function.arguments);
    const elements = extractedData.elements || [];

    // Validate and normalize elements to ensure locatorStrategy is always a string
    const validatedElements = elements.map((element: any) => {
      // Ensure locatorStrategy is a string
      let locatorStrategy = element.locatorStrategy;
      if (typeof locatorStrategy !== 'string') {
        console.warn('Invalid locatorStrategy format:', locatorStrategy);
        // Try to convert to string or use xpath as fallback
        if (locatorStrategy && typeof locatorStrategy === 'object') {
          locatorStrategy = JSON.stringify(locatorStrategy);
        } else {
          locatorStrategy = `xpath = "${element.xpath || ''}"`;
        }
      }

      return {
        name: String(element.name || 'unknownElement'),
        locatorStrategy: locatorStrategy,
        tagName: String(element.tagName || 'div'),
        xpath: String(element.xpath || '//*')
      };
    });

    console.log(`Successfully extracted ${validatedElements.length} elements`);
    
    // Log AI usage
    if (userId) {
      const executionTime = Date.now() - startTime;
      const usage = data.usage || {};
      const cost = ((usage.prompt_tokens || 0) * 0.00003 / 1000) + ((usage.completion_tokens || 0) * 0.00006 / 1000);
      
      const supabase = createClient(supabaseUrl, supabaseKey);
      try {
        await supabase.from('ai_usage_logs').insert({
          user_id: userId,
          project_id: projectId || null,
          feature_type: 'element_extraction',
          success: true,
          execution_time_ms: executionTime,
          openai_model: data.model || (useAzure ? 'azure-gpt-4o' : 'gpt-4o'),
          openai_tokens_prompt: usage.prompt_tokens || 0,
          openai_tokens_completion: usage.completion_tokens || 0,
          tokens_used: usage.total_tokens || 0,
          openai_cost_usd: cost,
        });
      } catch (logError) {
        console.error('Failed to log AI usage:', logError);
      }
    }

    return new Response(
      JSON.stringify({ elements: validatedElements }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in extract-page-elements function:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
