import { spawn, exec } from "child_process";

/* =====================================================
   INTERNAL STATE
===================================================== */

let recording = false;
let eventProcess = null;
let recordedSteps = [];
let lastEmitTime = 0;

let touchDown = null;
let currentX = 0;
let currentY = 0;

const listeners = new Set();

/* =====================================================
   UTIL
===================================================== */

function emit(event) {
  console.log("[AGENT] Emit:", event);
  listeners.forEach((fn) => fn(event));
}

function adbExec(command) {
  return new Promise((resolve, reject) => {
    exec(`adb ${command}`, (err, stdout, stderr) => {
      if (err) reject(stderr || err.message);
      else resolve(stdout.trim());
    });
  });
}

async function getScreenSize() {
  try {
    const out = await adbExec("shell wm size");
    const m = out.match(/(\d+)x(\d+)/);
    if (m) return { w: +m[1], h: +m[2] };
  } catch {}
  return { w: 1080, h: 2400 };
}

/* =====================================================
   LOCATOR (SMART BASIC)
===================================================== */

async function resolveLocator(x, y) {
  try {
    await adbExec("shell uiautomator dump /sdcard/ui.xml");
    const xml = await adbExec("shell cat /sdcard/ui.xml");

    const regex =
      /<node[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*resource-id="([^"]*)"[^>]*text="([^"]*)"[^>]*class="([^"]*)"/g;

    let match;
    while ((match = regex.exec(xml))) {
      const [_, x1, y1, x2, y2, rid, text, cls] = match.map((v, i) =>
        i === 0 ? v : isNaN(v) ? v : +v
      );

      if (x >= x1 && x <= x2 && y >= y1 && y <= y2) {
        if (rid) return `//*[@resource-id="${rid}"]`;
        if (text) return `//*[@text="${text}"]`;
        return `//${cls}`;
      }
    }
  } catch {}
  return "//android.view.View";
}

/* =====================================================
   START RECORDING
===================================================== */

export async function startRecording() {
  if (recording) return;

  recording = true;
  recordedSteps = [];
  lastEmitTime = 0;
  touchDown = null;

  console.log("[AGENT] Recording started");

  const { w, h } = await getScreenSize();

  eventProcess = spawn("adb", ["shell", "getevent", "-lt"]);

  eventProcess.stdout.on("data", async (data) => {
    if (!recording) return;

    const lines = data.toString().split("\n");

    const finalizeGesture = async () => {
      if (!touchDown) return;

      const now = Date.now();
      // Debounce noisy devices (but always clear touchDown)
      if (now - lastEmitTime < 250) {
        touchDown = null;
        return;
      }
      lastEmitTime = now;

      const dx = Math.abs(currentX - touchDown.x);
      const dy = Math.abs(currentY - touchDown.y);

      let type = "tap";
      let desc = "Tap on screen";

      if (dx > 80 || dy > 80) {
        type = "scroll";
        desc = "Scroll gesture";
      }

      const locator = await resolveLocator(touchDown.x, touchDown.y);

      const step = {
        type,
        description: desc,
        locator,
        coordinates: {
          x: touchDown.x,
          y: touchDown.y,
          endX: currentX,
          endY: currentY,
        },
        timestamp: Date.now(),
      };

      recordedSteps.push(step);
      emit(step);
      touchDown = null;
    };

    for (const line of lines) {
      if (line.includes("ABS_MT_POSITION_X")) {
        const v = parseInt(line.split(" ").pop(), 16);
        currentX = Math.round((v / 32767) * w);
      }

      if (line.includes("ABS_MT_POSITION_Y")) {
        const v = parseInt(line.split(" ").pop(), 16);
        currentY = Math.round((v / 32767) * h);
      }

      // Touch down (some devices emit BTN_TOUCH; some only emit TRACKING_ID)
      if (line.includes("BTN_TOUCH") && line.includes("DOWN")) {
        touchDown = { x: currentX, y: currentY, t: Date.now() };
      }

      if (line.includes("ABS_MT_TRACKING_ID")) {
        const last = (line.split(" ").pop() || "").toLowerCase();
        const isRelease = last === "ffffffff";

        if (!isRelease && !touchDown) {
          touchDown = { x: currentX, y: currentY, t: Date.now() };
        }

        if (isRelease && touchDown) {
          await finalizeGesture();
        }
      }

      // Touch up (BTN_TOUCH release)
      if (line.includes("BTN_TOUCH") && line.includes("UP") && touchDown) {
        await finalizeGesture();
      }
    }
  });

  eventProcess.on("close", () => console.log("[AGENT] getevent closed"));
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

  console.log("[AGENT] Recording stopped:", recordedSteps.length);
  return recordedSteps;
}

/* =====================================================
   REPLAY (ADB)
===================================================== */

export async function replayRecording(steps = []) {
  for (const s of steps) {
    if (s.type === "tap") {
      await adbExec(`shell input tap ${s.coordinates.x} ${s.coordinates.y}`);
    }
    if (s.type === "scroll") {
      await adbExec(
        `shell input swipe ${s.coordinates.x} ${s.coordinates.y} ${s.coordinates.endX} ${s.coordinates.endY} 300`
      );
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}

/* =====================================================
   STATUS + SSE
===================================================== */

export function getRecordingStatus() {
  return { recording, steps: recordedSteps.length };
}

export function getRecordedSteps() {
  return recordedSteps;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
