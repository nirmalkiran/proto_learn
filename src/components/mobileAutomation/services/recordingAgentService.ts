import { AGENT_URL } from "../constants/agent";

/**
 * Service: recordingAgentService
 * Purpose: Typed wrapper for recording and replay endpoints.
 * Important: Endpoint paths and request payloads must remain unchanged.
 */
export const recordingAgentService = {
  startRecording(body: Record<string, unknown>) {
    return fetch(`${AGENT_URL}/recording/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  stopRecording(body: Record<string, unknown>) {
    return fetch(`${AGENT_URL}/recording/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  getSteps() {
    return fetch(`${AGENT_URL}/recording/steps`);
  },

  replay(body: Record<string, unknown>, signal?: AbortSignal) {
    return fetch(`${AGENT_URL}/recording/replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  },

  stopReplay() {
    return fetch(`${AGENT_URL}/recording/replay/stop`, { method: "POST" });
  },

  addStep(body: Record<string, unknown>) {
    return fetch(`${AGENT_URL}/recording/add-step`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  createEventSource() {
    return new EventSource(`${AGENT_URL}/recording/events`);
  },
};

