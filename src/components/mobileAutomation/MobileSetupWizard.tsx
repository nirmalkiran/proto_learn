/**
 * Purpose:
 * Guides the user through the initial setup of the mobile automation environment.
 * Handles checking local service health (Appium, Agent), starting emulators,
 * and managing connections to physical devices.
 */
import React, { useState, useEffect, useRef } from "react";

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
// Status icon renderer with premium styling
const icon = (status: CheckResult["status"]) => {
  if (status === "success") {
    return (
      <div className="relative">
        <div className="absolute inset-0 bg-green-500/20 blur-sm rounded-full animate-pulse" />
        <CheckCircle2 className="h-5 w-5 text-green-500 relative z-10 drop-shadow-[0_0_8px_rgba(34,197,94,0.3)]" />
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="relative">
        <div className="absolute inset-0 bg-red-500/10 blur-sm rounded-full" />
        <XCircle className="h-5 w-5 text-red-500 relative z-10" />
      </div>
    );
  }
  if (status === "checking") {
    return (
      <div className="relative">
        <Loader2 className="h-5 w-5 animate-spin text-blue-500 relative z-10" />
        <div className="absolute inset-0 border-2 border-blue-500/30 border-t-transparent rounded-full animate-ping opacity-20" />
      </div>
    );
  }
  return <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/20 bg-muted/10" />;
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

/**
 * Purpose:
 * The main component for the Setup Wizard. Provides a step-by-step
 * checklist for preparing the mobile automation environment.
 */
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

  const selectedDeviceRef = useRef<SelectedDevice | null>(selectedDevice);
  const selectedDeviceMissingPollsRef = useRef(0);

  useEffect(() => {
    selectedDeviceRef.current = selectedDevice;
  }, [selectedDevice]);

  const update = (key: string, value: CheckResult) =>
    setChecks((prev) => ({ ...prev, [key]: value }));

  /**
   * Purpose:
   * Initializes device fetching and sets up a polling interval
   * to keep the service status and device list up-to-date.
   */
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
    let unhealthyCount = 0;
    const pollInterval = setInterval(() => {
      // CIRCUIT BREAKER: If helper is down multiple times, stop frequent polling
      if (unhealthyCount > 3) {
        // Check only once every 30 seconds if offline
        if (Date.now() % 30000 < 5000) {
          checkAllServicesStatus().catch(() => { });
        }
        return;
      }

      if (devicesFetched) {
        checkAllServicesStatus().then(status => {
          if (status === "offline") unhealthyCount++;
          else unhealthyCount = 0;
        }).catch(() => unhealthyCount++);

        fetchAvailableDevices().catch(() => { });
      }
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [devicesFetched]);

  /**
   * Purpose:
   * Verifies if the Android Emulator is currently running
   * by querying the local automation agent.
   */
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


  /**
   * Purpose:
   * Sends a request to the local agent to launch a specific
   * Android Virtual Device (AVD).
   */
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

  /**
   * Purpose:
   * Sends a request to the local agent to shut down the currently
   * running Android Emulator.
   */
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

  /**
   * Purpose:
   * Orchestrates the transition between different devices (Emulator vs Physical).
   * Ensures mutual exclusion (only one device active at a time) and handles
   * background service cleanup/setup during the switch.
   */
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


  /**
   * Purpose:
   * Queries the local agent for all connected physical devices and
   * available Android Virtual Devices (AVDs).
   */
  const fetchAvailableDevices = async () => {
    setDevicesLoading(true);
    try {
      // Fetch both connected devices and available AVDs
      const [connectedRes, availableRes] = await Promise.all([
        fetch(`${AGENT_URL}/device/check`).catch(() => null),
        fetch(`${AGENT_URL}/emulator/available`).catch(() => null),
      ]);

      const connectedKnown = !!connectedRes?.ok;
      const availableKnown = !!availableRes?.ok;
      const anyKnown = connectedKnown || availableKnown;

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
      const currentSelected = selectedDeviceRef.current;
      if (currentSelected && anyKnown) {
        const stillPresent =
          allDevices.length > 0 && allDevices.some((d) => d.id === currentSelected.device);

        if (stillPresent) {
          selectedDeviceMissingPollsRef.current = 0;
        } else {
          selectedDeviceMissingPollsRef.current += 1;
          if (selectedDeviceMissingPollsRef.current >= 2) {
            console.log("[MobileSetupWizard] Selected device disconnected, clearing selection");
            selectedDeviceMissingPollsRef.current = 0;
            setSelectedDevice(null);
            setSetupState((p: any) => ({ ...p, device: false, emulator: false }));
            setChecks((prev) => ({
              ...prev,
              device: { status: "pending", message: "Disconnected" },
              emulator: { status: "pending", message: "Disconnected" },
            }));
          }
        }
      }

      if (allDevices.length > 0) {
        // Auto-select logic: Only if NO device is currently selected
        const physical = allDevices.find((d) => d.type === "real");

        if (!selectedDeviceRef.current) {
          if (physical) {
            handleDeviceChange(physical, true);
          } else if (allDevices.length === 1) {
            handleDeviceChange(allDevices[0], true);
          }
        }
      }
    } catch (error) {
      // Suppress noisy logs - this is expected when agent isn't running
      console.debug("[fetchAvailableDevices] Agent not running");
    } finally {
      setDevicesLoading(false);
      setDevicesFetched(true);
    }
  };

  /**
   * Purpose:
   * Performs a "one-tap" startup of all essential mobile automation services:
   * 1. Health check of the local helper.
   * 2. Appium server launch.
   * 3. Device/Emulator initialization.
   * 4. Local agent (SSE handler) startup.
   */
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

      // NEW: Polling for online status with retries
      let isOnline = false;
      for (let i = 0; i < 6; i++) {
        const currentStatus = await checkAllServicesStatus(true);
        if (currentStatus === "online") {
          isOnline = true;
          break;
        }
        // Wait 1.5s between retries to allow services to boot
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      // If still not online after retries, do one final sync that shows errors
      if (!isOnline) {
        await checkAllServicesStatus();
      }

      // Secondary syncs after a delay for Appium/Emulator boot time
      setTimeout(() => checkAllServicesStatus(), 10000);
      setTimeout(() => checkAllServicesStatus(), 20000);
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
  /**
   * Purpose:
   * Retrieves an aggregated status report for all mobile automation components
   * from the local agent in a single request to minimize UI flickering.
   */
  const checkAllServicesStatus = async (isStarting = false) => {
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
      // Device list refresh is already handled by the 5s polling loop.
      // Triggering fetch here creates redundant requests and stale-closure loops.

      return "online";
    } catch (error: any) {
      // Suppress noisy connection logs - expected state when agent isn't running
      const isNetworkError = error.name === 'TypeError' || error.message?.includes('fetch');

      if (!isNetworkError) {
        console.warn("[checkAllServicesStatus] Unexpected error:", error);
      }

      // If we are currently starting services, don't set UI to error yet
      if (isStarting) return "offline";

      const isTimeout = error.name === 'TimeoutError';
      const errorMessage = isTimeout ? "Helper timed out" : "Helper unreachable";
      const errorState = { status: "error" as const, message: errorMessage };

      update("backend", errorState);
      update("agent", errorState);
      update("appium", errorState);
      update("emulator", errorState);
      update("physicalDevice", errorState);
      update("device", errorState);

      return "offline";
    }
  };
  /**
   * Purpose:
   * Configures and starts the interactive Driver.js guided tour for the Setup Wizard,
   * highlighting key areas like Service Status and Device Setup.
   */
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
      {/* Premium Helper Bar (Consolidated links) */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-secondary/30 backdrop-blur-md rounded-2xl border border-border shadow-sm mb-2 animate-in fade-in slide-in-from-top-4 duration-700">
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          <button
            id="prerequisites-guide"
            onClick={() => {
              setPrerequisitesOpen(!prerequisitesOpen);
              if (!prerequisitesOpen) setInstallationGuideOpen(false);
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all duration-300 group ${prerequisitesOpen ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-primary/5 hover:text-primary'}`}
          >
            <BookOpen className={`h-3.5 w-3.5 transition-transform duration-500 ${prerequisitesOpen ? 'scale-110' : 'group-hover:rotate-12'}`} />
            <span className="hidden sm:inline">Automation Roadmap</span>
            <span className="sm:hidden">Roadmap</span>
            <ChevronDown className={`h-3 w-3 transition-transform duration-500 ${prerequisitesOpen ? 'rotate-180' : ''}`} />
          </button>

          <button
            id="complete-installation-guide"
            onClick={() => {
              setInstallationGuideOpen(!installationGuideOpen);
              if (!installationGuideOpen) setPrerequisitesOpen(false);
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all duration-300 group ${installationGuideOpen ? 'bg-blue-500/10 text-blue-600' : 'text-muted-foreground hover:bg-blue-500/5 hover:text-blue-500'}`}
          >
            <Download className={`h-3.5 w-3.5 transition-transform duration-500 ${installationGuideOpen ? 'scale-110' : 'group-hover:bounce'}`} />
            <span className="hidden sm:inline">Toolkit Installation</span>
            <span className="sm:hidden">Toolkit</span>
            <ChevronDown className={`h-3 w-3 transition-transform duration-500 ${installationGuideOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={startTour}
          className="text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/10 gap-2 h-9 px-4 rounded-xl border border-primary/10 backdrop-blur-sm transition-all group shrink-0"
        >
          <HelpCircle className="h-3.5 w-3.5 group-hover:rotate-12 transition-transform" />
          Guided Experience
        </Button>
      </div>

      {/* Expanded Content Areas (Minimalist) */}
      <div className="space-y-4">
        <Collapsible open={prerequisitesOpen} onOpenChange={setPrerequisitesOpen}>
          <CollapsibleContent className="animate-in slide-in-from-top-2 fade-in duration-300">
            <Card className="bg-card/40 backdrop-blur-sm border-primary/20 shadow-lg mb-4 overflow-hidden">
              <ScrollArea className="w-full" style={{ maxHeight: '400px' }}>
                <div className="p-6">
                  <div className="relative">
                    <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-primary/10 hidden sm:block" />
                    <div className="space-y-8">
                      {/* Step 1: Environment */}
                      <div className="relative sm:pl-14">
                        <div className="absolute left-0 top-0 h-9 w-9 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center text-primary-foreground font-black text-sm shadow-[0_4px_12px_rgba(var(--primary),0.3)] z-10 hidden sm:flex">1</div>
                        <div>
                          <h4 className="text-base font-bold text-primary mb-2">Foundation: System Prerequisites</h4>
                          <p className="text-xs text-muted-foreground mb-4 leading-relaxed font-medium">Ensure <strong>Node.js (v18+)</strong> and the <strong>Android SDK</strong> are configured correctly.</p>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline" className="text-[10px] font-medium border-primary/10 py-0 h-6"><Terminal className="h-3 w-3 mr-1 text-primary/60" /> npm start (Helper)</Badge>
                            <Badge variant="outline" className="text-[10px] font-medium border-primary/10 py-0 h-6"><Package className="h-3 w-3 mr-1 text-primary/60" /> Appium Server</Badge>
                          </div>
                        </div>
                      </div>

                      {/* Step 2: Device */}
                      <div className="relative sm:pl-14">
                        <div className="absolute left-0 top-0 h-9 w-9 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-black text-sm border border-primary/20 z-10 hidden sm:flex">2</div>
                        <div>
                          <h4 className="text-base font-bold text-primary mb-2">Connection: Bridge the Gap</h4>
                          <p className="text-xs text-muted-foreground mb-4 leading-relaxed font-medium">Connect via USB for physical testing or initiate a high-performance <strong>Android Emulator</strong>.</p>
                          <div className="p-3 bg-amber-500/[0.03] border border-amber-500/10 rounded-2xl flex items-start gap-3 shadow-sm">
                            <Info className="h-4 w-4 text-amber-500 mt-0.5" />
                            <p className="text-[11px] text-amber-800/80 leading-normal font-medium italic">Pro Tip: If your device is shy, a quick <code>adb devices</code> usually resolves connection issues.</p>
                          </div>
                        </div>
                      </div>

                      {/* Step 3: Recording */}
                      <div className="relative sm:pl-14">
                        <div className="absolute left-0 top-0 h-9 w-9 rounded-2xl bg-primary/5 text-primary/40 flex items-center justify-center font-black text-sm border border-primary/10 z-10 hidden sm:flex">3</div>
                        <div>
                          <h4 className="text-base font-bold text-primary mb-2">Execution: Record & Refine</h4>
                          <p className="text-xs text-muted-foreground mb-4 leading-relaxed font-medium">Capture interactions and transform manual tasks into a <strong>No-Code Script</strong> for infinite replay.</p>
                          <div className="flex items-center gap-4 text-[10px] font-bold text-primary/40 uppercase tracking-widest bg-primary/[0.02] p-3 rounded-2xl border border-primary/5 inline-flex">
                            <div className="flex items-center gap-2"><Smartphone className="h-3.5 w-3.5" /> Record</div>
                            <div className="h-1 w-1 rounded-full bg-primary/20" />
                            <div className="flex items-center gap-2"><ClipboardCheck className="h-3.5 w-3.5" /> Save</div>
                            <div className="h-1 w-1 rounded-full bg-primary/20" />
                            <div className="flex items-center gap-2"><RefreshCw className="h-3.5 w-3.5" /> Replay</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </Card>
          </CollapsibleContent>
        </Collapsible>

        <Collapsible open={installationGuideOpen} onOpenChange={setInstallationGuideOpen}>
          <CollapsibleContent className="animate-in slide-in-from-top-2 fade-in duration-300">
            <Card className="bg-card/40 backdrop-blur-sm border-blue-500/20 shadow-lg mb-4 overflow-hidden">
              <ScrollArea className="h-[460px] w-full">
                <div className="p-6">
                  <div className="relative">
                    <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-blue-500/10 hidden sm:block" />
                    <div className="space-y-8">
                      {/* Step 1: Node.js */}
                      <div className="relative sm:pl-12">
                        <div className="absolute left-0 top-0 h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm shadow-md z-10 hidden sm:flex">1</div>
                        <div>
                          <h4 className="text-base font-bold text-blue-600 mb-2">Install Node.js</h4>
                          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">Download LTS from <a href="https://nodejs.org/" target="_blank" rel="noreferrer" className="text-blue-500 underline">nodejs.org</a>.</p>
                          <div className="p-3 bg-green-500/5 border border-green-500/10 rounded-lg flex items-center justify-between max-w-md">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                              <span className="text-[10px] font-mono">node --version</span>
                            </div>
                            <span className="text-xs text-green-600 font-bold tracking-tighter uppercase">Verify (v18+)</span>
                          </div>
                        </div>
                      </div>

                      {/* Step 2: Appium */}
                      <div className="relative sm:pl-14">
                        <div className="absolute left-0 top-0 h-9 w-9 rounded-2xl bg-blue-500/20 text-blue-600 flex items-center justify-center font-black text-sm border border-blue-500/30 z-10 hidden sm:flex">2</div>
                        <div>
                          <h4 className="text-base font-bold text-blue-600 mb-2">Core: Appium & ADB</h4>
                          <div className="space-y-3 max-w-lg">
                            <div className="p-3 bg-muted/40 rounded-2xl border border-muted-foreground/10 flex items-center justify-between shadow-sm">
                              <code className="text-[10px] font-mono text-blue-600 font-bold">npm install -g appium</code>
                              <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => { navigator.clipboard.writeText('npm install -g appium'); toast.success('Copied'); }}>
                                <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="p-3 bg-background/50 rounded-2xl text-center border border-muted-foreground/5 shadow-sm">
                                <p className="text-[9px] font-black text-muted-foreground/50 uppercase mb-1 tracking-tighter">ADB Version</p>
                                <code className="text-[10px] font-mono font-bold text-blue-500/70">adb version</code>
                              </div>
                              <div className="p-3 bg-background/50 rounded-2xl text-center border border-muted-foreground/5 shadow-sm">
                                <p className="text-[9px] font-black text-muted-foreground/50 uppercase mb-1 tracking-tighter">Appium Version</p>
                                <code className="text-[10px] font-mono font-bold text-blue-500/70">appium -v</code>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Step 3: Local Helper */}
                      <div className="relative sm:pl-14">
                        <div className="absolute left-0 top-0 h-9 w-9 rounded-2xl bg-blue-500/[0.05] text-blue-600/60 flex items-center justify-center font-black text-sm border border-blue-500/10 z-10 hidden sm:flex">3</div>
                        <div>
                          <h4 className="text-base font-bold text-blue-600 mb-2 font-black tracking-tight">Activation: Local Helper</h4>
                          <div className="space-y-2 max-w-lg">
                            {[
                              { label: "1. Open", text: "Extract and open the folder, right-click and Open Terminal" },
                              { label: "2. Install", cmd: "npm install" },
                              { label: "3. Start", cmd: "npm start" }
                            ].map((step, i) => (
                              <div key={i} className="p-3 bg-muted/30 rounded-xl border border-muted-foreground/5 flex items-center justify-between gap-4 shadow-sm group hover:border-primary/20 transition-all duration-300">
                                <div className="flex flex-col gap-1 min-w-0 flex-1">
                                  <span className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-widest">{step.label}</span>
                                  {step.cmd ? (
                                    <code className="text-[11px] font-mono text-primary/90 font-bold leading-none">{step.cmd}</code>
                                  ) : (
                                    <p className="text-[11px] text-foreground/80 font-medium leading-tight">{step.text}</p>
                                  )}
                                </div>
                                {step.cmd && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-muted-foreground hover:text-primary transition-colors flex-shrink-0"
                                    onClick={() => {
                                      navigator.clipboard.writeText(step.cmd!);
                                      toast.success('Copied to clipboard');
                                    }}
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Troubleshooting Footer */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-6 mt-6 border-t border-muted-foreground/10">
                    <div className="p-4 bg-amber-500/[0.03] border border-amber-500/10 rounded-2xl flex items-start gap-3">
                      <Info className="h-4 w-4 text-amber-500 mt-1" />
                      <p className="text-[10px] text-muted-foreground leading-relaxed font-medium">On <strong>Windows</strong>, use PowerShell Admin. On <strong>macOS</strong>, ensure Xcode licenses are agreed.</p>
                    </div>
                    <div className="p-4 bg-red-500/[0.03] border border-red-500/10 rounded-2xl flex items-start gap-3">
                      <AlertCircle className="h-4 w-4 text-red-500 mt-1" />
                      <p className="text-[10px] text-muted-foreground leading-relaxed font-medium">If <code>adb</code> is missing, check your PATH variables and restart the terminal.</p>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* REDESIGNED: Steps Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Step 1: Local Setup */}
        <div id="step-local-setup">
          <Card className={`h-full ${checks.backend.status === "success" && checks.agent.status === "success" ? "border-primary/20" : ""} bg-card/50 backdrop-blur-sm shadow-card hover:shadow-elegant rounded-xl overflow-hidden flex flex-col transition-all duration-300 border-border`}>
            <CardHeader className="py-5 px-6 pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-[10px] h-6 px-2.5 uppercase font-black tracking-widest bg-primary/5 text-primary border-primary/20 flex items-center justify-center">Step 1</Badge>
                  <CardTitle className="text-lg font-bold tracking-tight">Local Setup</CardTitle>
                </div>
                {checks.backend.status === "success" && checks.agent.status === "success" && (
                  <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-green-200 text-[10px] font-bold px-2 py-0.5 h-6 animate-pulse">
                    READY
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pb-6 px-6 pt-2 space-y-6 flex-1 flex flex-col">
              <Button
                onClick={() => startAllServices()}
                className="w-full h-12 text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all hover:-translate-y-0.5 rounded-2xl active:scale-95"
                disabled={startingServices}
              >
                {startingServices ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Power className="mr-2.5 h-4 w-4" />
                    Initialize Engine
                  </>
                )}
              </Button>

              <div className="space-y-3 pt-4">
                <p className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.2em] px-1">Infrastructure</p>
                <div className="grid grid-cols-1 gap-2.5">
                  {/* Features List */}
                  {[
                    { icon: Server, label: "Appium Orchestrator", desc: "Mobile automation engine" },
                    { icon: Terminal, label: "ADB Interface", desc: "Android bridge & control" },
                    { icon: Smartphone, label: "Neural Agent", desc: "Real-time interaction" }
                  ].map((feat, i) => (
                    <div key={i} className="flex items-center gap-3.5 p-3 bg-muted/30 rounded-lg border border-transparent hover:border-primary/20 transition-all duration-200 group">
                      <div className="p-2 bg-background rounded-md shadow-sm border border-border group-hover:scale-105 transition-transform">
                        <feat.icon className="h-4 w-4 text-primary/70" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold leading-tight tracking-tight">{feat.label}</p>
                        <p className="text-[10px] text-muted-foreground/60 truncate mt-0.5">{feat.desc}</p>
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
          <Card className="h-full bg-card/50 backdrop-blur-sm shadow-card hover:shadow-elegant rounded-xl overflow-hidden flex flex-col transition-all duration-300 border-border">
            <CardHeader className="py-5 px-6 pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-[10px] h-6 px-2.5 uppercase font-black tracking-widest bg-primary/5 text-primary border-primary/20 flex items-center justify-center">Step 2</Badge>
                  <CardTitle className="text-lg font-bold tracking-tight">System Status</CardTitle>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => checkAllServicesStatus()}
                  className="h-9 px-4 text-xs font-bold gap-2.5 border-primary/20 hover:border-primary/50 hover:bg-primary/5 transition-all active:scale-95 shadow-sm rounded-xl group"
                  id="status-refresh-btn"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${items.some(item => checks[item.key].status === 'checking') ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
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
                        <div className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all duration-200 group cursor-default shadow-sm ${checks[key].status === 'success'
                          ? 'bg-green-500/5 border-green-500/20 hover:border-green-500/40'
                          : checks[key].status === 'error'
                            ? 'bg-red-500/5 border-red-500/20 hover:border-red-500/40'
                            : 'bg-muted/30 border-border hover:border-primary/20'
                          }`}>
                          <div className="flex-shrink-0">
                            {icon(checks[key].status)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-tight leading-none mb-1 group-hover:text-foreground transition-colors">{label}</p>
                            <p className={`text-xs font-bold truncate ${checks[key].status === 'success' ? 'text-green-600' : checks[key].status === 'error' ? 'text-red-500' : 'text-foreground'}`}>
                              {checks[key].status === 'success' ? 'Active' : checks[key].status === 'error' ? 'Offline' : checks[key].status === 'checking' ? 'Checking...' : 'Pending'}
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
                <div className={`p-3.5 rounded-2xl border transition-all duration-500 overflow-hidden relative group ${items.every(i => checks[i.key].status === 'success')
                  ? 'bg-green-500/[0.04] border-green-500/20 shadow-[0_0_20px_rgba(34,197,94,0.05)]'
                  : 'bg-primary/[0.03] border-primary/20 shadow-sm'
                  }`}>
                  {/* Subtle background glow */}
                  <div className={`absolute -right-4 -top-4 w-24 h-24 rounded-full blur-2xl transition-opacity duration-1000 ${items.every(i => checks[i.key].status === 'success') ? 'bg-green-500/10 opacity-100' : 'bg-primary/5 opacity-50'
                    }`} />

                  <div className="flex items-start gap-4 relative z-10">
                    <div className={`p-2.5 rounded-xl shadow-sm transition-colors duration-500 ${items.every(i => checks[i.key].status === 'success') ? 'bg-green-500/20 text-green-600' : 'bg-primary/10 text-primary'
                      }`}>
                      {items.every(i => checks[i.key].status === 'success')
                        ? <CheckCircle2 className="h-4 w-4 animate-bounce" style={{ animationDuration: '3s' }} />
                        : <Info className="h-4 w-4" />
                      }
                    </div>
                    <div className="min-w-0">
                      <p className={`text-xs font-bold tracking-tight ${items.every(i => checks[i.key].status === 'success') ? 'text-green-700' : 'text-foreground'}`}>
                        Connection Summary
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-relaxed mt-1 font-medium italic">
                        {items.every(i => checks[i.key].status === 'success')
                          ? "Configuration verified. All systems are primed for high-fidelity recording."
                          : "System verification in progress. Please ensure all local services are active."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Step 3: Device Selection */}
        <div id="step-device-setup">
          <Card className="h-full bg-card/50 backdrop-blur-sm shadow-card hover:shadow-elegant rounded-xl overflow-hidden flex flex-col transition-all duration-300 border-border">
            <CardHeader className="py-5 px-6 pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-[10px] h-6 px-2.5 uppercase font-black tracking-widest bg-primary/5 text-primary border-primary/20 flex items-center justify-center">Step 3</Badge>
                  <CardTitle className="text-lg font-bold tracking-tight">Device Selection</CardTitle>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchAvailableDevices}
                  disabled={devicesLoading}
                  className="h-9 px-4 text-xs font-bold gap-2.5 border-primary/20 hover:border-primary/50 hover:bg-primary/5 transition-all active:scale-95 shadow-sm rounded-xl group"
                  id="device-scan-btn"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${devicesLoading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
                  Scan
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pb-5 px-4 pt-1 space-y-4 flex-1">
              {/* Physical Devices List - Compact */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">
                    Physical Device
                  </h4>
                </div>
                <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                  {availableDevices.filter(d => d.type === "real").length > 0 ? (
                    availableDevices.filter(d => d.type === "real").map((device) => {
                      const isActive = selectedDevice?.device === device.id && selectedDevice.real_mobile;
                      return (
                        <button
                          key={device.id}
                          onClick={() => handleDeviceChange(device)}
                          className={`w-full flex items-center justify-between p-3 rounded-lg border text-left transition-all duration-200 group ${isActive
                            ? "bg-primary/5 border-primary/20 shadow-sm"
                            : "bg-muted/30 border-transparent hover:border-border hover:bg-muted/50"
                            }`}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className={`p-1.5 rounded-lg transition-colors ${isActive ? "bg-primary/20" : "bg-muted/20"}`}>
                              <Smartphone className={`h-3.5 w-3.5 flex-shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                            </div>
                            <p className={`text-xs font-bold truncate leading-tight tracking-tight ${isActive ? "text-primary" : "text-muted-foreground/80 group-hover:text-foreground"}`}>
                              {device.name || device.id}
                            </p>
                          </div>
                          {isActive && (
                            <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center border border-primary/20 animate-in zoom-in-50 duration-300">
                              <CheckCircle2 className="h-3 w-3 text-primary flex-shrink-0" />
                            </div>
                          )}
                        </button>
                      );
                    })
                  ) : (
                    <div className="p-4 border border-dashed rounded-lg border-border text-center bg-muted/10">
                      <p className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest italic">No hardware detected</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Emulators List - Compact */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">
                    Virtual Instances
                  </h4>
                </div>
                <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                  {availableDevices.filter(d => d.type === "emulator").length > 0 ? (
                    availableDevices.filter(d => d.type === "emulator").map((device) => {
                      const isActive = selectedDevice?.device === device.id && !selectedDevice.real_mobile;
                      const isRunning = isActive && checks.emulator.status === "success";
                      return (
                        <button
                          key={device.id}
                          onClick={() => handleDeviceChange(device)}
                          className={`w-full flex items-center justify-between p-3 rounded-2xl border text-left transition-all duration-300 group ${isActive
                            ? "bg-primary/[0.04] border-primary/40 shadow-[0_0_15px_rgba(var(--primary),0.05)] ring-1 ring-primary/20"
                            : "bg-muted/10 border-muted-foreground/5 hover:border-primary/20 hover:bg-muted/20"
                            }`}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className={`p-1.5 rounded-lg transition-colors ${isActive ? "bg-primary/20" : "bg-muted/20"}`}>
                              <Terminal className={`h-3.5 w-3.5 flex-shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                            </div>
                            <p className={`text-xs font-bold truncate leading-tight tracking-tight ${isActive ? "text-primary" : "text-muted-foreground/80 group-hover:text-foreground"}`}>
                              {device.name || device.id}
                            </p>
                          </div>
                          {isActive && (
                            <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center border border-primary/20 animate-in zoom-in-50 duration-300">
                              <CheckCircle2 className="h-3 w-3 text-primary flex-shrink-0" />
                            </div>
                          )}
                        </button>
                      );
                    })
                  ) : (
                    <div className="p-4 border border-dashed rounded-lg border-border text-center bg-muted/10">
                      <p className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest italic">No virtual instances</p>
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
          <div className="p-6 bg-card/50 backdrop-blur-sm shadow-card rounded-xl border border-border flex flex-col md:flex-row items-center justify-between gap-6 animate-in zoom-in-95 slide-in-from-bottom-4 duration-700 relative overflow-hidden group">
            {/* Background decorative element */}
            <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-gradient-hero rounded-full blur-3xl opacity-50" />

            <div className="flex items-center gap-5 min-w-0 relative z-10">
              <div className="h-14 w-14 bg-primary/10 rounded-2xl flex items-center justify-center flex-shrink-0 border border-primary/20 shadow-inner group-hover:scale-110 transition-transform duration-500">
                <CheckCircle2 className="h-7 w-7 text-primary drop-shadow-[0_0_8px_rgba(var(--primary),0.3)]" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xl font-bold text-primary truncate tracking-tight">
                  {selectedDevice.name || selectedDevice.device} ready
                </h3>
                <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mt-1.5 opacity-60">
                  Select package & initiate recorder session
                </p>
              </div>
            </div>
            {setActiveTab && (
              <Button
                onClick={() => setActiveTab("recorder")}
                size="lg"
                className="w-full md:w-auto h-14 px-10 bg-primary text-white font-black uppercase tracking-widest gap-3 shadow-2xl shadow-primary/30 hover:shadow-primary/50 transition-all hover:-translate-y-1 rounded-2xl active:scale-95 group relative z-10 overflow-hidden"
              >
                Launch Recorder
                <div className="p-1 bg-white/20 rounded-lg group-hover:translate-x-1 transition-transform">
                  <ChevronDown className="h-4 w-4 -rotate-90" />
                </div>
              </Button>
            )}
          </div>
        )
      }
    </div >
  );
}
