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

export default function MobileRecorder({ projectId }: { projectId: string }) {
  const [actions, setActions] = useState<RecordedAction[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const runOnBrowserStack = async () => {
    if (!actions.length) {
      toast.error("No actions recorded");
      return;
    }

    setIsRunning(true);
    toast.info("Starting BrowserStack execution…");

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mobile-execution`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            projectId,
            appUrl: "bs://<YOUR_BROWSERSTACK_APP_ID>",
            actions,
          }),
        }
      );

      const data = await res.json();

      if (!data.success) throw new Error(data.error);

      toast.success("Execution started on BrowserStack");
    } catch (e: any) {
      toast.error(e.message || "Execution failed");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold">Mobile Recorder</h2>
        <Badge variant={isRunning ? "destructive" : "secondary"}>
          {isRunning ? "Running" : "Idle"}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recorded Actions</CardTitle>
        </CardHeader>
        <CardContent>
          {actions.length === 0 ? (
            <p className="text-muted-foreground">No actions yet</p>
          ) : (
            actions.map((a, i) => (
              <div
                key={a.id}
                className="flex justify-between items-center border rounded p-2 mb-2"
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
            ))
          )}

          <Button
            className="w-full mt-4"
            onClick={runOnBrowserStack}
            disabled={isRunning}
          >
            <Play className="mr-2 h-4 w-4" />
            Run on BrowserStack
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
