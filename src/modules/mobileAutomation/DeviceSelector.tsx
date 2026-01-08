import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Smartphone } from "lucide-react";
import { toast } from "sonner";

const AGENT_URL = "http://localhost:3001";

/* ---------------- TYPES ---------------- */

interface DeviceInfo {
  id: string;
  type: "emulator" | "real";
  os_version?: string;
}

interface SelectedDevice {
  device: string;
  os_version: string;
  real_mobile: boolean;
}

export default function DeviceSelector({
  onSelect,
  selectedDeviceFromSetup,
}: {
  onSelect: (d: SelectedDevice) => void;
  selectedDeviceFromSetup?: string;
}) {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<SelectedDevice | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  /* ---------------- FETCH DEVICES ---------------- */

  const fetchDevices = async () => {
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
        const connectedParsed: DeviceInfo[] = connectedData.devices.map((d: string) => ({
          id: d.split("\t")[0],
          type: d.includes("emulator") ? "emulator" : "real",
          os_version: "13", // Safe default for emulator
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
    fetchDevices();
  }, []);

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
      {loading && <p className="text-sm">Checking devices...</p>}

      {/* Dropdown-style device selector */}
      <div className="relative" ref={dropdownRef}>
        <button
          className="flex items-center gap-2 p-2 border rounded-md bg-background hover:bg-muted/50 min-w-[200px] text-left"
          onClick={() => setDropdownOpen(!dropdownOpen)}
        >
          <Smartphone className="h-4 w-4" />
          <span className="text-sm truncate">
            {selectedDevice ? selectedDevice.device : 'Select device...'}
          </span>
        </button>

        {/* Device list dropdown */}
        {dropdownOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg z-10 max-h-60 overflow-y-auto">
            {/* Show selected device from setup if available */}
            {selectedDeviceFromSetup && (
              <div className="p-2 border-b bg-green-50/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-green-600" />
                    <div>
                      <p className="text-sm font-medium text-green-800">{selectedDeviceFromSetup}</p>
                      <p className="text-xs text-green-600">Android 13 (From Setup)</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => selectDevice({
                      id: selectedDeviceFromSetup,
                      type: "emulator",
                      os_version: "13"
                    })}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    Select
                  </Button>
                </div>
              </div>
            )}

            {/* Show all available devices */}
            {devices.map((d) => (
              <div
                key={d.id}
                className={`p-2 hover:bg-muted/50 cursor-pointer ${
                  d.id === selectedDeviceFromSetup ? 'bg-blue-50/50' : ''
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
                        {d.id === selectedDeviceFromSetup && ' (From Setup)'}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {d.type === "emulator" ? "Emulator" : "Real Device"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
