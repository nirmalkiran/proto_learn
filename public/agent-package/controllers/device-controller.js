/**
 * Device Controller
 * Manages ADB device connections and operations
 */

import {
  isAdbAvailable,
  getConnectedDevices,
  getDeviceSize,
  takeScreenshot,
  tapDevice,
  inputText,
  getUIHierarchy,
  isDeviceOnline,
  clearAppData,
  forceStopApp,
  isAppInstalled,
  launchApp,
  uninstallApp,
  sendKeyEvent,
  swipeDevice
} from '../utils/adb-utils.js';
import { CONFIG } from '../config.js';
import { parseStringPromise } from 'xml2js';
import fs from 'fs';
import os from 'os';
import path from 'path';

class DeviceController {
  constructor() {
    this.connectedDevices = [];
    this.primaryDevice = null;
    this._uiCache = { xml: null, parsed: null, ts: 0 };
    this._uiCacheTtlMs = 1500;
  }

  async _resolveTargetDeviceId(deviceId = null) {
    await this.refreshDevices().catch(() => { });

    if (deviceId && this.connectedDevices.some(d => d.id === deviceId)) {
      return deviceId;
    }

    const primaryId = this.primaryDevice?.id || null;
    if (!primaryId) {
      throw new Error('No device connected');
    }

    if (deviceId && deviceId !== primaryId) {
      console.warn(`[DeviceController] Requested device '${deviceId}' not found. Falling back to '${primaryId}'.`);
    }

    return primaryId;
  }

  _extractNodeMeta(node) {
    if (!node || !node.$) return null;
    return {
      resourceId: node.$['resource-id'] || '',
      text: node.$.text || '',
      class: node.$.class || '',
      contentDesc: node.$['content-desc'] || '',
      bounds: node.$.bounds || '',
      clickable: node.$.clickable || '',
      enabled: node.$.enabled || '',
      focusable: node.$.focusable || '',
      focused: node.$.focused || '',
      editable: node.$.editable || '',
      scrollable: node.$.scrollable || '',
      visibleToUser: node.$['visible-to-user'] || '',
      package: node.$.package || ''
    };
  }

  _parseBounds(boundsStr) {
    if (!boundsStr) return null;
    const match = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (!match) return null;
    const x1 = parseInt(match[1], 10);
    const y1 = parseInt(match[2], 10);
    const x2 = parseInt(match[3], 10);
    const y2 = parseInt(match[4], 10);
    return { x1, y1, x2, y2, area: Math.max(0, (x2 - x1) * (y2 - y1)) };
  }

  _pickBestCandidate(current, candidate) {
    if (!current) return candidate;

    const currentVisible = current.visibleToUser === 'true';
    const candidateVisible = candidate.visibleToUser === 'true';
    if (candidateVisible && !currentVisible) return candidate;
    if (!candidateVisible && currentVisible) return current;

    const currentInteractive = current.clickable === 'true' || current.focusable === 'true' || current.editable === 'true';
    const candidateInteractive = candidate.clickable === 'true' || candidate.focusable === 'true' || candidate.editable === 'true';
    if (candidateInteractive && !currentInteractive) return candidate;
    if (!candidateInteractive && currentInteractive) return current;

    if (candidate.area < current.area) return candidate;
    if (candidate.area > current.area) return current;

    const currentQuality = (current.resourceId ? 3 : 0) + (current.contentDesc ? 2 : 0) + (current.text ? 1 : 0);
    const candidateQuality = (candidate.resourceId ? 3 : 0) + (candidate.contentDesc ? 2 : 0) + (candidate.text ? 1 : 0);
    if (candidateQuality > currentQuality) return candidate;
    if (candidateQuality < currentQuality) return current;

    if (candidate.depth > current.depth) return candidate;
    return current;
  }

  /**
   * Helper to find element at coordinates (x, y) from hierarchy object
   */
  _findElementAt(x, y, node, opts = {}) {
    if (!node) return opts.best || null;

    const tolerance = opts.tolerance ?? 6;
    const depth = opts.depth ?? 0;
    let best = opts.best || null;

    const bounds = this._parseBounds(node.$?.bounds);
    if (bounds) {
      const inBounds =
        x >= (bounds.x1 - tolerance) &&
        x <= (bounds.x2 + tolerance) &&
        y >= (bounds.y1 - tolerance) &&
        y <= (bounds.y2 + tolerance);

      if (inBounds) {
        const meta = this._extractNodeMeta(node);
        if (meta) {
          best = this._pickBestCandidate(best, { ...meta, area: bounds.area, depth });
        }
      }
    }

    if (node.node) {
      const children = Array.isArray(node.node) ? node.node : [node.node];
      for (const child of children) {
        best = this._findElementAt(x, y, child, { tolerance, depth: depth + 1, best }) || best;
      }
    }

    return best;
  }

  _distanceToBounds(x, y, bounds) {
    const dx = x < bounds.x1 ? (bounds.x1 - x) : (x > bounds.x2 ? (x - bounds.x2) : 0);
    const dy = y < bounds.y1 ? (bounds.y1 - y) : (y > bounds.y2 ? (y - bounds.y2) : 0);
    return Math.hypot(dx, dy);
  }

  _findNearestElement(x, y, node, opts = {}) {
    if (!node) return opts.best || null;

    const radius = opts.radius ?? 24;
    const depth = opts.depth ?? 0;
    let best = opts.best || null;

    const bounds = this._parseBounds(node.$?.bounds);
    if (bounds) {
      const distance = this._distanceToBounds(x, y, bounds);
      if (distance <= radius) {
        const meta = this._extractNodeMeta(node);
        if (meta) {
          const candidate = { ...meta, distance, depth };
          if (!best) {
            best = candidate;
          } else {
            const bestInteractive = best.clickable === 'true' || best.focusable === 'true' || best.editable === 'true';
            const candInteractive = candidate.clickable === 'true' || candidate.focusable === 'true' || candidate.editable === 'true';
            if (candInteractive && !bestInteractive) best = candidate;
            else if (distance < best.distance) best = candidate;
          }
        }
      }
    }

    if (node.node) {
      const children = Array.isArray(node.node) ? node.node : [node.node];
      for (const child of children) {
        best = this._findNearestElement(x, y, child, { radius, depth: depth + 1, best }) || best;
      }
    }

    return best;
  }

  async _getUiHierarchySnapshot(deviceId, forceFresh = true) {
    const now = Date.now();

    if (!forceFresh && this._uiCache.xml && now - this._uiCache.ts < this._uiCacheTtlMs) {
      return { xml: this._uiCache.xml, fromCache: true };
    }

    const xml = await getUIHierarchy(deviceId);
    if (xml && xml.includes('<hierarchy')) {
      this._uiCache = { xml, parsed: null, ts: now };
      return { xml, fromCache: false };
    }

    if (this._uiCache.xml && now - this._uiCache.ts < this._uiCacheTtlMs * 2) {
      return { xml: this._uiCache.xml, fromCache: true };
    }

    return { xml: null, fromCache: false };
  }

  _escapeXpathValue(value) {
    if (value == null) return "";
    return String(value);
  }

  _xpathLiteral(value) {
    const s = this._escapeXpathValue(value);
    if (!s.includes('"')) return `"${s}"`;
    if (!s.includes("'")) return `'${s}'`;

    const parts = s.split('"');
    const concatParts = [];
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].length) concatParts.push(`"${parts[i]}"`);
      if (i !== parts.length - 1) concatParts.push(`'"'`);
    }
    return `concat(${concatParts.join(", ")})`;
  }

  _buildXPath(meta) {
    if (!meta) return '';

    const clauses = [];
    if (meta.class) clauses.push(`@class=${this._xpathLiteral(meta.class)}`);

    if (meta.resourceId) clauses.push(`@resource-id=${this._xpathLiteral(meta.resourceId)}`);
    else if (meta.contentDesc) clauses.push(`@content-desc=${this._xpathLiteral(meta.contentDesc)}`);
    else if (meta.text) clauses.push(`@text=${this._xpathLiteral(meta.text)}`);

    if (!clauses.length) return '';
    return `//*[${clauses.join(" and ")}]`;
  }

  /**
   * Return element metadata at coordinates without performing an action.
   * Useful for recording (input focus) and script generation.
   */
  async getElementAt(x, y, deviceId = null) {
    try {
      const targetDevice = await this._resolveTargetDeviceId(deviceId);
      const deviceInfo = this.connectedDevices.find(d => d.id === targetDevice);

      const resolveFromXml = async (label) => {
        const { xml, fromCache } = await this._getUiHierarchySnapshot(targetDevice, true);
        if (!xml) {
          console.warn('[DeviceController] UI hierarchy missing', { deviceId: targetDevice, fromCache, x, y, label });
          return null;
        }

        const nodeCount = (xml.match(/<node /g) || []).length;
        const result = await parseStringPromise(xml);
        if (!result || !result.hierarchy || !result.hierarchy.node) {
          console.warn('[DeviceController] UI hierarchy parse failed', { deviceId: targetDevice, nodeCount, fromCache, label });
          return null;
        }

        const root = result.hierarchy.node[0];
        const best = this._findElementAt(x, y, root, { tolerance: 8 });
        if (best) return best;

        const nearest = this._findNearestElement(x, y, root, { radius: 28 });
        if (nearest) return nearest;

        const xmlSnippet = xml.slice(0, 200);
        if (process.env.WISPR_UI_SNAPSHOT === '1') {
          try {
            const filePath = path.join(os.tmpdir(), `ui_dump_${Date.now()}.xml`);
            fs.writeFileSync(filePath, xml);
            console.warn('[DeviceController] UI snapshot saved', { filePath, deviceId: targetDevice });
          } catch (e) {
            console.warn('[DeviceController] Failed to save UI snapshot', { error: e.message });
          }
        }

        console.warn('[DeviceController] No element match for point', {
          deviceId: targetDevice,
          deviceType: deviceInfo?.type,
          x,
          y,
          nodeCount,
          fromCache,
          label,
          xmlSnippet
        });
        return null;
      };

      const first = await resolveFromXml("fresh");
      if (first) return first;

      await new Promise(resolve => setTimeout(resolve, 120));
      return await resolveFromXml("retry");
    } catch (error) {
      console.warn('[DeviceController] Failed to get/parse UI Hierarchy:', error.message);
      return null;
    }
  }


  /**
   * Initialize device controller
   */
  async initialize() {
    console.log('[DeviceController] Initializing...');

    try {
      if (!(await isAdbAvailable())) {
        console.warn('[DeviceController] ADB is not available. Please ensure Android SDK is installed and ADB is in PATH. Continuing without ADB support.');
        this.connectedDevices = [];
        this.primaryDevice = null;
        return;
      }

      await this.refreshDevices();
      if (this.connectedDevices.length > 0) {
        const names = this.connectedDevices.map(d => `\x1b[32m${d.name || d.id}\x1b[0m`).join(', ');
        console.log(`[DeviceController] Initialized with ${this.connectedDevices.length} device(s): ${names}`);
      } else {
        console.log('[DeviceController] Initialized with 0 devices');
      }
    } catch (error) {
      console.warn('[DeviceController] Failed to initialize ADB:', error.message, '. Continuing without ADB support.');
      this.connectedDevices = [];
      this.primaryDevice = null;
    }
  }

  /**
   * Refresh connected devices list
   */
  async refreshDevices() {
    try {
      this.connectedDevices = await getConnectedDevices();

      // Set primary device (prefer USB over wireless, physical over emulator)
      if (this.connectedDevices.length > 0) {
        this.primaryDevice = this.connectedDevices[0]; // Already sorted by priority in adb-utils
      } else {
        this.primaryDevice = null;
      }

      return this.connectedDevices;
    } catch (error) {
      console.error('[DeviceController] Failed to refresh devices:', error.message);
      this.connectedDevices = [];
      this.primaryDevice = null;
      throw error;
    }
  }

  /**
   * Get device status
   */
  async getStatus() {
    await this.refreshDevices();

    // Get online status for all devices
    const devicesWithOnline = await Promise.all(
      this.connectedDevices.map(async (d) => ({
        id: d.id,
        name: d.name,
        brand: d.brand,
        model: d.model,
        release: d.release,
        type: d.type,
        status: d.status,
        online: await isDeviceOnline(d.id).catch(() => false)
      }))
    );

    return {
      connected: this.connectedDevices.length > 0,
      devices: devicesWithOnline,
      primaryDevice: this.primaryDevice?.id || null,
      deviceCount: this.connectedDevices.length
    };
  }

  /**
   * Get device screen size
   */
  async getScreenSize(deviceId = null) {
    const targetDevice = await this._resolveTargetDeviceId(deviceId);

    return await getDeviceSize(targetDevice);
  }

  /**
   * Take device screenshot
   */
  async takeScreenshot(deviceId = null) {
    const targetDevice = await this._resolveTargetDeviceId(deviceId);

    return await takeScreenshot(targetDevice);
  }

  /**
   * Send tap to device and return element metadata
   */
  async tap(x, y, deviceId = null) {
    const targetDevice = await this._resolveTargetDeviceId(deviceId);

    const elementMetadata = await this.getElementAt(x, y, targetDevice);

    // Perform the actual tap
    await tapDevice(x, y, targetDevice);

    return {
      x,
      y,
      deviceId: targetDevice,
      element: elementMetadata,
      xpath: this._buildXPath(elementMetadata)
    };
  }

  /**
   * Send long press to device and return element metadata
   */
  async longPress(x, y, duration = 1000, deviceId = null) {
    const targetDevice = await this._resolveTargetDeviceId(deviceId);

    const elementMetadata = await this.getElementAt(x, y, targetDevice);

    // Perform the actual long press (swipe with same start and end coordinates)
    await swipeDevice(x, y, x, y, duration, targetDevice);

    return {
      x,
      y,
      duration,
      deviceId: targetDevice,
      element: elementMetadata,
      xpath: this._buildXPath(elementMetadata)
    };
  }

  /**
   * Send text input to device
   */
  async input(text, deviceId = null) {
    const targetDevice = await this._resolveTargetDeviceId(deviceId);

    await inputText(text, targetDevice);
    return { text, deviceId: targetDevice };
  }

  /**
   * Send swipe to device
   */
  async swipe(x1, y1, x2, y2, duration = 500, deviceId = null) {
    const targetDevice = await this._resolveTargetDeviceId(deviceId);
    return await swipeDevice(x1, y1, x2, y2, duration, targetDevice);
  }

  /**
   * Send key event to device
   */
  async pressKey(keyCode, deviceId = null) {
    const targetDevice = await this._resolveTargetDeviceId(deviceId);
    return await sendKeyEvent(keyCode, targetDevice);
  }

  /**
   * Get UI hierarchy
   */
  async getUIHierarchy(deviceId = null) {
    const targetDevice = await this._resolveTargetDeviceId(deviceId);

    return await getUIHierarchy(targetDevice);
  }

  /**
   * Get device properties
   */
  async getProperties(deviceId = null) {
    const targetDevice = await this._resolveTargetDeviceId(deviceId).catch(() => null);
    if (!targetDevice) {
      return {};
    }

    return await getDeviceProps(targetDevice);
  }

  /**
   * Check if device is ready for automation
   */
  async isDeviceReady(deviceId = null) {
    const targetDevice = await this._resolveTargetDeviceId(deviceId).catch(() => null);
    if (!targetDevice) {
      return false;
    }

    try {
      const online = await isDeviceOnline(targetDevice);
      if (!online) return false;

      // Additional checks can be added here
      // e.g., check if screen is unlocked, etc.

      return true;
    } catch (error) {
      console.error('[DeviceController] Device readiness check failed:', error.message);
      return false;
    }
  }

  /**
   * Get primary device info
   */
  getPrimaryDevice() {
    return this.primaryDevice;
  }

  /**
   * Get all connected devices
   */
  getConnectedDevices() {
    return this.connectedDevices;
  }

  /**
   * Clear app data
   */
  async clearApp(packageName, deviceId = null) {
    const targetDevice = await this._resolveTargetDeviceId(deviceId);
    return await clearAppData(packageName, targetDevice);
  }

  /**
   * Force stop app
   */
  async stopApp(packageName, deviceId = null) {
    const targetDevice = await this._resolveTargetDeviceId(deviceId);
    return await forceStopApp(packageName, targetDevice);
  }

  /**
   * Check if app is installed
   */
  async isInstalled(packageName, deviceId = null) {
    const targetDevice = await this._resolveTargetDeviceId(deviceId).catch(() => null);
    if (!targetDevice) return false;
    return await isAppInstalled(packageName, targetDevice);
  }

  /**
   * Launch app
   */
  async openApp(packageName, deviceId = null) {
    const targetDevice = await this._resolveTargetDeviceId(deviceId);
    return await launchApp(packageName, targetDevice);
  }

  /**
   * Hide keyboard
   */
  async hideKeyboard(deviceId = null) {
    const targetDevice = await this._resolveTargetDeviceId(deviceId);

    // Send KEYCODE_BACK (4) to dismiss keyboard
    const { adbCommand } = await import('../utils/adb-utils.js');
    await adbCommand(['shell', 'input', 'keyevent', '4'], {
      deviceId: targetDevice,
      timeout: 3000
    });

    return { deviceId: targetDevice };
  }

  /**
   * Run arbitrary shell command
   */
  async shell(command, deviceId = null) {
    const targetDevice = await this._resolveTargetDeviceId(deviceId);

    const { adbCommand } = await import('../utils/adb-utils.js');
    return await adbCommand(['shell', command], {
      deviceId: targetDevice,
      timeout: 10000
    });
  }

  /**
   * Uninstall app
   */
  async uninstall(packageName, deviceId = null) {
    const targetDevice = await this._resolveTargetDeviceId(deviceId);
    return await uninstallApp(packageName, targetDevice);
  }
}

export const deviceController = new DeviceController();
export default deviceController;
