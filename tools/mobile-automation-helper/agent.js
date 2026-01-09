import express from "express";
import cors from "cors";
import { createServer } from "http";

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
  }

  /* =====================================================
   * INITIALIZE (SAFE MODE – NEVER CRASH)
   * ===================================================== */
async initialize() {
  console.log('='.repeat(60));
  console.log('MOBILE AUTOMATION AGENT INITIALIZING...');
  console.log('='.repeat(60));

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
    this.setupServices();

    console.log('[Agent] Setting up HTTP server...');
    this.setupServer();

    console.log('[Agent] Initialization complete (server will start)');
  } catch (error) {
    console.error('[Agent] Initialization failed:', error);
  }
}


  /* =====================================================
   * SERVER SETUP
   * ===================================================== */
  setupServer() {
    this.app = express();

    this.app.use(cors());
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
        await deviceController.tap(req.body.x, req.body.y);
        res.json({ success: true });
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

    this.app.post("/emulator/start", async (req, res) => {
      try {
        await emulatorController.start(req.body.avd);
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
  }

  /* =====================================================
   * START SERVER
   * ===================================================== */
  async start() {
    if (this.isRunning) return;

    this.server = createServer(this.app);

    await new Promise((resolve) => {
      this.server.listen(CONFIG.PORT, CONFIG.HOST, resolve);
    });

    this.isRunning = true;
    this.startTime = Date.now();

    console.log("=".repeat(60));
    console.log(`AGENT RUNNING → http://${CONFIG.HOST}:${CONFIG.PORT}`);
    console.log("=".repeat(60));
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

/* =====================================================
 * ENTRY - Cross-platform compatible
 * ===================================================== */
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] && 
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMainModule) {
  const agent = new MobileAutomationAgent();
  agent.run().catch((err) => {
    console.error("[Agent] Fatal error:", err);
    process.exit(1);
  });
}
