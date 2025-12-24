import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    const username = Deno.env.get("BROWSERSTACK_USERNAME");
    const accessKey = Deno.env.get("BROWSERSTACK_ACCESS_KEY");

    if (!username || !accessKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "BrowserStack secrets missing",
        }),
        { status: 500, headers: corsHeaders }
      );
    }

    /* ------------------------------------------
       1. HEALTH CHECK (Setup Wizard)
    ------------------------------------------ */
    if (body.type === "health-check") {
      const auth = btoa(`${username}:${accessKey}`);

      const [devicesRes, appsRes] = await Promise.all([
        fetch("https://api.browserstack.com/app-automate/devices.json", {
          headers: { Authorization: `Basic ${auth}` },
        }),
        fetch("https://api.browserstack.com/app-automate/apps.json", {
          headers: { Authorization: `Basic ${auth}` },
        }),
      ]);

      if (!devicesRes.ok || !appsRes.ok) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid BrowserStack credentials",
          }),
          { status: 401, headers: corsHeaders }
        );
      }

      const devices = await devicesRes.json();
      const apps = await appsRes.json();

      return new Response(
        JSON.stringify({
          success: true,
          devices: devices.length,
          apps: apps.length,
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    /* ------------------------------------------
       2. EXECUTION REQUEST (Recorder)
    ------------------------------------------ */
    import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { projectId, actions, appUrl, device } = body;

    if (!actions || !appUrl) {
      throw new Error("Missing actions or appUrl");
    }

    // ✅ Save execution intent
    const { data, error } = await supabase
      .from("mobile_execution_history")
      .insert([
        {
          project_id: projectId,
          app_url: appUrl,
          status: "QUEUED",
          device,
          actions,
        },
      ])
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        executionId: data.id,
        status: data.status,
      }),
      { status: 200, headers: corsHeaders }
    );