import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Trash2, Smartphone } from "lucide-react";
import { toast } from "sonner";

import DeviceSelector from "./DeviceSelector";

/* ---------------- TYPES ---------------- */

interface RecordedAction {
  id: string;
  type: "tap" | "input" | "wait" | "assert";
  locator?: string;
  value?: string;
  duration?: number;
}

interface SelectedDevice {
  device: string;
  os_version: string;
  real_mobile: boolean;
}

/* ---------------- CONSTANTS ---------------- */

const SUPABASE_FN =
  "https://lwlqfrsqwyvwqveqksuz.supabase.co/functions/v1/mobile-execution";

const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/* ---------------- COMPONENT ---------------- */

export default function MobileRecorder() {
  const [actions, setActions] = useState<RecordedAction[]>([]);
  const [selectedDevice, setSelectedDevice] =
    useState<SelectedDevice | null>(null);
  const [running, setRunning] = useState(false);

  /* ---------------- EXECUTION ---------------- */

  const runOnBrowserStack = async () => {
    if (actions.length === 0) {
      toast.error("No actions recorded");
      return;
    }

    if (!selectedDevice) {
      toast.error("Please select a device before execution");
      return;
    }

    setRunning(true);
    toast.info("Sending execution to BrowserStack...");

    try {
      const res = await fetch(SUPABASE_FN, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({
          projectId: "demo-project",
          appUrl: "bs://acd0aca715e48bd633ed84879e31bc3caa2a0dc1",
          actions,
          device: selectedDevice,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "Execution failed");
      }

      toast.success("Execution queued successfully");
    } catch (e) {
      toast.error("Failed to start execution");
    } finally {
      setRunning(false);
    }
  };

  /* ---------------- UI ---------------- */

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold">Mobile Recorder</h2>
        <Badge variant={running ? "destructive" : "secondary"}>
          {running ? "Running" : "Idle"}
        </Badge>
      </div>

      {/* DEVICE SELECTOR */}
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
            <p className="mt-3 text-sm text-muted-foreground">
              Selected:{" "}
              <strong>
                {selectedDevice.device} (Android {selectedDevice.os_version})
              </strong>
            </p>
          )}
        </CardContent>
      </Card>

      {/* ACTIONS */}
      <Card>
        <CardHeader>
          <CardTitle>Recorded Actions</CardTitle>
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
              <span>
                {i + 1}. {a.type} — {a.locator || a.value}
              </span>
              <Button
                size="icon"
                variant="ghost"
                onClick={() =>
                  setActions(actions.filter((x) => x.id !== a.id))
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <Button
            className="w-full mt-4"
            onClick={runOnBrowserStack}
            disabled={running}
          >
            <Play className="mr-2 h-4 w-4" />
            Run on BrowserStack
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
