import { EventEmitter } from 'events';
import { CONFIG } from '../config.js';
import { adbCommand } from '../utils/adb-utils.js';
import deviceController from '../controllers/device-controller.js';

export class ReplayEngine extends EventEmitter {
  constructor() {
    super();
    this.isReplaying = false;
    this.currentStepIndex = 0;
    this.steps = [];
    this.deviceId = null;
  }

  async startReplay(steps, deviceId) {
    if (this.isReplaying) {
      throw new Error('Replay already in progress');
    }

    this.isReplaying = true;
    this.currentStepIndex = 0;
    this.steps = steps;
    this.deviceId = deviceId;

    this.emit('replay-started', { steps: steps.length, deviceId });

    try {
      for (let i = 0; i < steps.length; i++) {
        this.currentStepIndex = i;
        const step = steps[i];

        this.emit('step-started', { stepIndex: i, step });

        await this.executeStep(step);

        this.emit('step-completed', { stepIndex: i, step });
      }

      this.emit('replay-completed', { totalSteps: steps.length });
    } catch (error) {
      this.emit('replay-error', { error: error.message, stepIndex: this.currentStepIndex });
      throw error;
    } finally {
      this.isReplaying = false;
    }
  }

  async executeStep(step) {
    const { type, locator, value, coordinates } = step;

    switch (type) {
      case 'tap':
        await this.executeTapStep(coordinates);
        break;
      case 'input':
        await this.executeInputStep(locator, value);
        break;
      case 'scroll':
        await this.executeScrollStep(coordinates);
        break;
      case 'wait':
        await this.executeWaitStep(value);
        break;
      case 'assert':
        await this.executeAssertStep(locator, value);
        break;
      default:
        throw new Error(`Unknown step type: ${type}`);
    }
  }

  async executeTapStep(coordinates) {
    try {
      if (!coordinates || typeof coordinates.x !== 'number' || typeof coordinates.y !== 'number') {
        throw new Error(`Invalid coordinates provided: ${JSON.stringify(coordinates)}`);
      }
      const { x, y } = coordinates;
      await adbCommand(`-s ${this.deviceId} shell input tap ${x} ${y}`);
    } catch (error) {
      console.error(`Error executing tap step at coordinates ${coordinates?.x},${coordinates?.y}:`, error.message);
      throw new Error(`Failed to execute tap step: ${error.message}`);
    }
  }

  async executeInputStep(locator, value) {
    try {
      // Find the element coordinates from UI hierarchy
      const coordinates = await this.findElementCoordinates(locator);
      if (!coordinates) {
        throw new Error(`Element not found for locator: ${locator}`);
      }

      // Tap the element first
      await this.executeTapStep(coordinates);

      // Wait a bit for focus
      await new Promise(resolve => setTimeout(resolve, 500));

      // Input the text
      await adbCommand(`-s ${this.deviceId} shell input text "${value.replace(/"/g, '\\"')}"`);
    } catch (error) {
      console.error(`Error executing input step for locator ${locator}:`, error.message);
      throw new Error(`Failed to execute input step: ${error.message}`);
    }
  }

  async executeScrollStep(coordinates) {
    try {
      if (!coordinates || typeof coordinates.x !== 'number' || typeof coordinates.y !== 'number' ||
          typeof coordinates.endX !== 'number' || typeof coordinates.endY !== 'number') {
        throw new Error(`Invalid scroll coordinates provided: ${JSON.stringify(coordinates)}`);
      }
      const { x, y, endX, endY } = coordinates;
      await adbCommand(`-s ${this.deviceId} shell input swipe ${x} ${y} ${endX} ${endY} 500`);
    } catch (error) {
      console.error(`Error executing scroll step from (${coordinates?.x},${coordinates?.y}) to (${coordinates?.endX},${coordinates?.endY}):`, error.message);
      throw new Error(`Failed to execute scroll step: ${error.message}`);
    }
  }

  async executeWaitStep(milliseconds) {
    await new Promise(resolve => setTimeout(resolve, milliseconds));
  }

  async executeAssertStep(locator, expectedValue) {
    // Find the element and check its properties
    const element = await this.findElement(locator);
    if (!element) {
      this.emit('assertion-result', { locator, expectedValue, success: false, error: 'Element not found' });
      return;
    }

    // For now, check if element exists (basic assertion)
    // In a real implementation, you'd check text, visibility, etc.
    const success = element !== null;

    this.emit('assertion-result', { locator, expectedValue, success, element });
  }

  /**
   * Find element coordinates from UI hierarchy using locator
   */
  async findElementCoordinates(locator) {
    try {
      if (!this.deviceId) {
        throw new Error('No device ID set for replay engine');
      }

      const xml = await deviceController.getUIHierarchy(this.deviceId);
      if (!xml || typeof xml !== 'string') {
        throw new Error('Invalid or empty UI hierarchy XML received');
      }

      const element = this.parseXmlForElement(xml, locator);
      if (!element) {
        console.warn(`Element not found for locator: ${locator}`);
        return null;
      }

      if (!element.bounds) {
        console.warn(`Element found but missing bounds for locator: ${locator}`);
        return null;
      }

      // Parse bounds like "[0,0][1080,1920]" to get center coordinates
      const boundsMatch = element.bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
      if (!boundsMatch) {
        console.warn(`Invalid bounds format for locator ${locator}: ${element.bounds}`);
        return null;
      }

      const [, x1, y1, x2, y2] = boundsMatch.map(Number);
      if (x1 >= x2 || y1 >= y2) {
        console.warn(`Invalid bounds dimensions for locator ${locator}: [${x1},${y1}][${x2},${y2}]`);
        return null;
      }

      return {
        x: Math.floor((x1 + x2) / 2),
        y: Math.floor((y1 + y2) / 2)
      };
    } catch (error) {
      console.error(`Error finding element coordinates for locator ${locator}:`, error.message);
      return null;
    }
  }

  /**
   * Find element from UI hierarchy using locator
   */
  async findElement(locator) {
    try {
      const xml = await deviceController.getUIHierarchy(this.deviceId);
      return this.parseXmlForElement(xml, locator);
    } catch (error) {
      console.error('Error finding element:', error.message);
      return null;
    }
  }

  /**
   * Parse XML to find element by locator
   */
  parseXmlForElement(xml, locator) {
    // Split XML into node declarations
    const nodeRegex = /<node[^>]*>/g;
    const nodes = xml.match(nodeRegex) || [];

    for (const nodeStr of nodes) {
      const attrs = this.parseNodeAttributes(nodeStr);

      // Check different locator strategies
      if (attrs['resource-id'] === locator) {
        return {
          locator,
          found: true,
          type: 'resource-id',
          bounds: attrs.bounds,
          text: attrs.text,
          class: attrs.class,
          clickable: attrs.clickable === 'true',
          enabled: attrs.enabled === 'true'
        };
      }

      if (attrs.text === locator) {
        return {
          locator,
          found: true,
          type: 'text',
          bounds: attrs.bounds,
          resourceId: attrs['resource-id'],
          class: attrs.class,
          clickable: attrs.clickable === 'true',
          enabled: attrs.enabled === 'true'
        };
      }

      if (attrs['content-desc'] === locator) {
        return {
          locator,
          found: true,
          type: 'content-desc',
          bounds: attrs.bounds,
          text: attrs.text,
          class: attrs.class,
          clickable: attrs.clickable === 'true',
          enabled: attrs.enabled === 'true'
        };
      }
    }

    // For coordinates-based locator like "x,y" (fallback)
    if (/^\d+,\d+$/.test(locator)) {
      const [x, y] = locator.split(',').map(Number);
      return {
        locator,
        found: true,
        type: 'coordinates',
        coordinates: { x, y },
        bounds: `[${x},${y}][${x},${y}]` // Point bounds
      };
    }

    return null;
  }

  /**
   * Parse node attributes from XML node string
   */
  parseNodeAttributes(nodeStr) {
    const attrs = {};
    const attrRegex = /(\w+)="([^"]*)"/g;
    let match;

    while ((match = attrRegex.exec(nodeStr)) !== null) {
      attrs[match[1]] = match[2];
    }

    return attrs;
  }

  stopReplay() {
    this.isReplaying = false;
    this.emit('replay-stopped');
  }

  getStatus() {
    return {
      isReplaying: this.isReplaying,
      currentStepIndex: this.currentStepIndex,
      totalSteps: this.steps.length,
      deviceId: this.deviceId
    };
  }
}

export default ReplayEngine;
