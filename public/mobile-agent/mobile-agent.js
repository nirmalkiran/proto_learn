#!/usr/bin/env node
/**
 * WISPR Mobile Agent (Node.js + Appium/ADB friendly)
 * Mobile-only runner that heartbeats and polls for jobs.
 * Plug your Appium/ADB execution inside `executeJob`.
 */

import { setTimeout as sleep } from "timers/promises";

// Mobile automation modules (copied from mobile agent package)
import { CONFIG as MOBILE_CONFIG } from "./config.js";
import processManager from "./utils/process-manager.js";
import deviceController from "./controllers/device-controller.js";
import appiumController from "./controllers/appium-controller.js";
import emulatorController from "./controllers/emulator-controller.js";
import recordingService from "./services/recording-service.js";
import ReplayEngine from "./services/replay-engine.js";
import inspectorService from "./services/inspector-service.js";
import screenshotService from "./services/screenshot-service.js";
import { HierarchySnapshotStore } from "./services/hierarchy-snapshot-store.js";
import { diffHierarchies } from "./services/hierarchy-diff.js";
import { LocatorHistoryStore } from "./services/locator-history-store.js";
import { LocatorHealingEngine } from "./services/locator-healing-engine.js";
import sharp from "sharp";
import { PNG } from "pngjs";
import * as jpegJs from "jpeg-js";
import { once } from "events";
import { createServer } from "http";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import os from "os";
import express from "express";
import cors from "cors";

const API_BASE_URL = (process.env.API_BASE_URL || "https://vqoxcgbilzqxmxuxwicr.supabase.co/functions/v1/agent-api").replace(/\/$/, "");
const API_TOKEN = process.env.WISPR_API_TOKEN || "";
const LOCAL_PORT = MOBILE_CONFIG.PORT || 3001;
const MAX_CAPACITY = Number(process.env.MAX_CAPACITY || MOBILE_CONFIG.MAX_CONCURRENT_JOBS || 1);
let activeJobs = 0;

function extractProjectId(url) {
  try {
    const u = new URL(url);
    const hostParts = u.hostname.split(".");
    if (hostParts.length > 0) return hostParts[0];
  } catch (e) {
    // ignore parse errors
  }
  return "";
}

const HEARTBEAT_SEC = Number(
  process.env.AGENT_HEARTBEAT_SEC || MOBILE_CONFIG.HEARTBEAT_INTERVAL / 1000 || 30,
);
const POLL_SEC = Number(process.env.AGENT_POLL_SEC || MOBILE_CONFIG.POLL_INTERVAL / 1000 || 10);

// Simple logger with optional color output.
const LOG_COLOR_ENABLED = process.env.WISPR_LOG_COLOR !== "false" && process.stdout.isTTY;
const LOG_COLORS = {
  INFO: "\x1b[36m",
  SUCCESS: "\x1b[32m",
  WARN: "\x1b[33m",
  ERROR: "\x1b[31m",
  RESET: "\x1b[0m",
};
const log = (levelOrMsg, maybeMsg) => {
  const level = maybeMsg ? String(levelOrMsg).toUpperCase() : "INFO";
  const message = maybeMsg ?? levelOrMsg;
  const color = LOG_COLORS[level] || "";
  const reset = LOG_COLOR_ENABLED && color ? LOG_COLORS.RESET : "";
  const prefix = `[${new Date().toISOString()}] [${level}]`;
  const line = `${prefix} ${message}`;
  console.log(LOG_COLOR_ENABLED && color ? `${color}${line}${reset}` : line);
};
const AGENT_BUILD = process.env.WISPR_AGENT_BUILD || "";

/**
 * Lightweight local API used by the React UI (MobileSetupWizard/DeviceSelector)
 * to probe the agent. Keeps UI from throwing connection-refused when agent is running.
 */
async function startLocalHelperServer() {
  const app = express();
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    next();
  });
  app.use(
    cors({
      origin: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "Access-Control-Request-Private-Network",
      ],
    }),
  );
  app.use(express.json({ limit: "500mb" }));
  app.use(express.urlencoded({ limit: "500mb", extended: true }));

  const snapshotStore = new HierarchySnapshotStore({});
  const locatorHistory = new LocatorHistoryStore({});
  const replayEngine = new ReplayEngine();

  const encodeJpeg = async (buffer, quality = 70) => {
    if (sharp) {
      try {
        return await sharp(buffer).jpeg({ quality, chromaSubsampling: "4:2:0" }).toBuffer();
      } catch {
        // fall through
      }
    }
    try {
      const png = PNG.sync.read(buffer);
      const raw = { data: png.data, width: png.width, height: png.height };
      return jpegJs.encode(raw, quality).data;
    } catch {
      return buffer;
    }
  };

  let startTime = Date.now();

  /* ---------------- HEALTH & STATUS ---------------- */
  app.get("/health", (_req, res) =>
    res.json({ status: "ok", uptime: Date.now() - startTime, port: LOCAL_PORT }),
  );

  app.get("/setup/status", async (_req, res) => {
    try {
      const [device, appium, emulator] = await Promise.allSettled([
        deviceController.getStatus(),
        appiumController.getStatus(),
        emulatorController.getStatus(),
      ]);
      const deviceStatus = device.value || { connected: false, devices: [] };
      const physicalDeviceConnected = deviceStatus.devices
        ? deviceStatus.devices.some((d) => d.type === "usb" && d.status === "device")
        : false;
      res.json({
        backend: true,
        agent: true,
        device: deviceStatus.connected ?? false,
        devices: deviceStatus.devices || [],
        physicalDevice: physicalDeviceConnected,
        appium: appium.value?.running ?? false,
        emulator: emulator.value?.running ?? false,
      });
    } catch {
      res.json({
        backend: true,
        agent: true,
        device: false,
        devices: [],
        physicalDevice: false,
        appium: false,
        emulator: false,
      });
    }
  });

  /* ---------------- DEVICE ---------------- */
  app.get("/device/check", async (_req, res) => {
    try {
      res.json(await deviceController.getStatus());
    } catch (e) {
      res.status(500).json({ connected: false, error: e.message });
    }
  });

  app.get("/device/size", async (_req, res) => {
    try {
      res.json({ success: true, size: await deviceController.getScreenSize() });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.get("/device/screenshot", async (_req, res) => {
    try {
      const img = await deviceController.takeScreenshot();
      res.setHeader("Content-Type", "image/png");
      res.send(img);
    } catch (e) {
      console.error("[screenshot] Failed:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/device/stream/mjpeg", async (req, res) => {
    const fpsRaw = Number(req.query.fps || process.env.MJPEG_DEFAULT_FPS || 8);
    const maxFps = Number(process.env.MJPEG_MAX_FPS || 15);
    const fps = Math.max(1, Math.min(Number.isFinite(fpsRaw) ? fpsRaw : 8, maxFps));
    const frameInterval = Math.max(30, Math.floor(1000 / fps));
    const qualityRaw = Number(req.query.quality || process.env.MJPEG_QUALITY || 70);
    const quality = Math.max(30, Math.min(Number.isFinite(qualityRaw) ? qualityRaw : 70, 95));
    const deviceId = req.query.deviceId || null;
    const boundary = "frame";

    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Content-Type", `multipart/x-mixed-replace; boundary=${boundary}`);

    let active = true;
    req.on("close", () => {
      active = false;
    });

    const sendFrame = async () => {
      if (!active || res.writableEnded) return;
      const start = Date.now();
      try {
        const pngBuffer = await deviceController.takeScreenshot(deviceId);
        const jpegBuffer = await encodeJpeg(pngBuffer, quality);
        if (res.writableEnded) return;

        const header =
          `--${boundary}\r\n` +
          `Content-Type: image/jpeg\r\n` +
          `Content-Length: ${jpegBuffer.length}\r\n\r\n`;

        if (!res.write(header)) await once(res, "drain");
        if (!res.write(jpegBuffer)) await once(res, "drain");
        if (!res.write("\r\n")) await once(res, "drain");
      } catch (e) {
        if (!String(e?.message || "").includes("No device connected")) {
          console.warn("[mjpeg] Frame failed:", e.message);
        }
      } finally {
        const elapsed = Date.now() - start;
        const nextDelay = Math.max(10, frameInterval - elapsed);
        if (active && !res.writableEnded) {
          setTimeout(sendFrame, nextDelay);
        }
      }
    };

    sendFrame();
  });

  app.post("/device/shell", async (req, res) => {
    try {
      const { command, deviceId } = req.body;
      if (!command) throw new Error("Command is required");
      res.json({ success: true, ...(await deviceController.shell(command, deviceId)) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/device/ui", async (_req, res) => {
    try {
      res.json({ success: true, xml: await deviceController.getUIHierarchy() });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /* ---------------- INSPECTOR ---------------- */
  app.post("/device/inspect", async (req, res) => {
    try {
      const { x, y, deviceId, mode, preferCache } = req.body || {};
      const inspect = await inspectorService.inspectAtPoint({ x, y, deviceId, mode, preferCache });
      res.json({ success: true, inspect });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post("/device/inspect-locator", async (req, res) => {
    try {
      const { locator, strategy, deviceId, preferCache } = req.body || {};
      if (typeof inspectorService.inspectByLocator !== "function") {
        return res.status(501).json({
          success: false,
          error: "inspectByLocator is unavailable in current agent runtime. Restart the agent to load latest inspector service.",
        });
      }
      const inspect = await inspectorService.inspectByLocator({ locator, strategy, deviceId, preferCache });
      res.json({ success: true, inspect });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.get("/device/hierarchy/snapshot/:id", async (req, res) => {
    try {
      const snapshotId = req.params.id;
      const xml = snapshotStore.getSnapshotXml(snapshotId);
      if (!xml) return res.status(404).json({ success: false, error: "Snapshot not found" });
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.send(xml);
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post("/device/hierarchy/diff", async (req, res) => {
    try {
      const { fromSnapshotId, toSnapshotId } = req.body || {};
      const xmlA = snapshotStore.getSnapshotXml(fromSnapshotId);
      const xmlB = snapshotStore.getSnapshotXml(toSnapshotId);
      if (!xmlA || !xmlB) return res.status(404).json({ success: false, error: "Snapshot(s) not found" });
      const diff = diffHierarchies(xmlA, xmlB);
      res.json({ success: true, ...diff });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /* ---------------- INTERACTION ---------------- */
  app.post("/device/tap", async (req, res) => {
    try {
      const { x, y } = req.body;
      if (x == null || y == null) throw new Error("Coordinates required");
      const result = await deviceController.tap(x, y);
      const { element, xpath } = result;
      let inspect = null;
      try {
        inspect = await inspectorService.inspectAtPoint({
          x,
          y,
          deviceId: result.deviceId,
          mode: "tap",
          preferCache: true,
        });
      } catch {
        // non-fatal
      }

      const elementId = element?.resourceId || "";
      const elementText = element?.text || "";
      const elementClass = element?.class || "";
      const elementContentDesc = element?.contentDesc || "";

      const locator =
        (xpath || "") || elementId || elementContentDesc || elementText || `${x},${y}`;
      const locatorStrategy = xpath
        ? "xpath"
        : elementId
          ? "id"
          : elementContentDesc
            ? "accessibilityId"
            : elementText
              ? "text"
              : "coordinates";

      const descTarget = elementText || elementContentDesc || (elementId ? elementId.split("/").pop() : "");
      const role = elementClass?.includes("EditText")
        ? "Input"
        : elementClass?.includes("Button")
          ? "Button"
          : elementClass?.includes("Switch")
            ? "Toggle"
            : elementClass?.includes("CheckBox")
              ? "Checkbox"
              : elementClass?.includes("Spinner")
                ? "Dropdown"
                : elementClass?.includes("ImageButton")
                  ? "Icon Button"
                  : "";

      const step = {
        type: "tap",
        description: descTarget ? `${role ? `${role} ` : ""}Tap on "${descTarget}"` : `Tap at (${x}, ${y})`,
        locator,
        locatorStrategy,
        coordinates: { x, y },
        elementId,
        elementText,
        elementClass,
        elementContentDesc,
        xpath: xpath || "",
        elementMetadata: element,
        locatorBundle: inspect?.locatorBundle || null,
        reliabilityScore: typeof inspect?.reliabilityScore === "number" ? inspect.reliabilityScore : undefined,
        hierarchySnapshotId: inspect?.hierarchySnapshotId || null,
        smartXPath: inspect?.smartXPath || "",
        elementFingerprint: inspect?.elementFingerprint || "",
        screenContext: inspect?.screenContext || null,
        timestamp: Date.now(),
      };

      try {
        if (inspect?.elementFingerprint && inspect?.best) {
          locatorHistory.appendRecord(inspect?.screenContext?.package, {
            fingerprint: inspect.elementFingerprint,
            best: inspect.best,
            locatorBundle: inspect.locatorBundle || null,
            hierarchySnapshotId: inspect.hierarchySnapshotId || null,
            reliabilityScore: inspect.reliabilityScore,
            element: inspect.element || null,
          });
        }
      } catch {
        // ignore
      }

      if (recordingService.isRecording) recordingService.addStep(step);
      res.json({ success: true, step: { ...step, id: crypto.randomUUID() } });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/device/long-press", async (req, res) => {
    try {
      const { x, y, duration } = req.body;
      if (x == null || y == null) throw new Error("Coordinates required");
      const result = await deviceController.longPress(x, y, duration || 1000);
      const { element, xpath } = result || {};
      let inspect = null;
      try {
        inspect = await inspectorService.inspectAtPoint({
          x,
          y,
          deviceId: result?.deviceId,
          mode: "tap",
          preferCache: true,
        });
      } catch {
        // non-fatal
      }

      const elementId = element?.resourceId || "";
      const elementText = element?.text || "";
      const elementClass = element?.class || "";
      const elementContentDesc = element?.contentDesc || "";

      const locator =
        (xpath || "") || elementId || elementContentDesc || elementText || `${x},${y}`;
      const locatorStrategy = xpath
        ? "xpath"
        : elementId
          ? "id"
          : elementContentDesc
            ? "accessibilityId"
            : elementText
              ? "text"
              : "coordinates";

      const descTarget = elementText || elementContentDesc || (elementId ? elementId.split("/").pop() : "");
      const step = {
        type: "longPress",
        description: descTarget ? `Long press on "${descTarget}"` : `Long press at (${x}, ${y})`,
        locator,
        locatorStrategy,
        coordinates: { x, y },
        elementId,
        elementText,
        elementClass,
        elementContentDesc,
        xpath: xpath || "",
        elementMetadata: element || null,
        locatorBundle: inspect?.locatorBundle || null,
        reliabilityScore: typeof inspect?.reliabilityScore === "number" ? inspect.reliabilityScore : undefined,
        hierarchySnapshotId: inspect?.hierarchySnapshotId || null,
        smartXPath: inspect?.smartXPath || "",
        elementFingerprint: inspect?.elementFingerprint || "",
        screenContext: inspect?.screenContext || null,
        timestamp: Date.now(),
      };

      try {
        if (inspect?.elementFingerprint && inspect?.best) {
          locatorHistory.appendRecord(inspect?.screenContext?.package, {
            fingerprint: inspect.elementFingerprint,
            best: inspect.best,
            locatorBundle: inspect.locatorBundle || null,
            hierarchySnapshotId: inspect.hierarchySnapshotId || null,
            reliabilityScore: inspect.reliabilityScore,
            element: inspect.element || null,
          });
        }
      } catch {
        // ignore
      }

      if (recordingService.isRecording) recordingService.addStep(step);
      res.json({ success: true, step: { ...step, id: crypto.randomUUID() } });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/device/input", async (req, res) => {
    try {
      const { text, x, y } = req.body;
      let element = null;
      let inspect = null;
      if (typeof x === "number" && typeof y === "number") {
        element = await deviceController.getElementAt(x, y);
        try {
          inspect = await inspectorService.inspectAtPoint({
            x,
            y,
            deviceId: req.body.deviceId,
            mode: "tap",
            preferCache: true,
          });
        } catch {
          // non-fatal
        }
      }

      await deviceController.input(text);

      const elementId = element?.resourceId || "";
      const elementText = element?.text || "";
      const elementClass = element?.class || "";
      const elementContentDesc = element?.contentDesc || "";
      const xpath = deviceController._buildXPath ? deviceController._buildXPath(element) : "";
      const locator =
        (xpath || "") ||
        elementId ||
        elementContentDesc ||
        elementText ||
        (typeof x === "number" && typeof y === "number" ? `${x},${y}` : "");
      const locatorStrategy = xpath
        ? "xpath"
        : elementId
          ? "id"
          : elementContentDesc
            ? "accessibilityId"
            : elementText
              ? "text"
              : locator
                ? "coordinates"
                : "";

      const inputTarget = elementText || elementContentDesc || (elementId ? elementId.split("/").pop() : "");
      const step = {
        type: "input",
        description: inputTarget ? `Input "${text}" into ${inputTarget}` : `Input "${text}"`,
        value: text,
        locator,
        locatorStrategy,
        coordinates: typeof x === "number" && typeof y === "number" ? { x, y } : null,
        elementId,
        elementText,
        elementClass,
        elementContentDesc,
        xpath: xpath || "",
        elementMetadata: element || null,
        locatorBundle: inspect?.locatorBundle || null,
        reliabilityScore: typeof inspect?.reliabilityScore === "number" ? inspect.reliabilityScore : undefined,
        hierarchySnapshotId: inspect?.hierarchySnapshotId || null,
        smartXPath: inspect?.smartXPath || "",
        elementFingerprint: inspect?.elementFingerprint || "",
        screenContext: inspect?.screenContext || null,
        timestamp: Date.now(),
      };

      try {
        if (inspect?.elementFingerprint && inspect?.best) {
          locatorHistory.appendRecord(inspect?.screenContext?.package, {
            fingerprint: inspect.elementFingerprint,
            best: inspect.best,
            locatorBundle: inspect.locatorBundle || null,
            hierarchySnapshotId: inspect.hierarchySnapshotId || null,
            reliabilityScore: inspect.reliabilityScore,
            element: inspect.element || null,
          });
        }
      } catch {
        // ignore
      }

      if (recordingService.isRecording) recordingService.addStep(step);
      res.json({ success: true, step: { ...step, id: crypto.randomUUID() } });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/device/swipe", async (req, res) => {
    try {
      const { x1, y1, x2, y2, duration } = req.body;
      await deviceController.swipe(x1, y1, x2, y2, duration);
      const step = {
        type: "scroll",
        description: `Swipe from (${x1}, ${y1}) to (${x2}, ${y2})`,
        coordinates: { x: x1, y: y1, endX: x2, endY: y2 },
        timestamp: Date.now(),
      };
      if (recordingService.isRecording) recordingService.addStep(step);
      res.json({ success: true, step });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/device/key", async (req, res) => {
    try {
      const { keyCode, keyName } = req.body;
      await deviceController.pressKey(keyCode);
      const step = {
        type: "pressKey",
        description: `Press key: ${keyName || keyCode}`,
        value: keyCode.toString(),
        timestamp: Date.now(),
      };
      if (recordingService.isRecording) recordingService.addStep(step);
      res.json({ success: true, step });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/device/hide-keyboard", async (req, res) => {
    try {
      await deviceController.hideKeyboard(req.body.deviceId);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  /* ---------------- APP MANAGEMENT ---------------- */
  app.post("/app/launch", async (req, res) => {
    try {
      const { packageName } = req.body;
      await deviceController.openApp(packageName);
      if (recordingService.isRecording) {
        recordingService.addStep({
          type: "openApp",
          description: `Launch app: ${packageName}`,
          value: packageName,
          timestamp: Date.now(),
        });
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/app/stop", async (req, res) => {
    try {
      const { packageName } = req.body;
      await deviceController.stopApp(packageName);
      if (recordingService.isRecording) {
        recordingService.addStep({
          type: "stopApp",
          description: `Force stop app: ${packageName}`,
          value: packageName,
          timestamp: Date.now(),
        });
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/app/clear", async (req, res) => {
    try {
      const { packageName } = req.body;
      await deviceController.clearApp(packageName);
      if (recordingService.isRecording) {
        recordingService.addStep({
          type: "clearApp",
          description: `Clear data for app: ${packageName}`,
          value: packageName,
          timestamp: Date.now(),
        });
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/app/installed-packages", async (req, res) => {
    try {
      const { getInstalledPackages } = await import("./utils/adb-utils.js");
      const deviceId =
        typeof req.query.deviceId === "string" && req.query.deviceId.trim()
          ? req.query.deviceId.trim()
          : null;
      res.json({ success: true, packages: await getInstalledPackages(deviceId) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/app/check-install/:packageName", async (req, res) => {
    try {
      const { isAppInstalled } = await import("./utils/adb-utils.js");
      const deviceId =
        typeof req.query.deviceId === "string" && req.query.deviceId.trim()
          ? req.query.deviceId.trim()
          : null;
      res.json({ success: true, installed: await isAppInstalled(req.params.packageName, deviceId) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/app/upload", async (req, res) => {
    try {
      const { base64, fileName } = req.body;
      const buffer = Buffer.from(base64, "base64");
      const filePath = path.join(os.tmpdir(), fileName || `temp_${Date.now()}.apk`);
      fs.writeFileSync(filePath, buffer);
      res.json({ success: true, path: filePath });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/app/install", async (req, res) => {
    try {
      const { installApk } = await import("./utils/adb-utils.js");
      await installApk(req.body.apkPath);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/device/uninstall", async (req, res) => {
    try {
      const { packageName } = req.body;
      const output = await deviceController.uninstall(packageName);
      if (recordingService.isRecording) {
        recordingService.addStep({
          type: "uninstallApp",
          description: `Uninstall app: ${packageName}`,
          value: packageName,
          timestamp: Date.now(),
        });
      }
      res.json({ success: true, output });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  /* ---------------- RECORDING & REPLAY ---------------- */
  app.post("/recording/start", (_req, res) => {
    recordingService.startRecording();
    res.json({ success: true });
  });

  app.post("/recording/stop", (_req, res) => {
    const steps = recordingService.stopRecording();
    res.json({ success: true, steps });
  });

  app.post("/recording/pause", (_req, res) => {
    try {
      recordingService.pauseRecording();
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/recording/resume", (_req, res) => {
    try {
      recordingService.resumeRecording();
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get("/recording/steps", (_req, res) =>
    res.json({ success: true, steps: recordingService.getRecordedSteps() }),
  );

  app.get("/recording/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const send = (type, data) => res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    const onStepAdded = (step) => send("step-added", { step });
    recordingService.on("step-added", onStepAdded);

    const onReplayStarted = () => send("replay:start", { description: "Replay started" });
    const onStepStarted = (data) => send("replay:step:start", { index: data.stepIndex, stepId: data.step.id });
    const onStepCompleted = (data) =>
      send("replay:step:success", { index: data.stepIndex, stepId: data.step.id, duration: data.duration });
    const onReplayError = (data) => send("replay:step:error", { index: data.stepIndex, error: data.error });
    const onReplayCompleted = () => send("replay:info", { description: "Replay completed" });

    replayEngine.on("replay-started", onReplayStarted);
    replayEngine.on("step-started", onStepStarted);
    replayEngine.on("step-completed", onStepCompleted);
    replayEngine.on("replay-error", onReplayError);
    replayEngine.on("replay-completed", onReplayCompleted);

    req.on("close", () => {
      recordingService.removeListener("step-added", onStepAdded);
      replayEngine.removeListener("replay-started", onReplayStarted);
      replayEngine.removeListener("step-started", onStepStarted);
      replayEngine.removeListener("step-completed", onStepCompleted);
      replayEngine.removeListener("replay-error", onReplayError);
      replayEngine.removeListener("replay-completed", onReplayCompleted);
    });
  });

  app.post("/recording/replay", async (req, res) => {
    try {
      const { steps, deviceId: reqDeviceId } = req.body;
      const status = await deviceController.getStatus();
      const deviceId =
        reqDeviceId && status.devices?.some((d) => d.id === reqDeviceId)
          ? reqDeviceId
          : status.primaryDevice;
      if (!deviceId) throw new Error("No connected device found");
      await replayEngine.startReplay(steps, deviceId, req.body.startIndex || 0, {
        screenSettleDelayMs: req.body.screenSettleDelayMs,
        strict: req.body.strict,
        stepTimeoutMs: req.body.stepTimeoutMs,
        pollMs: req.body.pollMs,
      });
      res.json({ success: true, message: "Replay completed", deviceId });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/recording/replay/stop", (_req, res) => {
    try {
      replayEngine.stopReplay();
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /* ---------------- EMULATOR & APPIUM ---------------- */
  app.get("/emulator/available", async (_req, res) => {
    try {
      res.json({ success: true, avds: await emulatorController.getAvailableAvds() });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/emulator/start", async (req, res) => {
    try {
      await emulatorController.start(req.body.avd);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/emulator/stop", async (_req, res) => {
    try {
      await emulatorController.stop();
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/appium/status", async (_req, res) => {
    try {
      res.json(await appiumController.getStatus());
    } catch {
      res.json({ running: false });
    }
  });

  app.post("/terminal", async (req, res) => {
    if (req.body.command === "appium:start") {
      try {
        await appiumController.start();
        res.json({ success: true });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    } else {
      res.status(400).json({ error: "Unsupported" });
    }
  });

  app.post("/setup/auto", async (req, res) => {
    try {
      await Promise.allSettled([appiumController.start(), emulatorController.start(req.body.avd)]);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  /* ---------------- LEGACY & HELPER ---------------- */
  app.get("/ping", (_req, res) => res.json({ pong: true, time: Date.now() }));
  app.get("/agent/status", (_req, res) =>
    res.json({ running: true, recording: recordingService.getStatus?.().recording ?? false }),
  );
  app.post("/agent/start", (_req, res) => res.json({ success: true, running: true }));

  const server = createServer(app);
  await new Promise((resolve, reject) => {
    const onError = (err) => {
      if (err?.code === "EADDRINUSE") {
        console.error(
          `Port ${LOCAL_PORT} already in use. Stop the existing agent process or set WISPR_AGENT_PORT.`,
        );
      }
      reject(err);
    };
    server.once("error", onError);
    server.listen(LOCAL_PORT, () => {
      server.removeListener("error", onError);
      startTime = Date.now();
      log("success", `Local mobile helper API listening on http://localhost:${LOCAL_PORT}`);
      resolve();
    });
  });
}

async function heartbeat() {
  const body = {
    current_capacity: Math.max(0, MAX_CAPACITY - activeJobs),
    max_capacity: MAX_CAPACITY,
    active_jobs: activeJobs,
    system_info: {
      platform: process.platform,
      nodeVersion: process.version,
      memory: process.memoryUsage?.() || undefined,
      uptime: typeof process.uptime === "function" ? process.uptime() : undefined,
      deviceName: process.env.DEVICE_NAME || MOBILE_CONFIG.DEFAULT_CAPABILITIES.deviceName,
      platformName: process.env.PLATFORM_NAME || MOBILE_CONFIG.DEFAULT_CAPABILITIES.platformName || "mobile",
    },
  };
  const res = await fetch(`${API_BASE_URL}/heartbeat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-agent-key": API_TOKEN,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Heartbeat failed: ${res.status} ${text || res.statusText}`);
  }
}

async function pollJobs() {
  if (activeJobs >= MAX_CAPACITY) return [];
  const res = await fetch(`${API_BASE_URL}/jobs/poll`, {
    method: "GET",
    headers: {
      "x-agent-key": API_TOKEN,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Poll failed: ${res.status} ${text || res.statusText}`);
  }
  const data = await res.json();
  return data?.jobs || [];
}

async function executeJob(job) {
  activeJobs += 1;
  console.log(`[JOB] Received job ${job.run_id || job.id}`);
  // TODO: integrate your Appium/ADB flow here.
  // Example skeleton:
  // 1) Ensure Appium is running (auto-start if needed).
  // 2) Connect to device/emulator (APPIUM_HOST/APPIUM_PORT, DEVICE_NAME, PLATFORM_NAME).
  // 3) Execute steps from job.steps using deviceController/appiumController.
  // 4) Capture screenshots/video and attach.

  // For now, mark job completed immediately (stub):
  const body = {
    status: "completed",
    passed_steps: job.steps?.length || 0,
    failed_steps: 0,
    total_steps: job.steps?.length || 0,
    screenshots: [],
    results: { notes: "Executed by mobile-agent stub." },
  };
  try {
    const res = await fetch(`${API_BASE_URL}/jobs/${job.id}/result`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-agent-key": API_TOKEN,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Result submit failed: ${res.status} ${text || res.statusText}`);
    }
  } finally {
    activeJobs = Math.max(0, activeJobs - 1);
  }
}

async function main() {
  if (!API_TOKEN) {
    console.error("Set WISPR_API_TOKEN before starting the mobile agent.");
    process.exit(1);
  }

  const projectId = extractProjectId(API_BASE_URL);
  if (!projectId) {
    console.error("Unable to derive project id from API_BASE_URL. Please set a valid API_BASE_URL.");
    process.exit(1);
  }

  // Dynamic startup banner (no behavior changes)
  log("info", "=".repeat(50));
  log("info", "WISPR Self-Hosted Agent Starting...");
  if (AGENT_BUILD) log("info", `Agent build: ${AGENT_BUILD}`);
  log("info", "=".repeat(50));
  log("info", `API Endpoint: ${API_BASE_URL}`);
  log(`Max Capacity: ${MAX_CAPACITY}`);
  log(`Heartbeat Interval: ${HEARTBEAT_SEC}s`);
  log(`Poll Interval: ${POLL_SEC}s`);
  log("info", "=".repeat(50));
  log("info", "MOBILE AUTOMATION AGENT INITIALIZING...");

  try {
    await deviceController.initialize();
    log("DeviceController initialized");
  } catch (e) {
    console.warn("[DeviceController] Initialization failed:", e.message);
  }

  try {
    await appiumController.checkInstallation();
    log("AppiumController check complete");
  } catch (e) {
    console.warn("[AppiumController] Check failed:", e.message);
  }

  try {
    await emulatorController.initialize();
    log("EmulatorController initialized");
  } catch (e) {
    console.warn("[EmulatorController] Initialization failed:", e.message);
  }

  // Start the helper API for the UI panels
  await startLocalHelperServer();
  log("success", `Mobile Automation Server running at http://localhost:${LOCAL_PORT}`);

  log("success", `Mobile agent targeting ${API_BASE_URL}`);
  while (true) {
    try {
      await heartbeat();
      const jobs = await pollJobs();
      for (const job of jobs) {
        await executeJob(job);
      }
    } catch (err) {
      console.error(err?.message || err);
    }
    await sleep(Math.min(HEARTBEAT_SEC, POLL_SEC) * 1000);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
