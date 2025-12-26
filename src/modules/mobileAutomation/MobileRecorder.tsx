import { useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Play,
  Trash2,
  Smartphone,
  Circle,
  Square,
} from "lucide-react";

import DeviceSelector from "./DeviceSelector";

/* =====================================================
 * TYPES
 * ===================================================== */

export type ActionType = "tap" | "input" | "scroll" | "wait" | "assert";

interface RecordedAction {
  id: string;
  type: ActionType;
  locator: string;
  value?: string;
  timestamp: number;
}

interface SelectedDevice {
  device: string;
  os_version: string;
  real_mobile: boolean;
}

interface RecorderProps {
  setupState: {
    appium: boolean;
    emulator: boolean;
    device: boolean;
  };
}

/* =====================================================
 * COMPONENT
 * ===================================================== */

export default function MobileRecorder({ setupState }: RecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [actions, setActions] = useState<RecordedAction[]>([]);
  const [selectedDevice, setSelectedDevice] =
    useState<SelectedDevice | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  /* =====================================================
   * RECORDING CONTROLS
   * ===================================================== */

  const startRecording = () => {
    if (!setupState.appium || !setupState.emulator || !setupState.device) {
      toast.error("Please complete Setup before recording");
      return;
    }

    if (!selectedDevice) {
      toast.error("Please select a device");
      return;
    }

    setActions([]);
    setIsRecording(true);

    toast.success("Recording started", {
      description: `Connected to ${selectedDevice.device}`,
    });
  };

  const stopRecording = () => {
    setIsRecording(false);

    toast.success("Recording stopped", {
      description: `${actions.length} actions captured`,
    });
  };

  /* =====================================================
   * ACTION CAPTURE (SIMULATED FOR NOW)
   * Real capture will come from Appium hooks later
   * ===================================================== */

  const captureAction = (type: ActionType) => {
    if (!isRecording) return;

    const newAction: RecordedAction = {
      id: crypto.randomUUID(),
      type,
      locator: "//android.widget.View", // placeholder
      timestamp: Date.now(),
    };

    setActions((prev) => [...prev, newAction]);
  };

  const removeAction = (index: number) => {
    setActions((prev) => prev.filter((_, i) => i !== index));
  };

  /* =====================================================
   * REPLAY TEST
   * ===================================================== */

  const replayTest = async () => {
    if (actions.length === 0) {
      toast.error("No actions to replay");
      return;
    }

    setIsRunning(true);
    toast.info("Replaying recorded steps...");

    // Placeholder – will call agent/Appium later
    setTimeout(() => {
      setIsRunning(false);
      toast.success("Execution completed");
    }, 2000);
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
            Record once, replay anytime
          </p>
        </div>

        <Badge variant={isRecording ? "destructive" : "secondary"}>
          {isRecording ? "Recording" : "Idle"}
        </Badge>
      </div>

      {/* DEVICE SELECTION */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Select Device
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DeviceSelector onSelect={setSelectedDevice} />

          {selectedDevice && (
            <p className="mt-2 text-sm text-muted-foreground">
              Selected:{" "}
              <strong>
                {selectedDevice.device} (Android{" "}
                {selectedDevice.os_version})
              </strong>
            </p>
          )}
        </CardContent>
      </Card>

      {/* RECORD CONTROLS */}
      <div className="flex gap-3">
        {!isRecording ? (
          <Button onClick={startRecording}>
            <Circle className="mr-2 h-4 w-4 text-red-500" />
            Start Recording
          </Button>
        ) : (
          <Button variant="destructive" onClick={stopRecording}>
            <Square className="mr-2 h-4 w-4" />
            Stop Recording
          </Button>
        )}
      </div>

      {/* QUICK ACTION SIMULATION (FOR NOW) */}
      {isRecording && (
        <Card>
          <CardHeader>
            <CardTitle>Simulate Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => captureAction("tap")}
            >
              + Tap
            </Button>
            <Button
              variant="outline"
              onClick={() => captureAction("input")}
            >
              + Input
            </Button>
            <Button
              variant="outline"
              onClick={() => captureAction("scroll")}
            >
              + Scroll
            </Button>
            <Button
              variant="outline"
              onClick={() => captureAction("wait")}
            >
              + Wait
            </Button>
          </CardContent>
        </Card>
      )}

      {/* RECORDED ACTIONS */}
      <Card>
        <CardHeader>
          <CardTitle>Recorded Steps</CardTitle>
        </CardHeader>
        <CardContent>
          {actions.length === 0 && (
            <p className="text-muted-foreground">
              No actions recorded yet
            </p>
          )}

          {actions.map((a, i) => (
            <div
              key={a.id}
              className="flex justify-between items-center p-2 border rounded mb-2"
            >
              <span className="text-sm">
                {i + 1}. {a.type} → {a.locator}
              </span>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => removeAction(i)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <Button
            className="w-full mt-4"
            onClick={replayTest}
            disabled={isRunning}
          >
            <Play className="mr-2 h-4 w-4" />
            Replay Test
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
