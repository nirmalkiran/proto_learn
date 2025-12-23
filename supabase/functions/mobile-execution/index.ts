import { serve } from "std/http/server.ts";

const BS_USER = Deno.env.get("BROWSERSTACK_USERNAME")!;
const BS_KEY = Deno.env.get("BROWSERSTACK_ACCESS_KEY")!;
const BS_AUTH = btoa(`${BS_USER}:${BS_KEY}`);

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const { actions, appUrl } = await req.json();

  if (!actions || actions.length === 0) {
    return new Response(
      JSON.stringify({ success: false, error: "No actions provided" }),
      { status: 400 }
    );
  }

  /**
   * Convert recorded actions → Appium JS code
   */
  const steps = actions
    .map((a: any) => {
      switch (a.type) {
        case "tap":
          return `await driver.$("${a.locator}").click();`;
        case "input":
          return `await driver.$("${a.locator}").setValue("${a.value}");`;
        case "wait":
          return `await driver.pause(${a.duration || 1000});`;
        case "assert":
          return `await driver.$("${a.locator}").isDisplayed();`;
        default:
          return "";
      }
    })
    .join("\n");

  const script = `
const { remote } = require("webdriverio");

(async () => {
  const driver = await remote({
    hostname: "hub.browserstack.com",
    port: 443,
    path: "/wd/hub",
    user: "${BS_USER}",
    key: "${BS_KEY}",
    capabilities: {
      platformName: "Android",
      "appium:deviceName": "Google Pixel 7",
      "appium:platformVersion": "13.0",
      "appium:automationName": "UiAutomator2",
      "appium:app": "${appUrl}",
      "bstack:options": {
        projectName: "TestCraft AI",
        buildName: "Mobile No-Code Run",
        sessionName: "Recorded Flow"
      }
    }
  });

  try {
    ${steps}
  } finally {
    await driver.deleteSession();
  }
})();
`;

  /**
   * Send script to BrowserStack
   */
  const res = await fetch("https://api.browserstack.com/app-automate/execute", {
    method: "POST",
    headers: {
      Authorization: `Basic ${BS_AUTH}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      script,
      language: "nodejs",
    }),
  });

  const result = await res.json();

  return new Response(
    JSON.stringify({
      success: true,
      browserstack: result,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});
