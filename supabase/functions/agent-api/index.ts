import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decode } from "https://deno.land/x/pngs@0.1.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-agent-key',
};

// Mask region interface for visual regression
interface MaskRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// Pixel-based image comparison with optional mask support
async function compareImages(
  current: string,
  baseline: string,
  threshold: number,
  masks: MaskRegion[] = []
): Promise<{ mismatchPercentage: number }> {
  // Decode base64 to binary
  const currentBinary = Uint8Array.from(atob(current), c => c.charCodeAt(0));
  const baselineBinary = Uint8Array.from(atob(baseline), c => c.charCodeAt(0));
  
  // Decode PNG images to get raw pixel data
  let currentImage: { width: number; height: number; image: Uint8Array };
  let baselineImage: { width: number; height: number; image: Uint8Array };
  
  try {
    currentImage = decode(currentBinary);
    baselineImage = decode(baselineBinary);
  } catch (e) {
    console.error('Failed to decode PNG images:', e);
    return { mismatchPercentage: 100 };
  }
  
  const currentWidth = currentImage.width;
  const currentHeight = currentImage.height;
  const baselineWidth = baselineImage.width;
  const baselineHeight = baselineImage.height;
  
  // If dimensions differ, images are different
  if (currentWidth !== baselineWidth || currentHeight !== baselineHeight) {
    console.log(`Image dimensions differ: current ${currentWidth}x${currentHeight} vs baseline ${baselineWidth}x${baselineHeight}`);
    return { mismatchPercentage: 100 };
  }
  
  const width = currentWidth;
  const height = currentHeight;
  const currentPixels = currentImage.image;
  const baselinePixels = baselineImage.image;
  
  let differentPixels = 0;
  let totalComparedPixels = 0;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let isMasked = false;
      const xPercent = (x / width) * 100;
      const yPercent = (y / height) * 100;
      
      for (const mask of masks) {
        if (xPercent >= mask.x && xPercent <= mask.x + mask.width &&
            yPercent >= mask.y && yPercent <= mask.y + mask.height) {
          isMasked = true;
          break;
        }
      }
      
      if (isMasked) continue;
      
      totalComparedPixels++;
      
      const pixelIndex = (y * width + x) * 4;
      const rDiff = Math.abs(currentPixels[pixelIndex] - baselinePixels[pixelIndex]);
      const gDiff = Math.abs(currentPixels[pixelIndex + 1] - baselinePixels[pixelIndex + 1]);
      const bDiff = Math.abs(currentPixels[pixelIndex + 2] - baselinePixels[pixelIndex + 2]);
      
      const colorTolerance = 5;
      if (rDiff > colorTolerance || gDiff > colorTolerance || bDiff > colorTolerance) {
        differentPixels++;
      }
    }
  }
  
  const mismatchPercentage = totalComparedPixels > 0 ? (differentPixels / totalComparedPixels) * 100 : 0;
  console.log(`Pixel comparison: ${differentPixels} different out of ${totalComparedPixels} = ${mismatchPercentage.toFixed(2)}%`);
  
  return { mismatchPercentage };
}

// Process visual regression steps from agent results
async function processVisualRegressionSteps(
  supabase: any,
  job: any,
  stepResults: any[]
): Promise<any[]> {
  const steps = Array.isArray(job.steps) ? job.steps : [];
  const processedResults = [...stepResults];
  
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepResult = processedResults[i];
    
    if (!stepResult || !['visualRegression', 'visualRegressionElement'].includes(step.type)) {
      continue;
    }
    
    // Get screenshot from agent result
    const currentScreenshot = stepResult.screenshot;
    if (!currentScreenshot) {
      console.log(`No screenshot for visual regression step ${i}`);
      continue;
    }
    
    const baselineName = step.value;
    const threshold = parseFloat(step.extraData?.threshold || step.threshold || '10') / 100;
    const useMasks = step.extraData?.useMasks === true || step.extraData?.useMasks === 'true';
    
    console.log(`Processing visual regression step ${i}: "${baselineName}", threshold: ${threshold * 100}%`);
    
    // Fetch baseline from database
    const { data: baseline } = await supabase
      .from('nocode_visual_baselines')
      .select('baseline_image, baseline_storage_path, baseline_type, threshold, masks')
      .eq('step_id', step.id)
      .single();
    
    if (!baseline) {
      console.log(`No baseline found for step "${baselineName}", marking for baseline save`);
      processedResults[i] = {
        ...stepResult,
        status: 'passed',
        extraData: {
          noBaselineYet: true,
          currentScreenshot,
          baselineName,
        },
      };
      continue;
    }
    
    // Get baseline image data - from storage or base64
    let baselineBase64 = '';
    if (baseline.baseline_type === 'storage' && baseline.baseline_storage_path) {
      // Fetch from storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('visual-baselines')
        .download(baseline.baseline_storage_path);
      
      if (downloadError || !fileData) {
        console.error('Failed to download baseline from storage:', downloadError);
        // Try fallback to base64 if available
        if (baseline.baseline_image) {
          baselineBase64 = baseline.baseline_image.replace(/^data:image\/\w+;base64,/, '');
        } else {
          processedResults[i] = {
            ...stepResult,
            status: 'failed',
            error: 'Failed to load baseline image from storage',
          };
          continue;
        }
      } else {
        // Convert blob to base64
        const arrayBuffer = await fileData.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        baselineBase64 = btoa(String.fromCharCode(...uint8Array));
      }
    } else {
      // Use base64 directly
      baselineBase64 = baseline.baseline_image.replace(/^data:image\/\w+;base64,/, '');
    }
    
    // Extract base64 data from current screenshot
    const currentBase64 = currentScreenshot.replace(/^data:image\/\w+;base64,/, '');
    const effectiveThreshold = baseline.threshold || threshold;
    const masks: MaskRegion[] = useMasks && Array.isArray(baseline.masks) ? baseline.masks : [];
    
    console.log(`Visual regression comparison:`);
    console.log(`  - Current length: ${currentBase64.length}, Baseline length: ${baselineBase64.length}`);
    console.log(`  - Threshold: ${effectiveThreshold * 100}%, Masks: ${masks.length}`);
    
    // Perform pixel comparison
    const diffResult = await compareImages(currentBase64, baselineBase64, effectiveThreshold, masks);
    
    if (diffResult.mismatchPercentage > effectiveThreshold * 100) {
      console.log(`Visual regression FAILED: ${diffResult.mismatchPercentage.toFixed(2)}% > ${(effectiveThreshold * 100).toFixed(2)}%`);
      processedResults[i] = {
        ...stepResult,
        status: 'failed',
        error: `Visual regression failed: ${diffResult.mismatchPercentage.toFixed(2)}% difference (threshold: ${(effectiveThreshold * 100).toFixed(2)}%)`,
        extraData: {
          visualDiff: true,
          mismatchPercentage: diffResult.mismatchPercentage.toFixed(2),
          threshold: (effectiveThreshold * 100).toFixed(2),
          currentScreenshot,
          baselineScreenshot: baseline.baseline_image,
          masksApplied: masks.length,
        },
      };
    } else {
      console.log(`Visual regression PASSED: ${diffResult.mismatchPercentage.toFixed(2)}% <= ${(effectiveThreshold * 100).toFixed(2)}%`);
      processedResults[i] = {
        ...stepResult,
        status: 'passed',
        extraData: {
          visualMatch: true,
          mismatchPercentage: diffResult.mismatchPercentage.toFixed(2),
          threshold: (effectiveThreshold * 100).toFixed(2),
          currentScreenshot,
          baselineScreenshot: baseline.baseline_image,
          masksApplied: masks.length,
        },
      };
    }
  }
  
  return processedResults;
}

// Helper to create Supabase client with service role for admin operations
function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
}

// Validate agent API key and return agent details
async function validateAgent(apiKey: string | null): Promise<{ valid: boolean; agent?: any; error?: string }> {
  if (!apiKey) {
    return { valid: false, error: 'Missing agent API key' };
  }

  const supabase = getSupabaseAdmin();
  
  const { data: agent, error } = await supabase
    .from('self_hosted_agents')
    .select('*')
    .eq('api_token_hash', apiKey)
    .single();

  if (error || !agent) {
    console.error('Agent validation failed:', error);
    return { valid: false, error: 'Invalid agent API key' };
  }

  if (agent.status === 'decommissioned') {
    return { valid: false, error: 'Agent has been decommissioned' };
  }

  return { valid: true, agent };
}

// Log agent activity
async function logActivity(agentId: string, activityType: string, details: any = {}) {
  const supabase = getSupabaseAdmin();
  
  await supabase
    .from('agent_activity_logs')
    .insert({
      agent_id: agentId,
      activity_type: activityType,
      details,
    });
}

// Update suite execution status when all jobs in the suite are complete
async function updateSuiteExecutionIfComplete(supabase: any, runId: string, projectId: string) {
  try {
    console.log(`Checking suite execution status for run_id: ${runId}`);
    
    // Get all jobs for this suite run
    const { data: jobs, error: jobsError } = await supabase
      .from('agent_job_queue')
      .select('id, status, test_id')
      .eq('run_id', runId)
      .eq('project_id', projectId);
    
    if (jobsError || !jobs || jobs.length === 0) {
      console.error('Failed to fetch suite jobs:', jobsError);
      return;
    }
    
    // Check if all jobs are complete (not pending or running)
    const pendingJobs = jobs.filter((j: any) => j.status === 'pending' || j.status === 'running');
    
    if (pendingJobs.length > 0) {
      console.log(`Suite ${runId} still has ${pendingJobs.length} pending/running jobs`);
      return;
    }
    
    console.log(`All ${jobs.length} jobs complete for suite ${runId}, updating suite execution`);
    
    // Get the test executions to calculate pass/fail counts
    const testIds = jobs.map((j: any) => j.test_id);
    const { data: testExecs, error: execsError } = await supabase
      .from('nocode_test_executions')
      .select('id, test_id, status, error_message')
      .eq('project_id', projectId)
      .in('test_id', testIds)
      .order('created_at', { ascending: false });
    
    if (execsError) {
      console.error('Failed to fetch test executions:', execsError);
      return;
    }
    
    // Get the most recent execution for each test
    const latestExecs = new Map();
    for (const exec of testExecs || []) {
      if (!latestExecs.has(exec.test_id)) {
        latestExecs.set(exec.test_id, exec);
      }
    }
    
    // Calculate pass/fail counts
    let passed = 0;
    let failed = 0;
    const results: any[] = [];
    
    for (const [testId, exec] of latestExecs) {
      if (exec.status === 'passed') {
        passed++;
      } else {
        failed++;
      }
      results.push({
        test_id: testId,
        status: exec.status,
        execution_id: exec.id,
        error: exec.error_message
      });
    }
    
    // Find the suite execution to update
    // Look for a running suite execution for this project
    const { data: suiteExecs, error: suiteError } = await supabase
      .from('nocode_suite_executions')
      .select('id, suite_id, total_tests')
      .eq('project_id', projectId)
      .eq('status', 'running')
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (suiteError || !suiteExecs || suiteExecs.length === 0) {
      console.log('No running suite execution found to update');
      return;
    }
    
    const suiteExec = suiteExecs[0];
    
    // Update the suite execution with final status
    const finalStatus = failed === 0 ? 'passed' : 'failed';
    const { error: updateError } = await supabase
      .from('nocode_suite_executions')
      .update({
        status: finalStatus,
        completed_at: new Date().toISOString(),
        passed_tests: passed,
        failed_tests: failed,
        results: results
      })
      .eq('id', suiteExec.id);
    
    if (updateError) {
      console.error('Failed to update suite execution:', updateError);
    } else {
      console.log(`Suite execution ${suiteExec.id} updated to ${finalStatus} (${passed} passed, ${failed} failed)`);
    }
  } catch (err) {
    console.error('Error updating suite execution:', err);
  }
}

// POST /agent-api/register - Register a new agent
async function handleRegister(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { project_id, agent_name, capabilities, metadata } = body;

    if (!project_id || !agent_name) {
      return new Response(
        JSON.stringify({ error: 'project_id and agent_name are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = getSupabaseAdmin();

    // Generate a unique API key for this agent
    const apiKey = `wispr_agent_${crypto.randomUUID().replace(/-/g, '')}`;

    const { data: agent, error } = await supabase
      .from('self_hosted_agents')
      .insert({
        project_id,
        agent_name,
        agent_id: `agent-${Date.now()}`,
        api_token_hash: apiKey,
        config: {
          capabilities: capabilities || {},
          metadata: metadata || {},
        },
        status: 'offline',
        capacity: 3,
        running_jobs: 0,
        browsers: ['chromium'],
      })
      .select()
      .single();

    if (error) {
      console.error('Agent registration failed:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to register agent', details: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await logActivity(agent.id, 'agent_registered', { agent_name, capabilities });

    console.log(`Agent registered: ${agent.id} (${agent_name})`);

    return new Response(
      JSON.stringify({
        success: true,
        agent_id: agent.id,
        api_key: apiKey,
        message: 'Agent registered successfully. Store the API key securely.',
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Registration error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// POST /agent-api/heartbeat - Agent heartbeat
async function handleHeartbeat(req: Request): Promise<Response> {
  try {
    const apiKey = req.headers.get('x-agent-key');
    const validation = await validateAgent(apiKey);

    if (!validation.valid) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const agent = validation.agent!;
    const body = await req.json();
    const { current_capacity, max_capacity, active_jobs, system_info } = body;

    const supabase = getSupabaseAdmin();

    // Update agent heartbeat and capacity
    const { error } = await supabase
      .from('self_hosted_agents')
      .update({
        last_heartbeat: new Date().toISOString(),
        capacity: max_capacity ?? agent.capacity,
        running_jobs: active_jobs?.length ?? agent.running_jobs,
        status: 'online',
        config: {
          ...agent.config,
          active_jobs: active_jobs ?? [],
          system_info: system_info ?? agent.config?.system_info,
        },
      })
      .eq('id', agent.id);

    if (error) {
      console.error('Heartbeat update failed:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to update heartbeat' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for any pending commands for this agent
    const { data: pendingJobs } = await supabase
      .from('agent_job_queue')
      .select('id, status')
      .eq('agent_id', agent.id)
      .in('status', ['pending', 'assigned'])
      .limit(10);

    console.log(`Heartbeat received from agent: ${agent.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        server_time: new Date().toISOString(),
        pending_jobs: pendingJobs?.length ?? 0,
        commands: [], // Future: Add remote commands here
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Heartbeat error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// GET /agent-api/jobs/poll - Poll for available jobs
async function handleJobPoll(req: Request): Promise<Response> {
  try {
    const apiKey = req.headers.get('x-agent-key');
    const validation = await validateAgent(apiKey);

    if (!validation.valid) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const agent = validation.agent!;
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') || '5');

    const supabase = getSupabaseAdmin();

    // Find jobs that are pending and match this agent's project
    // Jobs can be either unassigned (agent_id is null) or specifically assigned to this agent
    const { data: jobs, error } = await supabase
      .from('agent_job_queue')
      .select('*')
      .eq('project_id', agent.project_id)
      .eq('status', 'pending')
      .or(`agent_id.is.null,agent_id.eq.${agent.id}`)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('Job poll failed:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to poll jobs' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Job poll by agent ${agent.id}: ${jobs?.length ?? 0} jobs available`);

    return new Response(
      JSON.stringify({
        success: true,
        jobs: jobs || [],
        agent_id: agent.id,
        poll_time: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Job poll error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// POST /agent-api/jobs/:jobId/start - Claim and start a job
async function handleJobStart(req: Request, jobId: string): Promise<Response> {
  try {
    const apiKey = req.headers.get('x-agent-key');
    const validation = await validateAgent(apiKey);

    if (!validation.valid) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const agent = validation.agent!;
    const supabase = getSupabaseAdmin();

    // Try to claim the job atomically
    const { data: job, error: fetchError } = await supabase
      .from('agent_job_queue')
      .select('*')
      .eq('id', jobId)
      .single();

    if (fetchError || !job) {
      return new Response(
        JSON.stringify({ error: 'Job not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if job is already claimed
    if (job.agent_id && job.agent_id !== agent.id) {
      return new Response(
        JSON.stringify({ error: 'Job already claimed by another agent' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (job.status !== 'pending' && job.status !== 'assigned') {
      return new Response(
        JSON.stringify({ error: `Job cannot be started. Current status: ${job.status}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Claim and start the job
    const startedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('agent_job_queue')
      .update({
        agent_id: agent.id,
        status: 'running',
        started_at: startedAt,
      })
      .eq('id', jobId)
      .eq('status', job.status); // Optimistic locking

    if (updateError) {
      console.error('Job start failed:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to start job' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Also update the corresponding nocode_test_executions record to 'running'
    const { error: execUpdateError } = await supabase
      .from('nocode_test_executions')
      .update({
        status: 'running',
        started_at: startedAt,
      })
      .eq('test_id', job.test_id)
      .eq('project_id', job.project_id)
      .eq('status', 'pending');

    if (execUpdateError) {
      console.error('Failed to update nocode_test_executions status:', execUpdateError);
      // Non-fatal, continue
    } else {
      console.log(`Updated nocode_test_executions to running for test_id: ${job.test_id}`);
    }

    await logActivity(agent.id, 'job_started', { job_id: jobId, run_id: job.run_id });

    console.log(`Job ${jobId} started by agent ${agent.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        job_id: jobId,
        run_id: job.run_id,
        job_type: job.job_type,
        payload: job.payload,
        started_at: startedAt,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Job start error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Helper function to upload screenshot to storage and return URL
async function uploadScreenshotToStorage(
  supabase: any,
  projectId: string,
  jobId: string,
  stepIndex: number,
  base64Screenshot: string
): Promise<string | null> {
  try {
    // Remove data URL prefix if present
    const base64Data = base64Screenshot.replace(/^data:image\/\w+;base64,/, '');
    
    // Convert base64 to Uint8Array
    const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    
    // Generate unique file path
    const timestamp = Date.now();
    const fileName = `${projectId}/${jobId}/step_${stepIndex}_${timestamp}.png`;
    
    // Upload to storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('test-screenshots')
      .upload(fileName, binaryData, {
        contentType: 'image/png',
        upsert: false,
      });
    
    if (uploadError) {
      console.error(`Failed to upload screenshot for step ${stepIndex}:`, uploadError);
      return null;
    }
    
    // Get signed URL (valid for 7 days)
    const { data: signedData } = await supabase.storage
      .from('test-screenshots')
      .createSignedUrl(fileName, 60 * 60 * 24 * 7); // 7 days
    
    return signedData?.signedUrl || null;
  } catch (err) {
    console.error(`Error uploading screenshot for step ${stepIndex}:`, err);
    return null;
  }
}

// Process step results: upload screenshots to storage, return URL-only results
async function processStepResultsForStorage(
  supabase: any,
  projectId: string,
  jobId: string,
  stepResults: any[]
): Promise<any[]> {
  const processedResults = [];
  
  for (let i = 0; i < stepResults.length; i++) {
    const stepResult = { ...stepResults[i] };
    
    // If there's a screenshot, upload it to storage
    if (stepResult.screenshot && stepResult.screenshot.length > 1000) {
      const screenshotUrl = await uploadScreenshotToStorage(
        supabase,
        projectId,
        jobId,
        i,
        stepResult.screenshot
      );
      
      if (screenshotUrl) {
        // Replace base64 with URL
        stepResult.screenshot = screenshotUrl;
        stepResult.screenshotType = 'url';
      } else {
        // If upload failed, don't store the large base64 data
        delete stepResult.screenshot;
        stepResult.screenshotError = 'Failed to upload screenshot to storage';
      }
    }
    
    // Also process extraData screenshots
    if (stepResult.extraData) {
      if (stepResult.extraData.currentScreenshot && stepResult.extraData.currentScreenshot.length > 1000) {
        const url = await uploadScreenshotToStorage(supabase, projectId, jobId, i, stepResult.extraData.currentScreenshot);
        if (url) {
          stepResult.extraData.currentScreenshot = url;
          stepResult.extraData.currentScreenshotType = 'url';
        } else {
          delete stepResult.extraData.currentScreenshot;
        }
      }
      if (stepResult.extraData.baselineScreenshot && stepResult.extraData.baselineScreenshot.length > 1000) {
        const url = await uploadScreenshotToStorage(supabase, projectId, jobId, i, stepResult.extraData.baselineScreenshot);
        if (url) {
          stepResult.extraData.baselineScreenshot = url;
          stepResult.extraData.baselineScreenshotType = 'url';
        } else {
          delete stepResult.extraData.baselineScreenshot;
        }
      }
    }
    
    processedResults.push(stepResult);
  }
  
  return processedResults;
}

// POST /agent-api/jobs/:jobId/result - Submit job results
async function handleResultSubmit(req: Request, jobId: string): Promise<Response> {
  try {
    const apiKey = req.headers.get('x-agent-key');
    const validation = await validateAgent(apiKey);

    if (!validation.valid) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const agent = validation.agent!;
    const body = await req.json();
    const { status, result_data, error_message, execution_time_ms, step_results } = body;

    if (!status || !['completed', 'failed', 'cancelled'].includes(status)) {
      return new Response(
        JSON.stringify({ error: 'Invalid status. Must be: completed, failed, or cancelled' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = getSupabaseAdmin();

    // Verify job exists and belongs to this agent
    const { data: job, error: fetchError } = await supabase
      .from('agent_job_queue')
      .select('*')
      .eq('id', jobId)
      .eq('agent_id', agent.id)
      .single();

    if (fetchError || !job) {
      return new Response(
        JSON.stringify({ error: 'Job not found or not assigned to this agent' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update job status (don't store result here, use agent_execution_results table)
    const { error: updateError } = await supabase
      .from('agent_job_queue')
      .update({
        status,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    if (updateError) {
      console.error('Result submit failed:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to submit result' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process visual regression steps - compare screenshots against baselines
    let processedStepResults = step_results || [];
    try {
      processedStepResults = await processVisualRegressionSteps(supabase, job, step_results || []);
      console.log('Visual regression processing complete');
    } catch (vrError) {
      console.error('Visual regression processing error:', vrError);
      // Continue with original results if VR processing fails
    }

    // Upload screenshots to storage instead of storing as base64
    try {
      processedStepResults = await processStepResultsForStorage(supabase, job.project_id, jobId, processedStepResults);
      console.log('Screenshots uploaded to storage');
    } catch (storageError) {
      console.error('Screenshot storage processing error:', storageError);
      // Continue with original results if storage processing fails
    }

    // Store detailed execution results with processed visual regression data
    const passedSteps = processedStepResults?.filter((s: any) => s.status === 'passed')?.length ?? 0;
    const failedSteps = processedStepResults?.filter((s: any) => s.status === 'failed')?.length ?? 0;
    const totalSteps = processedStepResults?.length ?? 0;
    
    // Map status from agent to nocode status format - recalculate based on VR results
    const nocodeStatus = status === 'completed' ? (failedSteps > 0 ? 'failed' : 'passed') : status;
    
    const { error: resultError } = await supabase
      .from('agent_execution_results')
      .insert({
        job_id: jobId,
        agent_id: agent.id,
        project_id: job.project_id,
        status: nocodeStatus,
        results: { data: result_data, step_results: processedStepResults },
        error_message,
        duration_ms: execution_time_ms,
        passed_steps: passedSteps,
        failed_steps: failedSteps,
        total_steps: totalSteps,
      });

    if (resultError) {
      console.error('Failed to store execution results:', resultError);
      // Non-fatal, continue
    }

    // Find and update the corresponding nocode_test_executions record
    // The execution is linked via test_id from the job
    // Look for 'running' first (set by handleJobStart), then 'pending' as fallback
    const { data: existingExecution, error: findExecError } = await supabase
      .from('nocode_test_executions')
      .select('id')
      .eq('test_id', job.test_id)
      .eq('project_id', job.project_id)
      .in('status', ['running', 'pending'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existingExecution && !findExecError) {
      // Format step results to match the nocode execution format - use processed results
      const formattedResults = (processedStepResults || []).map((stepResult: any, index: number) => {
        // Get the step from the job's steps array
        const steps = Array.isArray(job.steps) ? job.steps : [];
        const step = steps[index] || {};
        
        return {
          status: stepResult.status,
          step: {
            id: step.id,
            type: step.type || stepResult.type || 'unknown',
            description: step.description || stepResult.description || `Step ${index + 1}`,
            selector: step.selector || stepResult.selector,
            value: step.value || stepResult.value,
            extraData: stepResult.extraData || step.extraData,
          },
          duration: stepResult.duration || stepResult.duration_ms,
          error: stepResult.error || stepResult.error_message,
          screenshot: stepResult.screenshot,
        };
      });

      const { error: updateExecError } = await supabase
        .from('nocode_test_executions')
        .update({
          status: nocodeStatus,
          completed_at: new Date().toISOString(),
          duration_ms: execution_time_ms,
          results: formattedResults,
          error_message: error_message || null,
        })
        .eq('id', existingExecution.id);

      if (updateExecError) {
        console.error('Failed to update nocode_test_executions:', updateExecError);
      } else {
        console.log(`Updated nocode_test_executions ${existingExecution.id} with agent results`);
      }
    } else {
      console.log('No pending nocode_test_executions found for this job, creating new one');
      
      // Create a new nocode_test_executions record with the processed results
      const formattedResults = (processedStepResults || []).map((stepResult: any, index: number) => {
        const steps = Array.isArray(job.steps) ? job.steps : [];
        const step = steps[index] || {};
        
        return {
          status: stepResult.status,
          step: {
            id: step.id,
            type: step.type || stepResult.type || 'unknown',
            description: step.description || stepResult.description || `Step ${index + 1}`,
            selector: step.selector || stepResult.selector,
            value: step.value || stepResult.value,
            extraData: stepResult.extraData || step.extraData,
          },
          duration: stepResult.duration || stepResult.duration_ms,
          error: stepResult.error || stepResult.error_message,
          screenshot: stepResult.screenshot,
        };
      });

      const { error: createExecError } = await supabase
        .from('nocode_test_executions')
        .insert({
          test_id: job.test_id,
          project_id: job.project_id,
          status: nocodeStatus,
          started_at: job.started_at || new Date().toISOString(),
          completed_at: new Date().toISOString(),
          duration_ms: execution_time_ms,
          results: formattedResults,
          error_message: error_message || null,
          executed_by: job.created_by,
        });

      if (createExecError) {
        console.error('Failed to create nocode_test_executions:', createExecError);
      }
    }

    await logActivity(agent.id, 'job_completed', { 
      job_id: jobId, 
      run_id: job.run_id, 
      status,
      execution_time_ms,
    });

    console.log(`Job ${jobId} completed by agent ${agent.id} with status: ${status}`);

    // Check if this job is part of a suite execution (run_id starts with "SUITE-")
    // and update the suite execution accordingly
    if (job.run_id && job.run_id.startsWith('SUITE-')) {
      await updateSuiteExecutionIfComplete(supabase, job.run_id, job.project_id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        job_id: jobId,
        status,
        completed_at: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Result submit error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// POST /agent-api/jobs/:jobId/artifacts - Upload artifacts
async function handleArtifactUpload(req: Request, jobId: string): Promise<Response> {
  try {
    const apiKey = req.headers.get('x-agent-key');
    const validation = await validateAgent(apiKey);

    if (!validation.valid) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const agent = validation.agent!;
    const supabase = getSupabaseAdmin();

    // Verify job exists and belongs to this agent
    const { data: job, error: fetchError } = await supabase
      .from('agent_job_queue')
      .select('*')
      .eq('id', jobId)
      .eq('agent_id', agent.id)
      .single();

    if (fetchError || !job) {
      return new Response(
        JSON.stringify({ error: 'Job not found or not assigned to this agent' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const contentType = req.headers.get('content-type') || '';
    
    if (contentType.includes('multipart/form-data')) {
      // Handle multipart form data for file uploads
      const formData = await req.formData();
      const artifactType = formData.get('artifact_type') as string || 'file';
      const stepIndex = formData.get('step_index') as string;
      const file = formData.get('file') as File;

      if (!file) {
        return new Response(
          JSON.stringify({ error: 'No file provided' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Generate storage path
      const fileName = `${job.run_id}/${artifactType}_${stepIndex || 'main'}_${Date.now()}_${file.name}`;
      
      // Upload to storage (assuming a bucket exists)
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('agent-artifacts')
        .upload(fileName, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        console.error('Artifact upload failed:', uploadError);
        // If bucket doesn't exist, store metadata only
        const artifactRecord = {
          job_id: jobId,
          artifact_type: artifactType,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
          step_index: stepIndex ? parseInt(stepIndex) : null,
          storage_error: uploadError.message,
        };

        // Update job with artifact metadata
        await supabase
          .from('agent_job_queue')
          .update({
            result: {
              ...job.result,
              artifacts: [...(job.result?.artifacts || []), artifactRecord],
            },
          })
          .eq('id', jobId);

        return new Response(
          JSON.stringify({ 
            success: true, 
            warning: 'File metadata stored but upload failed. Ensure agent-artifacts bucket exists.',
            artifact: artifactRecord,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: publicUrl } = supabase.storage
        .from('agent-artifacts')
        .getPublicUrl(fileName);

      const artifactRecord = {
        job_id: jobId,
        artifact_type: artifactType,
        file_name: file.name,
        file_path: uploadData.path,
        file_size: file.size,
        mime_type: file.type,
        public_url: publicUrl.publicUrl,
        step_index: stepIndex ? parseInt(stepIndex) : null,
      };

      // Update job with artifact info
      await supabase
        .from('agent_job_queue')
        .update({
          result: {
            ...job.result,
            artifacts: [...(job.result?.artifacts || []), artifactRecord],
          },
        })
        .eq('id', jobId);

      console.log(`Artifact uploaded for job ${jobId}: ${file.name}`);

      return new Response(
        JSON.stringify({
          success: true,
          artifact: artifactRecord,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Handle JSON metadata for artifacts (e.g., trace data, logs)
      const body = await req.json();
      const { artifact_type, data, step_index, metadata } = body;

      const artifactRecord = {
        job_id: jobId,
        artifact_type: artifact_type || 'metadata',
        data,
        step_index,
        metadata,
        created_at: new Date().toISOString(),
      };

      // Update job with artifact info
      await supabase
        .from('agent_job_queue')
        .update({
          result: {
            ...job.result,
            artifacts: [...(job.result?.artifacts || []), artifactRecord],
          },
        })
        .eq('id', jobId);

      console.log(`Artifact metadata stored for job ${jobId}: ${artifact_type}`);

      return new Response(
        JSON.stringify({
          success: true,
          artifact: artifactRecord,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (err) {
    console.error('Artifact upload error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// ============ PERFORMANCE TESTING HANDLERS ============

// GET /agent-api/performance/jobs/poll - Poll for performance jobs
async function handlePerformanceJobPoll(req: Request): Promise<Response> {
  try {
    const apiKey = req.headers.get('x-agent-key');
    const validation = await validateAgent(apiKey);

    if (!validation.valid) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const agent = validation.agent!;
    const supabase = getSupabaseAdmin();

    // Find queued performance jobs for this agent's project.
    // NOTE: We fetch multiple jobs because old jobs can become "poison pills" if their JMX was deleted.
    // In that case, we mark them failed and continue so newer valid jobs can run.
    const { data: jobs, error } = await supabase
      .from('performance_jobs')
      .select('id, jmx_id, project_id, threads, rampup, duration, status, created_at')
      .eq('project_id', agent.project_id)
      .eq('status', 'queued')
      .eq('agent_id', agent.id)
      .order('created_at', { ascending: true })
      .limit(10);

    if (error) {
      console.error('Performance job poll failed:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to poll performance jobs' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Performance job poll by agent ${agent.id}: Found ${(jobs || []).length} queued jobs, project: ${agent.project_id}`);

    // Fetch the first job that has a valid JMX payload; mark invalid jobs failed so they don't block the queue.
    const jobsWithJmx: any[] = [];

    for (const job of jobs || []) {
      const { data: jmxData, error: jmxError } = await supabase
        .from('performance_jmx_files')
        .select('jmx, jmx_base64')
        .eq('id', job.jmx_id)
        .maybeSingle();

      if (jmxError || !jmxData) {
        console.error(`Failed to fetch JMX for job ${job.id}, jmx_id ${job.jmx_id}:`, jmxError ?? { message: 'Not found' });

        // Prevent this job from blocking the queue forever
        await supabase
          .from('performance_jobs')
          .update({ status: 'failed', finished_at: new Date().toISOString() })
          .eq('id', job.id)
          .eq('agent_id', agent.id);

        continue;
      }

      // Use jmx_base64 if available, otherwise encode jmx content
      const jmxBase64 = jmxData.jmx_base64 || (jmxData.jmx ? btoa(jmxData.jmx) : '');

      if (!jmxBase64) {
        console.error(`Job ${job.id} has empty JMX payload, marking failed`);
        await supabase
          .from('performance_jobs')
          .update({ status: 'failed', finished_at: new Date().toISOString() })
          .eq('id', job.id)
          .eq('agent_id', agent.id);
        continue;
      }

      jobsWithJmx.push({ ...job, jmx_base64: jmxBase64 });
      break; // only return one job per poll
    }

    console.log(`Performance job poll by agent ${agent.id}: ${jobsWithJmx.length} jobs with valid JMX`);

    return new Response(
      JSON.stringify({ success: true, jobs: jobsWithJmx, agent_id: agent.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Performance job poll error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// POST /agent-api/performance/jobs/:jobId/start - Claim performance job
async function handlePerformanceJobStart(req: Request, jobId: string): Promise<Response> {
  try {
    const apiKey = req.headers.get('x-agent-key');
    const validation = await validateAgent(apiKey);

    if (!validation.valid) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const agent = validation.agent!;
    const supabase = getSupabaseAdmin();

    const { error: updateError } = await supabase
      .from('performance_jobs')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', jobId)
      .eq('agent_id', agent.id);

    if (updateError) {
      console.error('Performance job start failed:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to start performance job' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Performance job ${jobId} started by agent ${agent.id}`);
    return new Response(
      JSON.stringify({ success: true, job_id: jobId, started_at: new Date().toISOString() }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Performance job start error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// POST /agent-api/performance/jobs/:jobId/result - Submit performance results
async function handlePerformanceResultSubmit(req: Request, jobId: string): Promise<Response> {
  try {
    const apiKey = req.headers.get('x-agent-key');
    const validation = await validateAgent(apiKey);

    if (!validation.valid) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const agent = validation.agent!;
    const body = await req.json();
    const { status, summary, jtl_base64, report_base64, error_message } = body;

    const supabase = getSupabaseAdmin();

    // Get job to get project_id
    const { data: job } = await supabase
      .from('performance_jobs')
      .select('project_id')
      .eq('id', jobId)
      .single();

    if (!job) {
      return new Response(
        JSON.stringify({ error: 'Job not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update job status
    await supabase
      .from('performance_jobs')
      .update({ status, finished_at: new Date().toISOString() })
      .eq('id', jobId);

    // Store results
    await supabase
      .from('performance_results')
      .insert({
        job_id: jobId,
        agent_id: agent.id,
        project_id: job.project_id,
        status,
        summary: summary || {},
        jtl_base64,
        report_base64,
      });

    console.log(`Performance results submitted for job ${jobId}: ${status}`);
    return new Response(
      JSON.stringify({ success: true, job_id: jobId, status }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Performance result submit error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// GET /agent-api/status - Get agent status
async function handleStatus(req: Request): Promise<Response> {
  try {
    const apiKey = req.headers.get('x-agent-key');
    const validation = await validateAgent(apiKey);

    if (!validation.valid) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const agent = validation.agent!;
    const supabase = getSupabaseAdmin();

    // Get recent jobs for this agent
    const { data: recentJobs } = await supabase
      .from('agent_job_queue')
      .select('id, run_id, status, job_type, created_at, completed_at')
      .eq('agent_id', agent.id)
      .order('created_at', { ascending: false })
      .limit(10);

    // Get job statistics
    const { data: stats } = await supabase
      .from('agent_job_queue')
      .select('status')
      .eq('agent_id', agent.id);

    const jobStats = {
      total: stats?.length ?? 0,
      completed: stats?.filter(j => j.status === 'completed').length ?? 0,
      failed: stats?.filter(j => j.status === 'failed').length ?? 0,
      running: stats?.filter(j => j.status === 'running').length ?? 0,
    };

    return new Response(
      JSON.stringify({
        success: true,
        agent: {
          id: agent.id,
          name: agent.agent_name,
          status: agent.status,
          last_heartbeat: agent.last_heartbeat,
          current_capacity: agent.current_capacity,
          max_capacity: agent.max_capacity,
          capabilities: agent.capabilities,
        },
        job_stats: jobStats,
        recent_jobs: recentJobs || [],
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Status error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Main request handler
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace('/agent-api', '');
  
  console.log(`Agent API request: ${req.method} ${path}`);

  try {
    // Support action-based routing for supabase.functions.invoke calls
    if (req.method === 'POST' && (path === '' || path === '/')) {
      const clonedReq = req.clone();
      let body: any = {};
      try {
        body = await clonedReq.json();
      } catch {
        // No body or invalid JSON
      }

      if (body.action) {
        console.log(`Action-based routing: ${body.action}`);
        
        switch (body.action) {
          case 'register': {
            // Get user from authorization header
            const authHeader = req.headers.get('authorization');
            let userId: string | null = null;
            
            if (authHeader) {
              const supabaseAuth = createClient(
                Deno.env.get('SUPABASE_URL') ?? '',
                Deno.env.get('SUPABASE_ANON_KEY') ?? '',
                {
                  global: {
                    headers: { Authorization: authHeader },
                  },
                }
              );
              const { data: { user } } = await supabaseAuth.auth.getUser();
              userId = user?.id || null;
            }

            if (!userId) {
              return new Response(
                JSON.stringify({ error: 'Authentication required to register an agent' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }

            // Map frontend field names to backend expected names
            const registerBody = {
              project_id: body.projectId || body.project_id,
              agent_name: body.agentName || body.agent_name,
              capabilities: {
                browsers: body.browsers || ['chromium'],
                max_capacity: body.capacity || 3,
              },
              metadata: {
                agent_id: body.agentId || body.agent_id,
              },
            };

            if (!registerBody.project_id || !registerBody.agent_name) {
              return new Response(
                JSON.stringify({ error: 'projectId/project_id and agentName/agent_name are required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }

            const supabase = getSupabaseAdmin();
            const apiKey = `wispr_agent_${crypto.randomUUID().replace(/-/g, '')}`;

            const { data: agent, error } = await supabase
              .from('self_hosted_agents')
              .insert({
                project_id: registerBody.project_id,
                agent_name: registerBody.agent_name,
                agent_id: registerBody.metadata.agent_id || `agent-${Date.now()}`,
                api_token_hash: apiKey,
                config: { 
                  capabilities: registerBody.capabilities,
                  metadata: registerBody.metadata,
                },
                status: 'offline',
                capacity: registerBody.capabilities.max_capacity,
                running_jobs: 0,
                browsers: registerBody.capabilities.browsers,
                created_by: userId,
              })
              .select()
              .single();

            if (error) {
              console.error('Agent registration failed:', error);
              return new Response(
                JSON.stringify({ error: 'Failed to register agent', details: error.message }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }

            await logActivity(agent.id, 'agent_registered', { 
              agent_name: registerBody.agent_name, 
              capabilities: registerBody.capabilities,
              project_id: registerBody.project_id,
            });

            console.log(`Agent registered via action: ${agent.id} (${registerBody.agent_name})`);

            return new Response(
              JSON.stringify({
                success: true,
                agent_id: agent.id,
                apiToken: apiKey,
                api_key: apiKey,
                message: 'Agent registered successfully. Store the API token securely.',
              }),
              { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          default:
            return new Response(
              JSON.stringify({ error: `Unknown action: ${body.action}` }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }
      }
    }

    // Path-based route handling for external agent clients
    if (path === '/register' && req.method === 'POST') {
      return await handleRegister(req);
    }
    
    if (path === '/heartbeat' && req.method === 'POST') {
      return await handleHeartbeat(req);
    }
    
    if (path === '/jobs/poll' && req.method === 'GET') {
      return await handleJobPoll(req);
    }

    // Performance testing routes
    if (path === '/performance/jobs/poll' && req.method === 'GET') {
      return await handlePerformanceJobPoll(req);
    }

    const perfJobStartMatch = path.match(/^\/performance\/jobs\/([^/]+)\/start$/);
    if (perfJobStartMatch && req.method === 'POST') {
      return await handlePerformanceJobStart(req, perfJobStartMatch[1]);
    }

    const perfResultMatch = path.match(/^\/performance\/jobs\/([^/]+)\/result$/);
    if (perfResultMatch && req.method === 'POST') {
      return await handlePerformanceResultSubmit(req, perfResultMatch[1]);
    }
    
    if (path === '/status' && req.method === 'GET') {
      return await handleStatus(req);
    }

    // Settings routes for agent to fetch app settings
    const settingsMatch = path.match(/^\/settings\/([^/]+)$/);
    if (settingsMatch && req.method === 'GET') {
      const settingKey = settingsMatch[1];
      const apiKey = req.headers.get('x-agent-key');
      const validation = await validateAgent(apiKey);

      if (!validation.valid) {
        return new Response(
          JSON.stringify({ error: validation.error }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const supabase = getSupabaseAdmin();
      const { data: setting, error: settingError } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', settingKey)
        .single();

      if (settingError) {
        console.log(`Setting '${settingKey}' not found:`, settingError);
        return new Response(
          JSON.stringify({ key: settingKey, value: null }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ key: settingKey, value: setting.setting_value }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Job-specific routes
    const jobStartMatch = path.match(/^\/jobs\/([^/]+)\/start$/);
    if (jobStartMatch && req.method === 'POST') {
      return await handleJobStart(req, jobStartMatch[1]);
    }

    const resultMatch = path.match(/^\/jobs\/([^/]+)\/result$/);
    if (resultMatch && req.method === 'POST') {
      return await handleResultSubmit(req, resultMatch[1]);
    }

    const artifactMatch = path.match(/^\/jobs\/([^/]+)\/artifacts$/);
    if (artifactMatch && req.method === 'POST') {
      return await handleArtifactUpload(req, artifactMatch[1]);
    }

    // Health check (only if no action was provided)
    if (path === '/health') {
      return new Response(
        JSON.stringify({ 
          status: 'healthy', 
          service: 'WISPR Agent API',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Not found', path }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Unhandled error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
