import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Play, Square, Trash2, RefreshCw, Copy, Download, Monitor, Smartphone, Wifi, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

import DeviceSelector from "./DeviceSelector";

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
  setupState: {
    appium: boolean;
    emulator: boolean;
    device: boolean;
  };
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

        if (event.type && event.description) {
          const newAction: RecordedAction = {
            id: crypto.randomUUID(),
            type: event.type as ActionType,
            description: event.description,
            locator: event.locator || "//android.view.View",
            value: event.value,
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
  }, [recording]);

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
        clearInterval(screenshotIntervalRef.current);
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
   * 📱 CONNECT DEVICE - EMBEDDED MIRROR
   * ===================================================== */

  const connectDevice = async () => {
    if (!selectedDevice) {
      toast.error("Select a device first");
      return;
    }

    setMirrorError(null);
    setMirrorLoading(true);

    try {
      // Verify device is connected
      const deviceRes = await fetch(`${AGENT_URL}/device/check`);
      const deviceData = await deviceRes.json();

      if (!deviceData.connected) {
        setMirrorError("No device connected. Start an emulator or connect a device via ADB.");
        setMirrorLoading(false);
        toast.error("No device connected");
        return;
      }

      // Start embedded screenshot streaming
      setMirrorActive(true);
      setMirrorLoading(false);
      startScreenshotStream();

      toast.success("Device connected", {
        description: "Live preview active - interact with your device",
      });
    } catch (err: any) {
      setMirrorLoading(false);
      setMirrorError("Cannot connect to local helper. Run: npm start in tools/mobile-automation-helper");
      toast.error("Local helper not running");
    }
  };

  /* =====================================================
   * 📷 SCREENSHOT STREAM FOR EMBEDDED PREVIEW
   * ===================================================== */

  const startScreenshotStream = () => {
    if (screenshotIntervalRef.current) {
      clearInterval(screenshotIntervalRef.current);
    }

    const captureScreenshot = async () => {
      try {
        const res = await fetch(`${AGENT_URL}/device/screenshot`);
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          setMirrorImage((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
        }
      } catch {
        // Connection lost
        setMirrorActive(false);
        setMirrorError("Connection lost to device");
        if (screenshotIntervalRef.current) {
          clearInterval(screenshotIntervalRef.current);
        }
      }
    };

    // Capture immediately then every 150ms for smooth updates
    captureScreenshot();
    screenshotIntervalRef.current = setInterval(captureScreenshot, 150);
  };

  const disconnectDevice = () => {
    setMirrorActive(false);
    setMirrorImage(null);
    setMirrorError(null);
    if (screenshotIntervalRef.current) {
      clearInterval(screenshotIntervalRef.current);
      screenshotIntervalRef.current = null;
    }
    toast.info("Device disconnected");
  };

  /* =====================================================
   * ▶ START RECORDING
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
   * ⏹ STOP RECORDING
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

      if (!res.ok) throw new Error("Replay request failed");

      toast.success("Replay started", {
        description: "Replaying steps on your connected device",
      });
    } catch (err) {
      console.error("[MobileRecorder] Replay error:", err);
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
        return `${comment}\n    await driver.$("${a.locator}").setValue("${a.value || ''}");`;
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
              {connectionStatus === "connected" ? "🔴 Recording" : "⏳ Connecting..."}
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
                disabled={actions.length === 0}
              >
                <Play className="mr-2 h-4 w-4" />
                Replay
              </Button>
            </>
          ) : (
            <Button variant="destructive" onClick={stopRecording}>
              <Square className="mr-2 h-4 w-4" />
              Stop Recording
            </Button>
          )}
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
                width: DEVICE_WIDTH, 
                height: DEVICE_HEIGHT,
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
                      className="w-full h-full object-contain"
                    />
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="absolute bottom-8 bg-background/80 backdrop-blur-sm"
                      onClick={disconnectDevice}
                    >
                      <WifiOff className="h-3 w-3 mr-1" />
                      Disconnect
                    </Button>
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
                      className="flex justify-between items-center p-2 border rounded mb-2 hover:bg-muted/50"
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
        </div>
      </div>
    </div>
  );
}
