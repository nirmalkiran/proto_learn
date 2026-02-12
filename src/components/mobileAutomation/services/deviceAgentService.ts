import { AGENT_URL } from "../constants/agent";

/**
 * Service: deviceAgentService
 * Purpose: Wrapper for device, input, inspection, and emulator endpoints.
 * Important: Keep all endpoint paths/body contracts identical.
 */
export const deviceAgentService = {
  checkDevice(signal?: AbortSignal) {
    return fetch(`${AGENT_URL}/device/check`, { signal });
  },

  getFocus() {
    return fetch(`${AGENT_URL}/device/focus`);
  },

  getScreenshot(signal?: AbortSignal) {
    return fetch(`${AGENT_URL}/device/screenshot`, { signal });
  },

  getUiHierarchy() {
    return fetch(`${AGENT_URL}/device/ui`);
  },

  getSize() {
    return fetch(`${AGENT_URL}/device/size`);
  },

  tap(body: Record<string, unknown>) {
    return fetch(`${AGENT_URL}/device/tap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  longPress(body: Record<string, unknown>) {
    return fetch(`${AGENT_URL}/device/long-press`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  swipe(body: Record<string, unknown>) {
    return fetch(`${AGENT_URL}/device/swipe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  key(body: Record<string, unknown>) {
    return fetch(`${AGENT_URL}/device/key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  input(body: Record<string, unknown>) {
    return fetch(`${AGENT_URL}/device/input`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  hideKeyboard(body: Record<string, unknown>) {
    return fetch(`${AGENT_URL}/device/hide-keyboard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  inspect(body: Record<string, unknown>) {
    return fetch(`${AGENT_URL}/device/inspect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  inspectLocator(body: Record<string, unknown>) {
    return fetch(`${AGENT_URL}/device/inspect-locator`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  shell(body: Record<string, unknown>) {
    return fetch(`${AGENT_URL}/device/shell`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  uninstall(body: Record<string, unknown>) {
    return fetch(`${AGENT_URL}/device/uninstall`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  startEmulator(body: Record<string, unknown>) {
    return fetch(`${AGENT_URL}/emulator/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  stopEmulator() {
    return fetch(`${AGENT_URL}/emulator/stop`, { method: "POST" });
  },

  getEmulatorStatus() {
    return fetch(`${AGENT_URL}/emulator/status`);
  },

  getAvailableEmulators(signal?: AbortSignal) {
    return fetch(`${AGENT_URL}/emulator/available`, { signal });
  },
};
