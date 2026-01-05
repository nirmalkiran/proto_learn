import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import type { RecordedAction } from "./useActions";

const AGENT_URL = "http://localhost:3001";

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export function useRecording(backgroundMode: boolean = false) {
  const [recording, setRecording] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [replaying, setReplaying] = useState<boolean>(false);
  const [replayIndex, setReplayIndex] = useState<number | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connectToEventStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setConnectionStatus("connecting");
    console.log("[MobileRecorder] Connecting to SSE stream...");

    const source = new EventSource(`${AGENT_URL}/recording/events`);
    eventSourceRef.current = source;

    // In background mode, minimize console logging
    if (backgroundMode) {
      console.log("[MobileRecorder] Running in background mode - reduced logging");
    }

    source.onopen = () => {
      console.log("[MobileRecorder] SSE connected");
      setConnectionStatus("connected");
      toast.success("Connected to recording agent");
    };

    source.onmessage = (e) => {
      try {
        console.log("[MobileRecorder] Received event:", e.data);
        const event = JSON.parse(e.data);

        // Handle replay progress events separately (do not add them as recorded actions)
        if (event.type && event.type.startsWith("replay")) {
          if (event.type === "replay:start") {
            setReplaying(true);
            toast.info(event.description);
          } else if (event.type === "replay:info") {
            toast.info(event.description);
          } else if (event.type === "replay:step:start") {
            setReplayIndex(typeof event.stepIndex === 'number' ? event.stepIndex : null);
            toast(`▶ ${event.description}`);
          } else if (event.type === "replay:step:done") {
            setReplayIndex(null);
            toast.success(event.description);
          } else if (event.type === "replay:finished") {
            setReplayIndex(null);
            setReplaying(false);
            toast.success(event.description);
          } else if (event.type === "replay:error" || event.type === "replay:step:error") {
            setReplaying(false);
            setReplayIndex(null);
            toast.error(event.description);
          }

          return;
        }

        if (event.type && event.description) {
          const newAction: RecordedAction = {
            id: crypto.randomUUID(),
            type: event.type as any,
            description: event.description,
            locator: event.locator || "//android.view.View",
            value: event.value,
            coordinates: event.coordinates,
            timestamp: event.timestamp || Date.now(),
            enabled: true,
          };

          // Return the action so the component can add it
          return newAction;
        }
      } catch (err) {
        console.error("[MobileRecorder] Invalid event data:", err);
      }
      return null;
    };

    source.onerror = (err) => {
      console.error("[MobileRecorder] SSE error:", err);
      setConnectionStatus("disconnected");
      source.close();
      eventSourceRef.current = null;

      // Attempt reconnection if still recording
      if (recording) {
        console.log("[MobileRecorder] Attempting reconnect in 3s...");
        reconnectTimeoutRef.current = setTimeout(() => {
          connectToEventStream();
        }, 3000);
      }
    };

    return source;
  }, [recording, backgroundMode]);

  const startRecording = useCallback(async (selectedDevice: any, setupState: any, verifySetup: () => Promise<any>) => {
    let canRecord = setupState.device;

    if (!canRecord) {
      const verified = await verifySetup();
      canRecord = Boolean(verified?.device);

      if (!verified) {
        toast.error("Complete setup before recording", {
          description: "Local agent not reachable at http://localhost:3001",
        });
        return false;
      }

      if (!canRecord) {
        toast.error("Complete setup before recording", {
          description: "No ADB device detected",
        });
        return false;
      }
    }

    if (!selectedDevice) {
      toast.error("Select a device first");
      return false;
    }

    try {
      const response = await fetch(`${AGENT_URL}/recording/start`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to start recording");
      }

      setRecording(true);

      toast.success("Recording started", {
        description: `Connected to ${selectedDevice.name || selectedDevice.device}`,
      });
      return true;
    } catch (err) {
      console.error("[MobileRecorder] Start recording error:", err);
      toast.error("Failed to start recording", {
        description: "Make sure the local agent is running (npm run server)",
      });
      return false;
    }
  }, []);

  const stopRecording = useCallback(async (actions: RecordedAction[]) => {
    try {
      const response = await fetch(`${AGENT_URL}/recording/stop`, {
        method: "POST",
      });

      const data = await response.json();
      setRecording(false);

      // Merge any steps from server that we might have missed
      if (data.steps && data.steps.length > 0) {
        const existingIds = new Set(actions.map((a) => a.timestamp));
        const newSteps = data.steps
          .filter((s: any) => !existingIds.has(s.timestamp))
          .map((s: any) => ({
            id: crypto.randomUUID(),
            type: s.type as any,
            description: s.description,
            locator: s.locator,
            coordinates: s.coordinates,
            timestamp: s.timestamp,
            enabled: s.enabled !== false,
          }));

        return newSteps;
      }

      toast.success("Recording stopped", {
        description: `${actions.length} actions captured`,
      });
      return [];
    } catch (err) {
      console.error("[MobileRecorder] Stop recording error:", err);
      toast.error("Failed to stop recording");
      setRecording(false);
      return [];
    }
  }, []);

  const replay = useCallback(async (actions: RecordedAction[]) => {
    const enabledActions = actions.filter(a => a.enabled);
    if (!enabledActions.length) {
      toast.error("No enabled actions to replay");
      return false;
    }

    try {
      setReplaying(true);
      const res = await fetch(`${AGENT_URL}/recording/replay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          steps: enabledActions.map((a) => ({
            type: a.type,
            description: a.description,
            locator: a.locator,
            value: a.value,
            coordinates: a.coordinates,
            timestamp: a.timestamp,
            enabled: a.enabled,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Replay request failed");
      }

      toast.success("Replay completed", {
        description: "All steps were replayed on the connected device",
      });
      setReplaying(false);
      return true;
    } catch (err) {
      console.error("[MobileRecorder] Replay error:", err);
      setReplaying(false);
      toast.error("Failed to start replay", {
        description: "Make sure the local helper is running and a device is connected",
      });
      return false;
    }
  }, []);

  const refreshSteps = useCallback(async () => {
    try {
      const response = await fetch(`${AGENT_URL}/recording/steps`);
      const data = await response.json();

      if (data.success && data.steps) {
        const mappedSteps = data.steps.map((s: any) => ({
          id: crypto.randomUUID(),
          type: s.type as any,
          description: s.description,
          locator: s.locator,
          coordinates: s.coordinates,
          timestamp: s.timestamp,
          enabled: s.enabled !== false,
        }));
        toast.success(`Loaded ${mappedSteps.length} steps`);
        return mappedSteps;
      }
      return [];
    } catch (err) {
      toast.error("Failed to refresh steps");
      return [];
    }
  }, []);

  // Connect when recording starts
  useEffect(() => {
    if (recording) {
      connectToEventStream();
    } else {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setConnectionStatus("disconnected");
    }
  }, [recording, connectToEventStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  return {
    recording,
    connectionStatus,
    replaying,
    replayIndex,
    startRecording,
    stopRecording,
    replay,
    refreshSteps,
    connectToEventStream,
  };
}
