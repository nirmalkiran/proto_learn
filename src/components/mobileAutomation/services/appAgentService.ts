import { AGENT_URL } from "../constants/agent";

/**
 * Service: appAgentService
 * Purpose: Wrapper for app lifecycle and package management endpoints.
 * Important: Preserve payload and route compatibility with existing backend agent.
 */
export const appAgentService = {
  launch(body: Record<string, unknown>) {
    return fetch(`${AGENT_URL}/app/launch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  stop(body: Record<string, unknown>) {
    return fetch(`${AGENT_URL}/app/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  clear(body: Record<string, unknown>) {
    return fetch(`${AGENT_URL}/app/clear`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  upload(body: FormData) {
    return fetch(`${AGENT_URL}/app/upload`, {
      method: "POST",
      body,
    });
  },

  install(body: Record<string, unknown>) {
    return fetch(`${AGENT_URL}/app/install`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  checkInstall(pkg: string, deviceId?: string) {
    const qs = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : "";
    return fetch(`${AGENT_URL}/app/check-install/${pkg}${qs}`);
  },

  installedPackages(deviceId?: string) {
    const qs = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : "";
    return fetch(`${AGENT_URL}/app/installed-packages${qs}`);
  },
};

