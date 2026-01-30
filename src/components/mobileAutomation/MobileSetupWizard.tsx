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
import { ScrollArea } from "@/components/ui/scroll-area";

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
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
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
const BOOT_DELAY_MS = 8000;
const REFRESH_INTERVAL_MS = 5000;
const TIMEOUT_MS = 5000;
interface SetupState {
  appium: boolean;
  emulator: boolean;
  device: boolean;
}
interface MobileSetupWizardProps {
  setupState: SetupState;
  setSetupState: React.Dispatch<React.SetStateAction<SetupState>>;
  selectedDevice: SelectedDevice | null;
  setSelectedDevice: React.Dispatch<React.SetStateAction<SelectedDevice | null>>;
  setActiveTab?: React.Dispatch<React.SetStateAction<string>>;
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

    // Set up polling for continuous updates (Auto-refresh)
    const pollInterval = setInterval(() => {
      // Only poll if healthy/initialized to avoid constant errors if helper is down
      if (devicesFetched) {
        checkAllServicesStatus();
        fetchAvailableDevices();
      }
    }, 5000);

    return () => clearInterval(pollInterval);
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

      if (statusData.emulator && statusData.currentAvd === avdToStart) {
        // Only show if not specifically switching (handleDeviceChange handles switching message)
        update("emulator", {
          status: "success",
          message: "Emulator running",
        });
        setSetupState((p: any) => ({ ...p, emulator: true }));
        return;
      }
    } catch (statusError) {
      console.warn("[startEmulator] Could not check emulator status:", statusError);
    }

    const deviceName = availableDevices.find(d => d.id === avdToStart)?.name || avdToStart;

    // Improved messaging
    const isSwitching = selectedDevice?.real_mobile;
    if (!isSwitching) {
      toast.info(`Starting emulator: ${deviceName}...`);
    }

    try {
      const res = await fetch(`${AGENT_URL}/emulator/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avd: avdToStart }),
      });

      if (!res.ok) {
        if (res.status === 500) {
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
        signal: AbortSignal.timeout(8000), // 8s timeout to prevent hanging
      });
      if (!res.ok) throw new Error("Failed to stop emulator");
      return true;
    } catch (err) {
      console.error("[stopEmulator] Error:", err);
      return false;
    }
  };

  // Handle device change with mutual exclusion logic
  const [isProcessing, setIsProcessing] = useState(false);
  const handleDeviceChange = async (device: DeviceInfo, silent = false) => {
    if (isProcessing) return; // Guard against rapid clicks
    setIsProcessing(true);
    try {
      const isEmulator = device.type === "emulator";
      const isPhysical = device.type === "real";
      const newDevice = device.id;
      const deviceName = device.name || device.id
      const emulatorRunning = checks.emulator.status === "success";
      const physicalActive = selectedDevice?.real_mobile && selectedDevice.device;

      // Rule: If Physical Device becomes active -> Switch from Emulator
      // We check if emulator is running OR if we had an emulator selected previously (to be safe)
      const wasEmulatorSelected = selectedDevice && !selectedDevice.real_mobile;
      if (isPhysical && (emulatorRunning || wasEmulatorSelected)) {
        if (!silent) toast.info("Switching to physical device...");

        // Non-blocking stop to prevent UI freeze
        stopEmulator().then(() => {
          console.log("Emulator stopped in background");
        }).catch(err => console.warn("Background stop failed:", err));

        update("emulator", { status: "pending", message: "Standby" });
        setSetupState((p: any) => ({ ...p, emulator: false }));
      }

      // Rule: If Emulator becomes active -> Switch from Physical
      if (isEmulator && physicalActive) {
        if (!silent) toast.info("Emulator started. Physical device disconnected.");
        update("physicalDevice", { status: "pending", message: "Standby" });
      }

      // Update UI selection state immediately
      setSelectedDevice({
        device: device.id,
        name: device.name,
        os_version: device.os_version || "13",
        real_mobile: isPhysical
      });

      // Start/Verify the specific device
      if (isEmulator) {
        await startEmulator(newDevice);
      } else {
        if (!silent) toast.success(`Active: ${deviceName}`);
        update("device", { status: "success", message: `Connected: ${deviceName}` });
        update("physicalDevice", { status: "success", message: "Connected" });
        setSetupState((p: any) => ({ ...p, device: true }));
      }
    } catch (err) {
      console.error("Error switching device:", err);
      if (!silent) toast.error("Failed to switch device");
    } finally {
      setIsProcessing(false);
    }
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
          // Filter out generic "default" emulators if they appear (phantom devices)
          if (avd.toLowerCase() === "default" || avd.toLowerCase() === "placeholder") return;

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

      // Validation: If selected device is no longer in the list, clear it
      if (selectedDevice && allDevices.length > 0) {
        const stillPresent = allDevices.some(d => d.id === selectedDevice.device);
        if (!stillPresent) {
          console.log("[MobileSetupWizard] Selected device disconnected, clearing selection");
          setSelectedDevice(null);
          setSetupState((p: any) => ({ ...p, device: false, emulator: false }));
          setChecks(prev => ({
            ...prev,
            device: { status: "pending", message: "Disconnected" },
            emulator: { status: "pending", message: "Disconnected" }
          }));

        }
      } else if (selectedDevice && allDevices.length === 0) {
        setSelectedDevice(null);
        setSetupState((p: any) => ({ ...p, device: false, emulator: false }));
      }

      if (allDevices.length > 0) {
        // Auto-select logic: Only if NO device is currently selected
        const physical = allDevices.find((d) => d.type === "real");

        if (!selectedDevice) {
          if (physical) {
            handleDeviceChange(physical, true);
          } else if (allDevices.length === 1) {
            handleDeviceChange(allDevices[0], true);
          }
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

      // Start emulator ONLY if an emulator is selected
      const deviceToStart = selectedDevice?.device;
      const isEmulator = selectedDevice && !selectedDevice.real_mobile;

      if (deviceToStart && isEmulator) {
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
      } else if (deviceToStart && selectedDevice.real_mobile) {
        // For physical device, we don't 'start' it, but we verify its connection
        update("physicalDevice", { status: "success", message: "Connected" });
        update("device", { status: "success", message: "Active" });
        setSetupState((p: any) => ({ ...p, device: true }));
      } else {
        toast.error("Please select a device first to start services.");
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
    // Note: We do NOT reset to "checking" here to avoid UI flickering during background polls

    try {
      const res = await fetch(`${AGENT_URL}/setup/status`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
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

      if (data.physicalDevice && !devicesLoading) {
        const hasRealDeviceInState = availableDevices.some(d => d.type === "real");
        // Only trigger fetch if the state doesn't match the reality to prevent loops
        if (!hasRealDeviceInState) {
          console.log("[MobileSetupWizard] New physical device detected, fetching details...");
          fetchAvailableDevices();
        }
      }
    } catch (error: any) {
      console.error("[checkAllServicesStatus] Error:", error);

      const isTimeout = error.name === 'TimeoutError';
      const errorMessage = isTimeout ? "Helper timed out" : "Helper unreachable";
      const errorState = { status: "error" as const, message: errorMessage };
      update("backend", errorState);
      update("agent", errorState);
      update("appium", errorState);
      update("emulator", errorState);
      update("physicalDevice", errorState);
      update("device", errorState);
    }
  };
  // Guided Tour Logic
  const startTour = () => {
    const driverObj = driver({
      showProgress: true,
      animate: true,
      steps: [
        {
          element: '#setup-wizard-container',
          popover: {
            title: 'Mobile Setup Wizard',
            description: 'Welcome! This wizard helps you connect your Android device and start mobile automation. Follow these steps to get everything ready.',
            side: "bottom",
            align: 'start'
          }
        },
        {
          element: '#prerequisites-guide',
          popover: {
            title: 'Journey Overview',
            description: 'Start here to understand the 3-step process: Environment Preparation, Device Connection, and Recording your first script.',
            side: "bottom",
            align: 'start'
          }
        },
        {
          element: '#complete-installation-guide',
          popover: {
            title: 'Installation Guide',
            description: 'Need help installing Node.js, Appium, or ADB? Expand this section for step-by-step commands and verification tips.',
            side: "bottom",
            align: 'start'
          }
        },
        {
          element: '#step-local-setup',
          popover: {
            title: '1. Local Services',
            description: 'Click "Start Setup" to automatically launch the Appium server and Mobile Automation Helper on your machine.',
            side: "top",
            align: 'start'
          }
        },
        {
          element: '#step-system-status',
          popover: {
            title: '2. Connection Health',
            description: 'Monitor your services here. If a service shows "Offline", use the Refresh button to check the status again.',
            side: "top",
            align: 'start'
          }
        },
        {
          element: '#status-refresh-btn',
          popover: {
            title: 'Status Refresh',
            description: 'Use this button to manually poll the server and update the connection status of all services.',
            side: "left",
            align: 'start'
          }
        },
        {
          element: '#step-device-setup',
          popover: {
            title: '3. Device Connection',
            description: 'Choose between a physical device (with USB debugging) or a virtual emulator to start automation.',
            side: "top",
            align: 'start'
          }
        },
        {
          element: '#device-scan-btn',
          popover: {
            title: 'Scan for Devices',
            description: 'Connected a new phone? Click Scan to refresh the list of available physical and virtual devices.',
            side: "left",
            align: 'start'
          }
        },
      ]
    });

    driverObj.drive();
  };

  // Auto-start tour on first visit
  useEffect(() => {
    const hasSeenTour = localStorage.getItem("mobile_setup_tour_seen");
    if (!hasSeenTour) {
      // Small timeout to ensure components are rendered
      const timer = setTimeout(() => {
        startTour();
        localStorage.setItem("mobile_setup_tour_seen", "true");
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <div className="w-full space-y-4 pb-10" id="setup-wizard-container">
      {/* Tour Trigger Button */}
      <div className="flex justify-end mb-[-1rem]">
        <Button
          variant="ghost"
          size="sm"
          onClick={startTour}
          className="text-xs text-primary hover:bg-primary/5 gap-1.5 h-7 font-bold"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          Setup Tour Guide
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* REDESIGNED: Architecture & Prerequisites (Journey Style) */}
        <Collapsible open={prerequisitesOpen} onOpenChange={setPrerequisitesOpen} className="w-full" id="prerequisites-guide">
          <Card className="border-primary/20 bg-primary/5 shadow-sm overflow-hidden">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-primary/10 transition-colors py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg border border-primary/20">
                      <BookOpen className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-bold">Start Your Mobile Automation Journey</CardTitle>
                      <CardDescription className="text-xs font-medium">
                        Quick overview of the 3-step process to get your mobile app automated.
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-wider font-bold text-primary/60 hidden sm:block">
                      {prerequisitesOpen ? "Hide Guide" : "View Guide"}
                    </span>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-300 ${prerequisitesOpen ? "rotate-180" : ""}`} />
                  </div>
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ScrollArea className="w-full border-t border-primary/10" style={{ maxHeight: 'calc(100vh - 450px)', minHeight: '350px' }}>
                <div className="mx-6 mb-6 animate-in fade-in slide-in-from-top-2 duration-300 pt-6">
                  <div className="relative">
                    <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-primary/10 hidden sm:block" />

                    <div className="space-y-8">
                      {/* Step 1: Environment */}
                      <div className="relative sm:pl-12">
                        <div className="absolute left-0 top-0 h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shadow-md z-10 hidden sm:flex">1</div>
                        <div>
                          <h4 className="text-base font-bold text-primary flex items-center gap-2 mb-2">
                            <span className="sm:hidden h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">1</span>
                            Prepare Environment
                          </h4>
                          <p className="text-xs text-muted-foreground mb-3 max-w-2xl leading-relaxed">
                            Ensure your system is ready for mobile automation. You'll need <strong>Node.js (v18+)</strong> and the <strong>Android SDK</strong> installed via Android Studio.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline" className="bg-background/50 text-[10px] font-medium border-primary/10 py-0 h-6">
                              <Terminal className="h-3 w-3 mr-1 text-primary/60" /> npm start (Helper)
                            </Badge>
                            <Badge variant="outline" className="bg-background/50 text-[10px] font-medium border-primary/10 py-0 h-6">
                              <Package className="h-3 w-3 mr-1 text-primary/60" /> Appium Server
                            </Badge>
                          </div>
                        </div>
                      </div>

                      {/* Step 2: Device */}
                      <div className="relative sm:pl-12">
                        <div className="absolute left-0 top-0 h-8 w-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm border border-primary/30 z-10 hidden sm:flex">2</div>
                        <div>
                          <h4 className="text-base font-bold text-primary flex items-center gap-2 mb-2">
                            <span className="sm:hidden h-5 w-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs border border-primary/30">2</span>
                            Connect Your Device
                          </h4>
                          <p className="text-xs text-muted-foreground mb-3 max-w-2xl leading-relaxed">
                            Connect a physical Android phone via USB (with <strong>USB Debugging</strong> enabled) or start a virtual <strong>Android Emulator</strong>.
                          </p>
                          <div className="p-3 bg-amber-500/5 border border-amber-500/10 rounded-lg flex items-start gap-2 max-w-lg">
                            <Info className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-700 leading-normal">
                              Tip: Use <code>adb devices</code> in your terminal to verify your connection if the device doesn't appear below.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Step 3: Recording */}
                      <div className="relative sm:pl-12">
                        <div className="absolute left-0 top-0 h-8 w-8 rounded-full bg-primary/10 text-primary/60 flex items-center justify-center font-bold text-sm border border-primary/10 z-10 hidden sm:flex">3</div>
                        <div>
                          <h4 className="text-base font-bold text-primary flex items-center gap-2 mb-2">
                            <span className="sm:hidden h-5 w-5 rounded-full bg-primary/10 text-primary/60 flex items-center justify-center text-xs border border-primary/10">3</span>
                            Record & Replay
                          </h4>
                          <p className="text-xs text-muted-foreground mb-3 max-w-2xl leading-relaxed">
                            Select your device, launch your app, and start recording. We'll capture your actions and turn them into a <strong>No-Code Script</strong> you can replay anytime.
                          </p>
                          <div className="flex items-center gap-4 text-xs font-semibold text-primary/40">
                            <div className="flex items-center gap-1.5"><Smartphone className="h-3.5 w-3.5" /> Record</div>
                            <div className="h-px w-6 bg-primary/10" />
                            <div className="flex items-center gap-1.5"><ClipboardCheck className="h-3.5 w-3.5" /> Save</div>
                            <div className="h-px w-6 bg-primary/10" />
                            <div className="flex items-center gap-1.5"><RefreshCw className="h-3.5 w-3.5" /> Replay</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </CollapsibleContent>
          </Card>
        </Collapsible>
        <Collapsible open={installationGuideOpen} onOpenChange={setInstallationGuideOpen} className="w-full" id="complete-installation-guide">
          <Card className="border-blue-500/20 bg-blue-500/5 shadow-sm overflow-hidden">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-blue-500/10 transition-colors py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
                      <Download className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold">Complete Your Installation</CardTitle>
                      <CardDescription className="text-xs">
                        Follow these 3 steps to install all required tools on your machine.
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-wider font-bold text-blue-600/60 hidden sm:block">
                      {installationGuideOpen ? "Hide Details" : "View Details"}
                    </span>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-300 ${installationGuideOpen ? "rotate-180" : ""}`} />
                  </div>
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ScrollArea className="h-[460px] w-full border-t border-blue-500/10">
                <div className="mx-6 mb-6 animate-in fade-in slide-in-from-top-2 duration-300 pt-6">
                  <div className="relative">
                    {/* Vertical Line for Journey */}
                    <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-blue-500/10 hidden sm:block" />

                    <div className="space-y-8">
                      {/* Step 1: Node.js */}
                      <div className="relative sm:pl-12">
                        <div className="absolute left-0 top-0 h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm shadow-md z-10 hidden sm:flex">1</div>
                        <div>
                          <h4 className="text-base font-bold text-blue-600 flex items-center gap-2 mb-2">
                            <span className="sm:hidden h-5 w-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs">1</span>
                            Install Node.js
                          </h4>
                          <p className="text-xs text-muted-foreground mb-3 max-w-2xl leading-relaxed">
                            Download the <strong>LTS version</strong> from <a href="https://nodejs.org/" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">nodejs.org</a>. This is the runtime required for all automation tools.
                          </p>
                          <div className="p-3 bg-green-500/5 border border-green-500/10 rounded-lg flex items-center justify-between max-w-md">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                              <span className="text-[10px] font-mono mt-0.5">node --version</span>
                            </div>
                            <span className="text-xs text-green-600 font-medium uppercase tracking-tighter">Verify (v18+)</span>
                          </div>
                        </div>
                      </div>

                      {/* Step 2: Automation Tools */}
                      <div className="relative sm:pl-12">
                        <div className="absolute left-0 top-0 h-8 w-8 rounded-full bg-blue-500/20 text-blue-600 flex items-center justify-center font-bold text-sm border border-blue-500/30 z-10 hidden sm:flex">2</div>
                        <div>
                          <h4 className="text-base font-bold text-blue-600 flex items-center gap-2 mb-2">
                            <span className="sm:hidden h-5 w-5 rounded-full bg-blue-500/20 text-blue-600 flex items-center justify-center text-xs border border-blue-500/30">2</span>
                            Setup Appium & ADB
                          </h4>
                          <p className="text-xs text-muted-foreground mb-3 max-w-2xl leading-relaxed">
                            Install the Appium server globally and ensure the Android Debug Bridge (ADB) is accessible from your path.
                          </p>
                          <div className="space-y-2 max-w-lg">
                            <div className="p-2.5 bg-muted/40 rounded-lg border border-muted-foreground/10 flex items-center justify-between">
                              <code className="text-[10px] font-mono text-blue-600/80">npm install -g appium</code>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[10px] hover:bg-blue-500/10"
                                onClick={() => {
                                  navigator.clipboard.writeText('npm install -g appium');
                                  toast.success('Copied Appium command');
                                }}
                              >
                                <Copy className="h-3 w-3 mr-1" /> Copy
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="p-2 bg-background/50 rounded border border-muted-foreground/5 text-center">
                                <p className="text-xs font-bold text-muted-foreground uppercase">Verify ADB</p>
                                <code className="text-[10px] font-mono">adb version</code>
                              </div>
                              <div className="p-2 bg-background/50 rounded border border-muted-foreground/5 text-center">
                                <p className="text-xs font-bold text-muted-foreground uppercase">Verify Appium</p>
                                <code className="text-[10px] font-mono">appium -v</code>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Step 3: Local Helper */}
                      <div className="relative sm:pl-12">
                        <div className="absolute left-0 top-0 h-8 w-8 rounded-full bg-blue-500/10 text-blue-600/60 flex items-center justify-center font-bold text-sm border border-blue-500/10 z-10 hidden sm:flex">3</div>
                        <div>
                          <h4 className="text-base font-bold text-blue-600 flex items-center gap-2 mb-2">
                            <span className="sm:hidden h-5 w-5 rounded-full bg-blue-500/10 text-blue-600/60 flex items-center justify-center text-xs border border-blue-500/10">3</span>
                            Start Local Helper
                          </h4>
                          <p className="text-xs text-muted-foreground mb-3 max-w-2xl leading-relaxed">
                            Navigate to the helper directory, install dependencies, and start the service to connect this UI.
                          </p>
                          <div className="space-y-2 max-w-lg">
                            {[
                              { label: "1. Open Folder", cmd: "cd public/agent-package" },
                              { label: "2. Install", cmd: "npm install" },
                              { label: "3. Start Service", cmd: "npm start" }
                            ].map((step, i) => (
                              <div key={i} className="flex items-center gap-3">
                                <div className="flex-1 p-2 bg-muted/40 rounded border border-muted-foreground/5 flex items-center justify-between">
                                  <span className="text-xs font-bold text-muted-foreground/50 w-20">{step.label}</span>
                                  <code className="text-[10px] font-mono text-primary/80 truncate flex-1 px-2">{step.cmd}</code>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 px-1.5"
                                    onClick={() => {
                                      navigator.clipboard.writeText(step.cmd);
                                      toast.success(`Copied: ${step.cmd}`);
                                    }}
                                  >
                                    <Copy className="h-2.5 w-2.5" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Troubleshooting Footer */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                    <div className="p-3 bg-amber-500/5 border border-amber-500/10 rounded-lg">
                      <h5 className="text-xs font-bold text-amber-600 uppercase mb-2 flex items-center gap-1.5">
                        <Info className="h-3 w-3" /> Platform Tip
                      </h5>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        On <strong>Windows</strong>, use PowerShell as Admin. On <strong>macOS</strong>, ensure you've accepted Xcode license terms.
                      </p>
                    </div>
                    <div className="p-3 bg-red-500/5 border border-red-500/10 rounded-lg">
                      <h5 className="text-xs font-bold text-red-600 uppercase mb-2 flex items-center gap-1.5">
                        <AlertCircle className="h-3 w-3" /> Stuck?
                      </h5>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        If <code>adb</code> isn't found, add the platform-tools folder to your system PATH and restart your terminal.
                      </p>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </CollapsibleContent>
          </Card>
        </Collapsible>

      </div>

      {/* REDESIGNED: Steps Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Step 1: Local Setup */}
        <div id="step-local-setup">
          <Card className={`h-full ${checks.backend.status === "success" && checks.agent.status === "success" ? "border-green-500/30 shadow-sm" : ""} overflow-hidden flex flex-col`}>
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs h-5 px-1.5 uppercase font-bold tracking-tight">Step 1</Badge>
                  <CardTitle className="text-base font-bold">Local Setup</CardTitle>
                </div>
                {checks.backend.status === "success" && checks.agent.status === "success" && (
                  <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-green-200 text-xs py-0.5 h-6">
                    Ready
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pb-5 px-4 pt-1 space-y-4 flex-1 flex flex-col">
              <Button
                onClick={() => startAllServices()}
                className="w-full h-10 text-xs font-bold shadow-sm"
                disabled={startingServices}
              >
                {startingServices ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Initializing...
                  </>
                ) : (
                  <>
                    <Power className="mr-2 h-4 w-4" />
                    Start Setup
                  </>
                )}
              </Button>

              <div className="space-y-2 pt-2">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-1">What's Included</p>
                <div className="grid grid-cols-1 gap-1.5">
                  {[
                    { icon: Server, label: "Appium Server", desc: "Mobile automation engine" },
                    { icon: Terminal, label: "ADB Helper", desc: "Android bridge & control" },
                    { icon: Smartphone, label: "Device Agent", desc: "Real-time interaction" }
                  ].map((feat, i) => (
                    <div key={i} className="flex items-center gap-2.5 p-2 bg-muted/20 rounded-lg border border-transparent hover:border-primary/10 transition-colors">
                      <div className="p-1.5 bg-background rounded-md shadow-sm">
                        <feat.icon className="h-3.5 w-3.5 text-primary/70" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold leading-tight">{feat.label}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{feat.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {checks.backend.status === "success" && checks.agent.status === "success" && (
                <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/10 rounded-lg text-xs font-bold text-primary/80 animate-in fade-in slide-in-from-top-1 duration-500">
                  <Smartphone className="h-4 w-4" />
                  <span>Services are active!</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Step 2: System Status */}
        <div id="step-system-status">
          <Card className="h-full overflow-hidden flex flex-col">
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs h-5 px-1.5 uppercase font-bold tracking-tight">Step 2</Badge>
                  <CardTitle className="text-base font-bold">System Status</CardTitle>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => checkAllServicesStatus()}
                  className="h-8 px-2.5 text-xs font-medium gap-1.5"
                  id="status-refresh-btn"
                >
                  <RefreshCw className={`h-3 w-3 ${items.some(item => checks[item.key].status === 'checking') ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pb-5 px-4 pt-1 flex-1 flex flex-col">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {items.map(({ key, label, icon: Icon }) => (
                  <TooltipProvider key={key}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2 p-2 bg-muted/20 rounded-lg border border-muted/30 transition-all hover:bg-muted/40 cursor-default">
                          <div className="flex-shrink-0 scale-90 origin-left">
                            {icon(checks[key].status)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold truncate leading-none mb-1.5">{label}</p>
                            <p className={`text-[11px] truncate font-medium ${checks[key].status === 'success' ? 'text-green-600' : checks[key].status === 'error' ? 'text-red-500' : 'text-muted-foreground'}`}>
                              {checks[key].status === 'success' ? 'Active' : checks[key].status === 'error' ? 'Offline' : checks[key].status === 'checking' ? 'Checking' : 'Pending'}
                            </p>
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="text-[10px] p-2">
                        {checks[key].message}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </div>

              <div className="mt-auto pt-4">
                <div className="p-3 bg-primary/5 border border-primary/10 rounded-xl flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${items.every(i => checks[i.key].status === 'success') ? 'bg-green-500/20' : 'bg-primary/10'}`}>
                    <Info className={`h-4 w-4 ${items.every(i => checks[i.key].status === 'success') ? 'text-green-600' : 'text-primary'}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold">Connection Summary</p>
                    <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">
                      {items.every(i => checks[i.key].status === 'success')
                        ? "All systems online. You can now start recording your mobile automation script."
                        : "Some services are pending or offline. Click 'Start Setup' or 'Refresh' to update."}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Step 3: Device Selection */}
        <div id="step-device-setup">
          <Card className="h-full overflow-hidden flex flex-col">
            <CardHeader className="py-3 px-4 pb-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs h-5 px-1.5 uppercase font-bold tracking-tight">Step 3</Badge>
                  <CardTitle className="text-base font-bold flex items-center gap-1.5">
                    Device Setup
                  </CardTitle>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={fetchAvailableDevices}
                  disabled={devicesLoading}
                  className="h-8 px-2.5 text-xs font-medium gap-1.5 text-primary hover:bg-primary/5"
                  id="device-scan-btn"
                >
                  <RefreshCw className={`h-2.5 w-2.5 ${devicesLoading ? 'animate-spin' : ''}`} />
                  Scan
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pb-5 px-4 pt-1 space-y-4 flex-1">
              {/* Physical Devices List - Compact */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-0.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/70">
                    Physical
                  </h4>
                </div>
                <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                  {availableDevices.filter(d => d.type === "real").length > 0 ? (
                    availableDevices.filter(d => d.type === "real").map((device) => {
                      const isActive = selectedDevice?.device === device.id && selectedDevice.real_mobile;
                      return (
                        <button
                          key={device.id}
                          onClick={() => handleDeviceChange(device)}
                          className={`w-full flex items-center justify-between p-1.5 rounded-md border text-left transition-all ${isActive
                            ? "bg-primary/5 border-primary ring-1 ring-primary/10"
                            : "bg-muted/10 border-muted-foreground/10 hover:border-primary/20"
                            }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <Smartphone className={`h-3 w-3 flex-shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                            <p className={`text-xs font-bold truncate leading-tight ${isActive ? "text-primary" : ""}`}>
                              {device.name || device.id}
                            </p>
                          </div>
                          {isActive && <CheckCircle2 className="h-3 w-3 text-primary flex-shrink-0 ml-1" />}
                        </button>
                      );
                    })
                  ) : (
                    <div className="p-2 border border-dashed rounded-md text-center bg-muted/5">
                      <p className="text-xs text-muted-foreground italic">None found</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Emulators List - Compact */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-0.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/70">
                    Emulators
                  </h4>
                </div>
                <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                  {availableDevices.filter(d => d.type === "emulator").length > 0 ? (
                    availableDevices.filter(d => d.type === "emulator").map((device) => {
                      const isActive = selectedDevice?.device === device.id && !selectedDevice.real_mobile;
                      const isRunning = isActive && checks.emulator.status === "success";
                      return (
                        <button
                          key={device.id}
                          onClick={() => handleDeviceChange(device)}
                          className={`w-full flex items-center justify-between p-1.5 rounded-md border text-left transition-all ${isActive
                            ? "bg-primary/5 border-primary ring-1 ring-primary/10"
                            : "bg-muted/10 border-muted-foreground/10 hover:border-primary/20"
                            }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <Terminal className={`h-3 w-3 flex-shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                            <p className={`text-xs font-bold truncate leading-tight ${isActive ? "text-primary" : ""}`}>
                              {device.name || device.id}
                            </p>
                          </div>
                          {isActive && <CheckCircle2 className="h-3 w-3 text-primary flex-shrink-0 ml-1" />}
                        </button>
                      );
                    })
                  ) : (
                    <div className="p-2 border border-dashed rounded-md text-center bg-muted/5">
                      <p className="text-xs text-muted-foreground italic">None found</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Selected Device Status & Next Steps */}
      {
        selectedDevice && (
          <div className="p-4 border-2 border-primary/20 bg-primary/5 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4 animate-in zoom-in-95 duration-500 shadow-sm">
            <div className="flex items-center gap-4 min-w-0">
              <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0 border border-primary/20 shadow-inner">
                <CheckCircle2 className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-primary truncate leading-tight">
                  {selectedDevice.name || selectedDevice.device} ready
                </h3>
                <p className="text-sm text-muted-foreground font-medium mt-1">
                  Select a package or upload APK in the next step and start now
                </p>
              </div>
            </div>
            {setActiveTab && (
              <Button
                onClick={() => setActiveTab("recorder")}
                size="lg"
                className="w-full md:w-auto h-11 px-8 bg-primary text-white font-bold gap-2 shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all hover:-translate-y-0.5"
              >
                Start Recording
                <ChevronDown className="h-4 w-4 -rotate-90" />
              </Button>
            )}
          </div>
        )
      }
    </div >
  );
}