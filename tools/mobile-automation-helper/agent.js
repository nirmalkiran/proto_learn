/**
 * Mobile Automation Agent
 * Main entry point - references self-hosted agent architecture
 */

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { CONFIG } from './config.js';
import processManager from './utils/process-manager.js';
import deviceController from './controllers/device-controller.js';
import appiumController from './controllers/appium-controller.js';
import emulatorController from './controllers/emulator-controller.js';
import recordingService from './services/recording-service.js';
import replayEngine from './services/replay-engine.js';
import screenshotService from './services/screenshot-service.js';

class MobileAutomationAgent {
  constructor() {
    this.app = null;
    this.server = null;
    this.isRunning = false;
    this.startTime = null;
    this.services = {
      deviceController,
      appiumController,
      emulatorController,
      recordingService,
      replayEngine,
      screenshotService
    };
  }

  /**
   * Initialize the agent
   */
  async initialize() {
    console.log('='.repeat(60));
    console.log('MOBILE AUTOMATION AGENT INITIALIZING...');
    console.log('='.repeat(60));

    try {
      // Initialize controllers
      console.log('[Agent] Initializing device controller...');
      await deviceController.initialize();

      console.log('[Agent] Initializing Appium controller...');
      await appiumController.checkInstallation();

      console.log('[Agent] Initializing emulator controller...');
      await emulatorController.initialize();

      // Setup services
      console.log('[Agent] Setting up services...');
      this.setupServices();

      // Setup Express app
      console.log('[Agent] Setting up HTTP server...');
      this.setupServer();

      console.log('[Agent] Initialization complete');

    } catch (error) {
      console.error('[Agent] Initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Setup services and event handlers
   */
  setupServices() {
    // Setup process cleanup
    processManager.setupCleanup();

    // Setup service event handlers
    recordingService.on('recording-started', (data) => {
      console.log(`[Agent] Recording started: ${data.sessionId}`);
    });

    recordingService.on('recording-stopped', (data) => {
      console.log(`[Agent] Recording stopped: ${data.sessionId} (${data.steps} steps)`);
    });

    replayEngine.on('replay-started', (data) => {
      console.log(`[Agent] Replay started: ${data.sessionId}`);
    });

    replayEngine.on('replay-completed', (data) => {
      console.log(`[Agent] Replay completed: ${data.sessionId} (${data.results.length} steps)`);
    });

    screenshotService.on('streaming-started', (data) => {
      console.log(`[Agent] Screenshot streaming started (${data.interval}ms interval)`);
    });

    screenshotService.on('streaming-stopped', () => {
      console.log('[Agent] Screenshot streaming stopped');
    });
  }

  /**
   * Setup Express server and routes
   */
  setupServer() {
    this.app = express();

    // Middleware
    this.app.use(cors());
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: this.startTime ? Date.now() - this.startTime : 0,
        services: this.getServiceStatus()
      });
    });

    // Service status endpoints
    this.setupStatusRoutes();

    // Device management endpoints
    this.setupDeviceRoutes();

    // Appium management endpoints
    this.setupAppiumRoutes();

    // Emulator management endpoints
    this.setupEmulatorRoutes();

    // Recording endpoints
    this.setupRecordingRoutes();

    // Replay endpoints
    this.setupReplayRoutes();

    // Screenshot endpoints
    this.setupScreenshotRoutes();

    // Legacy compatibility endpoints (from old server.js)
    this.setupLegacyRoutes();
  }

  /**
   * Setup status routes
   */
  setupStatusRoutes() {
    // Overall status
    this.app.get('/setup/status', async (req, res) => {
      try {
        const [deviceStatus, appiumStatus, emulatorStatus] = await Promise.all([
          deviceController.getStatus(),
          appiumController.getStatus(),
          emulatorController.getStatus()
        ]);

        res.json({
          backend: true,
          agent: true,
          appium: appiumStatus.running,
          emulator: emulatorStatus.running,
          device: deviceStatus.connected
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  /**
   * Setup device routes
   */
  setupDeviceRoutes() {
    this.app.get('/device/check', async (req, res) => {
      try {
        const status = await deviceController.getStatus();
        res.json({
          connected: status.connected,
          devices: status.devices.map(d => d.id),
          deviceType: status.devices[0]?.type || null,
          primaryDevice: status.primaryDevice,
          allDevices: status.devices
        });
      } catch (error) {
        res.status(500).json({ connected: false, error: error.message });
      }
    });

    this.app.get('/device/size', async (req, res) => {
      try {
        const size = await deviceController.getScreenSize();
        res.json({ success: true, size });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/device/tap', async (req, res) => {
      try {
        const { x, y } = req.body;
        const result = await deviceController.tap(x, y);
        res.json({ success: true, result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/device/input', async (req, res) => {
      try {
        const { text } = req.body;
        const result = await deviceController.input(text);
        res.json({ success: true, result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/device/screenshot', async (req, res) => {
      try {
        const screenshot = await deviceController.takeScreenshot();
        res.setHeader('Content-Type', 'image/png');
        res.send(screenshot);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/device/uiautomator', async (req, res) => {
      try {
        const xml = await deviceController.getUIHierarchy();
        res.json({ success: true, xml });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
  }

  /**
   * Setup Appium routes
   */
  setupAppiumRoutes() {
    this.app.get('/appium/status', async (req, res) => {
      try {
        const status = await appiumController.getStatus();
        res.json({
          running: status.running,
          version: status.version,
          installed: status.installed
        });
      } catch (error) {
        res.json({ running: false, error: error.message });
      }
    });

    this.app.post('/terminal', async (req, res) => {
      try {
        const { command } = req.body;

        if (command === 'appium:start') {
          await appiumController.start();
          res.json({ success: true, message: 'Appium started' });
        } else {
          res.status(400).json({ success: false, error: 'Unsupported command' });
        }
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
  }

  /**
   * Setup emulator routes
   */
  setupEmulatorRoutes() {
    this.app.get('/emulator/status', async (req, res) => {
      try {
        const status = await emulatorController.getStatus();
        res.json({
          running: status.running,
          emulators: status.emulators,
          totalEmulators: status.totalEmulators
        });
      } catch (error) {
        res.status(500).json({ running: false, error: error.message });
      }
    });

    this.app.get('/emulator/available', async (req, res) => {
      try {
        const avds = await emulatorController.getAvailableAvds();
        res.json({ success: true, avds });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/emulator/start', async (req, res) => {
      try {
        const { avd } = req.body;
        await emulatorController.start(avd);
        res.json({ success: true, message: 'Emulator starting' });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
  }

  /**
   * Setup recording routes
   */
  setupRecordingRoutes() {
    this.app.post('/recording/start', (req, res) => {
      try {
        const result = recordingService.startRecording();
        res.json({ success: true, ...result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/recording/stop', (req, res) => {
      try {
        const steps = recordingService.stopRecording();
        res.json({ success: true, steps });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/recording/status', (req, res) => {
      const status = recordingService.getStatus();
      res.json(status);
    });

    this.app.get('/recording/steps', (req, res) => {
      const steps = recordingService.getRecordedSteps();
      res.json({ success: true, steps });
    });

    this.app.get('/recording/events', (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const sendEvent = (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      recordingService.on('step-added', sendEvent);
      recordingService.on('recording-started', sendEvent);
      recordingService.on('recording-stopped', sendEvent);

      req.on('close', () => {
        recordingService.removeListener('step-added', sendEvent);
        recordingService.removeListener('recording-started', sendEvent);
        recordingService.removeListener('recording-stopped', sendEvent);
      });
    });
  }

  /**
   * Setup replay routes
   */
  setupReplayRoutes() {
    this.app.post('/recording/replay', async (req, res) => {
      try {
        const { steps } = req.body;
        const result = await replayEngine.startReplay(steps);
        res.json({ success: true, ...result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
  }

  /**
   * Setup screenshot routes
   */
  setupScreenshotRoutes() {
    // Screenshot streaming endpoints would go here
    // For now, basic screenshot is handled in device routes
  }

  /**
   * Setup legacy routes for UI compatibility
   */
  setupLegacyRoutes() {
    // Agent status (legacy)
    this.app.get('/agent/status', (req, res) => {
      const recordingStatus = recordingService.getStatus();
      res.json({
        running: true,
        recording: recordingStatus.recording,
        steps: recordingStatus.steps
      });
    });

    this.app.post('/agent/start', (req, res) => {
      res.json({ success: true, alreadyRunning: true });
    });

    // Backend start (legacy)
    this.app.post('/backend/start', (req, res) => {
      res.json({ success: true, message: 'Backend is running' });
    });

    // One-tap setup
    this.app.post('/setup/auto', async (req, res) => {
      try {
        const { avd } = req.body;

        // Start services
        await Promise.allSettled([
          appiumController.start(),
          emulatorController.start(avd)
        ]);

        // Get agent details
        const deviceStatus = await deviceController.getStatus();
        const agentDetails = {
          running: true,
          recording: false,
          steps: 0,
          port: CONFIG.AGENT_PORT,
          websocketUrl: `ws://localhost:${CONFIG.AGENT_PORT}`,
          selectedDevice: avd,
          capabilities: {
            platformName: 'Android',
            platformVersion: '11.0',
            deviceName: avd || 'emulator-5554',
            automationName: 'UiAutomator2',
            appPackage: '',
            appActivity: ''
          }
        };

        res.json({
          success: true,
          started: {
            agent: true,
            appium: true,
            emulator: true
          },
          agentDetails,
          availableDevices: await emulatorController.getAvailableAvds()
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
  }

  /**
   * Get service status summary
   */
  getServiceStatus() {
    return {
      deviceController: 'initialized',
      appiumController: 'ready',
      emulatorController: 'ready',
      recordingService: recordingService.getStatus().recording ? 'recording' : 'ready',
      replayEngine: replayEngine.getStatus().replaying ? 'replaying' : 'ready',
      screenshotService: screenshotService.getStreamingStatus().streaming ? 'streaming' : 'ready'
    };
  }

  /**
   * Start the agent server
   */
  async start() {
    if (this.isRunning) {
      console.log('[Agent] Agent is already running');
      return;
    }

    try {
      console.log(`[Agent] Starting server on port ${CONFIG.PORT}...`);

      this.server = createServer(this.app);
      await new Promise((resolve, reject) => {
        this.server.listen(CONFIG.PORT, CONFIG.HOST, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      this.isRunning = true;
      this.startTime = Date.now();

      console.log(`[Agent] Server running at http://${CONFIG.HOST}:${CONFIG.PORT}`);
      console.log('='.repeat(60));
      console.log('MOBILE AUTOMATION AGENT STARTED SUCCESSFULLY');
      console.log('='.repeat(60));

    } catch (error) {
      console.error('[Agent] Failed to start server:', error.message);
      throw error;
    }
  }

  /**
   * Stop the agent
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    console.log('[Agent] Stopping agent...');

    try {
      // Stop all services
      await Promise.allSettled([
        appiumController.stop(),
        emulatorController.stop(),
        screenshotService.stopStreaming()
      ]);

      // Stop recording if active
      if (recordingService.getStatus().recording) {
        recordingService.stopRecording();
      }

      // Stop server
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(() => resolve());
        });
      }

      this.isRunning = false;
      console.log('[Agent] Agent stopped');

    } catch (error) {
      console.error('[Agent] Error during shutdown:', error.message);
    }
  }

  /**
   * Run the agent (main entry point)
   */
  async run() {
    try {
      await this.initialize();
      await this.start();

      // Setup graceful shutdown
      process.on('SIGINT', async () => {
        console.log('\n[Agent] Received SIGINT, shutting down...');
        await this.stop();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        console.log('\n[Agent] Received SIGTERM, shutting down...');
        await this.stop();
        process.exit(0);
      });

    } catch (error) {
      console.error('[Agent] Fatal error:', error.message);
      process.exit(1);
    }
  }
}

// Export for testing
export { MobileAutomationAgent };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = new MobileAutomationAgent();
  agent.run().catch(console.error);
}
