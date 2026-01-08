/**
 * Appium Controller
 * Manages Appium server lifecycle and status
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { CONFIG } from '../config.js';
import processManager from '../utils/process-manager.js';

const execAsync = promisify(exec);

class AppiumController {
  constructor() {
    this.isRunning = false;
    this.version = null;
    this.startTime = null;
  }

  /**
   * Check if Appium is installed and get version
   */
  async checkInstallation() {
    try {
      const { stdout } = await execAsync(`${CONFIG.APPIUM_COMMAND} --version`, {
        timeout: CONFIG.COMMAND_TIMEOUT
      });
      this.version = stdout.trim();
      return { installed: true, version: this.version };
    } catch (error) {
      return { installed: false, error: error.message };
    }
  }

  /**
   * Check if Appium server is running
   */
  async isServerRunning() {
    try {
      // Try to connect to Appium server
      const response = await fetch(`http://${CONFIG.HOST}:${CONFIG.APPIUM_PORT}/status`, {
        signal: AbortSignal.timeout(2000)
      });
      const data = await response.json();
      return data.ready || false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Start Appium server
   */
  async start() {
    if (this.isRunning) {
      console.log('[AppiumController] Appium is already running');
      return true;
    }

    try {
      console.log('[AppiumController] Starting Appium server...');

      // Check installation first
      const installCheck = await this.checkInstallation();
      if (!installCheck.installed) {
        throw new Error(`Appium is not installed: ${installCheck.error}`);
      }

      // Prepare command and arguments
      let command, args;
      if (process.platform === 'win32') {
        command = 'cmd';
        args = ['/c', CONFIG.APPIUM_COMMAND,
                '--address', CONFIG.HOST,
                '--port', CONFIG.APPIUM_PORT.toString(),
                '--base-path', '/wd/hub',
                '--log-level', 'info'];
      } else {
        command = CONFIG.APPIUM_COMMAND;
        args = ['--address', CONFIG.HOST,
                '--port', CONFIG.APPIUM_PORT.toString(),
                '--base-path', '/wd/hub',
                '--log-level', 'info'];
      }

      // Start the process
      await processManager.startProcess('appium', command, args);

      // Wait for server to be ready
      await this.waitForServer();

      this.isRunning = true;
      this.startTime = Date.now();

      console.log(`[AppiumController] Appium server started on port ${CONFIG.APPIUM_PORT}`);
      return true;

    } catch (error) {
      console.error('[AppiumController] Failed to start Appium:', error.message);
      throw error;
    }
  }

  /**
   * Stop Appium server
   */
  async stop() {
    if (!this.isRunning) {
      return true;
    }

    try {
      console.log('[AppiumController] Stopping Appium server...');

      await processManager.stopProcess('appium');

      this.isRunning = false;
      this.startTime = null;

      console.log('[AppiumController] Appium server stopped');
      return true;

    } catch (error) {
      console.error('[AppiumController] Failed to stop Appium:', error.message);
      throw error;
    }
  }

  /**
   * Restart Appium server
   */
  async restart() {
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    return await this.start();
  }

  /**
   * Wait for Appium server to be ready
   */
  async waitForServer(timeout = CONFIG.STARTUP_TIMEOUT) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await this.isServerRunning()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error(`Appium server did not start within ${timeout}ms`);
  }

  /**
   * Get Appium server status
   */
  async getStatus() {
    const running = await this.isServerRunning();
    const installCheck = await this.checkInstallation();

    return {
      running,
      installed: installCheck.installed,
      version: installCheck.installed ? this.version : null,
      port: CONFIG.APPIUM_PORT,
      host: CONFIG.HOST,
      uptime: this.startTime ? Date.now() - this.startTime : null,
      basePath: '/wd/hub'
    };
  }

  /**
   * Get Appium server logs (if available)
   */
  async getLogs(lines = 50) {
    // This would require log file access, simplified for now
    return {
      available: false,
      message: 'Log access not implemented yet'
    };
  }

  /**
   * Clean shutdown
   */
  async shutdown() {
    await this.stop();
  }
}

export const appiumController = new AppiumController();
export default appiumController;
