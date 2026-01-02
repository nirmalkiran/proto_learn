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

app.use(cors());
app.use(express.json());

/* =====================================================
   HEALTH
===================================================== */

app.get("/health", (_, res) => {
  res.json({ ok: true });
});

// NOTE: A web page cannot start Node processes on your machine.
// This endpoint exists so the UI can "ping" the helper and confirm it's running.
app.post("/agent/start", (_, res) => {
  res.json({ success: true, alreadyRunning: true });
});

/* =====================================================
   APPIUM STATUS
===================================================== */

app.get("/appium/status", (_, res) => {
  exec("appium --version", (err, stdout) => {
    if (err) {
      return res.json({ running: false });
    }
    res.json({ running: true, version: stdout.trim() });
  });
});

/* =====================================================
   DEVICE / ADB STATUS
===================================================== */

app.get("/device/check", (_, res) => {
  exec("adb devices", (_, out) => {
    const devices = out
      .split("\n")
      .filter((l) => l.includes("\tdevice"));
    res.json({ connected: devices.length > 0, devices });
  });
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

  console.log("🚀 Starting emulator:", avd);

  exec(`emulator -avd ${avd}`, (err) => {
    if (err) {
      console.error("Emulator start failed:", err.message);
      return res.json({
        success: false,
        error: err.message,
      });
    }

    res.json({ success: true });
  });
});

/* =====================================================
   TERMINAL (ONLY FOR APPIUM)
===================================================== */

app.post("/terminal", (req, res) => {
  const { command } = req.body;

  if (command === "appium:start") {
    exec(
      "appium --address 127.0.0.1 --port 4723 --base-path /wd/hub",
      () => {
        res.json({ success: true });
      }
    );
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
    console.log("❌ SSE client disconnected");
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
   APPIUM INSPECTOR (LOCAL)
===================================================== */

app.post("/appium/inspector", (_, res) => {
  const inspectorPath =
    `"${process.env.LOCALAPPDATA}\\Programs\\Appium Inspector\\Appium Inspector.exe"`;

  exec(inspectorPath, (err) => {
    if (err) {
      return res.status(500).json({ success: false });
    }
    res.json({ success: true });
  });
});

/* =====================================================
   START SERVER
===================================================== */

app.listen(PORT, () => {
  console.log(
    `✅ Mobile Automation Helper running at http://localhost:${PORT}`
  );
});
