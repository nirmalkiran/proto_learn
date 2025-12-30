/* =====================================================
   IMPORTS (TOP ONLY)
===================================================== */

import express from "express";
import cors from "cors";
import { exec, spawn } from "child_process";
import path from "path";
import fs from "fs";

import {
  startRecording,
  stopRecording,
  replayRecording,
  getRecordingStatus,
  getRecordedSteps,
  subscribe,
  captureScreenshot,
  getDeviceInfo,
} from "./agent/mobile-agent.js";

// Ensure screenshots directory exists
if (!fs.existsSync("./screenshots")) {
  fs.mkdirSync("./screenshots", { recursive: true });
}

/* =====================================================
   APP INIT
===================================================== */

const app = express();
const PORT = 3001;
let agentProcess = null;
let serverProcess = null;

app.use(cors());
app.use(express.json());

/* =====================================================
   ANDROID SDK DETECTION
===================================================== */

const ANDROID_SDK =
  process.env.ANDROID_SDK_ROOT ||
  process.env.ANDROID_HOME ||
  null;

if (!ANDROID_SDK) {
  console.warn("? ANDROID_SDK_ROOT / ANDROID_HOME not set");
}

const ADB_PATH = ANDROID_SDK
  ? `"${path.join(ANDROID_SDK, "platform-tools", "adb.exe")}"`
  : "adb";

const EMULATOR_PATH = ANDROID_SDK
  ? `"${path.join(ANDROID_SDK, "emulator", "emulator.exe")}"`
  : "emulator";

/* =====================================================
   UTIL
===================================================== */

function run(command, res) {
  exec(
    command,
    {
      shell: true,
      env: {
        ...process.env,
        PATH: ANDROID_SDK
          ? `${path.join(ANDROID_SDK, "platform-tools")};${process.env.PATH}`
          : process.env.PATH,
      },
    },
    (err, stdout, stderr) => {
      if (err) {
        return res.json({
          success: false,
          error: stderr || err.message,
        });
      }

      res.json({
        success: true,
        output: stdout.trim(),
      });
    }
  );
}

/* =====================================================
   HEALTH & SETUP STATUS
===================================================== */

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    androidSdkDetected: Boolean(ANDROID_SDK),
  });
});

app.get("/appium/status", (req, res) => {
  exec("appium --version", (err, stdout) => {
    if (err) return res.json({ running: false });
    res.json({ running: true, version: stdout.trim() });
  });
});

app.get("/emulator/status", (req, res) => {
  exec("adb devices", (_, stdout) => {
    const emulators = stdout
      .split("\n")
      .filter((l) => l.startsWith("emulator-") && l.includes("device"));

    res.json({
      running: emulators.length > 0,
      emulators,
    });
  });
});

app.get("/device/check", (req, res) => {
  exec("adb devices", (_, stdout) => {
    const devices = stdout
      .split("\n")
      .filter((l) => l.includes("\tdevice"));

    res.json({
      connected: devices.length > 0,
      devices,
    });
  });
});

/* =====================================================
   TERMINAL (APPIUM / ADB / EMULATOR)
===================================================== */

app.post("/terminal", (req, res) => {
  const { command } = req.body;
  if (!command) {
    return res.json({ success: false, error: "No command provided" });
  }

  if (command === "appium:start") {
    exec(
      "appium --address 127.0.0.1 --port 4723 --base-path /wd/hub"
    );
    return res.json({ success: true });
  }

  if (command.startsWith("adb")) {
    return run(command.replace(/^adb/, ADB_PATH), res);
  }

  if (command.startsWith("emulator")) {
    const avd = command.split(" ")[1];
    exec(`${EMULATOR_PATH} -avd ${avd}`);
    return res.json({ success: true });
  }

  run(command, res);
});

/* =====================================================
   ?? RECORDING API
===================================================== */

app.post("/recording/start", (req, res) => {
  startRecording();
  res.json({ success: true });
});

app.post("/recording/stop", (req, res) => {
  const steps = stopRecording();
  res.json({ success: true, steps });
});

app.post("/recording/replay", (req, res) => {
  replayRecording(req.body.steps || []);
  res.json({ success: true });
});

app.get("/recording/status", (req, res) => {
  res.json(getRecordingStatus());
});

app.get("/recording/steps", (req, res) => {
  res.json({ success: true, steps: getRecordedSteps() });
});

/* =====================================================
   📷 SCREENSHOT & DEVICE INFO
===================================================== */

app.post("/device/screenshot", async (req, res) => {
  try {
    const path = await captureScreenshot();
    res.json({ success: true, path });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

/* =====================================================
   🔴 RECORDING EVENTS (SSE)
===================================================== */

app.get("/recording/events", (req, res) => {
  console.log("[SERVER] SSE client connected");

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // Send initial heartbeat
  res.write(": heartbeat\n\n");

  const unsubscribe = subscribe((event) => {
    console.log("[SERVER] Sending SSE event:", event.type);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  // Keep connection alive with periodic heartbeats
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 15000);

  req.on("close", () => {
    console.log("[SERVER] SSE client disconnected");
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});

/* =====================================================
   ?? DEVICE MIRROR (SCRCPY – DESKTOP WINDOW)
===================================================== */

app.post("/device/mirror", (req, res) => {
  const cmd =
    process.platform === "win32"
      ? "scrcpy --window-title Recorder"
      : "scrcpy";

  exec(cmd, (err) => {
    if (err) {
      return res.json({
        success: false,
        error: err.message,
      });
    }

    res.json({ success: true });
  });
});

/* =====================================================
   ?? LOCAL APPIUM INSPECTOR
===================================================== */

app.post("/appium/inspector", (req, res) => {
  let cmd = "";

  if (process.platform === "win32") {
    cmd = `"${process.env.LOCALAPPDATA}\\Programs\\Appium Inspector\\Appium Inspector.exe"`;
  } else if (process.platform === "darwin") {
    cmd = "open -a 'Appium Inspector'";
  } else {
    cmd = "appium-inspector";
  }

  exec(cmd, (err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        error: "Appium Inspector not found",
      });
    }

    res.json({ success: true });
  });
});

/* =====================================================
   ?? AGENT CONTROL
===================================================== */

app.post("/agent/start", (req, res) => {
  if (agentProcess) {
    return res.json({
      success: true,
      message: "Agent already running",
    });
  }

  agentProcess = spawn("npm", ["run", "agent"], {
    shell: true,
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
  });

  agentProcess.unref();

  console.log("Local Agent started (npm run agent)");

  res.json({ success: true });
});

app.get("/agent/status", (req, res) => {
  res.json({
    running: Boolean(agentProcess),
  });
});

/* =====================================================
   ?? START SERVER
===================================================== */

app.listen(PORT, () => {
  console.log(
    `Mobile Automation Helper running at http://localhost:${PORT}`
  );
});