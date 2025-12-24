import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface RecordedAction {
  id: string;
  type: "tap" | "input" | "wait" | "assert";
  locator?: string;
  value?: string;
  duration?: number;
}

const SUPABASE_FN =
  "https://lwlqfrsqwyvwqveqksuz.supabase.co/functions/v1/mobile-execution";

const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export default function MobileRecorder() {
  const [actions, setActions] = useState<RecordedAction[]>([]);
  const [running, setRunning] = useState(false);

  const runOnBrowserStack = async () => {
    if (actions.length === 0) {
      toast.error("No actions recorded");
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
          device: {
            platform: "Android",
            deviceName: "Google Pixel 7",
            osVersion: "13.0",
          },
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      toast.success("Execution queued successfully");

    } catch (e) {
      toast.error("Failed to start execution");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold">Mobile Recorder</h2>
        <Badge variant={running ? "destructive" : "secondary"}>
          {running ? "Running" : "Idle"}
        </Badge>
      </div>

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
