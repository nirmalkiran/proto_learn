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
  getDeviceProps
} from '../utils/adb-utils.js';
import { CONFIG } from '../config.js';
import { parseStringPromise } from 'xml2js';

class DeviceController {
  constructor() {
    this.connectedDevices = [];
    this.primaryDevice = null;
  }

  /**
   * Helper to find element at coordinates (x, y) from hierarchy object
   */
  _findElementAt(x, y, node) {
    if (!node) return null;

    let foundElement = null;

    // Check if the current node has bounds and contains (x, y)
    if (node.$ && node.$.bounds) {
      const bounds = node.$.bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
      if (bounds) {
        const x1 = parseInt(bounds[1], 10);
        const y1 = parseInt(bounds[2], 10);
        const x2 = parseInt(bounds[3], 10);
        const y2 = parseInt(bounds[4], 10);

        if (x >= x1 && x <= x2 && y >= y1 && y <= y2) {
          foundElement = {
            resourceId: node.$['resource-id'] || '',
            text: node.$.text || '',
            class: node.$.class || '',
            contentDesc: node.$['content-desc'] || '',
            bounds: node.$.bounds
          };
        }
      }
    }

    // Recursively check children
    if (node.node) {
      const children = Array.isArray(node.node) ? node.node : [node.node];
      for (const child of children) {
        const result = this._findElementAt(x, y, child);
        if (result) {
          // Keep the deepest (most specific) element
          foundElement = result;
        }
      }
    }

    return foundElement;
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
      console.log('[DeviceController] Initialized with', this.connectedDevices.length, 'devices');
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
    const targetDevice = deviceId || this.primaryDevice?.id;
    if (!targetDevice) {
      throw new Error('No device connected');
    }

    return await getDeviceSize(targetDevice);
  }

  /**
   * Take device screenshot
   */
  async takeScreenshot(deviceId = null) {
    const targetDevice = deviceId || this.primaryDevice?.id;
    if (!targetDevice) {
      throw new Error('No device connected');
    }

    return await takeScreenshot(targetDevice);
  }

  /**
   * Send tap to device and return element metadata
   */
  async tap(x, y, deviceId = null) {
    const targetDevice = deviceId || this.primaryDevice?.id;
    if (!targetDevice) {
      throw new Error('No device connected');
    }

    let elementMetadata = null;

    try {
      // Get UI Hierarchy to find element at coordinates
      const xml = await getUIHierarchy(targetDevice);
      if (xml) {
        const result = await parseStringPromise(xml);
        // Hierarchy object structure: hierarchy -> node (root)
        if (result && result.hierarchy && result.hierarchy.node) {
          elementMetadata = this._findElementAt(x, y, result.hierarchy.node[0]);
        }
      }
    } catch (error) {
      console.warn('[DeviceController] Failed to get/parse UI Hierarchy for tap:', error.message);
    }

    // Perform the actual tap
    await tapDevice(x, y, targetDevice);

    return {
      x,
      y,
      deviceId: targetDevice,
      element: elementMetadata
    };
  }

  /**
   * Send text input to device
   */
  async input(text, deviceId = null) {
    const targetDevice = deviceId || this.primaryDevice?.id;
    if (!targetDevice) {
      throw new Error('No device connected');
    }

    await inputText(text, targetDevice);
    return { text, deviceId: targetDevice };
  }

  /**
   * Get UI hierarchy
   */
  async getUIHierarchy(deviceId = null) {
    const targetDevice = deviceId || this.primaryDevice?.id;
    if (!targetDevice) {
      throw new Error('No device connected');
    }

    return await getUIHierarchy(targetDevice);
  }

  /**
   * Get device properties
   */
  async getProperties(deviceId = null) {
    const targetDevice = deviceId || this.primaryDevice?.id;
    if (!targetDevice) {
      return {};
    }

    return await getDeviceProps(targetDevice);
  }

  /**
   * Check if device is ready for automation
   */
  async isDeviceReady(deviceId = null) {
    const targetDevice = deviceId || this.primaryDevice?.id;
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
}

export const deviceController = new DeviceController();
export default deviceController;
