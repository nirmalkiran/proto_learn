import express from "express";
import cors from "cors";
import { exec, spawn } from "child_process";

import {
  startRecording,
  stopRecording,
  replayRecording,
  getRecordingStatus,
  getRecordedSteps,
  subscribe,
  getScreenSize,
  captureTap,
  captureInput,
} from "./agent/mobile-agent.js";

/* =====================================================
   APP INIT
===================================================== */

const app = express();
const PORT = 3001;
const savedTestCases = [];

app.use(cors());
app.use(express.json());

/* =====================================================
   HELPER: Safe exec with JSON error response
===================================================== */

function safeExec(command, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const child = exec(command, { timeout }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout.trim());
    });
  });
}

/* =====================================================
   HELPER: Check if ADB is available
===================================================== */

async function isAdbAvailable() {
  try {
    await safeExec("adb version", 3000);
    return true;
  } catch {
    return false;
  }
}

/* =====================================================
   HELPER: Check if device is connected
===================================================== */

async function getConnectedDevices() {
  try {
    const out = await safeExec("adb devices");
    const lines = out.split("\n").filter((l) => l.includes("\tdevice"));
    return lines.map((l) => {
      const id = l.split("\t")[0];
      const isEmulator = id.startsWith("emulator-");
      const isWireless = id.includes(":");
      return {
        id,
        type: isEmulator ? "emulator" : isWireless ? "wireless" : "usb",
        priority: isEmulator ? 2 : isWireless ? 3 : 1, // USB has highest priority
      };
    });
  } catch {
    return [];
  }
}

/* =====================================================
   HEALTH
===================================================== */

app.get("/health", async (_, res) => {
  const adbOk = await isAdbAvailable();
  res.json({ ok: true, status: true, adb: adbOk });
});

/* =====================================================
   AGENT STATUS
===================================================== */

app.get("/agent/status", (_, res) => {
  const status = getRecordingStatus();
  res.json({ 
    success: true, 
    running: true, 
    recording: status.recording,
    steps: status.steps 
  });
});

// NOTE: A web page cannot start Node processes on your machine.
// This endpoint exists so the UI can "ping" the helper and confirm it's running.
app.post("/agent/start", (_, res) => {
 // res.json({ success: true, alreadyRunning: true });
 res.json({
    success: true,
    alreadyRunning: true,
    message: "Agent is already running in background"
  });
});

/* =====================================================
   APPIUM STATUS (with defensive check)
===================================================== */

app.get("/appium/status", (_, res) => {
  exec("appium --version", { timeout: 5000 }, (err, stdout) => {
    if (err) {
      return res.json({ running: false, error: "Appium not found or not running" });
    }
    res.json({ running: true, version: stdout.trim() });
  });
});

/* =====================================================
   DEVICE / ADB STATUS (enhanced with device type)
===================================================== */

app.get("/device/check", async (_, res) => {
  try {
    const devices = await getConnectedDevices();
    if (devices.length === 0) {
      return res.json({ connected: false, devices: [], deviceType: null });
    }
    // Sort by priority (USB first)
    devices.sort((a, b) => a.priority - b.priority);
    const primary = devices[0];
    res.json({ 
      connected: true, 
      devices: devices.map(d => d.id), 
      deviceType: primary.type,
      primaryDevice: primary.id,
      allDevices: devices
    });
  } catch (err) {
    res.json({ connected: false, devices: [], error: String(err) });
  }
});

/* =====================================================
   EMULATOR STATUS
===================================================== */

app.get("/emulator/status", (_, res) => {
  exec("adb devices", (_, out) => {
    const emulators = out
      .split("\n")
      .filter(
        (l) => l.startsWith("emulator-") && l.includes("\tdevice")
      );

    res.json({
      running: emulators.length > 0,
      emulators,
    });
  });
});

/* =====================================================
   START EMULATOR
===================================================== */

app.post("/emulator/start", (req, res) => {
  const { avd } = req.body;

  if (!avd) {
    return res
      .status(400)
      .json({ success: false, error: "AVD name required" });
  }

  console.log("Starting emulator:", avd);

  // Start emulator in background without opening terminal window
  const emulatorProcess = spawn("emulator", ["-avd", avd], {
    detached: true,
    stdio: "ignore",
  });

  emulatorProcess.unref();

  // Respond immediately - emulator will start in background
  res.json({ success: true, message: "Emulator starting in background" });
});

/* =====================================================
   TERMINAL (ONLY FOR APPIUM)
===================================================== */

app.post("/terminal", (req, res) => {
  const { command } = req.body;

  if (command === "appium:start") {
    // Start Appium in background without opening terminal window
    const appiumProcess = spawn("appium", ["--address", "127.0.0.1", "--port", "4723", "--base-path", "/wd/hub"], {
      detached: true,
      stdio: "ignore",
    });

    appiumProcess.unref();

    res.json({ success: true, message: "Appium starting in background" });
    return;
  }

  res.status(400).json({
    success: false,
    error: "Unsupported command",
  });
});

/* =====================================================
   RECORDING API
===================================================== */

app.post("/recording/start", (_, res) => {
  startRecording();
  res.json({ success: true });
});

app.post("/recording/stop", (_, res) => {
  const steps = stopRecording();
  res.json({ success: true, steps });
});

app.post("/recording/replay", async (req, res) => {
  try {
    const steps = req.body.steps || [];
    await replayRecording(steps);
    res.json({ success: true });
  } catch (err) {
    console.error("Replay failed:", err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

app.get("/recording/status", (_, res) => {
  res.json(getRecordingStatus());
});

app.get("/recording/steps", (_, res) => {
  res.json({ success: true, steps: getRecordedSteps() });
});

app.get("/recording/events", (req, res) => {
  console.log("📡 SSE client connected");

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const unsubscribe = subscribe((event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  req.on("close", () => {
    unsubscribe();
    res.end();
    console.log("SSE client disconnected");
  });
});
app.post("/testcases/save", (req, res) => {
  const { name, steps } = req.body;

  if (!name || !steps || !steps.length) {
    return res.status(400).json({
      success: false,
      error: "Invalid test case data",
    });
  }

  const testCase = {
    id: Date.now(),
    name,
    steps,
    createdAt: new Date().toISOString(),
  };

  savedTestCases.push(testCase);

  console.log("[SERVER] Test case saved:", testCase.name);

  res.json({
    success: true,
    testCaseId: testCase.id,
  });
});
app.get("/testcases", (req, res) => {
  res.json({
    success: true,
    testcases: savedTestCases,
  });
});


/* =====================================================
   DEVICE MIRROR (SCRCPY)
===================================================== */

app.post("/device/mirror", (_, res) => {
  // Validate scrcpy exists so we can return a clear error immediately.
  exec("scrcpy --version", (checkErr) => {
    if (checkErr) {
      return res.status(400).json({
        success: false,
        code: "SCRCPY_MISSING",
        error:
          "scrcpy is not installed or not on PATH. Install scrcpy and restart the local helper.",
      });
    }

    const p = spawn("scrcpy", ["--window-title", "Recorder"], {
      detached: true,
      stdio: "ignore",
    });

    p.unref();
    return res.json({ success: true });
  });
});

/* =====================================================
   DEVICE HELPERS (SIZE / TAP)
===================================================== */

app.get("/device/size", async (_, res) => {
  try {
    const size = await getScreenSize();
    res.json({ success: true, size });
  } catch (err) {
    console.error("/device/size error:", err);
    res.status(500).json({ success: false, error: "Failed to get device size", details: String(err) });
  }
});

app.post("/device/tap", express.json(), async (req, res) => {
  const { x, y } = req.body || {};

  if (typeof x !== "number" || typeof y !== "number") {
    return res.status(400).json({ success: false, error: "x and y required" });
  }

  try {
    const step = await captureTap(x, y);
    return res.json({ success: true, step });
  } catch (err) {
    console.error("Tap error:", err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

app.post('/device/input', express.json(), async (req, res) => {
  const { x, y, text } = req.body || {};
  if (typeof x !== 'number' || typeof y !== 'number' || typeof text !== 'string') {
    return res.status(400).json({ success: false, error: 'x,y,text required' });
  }

  try {
    const step = await captureInput(x, y, text);
    return res.json({ success: true, step });
  } catch (err) {
    console.error('Input error:', err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// Debug raw wm size command
app.get('/device/size-raw', (_, res) => {
  exec('adb shell wm size', (err, stdout, stderr) => {
    if (err) return res.status(500).json({ err: String(err), stderr });
    res.json({ stdout: stdout.trim(), stderr });
  });
});

/* =====================================================
   DEVICE SCREENSHOT (FOR EMBEDDED PREVIEW)
===================================================== */

app.get("/device/screenshot", (req, res) => {
  // First check if device is connected
  exec("adb devices", (adbErr, adbOut) => {
    if (adbErr) {
      return res.status(500).json({ success: false, error: "ADB not available" });
    }
    
    const devices = adbOut.split("\n").filter((l) => l.includes("\tdevice"));
    if (devices.length === 0) {
      return res.status(400).json({ success: false, error: "No device connected" });
    }

    // Capture screenshot with larger buffer
    exec("adb exec-out screencap -p", { encoding: "buffer", maxBuffer: 50 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        console.error("Screenshot error:", err.message);
        return res.status(500).json({ success: false, error: err.message });
      }
      
      if (!stdout || stdout.length === 0) {
        return res.status(500).json({ success: false, error: "Empty screenshot" });
      }
      
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.send(stdout);
    });
  });
});

/* =====================================================
   APPIUM INSPECTOR (LOCAL) - Non-blocking & Safe
===================================================== */

app.post("/appium/inspector", (_, res) => {
  // Try multiple paths for cross-platform support
  const paths = [
    process.env.LOCALAPPDATA ? `"${process.env.LOCALAPPDATA}\\Programs\\Appium Inspector\\Appium Inspector.exe"` : null,
    "/Applications/Appium Inspector.app/Contents/MacOS/Appium Inspector",
    "appium-inspector",
  ].filter(Boolean);

  let launched = false;

  const tryLaunch = (idx) => {
    if (idx >= paths.length) {
      return res.json({ success: false, error: "Appium Inspector not found. Please install it." });
    }
    
    const p = spawn(paths[idx], [], { detached: true, stdio: "ignore", shell: true });
    p.unref();
    
    p.on("error", () => {
      tryLaunch(idx + 1);
    });
    
    // Assume success if no immediate error
    setTimeout(() => {
      if (!launched) {
        launched = true;
        res.json({ success: true });
      }
    }, 500);
  };

  tryLaunch(0);
});

/* =====================================================
   START SERVER
===================================================== */

app.listen(PORT, () => {
  console.log(
    `Mobile Automation Helper running at http://localhost:${PORT}`
  );
});
