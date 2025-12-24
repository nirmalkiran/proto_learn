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

    const auth = btoa(`${username}:${accessKey}`);

    /* -------- CHECK DEVICES -------- */
    const devicesRes = await fetch(
      "https://api.browserstack.com/app-automate/devices.json",
      {
        headers: { Authorization: `Basic ${auth}` },
      }
    );

    if (!devicesRes.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid BrowserStack credentials",
        }),
        { status: 401, headers: corsHeaders }
      );
    }

    const devices = await devicesRes.json();

    /* -------- CHECK APPS -------- */
    const appsRes = await fetch(
      "https://api.browserstack.com/app-automate/apps.json",
      {
        headers: { Authorization: `Basic ${auth}` },
      }
    );

    const apps = appsRes.ok ? await appsRes.json() : [];

    return new Response(
      JSON.stringify({
        success: true,
        devices: Array.isArray(devices) ? devices.length : 0,
        apps: Array.isArray(apps) ? apps.length : 0,
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({
        success: false,
        error: String(e),
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});
