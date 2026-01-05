import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";

const AGENT_URL = "http://localhost:3001";

export function useDeviceMirror() {
  const [mirrorActive, setMirrorActive] = useState(false);
  const [mirrorImage, setMirrorImage] = useState<string | null>(null);
  const [mirrorError, setMirrorError] = useState<string | null>(null);
  const [mirrorLoading, setMirrorLoading] = useState(false);
  const [deviceSize, setDeviceSize] = useState<{ w: number; h: number } | null>(null);

  const screenshotIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startScreenshotStream = useCallback(() => {
    // Clear any existing scheduled capture
    if (screenshotIntervalRef.current) {
      clearTimeout(screenshotIntervalRef.current as unknown as number);
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
        clearTimeout(screenshotIntervalRef.current as unknown as number);
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

  const connectDevice = useCallback(async (selectedDevice: any) => {
    if (!selectedDevice) {
      toast.error("Select a device first");
      return false;
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
        return false;
      }

      // Verify device is connected
      const deviceRes = await fetch(`${AGENT_URL}/device/check`);
      const deviceData = await deviceRes.json();

      if (!deviceData.connected) {
        setMirrorError("No device connected. Start an emulator or connect a device via ADB.");
        setMirrorLoading(false);
        toast.error("No device connected");
        return false;
      }

      // Test screenshot endpoint first
      const testScreenshot = await fetch(`${AGENT_URL}/device/screenshot`);
      if (!testScreenshot.ok) {
        const err = await testScreenshot.json().catch(() => ({}));
        setMirrorLoading(false);
        setMirrorError(err.error || "Cannot capture device screen");
        toast.error("Cannot capture device screen");
        return false;
      }

      // Fetch device size for accurate click mapping
      try {
        const sizeRes = await fetch(`${AGENT_URL}/device/size`);
        const sizeJson = await sizeRes.json();
        if (sizeJson.success && sizeJson.size) setDeviceSize(sizeJson.size);
      } catch { }

      // Start embedded screenshot streaming
      setMirrorActive(true);
      setMirrorLoading(false);
      startScreenshotStream();

      toast.success("Device connected", {
        description: "Live preview active - interact with your device",
      });
      return true;
    } catch (err: any) {
      console.error("[connectDevice] Error:", err);
      setMirrorLoading(false);
      setMirrorError("Cannot connect to local helper. Run: npm start in tools/mobile-automation-helper");
      toast.error("Local helper not running");
      return false;
    }
  }, [startScreenshotStream]);

  const disconnectDevice = useCallback(() => {
    setMirrorActive(false);
    if (mirrorImage) {
      URL.revokeObjectURL(mirrorImage);
    }
    setMirrorImage(null);
    setMirrorError(null);
    if (screenshotIntervalRef.current) {
      clearTimeout(screenshotIntervalRef.current as unknown as number);
      screenshotIntervalRef.current = null;
    }
    toast.info("Device disconnected");
  }, [mirrorImage]);

  return {
    mirrorActive,
    mirrorImage,
    mirrorError,
    mirrorLoading,
    deviceSize,
    connectDevice,
    disconnectDevice,
  };
}
