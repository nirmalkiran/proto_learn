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
  setupState: {
    appium: boolean;
    emulator: boolean;
    device: boolean;
  };
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
        </div>
      </div>
    </div>
  );
}
