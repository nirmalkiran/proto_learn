/**
 * Recording Service
 * Manages recording of user interactions and steps
 */

import { EventEmitter } from 'events';
import { CONFIG } from '../config.js';

class RecordingService extends EventEmitter {
  constructor() {
    super();
    this.isRecording = false;
    this.recordedSteps = [];
    this.stepCounter = 0;
    this.startTime = null;
    this.sessionId = null;
  }

  /**
   * Start recording session
   */
  startRecording(sessionId = null) {
    if (this.isRecording) {
      throw new Error('Recording is already in progress');
    }

    this.isRecording = true;
    this.recordedSteps = [];
    this.stepCounter = 0;
    this.startTime = Date.now();
    this.sessionId = sessionId || `session_${Date.now()}`;

    console.log(`[RecordingService] Started recording session: ${this.sessionId}`);

    this.emit('recording-started', {
      sessionId: this.sessionId,
      startTime: this.startTime
    });

    return {
      sessionId: this.sessionId,
      startTime: this.startTime
    };
  }

  /**
   * Stop recording session
   */
  stopRecording() {
    if (!this.isRecording) {
      return [];
    }

    this.isRecording = false;
    const steps = [...this.recordedSteps];
    const duration = Date.now() - this.startTime;

    console.log(`[RecordingService] Stopped recording session: ${this.sessionId} (${steps.length} steps, ${duration}ms)`);

    this.emit('recording-stopped', {
      sessionId: this.sessionId,
      steps: steps.length,
      duration
    });

    // Reset state
    this.recordedSteps = [];
    this.stepCounter = 0;
    this.startTime = null;
    const sessionId = this.sessionId;
    this.sessionId = null;

    return steps;
  }

  /**
   * Add a step to the recording
   */
  addStep(step) {
    if (!this.isRecording) {
      return null;
    }

    const recordedStep = {
      id: ++this.stepCounter,
      type: step.type,
      description: step.description || this.generateDescription(step),
      locator: step.locator || '',
      value: step.value || '',
      coordinates: step.coordinates || null,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      ...step
    };

    this.recordedSteps.push(recordedStep);

    console.log(`[RecordingService] Added step ${recordedStep.id}: ${recordedStep.type}`);

    this.emit('step-added', recordedStep);

    return recordedStep;
  }

  /**
   * Generate description for a step
   */
  generateDescription(step) {
    switch (step.type) {
      case 'tap':
        return `Tap at (${step.coordinates?.x || 0}, ${step.coordinates?.y || 0})`;
      case 'input':
        return `Input text: "${step.value || ''}"`;
      case 'scroll':
        return `Scroll ${step.direction || 'down'}`;
      case 'wait':
        return `Wait ${step.value || 1000}ms`;
      case 'assert':
        return `Assert ${step.assertion || 'condition'}`;
      default:
        return `${step.type} action`;
    }
  }

  /**
   * Get current recording status
   */
  getStatus() {
    return {
      recording: this.isRecording,
      sessionId: this.sessionId,
      steps: this.recordedSteps.length,
      duration: this.startTime ? Date.now() - this.startTime : 0,
      startTime: this.startTime
    };
  }

  /**
   * Get recorded steps
   */
  getRecordedSteps() {
    return [...this.recordedSteps];
  }

  /**
   * Clear recorded steps
   */
  clearSteps() {
    this.recordedSteps = [];
    this.stepCounter = 0;
    console.log('[RecordingService] Cleared recorded steps');
  }

  /**
   * Remove last step
   */
  removeLastStep() {
    if (this.recordedSteps.length > 0) {
      const removed = this.recordedSteps.pop();
      this.stepCounter--;
      console.log(`[RecordingService] Removed step ${removed.id}: ${removed.type}`);
      this.emit('step-removed', removed);
      return removed;
    }
    return null;
  }

  /**
   * Update step at index
   */
  updateStep(index, updates) {
    if (index >= 0 && index < this.recordedSteps.length) {
      const step = this.recordedSteps[index];
      const updatedStep = { ...step, ...updates };
      this.recordedSteps[index] = updatedStep;

      console.log(`[RecordingService] Updated step ${step.id}`);
      this.emit('step-updated', updatedStep);

      return updatedStep;
    }
    return null;
  }

  /**
   * Get step by ID
   */
  getStepById(id) {
    return this.recordedSteps.find(step => step.id === id);
  }

  /**
   * Export recording as JSON
   */
  exportRecording() {
    return {
      sessionId: this.sessionId,
      startTime: this.startTime,
      endTime: this.isRecording ? null : Date.now(),
      steps: this.recordedSteps,
      metadata: {
        totalSteps: this.recordedSteps.length,
        duration: this.startTime ? Date.now() - this.startTime : 0,
        version: '1.0'
      }
    };
  }

  /**
   * Import recording from JSON
   */
  importRecording(data) {
    if (!data.steps || !Array.isArray(data.steps)) {
      throw new Error('Invalid recording data');
    }

    this.recordedSteps = data.steps.map((step, index) => ({
      ...step,
      id: index + 1
    }));

    this.stepCounter = this.recordedSteps.length;
    this.sessionId = data.sessionId || `imported_${Date.now()}`;

    console.log(`[RecordingService] Imported ${this.recordedSteps.length} steps`);

    return this.recordedSteps;
  }

  /**
   * Preview step execution (without actually executing)
   */
  previewStep(stepId) {
    const step = this.getStepById(stepId);
    if (!step) {
      return null;
    }

    this.emit('step-preview', step);
    return step;
  }

  /**
   * Enable/disable step
   */
  toggleStep(stepId, enabled = null) {
    const step = this.getStepById(stepId);
    if (!step) {
      return null;
    }

    step.enabled = enabled !== null ? enabled : !step.enabled;

    console.log(`[RecordingService] Step ${stepId} ${step.enabled ? 'enabled' : 'disabled'}`);
    this.emit('step-toggled', step);

    return step;
  }
}

export const recordingService = new RecordingService();
export default recordingService;
