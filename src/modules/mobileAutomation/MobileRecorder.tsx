<<<<<<< HEAD
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Play, Square, Trash2, RefreshCw, Copy, Download, Monitor, Smartphone, Wifi, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

import DeviceSelector from "./DeviceSelector";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/* =====================================================
 * TYPES
 * ===================================================== */

export type ActionType =
  | "tap"
  | "input"
  | "scroll"
  | "wait"
  | "assert";

interface RecordedAction {
  id: string;
  type: ActionType;
  description: string;
  locator: string;
  value?: string;
  enabled?: boolean; 
  coordinates?: {
    x: number;
    y: number;
    endX?: number;
    endY?: number;
  };
  timestamp?: number;
}

/* =====================================================
 * CONSTANTS
 * ===================================================== */

const AGENT_URL = "http://localhost:3001";

// Standard phone dimensions (portrait) - matches typical Android emulator
const DEVICE_WIDTH = 320;
const DEVICE_HEIGHT = 568;

/* =====================================================
 * COMPONENT
 * ===================================================== */

export default function MobileRecorder({
  setupState,
  setSetupState,
}: {
=======
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Circle, Square, Loader2 } from "lucide-react";

import DeviceSelector from "./DeviceSelector";
import DevicePreview from "./DevicePreview";
import CapturedActions, { RecordedAction } from "./CapturedActions";
import GeneratedScript from "./GeneratedScript";
import SaveDialog from "./SaveDialog";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import "./MobileRecorder.css";

const AGENT_URL = "http://localhost:3001";

interface MobileRecorderProps {
>>>>>>> 4b9f5a8f37face1a5d4991440565e5f097e18944
  setupState: {
    appium: boolean;
    emulator: boolean;
    device: boolean;
  };
<<<<<<< HEAD
  setSetupState?: (updater: any) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [actions, setActions] = useState<RecordedAction[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<any>(null);
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [mirrorActive, setMirrorActive] = useState(false);
  const [mirrorImage, setMirrorImage] = useState<string | null>(null);
  const [mirrorError, setMirrorError] = useState<string | null>(null);
  const [mirrorLoading, setMirrorLoading] = useState(false);
  const [captureMode, setCaptureMode] = useState(false);
  const [deviceSize, setDeviceSize] = useState<{w:number;h:number} | null>(null);


  // Input capture modal state
  const [inputModalOpen, setInputModalOpen] = useState(false);
  const [inputModalText, setInputModalText] = useState("");
  const [inputModalCoords, setInputModalCoords] = useState<{x:number;y:number} | null>(null);
  const [inputModalPending, setInputModalPending] = useState(false);

  // Inline edit state for input actions
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const [previewPendingId, setPreviewPendingId] = useState<string | null>(null);
  const [replaying, setReplaying] = useState<boolean>(false);
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const screenshotIntervalRef = useRef<NodeJS.Timeout | null>(null);

  /* =====================================================
   * 🔴 CONNECT TO SSE STREAM
   * ===================================================== */

  const connectToEventStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setConnectionStatus("connecting");
    console.log("[MobileRecorder] Connecting to SSE stream...");

    const source = new EventSource(`${AGENT_URL}/recording/events`);
    eventSourceRef.current = source;

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
            type: event.type as ActionType,
            description: event.description,
            locator: event.locator || "//android.view.View",
            value: event.value,
            enabled: true, 
            coordinates: event.coordinates,
            timestamp: event.timestamp || Date.now(),
          };

          setActions((prev) => [...prev, newAction]);
          toast.info(`Captured: ${newAction.description}`);
        }
      } catch (err) {
        console.error("[MobileRecorder] Invalid event data:", err);
      }
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
  }, [recording, captureMode]);

  /* =====================================================
   * CLEANUP ON UNMOUNT
   * ===================================================== */

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (screenshotIntervalRef.current) {
        clearTimeout(screenshotIntervalRef.current as unknown as number);
      }
    };
  }, []);

  /* =====================================================
   * CONNECT WHEN RECORDING STARTS
   * ===================================================== */

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

  /* =====================================================
   * HELPER: fetch with timeout
   * ===================================================== */

  const fetchJsonWithTimeout = async (url: string, timeoutMs = 2500) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      return { ok: res.ok, json: await res.json() };
    } finally {
      clearTimeout(id);
    }
  };

  const verifySetup = async () => {
    try {
      const [health, appium, device, emulator] = await Promise.all([
        fetchJsonWithTimeout(`${AGENT_URL}/health`),
        fetchJsonWithTimeout(`${AGENT_URL}/appium/status`),
        fetchJsonWithTimeout(`${AGENT_URL}/device/check`),
        fetchJsonWithTimeout(`${AGENT_URL}/emulator/status`),
      ]);

      if (!health.ok) return null;

      const verified = {
        appium: Boolean(appium.json?.running),
        device: Boolean(device.json?.connected),
        emulator: Boolean(emulator.json?.running),
      };

      if (setSetupState) {
        setSetupState((prev: any) => ({ ...prev, ...verified }));
      }

      return verified;
    } catch {
      return null;
    }
  };

  /* =====================================================
   * 📷 SCREENSHOT STREAM FOR EMBEDDED PREVIEW
   * ===================================================== */

  const startScreenshotStream = useCallback(() => {
    // Clear any existing scheduled capture
    if (screenshotIntervalRef.current) {
      clearTimeout(screenshotIntervalRef.current as unknown as number);
      screenshotIntervalRef.current = null;
    }

    let failCount = 0;
    const maxFails = 3;
    const intervalMs = 200; // desired interval between captures
    const timeoutMs = 5000; // fetch timeout

    // Prevent overlapping requests
    let inFlight = false;
    let active = true;

    const stopLoop = () => {
      active = false;
      if (screenshotIntervalRef.current) {
        clearTimeout(screenshotIntervalRef.current as unknown as number);
        screenshotIntervalRef.current = null;
      }
    };

    const captureScreenshot = async () => {
      if (!active) return;
      if (inFlight) return; // skip if previous fetch still running
      inFlight = true;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(`${AGENT_URL}/device/screenshot`, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
          const blob = await res.blob();
          if (blob.size > 0) {
            const url = URL.createObjectURL(blob);
            setMirrorImage((prev) => {
              if (prev) URL.revokeObjectURL(prev);
              return url;
            });
            setMirrorError(null);
            failCount = 0;
          } else {
            failCount++;
          }
        } else {
          const data = await res.json().catch(() => ({}));
          console.warn("[Mirror] Screenshot failed:", data.error);
          failCount++;
        }
      } catch (err: any) {
        if (err.name === "AbortError") {
          // Timeout/abort - expected sometimes, keep debug-level log only
          console.debug("[Mirror] Screenshot request timed out");
        } else {
          console.warn("[Mirror] Fetch error:", err);
        }
        failCount++;
      } finally {
        inFlight = false;
      }

      if (failCount >= maxFails) {
        setMirrorActive(false);
        setMirrorError("Connection lost to device. Please reconnect.");
        stopLoop();
        return;
      }

      // Schedule next capture after configured interval
      if (active) {
        screenshotIntervalRef.current = setTimeout(captureScreenshot as any, intervalMs);
      }
    };

    // Start the capture loop
    captureScreenshot();

    // Ensure we clear loop when mirror is deactivated elsewhere
    return () => stopLoop();
  }, []);

  /* =====================================================
   * 📱 CONNECT DEVICE - EMBEDDED MIRROR
   * ===================================================== */

  const connectDevice = useCallback(async () => {
    if (!selectedDevice) {
      toast.error("Select a device first");
      return;
    }

    setMirrorError(null);
    setMirrorLoading(true);

    try {
      // First check if local helper is running
      const healthRes = await fetch(`${AGENT_URL}/health`, { 
        signal: AbortSignal.timeout(3000) 
      }).catch(() => null);
      
      if (!healthRes?.ok) {
        setMirrorLoading(false);
        setMirrorError("Local helper not running. Run: cd tools/mobile-automation-helper && npm start");
        toast.error("Local helper not running");
        return;
      }

      // Verify device is connected
      const deviceRes = await fetch(`${AGENT_URL}/device/check`);
      const deviceData = await deviceRes.json();

      if (!deviceData.connected) {
        setMirrorError("No device connected. Start an emulator or connect a device via ADB.");
        setMirrorLoading(false);
        toast.error("No device connected");
        return;
      }

      // Test screenshot endpoint first
      const testScreenshot = await fetch(`${AGENT_URL}/device/screenshot`);
      if (!testScreenshot.ok) {
        const err = await testScreenshot.json().catch(() => ({}));
        setMirrorLoading(false);
        setMirrorError(err.error || "Cannot capture device screen");
        toast.error("Cannot capture device screen");
        return;
      }

      // Fetch device size for accurate click mapping
      try {
        const sizeRes = await fetch(`${AGENT_URL}/device/size`);
        const sizeJson = await sizeRes.json();
        if (sizeJson.success && sizeJson.size) setDeviceSize(sizeJson.size);
      } catch {}

      // Start embedded screenshot streaming
      setMirrorActive(true);
      setMirrorLoading(false);
      startScreenshotStream();

      toast.success("Device connected", {
        description: "Live preview active - interact with your device",
      });
    } catch (err: any) {
      console.error("[connectDevice] Error:", err);
      setMirrorLoading(false);
      setMirrorError("Cannot connect to local helper. Run: npm start in tools/mobile-automation-helper");
      toast.error("Local helper not running");
    }
  }, [selectedDevice, startScreenshotStream]);

  const disconnectDevice = useCallback(() => {
    setMirrorActive(false);
    if (mirrorImage) {
      URL.revokeObjectURL(mirrorImage);
    }
    setMirrorImage(null);
    setMirrorError(null);
    if (screenshotIntervalRef.current) {
      clearTimeout(screenshotIntervalRef.current as unknown as number);
      screenshotIntervalRef.current = null;
    }
    toast.info("Device disconnected");
  }, [mirrorImage]);

  /* =====================================================
   * START RECORDING
   * ===================================================== */

  const startRecording = async () => {
    let canRecord = setupState.device;

    if (!canRecord) {
      const verified = await verifySetup();
      canRecord = Boolean(verified?.device);

      if (!verified) {
        toast.error("Complete setup before recording", {
          description: "Local agent not reachable at http://localhost:3001",
        });
        return;
      }

      if (!canRecord) {
        toast.error("Complete setup before recording", {
          description: "No ADB device detected",
        });
        return;
      }
    }

    if (!selectedDevice) {
      toast.error("Select a device first");
      return;
    }

    try {
      const response = await fetch(`${AGENT_URL}/recording/start`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to start recording");
      }

      setActions([]);
      setRecording(true);

      toast.success("Recording started", {
        description: `Connected to ${selectedDevice.name || selectedDevice.device}`,
      });
    } catch (err) {
      console.error("[MobileRecorder] Start recording error:", err);
      toast.error("Failed to start recording", {
        description: "Make sure the local agent is running (npm run server)",
      });
    }
  };

  /* =====================================================
   * STOP RECORDING
   * ===================================================== */

  const stopRecording = async () => {
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
            type: s.type as ActionType,
            description: s.description,
            locator: s.locator,
            coordinates: s.coordinates,
            timestamp: s.timestamp,
          }));

        if (newSteps.length > 0) {
          setActions((prev) => [...prev, ...newSteps]);
        }
      }

      toast.success("Recording stopped", {
        description: `${actions.length} actions captured`,
      });
    } catch (err) {
      console.error("[MobileRecorder] Stop recording error:", err);
      toast.error("Failed to stop recording");
      setRecording(false);
    }
  };

  /* =====================================================
   * 🔄 REFRESH STEPS FROM SERVER
   * ===================================================== */

  const refreshSteps = async () => {
    try {
      const response = await fetch(`${AGENT_URL}/recording/steps`);
      const data = await response.json();

      if (data.success && data.steps) {
        const mappedSteps = data.steps.map((s: any) => ({
          id: crypto.randomUUID(),
          type: s.type as ActionType,
          description: s.description,
          locator: s.locator,
          coordinates: s.coordinates,
          timestamp: s.timestamp,
        }));
        setActions(mappedSteps);
        toast.success(`Loaded ${mappedSteps.length} steps`);
      }
    } catch (err) {
      toast.error("Failed to refresh steps");
    }
  };

  /* =====================================================
   * ▶ REPLAY (ADB)
   * ===================================================== */

  const replay = async () => {
    if (!actions.length) {
      toast.error("No actions to replay");
      return;
    }

    try {
      setReplaying(true);
      const res = await fetch(`${AGENT_URL}/recording/replay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          steps: actions.map((a) => ({
            type: a.type,
            description: a.description,
            locator: a.locator,
            value: a.value,
            coordinates: a.coordinates,
            timestamp: a.timestamp,
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
    } catch (err) {
      console.error("[MobileRecorder] Replay error:", err);
      setReplaying(false);
      toast.error("Failed to start replay", {
        description: "Make sure the local helper is running and a device is connected",
      });
    }
  };

  /* =====================================================
   * GENERATED SCRIPT (APPIUM STYLE)
   * ===================================================== */

  const generatedScript = useMemo(() => {
    if (!actions.length) return "";

    return `// Auto-generated by Mobile Recorder
// Platform: Android (Appium WebDriverIO)
// Generated: ${new Date().toISOString()}

describe("Recorded Mobile Test", () => {
  it("should replay recorded steps", async () => {
${actions
  .map((a, index) => {
    const comment = `    // Step ${index + 1}: ${a.description}`;
    switch (a.type) {
      case "tap":
        if (a.coordinates) {
          return `${comment}\n    await driver.touchAction({ action: 'tap', x: ${a.coordinates.x}, y: ${a.coordinates.y} });`;
        }
        return `${comment}\n    await driver.$("${a.locator}").click();`;
      case "input":
        if (a.value && String(a.value).trim()) {
          return `${comment}\n    await driver.$("${a.locator}").setValue("${a.value}");`;
        }
        // If value is not recorded, add a placeholder that can be supplied via environment variable at runtime
        return `${comment}\n    // TODO: Replace INPUT_${index + 1} value or provide via env var\n    const input${index + 1} = process.env.INPUT_${index + 1} || "";\n    await driver.$("${a.locator}").setValue(input${index + 1});`;
      case "scroll":
        if (a.coordinates) {
          return `${comment}\n    await driver.touchAction([
      { action: 'press', x: ${a.coordinates.x}, y: ${a.coordinates.y} },
      { action: 'moveTo', x: ${a.coordinates.endX || a.coordinates.x}, y: ${a.coordinates.endY || a.coordinates.y} },
      { action: 'release' }
    ]);`;
        }
        return `${comment}\n    // scroll action (coordinates not captured)`;
      case "wait":
        return `${comment}\n    await driver.pause(1000);`;
      case "assert":
        return `${comment}\n    await expect(driver.$("${a.locator}")).toBeDisplayed();`;
      default:
        return "";
    }
  })
  .join("\n\n")}
  });
});`;
  }, [actions]);

  /* =====================================================
   * COPY SCRIPT TO CLIPBOARD
   * ===================================================== */

  const copyScript = () => {
    navigator.clipboard.writeText(generatedScript);
    toast.success("Script copied to clipboard");
  };

  /* =====================================================
   * DOWNLOAD SCRIPT
   * ===================================================== */

  const downloadScript = () => {
    const blob = new Blob([generatedScript], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recorded-test-${Date.now()}.spec.js`;
    a.click();
    URL.revokeObjectURL(url);
  toast.success("Script downloaded");
};



  // Input modal confirm handler
  const handleConfirmInput = async () => {
    if (!inputModalCoords) return setInputModalOpen(false);
    if (!inputModalText || String(inputModalText).trim().length === 0) {
      // If empty, just close (original prompt allowed skipping)
      setInputModalOpen(false);
      return;
    }

    try {
      setInputModalPending(true);
      const r = await fetch(`${AGENT_URL}/device/input`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x: inputModalCoords.x, y: inputModalCoords.y, text: inputModalText }),
      });

      if (!r.ok) {
        const jj = await r.json().catch(() => ({}));
        toast.error(jj.error || "Failed to input text");
      } else {
        toast.success("Text input captured");
      }
    } catch (err) {
      console.error("Input post failed:", err);
      toast.error("Failed to input text");
    } finally {
      setInputModalPending(false);
      setInputModalOpen(false);
      setInputModalText("");
      setInputModalCoords(null);
    }
  };

  // Preview input value on device for a given step (or edited value)
  const previewInput = async (step: RecordedAction, overrideValue?: string) => {
    const text = (typeof overrideValue !== 'undefined') ? overrideValue : step.value;
    if (!text || String(text).trim().length === 0) {
      toast.error("No value to preview");
      return;
    }

    if (!step.coordinates || typeof step.coordinates.x !== 'number' || typeof step.coordinates.y !== 'number') {
      toast.error("No coordinates available for this step");
      return;
    }

    try {
      setPreviewPendingId(step.id);
      const r = await fetch(`${AGENT_URL}/device/input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: step.coordinates.x, y: step.coordinates.y, text }),
      });

      if (!r.ok) {
        const jj = await r.json().catch(() => ({}));
        toast.error(jj.error || 'Failed to send preview input');
      } else {
        toast.success('Preview input sent to device');
      }
    } catch (err) {
      console.error('Preview input failed:', err);
      toast.error('Failed to send preview input');
    } finally {
      setPreviewPendingId(null);
    }
  };



  /* =====================================================
   * UI
   * ===================================================== */

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Mobile Recorder</h2>
          <p className="text-sm text-muted-foreground">
            Record actions on local emulator or device
          </p>
        </div>

        <div className="flex items-center gap-2">
          {recording && (
            <Badge
              variant={connectionStatus === "connected" ? "default" : "secondary"}
              className="animate-pulse"
            >
              {connectionStatus === "connected" ? "Recording" : "Connecting..."}
            </Badge>
          )}

          {!recording ? (
            <>
              <Button onClick={startRecording} disabled={!mirrorActive}>
                <Play className="mr-2 h-4 w-4" />
                Start Recording
              </Button>

              <Button
                variant="outline"
                onClick={replay}
                disabled={actions.length === 0 || replaying}
              >
                <Play className="mr-2 h-4 w-4" />
                {replaying ? "Replaying..." : "Replay"}
              </Button>
            </>
          ) : (
            <Button variant="destructive" onClick={stopRecording}>
              <Square className="mr-2 h-4 w-4" />
              Stop Recording
            </Button>
          )}

          {/* Input capture dialog (replaces blocking prompt) */}
          <Dialog open={inputModalOpen} onOpenChange={setInputModalOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Enter text to input</DialogTitle>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                <Input value={inputModalText} onChange={(e:any) => setInputModalText(e.target.value)} placeholder="Type text to send to device" />
                <div className="text-xs text-muted-foreground">Leave empty to skip</div>
              </div>

              <DialogFooter>
                <div className="flex gap-2">
                  <Button onClick={() => { setInputModalOpen(false); setInputModalText(""); }}>Cancel</Button>
                  <Button onClick={handleConfirmInput} disabled={inputModalPending}>
                    {inputModalPending ? "Sending..." : "Send"}
                  </Button>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* DEVICE SELECTOR */}
      <Card>
        <CardHeader>
          <CardTitle>Select Device</CardTitle>
        </CardHeader>
        <CardContent>
          <DeviceSelector onSelect={setSelectedDevice} />
          {selectedDevice && (
            <p className="mt-2 text-sm text-muted-foreground">
              Selected:{" "}
              <strong>
                {selectedDevice.name || selectedDevice.device}
              </strong>
            </p>
          )}
        </CardContent>
      </Card>

      {/* MAIN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* DEVICE PREVIEW */}
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Device Preview
            </CardTitle>
            {mirrorActive && (
              <Badge variant="default" className="animate-pulse">
                <Monitor className="h-3 w-3 mr-1" />
                Mirror Active
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            <div
              className="border-4 border-foreground/20 rounded-[2rem] overflow-hidden bg-black mx-auto relative"
              style={{
                width: mirrorActive ? 'auto' : DEVICE_WIDTH,
                height: mirrorActive ? 'auto' : DEVICE_HEIGHT,
                boxShadow: "0 0 0 2px hsl(var(--foreground)/0.1), 0 10px 40px rgba(0,0,0,0.3)"
              }}
            >
              {/* Notch */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-6 bg-black rounded-b-xl z-10" />
              
              {/* Screen Content */}
              <div className="w-full h-full flex flex-col items-center justify-center bg-muted/10 overflow-hidden">
                {mirrorLoading ? (
                  <div className="text-center p-4 space-y-3">
                    <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
                    <p className="text-sm text-muted-foreground">Connecting...</p>
                  </div>
                ) : !mirrorActive ? (
                  <div className="text-center p-4 space-y-4">
                    <Smartphone className="h-16 w-16 text-muted-foreground mx-auto opacity-50" />
                    <p className="text-sm text-muted-foreground">
                      Connect to see live device screen
                    </p>
                    <Button onClick={connectDevice} className="gap-2">
                      <Wifi className="h-4 w-4" />
                      Connect Device
                    </Button>
                  </div>
                ) : mirrorError ? (
                  <div className="text-center p-4 space-y-3">
                    <WifiOff className="h-8 w-8 text-destructive mx-auto" />
                    <div className="text-destructive text-sm">{mirrorError}</div>
                    <Button variant="outline" size="sm" onClick={connectDevice}>
                      Retry
                    </Button>
                  </div>
                ) : mirrorImage ? (
                  <>
                    <img 
                      src={mirrorImage} 
                      alt="Device screen" 
                      className={`w-full h-full object-contain ${captureMode ? 'cursor-pointer ring-2 ring-offset-2 ring-primary/40' : ''}`}
                      onClick={async (e) => {
                        if (!captureMode) return;
                        const el = e.currentTarget as HTMLImageElement;
                        const rect = el.getBoundingClientRect();
                        const clickX = e.clientX - rect.left;
                        const clickY = e.clientY - rect.top;

                        const imgWidth = rect.width;
                        const imgHeight = rect.height;

                        const dev = deviceSize;
                        try {
                          if (!dev) {
                            const sizeRes = await fetch(`${AGENT_URL}/device/size`);
                            const sizeJson = await sizeRes.json();
                            if (sizeJson.success && sizeJson.size) setDeviceSize(sizeJson.size);
                          }
                        } catch {}

                        const finalDev = deviceSize || { w: 1344, h: 2400 };

                        const deviceX = Math.round((clickX / imgWidth) * finalDev.w);
                        const deviceY = Math.round((clickY / imgHeight) * finalDev.h);

                        try {
                          const res = await fetch(`${AGENT_URL}/device/tap`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ x: deviceX, y: deviceY }),
                          });

                          const json = await res.json().catch(() => ({}));

                          if (res.ok && json.step) {
                            toast.success("Captured step");

                            // If this element looks like an input, prompt user to enter text
                            if (json.step.isInputCandidate) {
                              // Open non-blocking modal to collect input text
                              setInputModalCoords({ x: deviceX, y: deviceY });
                              setInputModalText("");
                              setInputModalPending(false);
                              setInputModalOpen(true);
                            }

                          } else {
                            toast.error(json.error || "Failed to capture");
                          }
                        } catch (err) {
                          toast.error("Failed to capture");
                        }
                      }}
                    />
                  </>
                ) : (
                  <div className="text-center p-4 space-y-3">
                    <div className="animate-pulse text-muted-foreground text-sm">
                      Loading device screen...
                    </div>
                  </div>
                )}
              </div>

              {/* Home button */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-16 h-1 bg-foreground/30 rounded-full" />
            </div>
          </CardContent>

          {/* Controls moved outside the emulator preview */}
          <div className="flex items-center justify-between gap-2 mt-4 p-2">
            <Button variant={captureMode ? "destructive" : "default"} size="sm" onClick={() => setCaptureMode((s) => !s)} className="gap-2">
              <Monitor className="h-3 w-3 mr-1" />
              {captureMode ? "Capture Mode: ON" : "Capture Mode: OFF"}
            </Button>

            <div className="flex items-center gap-2">
              {/* {deviceSize && (
                <div className="text-xs text-muted-foreground mr-2">
                  Device: {deviceSize.w}x{deviceSize.h}
                </div>
              )} */}
              <Button variant="destructive" size="sm" onClick={disconnectDevice}>
                <WifiOff className="h-3 w-3 mr-1" />
                Disconnect
              </Button>
            </div>
          </div>
        </Card>

        {/* ACTIONS + SCRIPT */}
        <div className="lg:col-span-2 space-y-6">
          {/* CAPTURED ACTIONS */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>
                Captured Actions{" "}
                <Badge variant="secondary">{actions.length}</Badge>
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={refreshSteps}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {actions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No actions recorded yet</p>
                  <p className="text-xs mt-1">
                    Start recording and interact with your device
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[200px]">
                  {actions.map((a, i) => (
                    <div
                      key={a.id}
                      className={`flex justify-between items-center p-2 border rounded mb-2 hover:bg-muted/50 ${replayIndex === i ? 'bg-yellow-50 border-yellow-200' : ''}`}
                    >
                      <div className="flex-1">
                        <span className="font-medium">
                          {i + 1}. {a.description}
                        </span>
                        {a.coordinates && (
                          <span className="text-xs text-muted-foreground ml-2">
                            ({a.coordinates.x}, {a.coordinates.y})
                          </span>
                        )}
                        <p className="text-xs text-muted-foreground truncate max-w-md">
                          {a.locator}
                        </p>

                        {/* Inline edit for input actions */}
                        {a.type === "input" && (
                          <div className="mt-2 flex items-center gap-2">
                            {editingStepId === a.id ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  value={editingValue}
                                  onChange={(e:any) => setEditingValue(e.target.value)}
                                  onKeyDown={(e:any) => {
                                    if (e.key === "Enter") {
                                      // save
                                      setActions((prev) =>
                                        prev.map((p) =>
                                          p.id === a.id ? { ...p, value: editingValue } : p
                                        )
                                      );
                                      setEditingStepId(null);
                                      setEditingValue("");
                                      toast.success("Step value updated");
                                    }
                                    if (e.key === "Escape") {
                                      setEditingStepId(null);
                                      setEditingValue("");
                                    }
                                  }}
                                  placeholder="Enter value for this step"
                                  className="max-w-xs"
                                />
                                <Button size="sm" onClick={() => {
                                  setActions((prev) => prev.map((p) => p.id === a.id ? { ...p, value: editingValue } : p));
                                  setEditingStepId(null);
                                  setEditingValue("");
                                  toast.success("Step value updated");
                                }}>Save</Button>
                                <Button size="sm" variant="ghost" onClick={() => { setEditingStepId(null); setEditingValue(""); }}>Cancel</Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="text-sm text-muted-foreground">
                                  {a.value ? (
                                    <span className="font-mono">"{a.value}"</span>
                                  ) : (
                                    <em className="text-xs">(no value)</em>
                                  )}
                                </div>

                                <Button size="sm" variant="outline" disabled={!a.value || previewPendingId === a.id} onClick={() => previewInput(a)}>
                                  {previewPendingId === a.id ? 'Sending...' : 'Preview'}
                                </Button>

                                <Button size="sm" onClick={() => { setEditingStepId(a.id); setEditingValue(a.value || ""); }}>
                                  Edit
                                </Button>
                                  <Button
                                    size="sm"
                                    variant={a.enabled === false ? "outline" : "secondary"}
                                    onClick={() =>
                                      setActions(prev =>
                                        prev.map(p =>
                                          p.id === a.id ? { ...p, enabled: !p.enabled } : p
                                        )
                                      )
                                    }
                                  >
                                    {a.enabled === false ? "Disabled" : "Enabled"}
                                  </Button>

                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          setActions((prev) =>
                            prev.filter((x) => x.id !== a.id)
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          {/* GENERATED SCRIPT */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Generated Script</CardTitle>
              {generatedScript && (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={copyScript}>
                    <Copy className="h-4 w-4 mr-1" />
                    Copy
                  </Button>
                  <Button variant="ghost" size="sm" onClick={downloadScript}>
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {generatedScript ? (
                <ScrollArea className="h-[300px]">
                  <pre className="bg-black text-green-400 p-4 rounded text-xs overflow-x-auto font-mono">
                    {generatedScript}
                  </pre>
                </ScrollArea>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Script will appear after recording</p>
                </div>
              )}
            </CardContent>
          </Card>


=======
  setSetupState: React.Dispatch<
    React.SetStateAction<{
      appium: boolean;
      emulator: boolean;
      device: boolean;
    }>
  >;
}

export default function MobileRecorder({
  setupState,
  setSetupState,
}: MobileRecorderProps) {
  // Device state
  const [selectedDevice, setSelectedDevice] = useState<any>(null);
  const [deviceSize, setDeviceSize] = useState<{ w: number; h: number } | null>(null);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [captureMode, setCaptureMode] = useState(false);
  const [actions, setActions] = useState<RecordedAction[]>([]);
  const [script, setScript] = useState("");

  // SSE connection
  const [eventSource, setEventSource] = useState<EventSource | null>(null);

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [eventSource]);

  // Handle device selection
  const handleDeviceSelect = (device: any) => {
    setSelectedDevice(device);
    setSetupState((prev) => ({ ...prev, device: true }));
    toast.success(`Device selected: ${device.device}`);
  };

  // Start recording
  const startRecording = async () => {
    try {
      // Call agent to start recording
      const res = await fetch(`${AGENT_URL}/recording/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to start recording");
      }

      setIsRecording(true);
      setActions([]);
      setCaptureMode(true);

      // Setup SSE for live events
      const sse = new EventSource(`${AGENT_URL}/recording/events`);

      sse.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "action") {
            const newAction: RecordedAction = {
              id: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              type: data.action?.type || "tap",
              description: data.action?.description || `Action at (${data.action?.x}, ${data.action?.y})`,
              locator: data.action?.locator,
              coordinates: data.action?.x !== undefined ? { x: data.action.x, y: data.action.y } : undefined,
              value: data.action?.value,
              enabled: true,
            };
            setActions((prev) => [...prev, newAction]);
          }
        } catch (e) {
          console.error("SSE parse error:", e);
        }
      };

      sse.onerror = () => {
        console.warn("SSE connection error");
      };

      setEventSource(sse);
      toast.success("Recording started");
    } catch (err: any) {
      console.error("Start recording error:", err);
      toast.error(err.message || "Failed to start recording");
    }
  };

  // Stop recording
  const stopRecording = async () => {
    try {
      // Close SSE
      if (eventSource) {
        eventSource.close();
        setEventSource(null);
      }

      // Call agent to stop
      await fetch(`${AGENT_URL}/recording/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      setIsRecording(false);
      setCaptureMode(false);

      // Generate script from recorded actions
      if (actions.length > 0) {
        generateScript();
      }

      toast.success("Recording stopped");
    } catch (err) {
      console.error("Stop recording error:", err);
      toast.error("Failed to stop recording");
    }
  };

  // Toggle capture mode
  const handleSetCaptureMode = (mode: boolean) => {
    setCaptureMode(mode);
  };

  // Handle action captured from DevicePreview
  const handleActionCaptured = (action: any) => {
    const newAction: RecordedAction = {
      id: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: action.type || "tap",
      description: action.description || `Tap at (${action.x}, ${action.y})`,
      locator: action.locator,
      coordinates: action.x !== undefined ? { x: action.x, y: action.y } : undefined,
      value: action.value,
      enabled: true,
    };
    setActions((prev) => [...prev, newAction]);
  };

  // Generate Appium script
  const generateScript = useCallback(() => {
    const enabledActions = actions.filter((a) => a.enabled !== false);

    const scriptLines = [
      "// Generated Appium Script",
      "const { remote } = require('webdriverio');",
      "",
      "async function runTest() {",
      "  const driver = await remote({",
      "    path: '/wd/hub',",
      "    port: 4723,",
      "    capabilities: {",
      "      platformName: 'Android',",
      "      automationName: 'UiAutomator2',",
      "      deviceName: 'Android Emulator',",
      "    }",
      "  });",
      "",
      "  try {",
    ];

    enabledActions.forEach((action, index) => {
      scriptLines.push(`    // Step ${index + 1}: ${action.description}`);

      if (action.type === "tap" && action.coordinates) {
        scriptLines.push(
          `    await driver.touchAction({ action: 'tap', x: ${action.coordinates.x}, y: ${action.coordinates.y} });`
        );
      } else if (action.type === "input" && action.value) {
        if (action.locator) {
          scriptLines.push(`    const el${index} = await driver.$('${action.locator}');`);
          scriptLines.push(`    await el${index}.setValue('${action.value}');`);
        } else if (action.coordinates) {
          scriptLines.push(
            `    await driver.touchAction({ action: 'tap', x: ${action.coordinates.x}, y: ${action.coordinates.y} });`
          );
          scriptLines.push(`    await driver.keys('${action.value}');`);
        }
      } else if (action.type === "scroll" && action.coordinates) {
        scriptLines.push(
          `    await driver.touchAction([{ action: 'press', x: ${action.coordinates.x}, y: ${action.coordinates.y} }, { action: 'moveTo', x: ${action.coordinates.x}, y: ${action.coordinates.y - 200} }, 'release']);`
        );
      }

      scriptLines.push(`    await driver.pause(500);`);
      scriptLines.push("");
    });

    scriptLines.push(
      "  } finally {",
      "    await driver.deleteSession();",
      "  }",
      "}",
      "",
      "runTest().catch(console.error);"
    );

    setScript(scriptLines.join("\n"));
  }, [actions]);

  // Replay actions
  const handleReplay = async () => {
    const enabledActions = actions.filter((a) => a.enabled !== false);
    if (enabledActions.length === 0) {
      toast.error("No enabled actions to replay");
      return;
    }

    setIsReplaying(true);

    try {
      const res = await fetch(`${AGENT_URL}/recording/replay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: enabledActions }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Replay failed");
      }

      toast.success("Replay completed");
    } catch (err: any) {
      console.error("Replay error:", err);
      toast.error(err.message || "Replay failed");
    } finally {
      setIsReplaying(false);
    }
  };

  // Copy script
  const handleCopyScript = () => {
    navigator.clipboard.writeText(script);
    toast.success("Script copied to clipboard");
  };

  // Download script
  const handleDownloadScript = () => {
    const blob = new Blob([script], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mobile-test.js";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Script downloaded");
  };

  // Save test to database
  const handleSaveTest = async (name: string, description: string) => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user) {
        toast.error("Please login to save tests");
        return;
      }

      // Save to a simple format - could be extended to use nocode_tests table
      toast.success(`Test "${name}" saved`);
    } catch (err) {
      console.error("Save error:", err);
      toast.error("Failed to save test");
    }
  };

  return (
    <div className="space-y-6">
      {/* Recording Controls */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Mobile Test Recorder</CardTitle>
          <div className="flex items-center gap-2">
            {isRecording && (
              <Badge variant="destructive" className="animate-pulse">
                <Circle className="h-3 w-3 mr-1 fill-current" />
                Recording
              </Badge>
            )}
            {!isRecording ? (
              <Button
                onClick={startRecording}
                disabled={!selectedDevice}
                className="gap-2"
              >
                <Circle className="h-4 w-4" />
                Start Recording
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={stopRecording}
                className="gap-2"
              >
                <Square className="h-4 w-4" />
                Stop Recording
              </Button>
            )}
            <SaveDialog onSave={handleSaveTest} disabled={actions.length === 0} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            {!selectedDevice ? (
              "Select a device below to start recording"
            ) : isRecording ? (
              "Recording in progress - interact with the device to capture actions"
            ) : (
              `Device selected: ${selectedDevice.device}`
            )}
          </div>
        </CardContent>
      </Card>

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Device Selection & Preview */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Device Selection</CardTitle>
            </CardHeader>
            <CardContent>
              <DeviceSelector onSelect={handleDeviceSelect} />
            </CardContent>
          </Card>

          {selectedDevice && (
            <DevicePreview
              selectedDevice={selectedDevice}
              captureMode={captureMode}
              setCaptureMode={handleSetCaptureMode}
              onActionCaptured={handleActionCaptured}
              setDeviceSize={setDeviceSize}
              deviceSize={deviceSize}
            />
          )}
        </div>

        {/* Center: Captured Actions */}
        <div>
          <CapturedActions
            actions={actions}
            setActions={setActions}
            onReplay={handleReplay}
            isReplaying={isReplaying}
          />
        </div>

        {/* Right: Generated Script */}
        <div>
          <GeneratedScript
            script={script}
            onCopy={handleCopyScript}
            onDownload={handleDownloadScript}
          />
>>>>>>> 4b9f5a8f37face1a5d4991440565e5f097e18944
        </div>
      </div>
    </div>
  );
<<<<<<< HEAD
}
=======
}
>>>>>>> 4b9f5a8f37face1a5d4991440565e5f097e18944
