import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Smartphone } from "lucide-react";
import { toast } from "sonner";

const AGENT_URL = "http://localhost:3001";

import { ActionType, RecordedAction, SelectedDevice } from "./types";

interface DeviceInfo {
  id: string;
  type: "emulator" | "real";
  os_version?: string;
}

export default function DeviceSelector({
  onSelect,
  selectedDeviceFromSetup,
  disabled = false,
}: {
  onSelect: (d: SelectedDevice) => void;
  selectedDeviceFromSetup?: string;
  disabled?: boolean;
}) {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  /* ---------------- FETCH DEVICES ---------------- */

  const fetchDevices = async () => {
    if (disabled) return;
    setLoading(true);
    try {
      // Fetch both connected devices and available AVDs
      const [connectedRes, availableRes] = await Promise.all([
        fetch(`${AGENT_URL}/device/check`),
        fetch(`${AGENT_URL}/emulator/available`)
      ]);

      const connectedData = await connectedRes.json();
      const availableData = await availableRes.json();

      const allDevices: DeviceInfo[] = [];

      // Add connected devices
      if (connectedData.connected && connectedData.devices?.length) {
        const connectedParsed: DeviceInfo[] = connectedData.devices.map((d: any) => ({
          id: d.id,
          type: d.type === "emulator" ? "emulator" : "real",
          os_version: "13", // Safe default
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
    } catch {
      toast.error("Failed to fetch devices");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!disabled) {
      fetchDevices();
    }
  }, [disabled]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
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
      os_version: d.os_version || "13",
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
      <div className="relative" ref={dropdownRef}>
        <button
          className={`flex items-center gap-2 p-2 border rounded-md transition-colors min-w-[200px] text-left ${disabled
            ? 'cursor-not-allowed bg-green-50 border-green-200 text-green-700 font-medium'
            : 'bg-background hover:bg-muted/50'
            }`}
          onClick={() => !disabled && setDropdownOpen(!dropdownOpen)}
          disabled={disabled}
        >
          <Smartphone className={`h-4 w-4 ${disabled ? 'text-green-600' : ''}`} />
          <span className="text-sm truncate">
            {selectedDeviceFromSetup || 'Select device...'}
          </span>
        </button>

        {/* Device list dropdown */}
        {dropdownOpen && !disabled && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg z-10 max-h-60 overflow-y-auto">
            {/* Show all available devices */}
            {devices.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No devices found
              </div>
            ) : (
              devices.map((d) => (
                <div
                  key={d.id}
                  className={`p-2 hover:bg-muted/50 cursor-pointer ${d.id === selectedDeviceFromSetup ? 'bg-blue-50/50' : ''
                    }`}
                  onClick={() => selectDevice(d)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4" />
                      <div>
                        <p className="text-sm font-medium">{d.id}</p>
                        <p className="text-xs text-muted-foreground">
                          Android {d.os_version}
                          {d.id === selectedDeviceFromSetup && ' (Matched)'}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {d.type === "emulator" ? "Emulator" : "Real Device"}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
