/**
 * Emulator Controller
 * Manages Android emulator lifecycle and operations
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config.js';
import processManager from '../utils/process-manager.js';
import { getConnectedDevices } from '../utils/adb-utils.js';

const execAsync = promisify(exec);

class EmulatorController {
  constructor() {
    this.emulatorPath = null;
    this.isRunning = false;
    this.currentAvd = null;
    this.startTime = null;
  }

  /**
   * Initialize emulator controller
   */
  async initialize() {
    console.log('[EmulatorController] Initializing...');

    this.emulatorPath = await this.findEmulatorPath();

    if (!this.emulatorPath) {
      console.warn('[EmulatorController] Emulator executable not found. Some features may not work.');
    } else {
      console.log(`[EmulatorController] Found emulator at: ${this.emulatorPath}`);
    }
  }

  /**
   * Find emulator executable path
   */
  async findEmulatorPath() {
    // Check common locations
    const possiblePaths = [
      'emulator', // In PATH
      ...CONFIG.ANDROID_SDK_PATHS.map(sdkPath =>
        sdkPath ? path.join(sdkPath, 'emulator', 'emulator.exe') : null
      ),
      ...CONFIG.ANDROID_SDK_PATHS.map(sdkPath =>
        sdkPath ? path.join(sdkPath, 'emulator', 'emulator') : null
      ),
      // Windows specific paths
      'C:\\Android\\Sdk\\emulator\\emulator.exe',
      // macOS specific paths
      '/usr/local/share/android-sdk/emulator/emulator',
      '/opt/android-sdk/emulator/emulator',
      // Linux specific paths
      '/usr/local/android-sdk/emulator/emulator',
    ].filter(Boolean);

    for (const emulatorPath of possiblePaths) {
      try {
        await execAsync(`"${emulatorPath}" -version`, { timeout: 5000 });
        return emulatorPath;
      } catch (error) {
        // Continue to next path
      }
    }

    return null;
  }

  /**
   * Get available AVDs
   */
  async getAvailableAvds() {
    if (!this.emulatorPath) {
      console.warn('[EmulatorController] Emulator path not found, cannot list AVDs');
      return [];
    }

    try {
      const { stdout } = await execAsync(`"${this.emulatorPath}" -list-avds`, {
        timeout: CONFIG.COMMAND_TIMEOUT
      });

      const avds = stdout.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      return avds;
    } catch (error) {
      console.error('[EmulatorController] Failed to list AVDs:', error.message);
      return [];
    }
  }

  /**
   * Check if emulator is running
   */
  async isEmulatorRunning(avd = null) {
    try {
      const devices = await getConnectedDevices();
      const emulators = devices.filter(d => d.type === 'emulator');

      if (avd) {
        // Check specific AVD
        return emulators.some(emu => emu.id.includes(avd));
      }

      // Check if any emulator is running
      return emulators.length > 0;
    } catch (error) {
      console.error('[EmulatorController] Failed to check emulator status:', error.message);
      return false;
    }
  }

  /**
   * Start emulator
   */
  async start(avd = null) {
    if (!this.emulatorPath) {
      throw new Error('Emulator executable not found. Please ensure Android SDK is installed.');
    }

    if (this.isRunning) {
      console.log('[EmulatorController] Emulator is already running');
      return true;
    }

    try {
      console.log(`[EmulatorController] Starting emulator${avd ? ` with AVD: ${avd}` : ''}...`);

      // Determine AVD to use
      let targetAvd = avd;
      if (!targetAvd) {
        const availableAvds = await this.getAvailableAvds();
        if (availableAvds.length > 0) {
          targetAvd = availableAvds[0];
          console.log(`[EmulatorController] Using default AVD: ${targetAvd}`);
        } else {
          throw new Error('No AVDs available. Please create an Android Virtual Device first.');
        }
      }

      // Prepare command arguments
      const args = ['-avd', targetAvd];

      // Add additional options for better performance and compatibility
      args.push(
        '-no-audio',           // Disable audio
        '-no-window',          // Run headless (can be changed if UI is needed)
        '-gpu', 'swiftshader_indirect', // Software rendering
        '-qemu', '-enable-kvm' // Enable KVM on Linux for better performance
      );

      // Start the emulator process
      await processManager.startProcess('emulator', this.emulatorPath, args);

      this.isRunning = true;
      this.currentAvd = targetAvd;
      this.startTime = Date.now();

      // Wait for emulator to be ready
      await this.waitForEmulatorReady(targetAvd);

      console.log(`[EmulatorController] Emulator started successfully: ${targetAvd}`);
      return true;

    } catch (error) {
      console.error('[EmulatorController] Failed to start emulator:', error.message);
      this.isRunning = false;
      this.currentAvd = null;
      throw error;
    }
  }

  /**
   * Stop emulator
   */
  async stop() {
    if (!this.isRunning) {
      return true;
    }

    try {
      console.log('[EmulatorController] Stopping emulator...');

      await processManager.stopProcess('emulator');

      this.isRunning = false;
      this.currentAvd = null;
      this.startTime = null;

      console.log('[EmulatorController] Emulator stopped');
      return true;

    } catch (error) {
      console.error('[EmulatorController] Failed to stop emulator:', error.message);
      throw error;
    }
  }

  /**
   * Wait for emulator to be ready
   */
  async waitForEmulatorReady(avd, timeout = CONFIG.STARTUP_TIMEOUT) {
    const startTime = Date.now();
    const expectedDeviceId = `emulator-${5554 + (await this.getAvailableAvds()).indexOf(avd)}`;

    console.log(`[EmulatorController] Waiting for emulator ${expectedDeviceId} to be ready...`);

    while (Date.now() - startTime < timeout) {
      try {
        const devices = await getConnectedDevices();
        const emulator = devices.find(d =>
          d.type === 'emulator' &&
          (d.id === expectedDeviceId || d.id.includes(avd))
        );

        if (emulator) {
          // Additional check: try to execute a simple command
          try {
            await execAsync(`adb -s ${emulator.id} shell echo "ready"`, { timeout: 5000 });
            console.log(`[EmulatorController] Emulator ${emulator.id} is ready`);
            return true;
          } catch (cmdError) {
            // Emulator exists but not fully ready yet
          }
        }
      } catch (error) {
        // Continue waiting
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new Error(`Emulator did not become ready within ${timeout}ms`);
  }

  /**
   * Get emulator status
   */
  async getStatus() {
    try {
      const devices = await getConnectedDevices();
      const emulators = devices.filter(d => d.type === 'emulator');

      return {
        running: emulators.length > 0,
        emulators: emulators.map(e => e.id),
        totalEmulators: emulators.length,
        currentAvd: this.currentAvd,
        uptime: this.startTime ? Date.now() - this.startTime : null
      };
    } catch (error) {
      console.error('[EmulatorController] Failed to get status:', error.message);
      return {
        running: false,
        emulators: [],
        totalEmulators: 0,
        currentAvd: null,
        error: error.message
      };
    }
  }

  /**
   * Create AVD (basic implementation)
   */
  async createAvd(name, target = 'android-29') {
    if (!this.emulatorPath) {
      throw new Error('Emulator executable not found');
    }

    try {
      console.log(`[EmulatorController] Creating AVD: ${name}`);

      const avdManagerPath = this.emulatorPath.replace('emulator', 'avdmanager');

      await execAsync(`"${avdManagerPath}" create avd -n ${name} -k ${target}`, {
        timeout: 30000,
        input: 'no\n' // Answer 'no' to custom hardware profile
      });

      console.log(`[EmulatorController] AVD created: ${name}`);
      return true;

    } catch (error) {
      console.error(`[EmulatorController] Failed to create AVD ${name}:`, error.message);
      throw error;
    }
  }

  /**
   * Delete AVD
   */
  async deleteAvd(name) {
    if (!this.emulatorPath) {
      throw new Error('Emulator executable not found');
    }

    try {
      console.log(`[EmulatorController] Deleting AVD: ${name}`);

      const avdManagerPath = this.emulatorPath.replace('emulator', 'avdmanager');

      await execAsync(`"${avdManagerPath}" delete avd -n ${name}`, {
        timeout: 10000
      });

      console.log(`[EmulatorController] AVD deleted: ${name}`);
      return true;

    } catch (error) {
      console.error(`[EmulatorController] Failed to delete AVD ${name}:`, error.message);
      throw error;
    }
  }

  /**
   * Get emulator logs
   */
  async getLogs(lines = 50) {
    // This would require access to emulator log files
    // Simplified implementation
    return {
      available: false,
      message: 'Log access not implemented yet'
    };
  }

  /**
   * Send command to emulator console
   */
  async sendConsoleCommand(command) {
    if (!this.currentAvd) {
      throw new Error('No emulator is currently running');
    }

    try {
      const telnetPort = 5554 + (await this.getAvailableAvds()).indexOf(this.currentAvd);
      // This would require telnet connection to emulator console
      // Simplified for now
      console.log(`[EmulatorController] Console command not implemented: ${command}`);
      return false;
    } catch (error) {
      console.error('[EmulatorController] Console command failed:', error.message);
      throw error;
    }
  }

  /**
   * Clean shutdown
   */
  async shutdown() {
    await this.stop();
  }
}

export const emulatorController = new EmulatorController();
export default emulatorController;
