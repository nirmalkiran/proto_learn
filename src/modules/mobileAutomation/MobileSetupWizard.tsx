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
  Cloud,
} from "lucide-react";
import { toast } from "sonner";

/* ---------------- TYPES ---------------- */

interface CheckResult {
  status: "pending" | "checking" | "success" | "error";
  message: string;
}

/* ---------------- CONSTANTS ---------------- */

const SUPABASE_FN =
  "https://lwlqfrsqwyvwqveqksuz.supabase.co/functions/v1/mobile-execution";

const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/* ---------------- COMPONENT ---------------- */

export default function MobileSetupWizard() {
  const [checks, setChecks] = useState<Record<string, CheckResult>>({
    browserstack: { status: "pending", message: "Not checked" },
  });

  const updateCheck = (key: string, result: CheckResult) => {
    setChecks((prev) => ({ ...prev, [key]: result }));
  };

  /* ---------------- CHECK BROWSERSTACK ---------------- */

  const checkBrowserStack = async () => {
    updateCheck("browserstack", {
      status: "checking",
      message: "Validating BrowserStack credentials...",
    });

    try {
      const res = await fetch(SUPABASE_FN, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({
          type: "auth-check",
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      updateCheck("browserstack", {
        status: "success",
        message: "BrowserStack connected successfully",
      });

      toast.success("BrowserStack verified");
    } catch {
      updateCheck("browserstack", {
        status: "error",
        message: "BrowserStack connection failed",
      });

      toast.error("BrowserStack verification failed");
    }
  };

  const getStatusIcon = (status: CheckResult["status"]) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "error":
        return <XCircle className="h-5 w-5 text-red-500" />;
      case "checking":
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      default:
        return (
          <div className="h-5 w-5 rounded-full border-2 border-muted-foreground" />
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Cloud Setup Wizard</h2>
        <Button onClick={checkBrowserStack}>
          <RefreshCw className="mr-2 h-4 w-4" /> Run Check
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>BrowserStack Status</CardTitle>
          <CardDescription>
            Verify cloud setup before running mobile automation
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="flex items-center gap-4 p-4 rounded-lg border">
            <Cloud className="h-6 w-6 text-muted-foreground" />
            <div className="flex-1">
              <p className="font-medium">BrowserStack Access</p>
              <p className="text-sm text-muted-foreground">
                {checks.browserstack.message}
              </p>
            </div>
            {getStatusIcon(checks.browserstack.status)}
          </div>
        </CardContent>
      </Card>

      {checks.browserstack.status === "success" && (
        <Card className="border-green-500/40 bg-green-500/5">
          <CardContent className="pt-6 flex gap-3">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
            <div>
              <p className="font-semibold text-green-700">
                Cloud environment ready
              </p>
              <p className="text-sm text-green-600">
                You can now select devices and run tests on BrowserStack
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
