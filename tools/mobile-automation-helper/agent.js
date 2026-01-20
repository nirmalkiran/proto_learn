import express from "express";
import cors from "cors";
import { createServer } from "http";
import crypto from "crypto";

import { CONFIG } from "./config.js";
import processManager from "./utils/process-manager.js";
import deviceController from "./controllers/device-controller.js";
import appiumController from "./controllers/appium-controller.js";
import emulatorController from "./controllers/emulator-controller.js";
import recordingService from "./services/recording-service.js";
import replayEngine from "./services/replay-engine.js";
import screenshotService from "./services/screenshot-service.js";

class MobileAutomationAgent {
  constructor() {
    this.app = null;
    this.server = null;
    this.isRunning = false;
    this.startTime = null;
    this.replayEngine = new replayEngine();
  }


  async initialize() {

    console.log('MOBILE AUTOMATION AGENT INITIALIZING...');


    try {
      console.log('[Agent] Initializing device controller...');
      try {
        await deviceController.initialize();
      } catch (e) {
        console.warn('[Agent] Device controller failed:', e.message);
      }

      console.log('[Agent] Checking Appium...');
      try {
        await appiumController.checkInstallation();
      } catch (e) {
        console.warn('[Agent] Appium check failed:', e.message);
      }

      console.log('[Agent] Initializing emulator controller...');
      try {
        await emulatorController.initialize();
      } catch (e) {
        console.warn('[Agent] Emulator init failed:', e.message);
      }

      console.log('[Agent] Setting up services...');
      if (typeof this.setupServices === "function") {
        try {
          this.setupServices();
        } catch (e) {
          console.warn('[Agent] setupServices failed (continuing):', e?.message || e);
        }
      } else {
        console.warn('[Agent] setupServices is missing (continuing)');
      }

      console.log('[Agent] Setting up HTTP server...');
      this.setupServer();

      console.log('[Agent] Initialization complete (server will start)');
    } catch (error) {
      console.error('[Agent] Initialization failed:', error);
    }
  }



  setupServer() {
    this.app = express();

    this.app.use((req, res, next) => {
      res.setHeader("Access-Control-Allow-Private-Network", "true");
      next();
    });

    this.app.use(
      cors({
        origin: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: [
          "Content-Type",
          "Authorization",
          "X-Requested-With",
          "Access-Control-Request-Private-Network",
        ],
      })
    );

    this.app.use(express.json({ limit: "50mb" }));

    /* ---------------- HEALTH ---------------- */
    this.app.get("/health", (req, res) => {
      res.json({
        status: "ok",
        uptime: this.startTime ? Date.now() - this.startTime : 0,
        port: CONFIG.PORT,
      });
    });

    /* ---------------- STATUS ---------------- */
    this.app.get("/setup/status", async (req, res) => {
      try {
        const [device, appium, emulator] = await Promise.allSettled([
          deviceController.getStatus(),
          appiumController.getStatus(),
          emulatorController.getStatus(),
        ]);

        res.json({
          backend: true,
          agent: true,
          device: device.value?.connected ?? false,
          appium: appium.value?.running ?? false,
          emulator: emulator.value?.running ?? false,
        });
      } catch (e) {
        res.json({
          backend: true,
          agent: true,
          device: false,
          appium: false,
          emulator: false,
        });
      }
    });

    /* ---------------- DEVICE ---------------- */
    this.app.get("/device/check", async (req, res) => {
      try {
        const status = await deviceController.getStatus();
        res.json(status);
      } catch (e) {
        res.status(500).json({ connected: false, error: e.message });
      }
    });

    this.app.get("/device/size", async (req, res) => {
      try {
        const size = await deviceController.getScreenSize();
        res.json({ success: true, size });
      } catch (e) {
        res.status(500).json({ success: false, error: e.message });
      }
    });

    this.app.get("/device/screenshot", async (req, res) => {
      try {
        const img = await deviceController.takeScreenshot();
        res.setHeader("Content-Type", "image/png");
        res.send(img);
      } catch (e) {
        res.status(404).json({ error: e.message });
      }
    });

    this.app.post("/device/tap", async (req, res) => {
      try {
        const { x, y } = req.body;

        if (x == null || y == null) {
          throw new Error("Coordinates x and y are required");
        }

        const result = await deviceController.tap(x, y);
        const { element } = result;

        // Construct a semantic description
        let description = `Tap at (${x}, ${y})`;
        let locator = `//android.widget.FrameLayout`;

        if (element) {
          if (element.resourceId) {
            description = `Tap on element: ${element.resourceId.split('/').pop()}`;
            locator = element.resourceId;
          } else if (element.text) {
            description = `Tap on text: "${element.text}"`;
            locator = `//*[@text='${element.text}']`;
          } else if (element.contentDesc) {
            description = `Tap on: "${element.contentDesc}"`;
            locator = `//*[@content-desc='${element.contentDesc}']`;
          }
        }

        // Construct a step object
        const step = {
          type: "tap",
          description,
          locator,
          coordinates: { x, y },
          elementMetadata: element,
          timestamp: Date.now(),
          isInputCandidate: element ? (element.class && (element.class.includes('EditText') || element.class.includes('TextField'))) : false
        };

        // Add to recording service explicitly
        if (recordingService.isRecording) {
          recordingService.addStep(step);
        }

        // Return step to client
        res.json({ success: true, step: { ...step, id: crypto.randomUUID() } });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post("/device/input", async (req, res) => {
      try {
        await deviceController.input(req.body.text);
        res.json({ success: true });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get("/device/ui", async (req, res) => {
      try {
        const xml = await deviceController.getUIHierarchy();
        res.json({ success: true, xml });
      } catch (e) {
        res.status(500).json({ success: false, error: e.message });
      }
    });

    /* ---------------- APPIUM ---------------- */
    this.app.get("/appium/status", async (req, res) => {
      try {
        res.json(await appiumController.getStatus());
      } catch {
        res.json({ running: false });
      }
    });

    this.app.post("/terminal", async (req, res) => {
      if (req.body.command === "appium:start") {
        try {
          await appiumController.start();
          res.json({ success: true });
        } catch (e) {
          res.status(500).json({ error: e.message });
        }
      } else {
        res.status(400).json({ error: "Unsupported command" });
      }
    });

    /* ---------------- EMULATOR ---------------- */
    this.app.get("/emulator/status", async (req, res) => {
      try {
        res.json(await emulatorController.getStatus());
      } catch {
        res.json({ running: false });
      }
    });

    // List available AVDs (used by the UI device dropdown)
    this.app.get("/emulator/available", async (req, res) => {
      try {
        const avds = await emulatorController.getAvailableAvds();
        res.json({ success: true, avds });
      } catch (e) {
        res.status(500).json({ success: false, error: e?.message || String(e) });
      }
    });

    this.app.post("/emulator/start", async (req, res) => {
      try {
        await emulatorController.start(req.body.avd);
        res.json({ success: true });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post("/emulator/stop", async (req, res) => {
      try {
        await emulatorController.stop();
        res.json({ success: true });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });

    /* ---------------- RECORDING ---------------- */
    this.app.post("/recording/start", (req, res) => {
      try {
        recordingService.startRecording();
        res.json({ success: true });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get("/recording/steps", (req, res) => {
      try {
        const steps = recordingService.getRecordedSteps();
        res.json({ success: true, steps });
      } catch (e) {
        res.status(500).json({ success: false, error: e.message });
      }
    });

    this.app.get("/ping", (req, res) => {
      res.json({ pong: true, time: Date.now() });
    });

    this.app.post("/recording/stop", (req, res) => {
      try {
        const steps = recordingService.stopRecording();
        res.json({ success: true, steps });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get("/recording/events", (req, res) => {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");

      const send = (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);

      recordingService.on("step-added", send);

      req.on("close", () => {
        recordingService.off("step-added", send);
      });
    });

    this.app.post("/recording/replay", async (req, res) => {
      try {
        const { steps, deviceId: reqDeviceId } = req.body;

        if (!steps || !Array.isArray(steps)) {
          throw new Error("Steps array is required for replay");
        }

        // Determine device ID: 1. from request, 2. from primary device
        let deviceId = reqDeviceId;
        if (!deviceId) {
          const status = await deviceController.getStatus();
          deviceId = status.primaryDevice;
        }

        if (!deviceId) {
          throw new Error("No device ID provided and no primary device found");
        }

        console.log(`[Agent] Starting replay on device: ${deviceId} (${steps.length} steps)`);

        // Start replay (don't await if we want to return immediately, but the UI expects it to complete?)
        // Let's check the frontend. The frontend awaits the fetch.
        await this.replayEngine.startReplay(steps, deviceId);

        res.json({ success: true, message: "Replay completed" });
      } catch (e) {
        console.error("[Agent] Replay failed:", e.message);
        res.status(500).json({ error: e.message });
      }
    });

    /* ---------------- ONE TAP ---------------- */
    this.app.post("/setup/auto", async (req, res) => {
      try {
        await Promise.allSettled([
          appiumController.start(),
          emulatorController.start(req.body.avd),
        ]);

        res.json({
          success: true,
          started: {
            agent: true,
            appium: true,
            emulator: true,
          },
        });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });

    /* ---------------- LEGACY ---------------- */
    this.app.get("/agent/status", (req, res) => {
      const s = recordingService.getStatus();
      res.json({ running: true, recording: s.recording });
    });

    // UI expects an agent start endpoint in some flows; this helper is the agent process,
    // so we simply acknowledge the request.
    this.app.post("/agent/start", (req, res) => {
      res.json({ success: true, running: true });
    });
  }

  /* =====================================================
   * START SERVER
   * ===================================================== */
  async start() {
    if (this.isRunning) return;
    console.log(`[Agent] Starting server on port ${CONFIG.PORT}...`);
    this.server = createServer(this.app);

    await new Promise((resolve) => {
      this.server.listen(CONFIG.PORT, CONFIG.AGENT_HOST, () => {
        console.log(`[Agent] Server running at http://${CONFIG.AGENT_HOST}:${CONFIG.PORT}`);
        resolve();
      });
    });

    this.keepAlive = setInterval(() => { }, 60 * 60 * 1000);
    this.isRunning = true;
    this.startTime = Date.now();

    console.log(`AGENT RUNNING → http://${CONFIG.AGENT_HOST}:${CONFIG.PORT}`);
    this.server.on('close', () => {
      console.log('[Agent] HTTP server closed');
    });


  }

  async run() {
    await this.initialize();
    await this.start();

    process.on("SIGINT", async () => {
      console.log("\n[Agent] Shutting down...");
      this.isRunning = false;
      if (this.server) {
        this.server.close();
      }
      process.exit(0);
    });

    // Keep process alive
    process.on("uncaughtException", (err) => {
      console.error("[Agent] Uncaught exception:", err.message);
    });

    process.on("unhandledRejection", (reason) => {
      console.error("[Agent] Unhandled rejection:", reason);
    });
  }

  setupServices() {
    // Placeholder for additional service setup
    console.log("[Agent] Services configured");
  }
}

if (process.argv[1] && process.argv[1].includes('agent.js')) {
  new MobileAutomationAgent().run();
}
