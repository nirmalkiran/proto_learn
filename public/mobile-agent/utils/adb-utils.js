/**
 * ADB Utilities
 * Helper functions for Android Debug Bridge operations
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config.js';

const execAsync = promisify(exec);
const loggedDevices = new Set();
const uiHierarchyInFlight = new Map(); // deviceId -> Promise<string|null>
const uiHierarchyLast = new Map(); // deviceId -> { xml: string, ts: number }
const uiHierarchyLastFail = new Map(); // deviceId -> { ts: number, code?: number, signal?: string }
const uiHierarchyDisabledUntil = new Map(); // deviceId -> ts

async function fetchJson(url, timeoutMs = 3000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function sanitizeHierarchyXml(raw) {
  const s = String(raw || "");
  const start = s.indexOf("<?xml");
  const altStart = s.indexOf("<hierarchy");
  const from = start >= 0 ? start : altStart;
  if (from < 0) return s;
  const endTag = "</hierarchy>";
  const end = s.lastIndexOf(endTag);
  if (end < 0) return s.slice(from);
  return s.slice(from, end + endTag.length);
}

async function tryGetAppiumPageSource() {
  const baseUrls = [
    `http://${CONFIG.APPIUM_HOST}:${CONFIG.APPIUM_PORT}/wd/hub`,
    `http://${CONFIG.APPIUM_HOST}:${CONFIG.APPIUM_PORT}`,
  ];

  for (const base of baseUrls) {
    const sessions = await fetchJson(`${base}/sessions`, 2000);
    const list =
      sessions?.value?.sessions ||
      sessions?.value ||
      sessions?.sessions ||
      sessions ||
      [];
    const arr = Array.isArray(list) ? list : [];
    const session = arr.find(s => s?.id || s?.sessionId) || null;
    const sessionId = session?.id || session?.sessionId;
    if (!sessionId) continue;

    const source = await fetchJson(`${base}/session/${sessionId}/source`, 3000);
    const xml = source?.value || source?.source || null;
    if (xml && String(xml).length > 20) {
      return sanitizeHierarchyXml(xml);
    }
  }

  return null;
}

/**
 * Execute ADB command with timeout
 */
export async function adbCommand(args, options = {}) {
  const timeout = options.timeout || CONFIG.COMMAND_TIMEOUT;
  const deviceId = options.deviceId;
  const silent = options.silent === true;
  const maxBuffer = (typeof options.maxBuffer === "number" && options.maxBuffer > 0)
    ? options.maxBuffer
    : 10 * 1024 * 1024; // 10MB default

  const command = CONFIG.ADB_COMMAND;
  const fullArgs = deviceId ? ['-s', deviceId, ...args] : args;

  try {
    const { stdout, stderr } = await execAsync(`"${command}" ${fullArgs.join(' ')}`, {
      timeout,
      maxBuffer
    });

    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    const message = error?.stderr || error?.stdout || error?.message || "Unknown error";
    const code = (typeof error?.code === "number") ? error.code : null;
    const signal = (typeof error?.signal === "string") ? error.signal : null;
    const suffix = (code != null || signal)
      ? ` (code: ${code ?? "?"}, signal: ${signal ?? "?"})`
      : "";
    if (!silent) {
      console.error(`[ADB] Command failed: ${args.join(' ')} - Error: ${message}${suffix}`);
    }
    const err = new Error(`ADB command failed: ${message}${suffix}`);
    err.code = code;
    err.signal = signal;
    err.adbArgs = args;
    err.deviceId = deviceId || null;
    throw err;
  }
}

/**
 * Check if ADB is available
 */
export async function isAdbAvailable() {
  try {
    await adbCommand(['version'], { timeout: 5000 });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get connected devices
 */
export async function getConnectedDevices() {
  try {
    const { stdout } = await adbCommand(['devices'], { timeout: 5000 });
    const lines = stdout.split('\n').slice(1); // Skip header

    const devices = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.includes('\t')) continue;

      const [id, status] = trimmed.split('\t');
      if (status !== 'device') continue; // Only include connected devices

      const isEmulator = id.startsWith('emulator-');
      const isWireless = id.includes(':');

      const friendlyInfo = await getDeviceFriendlyInfo(id);

      devices.push({
        id,
        status,
        name: friendlyInfo.friendlyName,
        brand: friendlyInfo.brand,
        model: friendlyInfo.model,
        release: friendlyInfo.osVersion,
        type: isEmulator ? 'emulator' : isWireless ? 'wireless' : 'usb',
        priority: isEmulator ? 3 : isWireless ? 2 : 1 // USB has highest priority
      });
    }

    // Sort by priority (USB first)
    devices.sort((a, b) => a.priority - b.priority);

    return devices;
  } catch (error) {
    console.error('[ADB] Failed to get devices:', error.message);
    return [];
  }
}

/**
 * Check if device is online
 */
export async function isDeviceOnline(deviceId) {
  try {
    await adbCommand(['shell', 'echo', 'test'], {
      deviceId,
      timeout: 3000
    });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get device screen size
 */
export async function getDeviceSize(deviceId = null) {
  try {
    const { stdout } = await adbCommand(['shell', 'wm', 'size'], {
      deviceId,
      timeout: 5000
    });

    // Parse output like "Physical size: 1080x1920"
    const match = stdout.match(/(\d+)x(\d+)/);
    if (!match) {
      throw new Error('Could not parse screen size');
    }

    return {
      width: parseInt(match[1]),
      height: parseInt(match[2])
    };
  } catch (error) {
    throw new Error(`Failed to get device size: ${error.message}`);
  }
}

/**
 * Take device screenshot
 */
export async function takeScreenshot(deviceId = null) {
  let tempPath = null;
  const onDevicePath = '/data/local/tmp/screenshot.png';

  try {
    // 1. Take screenshot on device
    // Try standard screencap
    try {
      await adbCommand(['shell', 'screencap', '-p', onDevicePath], {
        deviceId,
        timeout: 10000
      });
    } catch (screencapError) {
      console.warn(`[ADB] Standard screencap failed: ${screencapError.message}. Trying /sdcard fallback...`);
      // Fallback to /sdcard
      await adbCommand(['shell', 'screencap', '-p', '/sdcard/screenshot.png'], {
        deviceId,
        timeout: 10000
      });
      // Update path if fallback succeeded
      // We'll try to pull from both if needed, but let's assume if it reached here /sdcard worked
    }

    // 2. Pull screenshot from device
    tempPath = path.join(process.cwd(), `temp_screenshot_${Date.now()}.png`);

    try {
      await adbCommand(['pull', onDevicePath, tempPath], {
        deviceId,
        timeout: 10000
      });
    } catch (pullError) {
      // If pull from /data/local/tmp failed, try pulling from /sdcard fallback
      await adbCommand(['pull', '/sdcard/screenshot.png', tempPath], {
        deviceId,
        timeout: 10000
      });
    }

    // 3. Read file as buffer
    if (!fs.existsSync(tempPath)) {
      throw new Error('Screenshot file was not pulled successfully');
    }

    const buffer = fs.readFileSync(tempPath);
    return buffer;
  } catch (error) {
    throw new Error(`Failed to take screenshot: ${error.message}`);
  } finally {
    // Clean up temp file locally
    if (tempPath && fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch (cleanupError) {
        console.warn('[ADB] Failed to cleanup temp screenshot file:', cleanupError.message);
      }
    }
  }
}

/**
 * Send tap to device
 */
export async function tapDevice(x, y, deviceId = null) {
  try {
    if (x == null || y == null) {
      throw new Error("Coordinates x and y are required");
    }
    await adbCommand(['shell', 'input', 'tap', x.toString(), y.toString()], {
      deviceId,
      timeout: 5000
    });

    return { x, y, deviceId };
  } catch (error) {
    throw new Error(`Failed to tap device: ${error.message}`);
  }
}

/**
 * Send text input to device
 */
export async function inputText(text, deviceId = null) {
  try {
    // Escape special characters for shell
    const escapedText = text.replace(/([$`\\])/g, '\\$1');

    await adbCommand(['shell', 'input', 'text', escapedText], {
      deviceId,
      timeout: 5000
    });

    return { text, deviceId };
  } catch (error) {
    throw new Error(`Failed to input text: ${error.message}`);
  }
}

/**
 * Send key event to device
 */
export async function sendKeyEvent(keyCode, deviceId = null) {
  try {
    await adbCommand(['shell', 'input', 'keyevent', keyCode.toString()], {
      deviceId,
      timeout: 5000
    });

    return { keyCode, deviceId };
  } catch (error) {
    throw new Error(`Failed to send key event: ${error.message}`);
  }
}

/**
 * Send swipe to device
 */
export async function swipeDevice(x1, y1, x2, y2, duration = 500, deviceId = null) {
  try {
    await adbCommand(['shell', 'input', 'swipe', x1.toString(), y1.toString(), x2.toString(), y2.toString(), duration.toString()], {
      deviceId,
      timeout: 10000
    });

    return { x1, y1, x2, y2, duration, deviceId };
  } catch (error) {
    throw new Error(`Failed to swipe device: ${error.message}`);
  }
}


export async function getUIHierarchy(deviceId = null) {
  let tempPaths = [];
  const defaultDumpPath = '/sdcard/view.xml';
  const debugDump = process.env.WISPR_UI_DUMP_LOG === '1';
  const cacheTtlMs = parseInt(process.env.WISPR_UI_DUMP_CACHE_TTL_MS || "0", 10) || 0;
  const failBackoffMs = parseInt(process.env.WISPR_UI_DUMP_FAIL_BACKOFF_MS || "600", 10) || 600;
  const key = deviceId || "__default__";

  const disabledUntil = uiHierarchyDisabledUntil.get(key) || 0;
  if (disabledUntil && Date.now() < disabledUntil) {
    const cached = uiHierarchyLast.get(key);
    if (cached?.xml) return cached.xml;
    return null;
  }

  // Serialize hierarchy dumps per device to avoid UiAutomation "already registered" crashes
  if (uiHierarchyInFlight.has(key)) {
    return await uiHierarchyInFlight.get(key);
  }

  // Optional short cache (disabled by default)
  if (cacheTtlMs > 0) {
    const cached = uiHierarchyLast.get(key);
    if (cached && (Date.now() - cached.ts) <= cacheTtlMs) {
      return cached.xml;
    }
  }

  const lastFail = uiHierarchyLastFail.get(key);
  if (lastFail && (Date.now() - lastFail.ts) < failBackoffMs) {
    const cached = uiHierarchyLast.get(key);
    if (cached?.xml) return cached.xml;
    return null;
  }

  const work = (async () => {
    try {
    const readViaExecOut = async () => {
      if (debugDump) console.warn('[ADB] exec-out dump attempt');

      const extractHierarchyXml = (raw) => {
        const s = String(raw || "");
        const start = s.indexOf("<?xml");
        const altStart = s.indexOf("<hierarchy");
        const from = start >= 0 ? start : altStart;
        if (from < 0) return s;
        const endTag = "</hierarchy>";
        const end = s.lastIndexOf(endTag);
        if (end < 0) return s.slice(from);
        return s.slice(from, end + endTag.length);
      };

      try {
        const { stdout } = await adbCommand(['exec-out', 'uiautomator', 'dump', '/dev/tty'], {
          deviceId,
          timeout: 15000
        });
        const cleaned = extractHierarchyXml(stdout);
        if (cleaned && cleaned.includes('<hierarchy')) return cleaned;
        if (debugDump) console.warn('[ADB] exec-out returned empty/invalid XML');
      } catch (e) {
        if (debugDump) console.warn('[ADB] exec-out dump failed', { error: e.message });
      }

      // Try compressed exec-out as a fallback
      if (debugDump) console.warn('[ADB] exec-out dump (compressed) attempt');
      const { stdout: compressedOut } = await adbCommand(['exec-out', 'uiautomator', 'dump', '--compressed', '/dev/tty'], {
        deviceId,
        timeout: 15000
      });
      const cleanedCompressed = extractHierarchyXml(compressedOut);
      if (!cleanedCompressed || !cleanedCompressed.includes('<hierarchy')) {
        throw new Error('exec-out returned empty or invalid XML');
      }
      return cleanedCompressed;
    };

    // 1. Cleanup previous dump on device to ensure fresh state
    try {
      await adbCommand(['shell', 'rm', defaultDumpPath], {
        deviceId,
        timeout: 3000,
        silent: true
      });
    } catch (e) {
      // Ignore if file didn't exist
    }

    const parseDumpPath = (out) => {
      if (!out) return null;
      const match = String(out).match(/dumped to:\s*(\/[\w\/\.\-\_]+\.xml)/i);
      return match ? match[1] : null;
    };

    const runDump = async (useCompressed = false) => {
      const args = useCompressed
        ? ['shell', 'uiautomator', 'dump', '--compressed', defaultDumpPath]
        : ['shell', 'uiautomator', 'dump', defaultDumpPath];
      const { stdout, stderr } = await adbCommand(args, { deviceId, timeout: 15000 });
      const combined = [stdout, stderr].filter(Boolean).join("\n");
      return { dumpPath: parseDumpPath(combined) || defaultDumpPath, combined };
    };

    // 2. First try exec-out (no /sdcard dependency)
    try {
      const xmlExec = await readViaExecOut();
      if (xmlExec) return xmlExec;
    } catch (execErr) {
      if (debugDump) {
        console.warn('[ADB] exec-out dump failed, falling back to /sdcard dump', { error: execErr.message });
      }
    }

    // 3. Dump UI hierarchy to device (fallback)
    let dumpPathUsed = defaultDumpPath;
    try {
      const res = await runDump(false);
      dumpPathUsed = res.dumpPath || defaultDumpPath;
    } catch (dumpError) {
      console.warn(`[ADB] Standard uiautomator dump failed: ${dumpError.message}. Retrying with --compressed...`);
      try {
        const res = await runDump(true);
        dumpPathUsed = res.dumpPath || defaultDumpPath;
      } catch (retryError) {
        // Common on some devices/ROMs when UiAutomation is already held by another tool
        const code = retryError?.code;
        if (code === 137 || /code:\s*137/.test(String(retryError?.message || ""))) {
          uiHierarchyDisabledUntil.set(key, Date.now() + 30_000);
          console.warn(
            "[ADB] UI hierarchy dump is crashing (exit 137). This often happens when UiAutomation is already registered (e.g., an Appium/UiAutomator2 session is active or stuck). " +
            "Try: stop other automation sessions, disconnect/reconnect USB debugging, or reboot the device. " +
            "Temporarily disabling hover inspector can also reduce retries."
          );
        }
        // Fallback: use Appium page source when UiAutomation is locked
        const appiumXml = await tryGetAppiumPageSource();
        if (appiumXml && appiumXml.includes("<hierarchy")) {
          if (debugDump) console.warn("[ADB] Using Appium page source fallback");
          return appiumXml;
        }
        throw new Error(`uiautomator dump failed: ${retryError.message}`);
      }
    }

    const extractHierarchyXml = (raw) => {
      const s = String(raw || "");
      const start = s.indexOf("<?xml");
      const altStart = s.indexOf("<hierarchy");
      const from = start >= 0 ? start : altStart;
      if (from < 0) return s;
      const endTag = "</hierarchy>";
      const end = s.lastIndexOf(endTag);
      if (end < 0) return s.slice(from);
      return s.slice(from, end + endTag.length);
    };

    const readViaPull = async (dumpPath) => {
      const localTemp = path.join(process.cwd(), `temp_view_${Date.now()}_${Math.random().toString(16).slice(2)}.xml`);
      tempPaths.push(localTemp);
      await adbCommand(['pull', dumpPath, localTemp], {
        deviceId,
        timeout: 10000
      });

      if (!fs.existsSync(localTemp)) {
        throw new Error('Failed to pull UI hierarchy file');
      }

      const xml = extractHierarchyXml(fs.readFileSync(localTemp, 'utf-8'));
      if (!xml || xml.trim().length === 0 || !xml.includes('<hierarchy')) {
        throw new Error('Retrieved XML is empty or invalid');
      }
      return xml;
    };

    const readViaCat = async (dumpPath) => {
      const { stdout } = await adbCommand(['shell', 'cat', dumpPath], {
        deviceId,
        timeout: 10000
      });
      const cleaned = extractHierarchyXml(stdout);
      if (!cleaned || !cleaned.includes('<hierarchy')) {
        throw new Error('ADB cat returned empty or invalid XML');
      }
      return cleaned;
    };

    const candidatePaths = [dumpPathUsed, "/sdcard/window_dump.xml"].filter(Boolean);
    const uniqPaths = [];
    for (const p of candidatePaths) {
      if (!uniqPaths.includes(p)) uniqPaths.push(p);
    }

    let lastErr = null;
    for (const dumpPath of uniqPaths) {
      try {
        return await readViaPull(dumpPath);
      } catch (pullError) {
        lastErr = pullError;
        if (debugDump) console.warn('[ADB] Pull failed, falling back to cat', { dumpPath, error: pullError.message });
        try {
          return await readViaCat(dumpPath);
        } catch (catError) {
          lastErr = catError;
          if (debugDump) console.warn('[ADB] Cat failed', { dumpPath, error: catError.message });
        }
      }
    }

    throw lastErr || new Error("Failed to read UI hierarchy dump");
  } catch (error) {
    // Log warning but don't crash - allow fallback to coordinates
    console.warn(`[ADB] Failed to get UI hierarchy (will fallback to coordinates): ${error.message}`);
    return null;
  } finally {
    // Clean up temp file locally
    for (const p of tempPaths) {
      if (!p) continue;
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch (cleanupError) {
        console.warn('[ADB] Failed to cleanup temp XML file:', cleanupError.message);
      }
    }
  }
  })();

  uiHierarchyInFlight.set(key, work);
  try {
    const xml = await work;
    if (xml && typeof xml === "string" && xml.includes("<hierarchy")) {
      uiHierarchyLast.set(key, { xml, ts: Date.now() });
      uiHierarchyLastFail.delete(key);
    } else {
      uiHierarchyLastFail.set(key, { ts: Date.now() });
    }
    return xml;
  } catch (e) {
    uiHierarchyLastFail.set(key, { ts: Date.now() });
    return null;
  } finally {
    uiHierarchyInFlight.delete(key);
  }
}

/**
 * Get device properties
 */
export async function getDeviceProps(deviceId = null) {
  try {
    const { stdout } = await adbCommand(['shell', 'getprop'], {
      deviceId,
      timeout: 5000
    });

    const props = {};
    const lines = stdout.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      const match = trimmed.match(/^\[([^\]]+)\]:\s*\[([^\]]*)\]$/);
      if (match) {
        props[match[1]] = match[2];
      }
    }

    return props;
  } catch (error) {
    console.error(`Failed to get device properties: ${error.message}`);
    return {};
  }
}

/**
 * Get friendly device info
 */
export async function getDeviceFriendlyInfo(deviceId) {
  try {
    const props = await getDeviceProps(deviceId);

    // Check for emulator / AVD name
    if (deviceId.startsWith('emulator-')) {
      const { stdout } = await adbCommand(['-s', deviceId, 'emu', 'avd', 'name'], { timeout: 2000 }).catch(() => ({ stdout: '' }));
      if (stdout.trim()) {
        const avdName = stdout.trim().replace(/[\r\n]/g, '').replace(/_/g, ' ');
        return {
          brand: 'Android',
          model: 'Emulator',
          osVersion: props['ro.build.version.release'] || 'Unknown',
          friendlyName: `${avdName} (Android ${props['ro.build.version.release'] || '?'})`
        };
      }
    }

    // Standard props
    const brand = props['ro.product.brand'] || props['ro.product.manufacturer'] || 'Android';

    // Try to find a friendly model name
    const model = props['ro.config.marketing_name'] ||
      props['ro.product.model.name'] ||
      props['ro.sem.model.name'] ||
      props['ro.product.model'] ||
      deviceId;

    const osVersion = props['ro.build.version.release'] || 'Unknown';

    const capitalizedBrand = brand.charAt(0).toUpperCase() + brand.slice(1);

    // Fallback if results are too generic
    if (brand === 'Android' && model === deviceId) {
      const friendlyName = `${deviceId} (Android ${osVersion})`;
      if (!loggedDevices.has(deviceId)) {
        console.log(`[ADB] Friendly name for ${deviceId} (generic fallback): ${friendlyName}`);
        loggedDevices.add(deviceId);
      }
      return {
        brand,
        model,
        osVersion,
        friendlyName
      };
    }

    const friendlyName = `${capitalizedBrand} ${model} (Android ${osVersion})`.trim();

    if (!loggedDevices.has(deviceId)) {
      console.log(`[ADB] Friendly name for ${deviceId}: ${friendlyName}`);
      loggedDevices.add(deviceId);
    }

    return {
      brand: capitalizedBrand,
      model,
      osVersion,
      friendlyName
    };
  } catch (error) {
    console.error(`[ADB] Failed to get friendly device info for ${deviceId}: ${error.message}`);
    return {
      brand: 'Android',
      model: 'Device',
      osVersion: 'Unknown',
      friendlyName: deviceId
    };
  }
}

/**
 * Install APK on device
 */
export async function installApk(apkPath, deviceId = null) {
  try {
    if (!fs.existsSync(apkPath)) {
      throw new Error('APK file not found');
    }

    await adbCommand(['install', '-r', apkPath], {
      deviceId,
      timeout: 60000 // 60 seconds for installation
    });

    return { apkPath, deviceId };
  } catch (error) {
    throw new Error(`Failed to install APK: ${error.message}`);
  }
}

/**
 * Uninstall app from device
 */
export async function uninstallApp(packageName, deviceId = null) {
  try {
    await adbCommand(['uninstall', packageName], {
      deviceId,
      timeout: 30000
    });

    return { packageName, deviceId };
  } catch (error) {
    throw new Error(`Failed to uninstall app: ${error.message}`);
  }
}

/**
 * Get running processes
 */
export async function getRunningProcesses(deviceId = null) {
  try {
    const { stdout } = await adbCommand(['shell', 'ps'], {
      deviceId,
      timeout: 5000
    });

    const lines = stdout.split('\n').slice(1); // Skip header
    const processes = [];

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 9) {
        processes.push({
          user: parts[0],
          pid: parts[1],
          ppid: parts[2],
          vsize: parts[3],
          rss: parts[4],
          wchan: parts[5],
          pc: parts[6],
          status: parts[7],
          name: parts.slice(8).join(' ')
        });
      }
    }

    return processes;
  } catch (error) {
    console.error(`Failed to get running processes: ${error.message}`);
    return [];
  }
}

/**
 * Kill process on device
 */
export async function killProcess(pid, deviceId = null) {
  try {
    await adbCommand(['shell', 'kill', pid.toString()], {
      deviceId,
      timeout: 5000
    });

    return { pid, deviceId };
  } catch (error) {
    throw new Error(`Failed to kill process: ${error.message}`);
  }
}

/**
 * Get device logs
 */
export async function getDeviceLogs(lines = 100, deviceId = null) {
  try {
    const { stdout } = await adbCommand(['logcat', '-d', '-t', lines.toString()], {
      deviceId,
      timeout: 10000
    });

    return stdout;
  } catch (error) {
    console.error(`Failed to get device logs: ${error.message}`);
    return '';
  }
}

/**
 * Clear device logs
 */
export async function clearDeviceLogs(deviceId = null) {
  try {
    await adbCommand(['logcat', '-c'], {
      deviceId,
      timeout: 5000
    });

    return { deviceId };
  } catch (error) {
    throw new Error(`Failed to clear device logs: ${error.message}`);
  }
}

/**
 * Reboot device
 */
export async function rebootDevice(deviceId = null) {
  try {
    await adbCommand(['reboot'], {
      deviceId,
      timeout: 5000
    });

    return { deviceId };
  } catch (error) {
    throw new Error(`Failed to reboot device: ${error.message}`);
  }
}

/**
 * Clear app data (cache and user data)
 */
export async function clearAppData(packageName, deviceId = null) {
  try {
    const result = await adbCommand(['shell', 'pm', 'clear', packageName], {
      deviceId,
      timeout: 10000
    });

    if (result.stdout.includes('Success')) {
      return { packageName, deviceId };
    } else {
      throw new Error(result.stdout || result.stderr || 'Failed to clear app data');
    }
  } catch (error) {
    throw new Error(`Failed to clear app data for ${packageName}: ${error.message}`);
  }
}

/**
 * Force stop app
 */
export async function forceStopApp(packageName, deviceId = null) {
  try {
    await adbCommand(['shell', 'am', 'force-stop', packageName], {
      deviceId,
      timeout: 10000
    });
    return { packageName, deviceId };
  } catch (error) {
    throw new Error(`Failed to force stop app ${packageName}: ${error.message}`);
  }
}

/**
 * Check if app is installed
 */
export async function isAppInstalled(packageName, deviceId = null) {
  try {
    let resolvedDeviceId = deviceId;
    if (!resolvedDeviceId) {
      const devices = await getConnectedDevices().catch(() => []);
      resolvedDeviceId = devices?.[0]?.id || null;
    }
    const { stdout } = await adbCommand(['shell', 'pm', 'list', 'packages', packageName], {
      deviceId: resolvedDeviceId,
      timeout: 5000
    });
    return stdout.includes(`package:${packageName}`);
  } catch (error) {
    console.error(`[ADB] Error checking if app is installed: ${error.message}`);
    return false;
  }
}

/**
 * Launch app
 */
export async function launchApp(packageName, deviceId = null) {
  try {
    console.log(`[ADB] Attempting to launch app: ${packageName}`);

    // Attempt 1: Using monkey (easy, but sometimes fails)
    try {
      await adbCommand(['shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1'], {
        deviceId,
        timeout: 10000
      });
      return { packageName, deviceId };
    } catch (monkeyError) {
      console.warn(`[ADB] Monkey launch failed for ${packageName}, trying am start...`);
    }

    // Attempt 2: Try to find the launcher activity and use am start
    const { stdout } = await adbCommand(['shell', 'dumpsys', 'package', packageName], {
      deviceId,
      timeout: 5000
    });

    // Look for android.intent.action.MAIN and android.intent.category.LAUNCHER
    // Use a regex to find the activity name
    const mainActivityMatch = stdout.match(/android\.intent\.action\.MAIN:[^]*?([a-zA-Z0-9._/]+)/m);

    if (mainActivityMatch && mainActivityMatch[1]) {
      const activity = mainActivityMatch[1].trim();
      console.log(`[ADB] Found main activity: ${activity}. Launching...`);
      await adbCommand(['shell', 'am', 'start', '-n', activity], {
        deviceId,
        timeout: 10000
      });
      return { packageName, deviceId };
    }

    throw new Error(`Could not find launcher activity for ${packageName}`);
  } catch (error) {
    console.error(`[ADB] Failed to launch app ${packageName}: ${error.message}`);
    throw new Error(`Failed to launch app ${packageName}: ${error.message}`);
  }
}
/**
 * Extract package name from APK using aapt (if available)
 */
export async function extractPackageName(apkPath) {
  try {
    const aaptPath = await findAapt();
    if (!aaptPath) {
      console.warn('[ADB] aapt not found, could not extract package name automatically.');
      return null;
    }

    const { stdout } = await execAsync(`"${aaptPath}" dump badging "${apkPath}"`);
    const match = stdout.match(/package: name='([^']+)'/);
    if (match && match[1]) {
      return match[1];
    }
    return null;
  } catch (error) {
    console.error(`[ADB] Failed to extract package name: ${error.message}`);
    return null;
  }
}

/**
 * Helper to find aapt utility in Android SDK
 */
async function findAapt() {
  try {
    const adbPath = CONFIG.ADB_COMMAND;
    if (!adbPath) return null;

    // Usually adb is in platform-tools, aapt is in build-tools
    const sdkPath = path.dirname(path.dirname(adbPath));
    const buildToolsPath = path.join(sdkPath, 'build-tools');

    if (fs.existsSync(buildToolsPath)) {
      const versions = fs.readdirSync(buildToolsPath);
      // Sort and get latest
      versions.sort().reverse();
      for (const ver of versions) {
        const aapt = path.join(buildToolsPath, ver, 'aapt.exe');
        if (fs.existsSync(aapt)) return aapt;
        const aaptUnix = path.join(buildToolsPath, ver, 'aapt');
        if (fs.existsSync(aaptUnix)) return aaptUnix;
      }
    }

    // Fallback: search in PATH
    try {
      await execAsync('aapt version');
      return 'aapt';
    } catch {
      return null;
    }
  } catch (error) {
    return null;
  }
}

/**
 * Get list of installed packages
 */
export async function getInstalledPackages(deviceId = null, excludeSystem = true) {
  try {
    let resolvedDeviceId = deviceId;
    if (!resolvedDeviceId) {
      const devices = await getConnectedDevices().catch(() => []);
      resolvedDeviceId = devices?.[0]?.id || null;
    }

    const parsePkgList = (raw) => raw
      .split('\n')
      .map(line => String(line).replace('package:', '').trim())
      .filter(pkg => pkg.length > 0);

    // 1) Prefer third-party packages (-3). Some OEM/OS versions can behave oddly, so fall back safely.
    let thirdPartyPkgs = [];
    try {
      const { stdout: pkgListRaw } = await adbCommand(['shell', 'pm', 'list', 'packages', '-3'], {
        deviceId: resolvedDeviceId,
        timeout: 10000
      });
      thirdPartyPkgs = parsePkgList(pkgListRaw);
    } catch {
      thirdPartyPkgs = [];
    }

    if (thirdPartyPkgs.length === 0) {
      try {
        const { stdout: pkgListRaw2 } = await adbCommand(['shell', 'cmd', 'package', 'list', 'packages', '-3'], {
          deviceId: resolvedDeviceId,
          timeout: 10000
        });
        thirdPartyPkgs = parsePkgList(pkgListRaw2);
      } catch {
        thirdPartyPkgs = [];
      }
    }

    // All packages list (used when excludeSystem=false, and as a last resort when -3 is empty).
    let allPkgs = [];
    if (!excludeSystem || thirdPartyPkgs.length === 0) {
      try {
        const { stdout: pkgListRawAll } = await adbCommand(['shell', 'pm', 'list', 'packages'], {
          deviceId: resolvedDeviceId,
          timeout: 15000
        });
        allPkgs = parsePkgList(pkgListRawAll);
      } catch {
        allPkgs = [];
      }
    }

    // Absolute fallback: if -3 is empty, return *something* so the UI can find the app package.
    // This avoids the confusing "No user apps found" when ADB returns an empty -3 list.
    const pkgsToConsider = excludeSystem
      ? (thirdPartyPkgs.length ? thirdPartyPkgs : allPkgs)
      : allPkgs;

    if (pkgsToConsider.length === 0) return [];

    // 2) Best-effort: try to enrich with install time + installer.
    // On some OEM devices `dumpsys package` is extremely large and can exceed Node's exec buffer.
    // If enrichment fails, we still return the package list (sorted) so the UI can proceed.
    let dumpsysRaw = "";
    try {
      const res = await adbCommand(['shell', 'dumpsys', 'package'], {
        deviceId: resolvedDeviceId,
        timeout: 40000,
        maxBuffer: 80 * 1024 * 1024 // allow large OEM outputs
      });
      dumpsysRaw = res.stdout || "";
    } catch (e) {
      return [...pkgsToConsider].sort();
    }

    const installTimes = new Map();
    const installers = new Map();
    const lines = dumpsysRaw.split('\n');
    let currentPkg = null;

    for (const line of lines) {
      const pkgMatch = line.match(/Package \[([^\]]+)\]/);
      if (pkgMatch) {
        currentPkg = pkgMatch[1];
        continue;
      }
      if (currentPkg) {
        if (line.includes('firstInstallTime=')) {
          const timeStr = line.split('=')[1].trim();
          installTimes.set(currentPkg, new Date(timeStr).getTime() || 0);
        } else if (line.includes('installerPackageName=')) {
          const installer = line.split('=')[1].trim();
          installers.set(currentPkg, installer !== 'null' ? installer : null);
        }
      }
    }

    // 3. Filter for external APKs and sort by install time (latest first)
    // NOTE: previous behavior filtered out Play Store installs to focus on side-load/ADB apps.
    // That can hide legitimate user apps (including the user-under-test). We now:
    //   1) prefer the filtered list when it returns results
    //   2) fall back to ALL third-party packages when filtering would produce an empty list
    const sortByInstallTimeDesc = (pkgs) => pkgs
      .map(pkg => ({ name: pkg, time: installTimes.get(pkg) || 0 }))
      .sort((a, b) => b.time - a.time)
      .map(item => item.name);

    const filtered = pkgsToConsider.filter(pkg => {
      const installer = installers.get(pkg);
      // Keep ADB installs (com.android.shell), null installers (likely APK side-load),
      // and anything unknown. Only exclude Play Store by default.
      if (installer === 'com.android.vending') return false;
      return !installer || installer === 'com.android.shell';
    });

    const preferred = filtered.length ? filtered : pkgsToConsider;
    return sortByInstallTimeDesc(preferred);
  } catch (error) {
    console.error('[ADB] Failed to get installed packages:', error.message);
    return [];
  }
}
