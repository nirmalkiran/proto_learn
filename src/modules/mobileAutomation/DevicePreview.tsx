import { useState } from "react";
import { toast } from "sonner";
import { Monitor, Smartphone, Wifi, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { useDeviceMirror } from "@/hooks/useDeviceMirror";

const AGENT_URL = "http://localhost:3001";
const DEVICE_WIDTH = 320;
const DEVICE_HEIGHT = 568;

interface DevicePreviewProps {
  selectedDevice: any;
  captureMode: boolean;
  setCaptureMode: (mode: boolean) => void;
  onActionCaptured: (action: any) => void;
  setDeviceSize: (size: any) => void;
  deviceSize: any;
}

export default function DevicePreview({
  selectedDevice,
  captureMode,
  setCaptureMode,
  onActionCaptured,
  setDeviceSize,
  deviceSize,
}: DevicePreviewProps) {
  const {
    mirrorActive,
    mirrorImage,
    mirrorError,
    mirrorLoading,
    connectDevice,
    disconnectDevice,
  } = useDeviceMirror();

  // Input modal state
  const [inputModalOpen, setInputModalOpen] = useState(false);
  const [inputModalText, setInputModalText] = useState("");
  const [inputModalCoords, setInputModalCoords] = useState<{ x: number; y: number } | null>(null);
  const [inputModalPending, setInputModalPending] = useState(false);

  const handleConfirmInput = async () => {
    if (!inputModalCoords) return setInputModalOpen(false);
    if (!inputModalText || String(inputModalText).trim().length === 0) {
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

  return (
    <Card className="lg:col-span-1">
      <CardHeader className="flex flex-row items-center justify-between">
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
      </CardHeader>
      <CardContent>
        <div
          className="border-4 border-foreground/20 rounded-[2rem] overflow-hidden bg-black mx-auto relative device-preview"
          style={{
            width: mirrorActive ? 'auto' : DEVICE_WIDTH,
            height: mirrorActive ? 'auto' : DEVICE_HEIGHT
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
                <Button onClick={() => connectDevice(selectedDevice)} className="gap-2">
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

                    const finalDev = deviceSize || { w: 1344, h: 2400 };

                    const deviceX = Math.round((clickX / imgWidth) * finalDev.w);
                    const deviceY = Math.round((clickY / imgHeight) * finalDev.h);

                    try {
                      const res = await fetch(`${AGENT_URL}/device/tap`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ x: deviceX, y: deviceY }),
                      });

                      const json = await res.json().catch(() => ({}));

                      if (res.ok && json.step) {
                        toast.success("Captured step");

                        // If this element looks like an input, prompt user to enter text
                        if (json.step.isInputCandidate) {
                          setInputModalCoords({ x: deviceX, y: deviceY });
                          setInputModalText("");
                          setInputModalPending(false);
                          setInputModalOpen(true);
                        }

                      } else {
                        toast.error(json.error || "Failed to capture");
                      }
                    } catch (err) {
                      toast.error("Failed to capture");
                    }
                  }}
                />
              </>
            ) : (
              <div className="text-center p-4 space-y-3">
                <div className="animate-pulse text-muted-foreground text-sm">
                  Loading device screen...
                </div>
              </div>
            )}
          </div>

          {/* Home button */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-16 h-1 bg-foreground/30 rounded-full" />
        </div>
      </CardContent>

      {/* Controls moved outside the emulator preview */}
      <div className="flex items-center justify-between gap-2 mt-4 p-2">
        <Button variant={captureMode ? "destructive" : "default"} size="sm" onClick={() => setCaptureMode(!captureMode)} className="gap-2">
          <Monitor className="h-3 w-3 mr-1" />
          {captureMode ? "Capture Mode: ON" : "Capture Mode: OFF"}
        </Button>

        <div className="flex items-center gap-2">
          <Button variant="destructive" size="sm" onClick={disconnectDevice}>
            <WifiOff className="h-3 w-3 mr-1" />
            Disconnect
          </Button>
        </div>
      </div>

      {/* Input capture dialog */}
      <Dialog open={inputModalOpen} onOpenChange={setInputModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter text to input</DialogTitle>
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
    </Card>
  );
}
