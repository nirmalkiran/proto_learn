import { AGENT_URL } from "../constants/agent";

/**
 * Service: setupAgentService
 * Purpose: Wrapper for setup-health bootstrap endpoints.
 * Important: Keep existing URL paths and methods unchanged.
 */
export const setupAgentService = {
  health(signal?: AbortSignal) {
    return fetch(`${AGENT_URL}/health`, { signal });
  },

  setupStatus(signal?: AbortSignal) {
    return fetch(`${AGENT_URL}/setup/status`, { signal });
  },

  startAgent() {
    return fetch(`${AGENT_URL}/agent/start`, { method: "POST" });
  },

  runTerminal(body: Record<string, unknown>) {
    return fetch(`${AGENT_URL}/terminal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },
};

