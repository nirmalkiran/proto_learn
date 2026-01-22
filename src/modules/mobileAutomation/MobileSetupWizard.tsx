import React, { useState, useEffect } from "react";

// Shared Types
import { CheckResult } from "./types";

// UI Components
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Icons
import {
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Server,
  Smartphone,
  Terminal,
  Power,
  Usb,
  Wifi,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Cable,
} from "lucide-react";

// Utils
import { toast } from "sonner";

/* =====================================================
 * CONSTANTS & CONFIGURATION
 * ===================================================== */

const AGENT_URL = "http://localhost:3001";

/* =====================================================
 * WIZARD STEP CONFIGURATIONS
 * ===================================================== */

const USB_STEPS = [
  {
    id: 1,
    title: "Prerequisites",
    description: "Ensure you have the required tools installed",
  },
  {
    id: 2,
    title: "Enable Developer",
    description: "Enable Developer Options on device",
  },
  {
    id: 3,
    title: "Enable USB Debug",
    description: "Enable USB Debugging",
  },
  {
    id: 4,
    title: "Connect Device",
    description: "Connect via USB cable",
  },
  {
    id: 5,
    title: "Authorize",
    description: "Accept debugging on device",
  },
  {
    id: 6,
    title: "Verify Connection",
    description: "Verify ADB connection",
  },
];

const WIRELESS_STEPS = [
  {
    id: 1,
    title: "Prerequisites",
    description: "Ensure requirements are met",
  },
  {
    id: 2,
    title: "Enable Developer",
    description: "Enable Developer Options",
  },
  {
    id: 3,
    title: "Enable Wireless",
    description: "Enable Wireless debugging",
  },
  {
    id: 4,
    title: "Pair Device",
    description: "Pair with pairing code",
  },
  {
    id: 5,
    title: "Connect ADB",
    description: "Connect via IP address",
  },
  {
    id: 6,
    title: "Verify Connection",
    description: "Verify connection",
  },
];

/* =====================================================
 * MAIN COMPONENT
 * ===================================================== */

interface MobileSetupWizardProps {
  setupState: {
    appium: boolean;
    emulator: boolean;
    device: boolean;
  };
  setSetupState: (state: any) => void;
  selectedDevice: string;
  setSelectedDevice: (device: string) => void;
}

export default function MobileSetupWizard({
  setupState,
  setSetupState,
  selectedDevice,
  setSelectedDevice,
}: MobileSetupWizardProps) {
  // Setup state moved from index.tsx
  const [checks, setChecks] = useState<Record<string, CheckResult>>({
    backend: { status: "pending", message: "Not checked" },
    agent: { status: "pending", message: "Not checked" },
    appium: { status: "pending", message: "Not checked" },
    emulator: { status: "pending", message: "Not checked" },
    device: { status: "pending", message: "Not checked" },
  });
  const [agentDetails, setAgentDetails] = useState<any>(null);
  const [availableDevices, setAvailableDevices] = useState<string[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardTab, setWizardTab] = useState<"usb" | "wireless">("usb");
  const [wizardStep, setWizardStep] = useState(1);

  const [devicesLoading, setDevicesLoading] = useState(false);
  const [devicesFetched, setDevicesFetched] = useState(false);


  const update = (key: string, value: CheckResult) =>
    setChecks((prev) => ({ ...prev, [key]: value }));

  // Fetch available devices on component mount
  useEffect(() => {
    const initializeDevices = async () => {
      try {
        // First check if server is running
        const healthRes = await fetch(`${AGENT_URL}/health`, {
          signal: AbortSignal.timeout(2000),
        });
        if (healthRes.ok) {
          fetchAvailableDevices();
        }
      } catch {
        // Server not running, skip fetching devices
        console.debug("[MobileSetupWizard] Server not running, skipping device fetch");
      }
    };

    // Only initialize if we haven't fetched devices yet
    if (!devicesFetched) {
      initializeDevices();
    }
  }, [devicesFetched]);



  /* =====================================================
   * SERVICE STATUS CHECK FUNCTIONS
   * ===================================================== */

  // Check Backend Server Status
  const checkBackend = async () => {
    update("backend", { status: "checking", message: "Checking backend..." });

    try {
      const res = await fetch(`${AGENT_URL}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      const data = await res.json();

      if (!res.ok || !data.status) throw new Error();

      update("backend", {
        status: "success",
        message: "Backend running",
      });
    } catch {
      update("backend", {
        status: "error",
        message: "Backend not reachable",
      });
    }
  };

  // Check Local Agent Status
  const checkAgent = async () => {
    update("agent", { status: "checking", message: "Checking agent..." });

    try {
      const res = await fetch(`${AGENT_URL}/agent/status`, {
        signal: AbortSignal.timeout(3000),
      });
      const data = await res.json();

      if (!res.ok) throw new Error();

      update("agent", {
        status: "success",
        message: data.recording ? "Recording active" : "Agent ready",
      });
    } catch {
      update("agent", {
        status: "error",
        message: "Agent not running",
      });
    }
  };

  // Check Appium Server Status
  const checkAppium = async () => {
    update("appium", { status: "checking", message: "Checking Appium..." });

    try {
      const res = await fetch(`${AGENT_URL}/appium/status`);
      const data = await res.json();

      if (!data.running) throw new Error();

      update("appium", {
        status: "success",
        message: `Running (v${data.version})`,
      });

      setSetupState((p: any) => ({ ...p, appium: true }));
    } catch {
      update("appium", {
        status: "error",
        message: "Appium not running",
      });
      setSetupState((p: any) => ({ ...p, appium: false }));
    }
  };

  // Check Android Emulator Status
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

      setSetupState((p: any) => ({ ...p, emulator: true }));
    } catch {
      update("emulator", {
        status: "error",
        message: "Emulator not running",
      });
      setSetupState((p: any) => ({ ...p, emulator: false }));
    }
  };

  // Check ADB Device Connection Status
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

      setSetupState((p: any) => ({ ...p, device: true }));
    } catch {
      update("device", {
        status: "error",
        message: "No device detected",
      });
      setSetupState((p: any) => ({ ...p, device: false }));
    }
  };

  // Start Appium Server
  const startAppium = async () => {
    toast.info("Starting Appium...");
    try {
      const res = await fetch(`${AGENT_URL}/terminal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "appium:start" }),
      });

      if (!res.ok) throw new Error("Local helper not reachable");
      setTimeout(checkAppium, 3000);
    } catch {
      toast.error("Cannot start Appium", {
        description: "Local helper not reachable at http://localhost:3001",
      });
      update("appium", { status: "error", message: "Local helper offline" });
      setSetupState((p: any) => ({ ...p, appium: false }));
    }
  };

  // Start Android Emulator
  const startEmulator = async (avdToStart = selectedDevice) => {
    if (!avdToStart) {
      toast.error("Please select a device first");
      return;
    }

    toast.info(`Starting emulator: ${avdToStart}...`);
    try {
      const res = await fetch(`${AGENT_URL}/emulator/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avd: avdToStart }),
      });

      if (!res.ok) throw new Error("Local helper not reachable");
      setTimeout(checkEmulator, 8000);
    } catch {
      toast.error("Cannot start emulator", {
        description: "Local helper not reachable at http://localhost:3001",
      });
      update("emulator", { status: "error", message: "Local helper offline" });
      setSetupState((p: any) => ({ ...p, emulator: false }));
    }
  };

  // Stop Android Emulator
  const stopEmulator = async () => {
    try {
      const res = await fetch(`${AGENT_URL}/emulator/stop`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to stop emulator");
      return true;
    } catch (err) {
      console.error("[stopEmulator] Error:", err);
      return false;
    }
  };

  // Handle device change with sequential stop/start
  const handleDeviceChange = async (newDevice: string) => {
    // Update UI state immediately for responsiveness
    setSelectedDevice(newDevice);

    // If there was a previous device, stop it first
    if (selectedDevice && selectedDevice !== newDevice) {
      toast.info("Switching devices, stopping current emulator...");
      await stopEmulator();
      // Small delay for clean process teardown
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Start the new device
    await startEmulator(newDevice);
  };

  // Start Local Agent
  const startAgent = async () => {
    toast.info("Starting local agent...");
    try {
      const res = await fetch(`${AGENT_URL}/agent/start`, { method: "POST" });
      if (!res.ok) throw new Error("Local helper not reachable");

      update("agent", {
        status: "success",
        message: "Agent running",
      });
    } catch {
      toast.error("Cannot start local agent", {
        description: "Local helper not reachable at http://localhost:3001",
      });
      update("agent", { status: "error", message: "Local helper offline" });
    }
  };

  // Start Backend Service
  const startBackend = async () => {
    toast.info("Starting backend...");
    update("backend", {
      status: "success",
      message: "Backend running",
    });
  };

  // Fetch Available Devices
  const fetchAvailableDevices = async () => {
    setDevicesLoading(true);
    try {
      const res = await fetch(`${AGENT_URL}/emulator/available`);
      const data = await res.json();

      if (data.success) {
        setAvailableDevices(data.avds || []);
      } else {
        setAvailableDevices([]);
        toast.error("Failed to fetch available devices", {
          description: data.error || "Unknown error occurred"
        });
      }
    } catch (error) {
      setAvailableDevices([]);
      toast.error("Failed to fetch available devices", {
        description: "Local helper not reachable at http://localhost:3001"
      });
    } finally {
      setDevicesLoading(false);
      setDevicesFetched(true);
      toast.success("Device list updated");
    }
  };

  // One-Tap Start All Services
  const startAllServices = async (skipRunChecks = false) => {
    toast.info("Connecting to Mobile Automation Helper...");

    try {
      // First check if server is running
      const healthCheck = await fetch(`${AGENT_URL}/health`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!healthCheck.ok) throw new Error("AGENT_NOT_RUNNING");

      // Fetch available devices first to populate the dropdown
      try {
        await fetchAvailableDevices();
        // Wait a bit for devices to be set
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (deviceError) {
        console.warn("Failed to fetch available devices:", deviceError);
      }

      let hasErrors = false;

      // Server is running, start services individually
      // Start Appium first
      try {
        const appiumRes = await fetch(`${AGENT_URL}/terminal`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: "appium:start" }),
        });

        if (!appiumRes.ok) {
          const errData = await appiumRes.json().catch(() => ({}));
          console.warn("Appium start command failed", errData);
          toast.error(`Appium failed to start: ${errData.error || appiumRes.statusText}`);
          hasErrors = true;
          // Don't abort completely, try emulator? No, usually emulator needs Appium.
          // But let's verify if we should continue.
        }
      } catch (appiumError: any) {
        console.warn("Failed to start Appium:", appiumError);
        toast.error(`Appium connection error: ${appiumError.message}`);
        hasErrors = true;
      }

      // Start emulator if device is selected
      const deviceToStart = selectedDevice;

      if (deviceToStart) {
        try {
          const emulatorRes = await fetch(`${AGENT_URL}/emulator/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ avd: deviceToStart }),
          });

          if (!emulatorRes.ok) {
            const errData = await emulatorRes.json().catch(() => ({}));
            console.warn("Emulator start command failed", errData);
            toast.error(`Emulator failed to start: ${errData.error || emulatorRes.statusText}`);
            hasErrors = true;
          }
        } catch (emulatorError: any) {
          console.warn("Failed to start emulator:", emulatorError);
          toast.error(`Emulator connection error: ${emulatorError.message}`);
          hasErrors = true;
        }
      } else {
        toast.error("Please select a device first to start services.");
        return; // Don't proceed if no device is selected
      }

      // Start local agent (helper)
      try {
        const agentRes = await fetch(`${AGENT_URL}/agent/start`, { method: "POST" });
        if (!agentRes.ok) {
          console.warn("Agent start command failed");
          // Agent start is less critical as it returns true usually
        }
      } catch (agentError) {
        console.warn("Failed to start agent:", agentError);
      }

      if (!hasErrors) {
        toast.success("All services started successfully!");
      } else {
        toast.warning("Some services failed to start. Check logs.");
      }

      if (!skipRunChecks) {
        setTimeout(runAllChecks, 15000); // Check status after delay
      }
    } catch (error: any) {
      // Server not running - provide clear instructions without blocking alert
      console.log("Server not running:", error?.message);

      toast.error("Mobile Automation Helper Not Running", {
        description: "Start the helper server first, then try again.",
        duration: 8000,
      });

      // Update checks to show error state
      update("backend", { status: "error", message: "Server not running" });
      update("agent", { status: "error", message: "Start helper first" });
      update("appium", { status: "pending", message: "Waiting for helper" });
      update("emulator", { status: "pending", message: "Waiting for helper" });
      update("device", { status: "pending", message: "Waiting for helper" });

      // Show non-blocking toast with instructions
      toast.info("How to start the helper:", {
        description: "Run: npm start",
        duration: 15000,
      });
    }
  };

  // Run All Service Status Checks
  const runAllChecks = async () => {
    await Promise.all([
      checkBackend(),
      checkAgent(),
      checkAppium(),
      checkEmulator(),
      checkDevice(),
    ]);
  };

  // Check All Services Status via Aggregated API
  const checkAllServicesStatus = async () => {
    toast.info("Checking all services status...");

    try {
      const res = await fetch(`${AGENT_URL}/setup/status`);
      const data = await res.json();

      if (!res.ok) throw new Error("Failed to get status");

      // Update individual checks based on aggregated status
      update("backend", {
        status: data.backend ? "success" : "error",
        message: data.backend ? "Backend running" : "Backend not running",
      });

      update("agent", {
        status: data.agent ? "success" : "error",
        message: data.agent ? "Agent running" : "Agent not running",
      });

      update("appium", {
        status: data.appium ? "success" : "error",
        message: data.appium ? "Appium running" : "Appium not running",
      });

      update("emulator", {
        status: data.emulator ? "success" : "error",
        message: data.emulator ? "Emulator running" : "Emulator not running",
      });

      update("device", {
        status: data.device ? "success" : "error",
        message: data.device ? "Device connected" : "No device connected",
      });

      toast.success("Status check complete!");
    } catch (error) {
      toast.error("Failed to check services status", {
        description: "Local helper not reachable at http://localhost:3001",
      });
    }
  };

  // Status icon renderer
  const icon = (status: CheckResult["status"]) =>
    status === "success" ? (
      <CheckCircle2 className="h-5 w-5 text-green-500" />
    ) : status === "error" ? (
      <XCircle className="h-5 w-5 text-red-500" />
    ) : status === "checking" ? (
      <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
    ) : (
      <div className="h-5 w-5 rounded-full border border-muted-foreground/30" />
    );

  // System status items configuration
  const items = [
    { key: "backend", label: "Backend Server", icon: Server },
    { key: "agent", label: "Local Agent", icon: Server },
    { key: "appium", label: "Appium Server", icon: Server },
    { key: "emulator", label: "Android Emulator", icon: Terminal },
    { key: "device", label: "ADB Device", icon: Smartphone },
  ];

  // Current wizard steps based on selected tab
  const currentSteps = wizardTab === "usb" ? USB_STEPS : WIRELESS_STEPS;
  // Render wizard step content based on current step and tab
  const renderWizardStepContent = () => {
    if (wizardTab === "usb") {
      switch (wizardStep) {
        case 1:
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-primary">
                <Usb className="h-5 w-5" />
                <span className="font-semibold">Required Tools</span>
              </div>
              <div className="space-y-3 pl-2">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />
                  <div>
                    <span className="font-medium">ADB (Android Debug Bridge)</span>
                    <span className="text-muted-foreground text-sm ml-2">- Part of Android SDK Platform Tools</span>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />
                  <div>
                    <span className="font-medium">Local Agent Server</span>
                    <span className="text-muted-foreground text-sm ml-2">- Running on port 3001</span>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />
                  <div>
                    <span className="font-medium">USB Cable</span>
                    <span className="text-muted-foreground text-sm ml-2">- Original or high-quality data cable</span>
                  </div>
                </div>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mt-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5" />
                  <div className="text-sm">
                    <span className="font-medium text-amber-500">Installation Commands</span>
                    <div className="mt-2 font-mono text-xs text-muted-foreground space-y-1">
                      <p><span className="text-primary">Windows:</span> Download from developer.android.com</p>
                      <p><span className="text-primary">Mac:</span> brew install android-platform-tools</p>
                      <p><span className="text-primary">Linux:</span> sudo apt install adb</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-4">
                <span className="text-sm text-muted-foreground">Agent Status:</span>
                <Badge variant={checks.agent.status === "success" ? "default" : "destructive"}>
                  {checks.agent.status === "success" ? "Connected" : "Disconnected"}
                </Badge>
              </div>
            </div>
          );
        case 2:
          return (
            <div className="space-y-4">
              <p className="text-muted-foreground">On your Android device:</p>
              <ol className="list-decimal list-inside space-y-2 text-sm">
                <li>Go to <span className="font-mono bg-muted px-1 rounded">Settings → About phone</span></li>
                <li>Tap <span className="font-mono bg-muted px-1 rounded">Build number</span> 7 times</li>
                <li>You'll see "Developer mode enabled"</li>
              </ol>
            </div>
          );
        case 3:
          return (
            <div className="space-y-4">
              <p className="text-muted-foreground">Enable USB Debugging:</p>
              <ol className="list-decimal list-inside space-y-2 text-sm">
                <li>Go to <span className="font-mono bg-muted px-1 rounded">Settings → Developer options</span></li>
                <li>Enable <span className="font-mono bg-muted px-1 rounded">USB debugging</span></li>
                <li>Confirm the warning dialog</li>
              </ol>
            </div>
          );
        case 4:
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Cable className="h-8 w-8 text-primary" />
                <p className="text-muted-foreground">Connect your device to computer via USB cable</p>
              </div>
              <p className="text-sm text-muted-foreground">Use a high-quality data cable (not charging-only)</p>
            </div>
          );
        case 5:
          return (
            <div className="space-y-4">
              <p className="text-muted-foreground">When prompted on your device:</p>
              <ol className="list-decimal list-inside space-y-2 text-sm">
                <li>Check "Always allow from this computer"</li>
                <li>Tap <span className="font-mono bg-muted px-1 rounded">Allow</span></li>
              </ol>
            </div>
          );
        case 6:
          return (
            <div className="space-y-4">
              <p className="text-muted-foreground">Verify connection:</p>
              <div className="bg-muted rounded-lg p-3 font-mono text-sm">
                adb devices
              </div>
              <p className="text-sm text-muted-foreground">You should see your device listed.</p>
              <Button onClick={checkDevice} variant="outline" className="w-full">
                <RefreshCw className="mr-2 h-4 w-4" />
                Verify Connection
              </Button>
              {checks.device.status === "success" && (
                <Badge className="w-full justify-center" variant="default">
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Device Connected
                </Badge>
              )}
            </div>
          );
        default:
          return null;
      }
    } else {
      // Wireless ADB
      switch (wizardStep) {
        case 1:
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-primary">
                <Wifi className="h-5 w-5" />
                <span className="font-semibold">Requirements for Wireless ADB</span>
              </div>
              <div className="space-y-3 pl-2">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />
                  <div>
                    <span className="font-medium">Android 11+</span>
                    <span className="text-muted-foreground text-sm ml-2">- For native wireless debugging support</span>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />
                  <div>
                    <span className="font-medium">Same WiFi Network</span>
                    <span className="text-muted-foreground text-sm ml-2">- Device and computer on same network</span>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />
                  <div>
                    <span className="font-medium">ADB & Local Agent</span>
                    <span className="text-muted-foreground text-sm ml-2">- Same as USB requirements</span>
                  </div>
                </div>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mt-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5" />
                  <p className="text-sm">
                    For Android 10 and below, connect via USB first, then run:{" "}
                    <code className="font-mono bg-muted px-1 rounded">adb tcpip 5555</code>
                  </p>
                </div>
              </div>
            </div>
          );
        case 2:
          return (
            <div className="space-y-4">
              <p className="text-muted-foreground">Enable Developer Options (same as USB)</p>
              <ol className="list-decimal list-inside space-y-2 text-sm">
                <li>Go to Settings → About phone</li>
                <li>Tap Build number 7 times</li>
              </ol>
            </div>
          );
        case 3:
          return (
            <div className="space-y-4">
              <p className="text-muted-foreground">Enable Wireless debugging:</p>
              <ol className="list-decimal list-inside space-y-2 text-sm">
                <li>Go to <span className="font-mono bg-muted px-1 rounded">Developer options</span></li>
                <li>Enable <span className="font-mono bg-muted px-1 rounded">Wireless debugging</span></li>
                <li>Confirm when prompted</li>
              </ol>
            </div>
          );
        case 4:
          return (
            <div className="space-y-4">
              <p className="text-muted-foreground">Pair your device:</p>
              <ol className="list-decimal list-inside space-y-2 text-sm">
                <li>Tap <span className="font-mono bg-muted px-1 rounded">Pair device with pairing code</span></li>
                <li>Note the IP address, port, and pairing code</li>
                <li>Run: <code className="font-mono bg-muted px-1 rounded">adb pair IP:PORT</code></li>
                <li>Enter the pairing code when prompted</li>
              </ol>
            </div>
          );
        case 5:
          return (
            <div className="space-y-4">
              <p className="text-muted-foreground">Connect to device:</p>
              <ol className="list-decimal list-inside space-y-2 text-sm">
                <li>Get the IP and port from Wireless debugging screen</li>
                <li>Run: <code className="font-mono bg-muted px-1 rounded">adb connect IP:PORT</code></li>
              </ol>
            </div>
          );
        case 6:
          return (
            <div className="space-y-4">
              <p className="text-muted-foreground">Verify connection:</p>
              <div className="bg-muted rounded-lg p-3 font-mono text-sm">
                adb devices
              </div>
              <Button onClick={checkDevice} variant="outline" className="w-full">
                <RefreshCw className="mr-2 h-4 w-4" />
                Verify Connection
              </Button>
              {checks.device.status === "success" && (
                <Badge className="w-full justify-center" variant="default">
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Device Connected
                </Badge>
              )}
            </div>
          );
        default:
          return null;
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="space-y-2">
        <h2 className="text-xl font-bold">Local Setup</h2>
        <p className="text-sm text-muted-foreground">When tapping the One-Tap Services button, the Appium background services start automatically, and the list of available devices appears in the Device Selection dropdown below.</p>
        <div className="flex gap-2">
          {/* <Button variant="outline" onClick={() => setWizardOpen(true)}>
            <Smartphone className="mr-2 h-4 w-4" />
            Device Connection Wizard
          </Button>
          <Button onClick={runAllChecks}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Run All Checks
          </Button> */}

          <Button onClick={() => startAllServices()} className="bg-primary hover:bg-primary/90">
            <Power className="mr-2 h-4 w-4" />
            One-Tap Start All Services
          </Button>
        </div>
      </div>

      {/* Device Selection and System Status Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Device Selection Checklist */}
        <div className="space-y-2">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Device Selection
          </h3>
          <div className="space-y-3">
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <Select value={selectedDevice} onValueChange={handleDeviceChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Device" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDevices.map((device) => (
                      <SelectItem key={device} value={device}>
                        {device}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="default"
                  onClick={fetchAvailableDevices}
                  className="w-[50%]"
                  disabled={devicesLoading}
                >
                  {devicesLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Refreshing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Refresh
                    </>
                  )}
                </Button>
              </div>

              <div className="flex gap-2">
                {/* <Button
                  variant="outline"
                  onClick={fetchAvailableDevices}
                  className="flex-1"
                  disabled={devicesLoading}
                >
                  {devicesLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Refreshing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Refresh
                    </>
                  )}
                </Button> */}

                {/* <Button
                  onClick={startEmulator}
                  disabled={!selectedDevice}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  <Power className="mr-2 h-4 w-4" />
                  Maunually Start Emulator
                </Button> */}
              </div>
            </div>

            {availableDevices.length === 0 && (
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <span className="font-medium text-amber-500">No devices found</span>
                  <p className="mt-1 text-muted-foreground">
                    Make sure Android SDK is installed and AVDs are created. Click "Refresh Devices" to try again.
                  </p>
                </div>
              </div>
            )}

            {selectedDevice && (
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <span className="font-medium text-green-500">Selected Device:</span>
                  <p className="mt-1 font-mono text-muted-foreground">{selectedDevice}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* System Status Checklist */}
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">System Status</h3>
          <Button onClick={checkAllServicesStatus}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Check All Services Status
          </Button>
          <div className="space-y-2">
            {items.map(({ key, label, icon: Icon }) => (
              <div
                key={key}
                className="flex items-center gap-3"
              >
                {icon(checks[key].status)}
                <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {checks[key].message}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Agent Details Card */}
      {agentDetails && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Local Agent Details
            </CardTitle>
            <CardDescription>
              Agent configuration and status information
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Status:</span>
                  <Badge variant={agentDetails.running ? "default" : "destructive"}>
                    {agentDetails.running ? "Running" : "Stopped"}
                  </Badge>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Recording:</span>
                  <Badge variant={agentDetails.recording ? "default" : "secondary"}>
                    {agentDetails.recording ? "Active" : "Inactive"}
                  </Badge>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Port:</span>
                  <code className="text-sm bg-muted px-2 py-1 rounded">
                    {agentDetails.port}
                  </code>
                </div>
              </div>

              <div className="space-y-2">
                <div>
                  <span className="text-sm font-medium">WebSocket URL:</span>
                  <div className="mt-1">
                    <code className="text-xs bg-muted px-2 py-1 rounded break-all">
                      {agentDetails.websocketUrl}
                    </code>
                  </div>
                </div>

                <div>
                  <span className="text-sm font-medium">Recorded Steps:</span>
                  <div className="mt-1">
                    <Badge variant="outline">{agentDetails.steps || 0}</Badge>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-2">Appium Capabilities</h4>
              <div className="bg-muted rounded-lg p-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="font-medium">Platform:</span> {agentDetails.capabilities.platformName}
                  </div>
                  <div>
                    <span className="font-medium">Version:</span> {agentDetails.capabilities.platformVersion}
                  </div>
                  <div>
                    <span className="font-medium">Device:</span> {agentDetails.selectedDevice || agentDetails.capabilities.deviceName}
                  </div>
                  <div>
                    <span className="font-medium">Automation:</span> {agentDetails.capabilities.automationName}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Device Connection Wizard Dialog */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Device Connection Wizard
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Follow these steps to connect your Android device
            </p>
          </DialogHeader>

          {/* Wizard Tabs */}
          <Tabs value={wizardTab} onValueChange={(v) => { setWizardTab(v as "usb" | "wireless"); setWizardStep(1); }}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="usb" className="flex items-center gap-2">
                <Usb className="h-4 w-4" />
                USB Connection
              </TabsTrigger>
              <TabsTrigger value="wireless" className="flex items-center gap-2">
                <Wifi className="h-4 w-4" />
                Wireless ADB
              </TabsTrigger>
            </TabsList>

            <TabsContent value={wizardTab} className="mt-4">
              {/* Step Progress Indicators */}
              <div className="flex items-center justify-between mb-6">
                {currentSteps.map((step, idx) => (
                  <div key={step.id} className="flex items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${wizardStep === step.id
                        ? "bg-primary text-primary-foreground"
                        : wizardStep > step.id
                          ? "bg-green-500 text-white"
                          : "bg-muted text-muted-foreground"
                        }`}
                    >
                      {wizardStep > step.id ? <CheckCircle2 className="h-4 w-4" /> : step.id}
                    </div>
                    {idx < currentSteps.length - 1 && (
                      <div className={`h-0.5 w-8 mx-1 ${wizardStep > step.id ? "bg-green-500" : "bg-muted"}`} />
                    )}
                  </div>
                ))}
              </div>

              {/* Step Labels */}
              <div className="flex justify-between text-xs text-muted-foreground mb-6">
                {currentSteps.map((step) => (
                  <span key={step.id} className="w-16 text-center truncate">
                    {step.title}
                  </span>
                ))}
              </div>

              {/* Current Step Content */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{currentSteps[wizardStep - 1].title}</CardTitle>
                  <CardDescription>{currentSteps[wizardStep - 1].description}</CardDescription>
                </CardHeader>
                <CardContent>{renderWizardStepContent()}</CardContent>
              </Card>

              {/* Navigation Controls */}
              <div className="flex items-center justify-between mt-6">
                <Button
                  variant="outline"
                  onClick={() => setWizardStep((s) => Math.max(1, s - 1))}
                  disabled={wizardStep === 1}
                >
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Previous
                </Button>

                <span className="text-sm text-muted-foreground">
                  Step {wizardStep} of {currentSteps.length}
                </span>

                <Button
                  onClick={() => {
                    if (wizardStep === currentSteps.length) {
                      setWizardOpen(false);
                      toast.success("Device setup complete!");
                    } else {
                      setWizardStep((s) => s + 1);
                    }
                  }}
                >
                  {wizardStep === currentSteps.length ? "Finish" : "Next"}
                  {wizardStep < currentSteps.length && <ChevronRight className="ml-2 h-4 w-4" />}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}