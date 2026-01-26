/**
 * Screenshot Service
 * Manages device screenshots and streaming
 */

import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import deviceController from '../controllers/device-controller.js';
import { CONFIG } from '../config.js';

class ScreenshotService extends EventEmitter {
  constructor() {
    super();
    this.isStreaming = false;
    this.streamInterval = null;
    this.lastScreenshot = null;
    this.screenshotDir = path.join(process.cwd(), 'screenshots');

    // Ensure screenshots directory exists
    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir, { recursive: true });
    }
  }

  /**
   * Take a single screenshot
   */
  async takeScreenshot(deviceId = null, filename = null) {
    try {
      const screenshotBuffer = await deviceController.takeScreenshot(deviceId);

      if (!filename) {
        filename = `screenshot_${Date.now()}.png`;
      }

      const filepath = path.join(this.screenshotDir, filename);
      fs.writeFileSync(filepath, screenshotBuffer);

      const screenshot = {
        filename,
        filepath,
        timestamp: Date.now(),
        size: screenshotBuffer.length,
        deviceId: deviceId || deviceController.getPrimaryDevice()?.id
      };

      this.lastScreenshot = screenshot;

      console.log(`[ScreenshotService] Screenshot saved: ${filename}`);

      this.emit('screenshot-taken', screenshot);

      return screenshot;

    } catch (error) {
      console.error('[ScreenshotService] Failed to take screenshot:', error.message);
      throw error;
    }
  }

  /**
   * Start screenshot streaming
   */
  async startStreaming(interval = 1000, deviceId = null) {
    if (this.isStreaming) {
      throw new Error('Screenshot streaming is already active');
    }

    this.isStreaming = true;

    console.log(`[ScreenshotService] Starting screenshot streaming (interval: ${interval}ms)`);

    this.emit('streaming-started', { interval, deviceId });

    this.streamInterval = setInterval(async () => {
      try {
        if (!this.isStreaming) return;

        const screenshot = await this.takeScreenshot(deviceId);
        this.emit('screenshot-stream', screenshot);

      } catch (error) {
        console.error('[ScreenshotService] Streaming error:', error.message);
        this.emit('streaming-error', { error: error.message });
      }
    }, interval);
  }

  /**
   * Stop screenshot streaming
   */
  stopStreaming() {
    if (!this.isStreaming) {
      return false;
    }

    this.isStreaming = false;

    if (this.streamInterval) {
      clearInterval(this.streamInterval);
      this.streamInterval = null;
    }

    console.log('[ScreenshotService] Stopped screenshot streaming');

    this.emit('streaming-stopped');

    return true;
  }

  /**
   * Get streaming status
   */
  getStreamingStatus() {
    return {
      streaming: this.isStreaming,
      interval: this.streamInterval ? 1000 : null, // Default interval
      lastScreenshot: this.lastScreenshot
    };
  }

  /**
   * Get screenshot by filename
   */
  getScreenshot(filename) {
    const filepath = path.join(this.screenshotDir, filename);

    if (!fs.existsSync(filepath)) {
      return null;
    }

    const stats = fs.statSync(filepath);
    const buffer = fs.readFileSync(filepath);

    return {
      filename,
      filepath,
      buffer,
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime
    };
  }

  /**
   * List all screenshots
   */
  listScreenshots() {
    try {
      const files = fs.readdirSync(this.screenshotDir)
        .filter(file => file.endsWith('.png'))
        .map(filename => {
          const filepath = path.join(this.screenshotDir, filename);
          const stats = fs.statSync(filepath);

          return {
            filename,
            filepath,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime
          };
        })
        .sort((a, b) => b.created - a.created); // Newest first

      return files;

    } catch (error) {
      console.error('[ScreenshotService] Failed to list screenshots:', error.message);
      return [];
    }
  }

  /**
   * Delete screenshot
   */
  deleteScreenshot(filename) {
    const filepath = path.join(this.screenshotDir, filename);

    if (!fs.existsSync(filepath)) {
      return false;
    }

    try {
      fs.unlinkSync(filepath);
      console.log(`[ScreenshotService] Deleted screenshot: ${filename}`);
      return true;
    } catch (error) {
      console.error(`[ScreenshotService] Failed to delete ${filename}:`, error.message);
      return false;
    }
  }

  /**
   * Clean old screenshots
   */
  cleanScreenshots(maxAge = 24 * 60 * 60 * 1000, maxCount = 100) { // 24 hours, 100 files
    const files = this.listScreenshots();

    // Remove old files
    const cutoff = Date.now() - maxAge;
    const oldFiles = files.filter(file => file.created < cutoff);

    oldFiles.forEach(file => {
      this.deleteScreenshot(file.filename);
    });

    // Remove excess files if still too many
    if (files.length - oldFiles.length > maxCount) {
      const excessFiles = files
        .slice(maxCount)
        .filter(file => file.created >= cutoff); // Don't delete recent files

      excessFiles.forEach(file => {
        this.deleteScreenshot(file.filename);
      });
    }

    console.log(`[ScreenshotService] Cleaned ${oldFiles.length} old screenshots`);
  }

  /**
   * Get screenshot as base64
   */
  getScreenshotAsBase64(filename) {
    const screenshot = this.getScreenshot(filename);
    if (!screenshot) {
      return null;
    }

    return {
      filename: screenshot.filename,
      base64: screenshot.buffer.toString('base64'),
      size: screenshot.size,
      created: screenshot.created
    };
  }

  /**
   * Compare screenshots (basic implementation)
   */
  compareScreenshots(filename1, filename2) {
    const shot1 = this.getScreenshot(filename1);
    const shot2 = this.getScreenshot(filename2);

    if (!shot1 || !shot2) {
      return null;
    }

    // Basic comparison - same size means potentially same image
    // Real implementation would use image diff libraries
    const sameSize = shot1.size === shot2.size;
    const sizeDiff = Math.abs(shot1.size - shot2.size);

    return {
      filename1,
      filename2,
      sameSize,
      sizeDiff,
      potentiallyIdentical: sameSize,
      note: 'Basic size comparison only - use image diff library for pixel comparison'
    };
  }

  /**
   * Setup periodic cleanup
   */
  setupPeriodicCleanup(interval = 60 * 60 * 1000) { // 1 hour
    setInterval(() => {
      this.cleanScreenshots();
    }, interval);
  }

  /**
   * Get service stats
   */
  getStats() {
    const screenshots = this.listScreenshots();

    return {
      totalScreenshots: screenshots.length,
      totalSize: screenshots.reduce((sum, s) => sum + s.size, 0),
      oldestScreenshot: screenshots.length > 0 ? screenshots[screenshots.length - 1].created : null,
      newestScreenshot: screenshots.length > 0 ? screenshots[0].created : null,
      streaming: this.isStreaming,
      screenshotDir: this.screenshotDir
    };
  }
}

export const screenshotService = new ScreenshotService();
export default screenshotService;
