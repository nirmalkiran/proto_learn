import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Play, Square, Trash2, RefreshCw, Copy, Download } from "lucide-react";

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

/* =====================================================
 * COMPONENT
 * ===================================================== */

export default function MobileRecorder({
  setupState,
}: {
  setupState: {
    appium: boolean;
    emulator: boolean;
    device: boolean;
  };
}) {
  const [recording, setRecording] = useState(false);
  const [actions, setActions] = useState<RecordedAction[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<any>(null);
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
   * ▶ START RECORDING
   * ===================================================== */

  const startRecording = async () => {
    if (!setupState.appium || !setupState.emulator || !setupState.device) {
      toast.error("Complete setup before recording");
      return;
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
            <Button onClick={startRecording}>
              <Play className="mr-2 h-4 w-4" />
              Start Recording
            </Button>
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
          <CardHeader>
            <CardTitle>Device Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg h-[500px] flex flex-col items-center justify-center bg-muted gap-3">
              <span className="text-sm text-muted-foreground text-center">
                Live device mirror (scrcpy)
              </span>

              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const res = await fetch(`${AGENT_URL}/device/mirror`, {
                      method: "POST",
                    });
                    const data = await res.json();

                    if (!data.success) throw new Error(data.error);
                    toast.success("Device mirror started");
                  } catch (err: any) {
                    toast.error("Failed to start device mirror", {
                      description: err.message || "Make sure scrcpy is installed",
                    });
                  }
                }}
              >
                Open Device Mirror
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                A native window will open showing your device
              </p>
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
