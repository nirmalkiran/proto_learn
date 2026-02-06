/**
 * WISPR Self-Hosted Test Execution Agent
 * Usage: npm install && npx playwright install chromium && npm start
 */

import { chromium } from 'playwright';
import express from "express";
import cors from "cors";
import { createServer } from "http";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import os from "os";

// Mobile Automation Modules (Unified flat structure)
import { CONFIG as MOBILE_CONFIG } from "./config.js";
import processManager from "./utils/process-manager.js";
import deviceController from "./controllers/device-controller.js";
import appiumController from "./controllers/appium-controller.js";
import emulatorController from "./controllers/emulator-controller.js";
import recordingService from "./services/recording-service.js";
import ReplayEngine from "./services/replay-engine.js";
import screenshotService from "./services/screenshot-service.js";
import inspectorService from "./services/inspector-service.js";
import { HierarchySnapshotStore } from "./services/hierarchy-snapshot-store.js";
import { diffHierarchies } from "./services/hierarchy-diff.js";
import { LocatorHistoryStore } from "./services/locator-history-store.js";
import sharp from "sharp";
import { PNG } from "pngjs";
import * as jpegJs from "jpeg-js";
import { once } from "events";

/* =====================================================
 * WISPR WEB AGENT CONFIG & LOGIC
 * ===================================================== */
const CONFIG = {
  API_TOKEN: process.env.WISPR_API_TOKEN || "YOUR_API_TOKEN_HERE",
  API_BASE_URL: "https://vqoxcgbilzqxmxuxwicr.supabase.co/functions/v1/agent-api",
  HEARTBEAT_INTERVAL: 30000,
  POLL_INTERVAL: 5000,
  MAX_CAPACITY: 3,
};

let isRunning = true, activeJobs = 0;
const AGENT_BUILD = process.env.WISPR_AGENT_BUILD || "2026-02-05T10:10:00Z";
const log = (l, m, d = {}) => console.log(`[${new Date().toISOString()}] [${l.toUpperCase()}] ${m}`, Object.keys(d).length ? d : "");

async function apiRequest(endpoint, opts = {}) {
  const url = CONFIG.API_BASE_URL + endpoint;
  if (!CONFIG.API_TOKEN || CONFIG.API_TOKEN === "YOUR_API_TOKEN_HERE") {
    throw new Error("API Token is missing or not configured. Please check your WISPR_API_TOKEN environment variable.");
  }

  try {
    const res = await fetch(url, {
      ...opts,
      headers: { "Content-Type": "application/json", "x-agent-key": CONFIG.API_TOKEN, ...opts.headers }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status} for ${url}`);
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`Request to ${url} timed out`);
    if (e.cause) throw new Error(`${e.message} (Cause: ${e.cause.message})`);
    throw e;
  }
}

async function sendHeartbeat() {
  try {
    await apiRequest("/heartbeat", {
      method: "POST",
      body: JSON.stringify({
        current_capacity: CONFIG.MAX_CAPACITY - activeJobs,
        max_capacity: CONFIG.MAX_CAPACITY,
        active_jobs: activeJobs,
        system_info: { platform: process.platform, nodeVersion: process.version }
      })
    });
    log("debug", "Heartbeat sent");
  } catch (e) { log("warn", "Heartbeat failed", { error: e.message }); }
}

async function pollForJobs() {
  if (activeJobs >= CONFIG.MAX_CAPACITY) return null;
  try {
    const data = await apiRequest("/jobs/poll", { method: "GET" });
    if (data.jobs?.length > 0) { log("info", `Found ${data.jobs.length} job(s)`); return data.jobs[0]; }
    return null;
  } catch (e) { log("warn", "Poll failed", { error: e.message }); return null; }
}

async function startJob(jobId) {
  try { return await apiRequest(`/jobs/${jobId}/start`, { method: "POST" }); }
  catch (e) { log("error", `Failed to claim job ${jobId}`, { error: e.message }); return null; }
}

async function submitResult(jobId, status, results) {
  try {
    await apiRequest(`/jobs/${jobId}/result`, { method: "POST", body: JSON.stringify({ status, ...results }) });
    log("info", `Results submitted for job ${jobId}`, { status });
  } catch (e) { log("error", "Failed to submit results", { error: e.message }); }
}

async function executeStep(page, step, idx) {
  const start = Date.now();
  const result = { step_index: idx, step_type: step.type, status: "passed", duration_ms: 0, error: null };
  try {
    switch (step.type) {
      case "goto": case "navigate": await page.goto(step.url || step.value, { waitUntil: "networkidle" }); break;
      case "click": await page.click(step.selector, { timeout: 30000 }); break;
      case "type": case "fill": await page.fill(step.selector, step.value || ""); break;
      case "wait": await page.waitForTimeout(parseInt(step.value) || 1000); break;
      case "waitForSelector": await page.waitForSelector(step.selector, { timeout: 30000 }); break;
      case "screenshot": await page.screenshot({ fullPage: step.fullPage }); break;
      case "select": await page.selectOption(step.selector, step.value); break;
      case "assertText": case "verifyText": {
        const txt = await page.textContent(step.selector);
        if (!txt?.includes(step.value)) throw new Error(`Expected "${step.value}" not found`);
        break;
      }
      case "assertVisible": if (!(await page.isVisible(step.selector))) throw new Error("Element not visible"); break;
      default: log("warn", `Unknown step: ${step.type}`);
    }
    result.duration_ms = Date.now() - start;
  } catch (e) { result.status = "failed"; result.error = e.message; result.duration_ms = Date.now() - start; }
  return result;
}

async function executeJob(job) {
  const start = Date.now(); activeJobs++;
  log("info", "Starting job", { job_id: job.id, steps: job.steps?.length || 0 });
  const results = { result_data: {}, step_results: [], error_message: null, execution_time_ms: 0 };
  let browser = null;
  try {
    browser = await chromium.launch({ headless: process.env.HEADLESS !== "false" });
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    if (job.base_url) await page.goto(job.base_url, { waitUntil: "networkidle" });
    let passed = 0, failed = 0;
    for (let i = 0; i < (job.steps || []).length; i++) {
      const r = await executeStep(page, job.steps[i], i);
      results.step_results.push(r);
      if (r.status === "failed") { failed++; break; } else passed++;
    }
    results.result_data = { total_steps: job.steps?.length || 0, passed_steps: passed, failed_steps: failed };
    results.execution_time_ms = Date.now() - start;
    await submitResult(job.id, failed > 0 ? "failed" : "completed", results);
  } catch (e) {
    results.error_message = e.message; results.execution_time_ms = Date.now() - start;
    await submitResult(job.id, "failed", results);
  } finally { if (browser) await browser.close().catch(() => { }); activeJobs--; }
}

/* =====================================================
 * MOBILE AUTOMATION AGENT LOGIC
 * ===================================================== */
class MobileAutomationAgent {
  constructor() {
    this.app = null;
    this.server = null;
    this.isRunning = false;
    this.startTime = null;
    this.replayEngine = new ReplayEngine();
  }

  async encodeJpeg(buffer, quality = 70) {
    if (sharp) {
      try {
        return await sharp(buffer).jpeg({ quality, chromaSubsampling: "4:2:0" }).toBuffer();
      } catch { /* fall through */ }
    }
    try {
      const png = PNG.sync.read(buffer);
      const raw = { data: png.data, width: png.width, height: png.height };
      return jpegJs.encode(raw, quality).data;
    } catch {
      return buffer; // fallback to original buffer (likely PNG)
    }
  }

  async initialize() {
    log("info", "MOBILE AUTOMATION AGENT INITIALIZING...");
    try {
      try { await deviceController.initialize(); } catch (e) { log("warn", "Device controller failed", { error: e.message }); }
      try { await appiumController.checkInstallation(); } catch (e) { log("warn", "Appium check failed", { error: e.message }); }
      try { await emulatorController.initialize(); } catch (e) { log("warn", "Emulator init failed", { error: e.message }); }
      this.setupServer();
      log("info", "Mobile Automation Initialization complete");
    } catch (error) { log("error", "Mobile Automation Initialization failed", { error: error.message }); }
  }

  setupServer() {
    this.app = express();
    this.app.use((req, res, next) => { res.setHeader("Access-Control-Allow-Private-Network", "true"); next(); });
    this.app.use(cors({ origin: true, methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Access-Control-Request-Private-Network"] }));
    this.app.use(express.json({ limit: "500mb" }));
    this.app.use(express.urlencoded({ limit: "500mb", extended: true }));

    const snapshotStore = new HierarchySnapshotStore({});
    const locatorHistory = new LocatorHistoryStore({});

    /* ---------------- HEALTH & STATUS ---------------- */
    this.app.get("/health", (req, res) => res.json({ status: "ok", uptime: this.startTime ? Date.now() - this.startTime : 0, port: MOBILE_CONFIG.PORT }));

    this.app.get("/setup/status", async (req, res) => {
      try {
        const [device, appium, emulator] = await Promise.allSettled([deviceController.getStatus(), appiumController.getStatus(), emulatorController.getStatus()]);
        const deviceStatus = device.value || { connected: false, devices: [] };
        const physicalDeviceConnected = deviceStatus.devices ? deviceStatus.devices.some(d => d.type === 'usb' && d.status === 'device') : false;
        res.json({
          backend: true,
          agent: true,
          device: deviceStatus.connected ?? false,
          devices: deviceStatus.devices || [],
          physicalDevice: physicalDeviceConnected,
          appium: appium.value?.running ?? false,
          emulator: emulator.value?.running ?? false
        });
      } catch { res.json({ backend: true, agent: true, device: false, devices: [], physicalDevice: false, appium: false, emulator: false }); }
    });

    /* ---------------- DEVICE ---------------- */
    this.app.get("/device/check", async (req, res) => { try { res.json(await deviceController.getStatus()); } catch (e) { res.status(500).json({ connected: false, error: e.message }); } });
    this.app.get("/device/size", async (req, res) => { try { res.json({ success: true, size: await deviceController.getScreenSize() }); } catch (e) { res.status(500).json({ success: false, error: e.message }); } });
    this.app.get("/device/screenshot", async (req, res) => { try { const img = await deviceController.takeScreenshot(); res.setHeader("Content-Type", "image/png"); res.send(img); } catch (e) { log("error", "Screenshot failed", { error: e.message }); res.status(500).json({ error: e.message }); } });

    this.app.get("/device/stream/mjpeg", async (req, res) => {
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
      req.on("close", () => { active = false; });

      const sendFrame = async () => {
        if (!active || res.writableEnded) return;
        const start = Date.now();
        try {
          const pngBuffer = await deviceController.takeScreenshot(deviceId);
          const jpegBuffer = await this.encodeJpeg(pngBuffer, quality);
          if (res.writableEnded) return;

          const header =
            `--${boundary}\r\n` +
            `Content-Type: image/jpeg\r\n` +
            `Content-Length: ${jpegBuffer.length}\r\n\r\n`;

          if (!res.write(header)) await once(res, "drain");
          if (!res.write(jpegBuffer)) await once(res, "drain");
          if (!res.write("\r\n")) await once(res, "drain");
        } catch (e) {
          // Avoid noisy logs when device is temporarily absent
          if (!String(e?.message || "").includes("No device connected")) {
            log("warn", "MJPEG frame failed", { error: e.message });
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
    this.app.post("/device/shell", async (req, res) => { try { const { command, deviceId } = req.body; if (!command) throw new Error("Command is required"); res.json({ success: true, ...await deviceController.shell(command, deviceId) }); } catch (e) { res.status(500).json({ error: e.message }); } });
    this.app.get("/device/ui", async (req, res) => { try { res.json({ success: true, xml: await deviceController.getUIHierarchy() }); } catch (e) { res.status(500).json({ success: false, error: e.message }); } });

    /* ---------------- INSPECTOR (ADDITIVE) ---------------- */
    this.app.post("/device/inspect", async (req, res) => {
      try {
        const { x, y, deviceId, mode, preferCache } = req.body || {};
        const inspect = await inspectorService.inspectAtPoint({ x, y, deviceId, mode, preferCache });
        res.json({ success: true, inspect });
      } catch (e) {
        res.status(500).json({ success: false, error: e.message });
      }
    });

    this.app.post("/device/inspect-locator", async (req, res) => {
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

    this.app.get("/device/hierarchy/snapshot/:id", async (req, res) => {
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

    this.app.post("/device/hierarchy/diff", async (req, res) => {
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
    this.app.post("/device/tap", async (req, res) => {
      try {
        const { x, y } = req.body; if (x == null || y == null) throw new Error("Coordinates required");
        const result = await deviceController.tap(x, y);
        const { element, xpath } = result;
        let inspect = null;
        try {
          inspect = await inspectorService.inspectAtPoint({ x, y, deviceId: result.deviceId, mode: "tap", preferCache: true });
        } catch { /* non-fatal */ }

        const elementId = element?.resourceId || "";
        const elementText = element?.text || "";
        const elementClass = element?.class || "";
        const elementContentDesc = element?.contentDesc || "";

        const locator =
          (xpath || "") ||
          elementId ||
          elementContentDesc ||
          elementText ||
          `${x},${y}`;
        const locatorStrategy = xpath ? "xpath" : elementId ? "id" : elementContentDesc ? "accessibilityId" : elementText ? "text" : "coordinates";

        const descTarget = elementText || elementContentDesc || (elementId ? elementId.split('/').pop() : "");
        const role = elementClass?.includes("EditText") ? "Input" :
          elementClass?.includes("Button") ? "Button" :
            elementClass?.includes("Switch") ? "Toggle" :
              elementClass?.includes("CheckBox") ? "Checkbox" :
                elementClass?.includes("Spinner") ? "Dropdown" :
                  elementClass?.includes("ImageButton") ? "Icon Button" : "";
        const step = {
          type: "tap",
          description: descTarget ? `${role ? role + " " : ""}Tap on "${descTarget}"` : `Tap at (${x}, ${y})`,
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
          timestamp: Date.now()
        };
        try {
          if (inspect?.elementFingerprint && inspect?.best) {
            locatorHistory.appendRecord(inspect?.screenContext?.package, {
              fingerprint: inspect.elementFingerprint,
              best: inspect.best,
              locatorBundle: inspect.locatorBundle || null,
              hierarchySnapshotId: inspect.hierarchySnapshotId || null,
              reliabilityScore: inspect.reliabilityScore,
              element: inspect.element || null
            });
          }
        } catch { /* ignore */ }
        if (recordingService.isRecording) recordingService.addStep(step);
        res.json({ success: true, step: { ...step, id: crypto.randomUUID() } });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });

    this.app.post("/device/long-press", async (req, res) => {
      try {
        const { x, y, duration } = req.body; if (x == null || y == null) throw new Error("Coordinates required");
        const result = await deviceController.longPress(x, y, duration || 1000);
        const { element, xpath } = result || {};
        let inspect = null;
        try {
          inspect = await inspectorService.inspectAtPoint({ x, y, deviceId: result?.deviceId, mode: "tap", preferCache: true });
        } catch { /* non-fatal */ }

        const elementId = element?.resourceId || "";
        const elementText = element?.text || "";
        const elementClass = element?.class || "";
        const elementContentDesc = element?.contentDesc || "";

        const locator =
          (xpath || "") ||
          elementId ||
          elementContentDesc ||
          elementText ||
          `${x},${y}`;
        const locatorStrategy = xpath ? "xpath" : elementId ? "id" : elementContentDesc ? "accessibilityId" : elementText ? "text" : "coordinates";

        const descTarget = elementText || elementContentDesc || (elementId ? elementId.split('/').pop() : "");
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
          timestamp: Date.now()
        };
        try {
          if (inspect?.elementFingerprint && inspect?.best) {
            locatorHistory.appendRecord(inspect?.screenContext?.package, {
              fingerprint: inspect.elementFingerprint,
              best: inspect.best,
              locatorBundle: inspect.locatorBundle || null,
              hierarchySnapshotId: inspect.hierarchySnapshotId || null,
              reliabilityScore: inspect.reliabilityScore,
              element: inspect.element || null
            });
          }
        } catch { /* ignore */ }
        if (recordingService.isRecording) recordingService.addStep(step);
        res.json({ success: true, step: { ...step, id: crypto.randomUUID() } });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });

    this.app.post("/device/input", async (req, res) => {
      try {
        const { text, x, y } = req.body;
        let element = null;
        let inspect = null;
        if (typeof x === "number" && typeof y === "number") {
          element = await deviceController.getElementAt(x, y);
          try {
            inspect = await inspectorService.inspectAtPoint({ x, y, deviceId: req.body.deviceId, mode: "tap", preferCache: true });
          } catch { /* non-fatal */ }
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
        const locatorStrategy = xpath ? "xpath" : elementId ? "id" : elementContentDesc ? "accessibilityId" : elementText ? "text" : locator ? "coordinates" : "";

        const inputTarget = elementText || elementContentDesc || (elementId ? elementId.split('/').pop() : "");
        const step = {
          type: "input",
          description: inputTarget ? `Input "${text}" into ${inputTarget}` : `Input "${text}"`,
          value: text,
          locator,
          locatorStrategy,
          coordinates: (typeof x === "number" && typeof y === "number") ? { x, y } : null,
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
          timestamp: Date.now()
        };
        try {
          if (inspect?.elementFingerprint && inspect?.best) {
            locatorHistory.appendRecord(inspect?.screenContext?.package, {
              fingerprint: inspect.elementFingerprint,
              best: inspect.best,
              locatorBundle: inspect.locatorBundle || null,
              hierarchySnapshotId: inspect.hierarchySnapshotId || null,
              reliabilityScore: inspect.reliabilityScore,
              element: inspect.element || null
            });
          }
        } catch { /* ignore */ }
        if (recordingService.isRecording) recordingService.addStep(step);
        res.json({ success: true, step: { ...step, id: crypto.randomUUID() } });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });

    this.app.post("/device/swipe", async (req, res) => {
      try {
        const { x1, y1, x2, y2, duration } = req.body; await deviceController.swipe(x1, y1, x2, y2, duration);
        const step = { type: "scroll", description: `Swipe from (${x1}, ${y1}) to (${x2}, ${y2})`, coordinates: { x: x1, y: y1, endX: x2, endY: y2 }, timestamp: Date.now() };
        if (recordingService.isRecording) recordingService.addStep(step);
        res.json({ success: true, step });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });

    this.app.post("/device/key", async (req, res) => {
      try {
        const { keyCode, keyName } = req.body; await deviceController.pressKey(keyCode);
        const step = { type: "pressKey", description: `Press key: ${keyName || keyCode}`, value: keyCode.toString(), timestamp: Date.now() };
        if (recordingService.isRecording) recordingService.addStep(step);
        res.json({ success: true, step });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });

    this.app.post("/device/hide-keyboard", async (req, res) => { try { await deviceController.hideKeyboard(req.body.deviceId); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

    /* ---------------- APP MANAGEMENT ---------------- */
    this.app.post("/app/launch", async (req, res) => {
      try {
        const { packageName } = req.body;
        await deviceController.openApp(packageName);

        if (recordingService.isRecording) {
          recordingService.addStep({
            type: "openApp",
            description: `Launch app: ${packageName}`,
            value: packageName,
            timestamp: Date.now()
          });
        }

        res.json({ success: true });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });
    this.app.post("/app/stop", async (req, res) => {
      try {
        const { packageName } = req.body;
        await deviceController.stopApp(packageName);
        if (recordingService.isRecording) {
          recordingService.addStep({
            type: "stopApp",
            description: `Force stop app: ${packageName}`,
            value: packageName,
            timestamp: Date.now()
          });
        }
        res.json({ success: true });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });
    this.app.post("/app/clear", async (req, res) => {
      try {
        const { packageName } = req.body;
        await deviceController.clearApp(packageName);
        if (recordingService.isRecording) {
          recordingService.addStep({
            type: "clearApp",
            description: `Clear data for app: ${packageName}`,
            value: packageName,
            timestamp: Date.now()
          });
        }
        res.json({ success: true });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });
    this.app.get("/app/installed-packages", async (req, res) => {
      try {
        const { getInstalledPackages } = await import("./utils/adb-utils.js");
        const deviceId = (typeof req.query.deviceId === "string" && req.query.deviceId.trim())
          ? req.query.deviceId.trim()
          : null;
        res.json({ success: true, packages: await getInstalledPackages(deviceId) });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });
    this.app.get("/app/check-install/:packageName", async (req, res) => {
      try {
        const { isAppInstalled } = await import("./utils/adb-utils.js");
        const deviceId = (typeof req.query.deviceId === "string" && req.query.deviceId.trim())
          ? req.query.deviceId.trim()
          : null;
        res.json({ success: true, installed: await isAppInstalled(req.params.packageName, deviceId) });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });
    this.app.post("/app/upload", async (req, res) => { try { const { base64, fileName } = req.body; const buffer = Buffer.from(base64, "base64"); const filePath = path.join(os.tmpdir(), fileName || `temp_${Date.now()}.apk`); fs.writeFileSync(filePath, buffer); res.json({ success: true, path: filePath }); } catch (e) { res.status(500).json({ error: e.message }); } });
    this.app.post("/app/install", async (req, res) => { try { const { installApk } = await import("./utils/adb-utils.js"); await installApk(req.body.apkPath); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
    this.app.post("/device/uninstall", async (req, res) => {
      try {
        const { packageName } = req.body;
        const output = await deviceController.uninstall(packageName);
        if (recordingService.isRecording) {
          recordingService.addStep({
            type: "uninstallApp",
            description: `Uninstall app: ${packageName}`,
            value: packageName,
            timestamp: Date.now()
          });
        }
        res.json({ success: true, output });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });

    /* ---------------- RECORDING & REPLAY ---------------- */
    this.app.post("/recording/start", (req, res) => { recordingService.startRecording(); res.json({ success: true }); });
    this.app.post("/recording/stop", (req, res) => { const steps = recordingService.stopRecording(); res.json({ success: true, steps }); });
    this.app.post("/recording/pause", (req, res) => { try { recordingService.pauseRecording(); res.json({ success: true }); } catch (e) { res.status(400).json({ error: e.message }); } });
    this.app.post("/recording/resume", (req, res) => { try { recordingService.resumeRecording(); res.json({ success: true }); } catch (e) { res.status(400).json({ error: e.message }); } });
    this.app.get("/recording/steps", (req, res) => res.json({ success: true, steps: recordingService.getRecordedSteps() }));

    this.app.get("/recording/events", (req, res) => {
      res.setHeader("Content-Type", "text/event-stream"); res.setHeader("Cache-Control", "no-cache"); res.setHeader("Connection", "keep-alive");
      const send = (type, data) => res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
      const onStepAdded = (step) => send("step-added", { step });
      recordingService.on("step-added", onStepAdded);

      const onReplayStarted = (data) => send("replay:start", { description: `Replay started` });
      const onStepStarted = (data) => send("replay:step:start", { index: data.stepIndex, stepId: data.step.id });
      const onStepCompleted = (data) => send("replay:step:success", { index: data.stepIndex, stepId: data.step.id, duration: data.duration });
      const onReplayError = (data) => send("replay:step:error", { index: data.stepIndex, error: data.error });
      const onReplayCompleted = (data) => send("replay:info", { description: `Replay completed` });

      this.replayEngine.on("replay-started", onReplayStarted);
      this.replayEngine.on("step-started", onStepStarted);
      this.replayEngine.on("step-completed", onStepCompleted);
      this.replayEngine.on("replay-error", onReplayError);
      this.replayEngine.on("replay-completed", onReplayCompleted);

      req.on("close", () => {
        recordingService.removeListener("step-added", onStepAdded);
        this.replayEngine.removeListener("replay-started", onReplayStarted);
        this.replayEngine.removeListener("step-started", onStepStarted);
        this.replayEngine.removeListener("step-completed", onStepCompleted);
        this.replayEngine.removeListener("replay-error", onReplayError);
        this.replayEngine.removeListener("replay-completed", onReplayCompleted);
      });
    });

    this.app.post("/recording/replay", async (req, res) => {
      try {
        const { steps, deviceId: reqDeviceId } = req.body;
        const status = await deviceController.getStatus();
        const deviceId = (reqDeviceId && status.devices?.some(d => d.id === reqDeviceId))
          ? reqDeviceId
          : status.primaryDevice;
        if (!deviceId) throw new Error("No connected device found");
        await this.replayEngine.startReplay(steps, deviceId, req.body.startIndex || 0, {
          screenSettleDelayMs: req.body.screenSettleDelayMs,
          strict: req.body.strict,
          stepTimeoutMs: req.body.stepTimeoutMs,
          pollMs: req.body.pollMs
        });
        res.json({ success: true, message: "Replay completed", deviceId });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });

    this.app.post("/recording/replay/stop", async (req, res) => {
      try {
        this.replayEngine.stopReplay();
        res.json({ success: true });
      } catch (e) {
        res.status(500).json({ success: false, error: e.message });
      }
    });

    /* ---------------- EMULATOR & APPIUM ---------------- */
    this.app.get("/emulator/available", async (req, res) => { try { res.json({ success: true, avds: await emulatorController.getAvailableAvds() }); } catch (e) { res.status(500).json({ error: e.message }); } });
    this.app.post("/emulator/start", async (req, res) => { try { await emulatorController.start(req.body.avd); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
    this.app.post("/emulator/stop", async (req, res) => { try { await emulatorController.stop(); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
    this.app.get("/appium/status", async (req, res) => { try { res.json(await appiumController.getStatus()); } catch { res.json({ running: false }); } });
    this.app.post("/terminal", async (req, res) => { if (req.body.command === "appium:start") { try { await appiumController.start(); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } } else res.status(400).json({ error: "Unsupported" }); });
    this.app.post("/setup/auto", async (req, res) => { try { await Promise.allSettled([appiumController.start(), emulatorController.start(req.body.avd)]); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

    /* ---------------- LEGACY & HELPER ---------------- */
    this.app.get("/ping", (req, res) => res.json({ pong: true, time: Date.now() }));
    this.app.get("/agent/status", (req, res) => res.json({ running: true, recording: recordingService.getStatus().recording }));
    this.app.post("/agent/start", (req, res) => res.json({ success: true, running: true }));
  }

  async start() {
    if (this.isRunning) return;
    this.server = createServer(this.app);
    await new Promise((resolve, reject) => {
      const onError = (err) => {
        if (err?.code === "EADDRINUSE") {
          log("error", `Port ${MOBILE_CONFIG.PORT} already in use on host ${MOBILE_CONFIG.AGENT_HOST}`, {
            hint: "Stop the existing agent process, or set WISPR_AGENT_PORT to a free port and update VITE_AGENT_URL in the UI if needed."
          });
        }
        reject(err);
      };
      this.server.once("error", onError);
      this.server.listen(MOBILE_CONFIG.PORT, MOBILE_CONFIG.AGENT_HOST, () => {
        this.server.removeListener("error", onError);
        log("info", `Mobile Automation Server running at http://${MOBILE_CONFIG.AGENT_HOST}:${MOBILE_CONFIG.PORT}`);
        resolve();
      });
    });
    this.isRunning = true;
    this.startTime = Date.now();
  }
}

/* =====================================================
 * UNIFIED LIFECYCLE MANAGEMENT
 * ===================================================== */
const mobileAgent = new MobileAutomationAgent();

async function runAgent() {
  log("info", "=".repeat(50));
  log("info", "WISPR Self-Hosted Agent Starting...");
  log("info", `Agent build: ${AGENT_BUILD}`);
  log("info", "=".repeat(50));

  // 1. Start Mobile Automation Helper
  try {
    await mobileAgent.initialize();
    await mobileAgent.start();
  } catch (e) { log("error", "Mobile Automation Helper failed to start", { error: e.message }); }

  // 2. Start WISPR Job Polling
  const hb = setInterval(sendHeartbeat, CONFIG.HEARTBEAT_INTERVAL);
  await sendHeartbeat();

  while (isRunning) {
    try {
      const job = await pollForJobs();
      if (job) {
        const jd = await startJob(job.id);
        if (jd) executeJob({ ...job, ...jd }).catch(e => log("error", "Job execution failed", { error: e.message }));
      }
    } catch (e) { log("error", "Main loop error", { error: e.message }); }
    await new Promise(r => setTimeout(r, CONFIG.POLL_INTERVAL));
  }

  clearInterval(hb);
  if (mobileAgent.server) {
    log("info", "Stopping Mobile Automation Helper...");
    mobileAgent.isRunning = false;
    await new Promise(resolve => mobileAgent.server.close(resolve));
  }
  log("info", "Agent stopped");
}

process.on("SIGINT", () => { isRunning = false; });
process.on("SIGTERM", () => { isRunning = false; });
runAgent().catch(e => { log("error", "Agent crashed", { error: e.message }); process.exit(1); });
