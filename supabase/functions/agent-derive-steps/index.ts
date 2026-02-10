import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TestCaseStep {
  action?: string;
  step?: string;
  description?: string;
  testData?: string;
  test_data?: string;
  expectedResult?: string;
  expected_result?: string;
}

interface DeriveStepsRequest {
  projectId: string;
  testCaseId: string;
  testCaseTitle: string;
  testCaseSteps: TestCaseStep[];
  baseUrl: string;
  agentId: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get user from auth header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: DeriveStepsRequest = await req.json();
    const { projectId, testCaseId, testCaseTitle, testCaseSteps, baseUrl, agentId } = body;

    console.log('Creating agent derivation job for test case:', testCaseTitle);

    // Validate agent exists and is online
    const { data: agent, error: agentError } = await supabase
      .from('self_hosted_agents')
      .select('*')
      .eq('id', agentId)
      .eq('project_id', projectId)
      .single();

    if (agentError || !agent) {
      return new Response(
        JSON.stringify({ error: 'Agent not found or not accessible' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (agent.status !== 'online') {
      return new Response(
        JSON.stringify({ error: 'Agent is not online. Please ensure the agent is running.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Convert test case steps to natural language instructions for the agent
    const instructions = testCaseSteps.map((step, index) => {
      const stepText = step.action || step.step || step.description || '';
      const testData = step.testData || step.test_data || '';
      const expectedResult = step.expectedResult || step.expected_result || '';
      
      let instruction = `${index + 1}. ${stepText}`;
      if (testData) instruction += ` (use value: "${testData}")`;
      if (expectedResult) instruction += ` → expect: ${expectedResult}`;
      
      return instruction;
    }).filter(s => s.trim().length > 0);

    // First, create a placeholder nocode_test entry for the derivation
    // This is required because agent_job_queue.test_id has a foreign key to nocode_tests
    const { data: placeholderTest, error: placeholderError } = await supabase
      .from('nocode_tests')
      .insert({
        project_id: projectId,
        name: `[Deriving] ${testCaseTitle}`,
        description: `Automation being derived from test case: ${testCaseTitle}`,
        base_url: baseUrl,
        steps: [], // Empty steps - will be populated after derivation
        created_by: user.id,
        test_case_id: testCaseId, // Link to original test case
        status: 'draft'
      })
      .select()
      .single();

    if (placeholderError) {
      console.error('Error creating placeholder test:', placeholderError);
      return new Response(
        JSON.stringify({ error: 'Failed to create placeholder test', details: placeholderError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Created placeholder nocode_test:', placeholderTest.id);

    // Create a special derivation job with derive mode
    const runId = `derive_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Create the derivation job steps - these are special steps that tell the agent to:
    // 1. Navigate to base URL
    // 2. Follow the test case steps
    // 3. Record all actions performed
    // 4. Return derived automation steps
    const derivationSteps = [
      {
        id: `step_nav_${Date.now()}`,
        type: 'navigate',
        value: baseUrl,
        description: `Navigate to ${baseUrl}`,
        selector: ''
      },
      {
        id: `step_derive_${Date.now()}`,
        type: 'derive_steps',
        value: JSON.stringify({
          testCaseId,
          testCaseTitle,
          instructions,
          originalSteps: testCaseSteps,
          placeholderTestId: placeholderTest.id
        }),
        description: 'Derive automation steps from test case',
        selector: '',
        extraData: {
          mode: 'derivation',
          instructions,
          testCaseId,
          testCaseTitle,
          baseUrl,
          placeholderTestId: placeholderTest.id
        }
      }
    ];

    // Queue the derivation job with the placeholder nocode_test ID
    const { data: job, error: jobError } = await supabase
      .from('agent_job_queue')
      .insert({
        project_id: projectId,
        test_id: placeholderTest.id, // Use the placeholder nocode_test ID
        run_id: runId,
        agent_id: agentId,
        base_url: baseUrl,
        steps: derivationSteps,
        status: 'pending',
        created_by: user.id,
        priority: 5 // Higher priority for derivation jobs
      })
      .select()
      .single();

    if (jobError) {
      console.error('Error creating derivation job:', jobError);
      return new Response(
        JSON.stringify({ error: 'Failed to create derivation job', details: jobError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Derivation job created:', job.id);

    // Log the activity
    await supabase.from('agent_activity_logs').insert({
      agent_id: agentId,
      project_id: projectId,
      event_type: 'derivation_job_created',
      event_data: {
        job_id: job.id,
        run_id: runId,
        test_case_id: testCaseId,
        test_case_title: testCaseTitle
      }
    });

    return new Response(
      JSON.stringify({
        success: true,
        jobId: job.id,
        runId: runId,
        nocodeTestId: placeholderTest.id,
        message: 'Derivation job queued. The agent will navigate and derive automation steps.'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in agent-derive-steps:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
