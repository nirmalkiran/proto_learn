import express from "express";
import cors from "cors";
import { exec, spawn } from "child_process";
import { createServer } from 'net';

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

let agentStarted = false;
let appiumStarted = false;
let emulatorStarted = false;


const app = express();
const PORT = 3001;
const savedTestCases = [];

app.use(cors());
app.use(express.json());



function safeExec(command, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const child = exec(command, { timeout }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout.trim());
    });
  });
}


function isPortOpen(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(false));
    });
    server.on('error', () => resolve(true));
  });
}



function commandExists(command) {
  return new Promise((resolve) => {
    exec(`where ${command}`, (err) => {
      resolve(!err);
    });
  });
}



async function startAgentIfNeeded() {
  if (agentStarted) return false;
  try {
    const child = spawn('node', ['agent/start-agent.js'], {
      detached: true,
      stdio: 'ignore',
      cwd: process.cwd()
    });
    child.on('error', (err) => {
      console.error('Failed to start agent:', err.message);
    });
    child.unref();
    agentStarted = true;
    return true;
  } catch (err) {
    console.error('Failed to start agent:', err.message);
    return false;
  }
}



async function startAppiumIfNeeded() {
  if (appiumStarted) return false;
  try {
    const child = spawn('appium', ['--address', '127.0.0.1', '--port', '4723', '--base-path', '/wd/hub'], {
      detached: true,
      stdio: 'ignore'
    });
    child.on('error', (err) => {
      console.error('Failed to start appium:', err.message);
    });
    child.unref();
    appiumStarted = true;
    return true;
  } catch (err) {
    console.error('Failed to start appium:', err.message);
    return false;
  }
}



async function getAvailableAvds(emulatorPath) {
  try {
    const out = await safeExec(`"${emulatorPath}" -list-avds`, 5000);
    const avds = out.split('\n').filter(line => line.trim());
    return avds;
  } catch {
    return [];
  }
}


async function startEmulatorIfNeeded(avd) {
  if (emulatorStarted) return false;
  try {
    // Try multiple paths for emulator executable (dynamic detection)
    const emulatorPaths = [
      'emulator', // If in PATH
      process.env.ANDROID_SDK_ROOT ? `${process.env.ANDROID_SDK_ROOT}\\emulator\\emulator.exe` : null,
      process.env.ANDROID_HOME ? `${process.env.ANDROID_HOME}\\emulator\\emulator.exe` : null,
      // Common Android SDK locations
      `${process.env.USERPROFILE}\\AppData\\Local\\Android\\Sdk\\emulator\\emulator.exe`,
      `${process.env.USERPROFILE}\\android-sdk\\emulator\\emulator.exe`,
      `${process.env.USERPROFILE}\\Android\\Sdk\\emulator\\emulator.exe`,
      'C:\\Android\\Sdk\\emulator\\emulator.exe',
      `${process.env.HOME}\\Android\\Sdk\\emulator\\emulator.exe`,
      `${process.env.HOME}\\Library\\Android\\sdk\\emulator\\emulator`,
      '/usr/local/share/android-sdk/emulator/emulator',
      '/opt/android-sdk/emulator/emulator',
    ].filter(Boolean);

    let emulatorPath = null;
    for (const path of emulatorPaths) {
      if (await commandExists(path)) {
        emulatorPath = path;
        break;
      }
    }

    if (!emulatorPath) {
      console.error('Emulator executable not found in any expected location');
      return false;
    }

    // Determine AVD to use
    let avdName = avd;
    if (!avdName) {
      const availableAvds = await getAvailableAvds(emulatorPath);
      if (availableAvds.length > 0) {
        avdName = availableAvds[0]; 
        console.log(`Using available AVD: ${avdName}`);
      } else {
        // Fallback to common AVD names
        const fallbackAvds = ['Pixel_3a_API_30', 'Pixel_4_API_30', 'Nexus_5X_API_30'];
        for (const fallback of fallbackAvds) {
          const testAvds = await getAvailableAvds(emulatorPath);
          if (testAvds.includes(fallback)) {
            avdName = fallback;
            break;
          }
        }
        if (!avdName) {
          console.error('No suitable AVD found. Please create an AVD first.');
          return false;
        }
      }
    }

    console.log(`Starting emulator with path: ${emulatorPath} and AVD: ${avdName}`);

    const child = spawn(emulatorPath, ['-avd', avdName], {
      detached: true,
      stdio: 'ignore'
    });

    child.on('error', (err) => {
      console.error('Failed to start emulator:', err.message);
    });

    child.unref();
    emulatorStarted = true;
    return true;
  } catch (err) {
    console.error('Failed to start emulator:', err.message);
    return false;
  }
}



async function isAdbAvailable() {
  try {
    await safeExec("adb version", 3000);
    return true;
  } catch {
    return false;
  }
}



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


app.get("/health", async (_, res) => {
  const adbOk = await isAdbAvailable();
  res.json({ ok: true, status: true, adb: adbOk });
});



app.get("/agent/status", (_, res) => {
  const status = getRecordingStatus();
  res.json({ 
    success: true, 
    running: true, 
    recording: status.recording,
    steps: status.steps 
  });
});


app.post("/agent/start", (_, res) => {
 // res.json({ success: true, alreadyRunning: true });
 res.json({
    success: true,
    alreadyRunning: true,
    message: "Agent is already running in background"
  });
});



app.get("/appium/status", (_, res) => {
  exec("appium --version", { timeout: 5000 }, (err, stdout) => {
    if (err) {
      return res.json({ running: false, error: "Appium not found or not running" });
    }
    res.json({ running: true, version: stdout.trim() });
  });
});



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


app.get("/emulator/status", async (_, res) => {
  try {
    const devices = await getConnectedDevices();
    const emulators = devices.filter(d => d.type === 'emulator');

    // Check if any emulator is online (not just present)
    let onlineEmulators = [];
    for (const emulator of emulators) {
      try {
        await safeExec(`adb -s ${emulator.id} shell echo "test"`, 3000);
        onlineEmulators.push(emulator.id);
      } catch {
        // Emulator present but not online yet
      }
    }

    res.json({
      running: onlineEmulators.length > 0,
      emulators: onlineEmulators,
      totalEmulators: emulators.length,
    });
  } catch (err) {
    res.json({
      running: false,
      emulators: [],
      error: String(err)
    });
  }
});



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

  if (command === "start-all-services") {
    // Execute the direct batch file to start all services
    const batchProcess = spawn("cmd.exe", ["/c", "start-services-direct.bat"], {
      detached: true,
      stdio: "ignore",
      cwd: process.cwd()
    });

    batchProcess.on('error', (err) => {
      console.error('Failed to start services batch file:', err.message);
    });

    batchProcess.unref();

    res.json({ success: true, message: "Services starting in background" });
    return;
  }

  if (command === "start-services-standalone") {
    // Execute the standalone batch file to start all services
    const standaloneProcess = spawn("cmd.exe", ["/c", "start-services-standalone.bat"], {
      detached: true,
      stdio: "ignore",
      cwd: process.cwd()
    });

    standaloneProcess.on('error', (err) => {
      console.error('Failed to start standalone services batch file:', err.message);
    });

    standaloneProcess.unref();

    res.json({ success: true, message: "Services starting in background" });
    return;
  }

  res.status(400).json({
    success: false,
    error: "Unsupported command",
  });
});



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
   START BACKEND SERVER
===================================================== */

app.post("/backend/start", (req, res) => {
  // Start the backend server using npm start
  const child = spawn("npm", ["start"], {
    detached: true,
    stdio: "ignore",
    cwd: process.cwd()
  });

  child.on('error', (err) => {
    console.error('Failed to start backend server:', err.message);
  });

  child.unref();

  res.json({ success: true, message: "Backend server starting..." });
});


app.post("/setup/auto", async (req, res) => {
  try {
    // Get available AVDs first
    const emulatorPaths = [
      'emulator', // If in PATH
      process.env.ANDROID_SDK_ROOT ? `${process.env.ANDROID_SDK_ROOT}\\emulator\\emulator.exe` : null,
      process.env.ANDROID_HOME ? `${process.env.ANDROID_HOME}\\emulator\\emulator.exe` : null,
      // Common Android SDK locations
      `${process.env.USERPROFILE}\\AppData\\Local\\Android\\Sdk\\emulator\\emulator.exe`,
      `${process.env.USERPROFILE}\\android-sdk\\emulator\\emulator.exe`,
      `${process.env.USERPROFILE}\\Android\\Sdk\\emulator\\emulator.exe`,
      'C:\\Android\\Sdk\\emulator\\emulator.exe`,
      `${process.env.HOME}\\Android\\Sdk\\emulator\\emulator.exe`,
      `${process.env.HOME}\\Library\\Android\\sdk\\emulator\\emulator`,
      '/usr/local/share/android-sdk/emulator/emulator',
      '/opt/android-sdk/emulator/emulator',
    ].filter(Boolean);

    let emulatorPath = null;
    for (const path of emulatorPaths) {
      if (await commandExists(path)) {
        emulatorPath = path;
        break;
      }
    }

    let availableAvds = [];
    if (emulatorPath) {
      availableAvds = await getAvailableAvds(emulatorPath);
    }

    const results = {
      agent: await startAgentIfNeeded(),
      appium: await startAppiumIfNeeded(),
      emulator: await startEmulatorIfNeeded(req.body.avd)
    };

    // If emulator failed to start, try the existing endpoint as fallback
    if (!results.emulator) {
      try {
        const avdName = req.body.avd || (availableAvds.length > 0 ? availableAvds[0] : 'Pixel_nirmal');
        console.log(`Trying fallback emulator start for AVD: ${avdName}`);

        const emulatorProcess = spawn("emulator", ["-avd", avdName], {
          detached: true,
          stdio: "ignore",
        });

        emulatorProcess.unref();
        results.emulator = true;
        emulatorStarted = true;
      } catch (fallbackErr) {
        console.error('Fallback emulator start also failed:', fallbackErr.message);
      }
    }

    // Get detailed agent information
    const agentStatus = getRecordingStatus();
    const selectedAvd = req.body.avd || (availableAvds.length > 0 ? availableAvds[0] : 'Pixel_nirmal');
    const agentDetails = {
      running: agentStarted,
      recording: agentStatus.recording,
      steps: agentStatus.steps,
      port: 4724, // Agent port
      websocketUrl: 'ws://localhost:4724',
      selectedDevice: selectedAvd,
      capabilities: {
        platformName: 'Android',
        platformVersion: '11.0',
        deviceName: selectedAvd,
        automationName: 'UiAutomator2',
        appPackage: '',
        appActivity: ''
      }
    };

    res.json({
      success: true,
      started: results,
      agentDetails: agentDetails,
      availableDevices: availableAvds
    });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

app.get("/setup/status", async (req, res) => {
  try {
    // Backend is always true since server is running
    const backend = true;

    // Agent status
    const agent = agentStarted;

    // Appium status: check if port 4723 is open
    const appium = await isPortOpen(4723);

    // Emulator status: check for running emulators
    const emulator = await new Promise((resolve) => {
      exec("adb devices", (_, out) => {
        const emulators = out
          .split("\n")
          .filter((l) => l.startsWith("emulator-") && l.includes("\tdevice"));
        resolve(emulators.length > 0);
      });
    });

    // Device status: check if any device connected
    const devices = await getConnectedDevices();
    const device = devices.length > 0;

    res.json({ backend, agent, appium, emulator, device });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(
    `Mobile Automation Helper running at http://localhost:${PORT}`
  );
});
