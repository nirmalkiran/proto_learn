import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Checking for scheduled triggers to execute...");

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date().toISOString();

    // Find all active schedule triggers that are due
    const { data: dueTriggers, error: triggerError } = await supabase
      .from("agent_scheduled_triggers")
      .select("*")
      .eq("trigger_type", "schedule")
      .eq("is_active", true)
      .lte("next_scheduled_at", now);

    if (triggerError) {
      console.error("Error fetching triggers:", triggerError);
      throw new Error("Failed to fetch scheduled triggers");
    }

    console.log(`Found ${dueTriggers?.length || 0} triggers due for execution`);

    const results: Array<{ triggerId: string; name: string; status: string; error?: string }> = [];

    for (const trigger of dueTriggers || []) {
      try {
        console.log(`Executing trigger: ${trigger.name} (${trigger.id})`);

        // Create execution record
        const { data: execution, error: execError } = await supabase
          .from("agent_trigger_executions")
          .insert({
            trigger_id: trigger.id,
            project_id: trigger.project_id,
            trigger_source: "schedule",
            status: "pending",
          })
          .select()
          .single();

        if (execError) {
          console.error("Error creating execution:", execError);
          results.push({ triggerId: trigger.id, name: trigger.name, status: "failed", error: "Failed to create execution" });
          continue;
        }

        // Queue the job based on target type
        let jobId: string | null = null;
        let jobsCreated = 0;

        if (trigger.target_type === "test") {
          // Get the test details
          const { data: test, error: testError } = await supabase
            .from("nocode_tests")
            .select("*")
            .eq("id", trigger.target_id)
            .single();

          if (testError || !test) {
            await supabase
              .from("agent_trigger_executions")
              .update({ status: "failed", error_message: "Target test not found" })
              .eq("id", execution.id);

            results.push({ triggerId: trigger.id, name: trigger.name, status: "failed", error: "Target test not found" });
            continue;
          }

          // Create job in queue
          const runId = `SCHED-${Date.now().toString(36).toUpperCase()}`;
          
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

            results.push({ triggerId: trigger.id, name: trigger.name, status: "failed", error: "Failed to create job" });
            continue;
          }

          jobId = job.id;
          jobsCreated = 1;
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

            results.push({ triggerId: trigger.id, name: trigger.name, status: "failed", error: "Failed to get suite tests" });
            continue;
          }

          // Create jobs for each test in the suite
          for (const suiteTest of suiteTests || []) {
            const test = suiteTest.test as any;
            if (!test) continue;

            const runId = `SCHED-${Date.now().toString(36).toUpperCase()}-${suiteTest.execution_order}`;
            
            const { error: jobError } = await supabase
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

            if (!jobError) {
              jobsCreated++;
            }
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

        // Calculate next scheduled time
        const [hours, minutes] = (trigger.schedule_time || "09:00").split(":").map(Number);
        const next = new Date();
        next.setHours(hours, minutes, 0, 0);

        if (trigger.schedule_type === "hourly") {
          next.setMinutes(minutes);
          next.setHours(new Date().getHours() + 1);
        } else if (trigger.schedule_type === "daily") {
          next.setDate(next.getDate() + 1);
        } else if (trigger.schedule_type === "weekly") {
          next.setDate(next.getDate() + 7);
        }

        // Update trigger
        await supabase
          .from("agent_scheduled_triggers")
          .update({
            last_triggered_at: new Date().toISOString(),
            next_scheduled_at: next.toISOString(),
          })
          .eq("id", trigger.id);

        // Log activity
        await supabase
          .from("agent_activity_logs")
          .insert({
            project_id: trigger.project_id,
            agent_id: trigger.agent_id,
            event_type: "scheduled_trigger_executed",
            event_data: {
              trigger_id: trigger.id,
              trigger_name: trigger.name,
              schedule_type: trigger.schedule_type,
              target_type: trigger.target_type,
              target_id: trigger.target_id,
              jobs_created: jobsCreated,
            },
          });

        console.log(`Trigger ${trigger.name} executed successfully, ${jobsCreated} job(s) queued`);
        results.push({ triggerId: trigger.id, name: trigger.name, status: "success" });

      } catch (err: any) {
        console.error(`Error executing trigger ${trigger.id}:`, err);
        results.push({ triggerId: trigger.id, name: trigger.name, status: "failed", error: err.message });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${results.length} scheduled triggers`,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Scheduled trigger execution error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
