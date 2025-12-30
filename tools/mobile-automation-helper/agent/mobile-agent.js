import { spawn } from "child_process";

/* =====================================================
   INTERNAL STATE
===================================================== */

let recording = false;
let eventProcess = null;
let recordedSteps = [];
let lastEmit = 0;

const listeners = new Set();

/* =====================================================
   UTIL
===================================================== */

function emit(event) {
  listeners.forEach((fn) => fn(event));
}

/* =====================================================
   START RECORDING
===================================================== */

export function startRecording() {
  if (recording) return;

  recording = true;
  recordedSteps = [];
  lastEmit = 0;

  console.log("Recording started");

  // Use basic adb input monitor (stable)
  eventProcess = spawn("adb", ["shell", "getevent", "-l"]);

  eventProcess.stdout.on("data", (data) => {
    if (!recording) return;

    const now = Date.now();

    // debounce to avoid noise
    if (now - lastEmit < 800) return;

    const output = data.toString();

    // VERY basic tap detection (Phase-1)
    if (output.includes("BTN_TOUCH")) {
      lastEmit = now;

      const step = {
        type: "tap",
        description: "Tap on screen",
        locator: "~TODO_locator",
        timestamp: Date.now(),
      };

      recordedSteps.push(step);
      emit(step);
    }
  });

  eventProcess.on("error", (e) => {
    console.error("ADB getevent error:", e.message);
  });
}

/* =====================================================
   STOP RECORDING
===================================================== */

export function stopRecording() {
  recording = false;

  if (eventProcess) {
    eventProcess.kill("SIGINT");
    eventProcess = null;
  }

  console.log("🛑 Recording stopped");
  return recordedSteps;
}

/* =====================================================
   REPLAY RECORDING (PHASE-1)
===================================================== */

export async function replayRecording(steps = []) {
  console.log("▶ Replaying steps:", steps.length);

  for (const step of steps) {
    console.log("Replaying:", step.description);
    await new Promise((r) => setTimeout(r, 700));
  }
}

/* =====================================================
   STATUS
===================================================== */

export function getRecordingStatus() {
  return {
    recording,
    steps: recordedSteps.length,
  };
}

/* =====================================================
   SUBSCRIBE (SSE)
===================================================== */

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
