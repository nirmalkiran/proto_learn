import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);

interface Execution {
  id: string;
  project_id: string;
  status: string;
  created_at: string;
}

export default function MobileExecutionHistory() {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("mobile_execution_history")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[MobileExecutionHistory] Fetch error:", error);
        setExecutions([]);
      } else {
        setExecutions(data || []);
      }
    } catch (err) {
      console.error("[MobileExecutionHistory] Unexpected error:", err);
      setExecutions([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Execution History</CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {loading && <p>Loading...</p>}

        {!loading && executions.length === 0 && (
          <p className="text-muted-foreground">
            No executions yet
          </p>
        )}

        {executions.map((e) => (
          <div
            key={e.id}
            className="flex justify-between items-center p-3 border rounded"
          >
            <div>
              <p className="font-medium">
                {e.project_id}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(e.created_at).toLocaleString()}
              </p>
            </div>

            <Badge
              variant={
                e.status === "QUEUED"
                  ? "secondary"
                  : e.status === "RUNNING"
                  ? "default"
                  : e.status === "FAILED"
                  ? "destructive"
                  : "outline"
              }
            >
              {e.status}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
