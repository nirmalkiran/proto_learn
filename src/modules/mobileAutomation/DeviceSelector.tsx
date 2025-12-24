import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Device {
  device: string;
  os_version: string;
  real_mobile: boolean;
}

export default function DeviceSelector({
  onSelect,
}: {
  onSelect: (device: Device) => void;
}) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices = async () => {
    setLoading(true);
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mobile-execution`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ type: "get-devices" }),
      }
    );

    const data = await res.json();
    setDevices(data.devices || []);
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Select Device</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading && <p>Loading devices...</p>}

        {devices.slice(0, 15).map((d, i) => (
          <div
            key={i}
            className="flex justify-between items-center border p-2 rounded"
          >
            <div>
              <p className="font-medium">
                {d.device}
              </p>
              <p className="text-xs text-muted-foreground">
                Android {d.os_version}
              </p>
            </div>

            <Button size="sm" onClick={() => onSelect(d)}>
              Select
            </Button>
          </div>
        ))}

        <Badge variant="outline">
          Showing first 15 devices (credit safe)
        </Badge>
      </CardContent>
    </Card>
  );
}
