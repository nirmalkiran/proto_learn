import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Loader2, RefreshCw, Terminal, Smartphone, Server, Wifi } from "lucide-react";
import { toast } from "sonner";

interface CheckResult {
  status: "pending" | "checking" | "success" | "error";
  message: string;
}

export default function MobileSetupWizard() {
  const [checks, setChecks] = useState<Record<string, CheckResult>>({
    backend: { status: "pending", message: "Not checked" },
    appium: { status: "pending", message: "Not checked" },
    adb: { status: "pending", message: "Not checked" },
    device: { status: "pending", message: "Not checked" },
  });

  const updateCheck = (key: string, result: CheckResult) => {
    setChecks((prev) => ({ ...prev, [key]: result }));
  };

  const checkBackend = async () => {
    updateCheck("backend", { status: "checking", message: "Connecting..." });
    try {
      const res = await fetch("http://localhost:3001/api/health", { 
        method: "GET",
        signal: AbortSignal.timeout(5000) 
      });
      if (res.ok) {
        updateCheck("backend", { status: "success", message: "Backend running on port 3001" });
        return true;
      } else {
        throw new Error("Unhealthy");
      }
    } catch {
      updateCheck("backend", { 
        status: "error", 
        message: "Not running. Start with: node server.js" 
      });
      return false;
    }
  };

  const checkAppium = async () => {
    updateCheck("appium", { status: "checking", message: "Connecting..." });
    try {
      const res = await fetch("http://localhost:4723/status", { 
        method: "GET",
        signal: AbortSignal.timeout(5000) 
      });
      if (res.ok) {
        const data = await res.json();
        updateCheck("appium", { 
          status: "success", 
          message: `Appium ${data.value?.build?.version || "server"} running` 
        });
        return true;
      } else {
        throw new Error("Not responding");
      }
    } catch {
      updateCheck("appium", { 
        status: "error", 
        message: "Not running. Start with: appium --port 4723" 
      });
      return false;
    }
  };

  const checkAdbAndDevice = async () => {
    updateCheck("adb", { status: "checking", message: "Checking..." });
    updateCheck("device", { status: "checking", message: "Checking..." });
    
    try {
      const res = await fetch("http://localhost:3001/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "adb devices" }),
        signal: AbortSignal.timeout(10000),
      });
      
      const data = await res.json();
      
      if (data.success && data.output) {
        updateCheck("adb", { status: "success", message: "ADB available" });
        
        // Parse device list
        const lines = data.output.split("\n").filter((l: string) => l.includes("\tdevice"));
        if (lines.length > 0) {
          updateCheck("device", { 
            status: "success", 
            message: `${lines.length} device(s) connected` 
          });
        } else {
          updateCheck("device", { 
            status: "error", 
            message: "No devices. Connect device or start emulator" 
          });
        }
      } else {
        throw new Error("ADB not available");
      }
    } catch {
      updateCheck("adb", { 
        status: "error", 
        message: "Backend required to check ADB" 
      });
      updateCheck("device", { 
        status: "pending", 
        message: "Requires ADB check first" 
      });
    }
  };

  const runAllChecks = async () => {
    toast.info("Running connectivity checks...");
    
    const backendOk = await checkBackend();
    await checkAppium();
    
    if (backendOk) {
      await checkAdbAndDevice();
    } else {
      updateCheck("adb", { status: "pending", message: "Requires backend" });
      updateCheck("device", { status: "pending", message: "Requires backend" });
    }
    
    toast.success("Checks complete");
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
        return <div className="h-5 w-5 rounded-full border-2 border-muted-foreground" />;
    }
  };

  const checkItems = [
    { key: "backend", label: "Backend Server", icon: Server, desc: "Local Node.js server (port 3001)" },
    { key: "appium", label: "Appium Server", icon: Terminal, desc: "Appium automation server (port 4723)" },
    { key: "adb", label: "Android Debug Bridge", icon: Wifi, desc: "ADB tool from Android SDK" },
    { key: "device", label: "Device/Emulator", icon: Smartphone, desc: "Connected Android device" },
  ];

  const allPassed = Object.values(checks).every((c) => c.status === "success");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Setup Wizard</h2>
        <Button onClick={runAllChecks}>
          <RefreshCw className="mr-2 h-4 w-4" /> Run All Checks
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connectivity Status</CardTitle>
          <CardDescription>
            Verify all components are running before using mobile automation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {checkItems.map((item) => {
            const check = checks[item.key];
            const Icon = item.icon;
            return (
              <div
                key={item.key}
                className={`flex items-center gap-4 p-4 rounded-lg border transition-colors ${
                  check.status === "success"
                    ? "bg-green-500/5 border-green-500/30"
                    : check.status === "error"
                    ? "bg-red-500/5 border-red-500/30"
                    : "bg-muted/50"
                }`}
              >
                <Icon className="h-6 w-6 text-muted-foreground" />
                <div className="flex-1">
                  <p className="font-medium">{item.label}</p>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                  <p className={`text-sm mt-1 ${
                    check.status === "success" ? "text-green-600" : 
                    check.status === "error" ? "text-red-600" : "text-muted-foreground"
                  }`}>
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
        <Card className="border-green-500/50 bg-green-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
              <div>
                <p className="font-semibold text-green-700">All Systems Ready!</p>
                <p className="text-sm text-green-600">
                  You can now use Record & Playback, Inspector, and Terminal features.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Quick Setup Commands</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="bg-zinc-950 text-zinc-100 p-4 rounded-lg font-mono text-sm space-y-2">
            <p className="text-zinc-500"># 1. Install Appium</p>
            <p>npm install -g appium</p>
            <p className="text-zinc-500 mt-3"># 2. Install UiAutomator2 driver</p>
            <p>appium driver install uiautomator2</p>
            <p className="text-zinc-500 mt-3"># 3. Start Appium server</p>
            <p>appium --port 4723</p>
            <p className="text-zinc-500 mt-3"># 4. Setup and start backend</p>
            <p>mkdir mobile-backend && cd mobile-backend</p>
            <p>npm init -y && npm install express cors axios</p>
            <p># Copy public/backend/server.js here</p>
            <p>node server.js</p>
            <p className="text-zinc-500 mt-3"># 5. Connect device or start emulator</p>
            <p>adb devices</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
