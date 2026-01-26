import React, { useState, useEffect } from "react";

// Shared Types
import { CheckResult, DeviceInfo, SelectedDevice } from "./types";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

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
  AlertCircle,
  HelpCircle,
  BookOpen,
  ClipboardCheck,
  Package,
  ChevronDown,
  Download,
  Info,
  Copy,
} from "lucide-react";

// Utils
import { toast } from "sonner";
const AGENT_URL = "http://localhost:3001";

// Status icon renderer
const icon = (status: CheckResult["status"]) => {
  if (status === "success") {
    return <CheckCircle2 className="h-5 w-5 text-green-500" />;
  }
  if (status === "error") {
    return <XCircle className="h-5 w-5 text-red-500" />;
  }
  if (status === "checking") {
    return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
  }
  return <div className="h-5 w-5 rounded-full border border-muted-foreground/30" />;
};


interface MobileSetupWizardProps {
  setupState: {
    appium: boolean;
    emulator: boolean;
    device: boolean;
  };
  setSetupState: (state: any) => void;
  selectedDevice: SelectedDevice | null;
  setSelectedDevice: (device: SelectedDevice | null) => void;
  setActiveTab?: (tab: string) => void;
}

export default function MobileSetupWizard({
  setupState,
  setSetupState,
  selectedDevice,
  setSelectedDevice,
  setActiveTab,
}: MobileSetupWizardProps) {
  // System status items configuration
  const items = [
    { key: "backend", label: "Backend Server", icon: Server },
    { key: "agent", label: "Local Agent", icon: Server },
    { key: "appium", label: "Appium Server", icon: Server },
    { key: "emulator", label: "Android Emulator", icon: Terminal },
    { key: "physicalDevice", label: "Physical Device", icon: Smartphone },
    { key: "device", label: "ADB Device", icon: Smartphone },
  ];

  // Setup state moved from index.tsx

  const [checks, setChecks] = useState<Record<string, CheckResult>>({
    backend: { status: "pending", message: "Not checked" },
    agent: { status: "pending", message: "Not checked" },
    appium: { status: "pending", message: "Not checked" },
    emulator: { status: "pending", message: "Not checked" },
    physicalDevice: { status: "pending", message: "Not checked" },
    device: { status: "pending", message: "Not checked" },
  });
  const [availableDevices, setAvailableDevices] = useState<DeviceInfo[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [devicesFetched, setDevicesFetched] = useState(false);
  const [startingServices, setStartingServices] = useState(false);
  const [prerequisitesOpen, setPrerequisitesOpen] = useState(false);
  const [installationGuideOpen, setInstallationGuideOpen] = useState(false);


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
      checkAllServicesStatus();
    }
  }, [devicesFetched]);

  // Check Android Emulator Status
  const checkEmulator = async () => {
    update("emulator", {
      status: "checking",
      message: "Checking emulator...",
    });

    try {
      const res = await fetch(`${AGENT_URL}/setup/status`);
      const data = await res.json();

      if (!data.emulator) throw new Error();

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


  // Start Android Emulator
  const startEmulator = async (avdToStart = selectedDevice?.device) => {
    if (!avdToStart) {
      toast.error("Please select a device first");
      return;
    }

    // First check if emulator is already running
    try {
      const statusRes = await fetch(`${AGENT_URL}/setup/status`);
      const statusData = await statusRes.json();

      if (statusData.emulator) {
        toast.info("Emulator is already running");
        update("emulator", {
          status: "success",
          message: "Emulator running",
        });
        setSetupState((p: any) => ({ ...p, emulator: true }));
        return;
      }
    } catch (statusError) {
      console.warn("[startEmulator] Could not check emulator status:", statusError);
      // Continue with start attempt
    }

    const deviceName = availableDevices.find(d => d.id === avdToStart)?.name || avdToStart;
    toast.info(`Starting emulator: ${deviceName}...`);
    try {
      const res = await fetch(`${AGENT_URL}/emulator/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avd: avdToStart }),
      });

      if (!res.ok) {
        // Handle 500 error - check if emulator actually started despite error
        if (res.status === 500) {
          console.warn("[startEmulator] Start returned 500, checking if emulator is actually running...");
          try {
            const verifyRes = await fetch(`${AGENT_URL}/emulator/status`);
            const verifyData = await verifyRes.json();

            if (verifyData.running) {
              toast.success("Emulator started successfully");
              update("emulator", {
                status: "success",
                message: "Emulator running",
              });
              setSetupState((p: any) => ({ ...p, emulator: true }));
              return;
            }
          } catch (verifyError) {
            console.warn("[startEmulator] Could not verify emulator status after 500:", verifyError);
          }
        }
        throw new Error("Local helper not reachable");
      }

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
  const handleDeviceChange = async (device: DeviceInfo) => {
    // Update UI state immediately for responsiveness
    setSelectedDevice({
      device: device.id,
      name: device.name,
      os_version: device.os_version || "13",
      real_mobile: device.type === "real"
    });

    const newDevice = device.id;
    const deviceName = device.name || device.id;

    // If there was a previous device, stop it first
    if (selectedDevice?.device && selectedDevice.device !== newDevice) {
      toast.info("Switching devices, stopping current emulator...");
      await stopEmulator();
      // Small delay for clean process teardown
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Start the new device
    await startEmulator(newDevice);
  };


  // Fetch Available Devices (Unified with Recorder logic)
  const fetchAvailableDevices = async () => {
    setDevicesLoading(true);
    try {
      // Fetch both connected devices and available AVDs
      const [connectedRes, availableRes] = await Promise.all([
        fetch(`${AGENT_URL}/device/check`).catch(() => null),
        fetch(`${AGENT_URL}/emulator/available`).catch(() => null),
      ]);

      const connectedData = connectedRes ? await connectedRes.json().catch(() => ({})) : {};
      const availableData = availableRes ? await availableRes.json().catch(() => ({})) : {};

      const allDevices: DeviceInfo[] = [];

      // Add connected physical/active devices
      if (connectedData.connected && connectedData.devices?.length) {
        connectedData.devices.forEach((d: any) => {
          allDevices.push({
            id: d.id,
            name: d.name,
            type: d.type === "emulator" ? "emulator" : "real",
            os_version: d.release || "13",
          });
        });
      }

      // Add available emulators that might not be running yet
      if (availableData.success && availableData.avds?.length) {
        availableData.avds.forEach((avd: string) => {
          if (!allDevices.some(d => d.id === avd)) {
            allDevices.push({
              id: avd,
              type: "emulator",
              os_version: "13",
            });
          }
        });
      }

      setAvailableDevices(allDevices);

      if (allDevices.length > 0) {
        // Auto-select logic
        const physical = allDevices.find((d) => d.type === "real");

        if (physical && selectedDevice?.device !== physical.id) {
          toast.success(`Physical device found: ${physical.name || physical.id}`);
          handleDeviceChange(physical);
        } else if (allDevices.length === 1 && !selectedDevice) {
          toast.success(`Selected available device: ${allDevices[0].name || allDevices[0].id}`);
          handleDeviceChange(allDevices[0]);
        }
      }
    } catch (error) {
      console.error("[fetchAvailableDevices] Error:", error);
      toast.error("Failed to fetch devices", {
        description: "Local helper not reachable at http://localhost:3001"
      });
    } finally {
      setDevicesLoading(false);
      setDevicesFetched(true);
    }
  };

  // One-Tap Start All Services
  const startAllServices = async (skipRunChecks = false) => {
    setStartingServices(true);
    toast.info("Connecting to Mobile Automation Helper...");

    // Set all to checking immediately
    items.forEach(item => {
      update(item.key, { status: "checking", message: `Starting ${item.label}...` });
    });

    try {
      // First check if server is running
      const healthCheck = await fetch(`${AGENT_URL}/health`, {
        signal: AbortSignal.timeout(15000),
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
          update("appium", { status: "error", message: "Failed to start Appium" });
        }
      } catch (appiumError: any) {
        console.warn("Failed to start Appium:", appiumError);
        toast.error(`Appium connection error: ${appiumError.message}`);
        hasErrors = true;
        update("appium", { status: "error", message: "Connect error" });
      }

      // Start emulator if device is selected
      const deviceToStart = selectedDevice?.device;

      if (deviceToStart) {
        try {
          const emulatorRes = await fetch(`${AGENT_URL}/emulator/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ avd: deviceToStart }),
          });

          if (!emulatorRes.ok) {
            // Handle 500 error - check if emulator actually started despite error
            if (emulatorRes.status === 500) {
              console.warn("[startAllServices] Emulator start returned 500, checking if emulator is actually running...");
              try {
                const verifyRes = await fetch(`${AGENT_URL}/emulator/status`);
                const verifyData = await verifyRes.json();

                if (verifyData.running) {
                  console.log("[startAllServices] Emulator is running despite 500 error");
                  update("emulator", { status: "success", message: "Emulator running" });
                  setSetupState((p: any) => ({ ...p, emulator: true }));
                } else {
                  const errData = await emulatorRes.json().catch(() => ({}));
                  console.warn("Emulator start command failed", errData);
                  toast.error(`Emulator failed to start: ${errData.error || emulatorRes.statusText}`);
                  hasErrors = true;
                  update("emulator", { status: "error", message: "Failed to start" });
                }
              } catch (verifyError) {
                console.warn("[startAllServices] Could not verify emulator status after 500:", verifyError);
                const errData = await emulatorRes.json().catch(() => ({}));
                console.warn("Emulator start command failed", errData);
                toast.error(`Emulator failed to start: ${errData.error || emulatorRes.statusText}`);
                hasErrors = true;
                update("emulator", { status: "error", message: "Failed to start" });
              }
            } else {
              const errData = await emulatorRes.json().catch(() => ({}));
              console.warn("Emulator start command failed", errData);
              toast.error(`Emulator failed to start: ${errData.error || emulatorRes.statusText}`);
              hasErrors = true;
              update("emulator", { status: "error", message: "Failed to start" });
            }
          }
        } catch (emulatorError: any) {
          console.warn("Failed to start emulator:", emulatorError);
          toast.error(`Emulator connection error: ${emulatorError.message}`);
          hasErrors = true;
          update("emulator", { status: "error", message: "Connect error" });
        }
      } else {
        toast.error("Please select a device first to start services.");
        // If no device selected, we don't return entirely but log error for emulator/device
        update("emulator", { status: "error", message: "No device selected" });
        update("physicalDevice", { status: "error", message: "No device selected" });
        update("device", { status: "error", message: "No device selected" });
      }

      // Start local agent (helper)
      try {
        const agentRes = await fetch(`${AGENT_URL}/agent/start`, { method: "POST" });
        if (!agentRes.ok) {
          console.warn("Agent start command failed");
          update("agent", { status: "error", message: "Agent failed to start" });
        }
      } catch (agentError) {
        console.warn("Failed to start agent:", agentError);
        update("agent", { status: "error", message: "Connect error" });
      }

      if (!hasErrors) {
        toast.success("Requests sent to start services!");
      }

      // Automatically refresh status IMMEDIATELY after starting services
      await checkAllServicesStatus();

      // And again after a delay to account for boot time
      setTimeout(checkAllServicesStatus, 5000);
      setTimeout(checkAllServicesStatus, 15000);
    } catch (error: any) {
      // Server not running - provide clear instructions without blocking alert
      console.log("Server not running:", error?.message);

      toast.error("Mobile Automation Helper Not Running", {
        description: "Start the helper server first, then try again.",
        duration: 8000,
      });

      // Update checks to show error state
      const errorState = { status: "error" as const, message: "Helper offline" };
      update("backend", { status: "error", message: "Server not running" });
      update("agent", errorState);
      update("appium", errorState);
      update("emulator", errorState);
      update("physicalDevice", errorState);
      update("device", errorState);

      // Show non-blocking toast with instructions
      toast.info("How to start the helper:", {
        description: "Run: npm start",
        duration: 15000,
      });
    } finally {
      setStartingServices(false);
    }
  };


  // Check All Services Status via Aggregated API
  const checkAllServicesStatus = async () => {
    // Set all to checking immediately
    items.forEach(item => {
      update(item.key, { status: "checking", message: `Checking ${item.label}...` });
    });

    try {
      const res = await fetch(`${AGENT_URL}/setup/status`, {
        signal: AbortSignal.timeout(15000),
      });
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

      update("physicalDevice", {
        status: data.physicalDevice ? "success" : "error",
        message: data.physicalDevice ? "Physical device connected" : "No physical device detected",
      });

      update("device", {
        status: data.device ? "success" : "error",
        message: data.device ? "Device connected" : "No device connected",
      });

      // Auto-detection logic for physical devices
      if (data.physicalDevice && !devicesFetched && !devicesLoading) {
        console.log("[MobileSetupWizard] Physical device detected in status, fetching details...");
        fetchAvailableDevices();
      }
    } catch (error) {
      console.error("[checkAllServicesStatus] Error:", error);

      const errorState = { status: "error" as const, message: "Helper unreachable" };
      update("backend", errorState);
      update("agent", errorState);
      update("appium", errorState);
      update("emulator", errorState);
      update("physicalDevice", errorState);
      update("device", errorState);
    }
  };
  return (
    <div className="space-y-6 pb-10">
      {/* NEW: Architecture & Prerequisites (Relocated and Expanded) */}
      <Collapsible open={prerequisitesOpen} onOpenChange={setPrerequisitesOpen} className="w-full">
        <Card className="border-primary/20 bg-primary/5">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-primary/10 transition-colors pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg border border-primary/20">
                    <HelpCircle className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Mobile No-Code Architecture & Prerequisites</CardTitle>
                    <CardDescription>
                      Understand how it works and what you need to get started.
                    </CardDescription>
                  </div>
                </div>
                <ChevronDown className={`h-5 w-5 transition-transform ${prerequisitesOpen ? "rotate-180" : ""}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mx-6 mt-4 mb-6 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="space-y-6">
                {/* Architecture Section */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2 mb-4">
                    <BookOpen className="h-4 w-4" />
                    How It Works (End-to-End)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                    {[
                      { title: "1. Recorder", desc: "Captures your taps and swipes on the device." },
                      { title: "2. Device", desc: "The physical or virtual phone being controlled." },
                      { title: "3. Script", desc: "Your actions saved as a simple step-by-step list." },
                      { title: "4. Replay", desc: "Runs your script automatically on the device." },
                      { title: "5. History", desc: "Reuse scripts for testing and bug tracking." }
                    ].map((step, i) => (
                      <div key={i} className="flex flex-col gap-2 p-3 bg-background rounded-lg border border-primary/10 hover:border-primary/30 transition-all group relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-1 opacity-5 font-black text-5xl -mr-2 -mt-3 group-hover:scale-110 transition-transform">
                          {i + 1}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shadow-sm flex-shrink-0">
                            {i + 1}
                          </div>
                          <span className="text-xs font-bold text-primary/90">{step.title}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                          {step.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Prerequisites Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Checklist */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <ClipboardCheck className="h-4 w-4" />
                      Readiness Checklist
                    </h3>
                    <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-lg">
                      <div className="space-y-2">
                        {[
                          { item: "Android Emulator or Physical Phone", reason: "The target for your tests." },
                          { item: "USB Debugging Enabled", reason: "Allows computer to talk to your phone." },
                          { item: "Android SDK & ADB Installed", reason: "Standard tools for mobile control." },
                          { item: "Local Helper Running (npm start)", reason: "Connects this UI to your machine." }
                        ].map((check, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-medium">{check.item}</p>
                              <p className="text-[10px] text-muted-foreground">{check.reason}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Setup Commands */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <Terminal className="h-4 w-4" />
                      Setup & Troubleshooting
                    </h3>
                    <div className="space-y-2">
                      <div className="p-3 bg-muted/30 rounded-lg border border-muted/50 font-mono text-[10px] space-y-1">
                        <p className="text-primary/70"># List connected devices</p>
                        <p>adb devices</p>
                        <div className="h-px bg-muted-foreground/10 my-2" />
                        <p className="text-primary/70"># Check Appium version</p>
                        <p>appium -v</p>
                      </div>
                      <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                        <div className="flex items-start gap-2">
                          <span className="text-amber-500 text-xs mt-0.5">💡</span>
                          <div>
                            <p className="text-xs font-medium text-amber-600">Still stuck?</p>
                            <p className="text-[10px] text-muted-foreground">Ensure your device screen is ON and unlocked. If using a physical phone, use a high-quality data cable.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* What You Need Section */}
                <div className="p-4 bg-primary/5 border border-primary/10 rounded-lg">
                  <h3 className="text-xs font-bold text-primary mb-3 flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Required Software
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[10px]">
                    <div>
                      <p className="font-bold mb-1">Node.js</p>
                      <p className="text-muted-foreground">v18+ required</p>
                      <p className="text-muted-foreground">Runtime environment</p>
                    </div>
                    <div>
                      <p className="font-bold mb-1">Appium</p>
                      <p className="text-muted-foreground">npm install -g appium</p>
                      <p className="text-muted-foreground">Automation framework</p>
                    </div>
                    <div>
                      <p className="font-bold mb-1">Android SDK</p>
                      <p className="text-muted-foreground">Via Android Studio</p>
                      <p className="text-muted-foreground">Device communication</p>
                    </div>
                  </div>
                </div>

                {/* Quick Tips */}
                <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                  <h3 className="text-xs font-bold text-amber-600 mb-3 flex items-center gap-2">
                    <HelpCircle className="h-4 w-4" />
                    Quick Tips
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      { tip: "First Time Setup", desc: "Click 'Start Local Setup' button below to initialize all services automatically." },
                      { tip: "Physical Device", desc: "Enable USB Debugging in Developer Options and connect via USB cable." },
                      { tip: "Emulator Setup", desc: "Create an AVD in Android Studio, then select it from the device list." },
                      { tip: "Connection Issues", desc: "Try 'adb kill-server && adb start-server' to reset ADB connection." }
                    ].map((item, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-amber-500 text-xs mt-0.5">💡</span>
                        <div>
                          <p className="text-xs font-medium">{item.tip}</p>
                          <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* INSTALLATION GUIDE SECTION */}
      <Collapsible open={installationGuideOpen} onOpenChange={setInstallationGuideOpen} className="w-full">
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-blue-500/10 transition-colors pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
                    <Download className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Installation Guide</CardTitle>
                    <CardDescription>
                      Step-by-step commands to install all required tools and dependencies.
                    </CardDescription>
                  </div>
                </div>
                <ChevronDown className={`h-5 w-5 transition-transform ${installationGuideOpen ? "rotate-180" : ""}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mx-6 mt-4 mb-6 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="space-y-6">
                {/* Installation Steps */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-blue-600 flex items-center gap-2 mb-4">
                    <Package className="h-4 w-4" />
                    Required Software Installation
                  </h3>
                  <div className="grid grid-cols-1 gap-4">
                    {/* Node.js */}
                    <div className="p-4 bg-background rounded-lg border border-blue-500/20">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="h-8 w-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-bold shadow-sm flex-shrink-0">
                          1
                        </div>
                        <div className="flex-1">
                          <h4 className="text-sm font-bold mb-1">Node.js (v18 or higher)</h4>
                          <p className="text-[10px] text-muted-foreground mb-2">Required runtime for running the local helper and Appium server.</p>
                          <div className="space-y-2">
                            <div className="p-3 bg-muted/30 rounded-lg border border-muted/50">
                              <p className="text-[9px] font-bold text-muted-foreground mb-1 uppercase tracking-wider">Download & Install</p>
                              <p className="text-[10px] text-blue-600 font-medium">Visit: https://nodejs.org/</p>
                              <p className="text-[10px] text-muted-foreground mt-1">Download the LTS version and run the installer.</p>
                            </div>
                            <div className="p-3 bg-green-500/5 border border-green-500/20 rounded-lg">
                              <p className="text-[9px] font-bold text-green-600 mb-1 uppercase tracking-wider">Verify Installation</p>
                              <code className="text-[10px] font-mono bg-muted/50 px-2 py-1 rounded">node --version</code>
                              <p className="text-[10px] text-muted-foreground mt-1">Should show v18.0.0 or higher</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Appium */}
                    <div className="p-4 bg-background rounded-lg border border-blue-500/20">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="h-8 w-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-bold shadow-sm flex-shrink-0">
                          2
                        </div>
                        <div className="flex-1">
                          <h4 className="text-sm font-bold mb-1">Appium</h4>
                          <p className="text-[10px] text-muted-foreground mb-2">Mobile automation framework that controls your device.</p>
                          <div className="space-y-2">
                            <div className="p-3 bg-muted/30 rounded-lg border border-muted/50">
                              <p className="text-[9px] font-bold text-muted-foreground mb-1 uppercase tracking-wider">Install Command</p>
                              <div className="flex items-center gap-2">
                                <code className="text-[10px] font-mono bg-muted/50 px-2 py-1 rounded flex-1">npm install -g appium</code>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-[10px]"
                                  onClick={() => {
                                    navigator.clipboard.writeText('npm install -g appium');
                                    toast.success('Copied to clipboard!');
                                  }}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            <div className="p-3 bg-green-500/5 border border-green-500/20 rounded-lg">
                              <p className="text-[9px] font-bold text-green-600 mb-1 uppercase tracking-wider">Verify Installation</p>
                              <code className="text-[10px] font-mono bg-muted/50 px-2 py-1 rounded">appium -v</code>
                              <p className="text-[10px] text-muted-foreground mt-1">Should show version number</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Android SDK */}
                    <div className="p-4 bg-background rounded-lg border border-blue-500/20">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="h-8 w-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-bold shadow-sm flex-shrink-0">
                          3
                        </div>
                        <div className="flex-1">
                          <h4 className="text-sm font-bold mb-1">Android SDK & ADB</h4>
                          <p className="text-[10px] text-muted-foreground mb-2">Tools to communicate with Android devices and emulators.</p>
                          <div className="space-y-2">
                            <div className="p-3 bg-muted/30 rounded-lg border border-muted/50">
                              <p className="text-[9px] font-bold text-muted-foreground mb-1 uppercase tracking-wider">Installation Options</p>
                              <div className="space-y-2">
                                <div>
                                  <p className="text-[10px] font-bold mb-1">Option 1: Android Studio (Recommended)</p>
                                  <p className="text-[10px] text-blue-600 font-medium">Visit: https://developer.android.com/studio</p>
                                  <p className="text-[10px] text-muted-foreground">Includes SDK, ADB, and Emulator Manager</p>
                                </div>
                                <div className="h-px bg-muted-foreground/10" />
                                <div>
                                  <p className="text-[10px] font-bold mb-1">Option 2: Command Line Tools Only</p>
                                  <p className="text-[10px] text-blue-600 font-medium">Visit: https://developer.android.com/studio#command-tools</p>
                                  <p className="text-[10px] text-muted-foreground">Lighter download, no IDE</p>
                                </div>
                              </div>
                            </div>
                            <div className="p-3 bg-green-500/5 border border-green-500/20 rounded-lg">
                              <p className="text-[9px] font-bold text-green-600 mb-1 uppercase tracking-wider">Verify Installation</p>
                              <code className="text-[10px] font-mono bg-muted/50 px-2 py-1 rounded">adb version</code>
                              <p className="text-[10px] text-muted-foreground mt-1">Should show Android Debug Bridge version</p>
                            </div>
                            <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                              <div className="flex items-start gap-2">
                                <span className="text-amber-500 text-xs mt-0.5">💡</span>
                                <div>
                                  <p className="text-xs font-medium text-amber-600">Add to PATH</p>
                                  <p className="text-[10px] text-muted-foreground">Make sure Android SDK platform-tools are added to your system PATH so 'adb' command works globally.</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Local Helper */}
                    <div className="p-4 bg-background rounded-lg border border-blue-500/20">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="h-8 w-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-bold shadow-sm flex-shrink-0">
                          4
                        </div>
                        <div className="flex-1">
                          <h4 className="text-sm font-bold mb-1">Local Helper (Mobile Automation Helper)</h4>
                          <p className="text-[10px] text-muted-foreground mb-2">Backend service that connects this UI to your device.</p>
                          <div className="space-y-2">
                            <div className="p-3 bg-muted/30 rounded-lg border border-muted/50">
                              <p className="text-[9px] font-bold text-muted-foreground mb-1 uppercase tracking-wider">Setup Commands</p>
                              <div className="space-y-2">
                                <div>
                                  <p className="text-[10px] font-bold mb-1">1. Navigate to helper directory</p>
                                  <div className="flex items-center gap-2">
                                    <code className="text-[10px] font-mono bg-muted/50 px-2 py-1 rounded flex-1">cd public\mobile-automation</code>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-2 text-[10px]"
                                      onClick={() => {
                                        navigator.clipboard.writeText('cd public\\mobile-automation');
                                        toast.success('Copied to clipboard!');
                                      }}
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold mb-1">2. Install dependencies</p>
                                  <div className="flex items-center gap-2">
                                    <code className="text-[10px] font-mono bg-muted/50 px-2 py-1 rounded flex-1">npm install</code>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-2 text-[10px]"
                                      onClick={() => {
                                        navigator.clipboard.writeText('npm install');
                                        toast.success('Copied to clipboard!');
                                      }}
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold mb-1">3. Start the helper</p>
                                  <div className="flex items-center gap-2">
                                    <code className="text-[10px] font-mono bg-muted/50 px-2 py-1 rounded flex-1">npm start</code>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-2 text-[10px]"
                                      onClick={() => {
                                        navigator.clipboard.writeText('npm start');
                                        toast.success('Copied to clipboard!');
                                      }}
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="p-3 bg-green-500/5 border border-green-500/20 rounded-lg">
                              <p className="text-[9px] font-bold text-green-600 mb-1 uppercase tracking-wider">Verify Running</p>
                              <p className="text-[10px] text-muted-foreground">Helper should be running on http://localhost:3001</p>
                              <p className="text-[10px] text-muted-foreground mt-1">Click "Start Local Setup" button below to test connection.</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Platform-Specific Notes */}
                <div className="p-4 bg-primary/5 border border-primary/10 rounded-lg">
                  <h3 className="text-xs font-bold text-primary mb-3 flex items-center gap-2">
                    <Info className="h-4 w-4" />
                    Platform-Specific Notes
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[10px]">
                    <div>
                      <p className="font-bold mb-1">Windows</p>
                      <p className="text-muted-foreground mb-1">• Use PowerShell or Command Prompt</p>
                      <p className="text-muted-foreground mb-1">• May need to run as Administrator</p>
                      <p className="text-muted-foreground">• Add Android SDK to System PATH</p>
                    </div>
                    <div>
                      <p className="font-bold mb-1">macOS / Linux</p>
                      <p className="text-muted-foreground mb-1">• Use Terminal</p>
                      <p className="text-muted-foreground mb-1">• May need 'sudo' for global installs</p>
                      <p className="text-muted-foreground">• Add SDK to ~/.bashrc or ~/.zshrc</p>
                    </div>
                  </div>
                </div>

                {/* Troubleshooting */}
                <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-lg">
                  <h3 className="text-xs font-bold text-red-600 mb-3 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Common Installation Issues
                  </h3>
                  <div className="space-y-2">
                    {[
                      { issue: "Command not found", fix: "Make sure the tool is added to your system PATH. Restart terminal after installation." },
                      { issue: "Permission denied", fix: "On macOS/Linux, try using 'sudo' before the command. On Windows, run as Administrator." },
                      { issue: "Port already in use", fix: "Another service is using port 3001. Stop it or change the helper port in config." },
                      { issue: "ADB not detecting device", fix: "Enable USB Debugging on device, try different USB cable, or run 'adb kill-server && adb start-server'." }
                    ].map((item, i) => (
                      <div key={i} className="flex items-start gap-2 p-2 bg-background rounded border border-red-500/10">
                        <XCircle className="h-3 w-3 text-red-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-medium">{item.issue}</p>
                          <p className="text-[10px] text-muted-foreground">{item.fix}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Step 1: Local Setup */}
      <Card className={checks.backend.status === "success" && checks.agent.status === "success" ? "border-green-500/30" : ""}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">Step 1</Badge>
              <CardTitle className="text-xl">Local Setup</CardTitle>
            </div>
            {checks.backend.status === "success" && checks.agent.status === "success" && (
              <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-green-200">
                <CheckCircle2 className="mr-1 h-3 w-3" /> Setup Done
              </Badge>
            )}
          </div>
          <CardDescription>
            Start all required background services (Appium, Emulator, Agent) with one click.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={() => startAllServices()} className="bg-primary hover:bg-primary/90" disabled={startingServices}>
            {startingServices ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting Services...
              </>
            ) : (
              <>
                <Power className="mr-2 h-4 w-4" />
                Start Local Setup
              </>
            )}
          </Button>

          {checks.backend.status === "success" && checks.agent.status === "success" && (
            <div className="flex items-center gap-2 p-3 bg-primary/10 border border-primary/20 rounded-lg text-sm text-primary font-medium animate-in fade-in slide-in-from-top-1 duration-500">
              <Smartphone className="h-4 w-4" />
              <span>Local Setup ready! Choose a device below to start recording.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: System Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-xs">Step 2</Badge>
                <CardTitle>System Status</CardTitle>
              </div>
              <CardDescription>
                All indicators should show GREEN before proceeding to device selection.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => checkAllServicesStatus()}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${items.some(item => checks[item.key].status === 'checking') ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {items.map(({ key, label, icon: Icon }) => (
              <div
                key={key}
                className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border border-muted/50"
              >
                <div className="flex-shrink-0">
                  {icon(checks[key].status)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {checks[key].message}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step 3: Device Selection */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">Step 3</Badge>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Device Setup
            </CardTitle>
          </div>
          <CardDescription>
            Select an Android emulator or physical device to continue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {devicesFetched ? "Select an Emulator or a Physical Device below." : "Click refresh to scan for devices."}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAvailableDevices}
              disabled={devicesLoading}
              className="gap-2"
            >
              <RefreshCw className={`h-3 w-3 ${devicesLoading ? 'animate-spin' : ''}`} />
              Refresh Device List
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Physical Devices List */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Smartphone className="h-3 w-3" />
                Physical Devices
              </h4>
              <div className="space-y-2">
                {availableDevices.filter(d => d.type === "real").length > 0 ? (
                  availableDevices.filter(d => d.type === "real").map((device) => (
                    <button
                      key={device.id}
                      onClick={() => handleDeviceChange(device)}
                      className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${selectedDevice?.device === device.id
                        ? "bg-primary/10 border-primary text-primary"
                        : "bg-muted/30 border-muted-foreground/10 hover:border-primary/50"
                        }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Smartphone className="h-4 w-4 flex-shrink-0" />
                        <div className="text-left min-w-0 flex-1">
                          <p className="text-sm font-medium truncate" title={device.name || device.id}>{device.name || device.id}</p>
                          <div className="flex items-center gap-2">
                            <p className="text-[10px] text-muted-foreground truncate max-w-[100px]">ID: {device.id}</p>
                            <Badge variant="outline" className="text-[9px] py-0 h-3.5 bg-green-500/10 text-green-600 border-green-200">Connected</Badge>
                          </div>
                        </div>
                      </div>
                      {selectedDevice?.device === device.id && <CheckCircle2 className="h-4 w-4 flex-shrink-0 ml-2" />}
                    </button>
                  ))
                ) : (
                  <div className="p-4 border border-dashed rounded-lg text-center bg-muted/10">
                    <p className="text-xs text-muted-foreground italic">No physical devices detected.</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Connect via USB and enable debugging.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Emulators List */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Terminal className="h-3 w-3" />
                Available Emulators
              </h4>
              <div className="space-y-2">
                {availableDevices.filter(d => d.type === "emulator").length > 0 ? (
                  availableDevices.filter(d => d.type === "emulator").map((device) => (
                    <button
                      key={device.id}
                      onClick={() => handleDeviceChange(device)}
                      className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${selectedDevice?.device === device.id
                        ? "bg-primary/10 border-primary text-primary"
                        : "bg-muted/30 border-muted-foreground/10 hover:border-primary/50"
                        }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Terminal className="h-4 w-4 flex-shrink-0" />
                        <div className="text-left min-w-0 flex-1">
                          <p className="text-sm font-medium truncate" title={device.name || device.id}>{device.name || device.id}</p>
                          {device.name && <p className="text-[10px] text-muted-foreground truncate">ID: {device.id}</p>}
                        </div>
                      </div>
                      {selectedDevice?.device === device.id && <CheckCircle2 className="h-4 w-4 flex-shrink-0 ml-2" />}
                    </button>
                  ))
                ) : (
                  <div className="p-4 border border-dashed rounded-lg text-center bg-muted/10">
                    <p className="text-xs text-muted-foreground italic">No emulators found.</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Create one in Android Studio AVD Manager.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {availableDevices.length === 0 && (
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <span className="font-medium text-amber-500">Detection Hint</span>
                  <p className="mt-1 text-muted-foreground text-xs">
                    Connect a device or start an emulator, then click <strong>Refresh Device List</strong> above.
                  </p>
                </div>
              </div>

              {checks.device.status === "success" && setActiveTab && (
                <div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm font-medium">Device detected by ADB</p>
                    <p className="text-xs text-muted-foreground">We see a connection, but the name is still loading. You can proceed if you're ready.</p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setActiveTab("recorder")}
                    className="gap-2"
                  >
                    Continue to Recorder anyway
                    <ChevronDown className="h-4 w-4 -rotate-90" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {selectedDevice && (
            <div className="p-6 border-2 border-primary/20 bg-primary/5 rounded-xl text-center space-y-4 animate-in zoom-in-95 duration-500">
              <div className="flex flex-col items-center gap-2">
                <div className="h-12 w-12 bg-primary/20 rounded-full flex items-center justify-center mb-2">
                  <Smartphone className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-bold text-primary">
                  {selectedDevice.name || selectedDevice.device} is ready!
                </h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Your device is connected and all services are running. You can now start recording your mobile automation script.
                </p>
              </div>
              {setActiveTab && (
                <Button
                  onClick={() => setActiveTab("recorder")}
                  size="lg"
                  className="bg-green-600 hover:bg-green-700 text-white gap-2 shadow-lg shadow-green-500/20"
                >
                  Start Recording
                  <ChevronDown className="h-4 w-4 -rotate-90" />
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}