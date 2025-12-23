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
  Terminal,
  Smartphone,
  Server,
} from "lucide-react";
import { toast } from "sonner";

interface CheckResult {
  status: "pending" | "checking" | "success" | "error";
  message: string;
}

const BS_USERNAME = import.meta.env.VITE_BROWSERSTACK_USERNAME;
const BS_ACCESS_KEY = import.meta.env.VITE_BROWSERSTACK_ACCESS_KEY;

export default function MobileSetupWizard() {
  const [checks, setChecks] = useState<Record<string, CheckResult>>({
    browserstack: { status: "pending", message: "Not checked" },
    devices: { status: "pending", message: "Not checked" },
    apps: { status: "pending", message: "Not checked" },
  });

  const updateCheck = (key: string, result: CheckResult) => {
    setChecks((prev) => ({ ...prev, [key]: result }));
  };

  /* ---------------- BROWSERSTACK AUTH CHECK ---------------- */
  const checkBrowserStackAuth = async () => {
    updateCheck("browserstack", {
      status: "checking",
      message: "Validating BrowserStack credentials...",
    });

    try {
      const res = await fetch(
        "https://api.browserstack.com/app-automate/devices.json",
        {
          headers: {
            Authorization:
              "Basic " + btoa(`${BS_USERNAME}:${BS_ACCESS_KEY}`),
          },
        }
      );

      if (!res.ok) throw new Error();

      updateCheck("browserstack", {
        status: "success",
        message: "BrowserStack credentials verified",
      });
      return true;
    } catch {
      updateCheck("browserstack", {
        status: "error",
        message: "Invalid BrowserStack credentials",
      });
      return false;
    }
  };

  /* ---------------- DEVICE CHECK ---------------- */
  const checkDevices = async () => {
    updateCheck("devices", {
      status: "checking",
      message: "Fetching available devices...",
    });

    try {
      const res = await fetch(
        "https://api.browserstack.com/app-automate/devices.json",
        {
          headers: {
            Authorization:
              "Basic " + btoa(`${BS_USERNAME}:${BS_ACCESS_KEY}`),
          },
        }
      );

      const data = await res.json();

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error();
      }

      updateCheck("devices", {
        status: "success",
        message: `${data.length} cloud devices available`,
      });
    } catch {
      updateCheck("devices", {
        status: "error",
        message: "Unable to fetch devices",
      });
    }
  };

  /* ---------------- APP CHECK ---------------- */
  const checkApps = async () => {
    updateCheck("apps", {
      status: "checking",
      message: "Checking uploaded apps...",
    });

    try {
      const res = await fetch(
        "https://api.browserstack.com/app-automate/apps.json",
        {
          headers: {
            Authorization:
              "Basic " + btoa(`${BS_USERNAME}:${BS_ACCESS_KEY}`),
          },
        }
      );

      const data = await res.json();

      if (!Array.isArray(data) || data.length === 0) {
        updateCheck("apps", {
          status: "error",
          message: "No apps uploaded to BrowserStack",
        });
        return;
      }

      updateCheck("apps", {
        status: "success",
        message: `${data.length} app(s) available`,
      });
    } catch {
      updateCheck("apps", {
        status: "error",
        message: "Unable to fetch apps",
      });
    }
  };

  /* ---------------- RUN ALL ---------------- */
  const runAllChecks = async () => {
    toast.info("Running BrowserStack setup checks...");

    const authOk = await checkBrowserStackAuth();
    if (!authOk) return;

    await checkDevices();
    await checkApps();

    toast.success("BrowserStack checks completed");
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

  const checkItems = [
    { key: "browserstack", label: "BrowserStack Access", icon: Server },
    { key: "devices", label: "Cloud Devices", icon: Smartphone },
    { key: "apps", label: "Uploaded Apps", icon: Terminal },
  ];

  const allPassed = Object.values(checks).every(
    (c) => c.status === "success"
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
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
          {checkItems.map((item) => {
            const Icon = item.icon;
            const check = checks[item.key];
            return (
              <div
                key={item.key}
                className="flex items-center gap-4 p-4 rounded-lg border"
              >
                <Icon className="h-6 w-6 text-muted-foreground" />
                <div className="flex-1">
                  <p className="font-medium">{item.label}</p>
                  <p className="text-sm text-muted-foreground">
                    {check.message}
                  </p>
                </div>
                {getStatusIcon(check.status)}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {allPassed && (
        <Card className="border-green-500/40 bg-green-500/5">
          <CardContent className="pt-6 flex gap-3">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
            <div>
              <p className="font-semibold text-green-700">
                Cloud environment ready
              </p>
              <p className="text-sm text-green-600">
                You can now record, generate, and execute tests on BrowserStack
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
