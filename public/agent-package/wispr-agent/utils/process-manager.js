/**
 * Process Manager Utility
 * Manages background processes with safe startup and shutdown
 */

import { spawn } from 'child_process';
import { CONFIG } from '../config.js';

class ProcessManager {
  constructor() {
    this.processes = new Map();
    this.isShuttingDown = false;
  }

  /**
   * Start a background process
   */
  async startProcess(name, command, args = [], options = {}) {
    if (this.isShuttingDown) {
      throw new Error('Agent is shutting down');
    }

    // Kill existing process if running
    await this.stopProcess(name);

    return new Promise((resolve, reject) => {
      const defaultOptions = {
        detached: true,
        stdio: 'pipe', // Change to pipe to capture output
        windowsHide: true,
        ...options
      };

      const child = spawn(command, args, defaultOptions);

      if (child.stdout) {
        child.stdout.on('data', (data) => console.log(`[${name}] ${data.toString().trim()}`));
      }
      if (child.stderr) {
        child.stderr.on('data', (data) => console.error(`[${name}] ERROR: ${data.toString().trim()}`));
      }

      // Store process info
      this.processes.set(name, {
        process: child,
        command,
        args,
        startTime: Date.now(),
        pid: child.pid
      });

      child.on('error', (err) => {
        console.error(`[${name}] Process error:`, err.message);
        this.processes.delete(name);
        reject(err);
      });

      child.on('exit', (code, signal) => {
        console.log(`[${name}] Process exited with code ${code}, signal ${signal}`);
        this.processes.delete(name);
      });

      // Assume success after short delay
      setTimeout(() => {
        if (this.processes.has(name)) {
          resolve(child);
        }
      }, 1000);

      child.unref();
    });
  }

  /**
   * Stop a background process
   */
  async stopProcess(name) {
    const procInfo = this.processes.get(name);
    if (!procInfo) return false;

    return new Promise((resolve) => {
      try {
        if (process.platform === 'win32') {
          // On Windows, kill the process tree
          spawn('taskkill', ['/pid', procInfo.pid, '/t', '/f'], { stdio: 'ignore' });
        } else {
          // On Unix-like systems
          process.kill(-procInfo.pid, 'SIGTERM');
        }

        // Wait a bit then force kill if still running
        setTimeout(() => {
          try {
            process.kill(procInfo.pid, 'SIGKILL');
          } catch (e) {
            // Process already dead
          }
          resolve(true);
        }, 5000);

      } catch (err) {
        console.error(`Error stopping ${name}:`, err.message);
        resolve(false);
      }
    });
  }

  /**
   * Check if a process is running
   */
  isRunning(name) {
    return this.processes.has(name);
  }

  /**
   * Get process info
   */
  getProcessInfo(name) {
    return this.processes.get(name);
  }

  /**
   * Get all running processes
   */
  getAllProcesses() {
    return Array.from(this.processes.keys());
  }

  /**
   * Stop all processes
   */
  async stopAll() {
    this.isShuttingDown = true;
    const promises = Array.from(this.processes.keys()).map(name =>
      this.stopProcess(name)
    );
    await Promise.all(promises);
    this.processes.clear();
  }

  /**
   * Cleanup on exit
   */
  setupCleanup() {
    const cleanup = async () => {
      console.log('Cleaning up processes...');
      await this.stopAll();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', () => this.stopAll());
  }
}

export const processManager = new ProcessManager();
export default processManager;
