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

export async function getScreenSize() {
  try {
    const out = await adbExec("shell wm size");
    const m = out.match(/(\d+)x(\d+)/);
    if (m) return { w: +m[1], h: +m[2] };
  } catch {}
  return { w: 1080, h: 2400 };
}

export async function captureTap(x, y) {
  try {
    const locObj = await resolveLocator(x, y);
    const locator = locObj.locator;

    const label = locObj.resourceId || locObj.text || locObj.className || `${x},${y}`;
    const step = {
      type: "tap",
      description: locObj.resourceId ? `Tap on ${locObj.resourceId}` : locObj.text ? `Tap on \"${locObj.text}\"` : `Tap on ${locObj.className || `${x},${y}`}`,
      locator,
      isInputCandidate: locObj.kind === "input",
      coordinates: { x, y },
      timestamp: Date.now(),
    };

    recordedSteps.push(step);
    emit(step);

    // Perform the tap on device
    try {
      await adbExec(`shell input tap ${x} ${y}`);
    } catch (e) {
      // Still return the step even if ADB input fails
      console.warn("[AGENT] input tap failed:", e);
    }

    return step;
  } catch (err) {
    throw err;
  }
}

export async function captureInput(x, y, text) {
  try {
    const locObj = await resolveLocator(x, y);
    const locator = locObj.locator;

    const step = {
      type: "input",
      description: `Enter \"${text}\" into ${locObj.resourceId || locObj.text || locObj.className || `${x},${y}`}`,
      locator,
      value: text,
      coordinates: { x, y },
      timestamp: Date.now(),
    };

    recordedSteps.push(step);
    emit(step);

    // Perform the input on device (escape spaces)
    try {
      const escaped = String(text).replace(/ /g, '%s').replace(/"/g, '\\"');
      await adbExec(`shell input text \'${escaped}\'`).catch(() => adbExec(`shell input text ${escaped}`));
      // Send Enter to finalize input
      await adbExec('shell input keyevent 66');
    } catch (e) {
      console.warn("[AGENT] input text failed:", e);
    }

    return step;
  } catch (err) {
    throw err;
  }
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
        const locator = rid ? `//*[@resource-id="${rid}"]` : text ? `//*[@text="${text}"]` : `//${cls}`;
        const kind = (() => {
          const lc = String(cls || "").toLowerCase();
          const id = String(rid || "").toLowerCase();
          if (lc.includes("edittext") || id.includes("input") || id.includes("edit")) return "input";
          if (lc.includes("button") || id.includes("button")) return "button";
          return "other";
        })();
        return { locator, kind, text: text || "", resourceId: rid || "", className: cls || "" };
      }
    }
  } catch {}
  return { locator: "//android.view.View", kind: "other", text: "", resourceId: "", className: "" };
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

      const locObj = await resolveLocator(touchDown.x, touchDown.y);
      const locator = locObj.locator;

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

function extractPackageFromSteps(steps = []) {
  for (const s of steps) {
    const loc = s.locator || "";
    const m = loc.match(/resource-id=\"([^:\"]+):/);
    if (m && m[1]) return m[1];
    // also check description for package-looking strings
    if (s.description) {
      const dm = s.description.match(/([a-zA-Z0-9_\.]+)\:\/\//);
      if (dm && dm[1]) return dm[1];
    }
  }
  return null;
}

export async function replayRecording(steps = []) {
  try {
    if (!Array.isArray(steps) || steps.length === 0) {
      emit({ type: "replay:start", description: "No steps provided for replay" });
      return;
    }

    emit({ type: "replay:start", description: `Starting replay of ${steps.length} steps` });

    const pkg = extractPackageFromSteps(steps);
    if (pkg) {
      emit({ type: "replay:info", description: `Opening app ${pkg} on device` });
      try {
        await adbExec(`shell monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`);
        // give app a moment to start
        await new Promise((r) => setTimeout(r, 1200));
      } catch (e) {
        emit({ type: "replay:error", description: `Failed to launch app ${pkg}: ${String(e)}` });
      }
    } else {
      emit({ type: "replay:info", description: "No package found in steps. Proceeding without launching an app." });
    }

    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      emit({ type: "replay:step:start", description: `Replaying step ${i + 1}/${steps.length}: ${s.description || s.type}`, stepIndex: i, step: s });

      try {
        if (s.type === "tap") {
          await adbExec(`shell input tap ${s.coordinates.x} ${s.coordinates.y}`);
        } else if (s.type === "scroll") {
          await adbExec(
            `shell input swipe ${s.coordinates.x} ${s.coordinates.y} ${s.coordinates.endX} ${s.coordinates.endY} 300`
          );
        } else if (s.type === "input") {
          const text = String(s.value || "");
          const escaped = text.replace(/ /g, '%s').replace(/"/g, '\\"');
          try {
            await adbExec(`shell input text '${escaped}'`).catch(() => adbExec(`shell input text ${escaped}`));
            await adbExec('shell input keyevent 66');
          } catch (e) {
            emit({ type: "replay:error", description: `Input failed for step ${i + 1}: ${String(e)}` });
          }
        } else if (s.type === "wait") {
          const ms = Number(s.value) || 500;
          await new Promise((r) => setTimeout(r, ms));
        } else {
          // Unknown step: still wait a short time
          await new Promise((r) => setTimeout(r, 350));
        }

        emit({ type: "replay:step:done", description: `Completed step ${i + 1}/${steps.length}: ${s.description || s.type}`, stepIndex: i, step: s });
      } catch (stepErr) {
        emit({ type: "replay:step:error", description: `Error on step ${i + 1}: ${String(stepErr)}`, stepIndex: i, step: s });
      }

      // small pause between steps
      await new Promise((r) => setTimeout(r, 400));
    }

    emit({ type: "replay:finished", description: `Replay finished (${steps.length} steps)` });
  } catch (err) {
    emit({ type: "replay:error", description: String(err) });
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
