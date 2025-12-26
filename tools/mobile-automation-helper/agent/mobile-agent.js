import { remote } from "webdriverio";

let driver = null;
let recording = false;
let steps = [];

/* =====================================================
   🔌 APPIUM SESSION
   ===================================================== */

async function ensureSession() {
  if (driver) return;

  driver = await remote({
    hostname: "127.0.0.1",
    port: 4723,
    path: "/wd/hub",
    capabilities: {
      platformName: "Android",
      "appium:automationName": "UiAutomator2",
      "appium:deviceName": "emulator-5554",
      "appium:noReset": true,
    },
  });
}

/* =====================================================
   🎥 START RECORDING
   ===================================================== */

export async function startRecording() {
  await ensureSession();
  steps = [];
  recording = true;

  driver.on("command", (cmd) => {
    if (!recording) return;

    if (
      cmd.method === "POST" &&
      cmd.endpoint.includes("/element") &&
      cmd.body?.value
    ) {
      steps.push({
        type: "tap",
        locator: `${cmd.body.using}=${cmd.body.value}`,
        timestamp: Date.now(),
      });
    }
  });
}

/* =====================================================
   ⏹ STOP RECORDING
   ===================================================== */

export async function stopRecording() {
  recording = false;
  return steps;
}

/* =====================================================
   ▶ REPLAY STEPS
   ===================================================== */

export async function replayRecording(recordedSteps) {
  await ensureSession();

  for (const step of recordedSteps) {
    if (step.type === "tap") {
      const [using, value] = step.locator.split("=");
      await driver.$({ [using]: value }).click();
    }
  }
}

/* =====================================================
   📊 STATUS
   ===================================================== */

export function getRecordingStatus() {
  return {
    recording,
    stepCount: steps.length,
  };
}
