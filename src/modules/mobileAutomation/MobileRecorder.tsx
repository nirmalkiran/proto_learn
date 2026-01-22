import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { createClient } from "@supabase/supabase-js";
import { Play, Square, Trash2, RefreshCw, Copy, Download, Monitor, Smartphone, Wifi, WifiOff, Upload, Package, CheckCircle, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import DeviceSelector from "./DeviceSelector";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";


import { ActionType, RecordedAction, SelectedDevice } from "./types";

const AGENT_URL = "http://localhost:3001";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);

// Standard phone dimensions (portrait) - matches typical Android emulator
const DEVICE_WIDTH = 320;
const DEVICE_HEIGHT = 568;

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
  const [actions, setActions] = useState<RecordedAction[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [mirrorActive, setMirrorActive] = useState(false);
  const [mirrorImage, setMirrorImage] = useState<string | null>(null);
  const [mirrorError, setMirrorError] = useState<string | null>(null);
  const [mirrorLoading, setMirrorLoading] = useState(false);
  const [captureMode, setCaptureMode] = useState(false);
  const [deviceSize, setDeviceSize] = useState<{ width: number; height: number } | null>(null);
  const [inputModalOpen, setInputModalOpen] = useState(false);
  const [inputModalText, setInputModalText] = useState("");
  const [inputModalCoords, setInputModalCoords] = useState<{ x: number; y: number } | null>(null);
  const [appPackage, setAppPackage] = useState("");
  const [isAppInstalled, setIsAppInstalled] = useState<boolean | null>(null);
  const [checkingInstall, setCheckingInstall] = useState(false);
  const [inputModalPending, setInputModalPending] = useState(false);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const [previewPendingId, setPreviewPendingId] = useState<string | null>(null);
  const [replaying, setReplaying] = useState<boolean>(false);
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [nextStepTrigger, setNextStepTrigger] = useState<(() => void) | null>(null);

  // Script editor state
  const [isEditingScript, setIsEditingScript] = useState(false);
  const [editableScript, setEditableScript] = useState("");
  const [savedManualScript, setSavedManualScript] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const screenshotIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [uiXml, setUiXml] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [apkUploading, setApkUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [apkInstalling, setApkInstalling] = useState(false);
  const [uploadedApk, setUploadedApk] = useState<{ path: string; name: string } | null>(null);
  const [installedPackages, setInstalledPackages] = useState<string[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);

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

        // Handle replay progress events separately (do not add them as recorded actions)
        if (event.type && event.type.startsWith("replay")) {
          if (event.type === "replay:start") {
            setReplaying(true);
            toast.info(event.description);
          } else if (event.type === "replay:info") {
            toast.info(event.description);
          } else if (event.type === "replay:step:start") {
            setReplayIndex(typeof event.stepIndex === 'number' ? event.stepIndex : null);
            toast(`▶ ${event.description}`);
          } else if (event.type === "replay:step:done") {
            setReplayIndex(null);
            toast.success(event.description);
          } else if (event.type === "replay:finished") {
            setReplayIndex(null);
            setReplaying(false);
            toast.success(event.description);
          } else if (event.type === "replay:error" || event.type === "replay:step:error") {
            setReplaying(false);
            setReplayIndex(null);
            toast.error(event.description);
          } else if (event.type === "assertion-result") {
            // Handle assertion results from replay engine
            const { locator, expectedValue, success, error } = event;
            if (success) {
              toast.success(`Assertion passed: ${locator}`);
            } else {
              toast.error(`Assertion failed: ${locator} - ${error || 'Unknown error'}`);
            }
          }

          return;
        }

        if (event.type && event.description) {
          const newAction: RecordedAction = {
            id: crypto.randomUUID(),
            type: event.type as ActionType,
            description: event.description,
            locator: event.locator || "//android.view.View",
            value: event.value,
            enabled: true,
            coordinates: event.coordinates,
            timestamp: event.timestamp || Date.now(),
            // Map metadata
            elementId: event.elementMetadata?.resourceId,
            elementText: event.elementMetadata?.text,
            elementClass: event.elementMetadata?.class,
            elementContentDesc: event.elementMetadata?.contentDesc,
          };

          if (event.elementMetadata) {
            setSelectedNode(event.elementMetadata);
          }

          setActions((prev) => [...prev, newAction]);
          setSavedManualScript(null); // Invalidate manual edit when new step arrives
          if (recording) {
            toast.info(`Captured: ${newAction.description}`);
          }
        }
      } catch (err) {
        console.error("[MobileRecorder] Invalid event data:", err);
      }
    };

    source.onerror = (err) => {
      console.error("[MobileRecorder] SSE error:", err);
      setConnectionStatus("disconnected");
      source.close();
      eventSourceRef.current = null;

      // Attempt reconnection if still recording
      if (recording) {
        console.log("[MobileRecorder] Attempting reconnect in 3s...");
        reconnectTimeoutRef.current = setTimeout(() => {
          connectToEventStream();
        }, 3000);
      }
    };

    return source;
  }, [recording, captureMode]);

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
      const [health, appium, device, emulator] = await Promise.all([
        fetchJsonWithTimeout(`${AGENT_URL}/health`),
        fetchJsonWithTimeout(`${AGENT_URL}/appium/status`),
        fetchJsonWithTimeout(`${AGENT_URL}/device/check`),
        fetchJsonWithTimeout(`${AGENT_URL}/emulator/status`),
      ]);

      if (!health.ok) return null;

      const verified = {
        appium: Boolean(appium.json?.running),
        device: Boolean(device.json?.connected),
        emulator: Boolean(emulator.json?.running),
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
    const maxFails = 3;
    const intervalMs = 200; // desired interval between captures
    const timeoutMs = 5000; // fetch timeout

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
      // First check if local helper is running
      const healthRes = await fetch(`${AGENT_URL}/health`, {
        signal: AbortSignal.timeout(3000)
      }).catch(() => null);

      if (!healthRes?.ok) {
        setMirrorLoading(false);
        setMirrorError("Local helper not running. Run: cd tools/mobile-automation-helper && npm start");
        toast.error("Local helper not running");
        return;
      }

      // Verify current device status
      const statusRes = await fetch(`${AGENT_URL}/emulator/status`);
      const statusData = await statusRes.json();

      // If a DIFFERENT emulator is running, stop it first
      if (statusData.running && statusData.currentAvd && statusData.currentAvd !== selectedDevice.device) {
        toast.info(`Stopping previous emulator: ${statusData.currentAvd}...`);
        await stopEmulator();
        // Give it a moment to release ports/resources
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Verify device is connected (might need to start it if it's an emulator that wasn't running)
      let deviceRes = await fetch(`${AGENT_URL}/device/check`);
      let deviceData = await deviceRes.json();

      if (!deviceData.connected) {
        // If it's an emulator and not connected, try to start it
        if (!selectedDevice.real_mobile) {
          toast.info(`Starting emulator: ${selectedDevice.device}...`);
          const startRes = await fetch(`${AGENT_URL}/emulator/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ avd: selectedDevice.device }),
          });

          if (startRes.ok) {
            // Wait for it to show up in adb
            toast.info("Waiting for emulator to initialize...");
            await new Promise(resolve => setTimeout(resolve, 8000));
            deviceRes = await fetch(`${AGENT_URL}/device/check`);
            deviceData = await deviceRes.json();
          }
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

      // Start embedded screenshot streaming
      setMirrorActive(true);
      setMirrorLoading(false);
      startScreenshotStream();

      toast.success("Device connected", {
        description: "Live preview active - interact with your device",
      });
    } catch (err: any) {
      console.error("[connectDevice] Error:", err);
      setMirrorLoading(false);
      setMirrorError("Cannot connect to local helper. Run: npm start in tools/mobile-automation-helper");
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

      // Merge any steps from server that we might have missed
      if (data.steps && data.steps.length > 0) {
        const existingIds = new Set(actions.map((a) => a.timestamp));
        const newSteps = data.steps
          .filter((s: any) => !existingIds.has(s.timestamp))
          .map((s: any) => ({
            id: crypto.randomUUID(),
            type: s.type as ActionType,
            description: s.description,
            locator: s.locator,
            coordinates: s.coordinates,
            timestamp: s.timestamp,
          }));

        if (newSteps.length > 0) {
          setActions((prev) => [...prev, ...newSteps]);
        }
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

  const replay = async (isStepMode = false) => {
    const enabledActions = actions.filter(a => a.enabled !== false);
    if (!enabledActions.length) {
      toast.error("No enabled actions to replay");
      return;
    }

    try {
      setReplaying(true);

      if (isStepMode) {
        setDebugMode(true);
        for (let i = 0; i < enabledActions.length; i++) {
          setReplayIndex(i);
          const currentAction = enabledActions[i];

          // Wait for user to click "Next"
          await new Promise<void>((resolve) => {
            setNextStepTrigger(() => resolve);
          });

          toast.info(`Executing step ${i + 1}: ${currentAction.description}`);

          const res = await fetch(`${AGENT_URL}/recording/replay`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              deviceId: selectedDevice?.id || selectedDevice?.device,
              steps: [{
                type: currentAction.type,
                description: currentAction.description,
                locator: currentAction.locator,
                value: currentAction.value,
                coordinates: currentAction.coordinates,
                timestamp: currentAction.timestamp,
                elementId: currentAction.elementId,
                elementText: currentAction.elementText,
                elementClass: currentAction.elementClass,
                elementContentDesc: currentAction.elementContentDesc,
              }],
            }),
          });

          if (!res.ok) throw new Error("Step failed");
        }
        setDebugMode(false);
        setNextStepTrigger(null);
      } else {
        const res = await fetch(`${AGENT_URL}/recording/replay`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deviceId: selectedDevice?.id || selectedDevice?.device,
            steps: enabledActions.map((a) => ({
              type: a.type,
              description: a.description,
              locator: a.locator,
              value: a.value,
              coordinates: a.coordinates,
              timestamp: a.timestamp,
              elementId: a.elementId,
              elementText: a.elementText,
              elementClass: a.elementClass,
              elementContentDesc: a.elementContentDesc,
            })),
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Replay request failed");
        }
      }

      toast.success("Replay completed");
      setReplaying(false);
      setReplayIndex(null);
      await saveExecutionToHistory("SUCCESS");
    } catch (err) {
      console.error("[MobileRecorder] Replay error:", err);
      setReplaying(false);
      setReplayIndex(null);
      setDebugMode(false);
      toast.error("Replay failed");
      await saveExecutionToHistory("FAILED");
    }
  };

  /** Save execution to history */
  const saveExecutionToHistory = async (status: "SUCCESS" | "FAILED") => {
    try {
      const { error } = await supabase
        .from("nocode_suite_executions")
        .insert({
          suite_id: "mobile-no-code-project",
          status: status,
          started_at: new Date().toISOString(),
          passed_tests: status === "SUCCESS" ? 1 : 0,
          failed_tests: status === "FAILED" ? 1 : 0,
          total_tests: 1,
          user_id: (await supabase.auth.getUser()).data.user?.id || "",
        });

      if (error) {
        console.error("[MobileRecorder] Failed to save history:", error);
      }
    } catch (err) {
      console.error("[MobileRecorder] Unexpected error saving history:", err);
    }
  };

  /* =====================================================
   * GENERATED SCRIPT (APPIUM STYLE)
   * ===================================================== */

  const generatedScript = useMemo(() => {
    // If a manual script was saved and we haven't recorded new steps since then, return it.
    if (savedManualScript) return savedManualScript;

    const enabledActions = actions.filter(a => a.enabled !== false);
    if (!enabledActions.length) return "";

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

            case "scroll":
              if (a.coordinates) {
                javaCode = `// Scroll/Swipe action
            driver.executeScript("mobile: scrollGesture", java.util.Map.of(
                "left", ${a.coordinates.x}, "top", ${a.coordinates.y},
                "width", 200, "height", 200,
                "direction", "down",
                "percent", 1.0
            ));`;
              } else {
                javaCode = `// scroll action (coordinates not captured)`;
              }
              break;

            case "wait":
              javaCode = `Thread.sleep(1000);`;
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

  /* =====================================================
   * 💾 SAVE EDITED SCRIPT (SYNC BACK TO ACTIONS)
   * ===================================================== */

  const handleSaveScript = () => {
    try {
      // Split script into steps based on "// Step N:" comments
      const steps = editableScript.split(/\/\/ Step \d+:/).slice(1);

      const newActions = actions.map((action, index) => {
        if (index >= steps.length) return action;

        const stepContent = steps[index];
        const updatedAction = { ...action };

        // 1. Extract Description from comment if changed
        const descMatch = stepContent.match(/\s*([^\r\n]+)/);
        if (descMatch && descMatch[1]) {
          updatedAction.description = descMatch[1].trim();
        }

        // 2. Extract locator
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

        // 3. Extract input value
        const inputMatch = stepContent.match(/\.sendKeys\("([^"]+)"\)/);
        if (inputMatch) {
          updatedAction.value = inputMatch[1];
        }

        // 4. Extract coordinates
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
      setSavedManualScript(editableScript); // Persist exact string
      setIsEditingScript(false);
      toast.success("Script saved and synced with actions");
    } catch (err) {
      console.error("[handleSaveScript] Error:", err);
      toast.error("Failed to parse and save script");
    }
  };

  const startEditingScript = () => {
    // If we have a saved manual script, edit that. Otherwise edit the auto-generated one.
    setEditableScript(savedManualScript || generatedScript);
    setIsEditingScript(true);
  };

  /* =====================================================
   * COPY SCRIPT TO CLIPBOARD
   * ===================================================== */

  const copyScript = () => {
    navigator.clipboard.writeText(generatedScript);
    toast.success("Script copied to clipboard");
  };

  /* =====================================================
   * DOWNLOAD SCRIPT
   * ===================================================== */

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

  // Input modal confirm handler
  const handleConfirmInput = async () => {
    if (!inputModalCoords) return setInputModalOpen(false);
    if (!inputModalText || String(inputModalText).trim().length === 0) {
      // If empty, just close (original prompt allowed skipping)
      setInputModalOpen(false);
      return;
    }

    try {
      setInputModalPending(true);
      const r = await fetch(`${AGENT_URL}/device/input`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x: inputModalCoords.x, y: inputModalCoords.y, text: inputModalText }),
      });

      if (!r.ok) {
        const jj = await r.json().catch(() => ({}));
        toast.error(jj.error || "Failed to input text");
      } else {
        toast.success("Text input captured");

        // Update the last tap action to be an "input" action
        setActions(prev => {
          if (prev.length === 0) return prev;
          const lastIndex = prev.length - 1;
          const lastAction = prev[lastIndex];

          if (lastAction.type === "tap") {
            const updated = [...prev];
            updated[lastIndex] = {
              ...lastAction,
              type: "input",
              value: inputModalText,
              description: `Input "${inputModalText}" at (${lastAction.coordinates?.x}, ${lastAction.coordinates?.y})`
            };
            return updated;
          }
          return prev;
        });
        setSavedManualScript(null); // Invalidate manual edit when state updates
      }
    } catch (err) {
      console.error("Input post failed:", err);
      toast.error("Failed to input text");
    } finally {
      setInputModalPending(false);
      setInputModalOpen(false);
      setInputModalText("");
      setInputModalCoords(null);
    }
  };

  // Preview input value on device for a given step (or edited value)
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

  /* =====================================================
   * LOAD UI HIERARCHY
   * ===================================================== */

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

  /* =====================================================
   * APK UPLOAD
   * ===================================================== */

  const uploadApk = async (file: File) => {
    if (!file) {
      toast.error("Please select an APK file");
      return;
    }

    // Validate file type
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
        setUploadedApk({ path: data.apkPath, name: data.originalName });
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

  /* =====================================================
   * APK INSTALL
   * ===================================================== */

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
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
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
          setUploadedApk({ path: data.path, name: data.name });
          toast.success("APK uploaded successfully. Ready to install.");
        } else {
          throw new Error(data.error || "Upload failed");
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      toast.error(err.message || "Failed to upload APK");
    } finally {
      setApkUploading(false);
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
    try {
      const res = await fetch(`${AGENT_URL}/app/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageName: appPackage }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`Stopped ${appPackage}`);
      } else {
        throw new Error(data.error || "Failed to stop app");
      }
    } catch (err: any) {
      toast.error(err.message);
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
      const data = await res.json();
      if (data.success && data.packages) {
        setInstalledPackages(data.packages);
      }
    } catch (err) {
      console.error("Failed to fetch installed packages:", err);
    } finally {
      setLoadingPackages(false);
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

        // Record as a step if recording is ON
        if (recording) {
          const newAction: RecordedAction = {
            id: crypto.randomUUID(),
            type: "openApp" as ActionType,
            description: `Launch app: ${appPackage}`,
            locator: appPackage,
            value: appPackage,
            enabled: true,
            timestamp: Date.now(),
          };
          setActions((prev) => [...prev, newAction]);
        }
      } else {
        throw new Error(data.error || "Failed to launch app");
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  /* =====================================================
   * UI
   * ===================================================== */

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-bold">Mobile Recorder</h2>
          <p className="text-sm text-muted-foreground">
            Record actions on local emulator or device
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
            <span className="text-sm font-medium whitespace-nowrap">Selected Device:</span>
            <div className="flex items-center gap-2">
              <DeviceSelector
                onSelect={setSelectedDevice}
                selectedDeviceFromSetup={selectedDeviceFromSetup}
                disabled={!!selectedDeviceFromSetup}
              />
            </div>
          </div>
          {recording && (
            <Badge
              variant={connectionStatus === "connected" ? "default" : "secondary"}
              className="animate-pulse"
            >
              {connectionStatus === "connected" ? "Recording" : "Connecting..."}
            </Badge>
          )}

          {/* Input capture dialog (replaces blocking prompt) */}
          <Dialog open={inputModalOpen} onOpenChange={setInputModalOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Enter text to input</DialogTitle>
                <div className="sr-only">Provide text for the recorded input step</div>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                <Input value={inputModalText} onChange={(e: any) => setInputModalText(e.target.value)} placeholder="Type text to send to device" />
                <div className="text-xs text-muted-foreground">Leave empty to skip</div>
              </div>

              <DialogFooter>
                <div className="flex gap-2">
                  <Button onClick={() => { setInputModalOpen(false); setInputModalText(""); }}>Cancel</Button>
                  <Button onClick={handleConfirmInput} disabled={inputModalPending}>
                    {inputModalPending ? "Sending..." : "Send"}
                  </Button>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>



      {/* MAIN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* DEVICE PREVIEW */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                Device Preview
              </CardTitle>
              {mirrorActive && (
                <Badge variant="default" className="animate-pulse">
                  <Monitor className="h-3 w-3 mr-1" />
                  Mirror Active
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div
              className="border-4 border-foreground/20 rounded-[2rem] overflow-hidden bg-black mx-auto relative"
              style={{
                width: mirrorActive ? 'auto' : 'min(100%, 320px)',
                height: mirrorActive ? 'auto' : 'min(calc(100vw * 0.568), 568px)',
                maxWidth: mirrorActive ? 'none' : '320px',
                maxHeight: mirrorActive ? 'none' : '568px',
                boxShadow: "0 0 0 2px hsl(var(--foreground)/0.1), 0 10px 40px rgba(0,0,0,0.3)"
              }}
            >
              {/* Notch */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-6 bg-black rounded-b-xl z-10" />

              {/* Screen Content */}
              <div className="w-full h-full flex flex-col items-center justify-center bg-muted/10 overflow-hidden">
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
                      className={`w-full h-full object-contain ${captureMode ? 'cursor-pointer ring-2 ring-offset-2 ring-primary/40' : ''}`}
                      onClick={async (e) => {
                        if (!captureMode) return;
                        const el = e.currentTarget as HTMLImageElement;
                        const rect = el.getBoundingClientRect();
                        const clickX = e.clientX - rect.left;
                        const clickY = e.clientY - rect.top;

                        const imgWidth = rect.width;
                        const imgHeight = rect.height;

                        const dev = deviceSize;
                        try {
                          if (!dev) {
                            const sizeRes = await fetch(`${AGENT_URL}/device/size`);
                            const sizeJson = await sizeRes.json();
                            if (sizeJson.success && sizeJson.size) setDeviceSize(sizeJson.size);
                          }
                        } catch { }

                        const finalDev = deviceSize || { width: 1080, height: 1920 }; // Default to standard 1080p

                        const devW = finalDev.width || 1080;
                        const devH = finalDev.height || 1920;

                        const deviceX = Math.round((clickX / imgWidth) * devW);
                        const deviceY = Math.round((clickY / imgHeight) * devH);

                        try {
                          const res = await fetch(`${AGENT_URL}/device/tap`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ x: deviceX, y: deviceY }),
                          });

                          const json = await res.json().catch(() => ({}));

                          if (res.ok && json.step) {
                            toast.success("Captured step");

                            if (json.step.elementMetadata) {
                              setSelectedNode(json.step.elementMetadata);
                            }

                            // If this element looks like an input, prompt user to enter text
                            if (json.step.isInputCandidate) {
                              // Open non-blocking modal to collect input text
                              setInputModalText(""); // Clear first
                              setInputModalCoords({ x: deviceX, y: deviceY });
                              setInputModalPending(false);
                              setInputModalOpen(true);
                            }

                          } else {
                            toast.error(json.error || "Failed to capture");
                          }
                        } catch (err) {
                          console.error("Tap failed:", err);
                          toast.error("Failed to send tap to device");
                        }
                      }}
                    />

                    {/* Debug Mode Overlay */}
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

            {/* Control buttons */}
            <div className="mt-4 flex flex-col gap-4">
              {mirrorActive && (
                <div className="space-y-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase text-muted-foreground px-1">App Controls</h4>
                      <Badge variant="outline" className="text-[10px] h-4">Production State</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" size="sm" onClick={handleClearApp} className="text-xs">
                        <Trash2 className="mr-2 h-3 w-3" />
                        Clear Data
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleStopApp} className="text-xs">
                        <Square className="mr-2 h-3 w-3" />
                        Force Stop
                      </Button>
                    </div>

                    {/* Show install button when APK is uploaded, regardless of appPackage state */}
                    {uploadedApk && !isAppInstalled ? (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md border border-dashed">
                          <Package className="h-4 w-4 text-blue-500" />
                          <span className="text-xs font-mono truncate flex-1">{uploadedApk.name}</span>
                        </div>
                        <Button
                          variant="default"
                          size="sm"
                          className="w-full text-xs bg-green-600 hover:bg-green-700"
                          onClick={installApk}
                          disabled={apkInstalling}
                        >
                          {apkInstalling ? (
                            <RefreshCw className="mr-2 h-3 w-3 animate-spin" />
                          ) : (
                            <Package className="mr-2 h-3 w-3" />
                          )}
                          {apkInstalling ? "Installing..." : "Install APK"}
                        </Button>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 text-xs"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            Change APK
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-muted-foreground"
                            onClick={() => setUploadedApk(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                        <input type="file" accept=".apk" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                      </div>
                    ) : !appPackage ? (
                      // When blank: Show app selector + Upload APK option
                      <div className="flex flex-col gap-2">
                        <Select value={appPackage} onValueChange={setAppPackage}>
                          <SelectTrigger className="h-8 text-xs font-mono">
                            <SelectValue placeholder="Select installed app..." />
                          </SelectTrigger>
                          <SelectContent>
                            {loadingPackages && (
                              <div className="px-2 py-1 text-xs text-muted-foreground">
                                Loading apps...
                              </div>
                            )}

                            {!loadingPackages && installedPackages.length === 0 && (
                              <div className="px-2 py-1 text-xs text-muted-foreground">
                                No apps found
                              </div>
                            )}

                            {!loadingPackages &&
                              installedPackages.map((pkg) => (
                                <SelectItem
                                  key={pkg}
                                  value={pkg}
                                  className="font-mono text-xs"
                                >
                                  {pkg}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>

                        <div className="text-[10px] text-center text-muted-foreground">— or —</div>

                        <input type="file" accept=".apk" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={apkUploading}
                        >
                          {apkUploading ? (
                            <RefreshCw className="mr-2 h-3 w-3 animate-spin" />
                          ) : (
                            <Upload className="mr-2 h-3 w-3" />
                          )}
                          {apkUploading ? "Uploading..." : "Upload External APK"}
                        </Button>
                      </div>
                    ) : isAppInstalled === false ? (
                      // When package entered but not installed: Show install flow
                      <div className="flex flex-col gap-2">
                        <input
                          type="file"
                          accept=".apk"
                          ref={fileInputRef}
                          className="hidden"
                          onChange={handleFileUpload}
                        />
                        <Button
                          variant={uploadedApk ? "outline" : "default"}
                          size="sm"
                          className={`w-full text-xs ${!uploadedApk ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                          onClick={() => fileInputRef.current?.click()}
                          disabled={apkInstalling || apkUploading}
                        >
                          {apkUploading ? (
                            <RefreshCw className="mr-2 h-3 w-3 animate-spin" />
                          ) : (
                            <Upload className="mr-2 h-3 w-3" />
                          )}
                          {apkUploading ? "Uploading..." : "Upload APK to Install"}
                        </Button>
                      </div>
                    ) : (
                      // When package entered and installed: Show open button
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full text-xs"
                        onClick={handleOpenApp}
                        disabled={checkingInstall}
                      >
                        <Smartphone className="mr-2 h-3 w-3" />
                        {checkingInstall ? "Checking..." : "Open App"}
                      </Button>
                    )}

                    <Input
                      placeholder="App Package (e.g. com.example.app)"
                      value={appPackage}
                      onChange={(e: any) => setAppPackage(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>

                  <div className="h-[1px] bg-border my-2" />

                  <div className="flex flex-col gap-2">
                    <Button
                      variant={captureMode ? "default" : "outline"}
                      onClick={() => setCaptureMode(!captureMode)}
                    >
                      {captureMode ? "Capture ON" : "Capture OFF"}
                    </Button>
                    {!recording ? (
                      <div className="grid grid-cols-1 gap-2">
                        <Button onClick={startRecording} disabled={!mirrorActive} className="w-full">
                          <Play className="mr-2 h-4 w-4" />
                          Start Recording
                        </Button>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            variant="outline"
                            onClick={() => replay(false)}
                            disabled={actions.length === 0 || replaying}
                          >
                            <Play className="mr-2 h-4 w-4" />
                            {replaying && !debugMode ? "Replaying..." : "Replay"}
                          </Button>

                          <Button
                            variant="secondary"
                            onClick={() => replay(true)}
                            disabled={actions.length === 0 || replaying}
                          >
                            <Smartphone className="mr-2 h-4 w-4" />
                            Step Replay
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button variant="destructive" onClick={stopRecording} className="w-full">
                        <Square className="mr-2 h-4 w-4" />
                        Stop Recording
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Connection controls */}
            {mirrorActive && (
              <div className="mt-4 flex items-center justify-between w-full">
                <Button className="w-full" variant="destructive" onClick={disconnectDevice}>
                  <WifiOff className="h-4 w-4 mr-2" />
                  Disconnect Device
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ACTIONS + SCRIPT */}
        <div className="lg:col-span-2 space-y-6">
          {/* CAPTURED ACTIONS */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>
                Captured Actions{" "}
                <Badge variant="secondary">{actions.length}</Badge>
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={refreshSteps}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {actions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No actions recorded yet</p>
                  <p className="text-xs mt-1">
                    Start recording and interact with your device
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[200px]">
                  {actions.map((a, i) => (
                    <div
                      key={a.id}
                      className={`flex justify-between items-center p-2 border rounded mb-2 hover:bg-muted/50 ${replayIndex === i ? 'bg-yellow-50 border-yellow-200' : ''}`}
                    >
                      <div className="flex-1">
                        <span className="font-medium">
                          {i + 1}. {a.description}
                        </span>
                        {a.coordinates && (
                          <span className="text-xs text-muted-foreground ml-2">
                            ({a.coordinates.x}, {a.coordinates.y})
                          </span>
                        )}
                        {a.elementId && (
                          <Badge variant="outline" className="text-[10px] ml-2 h-4 px-1 border-blue-500/30 text-blue-500 font-mono">
                            ID: {a.elementId.split('/').pop()}
                          </Badge>
                        )}
                        {a.elementText && (
                          <Badge variant="outline" className="text-[10px] ml-2 h-4 px-1 border-green-500/30 text-green-500">
                            TXT: "{a.elementText.length > 15 ? a.elementText.substring(0, 15) + '...' : a.elementText}"
                          </Badge>
                        )}
                        <p className="text-xs text-muted-foreground truncate max-w-md">
                          {a.locator}
                        </p>

                        {/* Inline edit for input actions */}
                        {a.type === "input" && (
                          <div className="mt-2 flex items-center gap-2">
                            {editingStepId === a.id ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  value={editingValue}
                                  onChange={(e: any) => setEditingValue(e.target.value)}
                                  onKeyDown={(e: any) => {
                                    if (e.key === "Enter") {
                                      // save
                                      setActions((prev) =>
                                        prev.map((p) =>
                                          p.id === a.id ? { ...p, value: editingValue } : p
                                        )
                                      );
                                      setEditingStepId(null);
                                      setEditingValue("");
                                      toast.success("Step value updated");
                                    }
                                    if (e.key === "Escape") {
                                      setEditingStepId(null);
                                      setEditingValue("");
                                    }
                                  }}
                                  placeholder="Enter value for this step"
                                  className="max-w-xs"
                                />
                                <Button size="sm" onClick={() => {
                                  setActions((prev) => prev.map((p) => p.id === a.id ? { ...p, value: editingValue } : p));
                                  setEditingStepId(null);
                                  setEditingValue("");
                                  toast.success("Step value updated");
                                }}>Save</Button>
                                <Button size="sm" variant="ghost" onClick={() => { setEditingStepId(null); setEditingValue(""); }}>Cancel</Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="text-sm text-muted-foreground">
                                  {a.value ? (
                                    <span className="font-mono">"{a.value}"</span>
                                  ) : (
                                    <em className="text-xs">(no value)</em>
                                  )}
                                </div>

                                <Button size="sm" variant="outline" disabled={!a.value || previewPendingId === a.id} onClick={() => previewInput(a)}>
                                  {previewPendingId === a.id ? 'Sending...' : 'Preview'}
                                </Button>

                                <Button size="sm" onClick={() => { setEditingStepId(a.id); setEditingValue(a.value || ""); }}>
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant={a.enabled === false ? "outline" : "secondary"}
                                  onClick={() =>
                                    setActions(prev =>
                                      prev.map(p =>
                                        p.id === a.id ? { ...p, enabled: !p.enabled } : p
                                      )
                                    )
                                  }
                                >
                                  {a.enabled === false ? "Disabled" : "Enabled"}
                                </Button>

                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          setActions((prev) =>
                            prev.filter((x) => x.id !== a.id)
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          {/* GENERATED SCRIPT */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Generated Script</CardTitle>
              {generatedScript && (
                <div className="flex gap-2">
                  {!isEditingScript ? (
                    <>
                      <Button variant="outline" size="sm" onClick={startEditingScript}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={copyScript}>
                        <Copy className="h-4 w-4 mr-1" />
                        Copy
                      </Button>
                      <Button variant="ghost" size="sm" onClick={downloadScript}>
                        <Download className="h-4 w-4 mr-1" />
                        Download
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="default" onClick={handleSaveScript}>
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setIsEditingScript(false)}>
                        Cancel
                      </Button>
                    </>
                  )}
                </div>
              )}
            </CardHeader>
            <CardContent>
              {generatedScript ? (
                <ScrollArea className="h-[300px]">
                  {isEditingScript ? (
                    <textarea
                      value={editableScript}
                      onChange={(e) => setEditableScript(e.target.value)}
                      className="w-full h-[400px] bg-black text-green-400 p-4 rounded text-xs font-mono border-none focus:ring-1 focus:ring-primary overflow-y-auto"
                      spellCheck={false}
                    />
                  ) : (
                    <pre className="bg-black text-green-400 p-4 rounded text-xs overflow-x-auto font-mono">
                      {generatedScript}
                    </pre>
                  )}
                </ScrollArea>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Script will appear after recording</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* UI HIERARCHY AND LOCATORS */}
      <div className="grid grid-cols-2 gap-6 mt-6">
        {/* LEFT – UI TREE */}
        <Card>
          <CardHeader className="flex flex-row justify-between items-center">
            <CardTitle>UI Hierarchy</CardTitle>
            <Button size="sm" onClick={loadUiHierarchy}>
              Refresh
            </Button>
          </CardHeader>
          <CardContent className="text-sm font-mono">
            {!uiXml ? (
              <p className="text-muted-foreground">Load hierarchy</p>
            ) : (
              <ScrollArea className="h-[400px]">
                {/* Parse XML → tree (simple recursive render) */}
                <pre className="text-xs">{uiXml}</pre>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* RIGHT – LOCATORS */}
        <Card>
          <CardHeader>
            <CardTitle>Element Locators</CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedNode ? (
              <p className="text-muted-foreground">Select an element</p>
            ) : (
              <div className="space-y-3 text-sm">
                <div><b>Class:</b> {selectedNode.class}</div>
                <div><b>Resource ID:</b> {selectedNode.resourceId}</div>
                <div><b>Bounds:</b> {selectedNode.bounds}</div>
                <div><b>Text:</b> {selectedNode.text || 'N/A'}</div>
                <div><b>Content Desc:</b> {selectedNode.contentDesc || 'N/A'}</div>
                <div><b>Clickable:</b> {selectedNode.clickable ? <CheckCircle className="inline h-4 w-4 text-green-500" /> : <XCircle className="inline h-4 w-4 text-red-500" />}</div>
                <div><b>Enabled:</b> {selectedNode.enabled ? <CheckCircle className="inline h-4 w-4 text-green-500" /> : <XCircle className="inline h-4 w-4 text-red-500" />}</div>

                <pre className="bg-black text-green-400 p-2 rounded text-xs">
                  {`driver.findElement(By.id("${selectedNode.resourceId}"))`}
                </pre>

                <pre className="bg-black text-green-400 p-2 rounded text-xs">
                  {`//*[@resource-id='${selectedNode.resourceId}']`}
                </pre>

                <pre className="bg-black text-green-400 p-2 rounded text-xs">
                  {`//${selectedNode.class}`}
                </pre>

                {selectedNode.text && (
                  <pre className="bg-black text-green-400 p-2 rounded text-xs">
                    {`//*[@text='${selectedNode.text}']`}
                  </pre>
                )}

                {selectedNode.contentDesc && (
                  <pre className="bg-black text-green-400 p-2 rounded text-xs">
                    {`//*[@content-desc='${selectedNode.contentDesc}']`}
                  </pre>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
