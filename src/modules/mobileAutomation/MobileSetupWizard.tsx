import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Server,
  Smartphone,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";

interface CheckResult {
  status: "pending" | "checking" | "success" | "error";
  message: string;
}

const SUPABASE_FN =
  "https://lwlqfrsqwyvwqveqksuz.supabase.co/functions/v1/mobile-execution";

const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export default function MobileSetupWizard() {
  const [checks, setChecks] = useState<Record<string, CheckResult>>({
    browserstack: { status: "pending", message: "Not checked" },
    devices: { status: "pending", message: "Not checked" },
    apps: { status: "pending", message: "Not checked" },
  });

  const update = (key: string, value: CheckResult) =>
    setChecks((p) => ({ ...p, [key]: value }));

  /* ---------------- RUN ALL CHECKS ---------------- */
  const runAllChecks = async () => {
    toast.info("Checking BrowserStack setup...");

    update("browserstack", { status: "checking", message: "Connecting..." });
    update("devices", { status: "pending", message: "Waiting..." });
    update("apps", { status: "pending", message: "Waiting..." });

    try {
      const res = await fetch(SUPABASE_FN, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ type: "health-check" }),
      });

      const data = await res.json();

      if (!data.success) throw new Error(data.error);

      update("browserstack", {
        status: "success",
        message: "BrowserStack connected",
      });

      update("devices", {
        status: data.devices > 0 ? "success" : "error",
        message:
          data.devices > 0
            ? `${data.devices} cloud devices available`
            : "No devices available",
      });

      update("apps", {
        status: data.apps > 0 ? "success" : "error",
        message:
          data.apps > 0
            ? `${data.apps} apps uploaded`
            : "No apps uploaded",
      });

      toast.success("Cloud setup verified");
    } catch (e) {
      update("browserstack", {
        status: "error",
        message: "BrowserStack connection failed",
      });
      update("devices", { status: "error", message: "Unavailable" });
      update("apps", { status: "error", message: "Unavailable" });
      toast.error("Setup check failed");
    }
  };

  const icon = (s: CheckResult["status"]) =>
    s === "success" ? (
      <CheckCircle2 className="h-5 w-5 text-green-500" />
    ) : s === "error" ? (
      <XCircle className="h-5 w-5 text-red-500" />
    ) : s === "checking" ? (
      <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
    ) : (
      <div className="h-5 w-5 rounded-full border" />
    );

  const items = [
    { key: "browserstack", label: "BrowserStack Access", icon: Server },
    { key: "devices", label: "Cloud Devices", icon: Smartphone },
    { key: "apps", label: "Uploaded Apps", icon: Terminal },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <h2 className="text-xl font-bold">Cloud Setup Wizard</h2>
        <Button onClick={runAllChecks}>
          <RefreshCw className="mr-2 h-4 w-4" /> Run All Checks
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>BrowserStack Status</CardTitle>
          <CardDescription>
            Verify cloud setup before running mobile automation
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {items.map(({ key, label, icon: Icon }) => (
            <div
              key={key}
              className="flex items-center gap-4 p-4 border rounded-lg"
            >
              <Icon className="h-6 w-6 text-muted-foreground" />
              <div className="flex-1">
                <p className="font-medium">{label}</p>
                <p className="text-sm text-muted-foreground">
                  {checks[key].message}
                </p>
              </div>
              {icon(checks[key].status)}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
