import express from "express";
import cors from "cors";
import { exec } from "child_process";
import path from "path";
import {
  startRecording,
  stopRecording,
  replayRecording,
  getRecordingStatus,
} from "./agent/mobile-agent.js";

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

/* =====================================================
   🔹 ANDROID SDK DETECTION
   ===================================================== */

const ANDROID_SDK =
  process.env.ANDROID_SDK_ROOT ||
  process.env.ANDROID_HOME ||
  null;

if (!ANDROID_SDK) {
  console.error("ANDROID_SDK_ROOT or ANDROID_HOME not set");
}

const ADB_PATH = ANDROID_SDK
  ? `"${path.join(ANDROID_SDK, "platform-tools", "adb.exe")}"`
  : "adb";

const EMULATOR_PATH = ANDROID_SDK
  ? `"${path.join(ANDROID_SDK, "emulator", "emulator.exe")}"`
  : "emulator";

/* =====================================================
   🔹 COMMAND RUNNER
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
    (error, stdout, stderr) => {
      if (error) {
        return res.json({
          success: false,
          error: stderr || error.message,
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
   ✅ HEALTH
   ===================================================== */

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    androidSdkDetected: Boolean(ANDROID_SDK),
  });
});

/* =====================================================
   ✅ APPIUM STATUS
   ===================================================== */

app.get("/appium/status", (req, res) => {
  exec("appium --version", (err, stdout) => {
    if (err) {
      return res.json({ running: false });
    }
    res.json({ running: true, version: stdout.trim() });
  });
});

/* =====================================================
   ✅ EMULATOR STATUS
   ===================================================== */

app.get("/emulator/status", (req, res) => {
  exec("adb devices", (err, stdout) => {
    if (err) return res.json({ running: false });

    const emulators = stdout
      .split("\n")
      .filter(
        (l) => l.startsWith("emulator-") && l.includes("device")
      );

    res.json({
      running: emulators.length > 0,
      emulators,
    });
  });
});

/* =====================================================
   ✅ DEVICE STATUS
   ===================================================== */

app.get("/device/check", (req, res) => {
  exec("adb devices", (err, stdout) => {
    if (err) return res.json({ connected: false });

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
   ✅ TERMINAL
   ===================================================== */

app.post("/terminal", (req, res) => {
  const { command } = req.body;

  if (!command) {
    return res.json({ success: false, error: "No command" });
  }

  if (command.startsWith("appium:start")) {
    exec(
      "appium --address 127.0.0.1 --port 4723 --base-path /wd/hub",
      () => {
        res.json({ success: true });
      }
    );
    return;
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
   🎥 RECORDING ENDPOINTS
   ===================================================== */

app.post("/recording/start", async (req, res) => {
  try {
    await startRecording();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post("/recording/stop", async (req, res) => {
  try {
    const steps = await stopRecording();
    res.json({ success: true, steps });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post("/recording/replay", async (req, res) => {
  try {
    await replayRecording(req.body.steps);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get("/recording/status", (req, res) => {
  res.json(getRecordingStatus());
});

/* =====================================================
   🚀 START
   ===================================================== */

app.listen(PORT, () => {
  console.log(
    `Mobile Automation Helper running at http://localhost:${PORT}`
  );
});
/**
 * =====================================================
 * ✅ LIVE DEVICE SCREEN STREAM (SCRCPY)
 * =====================================================
 */
import { spawn } from "child_process";

app.get("/device/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "multipart/x-mixed-replace; boundary=frame",
    "Cache-Control": "no-cache",
    "Connection": "close",
    "Pragma": "no-cache",
  });

  const scrcpy = spawn("scrcpy", [
    "--no-control",
    "--no-audio",
    "--max-size=720",
    "--output-format=mjpeg",
    "-"
  ]);

  scrcpy.stdout.on("data", (chunk) => {
    res.write(`--frame\r\n`);
    res.write(`Content-Type: image/jpeg\r\n\r\n`);
    res.write(chunk);
    res.write("\r\n");
  });

  scrcpy.on("close", () => {
    res.end();
  });

  req.on("close", () => {
    scrcpy.kill("SIGINT");
  });
});

/**
 * =====================================================
 * ✅ OPEN LOCAL APPIUM INSPECTOR (ROBUST)
 * =====================================================
 */
app.post("/appium/inspector", (req, res) => {
  let inspectorCmd = "";

  if (process.platform === "win32") {
    inspectorCmd =
      `"${process.env.LOCALAPPDATA}\\Programs\\Appium Inspector\\Appium Inspector.exe"`;
  } else if (process.platform === "darwin") {
    inspectorCmd = "open -a 'Appium Inspector'";
  } else {
    inspectorCmd = "appium-inspector";
  }

  console.log("Launching Appium Inspector:", inspectorCmd);

  exec(inspectorCmd, (err) => {
    if (err) {
      console.error("Inspector launch failed:", err.message);
      return res.status(500).json({
        success: false,
        error:
          "Appium Inspector not found. Please install Appium Inspector first.",
      });
    }

    return res.json({
      success: true,
      message: "Local Appium Inspector launched",
    });
  });
});
/**
 * =====================================================
 * ✅ START SCRCPY (SCREEN MIRROR)
 * =====================================================
 */
app.post("/mirror/start", (req, res) => {
  exec("scrcpy --no-control", (err) => {
    if (err) {
      return res.json({
        success: false,
        error: "Failed to start scrcpy",
      });
    }

    return res.json({
      success: true,
      message: "Screen mirroring started",
    });
  });
});

