import { useState, useEffect, useCallback } from "react";

const AGENT_URL = "http://localhost:3001";

export type AgentStatus = "checking" | "ready" | "nodevice" | "offline";

export function useAgentStatus() {
  const [agentStatus, setAgentStatus] = useState<AgentStatus>("checking");

  const checkAgentStatus = useCallback(async () => {
    try {
      // Check if agent server is running
      const health = await fetch(`${AGENT_URL}/health`, {
        signal: AbortSignal.timeout(3000)
      }).then(r => r.json()).catch(() => null);

      if (!health?.status) {
        setAgentStatus("offline");
        return;
      }

      // Check if device is connected
      const device = await fetch(`${AGENT_URL}/device/check`, {
        signal: AbortSignal.timeout(3000)
      }).then(r => r.json()).catch(() => null);

      if (health?.status && device?.connected) {
        setAgentStatus("ready");
        return;
      }

      if (health?.status) {
        setAgentStatus("nodevice");
        return;
      }

      setAgentStatus("offline");
    } catch (error) {
      console.log("Agent status check failed:", error);
      setAgentStatus("offline");
    }
  }, []);

  useEffect(() => {
    checkAgentStatus();

    // Reduce frequency to every 30 seconds to minimize network requests
    const id = setInterval(checkAgentStatus, 30000);
    return () => clearInterval(id);
  }, [checkAgentStatus]);

  return {
    agentStatus,
    checkAgentStatus
  };
}
