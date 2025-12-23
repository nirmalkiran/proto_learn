import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function MobileExecutionHistory({ projectId }: any) {
  const [runs, setRuns] = useState<any[]>([]);

  useEffect(() => {
    supabase
      .from("mobile_execution_history")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setRuns(data || []));
  }, [projectId]);

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Execution History</h2>
      {runs.map((r) => (
        <div key={r.id} className="border p-3 rounded mb-2">
          <p>Status: {r.status}</p>
          <p>Session: {r.session_id}</p>
          <p>{new Date(r.created_at).toLocaleString()}</p>
        </div>
      ))}
    </div>
  );
}
