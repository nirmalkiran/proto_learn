import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { createClient } from "@supabase/supabase-js";
import { Play, Pause, Square, Trash2, RefreshCw, Copy, Download, Monitor, Smartphone, Wifi, WifiOff, Upload, Package, CheckCircle, XCircle, Type, MousePointer2, Move, ChevronRight, Settings, Settings2, Info, AlertCircle, Circle, Keyboard, ChevronUp, ChevronDown, BookOpen, CheckCircle2, HelpCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import DeviceSelector from "./DeviceSelector";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";


import { ActionType, RecordedAction, SelectedDevice } from "./types";
import { ExecutionHistoryService } from "./ExecutionHistoryService";
import { ScenarioService, RecordedScenario } from "./ScenarioService";
import { ListChecks, Clock, RotateCcw, Terminal, History, Wand2, Save, FolderOpen, Edit, FileInput } from "lucide-react";

const AGENT_URL = "http://localhost:3001";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);
const DEVICE_WIDTH = 320;
const DEVICE_HEIGHT = 568;

const retryDeviceAction = async <T,>(
  action: () => Promise<T>,
  maxRetries: number = 2,
  delayMs: number = 300
): Promise<T> => {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await action();
    } catch (err) {
      lastError = err;

      if (attempt < maxRetries) {
        const backoffDelay = delayMs * Math.pow(2, attempt);
        console.debug(`[Retry] Attempt ${attempt + 1} failed, retrying in ${backoffDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
  }

  console.error('[Retry] All attempts failed:', lastError);
  throw lastError;
};
const waitForDeviceReady = async (
  agentUrl: string,
  timeoutMs: number = 10000,
  pollIntervalMs: number = 500
): Promise<boolean> => {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const res = await fetch(`${agentUrl}/device/check`, {
        signal: AbortSignal.timeout(2000)
      });
      const data = await res.json();

      if (data.connected) {
        console.debug('[DeviceReady] Device is ready');
        return true;
      }
    } catch (err) {
      // Continue polling on error
      console.debug('[DeviceReady] Check failed, continuing to poll...');
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  console.warn('[DeviceReady] Timeout waiting for device');
  return false; // Timeout
};

/**
 * Wait for screen to settle before action execution
 * Reduces "element not found" errors on slow devices
 */
const waitForScreenSettle = async (delayMs: number = 500): Promise<void> => {
  console.debug(`[ScreenSettle] Waiting ${delayMs}ms for screen to settle...`);
  await new Promise(resolve => setTimeout(resolve, delayMs));
};

interface MobileRecorderProps {
  setupState: {
    appium: boolean;
    emulator: boolean;
    device: boolean;
  };
  setSetupState?: (updater: any) => void;
  selectedDevice: SelectedDevice | null;
  setSelectedDevice: (device: SelectedDevice | null) => void;
  selectedDeviceFromSetup?: string;
}

export default function MobileRecorder({
  setupState,
  setSetupState,
  selectedDevice,
  setSelectedDevice,
  selectedDeviceFromSetup,
}: MobileRecorderProps) {
  // Recorder state moved from index.tsx
  const [recording, setRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [actions, setActions] = useState<RecordedAction[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [mirrorActive, setMirrorActive] = useState(false);
  const [mirrorImage, setMirrorImage] = useState<string | null>(null);
  const [mirrorError, setMirrorError] = useState<string | null>(null);
  const [mirrorLoading, setMirrorLoading] = useState(false);
  const [isPreparingDevice, setIsPreparingDevice] = useState(false);
  const [captureMode, setCaptureMode] = useState(false);
  const [deviceSize, setDeviceSize] = useState<{ width: number; height: number } | null>(null);
  const [inputText, setInputText] = useState("");
  const [inputCoords, setInputCoords] = useState<{ x: number; y: number } | null>(null);
  const [appPackage, setAppPackage] = useState("");
  const [isAppInstalled, setIsAppInstalled] = useState<boolean | null>(null);
  const [checkingInstall, setCheckingInstall] = useState(false);
  const [inputPending, setInputPending] = useState(false);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const [previewPendingId, setPreviewPendingId] = useState<string | null>(null);
  const [replaying, setReplaying] = useState<boolean>(false);
  const [deviceRefreshKey, setDeviceRefreshKey] = useState(0);
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [nextStepTrigger, setNextStepTrigger] = useState<(() => void) | null>(null);
  const [showInputPanel, setShowInputPanel] = useState(false);
  const [showQuickStart, setShowQuickStart] = useState(false);
  const [activeTab, setActiveTab] = useState<"actions" | "script" | "history">("actions");
  const [executionLogs, setExecutionLogs] = useState<{
    id: string;
    description: string;
    status: "pending" | "running" | "success" | "error";
    error?: string;
    duration?: number;
  }[]>([]);
  const [replayStartTime, setReplayStartTime] = useState<number | null>(null);
  const [lastReplayStatus, setLastReplayStatus] = useState<"PASS" | "FAIL" | null>(null);

  // Script editor state
  const [isEditingScript, setIsEditingScript] = useState(false);
  const [editableScript, setEditableScript] = useState("");
  const [savedManualScript, setSavedManualScript] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const screenshotIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [uiXml, setUiXml] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  //const pressCoordsRef = useRef<{ x: number, y: number } | null>(null);

  // Helper to extract a friendly name from package ID
  const getAppFriendlyName = useCallback((pkg: string) => {
    if (!pkg) return "";

    // Check for common patterns
    const apps: Record<string, string> = {
      'com.whatsapp': 'WhatsApp',
      'com.instagram.android': 'Instagram',
      'com.facebook.katana': 'Facebook',
      'com.google.android.youtube': 'YouTube',
      'com.android.chrome': 'Chrome',
      'com.snapchat.android': 'Snapchat',
      'com.spotify.music': 'Spotify',
      'com.google.android.gm': 'Gmail',
      'com.google.android.apps.maps': 'Google Maps',
      'com.android.settings': 'Settings',
      // 'com.beta.yourkeepr': 'Keepr Beta'
    };

    if (apps[pkg]) return apps[pkg];

    // Heuristic: take the last part and capitalize
    const parts = pkg.split('.');
    let last = parts[parts.length - 1];

    // Capitalize each word if separated by underscores or just the first char
    return last
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }, []);
  const pressCoordsRef = useRef<{ x: number, y: number } | null>(null);
  const longPressHappenedRef = useRef(false);
  const [apkUploading, setApkUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [apkInstalling, setApkInstalling] = useState(false);
  const [uploadedApk, setUploadedApk] = useState<{ path: string; name: string } | null>(null);
  const [installedPackages, setInstalledPackages] = useState<string[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);

  // Scenario Management State
  const [scenarios, setScenarios] = useState<RecordedScenario[]>([]);
  const [currentScenarioId, setCurrentScenarioId] = useState<string | null>(null);
  const [currentScenarioName, setCurrentScenarioName] = useState<string>("");
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [isLoadDialogOpen, setIsLoadDialogOpen] = useState(false);
  const [saveScenarioName, setSaveScenarioName] = useState("");
  const [loadingScenarios, setLoadingScenarios] = useState(false);

  // Advanced Configuration (Optional - for power users)
  const [advancedConfig, setAdvancedConfig] = useState({
    // Retry settings
    maxRetries: 2,
    retryDelayMs: 300,

    // Device readiness polling
    deviceReadyTimeoutMs: 10000,
    deviceReadyPollIntervalMs: 500,
    emulatorReadyTimeoutMs: 15000,
    emulatorReadyPollIntervalMs: 1000,

    // Screen settling
    screenSettleDelayMs: 500,

    // Screenshot stream
    screenshotMaxFails: 5,
    screenshotTimeoutMs: 8000,
  });

  /* CONNECT TO SSE STREAM */
  const connectToEventStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setConnectionStatus("connecting");
    console.log("[MobileRecorder] Connecting to SSE stream...");

    const source = new EventSource(`${AGENT_URL}/recording/events`);
    eventSourceRef.current = source;

    source.onopen = () => {
      console.log("[MobileRecorder] SSE connected");
      setConnectionStatus("connected");
      if (recording) {
        toast.success("Connected to recording agent");
      }
    };

    source.onmessage = (e) => {
      try {
        console.log("[MobileRecorder] Received event:", e.data);
        const event = JSON.parse(e.data);

        // Map events to user-friendly messages for replay progress
        if (event.type && event.type.startsWith("replay")) {
          if (event.type === "replay:start") {
            setReplaying(true);
            toast.info(event.description);
          } else if (event.type === "replay:info") {
            toast.info(event.description);
          } else if (event.type === "replay:step:start") {
            // Mark step as running
            setExecutionLogs(prev => prev.map((log, idx) => {
              // Try to match by ID if available, otherwise index
              const isMatch = event.stepId ? log.id === event.stepId : idx === event.index;
              return isMatch ? { ...log, status: "running" } : log;
            }));
          } else if (event.type === "replay:step:success") {
            // Mark step as success
            setExecutionLogs(prev => prev.map((log, idx) => {
              const isMatch = event.stepId ? log.id === event.stepId : idx === event.index;
              return isMatch ? { ...log, status: "success", duration: event.duration } : log;
            }));
          } else if (event.type === "replay:step:error") {
            // Mark step as error
            setExecutionLogs(prev => prev.map((log, idx) => {
              const isMatch = event.stepId ? log.id === event.stepId : idx === event.index;
              return isMatch ? { ...log, status: "error", error: event.error } : log;
            }));
          }
        } else if (event.type === "step-added") {
          // Handle real-time step recording from server
          if (!recording || isPaused) return;

          const newStep = {
            ...event.step,
            id: event.step.id || crypto.randomUUID(), // Prefer server ID
            enabled: true
          };

          setActions(prev => {
            // Deduplicate based on ID if server provides it, otherwise use type+timestamp
            const isDuplicate = prev.some(a =>
              (a.id === newStep.id) ||
              (a.type === newStep.type && Math.abs(a.timestamp - newStep.timestamp) < 300)
            );
            if (isDuplicate) return prev;
            return [...prev, newStep];
          });
          setSavedManualScript(null); // Invalidate manual edit when new step arrives
          toast.success("Action recorded");
        }
      } catch (err) {
        console.error("SSE parse error", err);
      }
    };

    source.onerror = (err) => {
      console.error("[MobileRecorder] SSE connection error:", err);
      if (source.readyState === EventSource.CLOSED) {
        setConnectionStatus("disconnected");
      } else {
        setConnectionStatus("connecting");
      }
    };
  }, [recording]);

  /* =====================================================
   * SCENARIO MANAGEMENT HANDLERS
   * ===================================================== */

  const fetchScenarios = async () => {
    setLoadingScenarios(true);
    const res = await ScenarioService.getScenarios();
    setLoadingScenarios(false);

    if (res.success && res.data) {
      setScenarios(res.data);
    } else {
      toast.error("Failed to load scenarios");
    }
  };

  const handleSaveScenario = async () => {
    if (!saveScenarioName.trim()) {
      toast.error("Please enter a scenario name");
      return;
    }

    if (actions.length === 0) {
      toast.error("No actions to save");
      return;
    }

    // Determine if updating existing or saving new (Create copy if ID is cleared)
    // If user explicitly opened "Save As" (which we can flag), we clear ID.
    // For now, simple Save logic:

    const res = await ScenarioService.saveScenario(
      saveScenarioName,
      actions,
      currentScenarioId || undefined, // Update if ID exists
      undefined, // description
      appPackage
    );

    if (res.success && res.data) {
      toast.success("Scenario saved successfully");
      setCurrentScenarioId(res.data.id);
      setCurrentScenarioName(res.data.name);
      setIsSaveDialogOpen(false);
      setSaveScenarioName(""); // Reset input
      fetchScenarios(); // Refresh list
    } else {
      toast.error(res.error || "Failed to save scenario");
    }
  };

  const loadScenario = (scenario: RecordedScenario) => {
    // Parse steps if they are stored as JSON string (Supabase might return object automatically)
    let loadedActions = scenario.steps;
    if (typeof loadedActions === 'string') {
      try { loadedActions = JSON.parse(loadedActions); } catch (e) { console.error("Parse steps failed", e); }
    }

    setActions(loadedActions);
    setCurrentScenarioId(scenario.id);
    setCurrentScenarioName(scenario.name);
    setAppPackage(scenario.app_package || "");
    setIsLoadDialogOpen(false);
    toast.success(`Loaded scenario: ${scenario.name}`);
  };

  const deleteScenario = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this scenario?")) return;

    const res = await ScenarioService.deleteScenario(id);
    if (res.success) {
      toast.success("Scenario deleted");
      if (currentScenarioId === id) {
        setCurrentScenarioId(null);
        setCurrentScenarioName("");
      }
      fetchScenarios();
    } else {
      toast.error("Failed to delete scenario");
    }
  };





  /* =====================================================
   * CLEANUP ON UNMOUNT
   * ===================================================== */

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (screenshotIntervalRef.current) {
        clearTimeout(screenshotIntervalRef.current as unknown as number);
      }
    };
  }, []);

  /* =====================================================
   * CONNECT WHEN RECORDING STARTS
   * ===================================================== */

  useEffect(() => {
    if (recording) {
      connectToEventStream();
    } else {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setConnectionStatus("disconnected");
    }
  }, [recording, connectToEventStream]);

  // Check app installation when package changes
  useEffect(() => {
    if (appPackage && mirrorActive) {
      checkAppInstallation(appPackage);
    } else {
      setIsAppInstalled(false);
    }
  }, [appPackage, mirrorActive]);

  // Fetch installed packages when mirror connects
  useEffect(() => {
    if (mirrorActive) {
      fetchInstalledPackages();
    }
  }, [mirrorActive]);

  /* =====================================================
   * HELPER: fetch with timeout
   * ===================================================== */

  const fetchJsonWithTimeout = async (url: string, timeoutMs = 2500) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      return { ok: res.ok, json: await res.json() };
    } finally {
      clearTimeout(id);
    }
  };

  const verifySetup = async () => {
    try {
      // Use the unified status endpoint instead of multiple individual checks
      // This is more efficient and avoids the non-existent /emulator/status endpoint
      const { ok, json } = await fetchJsonWithTimeout(`${AGENT_URL}/setup/status`, 3000);

      if (!ok) return null;

      const verified = {
        appium: Boolean(json.appium),
        device: Boolean(json.device),
        emulator: Boolean(json.emulator),
      };

      if (setSetupState) {
        setSetupState((prev: any) => ({ ...prev, ...verified }));
      }

      return verified;
    } catch {
      return null;
    }
  };

  /* =====================================================
   * 📷 SCREENSHOT STREAM FOR EMBEDDED PREVIEW
   * ===================================================== */

  const startScreenshotStream = useCallback(() => {
    // Clear any existing scheduled capture
    if (screenshotIntervalRef.current) {
      clearTimeout(screenshotIntervalRef.current);
      screenshotIntervalRef.current = null;
    }

    let failCount = 0;
    const maxFails = advancedConfig.screenshotMaxFails; // Configurable max failures
    const intervalMs = 200; // desired interval between captures
    const timeoutMs = advancedConfig.screenshotTimeoutMs; // Configurable timeout

    // Prevent overlapping requests
    let inFlight = false;
    let active = true;

    const stopLoop = () => {
      active = false;
      if (screenshotIntervalRef.current) {
        clearTimeout(screenshotIntervalRef.current);
        screenshotIntervalRef.current = null;
      }
    };

    const captureScreenshot = async () => {
      if (!active) return;
      if (inFlight) return; // skip if previous fetch still running
      inFlight = true;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(`${AGENT_URL}/device/screenshot`, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
          const blob = await res.blob();
          if (blob.size > 0) {
            const url = URL.createObjectURL(blob);
            setMirrorImage((prev) => {
              if (prev) URL.revokeObjectURL(prev);
              return url;
            });
            setMirrorError(null);
            failCount = 0;
          } else {
            failCount++;
          }
        } else {
          const data = await res.json().catch(() => ({}));
          console.warn("[Mirror] Screenshot failed:", data.error);
          failCount++;
        }
      } catch (err: any) {
        if (err.name === "AbortError") {
          // Timeout/abort - expected sometimes, keep debug-level log only
          console.debug("[Mirror] Screenshot request timed out");
        } else {
          console.warn("[Mirror] Fetch error:", err);
        }
        failCount++;
      } finally {
        inFlight = false;
      }

      if (failCount >= maxFails) {
        setMirrorActive(false);
        setMirrorError("Connection lost to device. Please reconnect.");
        stopLoop();
        return;
      }

      // Schedule next capture after configured interval
      if (active) {
        screenshotIntervalRef.current = setTimeout(captureScreenshot as any, intervalMs);
      }
    };

    // Start the capture loop
    captureScreenshot();

    // Ensure we clear loop when mirror is deactivated elsewhere
    return () => stopLoop();
  }, []);

  /* =====================================================
   * 📱 STOP EMULATOR
   * ===================================================== */

  const stopEmulator = async () => {
    try {
      const res = await fetch(`${AGENT_URL}/emulator/stop`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to stop emulator");
      console.log("[MobileRecorder] Emulator stopped");
      return true;
    } catch (err) {
      console.error("[MobileRecorder] stopEmulator error:", err);
      return false;
    }
  };

  /* =====================================================
   * 📱 CONNECT DEVICE - EMBEDDED MIRROR
   * ===================================================== */

  const connectDevice = useCallback(async () => {
    if (!selectedDevice) {
      toast.error("Select a device first");
      return;
    }

    setMirrorError(null);
    setMirrorLoading(true);

    try {
      // First check if local helper is running (increased timeout to 5s for reliability)
      const healthRes = await fetch(`${AGENT_URL}/health`, {
        signal: AbortSignal.timeout(5000)
      }).catch(() => null);

      if (!healthRes?.ok) {
        setMirrorLoading(false);
        setMirrorError("Local helper not running. Run: cd public\\mobile-automation; npm start");
        toast.error("Local helper not running");
        return;
      }

      let deviceRes = await fetch(`${AGENT_URL}/device/check`);
      let deviceData = await deviceRes.json();

      if (!deviceData.connected) {
        if (!selectedDevice.real_mobile) {
          toast.info(`Starting emulator: ${selectedDevice.name || selectedDevice.device}...`);
          const startRes = await fetch(`${AGENT_URL}/emulator/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ avd: selectedDevice.device }),
          });

          if (!startRes.ok) {
            // Handle 500 error - check if emulator actually started despite error
            if (startRes.status === 500) {
              console.warn("[connectDevice] Emulator start returned 500, checking if emulator is actually running...");
              try {
                const verifyRes = await fetch(`${AGENT_URL}/setup/status`);
                const verifyData = await verifyRes.json();

                if (!verifyData.emulator) {
                  const err = await startRes.json().catch(() => ({}));
                  throw new Error(`Failed to start emulator: ${err.error || startRes.statusText}`);
                }
                console.log("[connectDevice] Emulator is running despite 500 error");
              } catch (verifyError) {
                console.warn("[connectDevice] Could not verify emulator status after 500:", verifyError);
                const err = await startRes.json().catch(() => ({}));
                throw new Error(`Failed to start emulator: ${err.error || startRes.statusText}`);
              }
            } else {
              const err = await startRes.json().catch(() => ({}));
              throw new Error(`Failed to start emulator: ${err.error || startRes.statusText}`);
            }
          }
          toast.info("Waiting for emulator to initialize...");
          const isReady = await waitForDeviceReady(
            AGENT_URL,
            advancedConfig.emulatorReadyTimeoutMs,
            advancedConfig.emulatorReadyPollIntervalMs
          );
          if (isReady) {
            console.log("[MobileRecorder] Emulator ready");
          } else {
            console.warn("[MobileRecorder] Emulator readiness timeout, checking anyway...");
          }
          deviceRes = await fetch(`${AGENT_URL}/device/check`);
          deviceData = await deviceRes.json();
        }
      }

      if (!deviceData.connected) {
        setMirrorError("No device connected. Start an emulator or connect a device via ADB.");
        setMirrorLoading(false);
        toast.error("No device connected");
        return;
      }

      // Test screenshot endpoint first
      const testScreenshot = await fetch(`${AGENT_URL}/device/screenshot`);
      if (!testScreenshot.ok) {
        const err = await testScreenshot.json().catch(() => ({}));
        setMirrorLoading(false);
        setMirrorError(err.error || "Cannot capture device screen");
        toast.error("Cannot capture device screen");
        return;
      }

      // Fetch device size for accurate click mapping
      try {
        const sizeRes = await fetch(`${AGENT_URL}/device/size`);
        if (sizeRes.ok) {
          const sizeJson = await sizeRes.json();
          if (sizeJson.success && sizeJson.size) setDeviceSize(sizeJson.size);
        } else {
          console.warn("[connectDevice] Failed to fetch device size:", sizeRes.status);
        }
      } catch (err) {
        console.warn("[connectDevice] Error fetching device size:", err);
      }

      setMirrorActive(true);
      setMirrorLoading(false);
      startScreenshotStream();

      // Fresh Device Start logic
      try {
        setIsPreparingDevice(true);
        console.log("[MobileRecorder] Initializing fresh device state...");

        // 1. Home screen using KEYCODE_HOME (3)
        await fetch(`${AGENT_URL}/device/key`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyCode: 3, keyName: "Home" }),
        });

        // Smart wait for device to be ready (replaces fixed 8s delay)
        console.log("[MobileRecorder] Waiting for device to settle...");
        const isReady = await waitForDeviceReady(
          AGENT_URL,
          advancedConfig.deviceReadyTimeoutMs,
          advancedConfig.deviceReadyPollIntervalMs
        );
        if (!isReady) {
          console.warn("[MobileRecorder] Device readiness timeout, continuing anyway...");
        }

        // 2. Clear app state if package is selected
        if (appPackage) {
          await fetch(`${AGENT_URL}/app/stop`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ packageName: appPackage }),
          });
        }

        toast.info("Device reset to fresh state");
      } catch (err) {
        console.warn("[MobileRecorder] Failed to reset device state:", err);
      } finally {
        setIsPreparingDevice(false);
      }

      toast.success("Device connected", {
        description: "Live preview active - interact with your device",
      });
    } catch (err: any) {
      console.error("[connectDevice] Error:", err);
      setMirrorLoading(false);
      setMirrorError("Cannot connect to local helper. Run: cd public\\mobile-automation; npm start");
      toast.error("Local helper not running");
    }
  }, [selectedDevice, startScreenshotStream]);

  const disconnectDevice = useCallback(() => {
    setMirrorActive(false);
    if (mirrorImage) {
      URL.revokeObjectURL(mirrorImage);
    }
    setMirrorImage(null);
    setMirrorError(null);
    if (screenshotIntervalRef.current) {
      clearTimeout(screenshotIntervalRef.current);
      screenshotIntervalRef.current = null;
    }
    toast.info("Device disconnected");
  }, [mirrorImage]);

  /* =====================================================
   * START RECORDING
   * ===================================================== */

  const startRecording = async () => {
    let canRecord = setupState.device;

    if (!canRecord) {
      const verified = await verifySetup();
      canRecord = Boolean(verified?.device);

      if (!verified) {
        toast.error("Complete setup before recording", {
          description: "Local agent not reachable at http://localhost:3001",
        });
        return;
      }

      if (!canRecord) {
        toast.error("Complete setup before recording", {
          description: "No ADB device detected",
        });
        return;
      }
    }

    if (!selectedDevice) {
      toast.error("Select a device first");
      return;
    }

    // For emulated devices, ensure emulator is running before starting recording
    if (!selectedDevice.real_mobile) {
      try {
        const emulatorStatusRes = await fetch(`${AGENT_URL}/setup/status`);
        const emulatorStatusData = await emulatorStatusRes.json();

        if (!emulatorStatusData.emulator) {
          toast.error("Emulator not running", {
            description: "Please start the emulator first before recording",
          });
          return;
        }
      } catch (emulatorError) {
        console.warn("[startRecording] Could not check emulator status:", emulatorError);
        toast.error("Cannot verify emulator status", {
          description: "Please ensure the emulator is running",
        });
        return;
      }
    }

    try {
      const response = await fetch(`${AGENT_URL}/recording/start`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to start recording");
      }

      setActions([]);
      setRecording(true);

      toast.success("Recording started", {
        description: `Connected to ${selectedDevice.name || selectedDevice.device}`,
      });
    } catch (err) {
      console.error("[MobileRecorder] Start recording error:", err);
      toast.error("Failed to start recording", {
        description: "Make sure the local agent is running (npm run server)",
      });
    }
  };

  /* =====================================================
   * STOP RECORDING
   * ===================================================== */

  const stopRecording = async () => {
    try {
      const response = await fetch(`${AGENT_URL}/recording/stop`, {
        method: "POST",
      });

      const data = await response.json();
      setRecording(false);
      setIsPaused(false);

      // Merge any steps from server that we might have missed
      if (data.steps && data.steps.length > 0) {
        setActions((prev) => {
          const existingIds = new Set(prev.map((a) => a.timestamp));
          const newSteps = data.steps
            .filter((s: any) => !existingIds.has(s.timestamp))
            .map((s: any) => ({
              id: s.id || crypto.randomUUID(),
              type: s.type as ActionType,
              description: s.description,
              locator: s.locator,
              coordinates: s.coordinates,
              timestamp: s.timestamp,
              enabled: true
            }));

          if (newSteps.length === 0) return prev;
          return [...prev, ...newSteps];
        });
      }

      toast.success("Recording stopped", {
        description: `${actions.length} actions captured`,
      });
    } catch (err) {
      console.error("[MobileRecorder] Stop recording error:", err);
      toast.error("Failed to stop recording");
      setRecording(false);
    }
  };

  /* =====================================================
   * 🔄 REFRESH STEPS FROM SERVER
   * ===================================================== */

  const refreshSteps = async () => {
    try {
      const response = await fetch(`${AGENT_URL}/recording/steps`);
      const data = await response.json();

      if (data.success && data.steps) {
        const mappedSteps = data.steps.map((s: any) => ({
          id: crypto.randomUUID(),
          type: s.type as ActionType,
          description: s.description,
          locator: s.locator,
          coordinates: s.coordinates,
          timestamp: s.timestamp,
        }));
        setActions(mappedSteps);
        toast.success(`Loaded ${mappedSteps.length} steps`);
      }
    } catch (err) {
      toast.error("Failed to refresh steps");
    }
  };

  /* =====================================================
   * ▶ REPLAY (ADB)
   * ===================================================== */

  // Helper function to convert technical errors to user-friendly messages
  const friendlyErrorMessage = (error: string): string => {
    const lowerError = error.toLowerCase();
    if (lowerError.includes('timeout')) return 'Timeout while waiting for element';
    if (lowerError.includes('not found') || lowerError.includes('no element')) return 'Element not found on screen';
    if (lowerError.includes('execution failed')) return 'Action could not be executed';
    if (lowerError.includes('connection')) return 'Connection error to device';
    return error; // Return original if no match
  };

  const runAdbCommand = async (command: string) => {
    if (!selectedDevice) return false;
    try {
      // Use the generic shell endpoint (assumed to exist or mapped to /device/shell)
      const res = await fetch(`${AGENT_URL}/device/shell`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: selectedDevice.id || selectedDevice.device,
          command
        })
      });
      return res.ok;
    } catch (e) {
      console.error("ADB command failed", e);
      return false;
    }
  };

  const replaySingleAction = async (action: RecordedAction) => {
    if (!selectedDevice) {
      toast.error("Select a device first");
      return;
    }

    setReplaying(true);
    toast.info(`Running step: ${action.type}`);

    try {
      // Check if we need to clear logs for this specific step?
      // We'll update just this step's status
      setExecutionLogs(prev => prev.map(log =>
        log.id === action.id ? { ...log, status: "running", error: undefined } : log
      ));

      const res = await fetch(`${AGENT_URL}/recording/replay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: selectedDevice.id || selectedDevice.device,
          steps: [action],
          startIndex: 0 // Local index for this batch
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Step failed");
      }

      setReplaying(false);

    } catch (err: any) {
      console.error("Single step replay error", err);
      setReplaying(false);
      toast.error(`Step failed: ${err.message}`);
      setExecutionLogs(prev => prev.map(log =>
        log.id === action.id ? { ...log, status: "error", error: err.message } : log
      ));
    }
  };

  const replayActions = async (startIndex: number = 0) => {
    const enabledActions = actions.filter(a => a.enabled !== false);
    if (!enabledActions.length) {
      toast.error("No enabled actions to replay");
      return;
    }

    if (!selectedDevice) {
      toast.error("Select a device first");
      return;
    }
    setReplaying(true);
    setLastReplayStatus(null);
    setActiveTab("history");
    let lastFailedStep = -1;
    let failureReason = "";

    if (startIndex === 0) {
      setReplayStartTime(Date.now());
      if (appPackage) {
        toast.info(`Clearing app data for ${appPackage}...`);
        await runAdbCommand(`pm clear ${appPackage}`);
      }
      setExecutionLogs(enabledActions.map(a => ({
        id: a.id,
        description: a.description,
        status: "pending"
      })));
      toast.info("Starting replay...");
    } else {
      toast.info(`Resuming replay from Step ${startIndex + 1}...`);
      setExecutionLogs(prev => prev.map((log, idx) =>
        idx >= startIndex ? { ...log, status: "pending", error: undefined, duration: undefined } : log
      ));
    }
    setExecutionLogs(prev => prev.map(log => ({ ...log, error: undefined })));

    try {
      const res = await fetch(`${AGENT_URL}/recording/replay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: selectedDevice?.id || selectedDevice?.device,
          steps: enabledActions,
          startIndex: startIndex,
          screenSettleDelayMs: advancedConfig.screenSettleDelayMs
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Replay execution failed");
      }

      setLastReplayStatus("PASS");
      setReplaying(false);
      setReplayIndex(null);
      await saveExecutionToHistory("SUCCESS");

    } catch (err: any) {
      console.error("[MobileRecorder] Replay error:", err);
      setLastReplayStatus("FAIL");
      setReplaying(false);
      setReplayIndex(null);
      toast.error(`Replay failed: ${err.message}`);
      await saveExecutionToHistory("FAILED", undefined, err.message);
    }
  };


  const saveExecutionToHistory = async (status: "SUCCESS" | "FAILED", failedIndex?: number, reason?: string) => {
    try {
      const duration = replayStartTime ? Date.now() - replayStartTime : 0;

      await ExecutionHistoryService.saveTestExecution({
        status,
        duration_ms: duration,
        failed_step_index: failedIndex,
        error_message: reason,
        results: {
          steps: executionLogs,
          device: selectedDevice?.device
        }
      });


      await ExecutionHistoryService.saveSuiteExecution({
        status,
        duration_ms: duration,
        error_message: reason,
        failed_step_index: failedIndex
      });

    } catch (err) {
      console.error("[MobileRecorder] Unexpected error saving history:", err);
    }
  };

  const generatedScript = useMemo(() => {
    if (savedManualScript) return savedManualScript;

    const enabledActions = actions.filter(a => a.enabled !== false);
    if (!enabledActions.length)

      return `import io.appium.java_client.AppiumBy;
import io.appium.java_client.android.AndroidDriver;
import io.appium.java_client.android.options.UiAutomator2Options;
import org.openqa.selenium.WebElement;
import java.net.MalformedURLException;
import java.net.URL;
import java.time.Duration;

/**
 * Auto-generated by Mobile Recorder
 * Platform: Android (Appium Java)
 * Generated: ${new Date().toISOString()}
 */
public class RecordedMobileTest {
    public static void main(String[] args) throws MalformedURLException, InterruptedException {
        UiAutomator2Options options = new UiAutomator2Options();
        options.setPlatformName("Android");
        options.setAutomationName("UiAutomator2");
        options.setDeviceName("${selectedDevice?.device || "your-device-id"}");
        options.setAppPackage("com.example.app"); // Replace with your app package
        options.setAppActivity(".MainActivity");  // Replace with your app activity
        options.setNoReset(true);
        options.setEnsureWebviewsHavePages(true);

        AndroidDriver driver = new AndroidDriver(
            new URL("http://127.0.0.1:4723"), options
        );
        driver.manage().timeouts().implicitlyWait(Duration.ofSeconds(10));

        try {
${enabledActions
          .map((a, index) => {
            const stepNum = index + 1;
            const comment = `            // Step ${stepNum}: ${a.description}`;
            let javaCode = "";

            switch (a.type) {
              case "tap":
                if (a.elementId) {
                  javaCode = `driver.findElement(AppiumBy.id("${a.elementId}")).click();`;
                } else if (a.elementContentDesc) {
                  javaCode = `driver.findElement(AppiumBy.accessibilityId("${a.elementContentDesc}")).click();`;
                } else if (a.elementText) {
                  javaCode = `driver.findElement(AppiumBy.androidUIAutomator("new UiSelector().text(\\\"${a.elementText}\\\")")).click();`;
                } else if (a.coordinates) {
                  javaCode = `// Coordinate tap at (${a.coordinates.x}, ${a.coordinates.y})
            // Use W3C Actions for coordinates if needed
            driver.executeScript("mobile: clickGesture", java.util.Map.of(
                "x", ${a.coordinates.x},
                "y", ${a.coordinates.y}
            ));`;
                } else {
                  javaCode = `driver.findElement(AppiumBy.xpath("${a.locator}")).click();`;
                }
                break;

              case "input":
                const value = a.value || `System.getenv("INPUT_${stepNum}")`;
                const valueStr = a.value ? `"${a.value}"` : value;
                javaCode = `WebElement input${stepNum} = driver.findElement(AppiumBy.xpath("${a.locator}"));\n            input${stepNum}.sendKeys(${valueStr});`;
                break;

              case "longPress":
                if (a.coordinates) {
                  javaCode = `// Long Press action
            driver.executeScript("mobile: longClickGesture", java.util.Map.of(
                "x", ${a.coordinates.x},
                "y", ${a.coordinates.y},
                "duration", 1000
            ));`;
                } else {
                  javaCode = `// longPress action (coordinates not captured)`;
                }
                break;

              case "scroll":
                if (a.coordinates) {
                  javaCode = `// Scroll/Swipe action
            driver.executeScript("mobile: swipeGesture", java.util.Map.of(
                "left", ${a.coordinates.x}, "top", ${a.coordinates.y},
                "width", 200, "height", 200,
                "direction", "${a.coordinates.y > a.coordinates.endY ? 'up' : 'down'}",
                "percent", 1.0
            ));`;
                } else {
                  javaCode = `// scroll action (coordinates not captured)`;
                }
                break;

              case "pressKey":
                javaCode = `driver.pressKey(new io.appium.java_client.android.nativekey.KeyEvent(io.appium.java_client.android.nativekey.AndroidKey.VIRTUAL_KEY_${a.description.split(': ').pop()}));`;
                if (a.value === "4") javaCode = `driver.pressKey(new io.appium.java_client.android.nativekey.KeyEvent(io.appium.java_client.android.nativekey.AndroidKey.BACK));`;
                if (a.value === "3") javaCode = `driver.pressKey(new io.appium.java_client.android.nativekey.KeyEvent(io.appium.java_client.android.nativekey.AndroidKey.HOME));`;
                if (a.value === "187") javaCode = `driver.pressKey(new io.appium.java_client.android.nativekey.KeyEvent(io.appium.java_client.android.nativekey.AndroidKey.APP_SWITCH));`;
                break;

              case "hideKeyboard":
                javaCode = `driver.hideKeyboard();`;
                break;

              case "wait":
                javaCode = `Thread.sleep(${a.value || 1000});`;
                break;

              case "assert":
                javaCode = `assert driver.findElement(AppiumBy.xpath("${a.locator}")).isDisplayed();`;
                break;

              case "openApp":
                javaCode = `driver.activateApp("${a.value}");`;
                break;

              default:
                return "";
            }

            return `${comment}\n            ${javaCode}`;
          })
          .join("\n\n")}
        } finally {
            driver.quit();
        }
    }
}`;
  }, [actions]);

  const handleSaveScript = () => {
    try {
      const steps = editableScript.split(/\/\/ Step \d+:/).slice(1);

      const newActions = actions.map((action, index) => {
        if (index >= steps.length) return action;

        const stepContent = steps[index];
        const updatedAction = { ...action };


        const descMatch = stepContent.match(/\s*([^\r\n]+)/);
        if (descMatch && descMatch[1]) {
          updatedAction.description = descMatch[1].trim();
        }


        const locatorMatch = stepContent.match(/AppiumBy\.(id|xpath|androidUIAutomator)\("([^"]+)"\)/);
        if (locatorMatch) {
          const type = locatorMatch[1];
          const value = locatorMatch[2];

          if (type === "id") {
            updatedAction.elementId = value;
            updatedAction.locator = value;
          } else if (type === "xpath") {
            updatedAction.locator = value;
          } else if (type === "androidUIAutomator") {
            const textMatch = value.match(/text\("([^"]+)"\)/);
            if (textMatch) updatedAction.elementText = textMatch[1];
          }
        }


        const inputMatch = stepContent.match(/\.sendKeys\("([^"]+)"\)/);
        if (inputMatch) {
          updatedAction.value = inputMatch[1];
        }


        const clickMatch = stepContent.match(/"x", (\d+),[\s\S]*"y", (\d+)/);
        if (clickMatch && updatedAction.coordinates) {
          updatedAction.coordinates = {
            ...updatedAction.coordinates,
            x: parseInt(clickMatch[1]),
            y: parseInt(clickMatch[2])
          };
        }

        return updatedAction;
      });

      setActions(newActions);
      setSavedManualScript(editableScript);
      setIsEditingScript(false);
      toast.success("Script saved and synced with actions");
    } catch (err) {
      console.error("[handleSaveScript] Error:", err);
      toast.error("Failed to parse and save script");
    }
  };

  const startEditingScript = () => {
    setEditableScript(savedManualScript || generatedScript);
    setIsEditingScript(true);
  };
  const copyScript = () => {
    navigator.clipboard.writeText(generatedScript);
    toast.success("Script copied to clipboard");
  };

  const downloadScript = () => {
    const blob = new Blob([generatedScript], { type: "text/x-java-source" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `RecordedMobileTest_${Date.now()}.java`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Java script downloaded");
  };

  const handleConfirmInput = async () => {
    if (!inputText || String(inputText).trim().length === 0) {
      setShowInputPanel(false);
      return;
    }

    try {
      setInputPending(true);

      const response = await retryDeviceAction(async () => {
        const r = await fetch(`${AGENT_URL}/device/input`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            x: inputCoords?.x,
            y: inputCoords?.y,
            text: inputText
          }),
        });

        if (!r.ok) {
          const jj = await r.json().catch(() => ({}));
          throw new Error(jj.error || "Failed to input text");
        }

        const data = await r.json().catch(() => ({}));
        return { response: r, data };
      }, advancedConfig.maxRetries, advancedConfig.retryDelayMs);


      if (response.data?.verified === false) {
        console.warn("[Input] Backend reported input verification failed");
        toast.warning("Text input may not have been fully captured");
      } else {
        toast.success("Text input captured");
        // Auto-hide keyboard after successful input
        hideKeyboard();
      }

      setSavedManualScript(null);
    } catch (err: any) {
      console.error("Input failed after retries:", err);
      toast.error(err.message || "Failed to input text");
    } finally {
      setInputPending(false);
      setShowInputPanel(false);

      setInputText("");
      setInputCoords(null);
    }
  };

  const hideKeyboard = async () => {
    try {
      const res = await fetch(`${AGENT_URL}/device/hide-keyboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: selectedDevice?.id || selectedDevice?.device }),
      });

      if (res.ok) {
        toast.success("Keyboard hidden");
      } else {
        toast.error("Failed to hide keyboard");
      }
    } catch (error) {
      console.error("[MobileRecorder] Hide keyboard error:", error);
      toast.error("Failed to hide keyboard");
    }
  };

  const moveAction = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === actions.length - 1) return;

    const newActions = [...actions];
    const targetIndex = direction === "up" ? index - 1 : index + 1;


    [newActions[index], newActions[targetIndex]] = [newActions[targetIndex], newActions[index]];

    setActions(newActions);
  };


  const previewInput = async (step: RecordedAction, overrideValue?: string) => {
    const text = (typeof overrideValue !== 'undefined') ? overrideValue : step.value;
    if (!text || String(text).trim().length === 0) {
      toast.error("No value to preview");
      return;
    }

    if (!step.coordinates || typeof step.coordinates.x !== 'number' || typeof step.coordinates.y !== 'number') {
      toast.error("No coordinates available for this step");
      return;
    }

    try {
      setPreviewPendingId(step.id);
      const r = await fetch(`${AGENT_URL}/device/input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: step.coordinates.x, y: step.coordinates.y, text }),
      });

      if (!r.ok) {
        const jj = await r.json().catch(() => ({}));
        toast.error(jj.error || 'Failed to send preview input');
      } else {
        toast.success('Preview input sent to device');
      }
    } catch (err) {
      console.error('Preview input failed:', err);
      toast.error('Failed to send preview input');
    } finally {
      setPreviewPendingId(null);
    }
  };
  const loadUiHierarchy = async () => {
    try {
      const response = await fetch(`${AGENT_URL}/device/ui`);
      const data = await response.json();

      if (data.success && data.xml) {
        setUiXml(data.xml);
        toast.success("UI hierarchy loaded");
      } else {
        toast.error("Failed to load UI hierarchy");
      }
    } catch (err) {
      console.error("[loadUiHierarchy] Error:", err);
      toast.error("Failed to load UI hierarchy");
    }
  };

  const uploadApk = async (file: File) => {
    if (!file) {
      toast.error("Please select an APK file");
      return;
    }
    if (!file.name.toLowerCase().endsWith('.apk')) {
      toast.error("Please select a valid APK file");
      return;
    }

    setApkUploading(true);

    try {
      const formData = new FormData();
      formData.append('apk', file);

      const response = await fetch(`${AGENT_URL}/app/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setUploadedApk({ path: data.apkPath, name: file.name });
        toast.success("APK uploaded successfully");
      } else {
        toast.error(data.error || "Failed to upload APK");
      }
    } catch (err) {
      console.error("[uploadApk] Error:", err);
      toast.error("Failed to upload APK");
    } finally {
      setApkUploading(false);
    }
  };

  const installApk = async () => {
    if (!uploadedApk) return;
    setApkInstalling(true);
    try {
      const res = await fetch(`${AGENT_URL}/app/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apkPath: uploadedApk.path }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("APK installed successfully");
        setIsAppInstalled(true);
      } else {
        throw new Error(data.error || "Install failed");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to install APK");
    } finally {
      setApkInstalling(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setApkUploading(true);
    const toastId = toast.loading(`Uploading ${file.name}...`);

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch(`${AGENT_URL}/app/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base64,
          fileName: file.name,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setUploadedApk({ path: data.path, name: file.name });
        toast.success("APK uploaded successfully. Ready to install.", { id: toastId });
      } else {
        throw new Error(data.error || "Upload failed");
      }
    } catch (err: any) {
      console.error("[handleFileUpload] Error:", err);
      toast.error(err.message || "Failed to upload APK", { id: toastId });
    } finally {
      setApkUploading(false);
      e.target.value = '';
    }
  };

  const handleClearApp = async () => {
    try {
      const res = await fetch(`${AGENT_URL}/app/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageName: appPackage }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`Cleared data for ${appPackage}`);
      } else {
        throw new Error(data.error || "Failed to clear app data");
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleStopApp = async () => {
    if (!appPackage) return;
    try {
      const res = await fetch(`${AGENT_URL}/app/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageName: appPackage }),
      });
      if (res.ok) {
        toast.success(`Stopped ${appPackage}`);
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleOpenAppSettings = async () => {
    if (!appPackage) {
      toast.error("Select an app first");
      return;
    }
    toast.info(`Opening Android settings for ${appPackage}...`);
    const success = await runAdbCommand(`am start -a android.settings.APPLICATION_DETAILS_SETTINGS -d package:${appPackage}`);
    if (success) {
      toast.success("Settings opened on device");
    } else {
      toast.error("Failed to open app settings");
    }
  };

  const checkAppInstallation = async (pkg: string) => {
    if (!pkg) return;
    setCheckingInstall(true);
    try {
      const res = await fetch(`${AGENT_URL}/app/check-install/${pkg}`);
      const data = await res.json();
      if (data.success) {
        setIsAppInstalled(data.installed);
      }
    } catch (err) {
      console.error("Check install error:", err);
    } finally {
      setCheckingInstall(false);
    }
  };

  const fetchInstalledPackages = async () => {
    setLoadingPackages(true);
    try {
      const res = await fetch(`${AGENT_URL}/app/installed-packages`);
      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }
      const data = await res.json();
      if (data.success && data.packages) {
        setInstalledPackages(data.packages);
        return data.packages;
      }
      return [];
    } catch (err) {
      console.error("Failed to fetch installed packages:", err);
      return null;
    } finally {
      setLoadingPackages(false);
    }
  };

  const handleLongPress = async (x: number, y: number) => {
    try {
      await retryDeviceAction(async () => {
        const res = await fetch(`${AGENT_URL}/device/long-press`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ x, y, duration: 1000 }),
        });
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || "Failed to long press");
        }
        return data;
      }, advancedConfig.maxRetries, advancedConfig.retryDelayMs);
    } catch (err: any) {
      console.error("Long press failed after retries:", err);
      toast.error(err.message || "Failed to long press");
    }
  };

  const handleSwipe = async () => {
    try {
      if (!recording || isPaused) {
        // No toast warning here because Swipe is often used for navigation even when not recording
        // But we want to ensure it's not captured (server-side handles this)
      }

      const res = await fetch(`${AGENT_URL}/device/swipe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x1: 500, y1: 1500, x2: 500, y2: 500, duration: 500 }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to swipe");
      }
    } catch (err) {
      toast.error("Failed to swipe");
    }
  };

  const handleKeyPress = async (keyCode: number, keyName: string) => {
    try {
      if (!recording || isPaused) {
        // No toast warning here because System Keys are often used for navigation even when not recording
      }

      await retryDeviceAction(async () => {
        const res = await fetch(`${AGENT_URL}/device/key`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyCode, keyName }),
        });
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || "Failed to press key");
        }
        return data;
      }, advancedConfig.maxRetries, advancedConfig.retryDelayMs);
      toast.success(`Pressed ${keyName}`);
    } catch (err: any) {
      console.error(`Key press failed after retries:`, err);
      toast.error(err.message || `Failed to press ${keyName}`);
    }
  };

  const handleOpenApp = async () => {
    try {
      const res = await fetch(`${AGENT_URL}/app/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageName: appPackage }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`Launched ${appPackage}`);
      } else {
        throw new Error(data.error || "Failed to launch app");
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const refreshAppPackages = async () => {
    try {
      setLoadingPackages(true);
      const packages = await fetchInstalledPackages();

      if (!packages) {
        toast.error("Failed to fetch app list");
        return;
      }

      if (packages.length === 0) {
        toast.info("No user apps found on device");
        setInstalledPackages([]);
        return;
      }
      if (appPackage && !packages.includes(appPackage)) {
        setAppPackage("");
        setIsAppInstalled(null);
        toast.info("Selected app is no longer installed. Selection reset.");
      }

      toast.success(`App list refreshed (${packages.length} apps found)`);
    } catch (err) {
      toast.error("Failed to refresh apps");
    } finally {
      setLoadingPackages(false);
    }
  };

  const uninstallApp = async () => {
    if (!appPackage) {
      toast.error("No app selected to uninstall");
      return;
    }

    const confirm = window.confirm(
      `Are you sure you want to uninstall?\n\n${appPackage}`
    );

    if (!confirm) return;

    try {
      const res = await fetch(`${AGENT_URL}/device/uninstall`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageName: appPackage }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Uninstall failed");
      }
      toast.success("App uninstalled successfully");
      await refreshAppPackages();
      setAppPackage("");
      setIsAppInstalled(false);

    } catch (err: any) {
      console.error("Uninstall error:", err);
      toast.error(err.message || "Failed to uninstall app");
    }
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-bold">Mobile Recorder</h2>
          <p className="text-xs text-muted-foreground">
            Record actions on local emulator or device
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border border-muted/50">
            <span className="text-xs font-medium whitespace-nowrap text-muted-foreground">Device:</span>
            <div className="flex items-center gap-2">
              <DeviceSelector
                onSelect={setSelectedDevice}
                selectedDeviceFromSetup={selectedDeviceFromSetup}
                disabled={!!selectedDeviceFromSetup}
                refreshKey={deviceRefreshKey}
              />
              {!selectedDeviceFromSetup && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-primary/10"
                  onClick={() => {
                    setDeviceRefreshKey(prev => prev + 1);
                    toast.info("Refreshing device list...");
                  }}
                  title="Refresh device list"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          {recording && (
            <Badge
              variant={isPaused ? "secondary" : (connectionStatus === "connected" ? "default" : "secondary")}
              className={`${isPaused ? "" : "animate-pulse"} text-[10px] px-2 h-6`}
            >
              {isPaused ? "Paused" : (connectionStatus === "connected" ? "Recording" : "Connecting...")}
            </Badge>
          )}

        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 h-fit lg:sticky lg:top-24">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-xl font-bold text-zinc-800 dark:text-zinc-100">
                  <Smartphone className="h-5 w-5 text-primary" />
                  Device Preview
                </CardTitle>
              </div>

              {mirrorActive && (
                <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-muted/40 rounded-xl border border-muted-foreground/10 animate-in fade-in slide-in-from-top-2 duration-500 shadow-sm">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="p-2 bg-primary/10 rounded-lg border border-primary/20 mt-0.5 flex-shrink-0">
                      <Smartphone className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none mb-1.5 opacity-70">Target Device</span>
                      <span className="text-sm font-bold leading-tight break-words" title={selectedDevice?.name || selectedDevice?.device}>
                        {selectedDevice?.name || selectedDevice?.device}
                      </span>
                      <div className="flex items-center gap-1.5 mt-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-[10px] font-bold text-green-600 dark:text-green-400 tracking-wider uppercase">Connected</span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive transition-all px-3 flex-shrink-0 border border-destructive/10"
                    onClick={disconnectDevice}
                  >
                    <WifiOff className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-tight">Disconnect</span>
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex flex-col items-center">
            <div className="relative mx-auto transition-all duration-500 ease-in-out group" style={{
              width: 'clamp(260px, 35vw, 400px)',
              maxWidth: '100%',
              filter: 'drop-shadow(0 25px 50px -12px rgb(0 0 0 / 0.5))'
            }}>

              <div className="absolute left-[-2px] top-24 w-[3px] h-16 bg-gradient-to-b from-zinc-700 to-zinc-900 rounded-l-sm z-0" />
              <div className="absolute left-[-2px] top-44 w-[4px] h-24 bg-gradient-to-b from-zinc-600 to-zinc-800 rounded-l-sm z-0" />

              <div className="absolute right-[-2px] top-32 w-[3px] h-12 bg-gradient-to-b from-zinc-700 to-zinc-900 rounded-r-sm z-0" />


              <div
                className="relative bg-[#0a0a0a] rounded-[3rem] p-[10px] border-[1px] border-zinc-800 shadow-[inset_0_0_2px_1px_rgba(255,255,255,0.1)] overflow-hidden"
                style={{
                  aspectRatio: deviceSize ? `${deviceSize.width} / ${deviceSize.height}` : '9 / 18',
                }}
              >

                <div className="absolute inset-0 rounded-[2.8rem] border-[4px] border-black pointer-events-none z-10" />


                <div
                  className="w-full h-full rounded-[2.2rem] bg-black overflow-hidden relative shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]"
                >
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#1a1a1a] rounded-full border border-zinc-800/50 z-50 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 bg-indigo-950/30 rounded-full" />
                  </div>
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-zinc-900 rounded-b-sm z-50 opacity-40" />
                  <div className="absolute inset-0 pointer-events-none z-40 overflow-hidden rounded-[2.2rem]">
                    <div className="absolute -top-[150%] -left-[50%] w-[200%] h-[200%] bg-gradient-to-br from-white/5 via-transparent to-transparent rotate-[35deg] opacity-50" />
                  </div>
                  <div className="w-full h-full flex flex-col items-center justify-center bg-muted/10 overflow-hidden relative">
                    {mirrorActive && (
                      <div className="absolute top-8 left-0 right-0 z-40 px-4 pointer-events-none flex flex-col gap-2">
                        <div className={`mx-auto px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-tight shadow-md animate-in fade-in slide-in-from-top-2 duration-500 flex items-center gap-1.5 ${captureMode ? 'bg-primary text-primary-foreground' : 'bg-zinc-800 text-zinc-300'}`}>
                          <div className={`h-1 w-1 rounded-full ${captureMode ? 'bg-white animate-pulse' : 'bg-zinc-500'}`} />
                          {captureMode ? "Interaction Active" : "View Only Mode"}
                        </div>

                        {recording && !isPaused && (
                          <div className="mx-auto px-2.5 py-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold uppercase tracking-tight shadow-md animate-pulse flex items-center gap-1.5">
                            <div className="h-1 w-1 rounded-full bg-white" />
                            Recording
                          </div>
                        )}
                      </div>
                    )}

                    {isPreparingDevice && (
                      <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="flex flex-col items-center gap-4 p-6 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl">
                          <div className="relative">
                            <div className="h-10 w-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <RefreshCw className="h-4 w-4 text-primary animate-pulse" />
                            </div>
                          </div>
                          <div className="text-center space-y-1">
                            <p className="text-sm font-bold text-white">Preparing Device...</p>
                            <p className="text-[10px] text-zinc-400">Ensuring a clean fresh state</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {mirrorLoading ? (
                      <div className="text-center p-4 space-y-3">
                        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
                        <p className="text-sm text-muted-foreground">Connecting...</p>
                      </div>
                    ) : !mirrorActive ? (
                      <div className="text-center p-4 space-y-4">
                        <Smartphone className="h-16 w-16 text-muted-foreground mx-auto opacity-50" />
                        <p className="text-sm text-muted-foreground">
                          Connect to see live device screen
                        </p>
                        <Button onClick={connectDevice} className="gap-2">
                          <Wifi className="h-4 w-4" />
                          Connect Device
                        </Button>
                      </div>
                    ) : mirrorError ? (
                      <div className="text-center p-4 space-y-3">
                        <WifiOff className="h-8 w-8 text-destructive mx-auto" />
                        <div className="text-destructive text-sm">{mirrorError}</div>
                        <Button variant="outline" size="sm" onClick={connectDevice}>
                          Retry
                        </Button>
                      </div>
                    ) : mirrorImage ? (
                      <>
                        <img
                          src={mirrorImage}
                          alt="Device screen"
                          className={`w-full h-full object-contain bg-black ${captureMode ? 'cursor-pointer ring-2 ring-inset ring-primary/40' : ''}`}
                          onLoad={() => {
                          }}
                          onMouseDown={(e) => {
                            if (!captureMode) return;
                            const el = e.currentTarget as HTMLImageElement;
                            const rect = el.getBoundingClientRect();
                            const clickX = e.clientX - rect.left;
                            const clickY = e.clientY - rect.top;
                            const finalDev = deviceSize || { width: 1080, height: 1920 };
                            const deviceX = Math.round((clickX / rect.width) * finalDev.width);
                            const deviceY = Math.round((clickY / rect.height) * finalDev.height);

                            pressCoordsRef.current = { x: deviceX, y: deviceY };
                            longPressHappenedRef.current = false;

                            longPressTimerRef.current = setTimeout(() => {
                              handleLongPress(deviceX, deviceY);
                              longPressHappenedRef.current = true;
                              longPressTimerRef.current = null;
                            }, 600);
                          }}
                          onMouseUp={() => {
                            if (longPressTimerRef.current) {
                              clearTimeout(longPressTimerRef.current);
                              longPressTimerRef.current = null;
                            }
                          }}
                          onMouseLeave={() => {
                            if (longPressTimerRef.current) {
                              clearTimeout(longPressTimerRef.current);
                              longPressTimerRef.current = null;
                            }
                          }}
                          onClick={async (e) => {
                            if (!captureMode) return;

                            if (longPressHappenedRef.current) {
                              longPressHappenedRef.current = false;
                              return;
                            }

                            const el = e.currentTarget as HTMLImageElement;
                            const rect = el.getBoundingClientRect();
                            const clickX = e.clientX - rect.left;
                            const clickY = e.clientY - rect.top;

                            const finalDev = deviceSize || { width: 1080, height: 1920 };
                            const deviceX = Math.round((clickX / rect.width) * finalDev.width);
                            const deviceY = Math.round((clickY / rect.height) * finalDev.height);

                            try {
                              const { res, json } = await retryDeviceAction(async () => {
                                const response = await fetch(`${AGENT_URL}/device/tap`, {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ x: deviceX, y: deviceY }),
                                });

                                const data = await response.json().catch(() => ({}));

                                if (!response.ok) {
                                  throw new Error(data.error || "Tap failed");
                                }

                                return { res: response, json: data };
                              }, advancedConfig.maxRetries, advancedConfig.retryDelayMs);

                              if (res.ok) {
                                if (json.step?.elementMetadata) {
                                  setSelectedNode(json.step.elementMetadata);
                                }

                                if (json.step?.isInputCandidate) {
                                  setInputText("");
                                  setInputCoords({ x: deviceX, y: deviceY });
                                  setInputPending(false);
                                  setShowInputPanel(true);
                                }
                              }
                            } catch (err: any) {
                              console.error("Tap failed after retries:", err);
                              toast.error(err.message || "Failed to send interaction to device");
                            }
                          }}
                        />

                        {debugMode && (
                          <div className="absolute bottom-4 left-4 right-4 bg-black/80 backdrop-blur-md border border-yellow-500/50 p-4 rounded-lg z-50 text-white animate-in slide-in-from-bottom-4 duration-300">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
                                <span className="text-xs font-bold text-yellow-500 uppercase tracking-wider">Step Replay Mode</span>
                              </div>
                              <Badge variant="outline" className="text-[10px] border-yellow-500/30 text-yellow-200">
                                Step {replayIndex !== null ? replayIndex + 1 : 0} of {actions.length}
                              </Badge>
                            </div>

                            {replayIndex !== null && actions[replayIndex] && (
                              <div className="mb-4">
                                <p className="text-sm font-medium line-clamp-1">{actions[replayIndex].description}</p>
                                <p className="text-[10px] text-zinc-400 font-mono mt-0.5 truncate italic">
                                  {actions[replayIndex].locator}
                                </p>
                              </div>
                            )}

                            <div className="grid grid-cols-2 gap-2">
                              <Button
                                className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold h-9"
                                onClick={() => nextStepTrigger?.()}
                                disabled={!nextStepTrigger}
                              >
                                Execute Next Step
                              </Button>
                              <Button
                                variant="outline"
                                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 h-9"
                                onClick={() => {
                                  setDebugMode(false);
                                  setReplaying(false);
                                  setReplayIndex(null);
                                }}
                              >
                                Cancel Replay
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-center p-4 text-muted-foreground">
                        <p className="text-sm">Waiting for screen...</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <div className="lg:col-span-2 space-y-6">
          {mirrorActive && (
            <Collapsible open={showQuickStart} onOpenChange={setShowQuickStart} className="w-full">
              <Card className="border-primary/20 shadow-sm animate-in fade-in slide-in-from-right-4 duration-500">
                <CollapsibleTrigger asChild>
                  <CardHeader className="pb-3 border-b border-muted/20 flex flex-row items-center justify-between cursor-pointer hover:bg-primary/5 transition-colors">
                    <div className="flex flex-col flex-1">
                      <CardTitle className="flex items-center gap-2">
                        <Terminal className="h-5 w-5 text-primary" />
                        Device Control
                      </CardTitle>
                      <span className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest mt-1 truncate" title={selectedDevice?.name || selectedDevice?.device || "No Device Selected"}>
                        Active Agent: {selectedDevice?.name || selectedDevice?.device || "No Device Selected"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-primary">
                        <Wand2 className="h-3 w-3" />
                        {showQuickStart ? "Hide Guide" : "Quick Guide"}
                      </div>
                      <ChevronDown className={`h-4 w-4 text-primary transition-transform ${showQuickStart ? "rotate-180" : ""}`} />
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>

                {showQuickStart && (
                  <CollapsibleContent>
                    <div className="mx-6 mt-4 mb-6 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="space-y-6">
                        <div>
                          <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2 mb-4">
                            <BookOpen className="h-4 w-4" />
                            Recording Workflow
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {[
                              { step: 1, title: "Connect Device", desc: "Click 'Connect Device' and wait for live preview to appear." },
                              { step: 2, title: "Prepare App (NOT Recorded)", desc: "Use Device Controls to launch app, clear data, or navigate - these actions are NOT saved." },
                              { step: 3, title: "Turn ON Interaction Mode", desc: "Click 'Mode: OFF' to enable it. Device taps will now work." },
                              { step: 4, title: "Start Recording", desc: "Click 'Start Recording' - now every action you do will be saved!" },
                              { step: 5, title: "Interact", desc: "Tap, long press, swipe, or use Input Panel for text." },
                              { step: 6, title: "Stop & Review", desc: "Click 'Stop Recording' to finish. Review and edit steps in Actions tab." }
                            ].map(s => (
                              <div key={s.step} className="flex flex-col gap-2 p-3 bg-background rounded-lg border border-primary/10 hover:border-primary/30 transition-all group relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-1 opacity-5 font-black text-5xl -mr-2 -mt-3 group-hover:scale-110 transition-transform">
                                  {s.step}
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shadow-sm flex-shrink-0">
                                    {s.step}
                                  </div>
                                  <span className="text-xs font-bold text-primary/90">{s.title}</span>
                                </div>
                                <p className="text-[10px] text-muted-foreground leading-relaxed">
                                  {s.desc}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-3">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                              <MousePointer2 className="h-4 w-4" />
                              Interaction Modes
                            </h3>
                            <div className="space-y-2">
                              <div className="p-3 bg-muted/30 rounded-lg border border-muted/50">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="outline" className="text-[9px] bg-primary/10 text-primary border-primary/30">MODE: ON</Badge>
                                  <span className="text-xs font-bold">Interactive</span>
                                </div>
                                <p className="text-[10px] text-muted-foreground">Taps, swipes, and inputs work on device screen.</p>
                              </div>
                              <div className="p-3 bg-muted/30 rounded-lg border border-muted/50">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="outline" className="text-[9px]">MODE: OFF</Badge>
                                  <span className="text-xs font-bold">View Only</span>
                                </div>
                                <p className="text-[10px] text-muted-foreground">Can only watch - taps do nothing.</p>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                              <Type className="h-4 w-4" />
                              Text Input
                            </h3>
                            <div className="p-3 bg-primary/5 border border-primary/10 rounded-lg space-y-2">
                              <div className="flex items-start gap-2">
                                <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                                <div>
                                  <p className="text-xs font-medium">Use Input Panel</p>
                                  <p className="text-[10px] text-muted-foreground">Click 'Input Panel' button, tap field on device, type text, click Send.</p>
                                </div>
                              </div>
                              <div className="flex items-start gap-2">
                                <XCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                                <div>
                                  <p className="text-xs font-medium">Don't use browser pop-ups</p>
                                  <p className="text-[10px] text-muted-foreground">They won't work - always use the Input Panel.</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-lg">
                            <h3 className="text-xs font-bold text-green-600 mb-3 flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4" />
                              What Gets Recorded
                            </h3>
                            <div className="space-y-1.5">
                              {[
                                "Actions AFTER clicking 'Start Recording'",
                                "Taps when Interaction Mode is ON",
                                "Long presses (hold 600ms)",
                                "Swipes and scrolls",
                                "Text input via Input Panel",
                                "System keys (Back, Home, Recents)"
                              ].map((item, i) => (
                                <div key={i} className="flex items-start gap-2">
                                  <span className="text-green-500 text-xs mt-0.5">✓</span>
                                  <p className="text-[10px] text-muted-foreground">{item}</p>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-lg">
                            <h3 className="text-xs font-bold text-red-600 mb-3 flex items-center gap-2">
                              <XCircle className="h-4 w-4" />
                              What Does NOT Get Recorded
                            </h3>
                            <div className="space-y-1.5">
                              {[
                                "Actions BEFORE 'Start Recording'",
                                "Actions when Mode is OFF",
                                "Device Controls (Launch, Stop, Clear)",
                                "System Navigation buttons",
                                "App selection or upload",
                                "Keyboard hide/show"
                              ].map((item, i) => (
                                <div key={i} className="flex items-start gap-2">
                                  <span className="text-red-500 text-xs mt-0.5">✗</span>
                                  <p className="text-[10px] text-muted-foreground">{item}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div>
                          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-3">
                            <Info className="h-4 w-4" />
                            Understanding Results
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="p-3 bg-green-500/5 border border-green-500/20 rounded-lg">
                              <div className="flex items-center gap-2 mb-2">
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                                <span className="text-xs font-bold text-green-600">PASS</span>
                              </div>
                              <p className="text-[10px] text-muted-foreground mb-2">All steps completed successfully with green checkmarks.</p>
                            </div>
                            <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
                              <div className="flex items-center gap-2 mb-2">
                                <XCircle className="h-4 w-4 text-red-500" />
                                <span className="text-xs font-bold text-red-600">FAIL</span>
                              </div>
                              <p className="text-[10px] text-muted-foreground mb-2">One or more steps couldn't complete. Common reasons:</p>
                              <ul className="text-[9px] text-muted-foreground space-y-0.5 ml-3">
                                <li>• Element not found</li>
                                <li>• Timeout (app too slow)</li>
                                <li>• Wrong screen</li>
                              </ul>
                            </div>
                          </div>
                        </div>
                        <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                          <h3 className="text-xs font-bold text-amber-600 mb-3 flex items-center gap-2">
                            <HelpCircle className="h-4 w-4" />
                            Tips for Better Recordings
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {[
                              { tip: "Start Fresh", desc: "Use 'Clear Data' before recording for reliable replays." },
                              { tip: "Add Wait Steps", desc: "If app is slow, add Wait actions between steps." },
                              { tip: "Test Small Flows", desc: "Record 3-5 actions at a time, test replay before adding more." },
                              { tip: "Use Input Panel", desc: "Always use Input Panel for text - never browser pop-ups." }
                            ].map((item, i) => (
                              <div key={i} className="flex items-start gap-2">
                                <span className="text-amber-500 text-xs mt-0.5"></span>
                                <div>
                                  <p className="text-xs font-medium">{item.tip}</p>
                                  <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="p-4 bg-primary/5 border border-primary/10 rounded-lg">
                          <h3 className="text-xs font-bold text-primary mb-3">🎓 Quick Reference</h3>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[10px]">
                            <div>
                              <p className="font-bold mb-1">Interaction Modes</p>
                              <p className="text-muted-foreground">OFF = View only</p>
                              <p className="text-muted-foreground">ON = Can interact</p>
                            </div>
                            <div>
                              <p className="font-bold mb-1">What's Recorded</p>
                              <p className="text-muted-foreground">✓ After "Start Recording"</p>
                              <p className="text-muted-foreground">✗ Device Controls</p>
                            </div>
                            <div>
                              <p className="font-bold mb-1">Pass/Fail</p>
                              <p className="text-muted-foreground">Pass = All steps worked</p>
                              <p className="text-muted-foreground">Fail = Check failed step</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                )}

                <CardContent className="pt-6 space-y-6">
                  <CardContent className="pt-6 space-y-6">
                    {/* --- APP MANAGEMENT --- */}
                    <div className="space-y-3 p-4 bg-muted/20 rounded-xl border border-muted/30 hover:bg-muted/40 transition-all">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                          <Smartphone className="h-3.5 w-3.5 text-primary/60" />
                          App Control
                        </span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full" onClick={refreshAppPackages} disabled={loadingPackages}>
                          <RefreshCw className={`h-3 w-3 ${loadingPackages ? "animate-spin" : ""}`} />
                        </Button>
                      </div>

                      <Select value={appPackage} onValueChange={setAppPackage}>
                        <SelectTrigger className="h-10 bg-background/50 border-muted/40 rounded-lg shadow-sm">
                          <div className="flex flex-col items-start text-left truncate">
                            <span className="text-xs font-bold truncate w-full">
                              {appPackage ? getAppFriendlyName(appPackage) : "Select Application"}
                            </span>
                            {appPackage && <span className="text-[8px] font-mono opacity-40 truncate w-full">{appPackage}</span>}
                          </div>
                        </SelectTrigger>
                        <SelectContent className="max-h-[250px]">
                          {installedPackages.map((pkg) => (
                            <SelectItem key={pkg} value={pkg} className="py-2 text-xs">
                              <div className="flex flex-col">
                                <span className="font-bold">{getAppFriendlyName(pkg)}</span>
                                <span className="text-[9px] opacity-40 font-mono italic">{pkg}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="default" className="h-10 text-xs font-bold gap-2 shadow-md hover:translate-y-[-1px] transition-all" onClick={handleOpenApp}>
                          <Play className="h-3.5 w-3.5 fill-current" /> Launch
                        </Button>
                        <Button variant="outline" className="h-10 text-xs font-bold gap-2 border-muted-foreground/10 hover:bg-destructive/10 hover:text-destructive transition-all" onClick={handleStopApp}>
                          <Square className="h-3.5 w-3.5" /> Stop
                        </Button>
                        <Button variant="secondary" className="h-10 text-xs font-bold gap-2 transition-all" onClick={handleClearApp}>
                          <Trash2 className="h-3.5 w-3.5 opacity-70" /> Clear
                        </Button>
                        <Button variant="destructive" className="h-10 text-xs font-bold gap-2 bg-destructive/10 hover:bg-destructive text-destructive hover:text-destructive-foreground border-none transition-all" onClick={uninstallApp}>
                          <XCircle className="h-3.5 w-3.5 opacity-80" /> Uninstall
                        </Button>
                      </div>
                    </div>

                    {/* --- INTERACTION & INPUT --- */}
                    <div className="space-y-3 p-4 bg-primary/5 rounded-xl border border-primary/20 hover:bg-primary/10 transition-all">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/70 flex items-center gap-2 px-1">
                        <MousePointer2 className="h-3.5 w-3.5" />
                        Interaction
                      </span>
                      <div className="space-y-2">
                        <Button
                          variant={captureMode ? "default" : "outline"}
                          className={`h-11 w-full font-bold transition-all shadow-sm ${captureMode ? 'ring-2 ring-primary/20 bg-primary' : 'bg-background hover:bg-primary/5'}`}
                          onClick={() => setCaptureMode(!captureMode)}
                        >
                          <MousePointer2 className={`mr-2 h-4 w-4 ${captureMode ? 'animate-pulse' : ''}`} />
                          {captureMode ? "Interactions: ON" : "Interactions: OFF"}
                        </Button>
                        <Button
                          variant="outline"
                          className={`h-11 w-full font-bold transition-all border-primary/20 hover:bg-primary/10 ${showInputPanel ? "bg-primary/20 border-primary/40 text-primary shadow-inner" : "bg-background shadow-sm"}`}
                          onClick={() => setShowInputPanel(!showInputPanel)}
                        >
                          <Type className="mr-2 h-4 w-4" /> Input Panel
                        </Button>
                      </div>
                      <p className="text-[10px] text-muted-foreground px-1 italic opacity-70 leading-relaxed">
                        {captureMode ? "Every tap on the device will be recorded as a step." : "Visual-only mode: Tap to inspect elements without recording steps."}
                      </p>
                    </div>

                    {/* --- NAVIGATION & ACTIONS --- */}
                    <div className="grid grid-cols-1 gap-4">
                      {/* Navigation */}
                      <div className="space-y-3 p-4 bg-indigo-500/5 rounded-xl border border-indigo-500/10 transition-all">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-700/60 flex items-center gap-2 px-1">
                          <Smartphone className="h-3.5 w-3.5" />
                          Navigation
                        </span>
                        <div className="grid grid-cols-4 gap-2">
                          <Button variant="outline" className="h-10 flex flex-col items-center justify-center p-0 bg-background hover:bg-indigo-50 border-indigo-500/10" onClick={() => handleKeyPress(4, "Back")} title="Back">
                            <RotateCcw className="h-4 w-4" />
                            <span className="text-[9px] font-bold mt-0.5">Back</span>
                          </Button>
                          <Button variant="outline" className="h-10 flex flex-col items-center justify-center p-0 bg-background hover:bg-indigo-50 border-indigo-500/10" onClick={() => handleKeyPress(3, "Home")} title="Home">
                            <Circle className="h-4 w-4" />
                            <span className="text-[9px] font-bold mt-0.5">Home</span>
                          </Button>
                          <Button variant="outline" className="h-10 flex flex-col items-center justify-center p-0 bg-background hover:bg-indigo-50 border-indigo-500/10" onClick={() => handleKeyPress(187, "Recents")} title="Recents">
                            <ListChecks className="h-4 w-4" />
                            <span className="text-[9px] font-bold mt-0.5">Tasks</span>
                          </Button>
                          <Button variant="outline" className="h-10 flex flex-col items-center justify-center p-0 bg-background border-amber-500/10 text-amber-600 hover:bg-amber-50" onClick={hideKeyboard} title="Hide Keyboard">
                            <Keyboard className="h-4 w-4" />
                            <span className="text-[9px] font-bold mt-0.5 text-amber-600">Hide</span>
                          </Button>
                        </div>
                      </div>

                      {/* Quick Steps */}
                      <div className="space-y-3 p-4 bg-muted/30 rounded-xl border border-muted/40 transition-all">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2 px-1">
                          <Move className="h-3.5 w-3.5" />
                          Quick Steps
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          <Button variant="outline" className="h-10 text-xs font-bold gap-2 border-muted-foreground/10 hover:bg-muted/50" onClick={handleSwipe}>
                            <ChevronUp className="h-4 w-4 text-purple-600" /> Swipe
                          </Button>
                          <Button variant="outline" className="h-10 text-xs font-bold gap-2 border-muted-foreground/10 hover:bg-muted/50" onClick={() => {
                            if (!recording || isPaused) {
                              toast.warning("Start recording first");
                              return;
                            }
                            setActions(prev => [...prev, { id: crypto.randomUUID(), type: 'wait', description: 'Wait (2s)', locator: 'system', value: '2000', timestamp: Date.now(), enabled: true }]);
                            toast.info("Added Wait (2s)");
                          }}>
                            <Clock className="h-4 w-4 text-amber-600" /> Wait
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* --- SESSION CONTROL --- */}
                    <div className="space-y-4 pt-4 border-t border-muted/40">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2 px-1">
                        <Circle className="h-3.5 w-3.5" />
                        Session Status
                      </span>
                      {!recording ? (
                        <div className="space-y-3">
                          <Button onClick={startRecording} disabled={!mirrorActive} className="w-full h-12 text-sm font-black shadow-lg shadow-primary/20 bg-primary hover:scale-[1.01] transition-all" variant="default">
                            <Play className="mr-2 h-5 w-5 fill-current" /> START RECORDING
                          </Button>
                          <div className="grid grid-cols-2 gap-2">
                            <Button variant="outline" onClick={() => replayActions(0)} disabled={actions.length === 0 || replaying} className="h-11 font-bold border-green-500/20 text-green-600 hover:bg-green-50">
                              <Play className="mr-2 h-4 w-4" /> Replay
                            </Button>
                            <Button variant="outline" disabled={true} className="h-11 font-bold opacity-30 cursor-not-allowed grayscale">
                              <Smartphone className="mr-2 h-4 w-4" /> Step Replay
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-3">
                          <Button
                            variant={isPaused ? "default" : "secondary"}
                            onClick={async () => {
                              try {
                                const endpoint = isPaused ? "/recording/resume" : "/recording/pause";
                                const res = await fetch(`${AGENT_URL}${endpoint}`, { method: "POST" });
                                if (res.ok) {
                                  setIsPaused(!isPaused);
                                  toast.info(isPaused ? "Recording resumed" : "Recording paused");
                                } else {
                                  const data = await res.json();
                                  toast.error(data.error || `Failed to ${isPaused ? 'resume' : 'pause'} recording`);
                                }
                              } catch (err) { toast.error("Connection error"); }
                            }}
                            className="w-full h-11 font-bold shadow-sm"
                          >
                            {isPaused ? <><Play className="mr-2 h-4 w-4 fill-current" /> Resume</> : <><Pause className="mr-2 h-4 w-4 text-amber-600" /> Pause Recording</>}
                          </Button>
                          <Button variant="destructive" onClick={stopRecording} className="w-full h-11 font-bold shadow-lg shadow-destructive/10">
                            <Square className="mr-2 h-4 w-4" /> STOP RECORDING
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Permissions & Help */}
                    <div className="space-y-3 p-4 bg-amber-500/5 rounded-xl border border-amber-500/10">
                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700/60 flex items-center gap-2">
                          <Settings className="h-3.5 w-3.5" />
                          System Utils
                        </span>
                        <p className="text-[10px] text-muted-foreground leading-snug px-1 italic">
                          Missing permissions? Configure them manually in device settings.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleOpenAppSettings}
                        disabled={!appPackage || !mirrorActive}
                        className="w-full h-10 text-xs font-bold border-amber-500/10 text-amber-700 hover:bg-amber-500/10 transition-all"
                      >
                        <Settings2 className="mr-2 h-4 w-4" />
                        Open App Settings
                      </Button>
                    </div>
                  </CardContent>
              </Card>
            </Collapsible>
          )}
          {showInputPanel && (
            <Card className="border-primary/20 bg-primary/5 shadow-md animate-in slide-in-from-top-4 duration-300">
              <CardHeader className="py-3 flex flex-row items-center justify-between space-y-0">
                <div className="flex items-center gap-2">
                  <Type className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm">Text Input Panel</CardTitle>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowInputPanel(false)}>
                  <XCircle className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="py-3 flex gap-3">
                <div className="flex-1 space-y-1">
                  <Input
                    value={inputText}
                    onChange={(e: any) => setInputText(e.target.value)}
                    placeholder={inputCoords ? `Type text to send to (${inputCoords.x}, ${inputCoords.y})...` : "Select a field on target or type here..."}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConfirmInput();
                      if (e.key === 'Escape') setShowInputPanel(false);
                    }}
                    autoFocus
                  />
                  {!inputCoords && <p className="text-[11px] text-muted-foreground">Tip: Tap an input field on device to set coordinates automatically</p>}
                </div>
                <Button
                  onClick={handleConfirmInput}
                  disabled={inputPending || !inputCoords}
                  className="gap-2"
                >
                  {inputPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                  Send
                </Button>
                <Button
                  variant="outline"
                  onClick={hideKeyboard}
                  className="gap-2"
                  title="Hide Android keyboard"
                >
                  <Keyboard className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          )}
          <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="actions" className="flex items-center gap-2">
                <MousePointer2 className="h-4 w-4" />
                Actions
              </TabsTrigger>
              <TabsTrigger value="script" className="flex items-center gap-2">
                <Copy className="h-4 w-4" />
                Script
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="actions" className="mt-0 outline-none">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <MousePointer2 className="h-5 w-5 text-primary" />
                        Captured Actions
                      </CardTitle>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      {currentScenarioName ? (
                        <Badge variant="outline" className="text-primary border-primary/20 h-5 px-1.5 gap-1">
                          <FileIcon className="h-3 w-3" /> {currentScenarioName}
                        </Badge>
                      ) : (
                        <span>{actions.length} steps captured</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => {
                        fetchScenarios();
                        setIsLoadDialogOpen(true);
                      }}
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      Load
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      disabled={actions.length === 0}
                      onClick={() => {
                        setSaveScenarioName(currentScenarioName || "");
                        setIsSaveDialogOpen(true);
                      }}
                    >
                      <Save className="h-3.5 w-3.5" />
                      Save
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={actions.length === 0}
                      onClick={() => {
                        if (confirm("Clear all recorded actions?")) {
                          setActions([]);
                          setCurrentScenarioId(null);
                          setCurrentScenarioName("");
                        }
                      }}
                      className="h-8 text-xs bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground border-none"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Clear
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {actions.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl border-muted/20">
                      <p>No actions recorded yet</p>
                      <p className="text-xs mt-1">Start recording and interact with your device</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[450px] pr-4">
                      <div className="space-y-3">
                        {actions.map((a, i) => (
                          <div
                            key={a.id}
                            className={`group flex items-start gap-3 p-3 border rounded-xl transition-all duration-200 hover:shadow-sm hover:border-primary/30 ${replayIndex === i ? 'bg-primary/5 border-primary ring-1 ring-primary/20' : 'bg-background hover:bg-muted/50'}`}
                          >
                            <div className="flex flex-col items-center gap-1 mt-0.5">
                              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold ${replayIndex === i ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors'}`}>
                                {i + 1}
                              </div>
                              <div className="w-[1px] flex-1 bg-muted group-last:hidden" />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <div className="flex items-center gap-2">
                                  {a.type === "tap" && <MousePointer2 className="h-3.5 w-3.5 text-blue-500" title="Tap action - Click on screen element" />}
                                  {a.type === "input" && <Type className="h-3.5 w-3.5 text-green-500" title="Text input - Enter text into field" />}
                                  {a.type === "scroll" && <Move className="h-3.5 w-3.5 text-purple-500" title="Swipe/Scroll action - Navigate screen" />}
                                  {a.type === "wait" && <Clock className="h-3.5 w-3.5 text-amber-500" title="Wait/Delay - Pause execution" />}
                                  {a.type === "hideKeyboard" && <Keyboard className="h-3.5 w-3.5 text-gray-500" title="Hide Keyboard" />}
                                  <span className="font-semibold text-sm leading-none capitalize">{a.type === "hideKeyboard" ? "Hide Keyboard" : a.type}</span>
                                  {a.enabled === false && <Badge variant="secondary" className="h-4 text-[9px] px-1 opacity-70">Disabled</Badge>}
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 text-green-500 hover:text-green-600 hover:bg-green-500/10"
                                    title="Run this step only"
                                    disabled={replaying}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      replaySingleAction(a);
                                    }}
                                  >
                                    <Play className="h-3 w-3" />
                                  </Button>
                                  <div className="flex bg-muted/50 rounded-md mr-1">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6 text-muted-foreground hover:text-primary disabled:opacity-30"
                                      disabled={i === 0}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        moveAction(i, "up");
                                      }}
                                      title="Move step up"
                                    >
                                      <ChevronUp className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6 text-muted-foreground hover:text-primary disabled:opacity-30"
                                      disabled={i === actions.length - 1}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        moveAction(i, "down");
                                      }}
                                      title="Move step down"
                                    >
                                      <ChevronDown className="h-3 w-3" />
                                    </Button>
                                  </div>

                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                    onClick={() =>
                                      setActions((prev) =>
                                        prev.filter((x) => x.id !== a.id)
                                      )
                                    }
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>

                              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 break-words mb-1.5 line-clamp-2">
                                {a.description}
                              </p>
                              {!a.elementId && !a.elementText && !a.elementContentDesc && a.type === "tap" && (
                                <div className="mb-2 flex items-center gap-1.5 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-1 rounded w-fit">
                                  <AlertCircle className="h-3 w-3" />
                                  <span>Coordinate fallback mode</span>
                                </div>
                              )}

                              <div className="flex flex-wrap gap-1.5 items-center">
                                {a.coordinates && (
                                  <Badge variant="outline" className="bg-muted/30 text-[10px] px-1.5 h-5 font-mono border-none">
                                    <Settings className="h-2.5 w-2.5 mr-1 opacity-50" />
                                    {a.coordinates.x}, {a.coordinates.y}
                                  </Badge>
                                )}
                                {a.elementId && (
                                  <Badge variant="outline" className="bg-blue-500/5 text-blue-600 dark:text-blue-400 text-[10px] px-1.5 h-5 font-mono border-blue-500/20">
                                    ID: {a.elementId.split('/').pop()}
                                  </Badge>
                                )}
                                {a.elementText && (
                                  <Badge variant="outline" className="bg-green-500/5 text-green-600 dark:text-green-400 text-[10px] px-1.5 h-5 border-green-500/20">
                                    TXT: "{a.elementText.length > 20 ? a.elementText.substring(0, 20) + '...' : a.elementText}"
                                  </Badge>
                                )}
                                {a.value && a.type !== "input" && (
                                  <Badge variant="outline" className="bg-amber-500/5 text-amber-600 dark:text-amber-400 text-[10px] px-1.5 h-5 border-amber-500/20 font-mono">
                                    VAL: {a.value}
                                  </Badge>
                                )}
                              </div>

                              {a.type === "input" && (
                                <div className="mt-3 p-2 bg-muted/30 rounded-lg border border-dashed border-muted">
                                  {editingStepId === a.id ? (
                                    <div className="flex items-center gap-2">
                                      <Input
                                        value={editingValue}
                                        onChange={(e: any) => setEditingValue(e.target.value)}
                                        className="h-8 text-xs bg-background"
                                        autoFocus
                                        onKeyDown={(e: any) => {
                                          if (e.key === "Enter") {
                                            setActions((prev) => prev.map((p) => p.id === a.id ? { ...p, value: editingValue } : p));
                                            setEditingStepId(null);
                                            toast.success("Updated");
                                          }
                                          if (e.key === "Escape") setEditingStepId(null);
                                        }}
                                      />
                                      <Button size="sm" className="h-8 px-2 text-xs" onClick={() => {
                                        setActions((prev) => prev.map((p) => p.id === a.id ? { ...p, value: editingValue } : p));
                                        setEditingStepId(null);
                                        toast.success("Updated");
                                      }}>Save</Button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="text-xs font-mono text-muted-foreground truncate">
                                        {a.value ? <span>Value: <span className="text-zinc-900 dark:text-zinc-100 font-bold">"{a.value}"</span></span> : <em>(empty)</em>}
                                      </div>
                                      <div className="flex gap-1">
                                        <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1.5" onClick={() => { setEditingStepId(a.id); setEditingValue(a.value || ""); }}>
                                          Edit
                                        </Button>
                                        <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1.5" disabled={!a.value || previewPendingId === a.id} onClick={() => previewInput(a)}>
                                          Preview
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className={`h-6 text-[10px] px-1.5 ${a.enabled === false ? 'text-blue-500' : 'text-muted-foreground'}`}
                                          onClick={() =>
                                            setActions(prev =>
                                              prev.map(p =>
                                                p.id === a.id ? { ...p, enabled: !p.enabled } : p
                                              )
                                            )
                                          }
                                        >
                                          {a.enabled === false ? "Enable" : "Disable"}
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                              {a.type === "wait" && (
                                <div className="mt-3 p-2 bg-amber-500/5 rounded-lg border border-dashed border-amber-500/20">
                                  {editingStepId === a.id ? (
                                    <div className="flex items-center gap-2">
                                      <Input
                                        type="number"
                                        value={editingValue}
                                        onChange={(e: any) => setEditingValue(e.target.value)}
                                        className="h-8 text-xs bg-background"
                                        placeholder="Duration in milliseconds"
                                        autoFocus
                                        onKeyDown={(e: any) => {
                                          if (e.key === "Enter") {
                                            const duration = parseInt(editingValue, 10);
                                            if (isNaN(duration) || duration < 0) {
                                              toast.error("Please enter a valid wait duration (ms)");
                                              return;
                                            }
                                            setActions((prev) => prev.map((p) => p.id === a.id ? {
                                              ...p,
                                              value: editingValue,
                                              description: `Wait for ${duration}ms`
                                            } : p));
                                            setEditingStepId(null);
                                            toast.success("Wait duration updated");
                                          }
                                          if (e.key === "Escape") setEditingStepId(null);
                                        }}
                                      />
                                      <Button size="sm" className="h-8 px-2 text-xs" onClick={() => {
                                        const duration = parseInt(editingValue, 10);
                                        if (isNaN(duration) || duration < 0) {
                                          toast.error("Please enter a valid wait duration (ms)");
                                          return;
                                        }
                                        setActions((prev) => prev.map((p) => p.id === a.id ? {
                                          ...p,
                                          value: editingValue,
                                          description: `Wait for ${duration}ms`
                                        } : p));
                                        setEditingStepId(null);
                                        toast.success("Wait duration updated");
                                      }}>Save</Button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="text-xs font-mono text-muted-foreground truncate">
                                        {a.value ? (
                                          <span>
                                            Duration: <span className="text-amber-700 dark:text-amber-400 font-bold">{a.value}ms</span>
                                            {' '}(<span className="text-xs opacity-70">{(parseInt(a.value, 10) / 1000).toFixed(1)}s</span>)
                                          </span>
                                        ) : (
                                          <em>(no duration set)</em>
                                        )}
                                      </div>
                                      <div className="flex gap-1">
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-6 text-[10px] px-1.5"
                                          onClick={() => {
                                            setEditingStepId(a.id);
                                            setEditingValue(a.value || "2000");
                                          }}
                                        >
                                          Edit Duration
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className={`h-6 text-[10px] px-1.5 ${a.enabled === false ? 'text-blue-500' : 'text-muted-foreground'}`}
                                          onClick={() =>
                                            setActions(prev =>
                                              prev.map(p =>
                                                p.id === a.id ? { ...p, enabled: !p.enabled } : p
                                              )
                                            )
                                          }
                                        >
                                          {a.enabled === false ? "Enable" : "Disable"}
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="script" className="mt-0 outline-none">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Terminal className="h-5 w-5 text-primary" />
                      Generated Script
                    </CardTitle>
                    {!generatedScript && (
                      <p className="text-sm text-muted-foreground mt-1">Script will appear after recording</p>
                    )}
                  </div>
                  {generatedScript && (
                    <div className="flex gap-2">
                      {!isEditingScript ? (
                        <>
                          <Button variant="outline" size="sm" className="h-8" onClick={startEditingScript}>Edit</Button>
                          <Button variant="ghost" size="sm" className="h-8" onClick={copyScript}><Copy className="h-3.5 w-3.5 mr-1" />Copy</Button>
                          <Button variant="ghost" size="sm" className="h-8" onClick={downloadScript}><Download className="h-3.5 w-3.5 mr-1" />Download</Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="default" className="h-8" onClick={handleSaveScript}>Save</Button>
                          <Button size="sm" variant="ghost" className="h-8" onClick={() => setIsEditingScript(false)}>Cancel</Button>
                        </>
                      )}
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  {generatedScript ? (
                    <ScrollArea className="h-[450px]">
                      {isEditingScript ? (
                        <textarea
                          value={editableScript}
                          onChange={(e) => setEditableScript(e.target.value)}
                          className="w-full h-full min-h-[400px] bg-zinc-950 text-zinc-300 p-4 rounded-xl text-xs font-mono border-muted/20 focus:ring-1 focus:ring-primary overflow-y-auto"
                          spellCheck={false}
                        />
                      ) : (
                        <pre className="bg-zinc-950 text-emerald-400 p-4 rounded-xl text-xs overflow-x-auto font-mono">
                          {generatedScript}
                        </pre>
                      )}
                    </ScrollArea>
                  ) : (
                    <div className="h-[450px] flex items-center justify-center border border-dashed rounded-xl bg-muted/5 border-muted/20">
                      <p className="text-sm text-muted-foreground">Start recording to see the automated script</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history" className="mt-0 outline-none">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between border-b border-muted/10 pb-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <ListChecks className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Execution Log</CardTitle>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Instant Feedback</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {lastReplayStatus && !replaying && (
                      <Badge
                        variant={lastReplayStatus === "PASS" ? "default" : "destructive"}
                        className={`h-7 px-3 text-xs font-bold shadow-sm ${lastReplayStatus === "PASS"
                          ? "bg-green-500 hover:bg-green-600 text-white border-none"
                          : "bg-red-500 hover:bg-red-600 text-white border-none"
                          }`}
                      >
                        {lastReplayStatus === "PASS" ? "PASSED" : "FAILED"}
                      </Badge>
                    )}

                    {replaying && (
                      <Badge variant="secondary" className="animate-pulse bg-primary/10 text-primary border-primary/20">
                        <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />
                        Running Replay
                      </Badge>
                    )}
                    {!replaying && executionLogs.length > 0 && (
                      <div className="flex items-center gap-2">
                        {lastReplayStatus === "FAIL" && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              const failedIndex = executionLogs.findIndex(log => log.status === "error");
                              if (failedIndex !== -1) {
                                replayActions(failedIndex);
                              } else {
                                toast.error("Could not find failed step to resume from");
                              }
                            }}
                            className="h-8 text-xs font-bold shadow-md hover:shadow-lg transition-all bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-500/20 hover:border-amber-500/30 border"
                          >
                            <Play className="h-3.5 w-3.5 mr-1.5 fill-current" />
                            Resume Replay
                          </Button>
                        )}

                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => {
                            replayActions(0);
                          }}
                          className="h-8 text-xs font-bold shadow-md hover:shadow-lg transition-all"
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                          Restart Replay
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {executionLogs.length === 0 ? (
                    <div className="text-center py-20 text-muted-foreground border-2 border-dashed rounded-xl border-muted/10">
                      <History className="h-12 w-12 mx-auto mb-4 opacity-10" />
                      <p className="text-sm font-medium">No execution history for this session yet.</p>
                      <p className="text-xs mt-1 text-muted-foreground/60">Start a replay or step-replay to see real-time updates.</p>
                    </div>
                  ) : (
                    <>
                      {lastReplayStatus === "FAIL" && executionLogs.some(log => log.status === "error") && (
                        <div className="mb-4 p-4 bg-destructive/10 border border-destructive/30 rounded-xl animate-in fade-in slide-in-from-top-2 duration-300">
                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-destructive/20 rounded-full">
                              <AlertCircle className="h-5 w-5 text-destructive" />
                            </div>
                            <div className="flex-1">
                              <h4 className="font-bold text-sm text-destructive mb-1">
                                Replay Failed
                              </h4>
                              <p className="text-xs text-destructive/80">
                                {(() => {
                                  const failedIndex = executionLogs.findIndex(log => log.status === "error");
                                  const failedLog = executionLogs[failedIndex];
                                  return `Test stopped at Step ${failedIndex + 1}: "${failedLog?.description || 'Unknown step'}"`;
                                })()}
                              </p>
                              {executionLogs.find(log => log.status === "error")?.error && (
                                <p className="text-xs mt-2 font-medium text-destructive">
                                  <span className="opacity-70">Reason:</span> {executionLogs.find(log => log.status === "error")?.error}
                                </p>
                              )}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
                              onClick={() => {
                                const failedIndex = executionLogs.findIndex(log => log.status === "error");
                                const element = document.querySelector(`[data-step-index="${failedIndex}"]`);
                                element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }}
                            >
                              Jump to Failed Step
                            </Button>
                          </div>
                        </div>
                      )}

                      <ScrollArea className="h-[480px] pr-4">
                        <div className="space-y-4">
                          {executionLogs.map((log, i) => (
                            <div
                              key={`${log.id}-${i}`}
                              data-step-index={i}
                              className={`group relative overflow-hidden p-4 border rounded-xl transition-all duration-300 ${log.status === "error" ? "bg-destructive/[0.03] border-destructive/20 shadow-sm" :
                                log.status === "running" ? "bg-primary/[0.03] border-primary ring-1 ring-primary/10 shadow-md translate-x-1" :
                                  log.status === "success" ? "bg-green-500/[0.02] border-green-500/20" :
                                    "bg-background/50 border-muted/20 opacity-60"
                                }`}
                            >
                              {log.status === "running" && (
                                <div className="absolute top-0 left-0 w-1 h-full bg-primary animate-pulse" />
                              )}
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-3">
                                  <div className="mt-0.5">
                                    {log.status === "pending" && <Clock className="h-4 w-4 text-muted-foreground/30" />}
                                    {log.status === "running" && <RefreshCw className="h-4 w-4 text-primary animate-spin" />}
                                    {log.status === "success" && <CheckCircle className="h-4 w-4 text-green-500" />}
                                    {log.status === "error" && <XCircle className="h-4 w-4 text-destructive" />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                      <span className="text-[10px] font-mono font-bold text-muted-foreground/50">STEP {i + 1}</span>
                                      {log.duration && (
                                        <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono border-muted/30">
                                          {log.duration}ms
                                        </Badge>
                                      )}
                                    </div>
                                    <p className={`font-semibold text-sm leading-snug ${log.status === "error" ? "text-destructive" : "text-zinc-800 dark:text-zinc-200"}`}>
                                      {log.description}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {log.status === "error" && log.error && (
                                <div className="mt-3 p-3 bg-destructive/10 rounded-lg text-xs text-destructive border border-destructive/20 animate-in fade-in slide-in-from-top-2 duration-300">
                                  <div className="flex items-center gap-2 mb-1">
                                    <AlertCircle className="h-3.5 w-3.5" />
                                    <span className="font-bold uppercase tracking-tight text-[10px]">Failure Reason</span>
                                  </div>
                                  <p className="leading-relaxed font-medium opacity-90">{log.error}</p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
        <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save Scenario</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Scenario Name</label>
                  <Input
                    value={saveScenarioName}
                    onChange={(e) => setSaveScenarioName(e.target.value)}
                    placeholder="e.g. Login Flow v1"
                  />
                </div>

                {currentScenarioId && (
                  <div className="text-xs text-muted-foreground flex items-center gap-2 bg-muted p-2 rounded">
                    <Info className="h-4 w-4" />
                    <span>Saving will update the existing scenario "<strong>{currentScenarioName}</strong>".</span>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              {currentScenarioId && (
                <Button variant="secondary" onClick={() => {
                  setCurrentScenarioId(null);
                  handleSaveScenario();
                }}>
                  Save as New
                </Button>
              )}
              <Button onClick={handleSaveScenario}>
                <Save className="h-4 w-4 mr-2" />
                {currentScenarioId ? "Update" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={isLoadDialogOpen} onOpenChange={setIsLoadDialogOpen}>
          <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Load Scenario</DialogTitle>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto py-2">
              {loadingScenarios ? (
                <div className="flex justify-center p-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : scenarios.length === 0 ? (
                <div className="text-center p-8 text-muted-foreground">
                  <FolderOpen className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p>No saved scenarios found.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {scenarios.map(sc => (
                    <div key={sc.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer group" onClick={() => loadScenario(sc)}>
                      <div className="flex flex-col min-w-0">
                        <span className="font-medium truncate">{sc.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(sc.updated_at || sc.created_at || "").toLocaleDateString()} • {Array.isArray(sc.steps) ? sc.steps.length : 0} steps
                        </span>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => deleteScenario(sc.id, e)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div >
  );
}


function FileIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </svg>
  )
}