/**
 * Purpose:
 * Provides a dropdown interface to discover and select Android devices.
 * Integrates with the local agent to fetch both connected physical devices
 * and available Virtual Devices (AVDs).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Smartphone } from "lucide-react";
import { toast } from "sonner";

const AGENT_URL = "http://localhost:3001";

import { ActionType, RecordedAction, SelectedDevice } from "./types";

interface DeviceInfo {
  id: string;
  name?: string;
  type: "emulator" | "real";
  os_version?: string;
}

/**
 * Purpose:
 * Small component that logic to scan for and list available mobile devices.
 */
export default function DeviceSelector({
  onSelect,
  selectedDeviceFromSetup,
  disabled = false,
  refreshKey = 0,
}: {
  onSelect: (d: SelectedDevice) => void;
  selectedDeviceFromSetup?: string;
  disabled?: boolean;
  refreshKey?: number;
}) {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownPortalRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  /* ---------------- FETCH DEVICES ---------------- */

  /**
   * Purpose:
   * Queries the local agent for all connected physical/active devices
   * and all configured Android Virtual Devices.
   */
  const fetchDevices = async () => {
    if (disabled) return;
    setLoading(true);
    try {
      // Fetch both connected devices and available AVDs (with timeouts for reliability)
      const [connectedRes, availableRes] = await Promise.all([
        fetch(`${AGENT_URL}/device/check`, {
          signal: AbortSignal.timeout(5000)
        }),
        fetch(`${AGENT_URL}/emulator/available`, {
          signal: AbortSignal.timeout(5000)
        })
      ]);

      const connectedData = await connectedRes.json();
      const availableData = await availableRes.json();

      const allDevices: DeviceInfo[] = [];

      // Add connected devices
      if (connectedData.connected && connectedData.devices?.length) {
        const connectedParsed: DeviceInfo[] = connectedData.devices.map((d: any) => ({
          id: d.id,
          name: d.name,
          type: d.type === "emulator" ? "emulator" : "real",
          os_version: d.release || "13",
        }));
        allDevices.push(...connectedParsed);
      }

      // Add available AVDs that aren't already connected
      if (availableData.success && availableData.avds?.length) {
        const availableParsed: DeviceInfo[] = availableData.avds
          .filter((avd: string) => !allDevices.some(d => d.id === avd))
          .map((avd: string) => ({
            id: avd,
            type: "emulator" as const,
            os_version: "13", // Safe default for emulator
          }));
        allDevices.push(...availableParsed);
      }

      setDevices(allDevices);
    } catch (err: any) {
      // Background scan failures are expected when agent is offline.
      // We handle this silently to avoid console/UI noise.
      console.debug("[DeviceSelector] Fetch failed (Agent likely offline)");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!disabled) {
      fetchDevices();
    }
  }, [disabled, refreshKey]);

  const updateDropdownPosition = useCallback(() => {
    const triggerEl = triggerRef.current;
    if (!triggerEl) return;

    const rect = triggerEl.getBoundingClientRect();
    setDropdownPosition({
      top: rect.bottom + 8,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  useLayoutEffect(() => {
    if (!dropdownOpen) return;
    updateDropdownPosition();
  }, [dropdownOpen, updateDropdownPosition]);

  useEffect(() => {
    if (!dropdownOpen) return;

    const onScrollOrResize = () => updateDropdownPosition();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);

    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [dropdownOpen, updateDropdownPosition]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedTriggerArea = dropdownRef.current?.contains(target);
      const clickedDropdown = dropdownPortalRef.current?.contains(target);

      if (!clickedTriggerArea && !clickedDropdown) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /* ---------------- SELECT DEVICE ---------------- */

  const selectDevice = (d: DeviceInfo) => {
    if (disabled) return;
    onSelect({
      device: d.id,
      name: d.name,
      os_version: d.os_version,
      real_mobile: d.type === "real",
    });

    setDropdownOpen(false);
    toast.success(`Selected device: ${d.id}`);
  };

  /* ---------------- UI ---------------- */

  return (
    <div className="relative">
      {loading && !disabled && <p className="text-sm">Checking devices...</p>}

      {/* Dropdown-style device selector */}
      {/* inline-block prevents the dropdown from stretching to the full flex row width */}
      <div className="relative inline-block align-top" ref={dropdownRef}>
        <button
          ref={triggerRef}
          className={`flex w-full items-center gap-2 p-2 border rounded-lg transition-all duration-200 min-w-[200px] text-left ${disabled
            ? 'cursor-not-allowed bg-primary/5 border-primary/20 text-primary font-bold shadow-none'
            : 'bg-background hover:bg-muted/30 border-border/60 hover:border-border shadow-sm'
            }`}
          onClick={() => !disabled && setDropdownOpen(!dropdownOpen)}
          disabled={disabled}
        >
          <Smartphone className={`h-4 w-4 ${disabled ? 'text-green-600' : ''}`} />
          <span className="text-sm truncate">
            {(() => {
              if (!selectedDeviceFromSetup) return 'Select device...';
              const device = devices.find(d => d.id === selectedDeviceFromSetup);
              return device?.name || selectedDeviceFromSetup;
            })()}
          </span>
        </button>

        {/* Device list dropdown */}
        {dropdownOpen && !disabled && dropdownPosition && createPortal((
          <div
            ref={dropdownPortalRef}
            className="bg-card/95 backdrop-blur-md border border-border rounded-lg shadow-card z-[9999] max-h-60 overflow-y-auto overflow-x-hidden animate-in fade-in slide-in-from-top-1 duration-200"
            style={{
              position: "fixed",
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              width: dropdownPosition.width,
            }}
          >
            {/* Show all available devices */}
            {devices.length === 0 ? (
              <div className="p-4 space-y-3">
                <div className="text-center">
                  <p className="text-sm font-medium text-muted-foreground mb-1">No devices found</p>
                  <p className="text-xs text-muted-foreground">Physical device not appearing?</p>
                </div>
                <div className="bg-muted/30 rounded-md p-3 space-y-2 text-xs">
                  <p className="font-semibold text-foreground">Quick Checklist:</p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li className="flex items-start gap-1.5">
                      <span className="text-primary mt-0.5">✓</span>
                      <span>USB debugging enabled on device</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-primary mt-0.5">✓</span>
                      <span>USB cable supports data transfer</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-primary mt-0.5">✓</span>
                      <span>Accepted "Allow USB Debugging" on device</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-primary mt-0.5">✓</span>
                      <span>Click Refresh button above</span>
                    </li>
                  </ul>
                </div>
                <div className="text-center">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => {
                      fetchDevices();
                      toast.info("Refreshing device list...");
                    }}
                  >
                    <Smartphone className="h-3 w-3 mr-1.5" />
                    Refresh Devices
                  </Button>
                </div>
              </div>
            ) : (
              devices.map((d) => (
                <div
                  key={d.id}
                  className={`p-2 rounded-lg m-1 transition-all duration-200 cursor-pointer ${d.id === selectedDeviceFromSetup ? 'bg-primary/10 border-primary/20' : 'hover:bg-muted/50'
                    }`}
                  onClick={() => selectDevice(d)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4" />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground truncate max-w-[200px]" title={d.name || d.id}>
                          {d.name || d.id}
                        </p>
                        <p className="text-[10px] text-muted-foreground font-medium">
                          {d.type === "real" ? `Android ${d.os_version} • ${d.id}` : `AVD • Android ${d.os_version}`}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs font-bold border-primary/20 bg-primary/5 text-primary">
                      {d.type === "emulator" ? "Emulator" : "Physical Device"}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        ), document.body)}
      </div>
    </div>
  );
}
