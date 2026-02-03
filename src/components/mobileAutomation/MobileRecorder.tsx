/**
 * Purpose:
 * Provides the core recording and playback experience for mobile automation.
 * Features real-time screen mirroring, action capture via SSE, script generation,
 * and automated replay with visual progress tracking.
 */
import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { createClient } from "@supabase/supabase-js";
import {
  Play, Pause, Square, Trash2, RefreshCw, Copy, Download, Monitor, Smartphone,
  Wifi, WifiOff, Upload, Package, CheckCircle, XCircle, Type, MousePointer2,
  Move, ChevronRight, Settings, Settings2, Info, AlertCircle, Circle, Keyboard,
  ArrowLeft, ArrowRight, BookOpen, CheckCircle2, HelpCircle, ExternalLink, X,
  Zap, ChevronDown, ChevronUp, ListChecks, Clock, RotateCcw, Terminal,
  History, Wand2, Save, FolderOpen, Edit, FileInput
} from "lucide-react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

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

const AGENT_URL = "http://localhost:3001";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);
const DEVICE_WIDTH = 310;
const DEVICE_HEIGHT = 568;

/**
 * Purpose:
 * Provides a robust retry mechanism for asynchronous device actions.
 * Useful for handling transient network issues or device busy states.
 */
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
/**
 * Purpose:
 * Polls the local agent until a device connection is successfully established
 * or the specified timeout is reached.
 */
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

/**
 * Purpose:
 * The main component for the Mobile Recorder. Manages the recording session,
 * device mirroring, and scenario lifecycle.
 */
export default function MobileRecorder({
  setupState,
  setSetupState,
  selectedDevice,
  setSelectedDevice,
  selectedDeviceFromSetup,
}: MobileRecorderProps) {
  // Recorder state moved from index.tsx
  // Cache generated script so it is NOT tied to Script tab rendering
  const [generatedScriptCache, setGeneratedScriptCache] = useState<string>("");
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
  const previewDimensions = useMemo(() => {
    const fixedHeight = 700;
    if (deviceSize && deviceSize.width > 0 && deviceSize.height > 0) {
      const aspectRatio = deviceSize.width / deviceSize.height;
      return {
        width: Math.round(fixedHeight * aspectRatio),
        height: fixedHeight
      };
    }

    return { width: 350, height: fixedHeight };
  }, [deviceSize]);

  /**
   * Purpose:
   * Continuously monitors the mobile device for focused input fields.
   * If a candidate field is found, it automatically opens the text entry panel
   * to streamline the recording of keyboard interactions.
   */
  /**
     * Purpose:
     * Continuously monitors the mobile device for focused input fields.
     * If a candidate field is found, it automatically opens the text entry panel.
     * FIX: Added 404 detection to stop polling if backend doesn't support it.
     */
  useEffect(() => {
    let focusInterval: ReturnType<typeof setInterval> | null = null;
    let burstTimeout1: ReturnType<typeof setTimeout> | null = null;
    let burstTimeout2: ReturnType<typeof setTimeout> | null = null;

    // CIRCUIT BREAKER: Local flag to stop polling if backend is missing the feature
    let isEndpointMissing = false;

    const checkInputFocus = async () => {
      // 1. Stop if panel is open, input is pending, or we know the endpoint is missing
      if (showInputPanel || inputPending || isEndpointMissing) return;

      try {
        const res = await fetch(`${AGENT_URL}/device/focus`);

        // === FIX START: Handle 404 Gracefully ===
        if (res.status === 404) {
          // Backend doesn't support this feature. Stop polling immediately.
          isEndpointMissing = true;
          if (focusInterval) clearInterval(focusInterval);
          return;
        }
        // === FIX END ===

        if (res.ok) {
          const data = await res.json();

          if (data.success && data.isInputCandidate && data.focusedElement) {
            let x = 500, y = 500;
            if (data.focusedElement.bounds) {
              const match = data.focusedElement.bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
              if (match) {
                x = Math.round((parseInt(match[1]) + parseInt(match[3])) / 2);
                y = Math.round((parseInt(match[2]) + parseInt(match[4])) / 2);
              }
            }

            setInputText("");
            setInputCoords({ x, y });
            setShowInputPanel(true);
            toast.info("Input focus detected", {
              description: `Automatically opened panel for ${data.focusedElement.resourceId || 'input field'}`
            });
          }
        }
      } catch (err) {
        // Only log network errors (fetch failures), not 404s (handled above)
        // console.warn("[FocusMonitor] Network error:", err);
      }
    };

    if (recording && !isPaused && mirrorActive) {
      checkInputFocus();
      // Burst checks to catch UI settling
      burstTimeout1 = setTimeout(checkInputFocus, 500);
      burstTimeout2 = setTimeout(checkInputFocus, 1200);
      // Regular polling
      focusInterval = setInterval(checkInputFocus, 3500);
    }

    return () => {
      if (focusInterval) clearInterval(focusInterval);
      if (burstTimeout1) clearTimeout(burstTimeout1);
      if (burstTimeout2) clearTimeout(burstTimeout2);
    };
  }, [recording, isPaused, mirrorActive, showInputPanel, inputPending]);


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
  const isDraggingRef = useRef(false);
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

  /**
   * Purpose:
   * Establishes a persistent Server-Sent Events (SSE) connection to the local agent.
   * This stream provides real-time updates for recorded steps and replay progress.
   */
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

  /**
   * Purpose:
   * Fetches the list of saved scenarios from the database (Supabase)
   * to populate the scenario management UI.
   */
  const fetchScenarios = async () => {
    setLoadingScenarios(true);
    const res = await ScenarioService.getScenarios();
    setLoadingScenarios(false);

    if (res.success && res.data) {
      // Map to RecordedScenario type with fallbacks
      const mappedScenarios: RecordedScenario[] = (res.data as any[]).map((s: any) => ({
        id: s.id,
        name: s.name || "Unnamed Scenario",
        description: s.description,
        steps: s.steps || [],
        app_package: s.app_package,
        user_id: s.user_id,
        created_at: s.created_at,
        updated_at: s.updated_at
      }));
      setScenarios(mappedScenarios);
    } else {
      toast.error("Failed to load scenarios");
    }
  };

  /**
   * Purpose:
   * Saves the current sequence of recorded actions as a new scenario or
   * updates an existing one in the database.
   */
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

  /**
   * Purpose:
   * Initializes and maintains a high-frequency screenshot stream from the mobile device.
   * Leverages a dynamic interval to balance UI responsiveness with network efficiency.
   */
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
      if (inFlight) return;
      inFlight = true;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      // Dynamic interval: Fast on success, Slow on failure
      let nextInterval = intervalMs;

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
            nextInterval = 1000;
          }
        } else {
          const data = await res.json().catch(() => ({}));
          console.warn(`[Mirror] Server error (${res.status}):`, data.error || res.statusText);
          failCount++;
          nextInterval = 2000;
        }
      } catch (err: any) {
        const isNetworkError = err.name === 'TypeError' || err.name === 'AbortError' || err.message?.includes('Failed to fetch');

        failCount++;
        nextInterval = isNetworkError ? 5000 : 3000;

        if (isNetworkError) {
          setMirrorError("Device service is offline. Please start the WISPR Agent.");
        }
      } finally {
        inFlight = false;
      }
      if (failCount >= maxFails) {
        setMirrorActive(false);
        setMirrorError("Connection lost to device. Please reconnect.");
        stopLoop();
        return;
      }
      if (active) {
        screenshotIntervalRef.current = setTimeout(captureScreenshot as any, nextInterval);
      }
    };
    captureScreenshot();

    return () => stopLoop();
  }, [advancedConfig.screenshotMaxFails, advancedConfig.screenshotTimeoutMs]);


  useEffect(() => {
    setMirrorActive(false);
    setMirrorImage(null);
    setCaptureMode(false);
    setMirrorError(null);
  }, [selectedDevice?.id, selectedDevice?.device]);

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
      // Suppress noisy logs when agent is offline
      console.debug("[MobileRecorder] stopEmulator - agent offline");
      return false;
    }
  };

  /* =====================================================
   * 📱 CONNECT DEVICE - EMBEDDED MIRROR
   * ===================================================== */

  /**
   * Purpose:
   * Establishes a complete connection to the mobile device:
   * 1. Verifies local helper health.
   * 2. Checks if the device/emulator is already connected.
   * 3. Starts the specified emulator if necessary.
   * 4. Waits for the device to become fully responsive before proceeding.
   */
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
        description: "Live preview active. Tap, type, or navigate on the device to record actions",
      });
    } catch (err: any) {
      // Suppress noisy connection logs
      const isConnectionError = err.name === 'TypeError' || err.message?.includes('fetch');
      if (isConnectionError) {
        console.debug("[connectDevice] Agent unreachable");
      } else {
        console.error("[connectDevice] Error:", err);
      }

      setMirrorError("Local helper not reachable. Start with: npm start in public/mobile-automation");
      setMirrorLoading(false);
    }
  }, [selectedDevice, startScreenshotStream, advancedConfig.emulatorReadyTimeoutMs, advancedConfig.emulatorReadyPollIntervalMs, advancedConfig.deviceReadyTimeoutMs, advancedConfig.deviceReadyPollIntervalMs, appPackage]);

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
    toast.info("Device Disconnected");
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
      setGeneratedScriptCache("");
      setRecording(true);

      toast.success("Recording started", {
        description: `Connected to ${selectedDevice.name || selectedDevice.device}`,
      });
      setCaptureMode(true);
    } catch (err) {
      // Suppress noisy connection logs
      console.debug("[MobileRecorder] Start recording failed - likely agent offline");
      toast.error("Failed to start recording", {
        description: "Make sure the agent is running (npm start)",
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
      setCaptureMode(false);

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
      // Suppress noisy connection logs
      console.debug("[MobileRecorder] Stop recording failed - likely agent offline");
      toast.error("Failed to stop recording");
      setRecording(false);
    }
  };

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

      setExecutionLogs(prev => prev.map(log =>
        log.id === action.id ? { ...log, status: "running", error: undefined } : log
      ));

      const res = await fetch(`${AGENT_URL}/recording/replay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: selectedDevice.id || selectedDevice.device,
          steps: [action],
          startIndex: 0
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Step failed");
      }

      setReplaying(false);
      setReplayIndex(null);

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
      for (let i = startIndex; i < enabledActions.length; i++) {
        const action = enabledActions[i];
        setReplayIndex(i);

        // Update step status to running
        setExecutionLogs(prev => prev.map((log, idx) =>
          idx === i ? { ...log, status: "running" } : log
        ));

        const startStepTime = Date.now();
        const res = await fetch(`${AGENT_URL}/recording/replay`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deviceId: selectedDevice.id || selectedDevice.device,
            steps: [action],
            startIndex: 0,
            screenSettleDelayMs: advancedConfig.screenSettleDelayMs
          }),
        });

        const data = await res.json();
        const duration = Date.now() - startStepTime;

        if (!res.ok || !data.success) {
          const errorMsg = data.error || "Action failed";
          // Update step status to error
          setExecutionLogs(prev => prev.map((log, idx) =>
            idx === i ? { ...log, status: "error", error: errorMsg } : log
          ));
          throw new Error(errorMsg);
        }

        // Update step status to success
        setExecutionLogs(prev => prev.map((log, idx) =>
          idx === i ? { ...log, status: "success", duration } : log
        ));

        // Add a small delay between steps for visual clarity and device settling
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      setLastReplayStatus("PASS");
      setReplaying(false);
      setReplayIndex(null);
      await saveExecutionToHistory("SUCCESS");
      toast.success("Replay completed successfully!");

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

  //FORCE real-time script generation during recording

  const generatedScript = useMemo(() => {
    if (savedManualScript) return savedManualScript;

    const enabledActions = actions.filter(a => a.enabled !== false);
    if (!enabledActions.length) return null;

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
              } else if (a.locator && a.locator !== "system") {
                javaCode = `driver.findElement(AppiumBy.xpath("${a.locator}")).click();`;
              } else if (a.coordinates) {
                javaCode = `// Coordinate tap at (${a.coordinates.x}, ${a.coordinates.y})
            // Use W3C Actions for coordinates if needed
            driver.executeScript("mobile: clickGesture", java.util.Map.of(
                "x", ${a.coordinates.x},
                "y", ${a.coordinates.y}
            ));`;
              } else {
                javaCode = `// Action missing locator and coordinates`;
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
                javaCode = `// Coordinate Scroll/Swipe action
            driver.executeScript("mobile: swipeGesture", java.util.Map.of(
                "left", ${a.coordinates.x}, "top", ${a.coordinates.y},
                "width", 200, "height", 200,
                "direction", "${a.coordinates.y > (a.coordinates.endY || 0) ? 'up' : 'down'}",
                "percent", 1.0
            ));`;
              } else {
                javaCode = `// Directional Scroll action
            driver.executeScript("mobile: scrollGesture", java.util.Map.of(
                "left", 100, "top", 100, "width", 200, "height", 200,
                "direction", "${a.value || 'down'}",
                "percent", 1.0
            ));`;
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

            case "doubleTap":
              javaCode = `// Double Tap action
            driver.executeScript("mobile: doubleClickGesture", java.util.Map.of(
                "x", ${a.coordinates?.x},
                "y", ${a.coordinates?.y}
            ));`;
              break;


            case "swipe":
              javaCode = `// Swipe action
            driver.executeScript("mobile: swipeGesture", java.util.Map.of(
                "left", 100, "top", 100, "width", 200, "height", 200,
                "direction", "up",
                "percent", 1.0
            ));`;
              break;

            case "clearCache":
              javaCode = `driver.executeScript("mobile: shell", java.util.Map.of("command", "pm clear ${a.value}"));`;
              break;

            case "assert":
              if (a.assertionType === "visible") {
                javaCode = `assert driver.findElement(AppiumBy.xpath("${a.locator}")).isDisplayed();`;
              } else if (a.assertionType === "text_equals") {
                javaCode = `assert driver.findElement(AppiumBy.xpath("${a.locator}")).getText().equals("${a.value}");`;
              } else if (a.assertionType === "enabled") {
                javaCode = `assert driver.findElement(AppiumBy.xpath("${a.locator}")).isEnabled();`;
              } else if (a.assertionType === "disabled") {
                javaCode = `assert !driver.findElement(AppiumBy.xpath("${a.locator}")).isEnabled();`;
              } else {
                javaCode = `// Manual Assertion: ${a.description}`;
              }
              break;

            default:
              return "";
          }

          return `${comment}\n            ${javaCode}`;
        })
        .join("\n\n")
      }
      } finally {
        driver.quit();
      }
    }
  }`;
  }, [actions, savedManualScript, selectedDevice]);

  useEffect(() => {
    if (generatedScript !== generatedScriptCache) {
      setGeneratedScriptCache(generatedScript);
    }
  }, [
    generatedScript,
    generatedScriptCache,
  ]);
  // Always prefer live cached script
  const liveGeneratedScript = useMemo(() => {
    if (savedManualScript) return savedManualScript;
    return generatedScriptCache || generatedScript;
  }, [savedManualScript, generatedScriptCache, generatedScript]);

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
    if (!uploadedApk) {
      toast.error("No APK uploaded to install");
      return;
    }

    const deviceId = selectedDevice?.id || selectedDevice?.device;
    if (!deviceId) {
      toast.error("Please select or connect a device first");
      return;
    }

    setApkInstalling(true);
    const toastId = toast.loading(`Installing ${uploadedApk.name} on ${selectedDevice.name || deviceId}...`, {
      description: "This may take a minute for devices."
    });

    try {
      // Step 1: Trigger installation
      const res = await fetch(`${AGENT_URL}/app/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apkPath: uploadedApk.path,
          deviceId: deviceId
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Installation successful", {
          id: toastId,
          description: `${uploadedApk.name} is now ready to use.`
        });
        setIsAppInstalled(true);
        refreshAppPackages();
        setUploadedApk(prev => prev ? { ...prev, installed: true } : null);
      } else {
        throw new Error(data.error || "ADB installation failed");
      }
    } catch (err: any) {
      console.error("[installApk] Error:", err);
      toast.error("Installation failed", {
        id: toastId,
        description: err.message || "Failed to install APK. Check device connection and storage."
      });
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
        refreshAppPackages();
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

        if (recording && !isPaused) {
          setActions(prev => [...prev, {
            id: crypto.randomUUID(),
            type: "clearCache",
            description: `Clear Data: ${getAppFriendlyName(appPackage)}`,
            locator: "system",
            value: appPackage,
            timestamp: Date.now(),
            enabled: true
          }]);
        }
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
        toast.success(`Stopped ${appPackage} `);

        if (recording && !isPaused) {
          setActions(prev => [...prev, {
            id: crypto.randomUUID(),
            type: "stopApp",
            description: `Force Stop: ${getAppFriendlyName(appPackage)}`,
            locator: "system",
            value: appPackage,
            timestamp: Date.now(),
            enabled: true
          }]);
        }
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
        throw new Error(`Server error: ${res.status} `);
      }
      const data = await res.json();
      if (data.success && data.packages) {
        setInstalledPackages(data.packages);
        return data.packages;
      }
      return [];
    } catch (err) {
      // Suppress noisy connection logs
      console.debug("[fetchInstalledPackages] Agent unreachable");
      return null;
    } finally {
      setLoadingPackages(false);
    }
  };

  const handleDoubleTap = async (x: number, y: number) => {
    try {
      await retryDeviceAction(async () => {
        const res = await fetch(`${AGENT_URL}/device/tap`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ x, y, count: 2 }),
        });
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || "Failed to double tap");
        }
        return data;
      }, advancedConfig.maxRetries, advancedConfig.retryDelayMs);
    } catch (err: any) {
      console.error("Double tap failed after retries:", err);
      toast.error(err.message || "Failed to double tap");
    }
  };

  // Find this function (approx line 1130) and replace it completely
  const handleDirectionalSwipe = async (direction: "up" | "down" | "left" | "right") => {
    try {
      // FIX: Use coordinate-based swiping instead of the /device/scroll endpoint
      // This bypasses the "Device service returned an error page" issue.

      const width = deviceSize?.width || 1080;
      const height = deviceSize?.height || 1920;
      const centerX = Math.round(width / 2);
      const centerY = Math.round(height / 2);

      let startX, startY, endX, endY;

      // Calculate swipe coordinates (swiping 60% of the screen)
      switch (direction) {
        case "up": // Swipe from bottom to top
          startX = centerX;
          startY = Math.round(height * 0.8);
          endX = centerX;
          endY = Math.round(height * 0.2);
          break;
        case "down": // Swipe from top to bottom
          startX = centerX;
          startY = Math.round(height * 0.2);
          endX = centerX;
          endY = Math.round(height * 0.8);
          break;
        case "left": // Swipe from right to left
          startX = Math.round(width * 0.9);
          startY = centerY;
          endX = Math.round(width * 0.1);
          endY = centerY;
          break;
        case "right": // Swipe from left to right
          startX = Math.round(width * 0.1);
          startY = centerY;
          endX = Math.round(width * 0.9);
          endY = centerY;
          break;
      }

      // Re-use the existing handleSwipe which we know works
      await handleSwipe({
        x1: startX,
        y1: startY,
        x2: endX,
        y2: endY,
        description: `Swipe ${direction}`
      });

    } catch (err: any) {
      console.error("[handleDirectionalSwipe] Error:", err);
      toast.error(`Failed to swipe ${direction}`);
    }
  };
  const handleUndo = () => {
    if (actions.length === 0) {
      toast.info("No actions to undo");
      return;
    }
    const lastAction = actions[actions.length - 1];
    setActions(prev => prev.slice(0, -1));
    toast.success(`Removed: ${lastAction.description} `);
  };

  const handleClearCache = async () => {
    if (!appPackage) {
      toast.error("Select an app first");
      return;
    }

    toast.promise(
      (async () => {
        const success = await runAdbCommand(`pm clear ${appPackage} `);
        if (!success) throw new Error("ADB command failed");
        return true;
      })(),
      {
        loading: `Wiping app state for ${appPackage}...`,
        success: `Successfully wiped ${getAppFriendlyName(appPackage)} `,
        error: "Failed to clear app cache/data",
      }
    );
  };

  const handleAssertion = async (type: "visible" | "text_equals" | "enabled" | "disabled" | "toast" | "screen_loaded") => {
    if (!recording || isPaused) {
      toast.warning("Start recording to add assertions");
      return;
    }

    const descriptionMap = {
      visible: "Assert Element Visible",
      text_equals: "Assert Text Equals",
      enabled: "Assert Element Enabled",
      disabled: "Assert Element Disabled",
      toast: "Assert Toast Message",
      screen_loaded: "Assert Screen Loaded"
    };

    // Use backend API to add assertion step
    try {
      const response = await fetch(`${AGENT_URL}/recording/add-step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "assert",
          description: descriptionMap[type],
          locator: selectedNode?.xpath || "system",
          value: selectedNode?.text || "",
          assertionType: type
        })
      });
      if (response.ok) {
        toast.success(`Added Assertion: ${descriptionMap[type]} `);
      } else {
        throw new Error("Failed to add assertion");
      }
    } catch (err: any) {
      console.error("Assertion step error:", err);
      toast.error("Failed to add assertion");
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

  const handleSwipe = async (coords?: { x1: number, y1: number, x2: number, y2: number, description?: string }) => {
    try {
      const payload = coords || { x1: 500, y1: 1500, x2: 500, y2: 500, duration: 500 };
      const res = await fetch(`${AGENT_URL}/device/swipe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to swipe");
      }
      toast.success((payload as any).description || "Swiped successfully");
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

      toast.success(`Pressed ${keyName} `);
    } catch (err: any) {
      console.error(`Key press failed after retries: `, err);
      toast.error(err.message || `Failed to press ${keyName} `);
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
        toast.success(`Launched ${appPackage} `);
        // Note: Step recording is handled by the backend via SSE stream
        // No need to manually add the step here to avoid duplicates
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

      toast.success(`App list refreshed(${packages.length} apps found)`);
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
      `Are you sure you want to uninstall ?\n\n${appPackage} `
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
  // Guided Tour Logic
  const startTour = () => {
    const driverObj = driver({
      showProgress: true,
      animate: true,
      steps: [
        {
          element: '#device-selector-header',
          popover: {
            title: 'Device Selection',
            description: 'Choose your target device here. The status indicator shows if the device is connected and ready for automation.',
            side: "bottom",
            align: 'start'
          }
        },
        {
          element: '#device-preview-card',
          popover: {
            title: 'Live Device Preview',
            description: 'Interact directly with this screen! <br/>• <b>Tap</b>: Click anywhere to tap <br/>• <b>Swipe</b>: Click and drag to swipe <br/>• <b>Input</b>: Click a text field to open the input panel',
            side: "right",
            align: 'start'
          }
        },
        {
          element: '#system-navigation-tools',
          popover: {
            title: 'System Navigation',
            description: 'Essential Android keys:<br/>• <b>Back</b>: Go to previous screen<br/>• <b>Home</b>: Return to home screen<br/>• <b>Recents</b>: View running apps<br/>• <b>Hide KB</b>: Dismiss the on-screen keyboard',
            side: "left",
            align: 'start'
          }
        },
        {
          element: '#interaction-tools',
          popover: {
            title: 'Interaction Tools',
            description: 'Advanced controls:<br/>• <b>Capture Mode</b>: Record taps without executing them immediately<br/>• <b>Undo</b>: Revert the last recorded action<br/>• <b>Swipe/Wait</b>: Manually add specific swipe or wait steps',
            side: "left",
            align: 'start'
          }
        },
        {
          element: '#app-control-section',
          popover: {
            title: 'App Management',
            description: 'Manage your target app:<br/>• <b>Launch/Stop</b>: Start or force-stop the selected app<br/>• <b>Clear Data</b>: Reset app state fully<br/>• <b>Upload APK</b>: Install new apps if none are found',
            side: "left",
            align: 'start'
          }
        },
        {
          element: '#recording-dashboard',
          popover: {
            title: 'Recording Controls',
            description: '• <b>Start</b>: Begin recording your session<br/>• <b>Replay</b>: Play back recorded actions immediately<br/>• <b>Pause/Resume</b>: Temporarily halt recording without stopping',
            side: "top",
            align: 'start'
          }
        },
        {
          element: '#actions-tabs',
          popover: {
            title: 'Data & History',
            description: '• <b>Actions</b>: View and edit the list of recorded steps<br/>• <b>Script</b>: Get the generated code for your automation<br/>• <b>History</b>: See logs of past executions',
            side: "top",
            align: 'start'
          }
        }
      ]
    });

    driverObj.drive();
  };

  // Auto-start tour on first visit - only when device is connected
  useEffect(() => {
    const hasSeenTour = localStorage.getItem("mobile_recorder_tour_seen");
    if (!hasSeenTour && mirrorActive) {
      const timer = setTimeout(() => {
        startTour();
        localStorage.setItem("mobile_recorder_tour_seen", "true");
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [mirrorActive]);

  const handleDeviceSelection = async (device: SelectedDevice) => {
    if (recording) {
      try {
        await stopRecording();
        toast.info("Previous recording stopped due to device switch");
      } catch (err) {
        console.error("Failed to auto-stop recording:", err);
      }
    }
    setSelectedDevice(device);
  };
  return (
    <div className="space-y-4" id="recorder-container">
      {/* NEW PREMIUM HEADER ROW */}
      <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.08] pb-4 mb-4" id="device-selector-header">
        {/* LEFT: Title & Device Selector Grouped Tightly */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Title Block with subtle gradient and icon */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 shadow-inner">
              <Smartphone className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-0.5">
              <h2 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                Mobile Recorder
              </h2>
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest opacity-70 leading-none">
                  Live interaction & logic recording
                </p>
              </div>
            </div>
          </div>

          {/* Vertical Divider (Visual separation) */}
          <div className="hidden md:block h-10 w-px bg-white/[0.08] mx-1" />
          {/* DEVICE SELECTOR CONTROL - MATCHING DASHBOARD PATTERN */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 py-1 px-3 rounded-lg border border-border bg-card/40 backdrop-blur-md shadow-card transition-all duration-200 hover:bg-muted/30 group">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground hidden lg:block">
                  Device
                </span>
                <div className="h-3 w-px bg-border/40 hidden lg:block" />
              </div>

              <div className="flex items-center">
                {/* Scaled down slightly to fit compact row */}
                <div className="scale-95 origin-left">
                  <DeviceSelector
                    onSelect={handleDeviceSelection}
                    selectedDeviceFromSetup={selectedDeviceFromSetup}
                    disabled={!!selectedDeviceFromSetup}
                    refreshKey={deviceRefreshKey}
                  />
                </div>

                {selectedDevice && (
                  <div className="ml-2 flex items-center justify-center">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  </div>
                )}

                {!selectedDeviceFromSetup && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 ml-1 transition-all"
                    onClick={() => {
                      setDeviceRefreshKey(prev => prev + 1);
                      toast.info("Refreshing device list...");
                    }}
                    title="Refresh device list"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* RIGHT: Status Badge & Recording Guide */}
        <div className="flex items-center gap-4">
          {mirrorActive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={startTour}
              className="h-9 px-4 text-sm font-bold text-primary hover:bg-primary/10 gap-2 rounded-lg border border-primary/20 shadow-sm transition-all group"
            >
              <HelpCircle className="h-4 w-4 group-hover:rotate-12 transition-transform" />
              Recording Guide
            </Button>
          )}

          {/* Recording Status Badge */}
          {recording && (
            <Badge
              variant={isPaused ? "secondary" : (connectionStatus === "connected" ? "default" : "destructive")}
              className={`h-8 px-4 rounded-lg text-[10px] font-black tracking-widest shadow-sm ${!isPaused && "animate-pulse"}`}
            >
              {isPaused ? "PAUSED" : (connectionStatus === "connected" ? "REC" : "RECORDING")}
            </Badge>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* MAESTRO-STYLE EMULATOR WINDOW */}
        {/* FIXED SIZE MAESTRO-STYLE EMULATOR WINDOW */}
        <div
          className="lg:col-span-1 h-fit lg:sticky lg:top-24 flex flex-col rounded-xl overflow-hidden border border-zinc-800 shadow-card bg-zinc-950/50 backdrop-blur-sm mx-auto transition-all duration-300 hover:shadow-elegant"
          style={{ width: `${previewDimensions.width}px` }}
          id="device-preview-card"
        >

          {/* 1. EMULATOR HEADER BAR */}
          <div className="relative z-20 flex items-center justify-between px-4 py-3 bg-[#18181b] border-b border-zinc-800 select-none h-[52px]">
            <div className="flex items-center gap-3">
              {/* Device Name */}
              <div className="flex items-center gap-2 overflow-hidden">
                <Smartphone className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                <span className="text-xs font-bold text-zinc-200 tracking-wide font-mono truncate max-w-[120px]" title={selectedDevice?.name || selectedDevice?.device}>
                  {selectedDevice?.name || selectedDevice?.device || "No Device"}
                </span>
              </div>
            </div>

            {/* Header Actions */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-white/5 rounded-md"
                onClick={connectDevice}
                title="Refresh Connection"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${mirrorLoading ? "animate-spin" : ""}`} />
              </Button>
              {mirrorActive && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-md"
                  onClick={disconnectDevice}
                  title="Disconnect Device"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* 2. EMULATOR VIEWPORT (FIXED HEIGHT, DYNAMIC WIDTH) */}
          <div
            className="relative bg-[#09090b] flex flex-col items-center justify-center overflow-hidden group transition-all duration-500"
            style={{ width: `${previewDimensions.width}px`, height: `${previewDimensions.height}px` }}
          >

            {/* FLOATING BADGE: INSPECT MODE */}
            {captureMode && mirrorActive && (
              <div className="absolute top-4 left-4 z-50 animate-in fade-in slide-in-from-top-2 duration-300 pointer-events-none">
                <div className="bg-[#18181b]/90 backdrop-blur-md border border-zinc-700 text-zinc-100 px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-pink-400 animate-pulse shadow-[0_0_8px_rgba(236,72,153,0.6)]" />
                  <span className="text-[10px] font-bold tracking-wide">Inspect Mode</span>
                </div>
              </div>
            )}

            {/* --- STATUS OVERLAYS (Loading / Preparing) --- */}
            {(mirrorLoading || isPreparingDevice) && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-300">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <div className="h-12 w-12 border-[3px] border-zinc-800 border-t-pink-500 rounded-full animate-spin" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-sm font-bold text-zinc-200">{isPreparingDevice ? 'Booting Agent...' : 'Connecting...'}</p>
                    <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Please Wait</p>
                  </div>
                </div>
              </div>
            )}

            {/* --- MAIN CONTENT --- */}
            {!mirrorActive ? (
              // EMPTY STATE
              <div className="flex flex-col items-center justify-center text-center space-y-6 animate-in fade-in zoom-in-95 duration-500 opacity-60 hover:opacity-100 transition-opacity p-6">
                <div className="w-24 h-40 border-2 border-dashed border-zinc-800 rounded-xl flex items-center justify-center bg-zinc-900/20">
                  <Smartphone className="h-8 w-8 text-zinc-700" />
                </div>
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-zinc-400">No Active Session</p>
                  <p className="text-[10px] text-zinc-600 max-w-[200px] mx-auto leading-relaxed">Select a device from the toolbar to initialize the system view.</p>
                </div>
                <Button
                  onClick={connectDevice}
                  className="h-9 px-6 text-[11px] font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg shadow-card hover:shadow-elegant transition-all duration-300 gap-2 group"
                >
                  <Zap className="h-3.5 w-3.5 fill-current group-hover:animate-pulse" />
                  Connect Device
                </Button>
              </div>
            ) : mirrorError ? (
              // ERROR STATE
              <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
                <div className="p-3 bg-red-500/10 rounded-lg">
                  <WifiOff className="h-8 w-8 text-red-500/50" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-red-500">Signal Lost</h3>
                  <p className="text-[10px] text-zinc-500 font-mono max-w-[220px] mx-auto">{mirrorError}</p>
                </div>
                <Button variant="outline" size="sm" onClick={connectDevice} className="border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white mt-2">
                  Retry Connection
                </Button>
              </div>
            ) : (
              // ACTIVE SCREEN STREAM
              <div className="relative w-full h-full flex items-center justify-center bg-[#000]">

                {/* CAPTURE MODE OVERLAY (PINK THEME) */}
                {captureMode && (
                  <div className="absolute inset-4 pointer-events-none z-20 border-[2px] border-dashed border-pink-500/60 rounded-lg shadow-[0_0_30px_rgba(236,72,153,0.15)] animate-in fade-in duration-300">
                    {/* Corner Markers */}
                    <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-pink-500 bg-transparent" />
                    <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-pink-500 bg-transparent" />
                    <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-pink-500 bg-transparent" />
                    <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-pink-500 bg-transparent" />
                  </div>
                )}

                {mirrorImage && (
                  <img
                    src={mirrorImage}
                    alt="Device Screen"
                    className={`w-full h-full object-contain select-none transition-all duration-200 ${captureMode ? 'cursor-pointer opacity-90' : 'cursor-default'}`}
                    // --- INTERACTION LOGIC ---
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
                      isDraggingRef.current = true;
                      longPressHappenedRef.current = false;

                      longPressTimerRef.current = setTimeout(() => {
                        if (isDraggingRef.current) {
                          handleLongPress(deviceX, deviceY);
                          longPressHappenedRef.current = true;
                          isDraggingRef.current = false;
                        }
                      }, 700);
                    }}
                    onMouseUp={async (e) => {
                      if (!captureMode || !pressCoordsRef.current) return;

                      if (longPressTimerRef.current) {
                        clearTimeout(longPressTimerRef.current);
                        longPressTimerRef.current = null;
                      }

                      const el = e.currentTarget as HTMLImageElement;
                      const rect = el.getBoundingClientRect();
                      const clickX = e.clientX - rect.left;
                      const clickY = e.clientY - rect.top;
                      const finalDev = deviceSize || { width: 1080, height: 1920 };

                      const deviceX = Math.round((clickX / rect.width) * finalDev.width);
                      const deviceY = Math.round((clickY / rect.height) * finalDev.height);

                      const startX = pressCoordsRef.current.x;
                      const startY = pressCoordsRef.current.y;
                      const dist = Math.sqrt(Math.pow(deviceX - startX, 2) + Math.pow(deviceY - startY, 2));

                      // 1. Handle Swipe
                      if (dist > 30) {
                        isDraggingRef.current = false;
                        const description = Math.abs(deviceX - startX) > Math.abs(deviceY - startY)
                          ? (deviceX > startX ? "Swipe Right" : "Swipe Left")
                          : (deviceY > startY ? "Swipe Down" : "Swipe Up");

                        handleSwipe({ x1: startX, y1: startY, x2: deviceX, y2: deviceY, description });
                        pressCoordsRef.current = null;
                        return;
                      }

                      // 2. Handle Long Press
                      if (longPressHappenedRef.current) {
                        isDraggingRef.current = false;
                        pressCoordsRef.current = null;
                        return;
                      }

                      isDraggingRef.current = false;

                      // 3. Execute Tap & Force Check
                      try {
                        const { res, json } = await retryDeviceAction(async () => {
                          const response = await fetch(`${AGENT_URL}/device/tap`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ x: deviceX, y: deviceY }),
                          });
                          const data = await response.json().catch(() => ({}));
                          if (!response.ok) throw new Error(data.error || "Tap failed");
                          return { res: response, json: data };
                        }, advancedConfig.maxRetries, advancedConfig.retryDelayMs);

                        if (res.ok) {
                          const meta = json.step?.elementMetadata || {};
                          const resourceId = (meta.resourceId || "").toLowerCase();
                          const className = (meta.class || "").toLowerCase();

                          // DEBUG: See exactly what your app is reporting in the Console (F12)
                          console.log("Tap Metadata:", meta);

                          const isInput =
                            // Standard Checks
                            json.step?.isInputCandidate ||
                            meta.attributes?.editable === "true" ||
                            className.includes("edit") ||
                            className.includes("input") ||
                            resourceId.includes("search") ||
                            resourceId.includes("input") ||

                            // NEW: Aggressive Checks for Custom/Hybrid Apps
                            className.includes("webkit") || // WebViews
                            className === "android.view.view" || // Generic Views (React Native/Flutter)

                            // Fallback: If it has an ID but is NOT a layout or simple text label
                            (resourceId.length > 0 &&
                              !className.includes("layout") &&
                              !className.includes("textview") &&
                              !className.includes("button") &&
                              !className.includes("image"));

                          if (isInput) {
                            toast.info("Input Panel Opened");
                            setInputText("");
                            setInputCoords({ x: deviceX, y: deviceY });
                            setInputPending(false);
                            setShowInputPanel(true);
                          } else {
                            // OPTIONAL: Fallback if auto-detect STILL fails
                            // You can uncomment this to force it open on EVERY tap if needed:
                            // setInputCoords({ x: deviceX, y: deviceY });
                            // setShowInputPanel(true);
                          }
                        }
                      } catch (err: any) {
                        toast.error(err.message || "Interaction failed");
                      }
                      pressCoordsRef.current = null;
                    }}
                    onMouseLeave={() => {
                      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                      isDraggingRef.current = false;
                      pressCoordsRef.current = null;
                    }}
                    draggable={false}
                  />
                )}
              </div>
            )}
          </div>
        </div>
        <div className="lg:col-span-2 space-y-6">
          {mirrorActive && (
            <Collapsible open={showQuickStart} onOpenChange={setShowQuickStart} className="w-full">
              <Card className="bg-card/50 backdrop-blur-sm shadow-card hover:shadow-elegant rounded-xl overflow-hidden transition-all duration-300 border-border animate-in fade-in slide-in-from-right-4">
                <CollapsibleTrigger asChild>
                  <CardHeader className="py-2.5 px-4 border-b border-secondary/20 flex flex-row items-center justify-between cursor-pointer hover:bg-primary/[0.03] transition-colors">
                    <div className="flex flex-row items-baseline gap-2 flex-1 min-w-0">
                      <CardTitle className="flex items-center gap-2 text-base font-bold text-foreground">
                        <Terminal className="h-4 w-4 text-primary" />
                        Device Control
                      </CardTitle>
                      <span className="text-[12px] font-mono text-muted-foreground truncate opacity-70" title={selectedDevice?.name || selectedDevice?.device || "No Device Selected"}>
                        {selectedDevice?.name || selectedDevice?.device || "No Device Selected"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-[12px] font-bold uppercase tracking-wider text-primary">
                        <Wand2 className="h-3 w-3" />
                        {showQuickStart ? "Hide" : "Guide"}
                      </div>
                      <ChevronDown className={`h-3.5 w-3.5 text-primary transition-transform ${showQuickStart ? "rotate-180" : ""}`} />
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>

                {showQuickStart && (
                  <CollapsibleContent>
                    <div className="mx-4 mt-3 mb-6 space-y-6 animate-in fade-in slide-in-from-top-2 duration-500">
                      <div className="relative space-y-5">
                        {/* Vertical line connecting steps */}
                        <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-primary/30 via-primary/10 to-transparent" />

                        {/* Step 1: Ready Your App */}
                        <div className="relative flex items-start gap-4 group">
                          <div className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-background text-[10px] font-bold text-primary shadow-sm transition-transform group-hover:scale-110">
                            1
                          </div>
                          <div className="flex-1 space-y-1.5 pb-2">
                            <h4 className="text-sm font-bold leading-none tracking-tight text-foreground/90">Ready Your App</h4>
                            <div className="rounded-lg border border-primary/10 bg-primary/5 p-3">
                              <p className="text-[11px] text-muted-foreground leading-relaxed">
                                Use <b>Package Control</b> to select your app. If it's missing, upload the APK and install it. Use <span className="text-primary/80 font-medium">Wipe Data</span> for a clean test state.
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Step 2: Start Capturing */}
                        <div className="relative flex items-start gap-4 group">
                          <div className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-background text-[10px] font-bold text-primary shadow-sm transition-transform group-hover:scale-110">
                            2
                          </div>
                          <div className="flex-1 space-y-1.5 pb-2">
                            <h4 className="text-sm font-bold leading-none tracking-tight text-foreground/90">Start Capturing</h4>
                            <div className="rounded-lg border border-primary/10 bg-primary/5 p-3">
                              <p className="text-[11px] text-muted-foreground leading-relaxed">
                                Toggle <span className="text-primary font-bold">Start Capture: ON</span> to enable interaction. Click <span className="text-primary font-bold">Initiate Recording</span>—every tap, scroll, and key press will be captured in real-time.
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Step 3: Validate & Finish */}
                        <div className="relative flex items-start gap-4 group">
                          <div className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-background text-[10px] font-bold text-primary shadow-sm transition-transform group-hover:scale-110">
                            3
                          </div>
                          <div className="flex-1 space-y-1.5">
                            <h4 className="text-sm font-bold leading-none tracking-tight text-foreground/90">Validate & Finish</h4>
                            <div className="rounded-lg border border-primary/10 bg-primary/5 p-3">
                              <p className="text-[11px] text-muted-foreground leading-relaxed">
                                Add <b>Assertions</b> to verify screen state. Click <span className="text-destructive font-bold">Stop Test</span> when done to review your sequence, edit the script, or save the scenario to history.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Pro Tips Section */}
                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 shadow-sm">
                          <div className="flex items-center gap-2 mb-2">
                            <Wand2 className="h-3.5 w-3.5 text-amber-600" />
                            <span className="text-[10px] font-black uppercase tracking-wider text-amber-700">Pro Tip</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground leading-snug">
                            Use the <b>Undo</b> button to instantly remove accidental actions without stopping the recording.
                          </p>
                        </div>
                        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 shadow-sm">
                          <div className="flex items-center gap-2 mb-2">
                            <Terminal className="h-3.5 w-3.5 text-indigo-600" />
                            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700">Shortcuts</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground leading-snug">
                            The <b>Input Panel</b> is the best way to send verified text—avoid using the device keyboard when recording.
                          </p>
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                )}

                <CardContent className="p-0">
                  {/* --- TOP ROW: PACKAGE SELECTION & STATUS --- */}
                  <div className="p-3 border-b border-border/40 bg-muted/30">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        {installedPackages.length === 0 ? (
                          <div className="h-9 flex items-center justify-between px-3 border border-dashed border-muted-foreground/30 rounded-lg bg-background/50 text-[10px] text-muted-foreground">
                            <span>No apps detected</span>
                            <Button
                              variant="link"
                              className="h-auto p-0 text-[10px] text-primary font-bold hover:no-underline"
                              onClick={() => fileInputRef.current?.click()}
                            >
                              <Upload className="h-3 w-3 mr-1" />
                              Upload APK
                            </Button>
                          </div>
                        ) : (
                          <div className="relative group flex items-center gap-2">
                            <div className="relative flex-1">
                              <Package className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary" />
                              <Select
                                value={appPackage}
                                onValueChange={(val) => {
                                  setAppPackage(val);
                                  // Update Recently Used
                                  const recentStr = localStorage.getItem("mobile_recorder_recent_apps") || "[]";
                                  const recent = JSON.parse(recentStr);
                                  const updated = [val, ...recent.filter((id: string) => id !== val)].slice(0, 5);
                                  localStorage.setItem("mobile_recorder_recent_apps", JSON.stringify(updated));
                                }}
                              >
                                <SelectTrigger className="h-11 text-[12px] font-bold bg-background pl-9 border-border/80 shadow-md focus:ring-1 focus:ring-primary/30 rounded-lg group transition-all hover:bg-muted/30">
                                  <div className="flex flex-col items-start leading-tight truncate">
                                    <SelectValue placeholder="Choose App to Record" />
                                  </div>
                                </SelectTrigger>
                                <SelectContent className="max-h-[400px]">
                                  {/* RENDER SORTED LIST */}
                                  {(() => {
                                    const recentStr = localStorage.getItem("mobile_recorder_recent_apps") || "[]";
                                    const recentIds = JSON.parse(recentStr);

                                    // Sort Alphabetical by Friendly Name
                                    const sorted = [...installedPackages].sort((a, b) => {
                                      const nameA = getAppFriendlyName(a).toLowerCase();
                                      const nameB = getAppFriendlyName(b).toLowerCase();
                                      return nameA < nameB ? -1 : 1;
                                    });

                                    // Move recent apps to top
                                    const final = [
                                      ...sorted.filter(pkg => recentIds.includes(pkg)),
                                      ...sorted.filter(pkg => !recentIds.includes(pkg))
                                    ];

                                    return final.map((pkg) => (
                                      <SelectItem key={pkg} value={pkg} className="py-2.5 px-3 focus:bg-primary/10 transition-colors">
                                        <div className="flex flex-col gap-0.5">
                                          <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-foreground">{getAppFriendlyName(pkg)}</span>
                                            {recentIds.includes(pkg) && (
                                              <Badge variant="outline" className="h-3.5 px-1 text-[8px] font-black uppercase text-primary border-primary/20 bg-primary/5">Recent</Badge>
                                            )}
                                          </div>
                                          <span className="text-[10px] font-mono text-muted-foreground font-medium opacity-90">{pkg}</span>
                                        </div>
                                      </SelectItem>
                                    ));
                                  })()}
                                </SelectContent>
                              </Select>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 border border-dashed border-border/60 hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-primary transition-all rounded-lg"
                              onClick={() => fileInputRef.current?.click()}
                              title="Upload New APK (Update/Reinstall)"
                            >
                              <Upload className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 shrink-0 border-border/60 hover:bg-background hover:text-primary shadow-sm transition-colors"
                        onClick={refreshAppPackages}
                        disabled={loadingPackages}
                        title="Refresh App List"
                      >
                        <RefreshCw className={`h-4 w-4 text-muted-foreground ${loadingPackages ? "animate-spin" : ""}`} />
                      </Button>
                    </div>
                  </div>

                  {/* --- MIDDLE: TABBED CONTROL CENTER --- */}
                  {/* --- MIDDLE: UNIFIED CONTROL CENTER (No Tabs) --- */}
                  <div className="p-3 space-y-4">

                    {/* 1. SYSTEM NAVIGATION (Top Row) */}
                    {/* 1. SYSTEM NAVIGATION (Top Row) */}
                    <div className="space-y-4 px-1" id="system-navigation-tools">
                      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2 mb-3 px-1">
                        <Smartphone className="h-3 w-3" /> System Navigation
                      </div>
                      <div className="grid grid-cols-4 gap-3">
                        <Button
                          variant="outline"
                          className="h-10 text-[10px] font-bold gap-2 bg-background hover:bg-accent/50 hover:text-primary border-border/60 group transition-all duration-300 rounded-lg shadow-sm hover:shadow-md"
                          onClick={() => handleKeyPress(4, "Back")}
                          title="Back Button"
                        >
                          <RotateCcw className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:-translate-x-0.5 transition-all" />
                          Back
                        </Button>
                        <Button
                          variant="outline"
                          className="h-10 text-[10px] font-bold gap-2 bg-background hover:bg-accent/50 hover:text-primary border-border/60 group transition-all duration-300 rounded-lg shadow-sm hover:shadow-md"
                          onClick={() => handleKeyPress(3, "Home")}
                          title="Home Button"
                        >
                          <Circle className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                          Home
                        </Button>
                        <Button
                          variant="outline"
                          className="h-10 text-[10px] font-bold gap-2 bg-background hover:bg-accent/50 hover:text-primary border-border/60 group transition-all duration-300 rounded-lg shadow-sm hover:shadow-md"
                          onClick={() => handleKeyPress(187, "Recents")}
                          title="Recent Apps"
                        >
                          <ListChecks className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                          Tasks
                        </Button>
                        <Button
                          variant="outline"
                          className="h-10 text-[10px] font-bold gap-2 bg-background hover:bg-accent/50 hover:text-amber-600 border-border/60 group transition-all duration-300 rounded-lg shadow-sm hover:shadow-md"
                          onClick={hideKeyboard}
                          title="Hide Soft Keyboard"
                        >
                          <Keyboard className="h-4 w-4 text-muted-foreground group-hover:text-amber-600 transition-colors" />
                          Hide KB
                        </Button>
                      </div>
                    </div>

                    <div className="h-px bg-border/40 w-full" />

                    {/* 2. CAPTURE & INTERACTION (Prominent) */}
                    <div id="interaction-tools" className="space-y-4 px-1">
                      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2 mb-3 px-1">
                        <MousePointer2 className="h-3 w-3" /> Interaction Tools
                      </div>
                      <div className="flex gap-4">
                        <Button
                          variant={captureMode ? "default" : "secondary"}
                          className={`h-11 flex-1 text-xs font-black tracking-widest gap-2.5 transition-all shadow-md rounded-lg ${captureMode ? 'bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-primary/20' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white border border-zinc-700/50 checkbox-strong'}`}
                          onClick={() => setCaptureMode(!captureMode)}
                        >
                          <MousePointer2 className={`h-4 w-4 ${captureMode ? 'animate-bounce' : ''}`} />
                          {captureMode ? "CAPTURE ACTIVE" : "START CAPTURE"}
                        </Button>
                        <Button
                          variant="outline"
                          className="h-11 flex-1 text-[11px] font-bold tracking-widest gap-2 bg-background border-border/60 text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 rounded-lg shadow-sm hover:shadow-md transition-all"
                          onClick={handleUndo}
                          title="Undo Last Action"
                        >
                          <RotateCcw className="h-4 w-4" />
                          UNDO LAST
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <Button variant="outline" className="h-10 text-[10px] font-bold bg-background border-dashed hover:bg-blue-500/5 hover:text-blue-600 hover:border-blue-200 group rounded-lg shadow-sm hover:shadow-md transition-all" onClick={() => setShowInputPanel(!showInputPanel)}>
                          <Type className="h-4 w-4 mr-2 text-muted-foreground group-hover:text-blue-500 transition-colors" /> Input
                        </Button>
                        <Button
                          variant="outline"
                          className="h-10 text-[10px] font-bold bg-background border-dashed hover:bg-amber-500/5 hover:text-amber-600 hover:border-amber-200 group rounded-lg shadow-sm hover:shadow-md transition-all"
                          onClick={() => {
                            if (!recording || isPaused) {
                              toast.warning("Start recording first");
                              return;
                            }

                            // FIX: Add step directly to local state (Bypass server)
                            const waitStep: RecordedAction = {
                              id: crypto.randomUUID(),
                              type: "wait",
                              description: "Wait (2s)",
                              value: "2000",
                              locator: "system",
                              timestamp: Date.now(),
                              enabled: true
                            };

                            setActions(prev => [...prev, waitStep]);
                            toast.info("Added Wait");
                          }}
                        >
                          <Clock className="h-4 w-4 mr-2 text-muted-foreground group-hover:text-amber-500 transition-colors" /> Wait
                        </Button>
                      </div>
                      {/* Find the div with "grid grid-cols-2" around line 1836 and REPLACE it with this: */}
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <Button
                          variant="ghost"
                          className="h-10 text-[10px] font-bold bg-background/50 border border-border/30 hover:bg-accent hover:text-primary rounded-lg shadow-sm transition-all"
                          onClick={() => handleDirectionalSwipe("up")}
                        >
                          <ChevronUp className="h-4 w-4 mr-2" /> Swipe Up
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-10 text-[10px] font-bold bg-background/50 border border-border/30 hover:bg-accent hover:text-primary rounded-lg shadow-sm transition-all"
                          onClick={() => handleDirectionalSwipe("down")}
                        >
                          <ChevronDown className="h-4 w-4 mr-2" /> Swipe Down
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-10 text-[10px] font-bold bg-background/50 border border-border/30 hover:bg-accent hover:text-primary rounded-lg shadow-sm transition-all"
                          onClick={() => handleDirectionalSwipe("left")}
                        >
                          <ArrowLeft className="h-4 w-4 mr-2" /> Swipe Left
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-10 text-[10px] font-bold bg-background/50 border border-border/30 hover:bg-accent hover:text-primary rounded-lg shadow-sm transition-all"
                          onClick={() => handleDirectionalSwipe("right")}
                        >
                          <ArrowRight className="h-4 w-4 mr-2" /> Swipe Right
                        </Button>
                      </div>
                    </div>

                    <div className="h-px bg-border/40 w-full" />

                    {/* 3. APP MANAGEMENT */}
                    <div id="app-control-section" className="space-y-3">
                      <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2 mb-2">
                        <Package className="h-3.5 w-3.5" /> App Management
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          className="h-8 text-[10px] font-bold justify-start px-3 gap-2 border-primary/20 text-primary hover:bg-primary/5 hover:text-primary transition-colors"
                          onClick={handleOpenApp}
                          disabled={!appPackage}
                          title="Launch the selected app"
                        >
                          <Play className="h-3.5 w-3.5 fill-current" /> Launch App
                        </Button>
                        <Button
                          variant="outline"
                          className="h-8 text-[10px] font-bold justify-start px-3 gap-2 border-destructive/20 text-destructive/80 hover:bg-destructive/5 hover:text-destructive transition-colors"
                          onClick={handleStopApp}
                          disabled={!appPackage}
                          title="Force stop the selected app"
                        >
                          <Square className="h-3.5 w-3.5 fill-current" /> Force Stop
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          className="h-8 text-[10px] font-bold justify-start px-3 gap-2 hover:bg-amber-500/10 hover:text-amber-700 hover:border-amber-500/30"
                          onClick={handleClearApp}
                          disabled={!appPackage}
                        >
                          <Trash2 className="h-3.5 w-3.5 opacity-70" /> Clear Data
                        </Button>
                        <Button
                          variant="outline"
                          className="h-8 text-[10px] font-bold justify-start px-3 gap-2 hover:bg-blue-500/10 hover:text-blue-700 hover:border-blue-500/30"
                          onClick={handleClearCache}
                          disabled={!appPackage}
                        >
                          <RefreshCw className="h-3.5 w-3.5 opacity-70" /> Clear Cache
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <Button
                          variant="ghost"
                          className="h-8 text-[10px] font-bold justify-start px-2 gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive border border-transparent hover:border-destructive/20"
                          onClick={uninstallApp}
                          disabled={!appPackage}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Uninstall
                        </Button>
                        <Button variant="ghost" className="h-8 text-[10px] justify-start text-muted-foreground hover:text-foreground px-2" onClick={handleOpenAppSettings} disabled={!appPackage}>
                          <Settings className="h-3.5 w-3.5 mr-2" /> App Info
                        </Button>
                      </div>

                      {/* APK Upload (Persistent Workflow) */}
                      <div className="mt-2 pt-2 border-t border-dashed border-border/50 space-y-2">
                        <Button
                          variant="outline"
                          className="w-full h-8 text-[10px] font-bold border-dashed border-border/60 hover:bg-primary/5 hover:text-primary hover:border-primary/20 transition-all rounded-lg"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={apkUploading}
                        >
                          {apkUploading ? (
                            <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Upload className="mr-2 h-3.5 w-3.5" />
                          )}
                          {installedPackages.length > 0 ? "Upload APK (Update/New)" : "Upload APK"}
                        </Button>

                        {uploadedApk && (
                          <div className={`animate-in fade-in slide-in-from-top-1 duration-300 mt-3 rounded-xl border p-2 transition-colors ${
                            // CHANGE COLOR: Darker Green on Success
                            (uploadedApk as any).installed
                              ? "bg-emerald-500/10 border-emerald-500/30"
                              : "bg-green-500/5 border-green-500/20"
                            }`}>
                            <div className="flex items-center justify-between px-2 py-1 mb-2">
                              <span className={`text-[10px] font-medium truncate max-w-[200px] flex items-center gap-2 ${(uploadedApk as any).installed ? "text-emerald-700 dark:text-emerald-400" : "text-green-700 dark:text-green-400"
                                }`}>
                                {/* ICON CHANGE: Package -> Checkmark */}
                                {(uploadedApk as any).installed ? (
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                ) : (
                                  <Package className="h-3.5 w-3.5" />
                                )}

                                {/* TEXT CHANGE: Ready -> Installed */}
                                {(uploadedApk as any).installed ? (
                                  <span className="font-bold">Successfully Installed: {uploadedApk.name}</span>
                                ) : (
                                  <span>Ready: {uploadedApk.name}</span>
                                )}
                              </span>

                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 text-muted-foreground hover:bg-black/5 rounded-full"
                                onClick={() => setUploadedApk(null)}
                                title="Dismiss"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>

                            <Button
                              variant="default"
                              className={`w-full h-9 text-[10px] font-black uppercase tracking-widest shadow-md transition-all rounded-lg gap-2 ${
                                // BUTTON STYLE CHANGE: Disable and Darken on Success
                                (uploadedApk as any).installed
                                  ? "bg-emerald-600 hover:bg-emerald-600 opacity-90 cursor-default"
                                  : "bg-green-600 hover:bg-green-700"
                                }`}
                              onClick={(uploadedApk as any).installed ? undefined : installApk}
                              disabled={apkInstalling || (uploadedApk as any).installed}
                            >
                              {apkInstalling ? (
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              ) : (uploadedApk as any).installed ? (
                                <CheckCircle className="h-3.5 w-3.5 fill-current" />
                              ) : (
                                <Play className="h-3.5 w-3.5 fill-current" />
                              )}

                              {/* BUTTON TEXT CHANGE */}
                              {(uploadedApk as any).installed
                                ? "Installation Complete"
                                : (appPackage ? "Update Existing App" : "Install New APK")}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* --- BOTTOM: COMMAND BAR (Always Visible) --- */}
                  <div className="p-3 bg-muted/10 border-t border-border/40 backdrop-blur-sm" id="recording-dashboard">
                    {!recording ? (
                      <div className="flex gap-2">
                        <Button
                          onClick={startRecording}
                          disabled={!mirrorActive}
                          className="h-10 flex-1 text-[11px] font-black tracking-widest bg-primary hover:bg-primary/90 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all gap-2"
                        >
                          <div className="w-2 h-2 rounded-full bg-white animate-pulse shadow-sm" />
                          START RECORDING
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => replayActions(0)}
                          disabled={actions.length === 0 || replaying}
                          className="h-10 flex-1 text-[11px] font-black tracking-widest border-border/60 hover:bg-background shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all gap-2"
                        >
                          <RotateCcw className="h-4 w-4" />
                          REPLAY
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          variant={isPaused ? "default" : "outline"}
                          onClick={async () => {
                            try {
                              const endpoint = isPaused ? "/recording/resume" : "/recording/pause";
                              const res = await fetch(`${AGENT_URL}${endpoint}`, { method: "POST" });
                              if (res.ok) setIsPaused(!isPaused);
                            } catch (err) { }
                          }}
                          className={`h-10 flex-1 text-[11px] font-black tracking-widest transition-all gap-2 ${isPaused ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md' : 'border-amber-500/50 text-amber-600 hover:bg-amber-50/50'}`}
                        >
                          {isPaused ? <><Play className="h-4 w-4 fill-current" /> RESUME</> : <><Pause className="h-4 w-4 fill-current" /> PAUSE</>}
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={stopRecording}
                          className="h-10 flex-1 text-[11px] font-black tracking-widest shadow-md hover:shadow-lg hover:bg-destructive/90 transition-all gap-2"
                        >
                          <Square className="h-4 w-4 fill-current" /> STOP
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Collapsible>
          )}
          {showInputPanel && (
            <Card className="bg-card/95 backdrop-blur-md shadow-xl border-primary/20 border-2 rounded-xl overflow-hidden animate-in slide-in-from-top-4 mb-4 z-50">
              <CardHeader className="py-2.5 px-4 flex flex-row items-center justify-between bg-primary/5 border-b border-primary/10">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-primary/20 rounded-md">
                    <Type className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="flex flex-col">
                    <CardTitle className="text-xs font-bold text-foreground">Text Input</CardTitle>
                    {inputCoords && (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        Target: ({inputCoords.x}, {inputCoords.y})
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive rounded-full"
                  onClick={() => setShowInputPanel(false)}
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="py-4 px-4 flex gap-3 items-start">
                <div className="flex-1 space-y-2">
                  <Input
                    value={inputText}
                    onChange={(e: any) => setInputText(e.target.value)}
                    placeholder="Type text to send..."
                    className="h-10 font-medium text-sm focus-visible:ring-primary bg-background"
                    autoFocus={true}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConfirmInput();
                      if (e.key === 'Escape') setShowInputPanel(false);
                    }}
                  />
                  <div className="flex items-center justify-between px-1">
                    <p className="text-[10px] text-muted-foreground">Press <kbd className="font-mono bg-muted px-1 rounded border">Enter</kbd> to send</p>
                    {!inputCoords && <span className="text-[10px] text-amber-500 animate-pulse font-bold">Tap screen to set target</span>}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Button
                    onClick={handleConfirmInput}
                    disabled={inputPending || !inputCoords || inputText.length === 0}
                    className="h-10 px-4 gap-2 font-bold shadow-sm bg-primary text-primary-foreground hover:bg-primary/90"
                    size="sm"
                  >
                    {inputPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                    Send
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full" id="actions-tabs">
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
              <Card className="bg-card/50 backdrop-blur-sm shadow-card hover:shadow-elegant rounded-xl overflow-hidden transition-all duration-300 border-border">
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
                            className={`group flex items-start gap-3 p-3 border rounded-lg transition-all duration-200 hover:shadow-sm ${replayIndex === i ? 'bg-primary/5 border-primary ring-1 ring-primary/20' : 'bg-muted/30 border-transparent hover:border-border hover:bg-muted/50'}`}
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
                                  {a.type === "tap" && <span title="Tap action - Click on screen element"><MousePointer2 className="h-3.5 w-3.5 text-blue-500" /></span>}
                                  {a.type === "input" && <span title="Text input - Enter text into field"><Type className="h-3.5 w-3.5 text-green-500" /></span>}
                                  {(a.type === "scroll" || a.type === "swipe") && <span title="Swipe/Scroll action - Navigate screen"><Move className="h-3.5 w-3.5 text-purple-500" /></span>}
                                  {a.type === "wait" && <span title="Wait/Delay - Pause execution"><Clock className="h-3.5 w-3.5 text-amber-500" /></span>}
                                  {a.type === "hideKeyboard" && <span title="Hide Keyboard"><Keyboard className="h-3.5 w-3.5 text-gray-500" /></span>}
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
                                        // FIX: Add step directly to local state instead of relying on fetch
                                        const waitStep: RecordedAction = {
                                          id: crypto.randomUUID(),
                                          type: "wait",
                                          description: "Wait",
                                          value: "3000",
                                          locator: "system",
                                          timestamp: Date.now(),
                                          enabled: true
                                        };
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
              <Card className="bg-card/50 backdrop-blur-sm shadow-card hover:shadow-elegant rounded-xl overflow-hidden transition-all duration-300 border-border">
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
                          {generatedScriptCache || generatedScript}

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
              <Card className="bg-card/50 backdrop-blur-sm shadow-card hover:shadow-elegant rounded-xl overflow-hidden transition-all duration-300 border-border">
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
                              className={`group relative overflow-hidden p-4 border rounded-lg transition-all duration-300 ${log.status === "error" ? "bg-destructive/5 border-destructive/20 shadow-sm" :
                                log.status === "running" ? "bg-primary/5 border-primary ring-1 ring-primary/10 shadow-md translate-x-1" :
                                  log.status === "success" ? "bg-green-500/5 border-green-500/20" :
                                    "bg-muted/30 border-transparent hover:border-border opacity-70 hover:opacity-100"
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
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept=".apk"
          className="hidden"
        />
      </div >
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