import { EventEmitter } from 'events';
import { CONFIG } from '../config.js';
import { adbCommand, tapDevice, inputText, swipeDevice, launchApp, sendKeyEvent } from '../utils/adb-utils.js';
import deviceController from '../controllers/device-controller.js';

export class ReplayEngine extends EventEmitter {
  constructor() {
    super();
    this.isReplaying = false;
    this.currentStepIndex = 0;
    this.steps = [];
    this.deviceId = null;
  }

  async startReplay(steps, deviceId, startIndex = 0) {
    if (this.isReplaying) {
      throw new Error('Replay already in progress');
    }

    this.isReplaying = true;
    this.currentStepIndex = startIndex;
    this.steps = steps;
    this.deviceId = deviceId;

    this.emit('replay-started', { steps: steps.length, deviceId, startIndex });

    try {
      for (let i = startIndex; i < steps.length; i++) {
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
        await this.executeTapStep(step);
        break;
      case 'input':
        await this.executeInputStep(step);
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
      case 'openApp':
        await this.executeOpenAppStep(step);
        break;
      case 'hideKeyboard':
        await this.executeHideKeyboardStep(step);
        break;
      case 'pressKey':
        await this.executePressKeyStep(value);
        break;
      case 'longPress':
        await this.executeLongPressStep(step);
        break;
      default:
        throw new Error(`Unknown step type: ${type}`);
    }
  }

  async executeLongPressStep(step) {
    const { coordinates, elementId, elementText, elementClass, elementContentDesc } = step;
    try {
      // 1. Try self-healing first if we have metadata
      let targetCoords = coordinates;
      if (elementId || elementText || elementContentDesc) {
        const foundElement = await this.findBestMatchingElement({
          elementId, elementText, elementClass, elementContentDesc
        });

        if (foundElement && foundElement.coordinates) {
          console.log(`[Self-Healing] Found element for long press with score ${foundElement.score}.`);
          targetCoords = foundElement.coordinates;
        }
      }

      if (!targetCoords || typeof targetCoords.x !== 'number' || typeof targetCoords.y !== 'number') {
        throw new Error(`Invalid coordinates for long press: ${JSON.stringify(targetCoords)}`);
      }

      // Perform long press (swipe at same point with duration)
      await swipeDevice(targetCoords.x, targetCoords.y, targetCoords.x, targetCoords.y, 1000, this.deviceId);
    } catch (error) {
      console.error(`Error executing long press step:`, error.message);
      throw new Error(`Failed to execute long press step: ${error.message}`);
    }
  }

  async executeTapStep(step) {
    const { coordinates, elementId, elementText, elementClass, elementContentDesc } = step;
    try {
      // 1. Try self-healing first if we have metadata
      let targetCoords = coordinates;
      if (elementId || elementText || elementContentDesc) {
        const foundElement = await this.findBestMatchingElement({
          elementId, elementText, elementClass, elementContentDesc
        });

        if (foundElement && foundElement.coordinates) {
          console.log(`[Self-Healing] Found element with score ${foundElement.score}. Updating coordinates.`);
          targetCoords = foundElement.coordinates;
        }
      }

      if (!targetCoords || typeof targetCoords.x !== 'number' || typeof targetCoords.y !== 'number') {
        throw new Error(`Invalid coordinates and self-healing failed: ${JSON.stringify(targetCoords)}`);
      }

      // VALIDATION: Check if we need to hide keyboard first (Auto-Retry Logic)
      try {
        await tapDevice(targetCoords.x, targetCoords.y, this.deviceId);
      } catch (tapError) {
        console.warn(`[Replay] Tap failed: ${tapError.message}. Attempting to hide keyboard and retry...`);

        // Try hiding keyboard
        await deviceController.hideKeyboard(this.deviceId);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for animation

        // Retry tap
        await tapDevice(targetCoords.x, targetCoords.y, this.deviceId);
      }
    } catch (error) {
      console.error(`Error executing tap step:`, error.message);
      throw new Error(`Failed to execute tap step: ${error.message}`);
    }
  }

  async executeHideKeyboardStep(step) {
    try {
      await deviceController.hideKeyboard(this.deviceId);
      // Wait for keyboard animation
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Error executing hideKeyboard step:`, error.message);
      // Don't fail the test if just hiding keyboard fails (might be already hidden)
    }
  }

  async executeInputStep(step) {
    const { locator, value, coordinates, elementId, elementText, elementClass, elementContentDesc } = step;
    try {
      // 1. Try self-healing first if we have metadata
      let targetCoords = coordinates;
      if (elementId || elementText || elementContentDesc) {
        const foundElement = await this.findBestMatchingElement({
          elementId, elementText, elementClass, elementContentDesc
        });

        if (foundElement && foundElement.coordinates) {
          console.log(`[Self-Healing] Found element for input with score ${foundElement.score}.`);
          targetCoords = foundElement.coordinates;
        }
      }

      // 2. Fallback to locator search if still no coords
      if (locator && (!targetCoords || !targetCoords.x)) {
        targetCoords = await this.findElementCoordinates(locator);
      }

      // 2b. Final fallback: if we have no target but the app already has focus (common when a tap
      // step occurred immediately before), still attempt to type. This keeps older recordings
      // from hard-failing when metadata is missing.
      if (!targetCoords || typeof targetCoords.x !== 'number' || typeof targetCoords.y !== 'number') {
        if (typeof value === 'string' && value.length > 0) {
          console.warn(`[Replay] Input step missing target (locator/coords). Sending keys to current focus as fallback.`);
          await inputText(value, this.deviceId);
          return;
        }
        throw new Error(`Target coordinates or locator ${locator} not found for input step`);
      }

      // 3. Tap to focus
      await tapDevice(targetCoords.x, targetCoords.y, this.deviceId);

      // 4. Wait for focus
      await new Promise(resolve => setTimeout(resolve, 500));

      // 5. Input text using the helper
      await inputText(value, this.deviceId);
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
      await swipeDevice(x, y, endX, endY, 500, this.deviceId);
    } catch (error) {
      console.error(`Error executing scroll step from (${coordinates?.x},${coordinates?.y}) to (${coordinates?.endX},${coordinates?.endY}):`, error.message);
      throw new Error(`Failed to execute scroll step: ${error.message}`);
    }
  }

  async executePressKeyStep(keyCode) {
    try {
      if (!keyCode) {
        throw new Error("No KeyCode provided for pressKey step");
      }
      await sendKeyEvent(keyCode, this.deviceId);
    } catch (error) {
      console.error(`Error executing pressKey step for code ${keyCode}:`, error.message);
      throw new Error(`Failed to execute pressKey step: ${error.message}`);
    }
  }

  async executeWaitStep(milliseconds) {
    const delay = parseInt(milliseconds, 10) || 1000;
    await new Promise(resolve => setTimeout(resolve, delay));
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

  async executeOpenAppStep(step) {
    const { value: packageName } = step;
    try {
      if (!packageName) throw new Error("Package name is required for openApp step");
      await launchApp(packageName, this.deviceId);
      // Wait for app to launch
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error) {
      console.error(`Error executing openApp step for ${packageName}:`, error.message);
      throw new Error(`Failed to open app: ${error.message}`);
    }
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
   * Enhanced element matching using scoring for self-healing
   */
  async findBestMatchingElement(metadata) {
    try {
      const xml = await deviceController.getUIHierarchy(this.deviceId);
      const nodeRegex = /<node[^>]*>/g;
      const nodes = xml.match(nodeRegex) || [];

      let bestMatch = null;
      let highestScore = 0;

      for (const nodeStr of nodes) {
        const attrs = this.parseNodeAttributes(nodeStr);
        let score = 0;

        if (metadata.elementId && attrs['resource-id'] === metadata.elementId) score += 100;
        if (metadata.elementContentDesc && attrs['content-desc'] === metadata.elementContentDesc) score += 80;
        if (metadata.elementText && attrs.text === metadata.elementText) score += 60;
        if (metadata.elementClass && attrs.class === metadata.elementClass) score += 10;

        if (score > highestScore) {
          highestScore = score;
          bestMatch = attrs;
        }
      }

      // Threshold for a valid match
      if (highestScore < 50) return null;

      const boundsMatch = bestMatch.bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
      if (!boundsMatch) return null;

      const [, x1, y1, x2, y2] = boundsMatch.map(Number);
      return {
        attributes: bestMatch,
        score: highestScore,
        coordinates: {
          x: Math.floor((x1 + x2) / 2),
          y: Math.floor((y1 + y2) / 2)
        }
      };
    } catch (error) {
      console.error('Error in self-healing search:', error.message);
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
