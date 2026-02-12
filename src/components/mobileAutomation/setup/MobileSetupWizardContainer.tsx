/**
 * Purpose:
 * Guides the user through the initial setup of the mobile automation environment.
 * Handles checking local service health (Appium, Agent), starting emulators,
 * and managing connections to physical devices.
 */
import React, { useState, useEffect, useRef } from "react";

// Shared Types
import { CheckResult, DeviceInfo, SelectedDevice } from "../types";

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

// Icons
import {
  Check,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Server,
  Smartphone,
  Terminal,
  Power,
  AlertCircle,
  ClipboardCheck,
  Info,
  ChevronDown,
} from "lucide-react";

// Utils
import { toast } from "sonner";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { AGENT_URL } from "../constants/agent";
import { setupAgentService } from "../services/setupAgentService";

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
export interface MobileSetupWizardProps {
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
export default function MobileSetupWizardContainer({
  setupState,
  setSetupState,
  selectedDevice,
  setSelectedDevice,
  setActiveTab,
}: MobileSetupWizardProps) {
  // System status items configuration
  const items = [
    { key: "backend", label: "Backend Server", icon: Server },
    { key: "agent", label: "Agent", icon: Server },
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
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);

  const selectedDeviceRef = useRef<SelectedDevice | null>(selectedDevice);
  const selectedDeviceMissingPollsRef = useRef(0);

  useEffect(() => {
    selectedDeviceRef.current = selectedDevice;
  }, [selectedDevice]);

  const step1Ready =
    checks.backend.status === "success" && checks.agent.status === "success";
  const step2Enabled =
    step1Ready ||
    startingServices ||
    items.some((i) => checks[i.key].status !== "pending");
  const systemReadyKeys = ["backend", "agent", "appium"] as const;
  const step2Ready = systemReadyKeys.every(
    (key) => checks[key].status === "success"
  );
  const step3Enabled = step2Ready || (step1Ready && setupState.appium);
  const progressPct = activeStep === 1 ? 0 : activeStep === 2 ? 50 : 100;

  useEffect(() => {
    if (activeStep === 2 && !step2Enabled) {
      setActiveStep(1);
      return;
    }
    if (activeStep === 3 && !step3Enabled) {
      setActiveStep(step1Ready ? 2 : 1);
    }
  }, [activeStep, step1Ready, step2Ready, step3Enabled]);

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
        const healthRes = await setupAgentService.health(AbortSignal.timeout(2000));
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
      const healthCheck = await setupAgentService.health(AbortSignal.timeout(15000));

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
        const appiumRes = await setupAgentService.runTerminal({ command: "appium:start" });

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
        const agentRes = await setupAgentService.startAgent();
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

  const handleStartEngine = () => {
    startAllServices();
    setActiveStep(2);
  };
  /**
   * Purpose:
   * Retrieves an aggregated status report for all mobile automation components
   * from the local agent in a single request to minimize UI flickering.
   */
  const checkAllServicesStatus = async (isStarting = false) => {
    // Note: We do NOT reset to "checking" here to avoid UI flickering during background polls

    try {
      const res = await setupAgentService.setupStatus(AbortSignal.timeout(TIMEOUT_MS));

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
      {/* Stepper */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card/70 via-card/40 to-card/70 px-4 py-3 shadow-card backdrop-blur-sm">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-16 -right-10 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
          <div className="absolute -bottom-16 -left-10 h-32 w-32 rounded-full bg-emerald-500/10 blur-2xl" />
        </div>

        <div className="relative">
          <div className="absolute left-[calc(16.66%-14px)] right-[calc(16.66%-14px)] top-5 h-[2px] rounded-full bg-border/40" />
          <div
            className="absolute left-[calc(16.66%-14px)] top-5 h-[2px] rounded-full bg-gradient-to-r from-primary via-primary/70 to-emerald-400 transition-all duration-500"
            style={{ width: `calc(${progressPct}% - 2 * (16.66% - 14px))` }}
          />

          <div className="grid grid-cols-3 gap-2">
            {[
              { step: 1, label: "Setup", enabled: true },
              { step: 2, label: "System Status", enabled: step2Enabled },
              { step: 3, label: "Device Setup", enabled: step3Enabled },
            ].map((s) => {
              const isActive = activeStep === s.step;
              const isComplete =
                s.step === 1
                  ? step1Ready && activeStep >= 2
                  : s.step === 2
                    ? step2Ready && activeStep >= 3
                    : !!selectedDevice;
              const isDisabled = !s.enabled;
              return (
                <button
                  key={s.step}
                  onClick={() => !isDisabled && setActiveStep(s.step as 1 | 2 | 3)}
                  className={`group flex flex-col items-center gap-1.5 rounded-2xl px-2 py-1.5 transition-all duration-300 ${
                    isActive
                      ? "bg-primary/10 ring-1 ring-primary/20 shadow-[0_8px_18px_rgba(var(--primary),0.12)]"
                      : isDisabled
                        ? "opacity-60 cursor-not-allowed"
                        : "hover:bg-primary/5"
                  }`}
                  disabled={isDisabled}
                  aria-current={isActive ? "step" : undefined}
                >
                  <div
                    className={`relative h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold border transition-all duration-300 ${
                      isActive
                        ? "bg-primary text-white border-primary shadow-[0_0_10px_rgba(var(--primary),0.35)]"
                        : isComplete
                          ? "bg-primary/90 text-white border-primary shadow-[0_0_8px_rgba(var(--primary),0.25)]"
                          : "bg-background text-muted-foreground border-border"
                    }`}
                  >
                    {isComplete ? <Check className="h-3.5 w-3.5" /> : s.step}
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/90 text-center">
                    {s.label}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="grid grid-cols-1 gap-4">
        {/* Step 1: Local Setup */}
        {activeStep === 1 && (
          <div id="step-local-setup">
            <Card className={`h-full ${checks.backend.status === "success" && checks.agent.status === "success" ? "border-primary/20" : ""} bg-card/50 backdrop-blur-sm shadow-card hover:shadow-elegant rounded-xl overflow-hidden flex flex-col transition-all duration-300 border-border`}>
              <CardHeader className="py-5 px-6 pb-2">
                <div className="flex items-center justify-end">
                  {checks.backend.status === "success" && checks.agent.status === "success" && (
                    <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-green-200 text-xs font-bold px-2 py-0.5 h-6 animate-pulse">
                      READY
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pb-6 px-6 space-y-6 flex-1 flex flex-col">
                <div className="space-y-3 pt-2 order-1">
                  <p className="text-xs font-bold text-muted-foreground/40 uppercase tracking-[0.2em] px-1 pt-3">Infrastructure</p>
                  <div className="grid grid-cols-1 gap-2.5">
                    {/* Features List */}
                    {[
                      { icon: Server, label: "Appium", desc: "Mobile automation engine" },
                      { icon: Terminal, label: "ADB Interface", desc: "Android bridge & control" },
                      { icon: Smartphone, label: "Agent", desc: "Real-time interaction" }
                    ].map((feat, i) => (
                      <div key={i} className="flex items-center gap-3.5 p-3 bg-muted/30 rounded-lg border border-transparent hover:border-primary/20 transition-all duration-200 group">
                        <div className="p-2 bg-background rounded-md shadow-sm border border-border group-hover:scale-105 transition-transform">
                          <feat.icon className="h-4 w-4 text-primary/70" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold leading-tight tracking-tight">{feat.label}</p>
                          <p className="text-xs text-muted-foreground/60 truncate mt-0.5">{feat.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* <div className="order-2" /> */}
{/* 
                {checks.backend.status === "success" && checks.agent.status === "success" && (
                  <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/10 rounded-lg text-xs font-bold text-primary/80 animate-in fade-in slide-in-from-top-1 duration-500">
                    <Smartphone className="h-4 w-4" />
                    <span>Services are active!</span>
                  </div>
                )} */}


              </CardContent>
              <div className="flex justify-end gap-3 mb-3 px-6">
                <Button
                  onClick={handleStartEngine}
                  className="h-10 px-5 text-xs font-bold uppercase tracking-widest rounded-xl shadow-md shadow-primary/20 hover:shadow-primary/30 transition-all active:scale-95"
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
                      Start Engine
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => setActiveStep(2)}
                  disabled={!step2Enabled}
                  className="h-10 px-5 text-xs font-bold uppercase tracking-widest rounded-2xl shadow-md shadow-primary/20 hover:shadow-primary/30 transition-all active:scale-95"
                >
                  Next Step
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Step 2: System Status */}
        {activeStep === 2 && (
          <div id="step-system-status">
            <Card className="h-full bg-card/50 backdrop-blur-sm shadow-card hover:shadow-elegant rounded-xl overflow-hidden flex flex-col transition-all duration-300 border-border">
              <CardHeader className="py-5 px-6 pb-2">
                <div className="flex items-center justify-end">
                  {/* <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs h-6 px-2.5 uppercase font-bold tracking-widest bg-primary/5 text-primary border-primary/20 flex items-center justify-center">Step 2</Badge>
                    <CardTitle className="text-lg font-bold tracking-tight">System Status</CardTitle>
                  </div> */}
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
                              <p className="text-xs font-bold text-muted-foreground/70 uppercase tracking-tight leading-none mb-1 group-hover:text-foreground transition-colors">{label}</p>
                              <p className={`text-xs font-bold truncate ${checks[key].status === 'success' ? 'text-green-600' : checks[key].status === 'error' ? 'text-red-500' : 'text-foreground'}`}>
                                {checks[key].status === 'success' ? 'Active' : checks[key].status === 'error' ? 'Offline' : checks[key].status === 'checking' ? 'Checking...' : 'Pending'}
                              </p>
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs p-2">
                          {checks[key].message}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                </div>

                <div className="mt-3">
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
                        <p className="text-xs text-muted-foreground leading-relaxed mt-1 font-medium italic">
                          {items.every(i => checks[i.key].status === 'success')
                            ? "Configuration verified. All systems are primed for high-fidelity recording."
                            : "System verification in progress. Please ensure all local services are active."}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 flex justify-end">
                    <Button
                      onClick={() => setActiveStep(3)}
                      disabled={!step3Enabled}
                      className="h-10 px-5 text-xs font-bold uppercase tracking-widest rounded-2xl shadow-md shadow-primary/20 hover:shadow-primary/30 transition-all active:scale-95"
                    >
                      Next Step
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 3: Device Selection */}
        {activeStep === 3 && (
          <div id="step-device-setup">
            <Card className="h-full bg-card/50 backdrop-blur-sm shadow-card hover:shadow-elegant rounded-xl overflow-hidden flex flex-col transition-all duration-300 border-border">
              <CardHeader className="py-5 px-6 pb-2">
                <div className="flex items-center justify-end">
                  {/* <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs h-6 px-2.5 uppercase font-bold tracking-widest bg-primary/5 text-primary border-primary/20 flex items-center justify-center">Step 3</Badge>
                    <CardTitle className="text-lg font-bold tracking-tight">Device Selection</CardTitle>
                  </div> */}
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
                    <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground/40">
                      Physical Device(s)
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
                        <p className="text-xs font-bold text-muted-foreground/40 uppercase tracking-widest italic">No Physical Device Detected</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Emulators List - Compact */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground/40">
                      Virtual Emulator(s)
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
                        <p className="text-xs font-bold text-muted-foreground/40 uppercase tracking-widest italic">No Emulator Detected</p>
                      </div>
                    )}
                  </div>
                </div>

              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Selected Device Status & Next Steps */}
      {activeStep === 3 && selectedDevice && (
        <div className="p-6 bg-card/50 backdrop-blur-sm shadow-card rounded-xl border border-border flex flex-col md:flex-row items-center justify-between gap-6 animate-in zoom-in-95 slide-in-from-bottom-4 duration-700 relative overflow-hidden group">
          {/* Background decorative element */}
          <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-gradient-hero rounded-full blur-3xl opacity-50" />

          <div className="flex items-center gap-5 min-w-0 relative z-10">
            <div className="h-14 w-14 bg-primary/10 rounded-2xl flex items-center justify-center flex-shrink-0 border border-primary/20 shadow-inner group-hover:scale-110 transition-transform duration-500">
              <CheckCircle2 className="h-7 w-7 text-primary drop-shadow-[0_0_8px_rgba(var(--primary),0.3)]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-L font-bold text-primary truncate tracking-tight">
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
              className="w-full md:w-auto h-14 px-10 bg-primary text-white font-bold uppercase tracking-widest gap-3 shadow-2xl shadow-primary/30 hover:shadow-primary/50 transition-all hover:-translate-y-1 rounded-2xl active:scale-95 group relative z-10 overflow-hidden"
            >
              Launch Recorder
              <div className="p-1 bg-white/20 rounded-lg group-hover:translate-x-1 transition-transform">
                <ChevronDown className="h-4 w-4 -rotate-90" />
              </div>
            </Button>
          )}
        </div>
      )}
    </div >
  );
}
