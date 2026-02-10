import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

interface TriggerPayload {
  environment?: string;
  version?: string;
  commit?: string;
  branch?: string;
  timestamp?: string;
  metadata?: Record<string, any>;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/");
    
    // Extract trigger ID from path: /trigger-webhook/{triggerId}
    const triggerId = pathParts[pathParts.length - 1];
    
    if (!triggerId || triggerId === "trigger-webhook") {
      return new Response(
        JSON.stringify({ error: "Trigger ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get webhook secret from header
    const webhookSecret = req.headers.get("x-webhook-secret");

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the trigger
    const { data: trigger, error: triggerError } = await supabase
      .from("agent_scheduled_triggers")
      .select("*")
      .eq("id", triggerId)
      .single();

    if (triggerError || !trigger) {
      console.error("Trigger not found:", triggerError);
      return new Response(
        JSON.stringify({ error: "Trigger not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify webhook secret for deployment triggers
    if (trigger.trigger_type === "deployment") {
      if (!webhookSecret || webhookSecret !== trigger.deployment_webhook_secret) {
        console.error("Invalid webhook secret");
        return new Response(
          JSON.stringify({ error: "Invalid webhook secret" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Check if trigger is active
    if (!trigger.is_active) {
      return new Response(
        JSON.stringify({ error: "Trigger is not active" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse payload
    let payload: TriggerPayload = {};
    if (req.method === "POST") {
      try {
        payload = await req.json();
      } catch {
        // Empty payload is fine
      }
    }

    // Verify environment if specified
    if (trigger.trigger_type === "deployment" && trigger.deployment_environment) {
      const requestEnv = payload.environment || url.searchParams.get("environment");
      if (requestEnv && requestEnv !== trigger.deployment_environment) {
        return new Response(
          JSON.stringify({ 
            message: "Environment mismatch, trigger skipped",
            expected: trigger.deployment_environment,
            received: requestEnv
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Create execution record
    const { data: execution, error: execError } = await supabase
      .from("agent_trigger_executions")
      .insert({
        trigger_id: trigger.id,
        project_id: trigger.project_id,
        trigger_source: "deployment",
        deployment_info: payload,
        status: "pending",
      })
      .select()
      .single();

    if (execError) {
      console.error("Error creating execution:", execError);
      throw new Error("Failed to create execution record");
    }

    // Queue the job based on target type
    let jobId: string | null = null;

    if (trigger.target_type === "test") {
      // Get the test details
      const { data: test, error: testError } = await supabase
        .from("nocode_tests")
        .select("*")
        .eq("id", trigger.target_id)
        .single();

      if (testError || !test) {
        // Update execution with error
        await supabase
          .from("agent_trigger_executions")
          .update({ status: "failed", error_message: "Target test not found" })
          .eq("id", execution.id);

        return new Response(
          JSON.stringify({ error: "Target test not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Create job in queue
      const runId = `TRIG-${Date.now().toString(36).toUpperCase()}`;
      
      const { data: job, error: jobError } = await supabase
        .from("agent_job_queue")
        .insert({
          project_id: trigger.project_id,
          test_id: trigger.target_id,
          run_id: runId,
          base_url: test.base_url,
          steps: test.steps,
          agent_id: trigger.agent_id,
          created_by: trigger.created_by,
          status: "pending",
        })
        .select()
        .single();

      if (jobError) {
        console.error("Error creating job:", jobError);
        await supabase
          .from("agent_trigger_executions")
          .update({ status: "failed", error_message: "Failed to create job" })
          .eq("id", execution.id);

        throw new Error("Failed to create job");
      }

      jobId = job.id;
    } else if (trigger.target_type === "suite") {
      // Get suite tests
      const { data: suiteTests, error: suiteError } = await supabase
        .from("nocode_suite_tests")
        .select(`
          id,
          execution_order,
          test:nocode_tests(*)
        `)
        .eq("suite_id", trigger.target_id)
        .order("execution_order");

      if (suiteError) {
        console.error("Error getting suite tests:", suiteError);
        await supabase
          .from("agent_trigger_executions")
          .update({ status: "failed", error_message: "Failed to get suite tests" })
          .eq("id", execution.id);

        throw new Error("Failed to get suite tests");
      }

      // Create jobs for each test in the suite
      for (const suiteTest of suiteTests || []) {
        const test = suiteTest.test as any;
        if (!test) continue;

        const runId = `TRIG-${Date.now().toString(36).toUpperCase()}-${suiteTest.execution_order}`;
        
        await supabase
          .from("agent_job_queue")
          .insert({
            project_id: trigger.project_id,
            test_id: test.id,
            run_id: runId,
            base_url: test.base_url,
            steps: test.steps,
            agent_id: trigger.agent_id,
            created_by: trigger.created_by,
            status: "pending",
          });
      }
    }

    // Update execution status
    await supabase
      .from("agent_trigger_executions")
      .update({ 
        status: "queued",
        job_id: jobId 
      })
      .eq("id", execution.id);

    // Update trigger last triggered time and next scheduled time
    const updateData: any = {
      last_triggered_at: new Date().toISOString(),
    };

    // Calculate next scheduled time if it's a schedule trigger
    if (trigger.trigger_type === "schedule" && trigger.schedule_type) {
      const now = new Date();
      const [hours, minutes] = (trigger.schedule_time || "09:00").split(":").map(Number);
      
      const next = new Date();
      next.setHours(hours, minutes, 0, 0);

      if (trigger.schedule_type === "hourly") {
        next.setMinutes(minutes);
        if (next <= now) {
          next.setHours(next.getHours() + 1);
        }
      } else if (trigger.schedule_type === "daily") {
        if (next <= now) {
          next.setDate(next.getDate() + 1);
        }
      } else if (trigger.schedule_type === "weekly") {
        const currentDay = now.getDay();
        let daysUntilNext = (trigger.schedule_day_of_week || 1) - currentDay;
        if (daysUntilNext < 0 || (daysUntilNext === 0 && next <= now)) {
          daysUntilNext += 7;
        }
        next.setDate(next.getDate() + daysUntilNext);
      }

      updateData.next_scheduled_at = next.toISOString();
    }

    await supabase
      .from("agent_scheduled_triggers")
      .update(updateData)
      .eq("id", trigger.id);

    // Log activity
    await supabase
      .from("agent_activity_logs")
      .insert({
        project_id: trigger.project_id,
        agent_id: trigger.agent_id,
        event_type: "trigger_executed",
        event_data: {
          trigger_id: trigger.id,
          trigger_name: trigger.name,
          trigger_type: trigger.trigger_type,
          target_type: trigger.target_type,
          target_id: trigger.target_id,
          deployment_info: payload,
        },
      });

    console.log(`Trigger ${trigger.name} executed successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Trigger executed successfully",
        execution_id: execution.id,
        job_id: jobId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Trigger webhook error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
