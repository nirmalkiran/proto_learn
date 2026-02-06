import { EventEmitter } from 'events';
import { CONFIG } from '../config.js';
import { adbCommand, tapDevice, inputText, swipeDevice, launchApp, sendKeyEvent } from '../utils/adb-utils.js';
import deviceController from '../controllers/device-controller.js';
import crypto from "crypto";
import { parseHierarchyNodesFast } from "../utils/ui-hierarchy-fast.js";
import { LocatorHealingEngine } from "./locator-healing-engine.js";

export class ReplayEngine extends EventEmitter {
  constructor() {
    super();
    this.isReplaying = false;
    this.currentStepIndex = 0;
    this.steps = [];
    this.deviceId = null;
    this.healingEngine = new LocatorHealingEngine({});
    this.options = {
      screenSettleDelayMs: 0,
      strict: true,
      stepTimeoutMs: 7000,
      pollMs: 250,
      verifyUiChange: true,
      failOnNoChange: true,
      uiChangeTimeoutMs: 2500,
      postActionDelayMs: 150
    };
  }

  _hashXml(xml) {
    return crypto.createHash("sha1").update(String(xml || "")).digest("hex");
  }

  async _getUiXml({ stabilize = false } = {}) {
    if (!stabilize) return await deviceController.getUIHierarchy(this.deviceId);

    const pollMs = parseInt(process.env.WISPR_STABILIZE_POLL_MS || "200", 10) || 200;
    const timeoutMs = parseInt(process.env.WISPR_STABILIZE_TIMEOUT_MS || "3000", 10) || 3000;
    const stableReads = parseInt(process.env.WISPR_STABILIZE_STABLE_READS || "2", 10) || 2;

    const start = Date.now();
    let lastHash = null;
    let stableCount = 0;
    let lastXml = null;

    while (Date.now() - start < timeoutMs) {
      const xml = await deviceController.getUIHierarchy(this.deviceId);
      if (xml && typeof xml === "string") {
        const h = this._hashXml(xml);
        if (h === lastHash) stableCount += 1;
        else stableCount = 1;
        lastHash = h;
        lastXml = xml;
        if (stableCount >= stableReads) return xml;
      }
      await new Promise(r => setTimeout(r, pollMs));
    }

    return lastXml;
  }

  _candidateListFromBundle(locatorBundle) {
    if (!locatorBundle) return [];
    const primary = locatorBundle.primary ? [locatorBundle.primary] : [];
    const fallbacks = Array.isArray(locatorBundle.fallbacks) ? locatorBundle.fallbacks : [];
    return [...primary, ...fallbacks].filter(Boolean);
  }

  _locatorStringForCandidate(candidate) {
    if (!candidate) return "";
    const strategy = candidate.strategy;
    const value = candidate.value;
    if (!value) return "";
    if (strategy === "xpath") return value;
    // Our XML parser supports plain strings for resource-id / content-desc / text already.
    return value;
  }

  async _resolveCoordsFromLocatorBundle(step) {
    const candidates = this._candidateListFromBundle(step.locatorBundle);
    if (!candidates.length) return null;

    const xml = await this._getUiXml({ stabilize: true });
    if (!xml) return null;

    for (const c of candidates) {
      const locator = this._locatorStringForCandidate(c);
      if (!locator) continue;
      const coords = await this._coordsFromLocator(xml, c.strategy, locator);
      if (coords) return { coords, used: c };
    }
    return null;
  }

  async _coordsFromLocator(xml, strategy, locator) {
    const element = this._parseXmlForElementByStrategy(xml, strategy, locator);
    if (!element?.bounds) return null;
    const boundsMatch = element.bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (!boundsMatch) return null;
    const [, x1, y1, x2, y2] = boundsMatch.map(Number);
    if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
    return { x: Math.floor((x1 + x2) / 2), y: Math.floor((y1 + y2) / 2) };
  }

  _parseXmlForElementByStrategy(xml, strategy, locator) {
    const value = String(locator || "");
    if (!xml || typeof xml !== "string" || !value) return null;
    const st = String(strategy || "");

    if (st === "xpath") return this.parseXmlForElement(xml, value);
    if (/^\d+,\d+$/.test(value) && st === "coordinates") return this.parseXmlForElement(xml, value);

    const nodeRegex = /<node[^>]*>/g;
    const nodes = xml.match(nodeRegex) || [];

    for (const nodeStr of nodes) {
      const attrs = this.parseNodeAttributes(nodeStr);
      if (st === "id" && attrs["resource-id"] === value) return { locator: value, found: true, type: "resource-id", bounds: attrs.bounds, text: attrs.text, class: attrs.class };
      if (st === "accessibilityId" && attrs["content-desc"] === value) return { locator: value, found: true, type: "content-desc", bounds: attrs.bounds, text: attrs.text, class: attrs.class };
      if (st === "text") {
        if (attrs.text === value) return { locator: value, found: true, type: "text", bounds: attrs.bounds, text: attrs.text, class: attrs.class };
        if (value.length > 20 && String(attrs.text || "").includes(value)) return { locator: value, found: true, type: "text", bounds: attrs.bounds, text: attrs.text, class: attrs.class };
      }
    }

    return null;
  }

  async startReplay(steps, deviceId, startIndex = 0, options = {}) {
    if (this.isReplaying) {
      throw new Error('Replay already in progress');
    }

    this.isReplaying = true;
    this.currentStepIndex = startIndex;
    this.steps = steps;
    this.deviceId = deviceId;
    this.options = {
      ...this.options,
      ...(options || {}),
      screenSettleDelayMs: parseInt(options?.screenSettleDelayMs || "0", 10) || 0,
      strict: options?.strict !== false,
      stepTimeoutMs: parseInt(options?.stepTimeoutMs || process.env.WISPR_REPLAY_STEP_TIMEOUT_MS || "7000", 10) || 7000,
      pollMs: parseInt(options?.pollMs || process.env.WISPR_REPLAY_POLL_MS || "250", 10) || 250,
      verifyUiChange: options?.verifyUiChange !== false,
      failOnNoChange: options?.failOnNoChange !== false,
      uiChangeTimeoutMs: parseInt(options?.uiChangeTimeoutMs || process.env.WISPR_REPLAY_UI_CHANGE_TIMEOUT_MS || "2500", 10) || 2500,
      postActionDelayMs: parseInt(options?.postActionDelayMs || process.env.WISPR_REPLAY_POST_ACTION_DELAY_MS || "150", 10) || 150
    };

    this.emit('replay-started', { steps: steps.length, deviceId, startIndex });

    try {
      for (let i = startIndex; i < steps.length; i++) {
        if (!this.isReplaying) {
          throw new Error("Replay stopped by user");
        }
        this.currentStepIndex = i;
        const step = steps[i];

        this.emit('step-started', { stepIndex: i, step });

        const stepStart = Date.now();
        await this.executeStep(step);
        const duration = Date.now() - stepStart;

        this.emit('step-completed', { stepIndex: i, step, duration });
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
    const verifyTypes = new Set(["tap", "input", "scroll", "pressKey", "openApp", "longPress"]);
    const shouldVerifyChange = this.options?.verifyUiChange && verifyTypes.has(type);
    let preHash = null;

    if (shouldVerifyChange) {
      const preXml = await this._getUiXml({ stabilize: true });
      if (preXml && typeof preXml === "string") {
        preHash = this._hashXml(preXml);
      }
    }

    if (this.options?.screenSettleDelayMs > 0) {
      await new Promise(r => setTimeout(r, this.options.screenSettleDelayMs));
    }

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

    if (shouldVerifyChange && preHash) {
      if (this.options?.postActionDelayMs > 0) {
        await new Promise(r => setTimeout(r, this.options.postActionDelayMs));
      }
      const changed = await this._waitForUiChange(preHash);
      if (!changed) {
        this.emit('step-no-change', { step, stepIndex: this.currentStepIndex });
        if (this.options?.failOnNoChange) {
          throw new Error(`UI did not change after ${type} step`);
        }
      }
    }
  }

  async _waitForUiChange(previousHash) {
    if (!previousHash) return false;
    const timeoutMs = this.options?.uiChangeTimeoutMs || 2500;
    const pollMs = this.options?.pollMs || 250;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      if (!this.isReplaying) return false;
      const xml = await this._getUiXml({ stabilize: true });
      if (xml && typeof xml === "string") {
        const nextHash = this._hashXml(xml);
        if (nextHash && nextHash !== previousHash) return true;
      }
      await new Promise(r => setTimeout(r, pollMs));
    }
    return false;
  }

  _hasNonCoordinateLocator(step) {
    if (step?.locatorBundle?.primary?.value) return true;
    if (step?.xpath) return true;
    if (step?.smartXPath) return true;
    if (step?.locatorStrategy && step.locatorStrategy !== "coordinates" && step.locator) return true;
    if (step?.elementId || step?.elementText || step?.elementContentDesc) return true;
    return false;
  }

  _candidatesFromStep(step) {
    const out = [];
    const push = (strategy, value, score = 0) => {
      const v = String(value || "");
      if (!v) return;
      const key = `${strategy}:${v}`;
      if (out.some(x => `${x.strategy}:${x.value}` === key)) return;
      out.push({ strategy, value: v, score });
    };

    const lb = step?.locatorBundle;
    if (lb?.primary?.strategy && lb?.primary?.value) push(lb.primary.strategy, lb.primary.value, lb.primary.score || 90);
    if (Array.isArray(lb?.fallbacks)) {
      for (const f of lb.fallbacks) {
        if (f?.strategy && f?.value) push(f.strategy, f.value, f.score || 50);
      }
    }

    // Back-compat: explicit strategy
    if (step?.locatorStrategy && step?.locator && step.locatorStrategy !== "") {
      push(step.locatorStrategy, step.locator, 60);
    }

    // Prefer smartXPath/xpath if present
    if (step?.smartXPath) push("xpath", step.smartXPath, 70);
    if (step?.xpath) push("xpath", step.xpath, 65);

    // Derive from metadata
    if (step?.elementId) push("id", step.elementId, 80);
    if (step?.elementContentDesc) push("accessibilityId", step.elementContentDesc, 78);
    if (step?.elementText) push("text", step.elementText, 55);

    out.sort((a, b) => (b.score || 0) - (a.score || 0));
    return out;
  }

  async _waitForCoordsByLocators(step) {
    const candidates = this._candidatesFromStep(step);
    if (!candidates.length) return null;

    const timeoutMs = this.options?.stepTimeoutMs || 7000;
    const pollMs = this.options?.pollMs || 250;
    const start = Date.now();
    let lastErr = null;

    while (Date.now() - start < timeoutMs) {
      if (!this.isReplaying) throw new Error("Replay stopped by user");
      const xml = await this._getUiXml({ stabilize: true });
      if (!xml || typeof xml !== "string") {
        lastErr = new Error("UI hierarchy unavailable (uiautomator dump failed)");
        await new Promise(r => setTimeout(r, pollMs));
        continue;
      }

      for (const c of candidates) {
        const coords = await this._coordsFromLocator(xml, c.strategy, c.value);
        if (coords) return { coords, used: c };
      }

      await new Promise(r => setTimeout(r, pollMs));
    }

    if (lastErr) throw lastErr;
    return null;
  }

  async executeLongPressStep(step) {
    const { coordinates, elementId, elementText, elementClass, elementContentDesc } = step;
    try {
      // 1. Try self-healing first if we have metadata
      let targetCoords = coordinates;
      const resolved = await this._waitForCoordsByLocators(step).catch((e) => { throw e; });
      if (resolved?.coords) targetCoords = resolved.coords;
      if (elementId || elementText || elementContentDesc) {
        const foundElement = await this.findBestMatchingElement({
          elementId, elementText, elementClass, elementContentDesc
        });

        if (foundElement && foundElement.coordinates) {
          console.log(`[Self-Healing] Found element for long press with score ${foundElement.score}.`);
          targetCoords = foundElement.coordinates;
        }
      }

      const requireLocator = this.options?.strict && this._hasNonCoordinateLocator(step);
      if (!targetCoords || typeof targetCoords.x !== 'number' || typeof targetCoords.y !== 'number') {
        if (requireLocator) throw new Error(`Element not found for long press (locator resolution failed)`);
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
      const resolved = await this._waitForCoordsByLocators(step).catch((e) => { throw e; });
      if (resolved?.coords) targetCoords = resolved.coords;
      if (elementId || elementText || elementContentDesc) {
        const foundElement = await this.findBestMatchingElement({
          elementId, elementText, elementClass, elementContentDesc
        });

        if (foundElement && foundElement.coordinates) {
          console.log(`[Self-Healing] Found element with score ${foundElement.score}. Updating coordinates.`);
          targetCoords = foundElement.coordinates;
        }
      }

      const requireLocator = this.options?.strict && this._hasNonCoordinateLocator(step);
      if (!targetCoords || typeof targetCoords.x !== 'number' || typeof targetCoords.y !== 'number') {
        if (requireLocator) throw new Error(`Element not found (locator resolution failed)`);
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
      const resolved = await this._waitForCoordsByLocators(step).catch((e) => { throw e; });
      if (resolved?.coords) targetCoords = resolved.coords;
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

      const requireLocator = this.options?.strict && this._hasNonCoordinateLocator(step);
      if (!targetCoords || typeof targetCoords.x !== 'number' || typeof targetCoords.y !== 'number') {
        if (requireLocator) throw new Error(`Element not found for input (locator resolution failed)`);
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
      const nonFatal = process.env.WISPR_ASSERT_NON_FATAL === "1";
      this.emit('assertion-result', { locator, expectedValue, success: false, error: 'Element not found' });
      if (!nonFatal) throw new Error(`Assertion failed: element not found for locator ${locator}`);
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

      const xml = await this._getUiXml({ stabilize: true });
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
      const xml = await this._getUiXml({ stabilize: true });
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
      const xml = await this._getUiXml({ stabilize: true });
      if (!xml || typeof xml !== "string") return null;

      // Fast-ish parse to nodes, then apply ranking engine
      const nodes = parseHierarchyNodesFast(xml);
      const best = this.healingEngine.rankBestMatch(
        {
          resourceId: metadata.elementId,
          contentDesc: metadata.elementContentDesc,
          text: metadata.elementText,
          class: metadata.elementClass,
          bounds: metadata.bounds
        },
        nodes
      );
      if (!best?.node?.attrs?.bounds) return null;

      const boundsMatch = String(best.node.attrs.bounds).match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
      if (!boundsMatch) return null;
      const [, x1, y1, x2, y2] = boundsMatch.map(Number);
      return {
        attributes: best.node.attrs,
        score: best.score,
        coordinates: { x: Math.floor((x1 + x2) / 2), y: Math.floor((y1 + y2) / 2) }
      };
    } catch (error) {
      console.error('Error in self-healing search:', error.message);
      return null;
    }
  }

  /**
   * Parse XML to find element by locator
   */
  _decodeXpathLiteral(raw) {
    const value = raw.trim();
    if (value.startsWith("concat(") && value.endsWith(")")) {
      const inner = value.slice(7, -1);
      const parts = inner.match(/'[^']*'|"[^"]*"/g) || [];
      return parts.map(p => p.slice(1, -1)).join("");
    }
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }
    return value;
  }

  _parseXPathCriteria(locator) {
    if (!locator || (!locator.startsWith("//") && !locator.startsWith("//*"))) return null;
    const criteria = {};
    const attrRegex = /@([a-zA-Z-]+)\s*=\s*(concat\([^)]+\)|"[^"]*"|'[^']*')/g;
    let match;
    while ((match = attrRegex.exec(locator)) !== null) {
      criteria[match[1]] = this._decodeXpathLiteral(match[2]);
    }
    return Object.keys(criteria).length ? criteria : null;
  }

  _matchesXPathCriteria(attrs, criteria) {
    if (!criteria) return false;
    return Object.entries(criteria).every(([key, val]) => attrs[key] === val);
  }

  parseXmlForElement(xml, locator) {
    // Split XML into node declarations
    const nodeRegex = /<node[^>]*>/g;
    const nodes = xml.match(nodeRegex) || [];

    const xpathCriteria = this._parseXPathCriteria(locator);

    for (const nodeStr of nodes) {
      const attrs = this.parseNodeAttributes(nodeStr);

      if (xpathCriteria && this._matchesXPathCriteria(attrs, xpathCriteria)) {
        return {
          locator,
          found: true,
          type: 'xpath',
          bounds: attrs.bounds,
          text: attrs.text,
          class: attrs.class,
          clickable: attrs.clickable === 'true',
          enabled: attrs.enabled === 'true'
        };
      }

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
