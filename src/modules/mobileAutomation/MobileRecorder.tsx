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
    if (actions.length === 0) {
      toast.error("No actions recorded");
      return;
    }

    setIsRunning(true);
    toast.info("Running test on BrowserStack...");

    try {
      const res = await fetch(
        "https://<PROJECT_ID>.supabase.co/functions/v1/mobile-execution",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            projectId,
            actions,
            appUrl: "bs://<BROWSERSTACK_APP_ID>",
          }),
        }
      );

      const data = await res.json();

      if (data.success) {
        toast.success("Execution started successfully");
      } else {
        toast.error(data.error || "Execution failed");
      }
    } catch {
      toast.error("Failed to start execution");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold">Mobile No-Code Automation</h2>
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
            <p className="text-muted-foreground">No actions recorded yet</p>
          ) : (
            actions.map((a, i) => (
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
