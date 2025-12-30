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
  Power,
} from "lucide-react";
import { toast } from "sonner";

/* =====================================================
 * TYPES
 * ===================================================== */

interface CheckResult {
  status: "pending" | "checking" | "success" | "error";
  message: string;
}

const AGENT_URL = "http://localhost:3001";

/* =====================================================
 * COMPONENT
 * ===================================================== */

export default function MobileSetupWizard({
  setupState,
  setSetupState,
}: {
  setupState: {
    appium: boolean;
    emulator: boolean;
    device: boolean;
  };
  setSetupState: (v: any) => void;
}) {
  const [checks, setChecks] = useState<Record<string, CheckResult>>({
    appium: { status: "pending", message: "Not checked" },
    emulator: { status: "pending", message: "Not checked" },
    device: { status: "pending", message: "Not checked" },
    agent: { status: "pending", message: "Not checked" },
    backend: { status: "pending", message: "Not checked" },
  });

  const update = (key: string, value: CheckResult) =>
    setChecks((prev) => ({ ...prev, [key]: value }));

  /* =====================================================
   * CHECK: APPIUM
   * ===================================================== */
  const checkAppium = async () => {
    update("appium", { status: "checking", message: "Checking Appium..." });

    try {
      const res = await fetch(`${AGENT_URL}/appium/status`);
      const data = await res.json();

      if (!data.running) throw new Error();

      update("appium", {
        status: "success",
        message: `Appium running (v${data.version})`,
      });

      setSetupState((prev: any) => ({ ...prev, appium: true }));
    } catch {
      update("appium", {
        status: "error",
        message: "Appium not running",
      });
      setSetupState((prev: any) => ({ ...prev, appium: false }));
    }
  };

  /* =====================================================
   * CHECK: EMULATOR
   * ===================================================== */
  const checkEmulator = async () => {
    update("emulator", {
      status: "checking",
      message: "Checking emulator...",
    });

    try {
      const res = await fetch(`${AGENT_URL}/emulator/status`);
      const data = await res.json();

      if (!data.running) throw new Error();

      update("emulator", {
        status: "success",
        message: "Emulator running",
      });

      setSetupState((prev: any) => ({ ...prev, emulator: true }));
    } catch {
      update("emulator", {
        status: "error",
        message: "Emulator not running",
      });
      setSetupState((prev: any) => ({ ...prev, emulator: false }));
    }
  };

  /* =====================================================
   * CHECK: DEVICE
   * ===================================================== */
  const checkDevice = async () => {
    update("device", {
      status: "checking",
      message: "Checking ADB device...",
    });

    try {
      const res = await fetch(`${AGENT_URL}/device/check`);
      const data = await res.json();

      if (!data.connected) throw new Error();

      update("device", {
        status: "success",
        message: "ADB device detected",
      });

      setSetupState((prev: any) => ({ ...prev, device: true }));
    } catch {
      update("device", {
        status: "error",
        message: "No device detected",
      });
      setSetupState((prev: any) => ({ ...prev, device: false }));
    }
  };

  /* =====================================================
   * START APPIUM
   * ===================================================== */
  const startAppium = async () => {
    toast.info("Starting Appium...");
    await fetch(`${AGENT_URL}/terminal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "appium:start" }),
    });
    setTimeout(checkAppium, 3000);
  };
  const startBackend = async () => {
    toast.info("Starting backend...");
    try {
      await fetch(`${AGENT_URL}/backend/start`, { method: "POST" });
      update("backend", {
        status: "success",
        message: "Backend running",
      });
      toast.success("Backend started");
    } catch {
      update("backend", {
        status: "error",
        message: "Failed to start backend",
      });
      toast.error("Backend failed");
    }
  };
  const startAgent = async () => {
    toast.info("Starting local agent...");
    try {
      await fetch(`${AGENT_URL}/agent/start`, { method: "POST" });
      update("agent", {
        status: "success",
        message: "Agent running",
      });
      toast.success("Agent started");
    } catch {
      update("agent", {
        status: "error",
        message: "Failed to start agent",
      });
      toast.error("Agent failed");
    }
  };

  /* =====================================================
   * START EMULATOR
   * ===================================================== */
  const startEmulator = async () => {
    toast.info("Starting emulator...");
    await fetch(`${AGENT_URL}/terminal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "emulator Pixel_nirmal" }),
    });
    setTimeout(checkEmulator, 6000);
  };

  const runAllChecks = async () => {
    await checkAppium();
    await checkEmulator();
    await checkDevice();
  };

  const icon = (status: CheckResult["status"]) =>
    status === "success" ? (
      <CheckCircle2 className="h-5 w-5 text-green-500" />
    ) : status === "error" ? (
      <XCircle className="h-5 w-5 text-red-500" />
    ) : status === "checking" ? (
      <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
    ) : (
      <div className="h-5 w-5 rounded-full border" />
    );

  const items = [
    { key: "backend", label: "Backend Server", icon: Server },
    { key: "agent", label: "Local Agent", icon: Server },
    { key: "appium", label: "Appium Server", icon: Server },
    { key: "emulator", label: "Android Emulator", icon: Terminal },
    { key: "device", label: "ADB Device", icon: Smartphone },
  ];


  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Local Setup Wizard</h2>
        <Button onClick={runAllChecks}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Run All Checks
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={startEmulator}>
          <Power className="mr-2 h-4 w-4" />
          Start Emulator
        </Button>

        <Button variant="outline" onClick={startAppium}>
          <Power className="mr-2 h-4 w-4" />
          Start Appium
        </Button>

        <Button variant="outline" onClick={startBackend}>
          <Power className="mr-2 h-4 w-4" />
          Start Backend
        </Button>

        <Button variant="outline" onClick={startAgent}>
          <Power className="mr-2 h-4 w-4" />
          Start Agent
        </Button>
      </div>


      <Card>
        <CardHeader>
          <CardTitle>System Status</CardTitle>
          <CardDescription>
            Verify local environment before recording
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.map(({ key, label, icon: Icon }) => (
            <div key={key} className="flex items-center gap-4 p-4 border rounded-lg">
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
