// @ts-nocheck
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface JMeterConfig {
  threadCount: number;
  rampUpTime: number;
  loopCount: number;
  duration?: number;
  baseUrl: string;
  testPlanName: string;
  groupByTags: boolean;
  addAssertions: boolean;
  addCorrelation: boolean;
  addCsvData: boolean;
  responseTimeout: number;
  connectTimeout: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    let userId = null;
    let projectId = null;
    
    if (authHeader) {
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
      userId = user?.id;
    }
    
    const { swaggerContent, config, aiProvider = 'openai', projectId: reqProjectId }: {
      swaggerContent: string;
      config: JMeterConfig;
      aiProvider?: string;
      projectId?: string;
    } = await req.json();
    
    projectId = reqProjectId;

    // Normalize config - handle both naming conventions from different components
    const normalizedConfig: JMeterConfig = config ? {
      threadCount: config.threadCount || 10,
      rampUpTime: config.rampUpTime || 60,
      loopCount: config.loopCount || 1,
      duration: config.duration,
      baseUrl: config.baseUrl || '',
      testPlanName: config.testPlanName || 'API Performance Test',
      groupByTags: config.groupByTags ?? (config.groupingStrategy === 'thread-groups'),
      addAssertions: config.addAssertions ?? true,
      addCorrelation: config.addCorrelation ?? true,
      addCsvData: config.addCsvData ?? config.generateCsvConfig ?? false,
      responseTimeout: config.responseTimeout || 30000,
      connectTimeout: config.connectTimeout || config.connectionTimeout || 10000,
    } : {
      threadCount: 10,
      rampUpTime: 60,
      loopCount: 1,
      baseUrl: '',
      testPlanName: 'API Performance Test',
      groupByTags: true,
      addAssertions: true,
      addCorrelation: true,
      addCsvData: false,
      responseTimeout: 30000,
      connectTimeout: 10000,
    };

    console.log('AI JMeter Generator called with config:', JSON.stringify(normalizedConfig));

    if (!swaggerContent) {
      return new Response(JSON.stringify({ error: 'Swagger content is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let spec;
    try {
      spec = typeof swaggerContent === 'string' ? JSON.parse(swaggerContent) : swaggerContent;
    } catch (parseError) {
      console.error('Failed to parse Swagger content:', parseError);
      return new Response(JSON.stringify({ error: 'Invalid Swagger/OpenAPI specification' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate JMeter XML using AI
    const startTime = Date.now();
    const { jmeterXml, usage } = await generateJMeterWithAI(spec, normalizedConfig, aiProvider);
    const executionTime = Date.now() - startTime;

    // Log AI usage
    if (userId) {
      try {
        await supabase.from('ai_usage_logs').insert({
          user_id: userId,
          project_id: projectId,
          feature_type: 'jmeter_generation',
          success: true,
          execution_time_ms: executionTime,
          openai_model: usage?.model || 'gpt-4o',
          openai_tokens_prompt: usage?.prompt_tokens || 0,
          openai_tokens_completion: usage?.completion_tokens || 0,
          tokens_used: usage?.total_tokens || 0,
          openai_cost_usd: usage?.cost || 0,
        });
      } catch (logError) {
        console.error('Failed to log AI usage:', logError);
      }
    }

    // Count endpoints in the spec
    const endpointCount = Object.values(spec.paths || {}).reduce((count: number, methods: any) => {
      return count + Object.keys(methods).filter(m => 
        ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(m.toLowerCase())
      ).length;
    }, 0);

    console.log('Generated JMeter XML successfully with', endpointCount, 'endpoints');

    return new Response(JSON.stringify({ 
      jmxContent: jmeterXml,
      jmeterXml, // Keep for backwards compatibility
      endpointCount,
      message: 'JMeter test plan generated successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ai-jmeter-generator function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ 
      error: 'Failed to generate JMeter test plan', 
      details: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function generateJMeterWithAI(spec: any, config: JMeterConfig, aiProvider: string): Promise<{ jmeterXml: string; usage: any }> {
  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  
  if (!openAIApiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const prompt = `Generate a comprehensive JMeter test plan (.jmx XML) from the following OpenAPI/Swagger specification.

Configuration:
- Test Plan Name: ${config.testPlanName}
- Thread Count: ${config.threadCount}
- Ramp-up Time: ${config.rampUpTime} seconds
- Loop Count: ${config.loopCount}
- Base URL: ${config.baseUrl}
- Group by Tags: ${config.groupByTags}
- Add Assertions: ${config.addAssertions}
- Add Correlation: ${config.addCorrelation}
- Add CSV Data: ${config.addCsvData}
- Response Timeout: ${config.responseTimeout}ms
- Connect Timeout: ${config.connectTimeout}ms

OpenAPI Specification:
${JSON.stringify(spec, null, 2)}

Requirements:
1. Create a complete JMeter test plan XML structure
2. Include proper HTTP Request samplers for each API endpoint
3. Add appropriate headers and authentication if specified in the API
4. Include response assertions if addAssertions is true
5. Add JSON extractors for correlation if addCorrelation is true
6. Group requests by tags if groupByTags is true, otherwise group by path
7. Include proper user variables for host, port, and protocol
8. Add CSV Data Set Config if addCsvData is true
9. Include proper timeouts and connection settings
10. Generate realistic test data for request bodies

Return only the JMeter XML content, no additional text or formatting.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert in Apache JMeter test plan generation. Generate valid JMeter XML (.jmx) files from OpenAPI specifications.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 4000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    let jmeterXml = data.choices[0]?.message?.content;

    if (!jmeterXml) {
      throw new Error('No JMeter XML generated by AI');
    }

    // Calculate usage
    const usage = {
      model: data.model || 'gpt-4o-mini',
      prompt_tokens: data.usage?.prompt_tokens || 0,
      completion_tokens: data.usage?.completion_tokens || 0,
      total_tokens: data.usage?.total_tokens || 0,
      cost: ((data.usage?.prompt_tokens || 0) * 0.00015 / 1000) + ((data.usage?.completion_tokens || 0) * 0.0006 / 1000),
    };

    // Clean up the response to ensure it's valid XML
    jmeterXml = jmeterXml.trim();
    
    // Remove any markdown code blocks if present
    jmeterXml = jmeterXml.replace(/```xml\n?/g, '').replace(/```\n?/g, '');
    
    // Ensure it starts with XML declaration or jmeterTestPlan
    if (!jmeterXml.startsWith('<?xml') && !jmeterXml.startsWith('<jmeterTestPlan')) {
      jmeterXml = `<?xml version="1.0" encoding="UTF-8"?>\n${jmeterXml}`;
    }

    return { jmeterXml, usage };

  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    
    // Fallback: generate basic JMeter XML if AI fails
    console.log('Falling back to basic JMeter generation');
    return generateBasicJMeterXml(spec, config);
  }
}

function generateBasicJMeterXml(spec: any, config: JMeterConfig): string {
  const paths = spec.paths || {};
  const baseUrl = new URL(config.baseUrl);
  
  let samplers = '';
  let samplerIndex = 0;

  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(methods as any)) {
      if (typeof operation !== 'object' || !operation) continue;
      
      const operationId = operation.operationId || `${method}_${path.replace(/[^a-zA-Z0-9]/g, '_')}`;
      
      samplers += `
        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="${operationId}" enabled="true">
          <elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="HTTPArgumentsPanel" testclass="Arguments" enabled="true">
            <collectionProp name="Arguments.arguments"/>
          </elementProp>
          <stringProp name="HTTPSampler.domain">\${host}</stringProp>
          <stringProp name="HTTPSampler.port">\${port}</stringProp>
          <stringProp name="HTTPSampler.protocol">\${protocol}</stringProp>
          <stringProp name="HTTPSampler.contentEncoding"></stringProp>
          <stringProp name="HTTPSampler.path">${path}</stringProp>
          <stringProp name="HTTPSampler.method">${method.toUpperCase()}</stringProp>
          <boolProp name="HTTPSampler.follow_redirects">true</boolProp>
          <boolProp name="HTTPSampler.auto_redirects">false</boolProp>
          <boolProp name="HTTPSampler.use_keepalive">true</boolProp>
          <boolProp name="HTTPSampler.DO_MULTIPART_POST">false</boolProp>
          <stringProp name="HTTPSampler.embedded_url_re"></stringProp>
          <stringProp name="HTTPSampler.connect_timeout">${config.connectTimeout}</stringProp>
          <stringProp name="HTTPSampler.response_timeout">${config.responseTimeout}</stringProp>
        </HTTPSamplerProxy>`;
      
      samplerIndex++;
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.4.1">
  <hashTree>
    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="${config.testPlanName}" enabled="true">
      <stringProp name="TestPlan.comments"></stringProp>
      <boolProp name="TestPlan.functional_mode">false</boolProp>
      <boolProp name="TestPlan.tearDown_on_shutdown">true</boolProp>
      <boolProp name="TestPlan.serialize_threadgroups">false</boolProp>
      <elementProp name="TestPlan.arguments" elementType="Arguments" guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
        <collectionProp name="Arguments.arguments">
          <elementProp name="host" elementType="Argument">
            <stringProp name="Argument.name">host</stringProp>
            <stringProp name="Argument.value">${baseUrl.hostname}</stringProp>
            <stringProp name="Argument.metadata">=</stringProp>
          </elementProp>
          <elementProp name="port" elementType="Argument">
            <stringProp name="Argument.name">port</stringProp>
            <stringProp name="Argument.value">${baseUrl.port || (baseUrl.protocol === 'https:' ? '443' : '80')}</stringProp>
            <stringProp name="Argument.metadata">=</stringProp>
          </elementProp>
          <elementProp name="protocol" elementType="Argument">
            <stringProp name="Argument.name">protocol</stringProp>
            <stringProp name="Argument.value">${baseUrl.protocol.replace(':', '')}</stringProp>
            <stringProp name="Argument.metadata">=</stringProp>
          </elementProp>
        </collectionProp>
      </elementProp>
      <stringProp name="TestPlan.user_define_classpath"></stringProp>
    </TestPlan>
    <hashTree>
      <ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="Thread Group" enabled="true">
        <stringProp name="ThreadGroup.on_sample_error">continue</stringProp>
        <elementProp name="ThreadGroup.main_controller" elementType="LoopController" guiclass="LoopControlPanel" testclass="LoopController" testname="Loop Controller" enabled="true">
          <boolProp name="LoopController.continue_forever">false</boolProp>
          <stringProp name="LoopController.loops">${config.loopCount}</stringProp>
        </elementProp>
        <stringProp name="ThreadGroup.num_threads">${config.threadCount}</stringProp>
        <stringProp name="ThreadGroup.ramp_time">${config.rampUpTime}</stringProp>
        <boolProp name="ThreadGroup.scheduler">false</boolProp>
        <stringProp name="ThreadGroup.duration"></stringProp>
        <stringProp name="ThreadGroup.delay"></stringProp>
        <boolProp name="ThreadGroup.same_user_on_next_iteration">true</boolProp>
      </ThreadGroup>
      <hashTree>
        ${samplers}
      </hashTree>
    </hashTree>
  </hashTree>
</jmeterTestPlan>`;
}