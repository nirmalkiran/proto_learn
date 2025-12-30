import { spawn, exec } from "child_process";

/* =====================================================
   INTERNAL STATE
===================================================== */

let recording = false;
let eventProcess = null;
let recordedSteps = [];
let lastEmit = 0;
let pendingTouchDown = null;
let currentX = 0;
let currentY = 0;

const listeners = new Set();

/* =====================================================
   UTIL
===================================================== */

function emit(event) {
  console.log("[AGENT] Emitting event:", JSON.stringify(event));
  listeners.forEach((fn) => fn(event));
}

/**
 * Execute ADB command and return promise with result
 */
function adbExec(command) {
  return new Promise((resolve, reject) => {
    exec(`adb ${command}`, (err, stdout, stderr) => {
      if (err) {
        reject(stderr || err.message);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

/**
 * Get screen dimensions from device
 */
async function getScreenDimensions() {
  try {
    const output = await adbExec("shell wm size");
    const match = output.match(/(\d+)x(\d+)/);
    if (match) {
      return { width: parseInt(match[1]), height: parseInt(match[2]) };
    }
  } catch (e) {
    console.error("[AGENT] Failed to get screen dimensions:", e);
  }
  return { width: 1080, height: 2400 }; // Default fallback
}

/**
 * Get UI hierarchy to find element at coordinates
 */
async function getElementAtPosition(x, y) {
  try {
    // Dump UI hierarchy
    await adbExec("shell uiautomator dump /sdcard/ui_dump.xml");
    const xml = await adbExec("shell cat /sdcard/ui_dump.xml");
    
    // Parse XML to find element at position
    const element = parseUIHierarchy(xml, x, y);
    return element;
  } catch (e) {
    console.error("[AGENT] Failed to get element:", e);
    return null;
  }
}

/**
 * Parse UI hierarchy XML to find element at coordinates
 */
function parseUIHierarchy(xml, x, y) {
  // Find all nodes with bounds
  const boundsRegex = /<node[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*>/g;
  const nodeRegex = /<node([^>]*)>/g;
  
  let bestMatch = null;
  let smallestArea = Infinity;
  
  let match;
  while ((match = nodeRegex.exec(xml)) !== null) {
    const attrs = match[1];
    
    // Extract bounds
    const boundsMatch = attrs.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (!boundsMatch) continue;
    
    const [, x1, y1, x2, y2] = boundsMatch.map(Number);
    
    // Check if point is within bounds
    if (x >= x1 && x <= x2 && y >= y1 && y <= y2) {
      const area = (x2 - x1) * (y2 - y1);
      
      // Prefer smaller elements (more specific)
      if (area < smallestArea && area > 0) {
        smallestArea = area;
        
        // Extract attributes
        const resourceId = attrs.match(/resource-id="([^"]*)"/)?.[1] || "";
        const text = attrs.match(/text="([^"]*)"/)?.[1] || "";
        const className = attrs.match(/class="([^"]*)"/)?.[1] || "";
        const contentDesc = attrs.match(/content-desc="([^"]*)"/)?.[1] || "";
        const clickable = attrs.includes('clickable="true"');
        
        bestMatch = {
          resourceId,
          text,
          className,
          contentDesc,
          clickable,
          bounds: { x1, y1, x2, y2 },
        };
      }
    }
  }
  
  return bestMatch;
}

/**
 * Generate locator from element info
 */
function generateLocator(element) {
  if (!element) return "//android.view.View";
  
  // Prefer resource-id
  if (element.resourceId) {
    return `//android.view.View[@resource-id="${element.resourceId}"]`;
  }
  
  // Use text if available
  if (element.text) {
    return `//*[@text="${element.text}"]`;
  }
  
  // Use content-desc
  if (element.contentDesc) {
    return `//*[@content-desc="${element.contentDesc}"]`;
  }
  
  // Fall back to class with bounds hint
  if (element.className) {
    const { x1, y1, x2, y2 } = element.bounds;
    return `//${element.className}[bounds="${x1},${y1},${x2},${y2}"]`;
  }
  
  return "//android.view.View";
}

/* =====================================================
   START RECORDING - Enhanced with coordinate capture
===================================================== */

export async function startRecording() {
  if (recording) return;

  recording = true;
  recordedSteps = [];
  lastEmit = 0;
  pendingTouchDown = null;
  currentX = 0;
  currentY = 0;

  console.log("[AGENT] 🎬 Recording started");

  // Get screen dimensions for coordinate mapping
  const screenDims = await getScreenDimensions();
  console.log("[AGENT] Screen dimensions:", screenDims);

  // Use sendevent monitoring with coordinate tracking
  eventProcess = spawn("adb", [
    "shell",
    "getevent",
    "-lt",
    "/dev/input/event4", // Primary touch device (may vary)
  ]);

  let touchStartTime = 0;
  let touchX = 0;
  let touchY = 0;
  let maxX = 32767; // Default touch screen max
  let maxY = 32767;

  eventProcess.stdout.on("data", async (data) => {
    if (!recording) return;

    const lines = data.toString().split("\n");

    for (const line of lines) {
      // Parse getevent output: [timestamp] /dev/input/eventX: type code value
      
      // Detect ABS_MT_POSITION_X (0035)
      if (line.includes("ABS_MT_POSITION_X")) {
        const valueMatch = line.match(/([0-9a-f]+)\s*$/i);
        if (valueMatch) {
          touchX = parseInt(valueMatch[1], 16);
          currentX = Math.round((touchX / maxX) * screenDims.width);
        }
      }

      // Detect ABS_MT_POSITION_Y (0036)
      if (line.includes("ABS_MT_POSITION_Y")) {
        const valueMatch = line.match(/([0-9a-f]+)\s*$/i);
        if (valueMatch) {
          touchY = parseInt(valueMatch[1], 16);
          currentY = Math.round((touchY / maxY) * screenDims.height);
        }
      }

      // Detect touch down (BTN_TOUCH DOWN or ABS_MT_TRACKING_ID with positive value)
      if (line.includes("BTN_TOUCH") && line.includes("DOWN")) {
        touchStartTime = Date.now();
        pendingTouchDown = { x: currentX, y: currentY, time: touchStartTime };
        console.log(`[AGENT] Touch DOWN at (${currentX}, ${currentY})`);
      }

      // Detect touch up (BTN_TOUCH UP)
      if (line.includes("BTN_TOUCH") && line.includes("UP")) {
        if (pendingTouchDown) {
          const duration = Date.now() - pendingTouchDown.time;
          const dx = Math.abs(currentX - pendingTouchDown.x);
          const dy = Math.abs(currentY - pendingTouchDown.y);

          // Determine action type based on movement and duration
          let actionType = "tap";
          let description = "";

          if (dx > 100 || dy > 100) {
            // Swipe detected
            actionType = "scroll";
            const direction = dx > dy
              ? (currentX > pendingTouchDown.x ? "right" : "left")
              : (currentY > pendingTouchDown.y ? "down" : "up");
            description = `Swipe ${direction}`;
          } else if (duration > 500) {
            // Long press
            actionType = "tap";
            description = `Long press at (${pendingTouchDown.x}, ${pendingTouchDown.y})`;
          } else {
            // Normal tap
            description = `Tap at (${pendingTouchDown.x}, ${pendingTouchDown.y})`;
          }

          // Debounce
          const now = Date.now();
          if (now - lastEmit < 300) {
            pendingTouchDown = null;
            continue;
          }
          lastEmit = now;

          // Try to get element info
          let locator = `//android.view.View[@bounds="${pendingTouchDown.x},${pendingTouchDown.y}"]`;
          let elementDesc = "";

          try {
            const element = await getElementAtPosition(pendingTouchDown.x, pendingTouchDown.y);
            if (element) {
              locator = generateLocator(element);
              elementDesc = element.text || element.contentDesc || element.resourceId || "";
              if (elementDesc) {
                description = `${actionType === "tap" ? "Tap" : "Swipe"} on "${elementDesc}"`;
              }
            }
          } catch (e) {
            console.error("[AGENT] Element lookup failed:", e);
          }

          const step = {
            type: actionType,
            description,
            locator,
            coordinates: {
              x: pendingTouchDown.x,
              y: pendingTouchDown.y,
              endX: currentX,
              endY: currentY,
            },
            timestamp: Date.now(),
          };

          console.log("[AGENT] Captured step:", step);
          recordedSteps.push(step);
          emit(step);

          pendingTouchDown = null;
        }
      }
    }
  });

  eventProcess.stderr.on("data", (data) => {
    console.error("[AGENT] getevent stderr:", data.toString());
  });

  eventProcess.on("error", (e) => {
    console.error("[AGENT] getevent process error:", e.message);
    // Try fallback to generic input device
    tryFallbackEventCapture(screenDims);
  });

  eventProcess.on("close", (code) => {
    console.log("[AGENT] getevent process closed with code:", code);
  });
}

/**
 * Fallback: Use input tap monitoring via logcat
 */
function tryFallbackEventCapture(screenDims) {
  console.log("[AGENT] Trying fallback event capture...");
  
  if (eventProcess) {
    eventProcess.kill("SIGINT");
  }

  // Alternative: Monitor all input events
  eventProcess = spawn("adb", ["shell", "getevent", "-l"]);

  eventProcess.stdout.on("data", async (data) => {
    if (!recording) return;

    const output = data.toString();
    const now = Date.now();

    // Debounce
    if (now - lastEmit < 500) return;

    // Detect any touch event
    if (output.includes("BTN_TOUCH") && output.includes("DOWN")) {
      lastEmit = now;

      // Get current screen tap location using input tap replay
      try {
        const element = await getElementAtPosition(540, 1200); // Center screen fallback
        
        const step = {
          type: "tap",
          description: element?.text 
            ? `Tap on "${element.text}"`
            : "Tap on screen",
          locator: element ? generateLocator(element) : "//android.view.View",
          timestamp: Date.now(),
        };

        console.log("[AGENT] Fallback captured step:", step);
        recordedSteps.push(step);
        emit(step);
      } catch (e) {
        console.error("[AGENT] Fallback capture error:", e);
      }
    }
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

  console.log("[AGENT] 🛑 Recording stopped. Steps captured:", recordedSteps.length);
  return recordedSteps;
}

/* =====================================================
   REPLAY RECORDING (using ADB)
===================================================== */

export async function replayRecording(steps = []) {
  console.log("[AGENT] ▶ Replaying", steps.length, "steps");

  for (const step of steps) {
    console.log("[AGENT] Replaying:", step.description);

    try {
      if (step.type === "tap" && step.coordinates) {
        await adbExec(`shell input tap ${step.coordinates.x} ${step.coordinates.y}`);
      } else if (step.type === "scroll" && step.coordinates) {
        await adbExec(
          `shell input swipe ${step.coordinates.x} ${step.coordinates.y} ${step.coordinates.endX} ${step.coordinates.endY} 300`
        );
      } else if (step.type === "input" && step.value) {
        await adbExec(`shell input text "${step.value.replace(/ /g, "%s")}"`);
      }
    } catch (e) {
      console.error("[AGENT] Replay step failed:", e);
    }

    // Wait between steps
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("[AGENT] ✅ Replay complete");
}

/* =====================================================
   STATUS
===================================================== */

export function getRecordingStatus() {
  return {
    recording,
    steps: recordedSteps.length,
    lastSteps: recordedSteps.slice(-5),
  };
}

/* =====================================================
   GET ALL RECORDED STEPS
===================================================== */

export function getRecordedSteps() {
  return recordedSteps;
}

/* =====================================================
   SUBSCRIBE (SSE)
===================================================== */

export function subscribe(fn) {
  listeners.add(fn);
  console.log("[AGENT] New subscriber added. Total:", listeners.size);
  return () => {
    listeners.delete(fn);
    console.log("[AGENT] Subscriber removed. Total:", listeners.size);
  };
}

/* =====================================================
   CAPTURE SCREENSHOT
===================================================== */

export async function captureScreenshot() {
  try {
    const timestamp = Date.now();
    await adbExec(`shell screencap -p /sdcard/screen_${timestamp}.png`);
    await adbExec(`pull /sdcard/screen_${timestamp}.png ./screenshots/`);
    return `./screenshots/screen_${timestamp}.png`;
  } catch (e) {
    console.error("[AGENT] Screenshot failed:", e);
    return null;
  }
}

/* =====================================================
   GET DEVICE INFO
===================================================== */

export async function getDeviceInfo() {
  try {
    const model = await adbExec("shell getprop ro.product.model");
    const version = await adbExec("shell getprop ro.build.version.release");
    const sdk = await adbExec("shell getprop ro.build.version.sdk");
    const dims = await getScreenDimensions();

    return {
      model,
      androidVersion: version,
      sdkVersion: sdk,
      screenWidth: dims.width,
      screenHeight: dims.height,
    };
  } catch (e) {
    console.error("[AGENT] Device info failed:", e);
    return null;
  }
}
