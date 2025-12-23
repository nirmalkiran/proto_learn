import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface ExecutionLog {
  id: string;
  status: "queued" | "running" | "passed" | "failed";
  startedAt: string;
  finishedAt?: string;
  sessionUrl?: string;
  logs?: string[];
}

export default function MobileTerminal({ projectId }: { projectId: string }) {
  const [executions, setExecutions] = useState<ExecutionLog[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchExecutions = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mobile-execution-history`,
        {
          headers: {
            Authorization: `Bearer ${
              import.meta.env.VITE_SUPABASE_ANON_KEY
            }`,
          },
        }
      );

      const data = await res.json();
      setExecutions(data.executions || []);
    } catch {
      toast.error("Failed to load execution history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExecutions();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Execution Console</h2>
        <Button onClick={fetchExecutions} variant="outline" size="sm">
          <RefreshCw
            className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>BrowserStack Executions</CardTitle>
        </CardHeader>

        <CardContent>
          <ScrollArea className="h-[400px]">
            {executions.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No executions found. Run a test from Recorder.
              </p>
            ) : (
              <div className="space-y-3">
                {executions.map((ex) => (
                  <div
                    key={ex.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="space-y-1">
                      <p className="font-medium">
                        Execution #{ex.id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Started: {new Date(ex.startedAt).toLocaleString()}
                      </p>
                      {ex.finishedAt && (
                        <p className="text-xs text-muted-foreground">
                          Finished:{" "}
                          {new Date(ex.finishedAt).toLocaleString()}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <Badge
                        variant={
                          ex.status === "passed"
                            ? "default"
                            : ex.status === "failed"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {ex.status.toUpperCase()}
                      </Badge>

                      {ex.sessionUrl && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            window.open(ex.sessionUrl, "_blank")
                          }
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="bg-muted/40">
        <CardContent className="pt-4 text-sm text-muted-foreground">
          <p className="font-medium mb-1">ℹ How this works</p>
          <ul className="list-disc ml-5 space-y-1">
            <li>Tests run on BrowserStack cloud devices</li>
            <li>No local Appium or ADB required</li>
            <li>Click 🔗 to open BrowserStack session</li>
            <li>Video, logs & screenshots available in BrowserStack</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
