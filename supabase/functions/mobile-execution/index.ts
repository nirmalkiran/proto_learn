import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  try {
    const { projectId, actions, appUrl } = await req.json();

    const user = Deno.env.get("BROWSERSTACK_USERNAME");
    const key = Deno.env.get("BROWSERSTACK_ACCESS_KEY");

    const caps = {
      capabilities: {
        platformName: "Android",
        "appium:automationName": "UiAutomator2",
        "appium:app": appUrl,
        "bstack:options": {
          userName: user,
          accessKey: key,
          projectName: "No-Code Mobile",
          buildName: projectId,
          sessionName: `Run-${Date.now()}`,
        },
      },
    };

    const r = await fetch(
      "https://hub-cloud.browserstack.com/wd/hub/session",
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${user}:${key}`),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(caps),
      }
    );

    const data = await r.json();

    return new Response(
      JSON.stringify({ success: true, sessionId: data.sessionId }),
      { status: 200 }
    );
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500,
    });
  }
});
