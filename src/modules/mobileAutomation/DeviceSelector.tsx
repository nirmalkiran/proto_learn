import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
}: {
  onSelect: (d: SelectedDevice) => void;
}) {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loading, setLoading] = useState(false);

  /* ---------------- FETCH DEVICES ---------------- */

  const fetchDevices = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${AGENT_URL}/device/check`);
      const data = await res.json();

      if (!data.connected || !data.devices?.length) {
        setDevices([]);
        return;
      }

      const parsed: DeviceInfo[] = data.devices.map((d: string) => ({
        id: d.split("\t")[0],
        type: d.includes("emulator") ? "emulator" : "real",
        os_version: "13", // Safe default for emulator
      }));

      setDevices(parsed);
    } catch {
      toast.error("Failed to fetch devices");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  /* ---------------- SELECT DEVICE ---------------- */

  const selectDevice = (d: DeviceInfo) => {
    onSelect({
      device: d.id,
      os_version: d.os_version || "13",
      real_mobile: d.type === "real",
    });

    toast.success(`Selected device: ${d.id}`);
  };

  /* ---------------- UI ---------------- */

  return (
    <div className="space-y-3">
      <Button variant="outline" size="sm" onClick={fetchDevices}>
        Refresh Devices
      </Button>

      {loading && <p className="text-sm">Checking devices...</p>}

      {!loading && devices.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No device detected. Start emulator from Setup.
        </p>
      )}

      {devices.map((d) => (
        <Card
          key={d.id}
          className="p-3 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            <div>
              <p className="text-sm font-medium">{d.id}</p>
              <p className="text-xs text-muted-foreground">
                Android {d.os_version}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {d.type === "emulator" ? "Emulator" : "Real Device"}
            </Badge>
            <Button size="sm" onClick={() => selectDevice(d)}>
              Select
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
