import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Circle, Square, Play, Download, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

interface RecordedAction {
  id: string;
  type: "tap" | "swipe" | "input" | "wait" | "assert";
  locator?: string;
  value?: string;
  coordinates?: { x: number; y: number };
  direction?: "up" | "down" | "left" | "right";
  duration?: number;
}

const SAMPLE_ACTIONS: RecordedAction[] = [
  { id: "1", type: "tap", locator: "//android.widget.EditText[@resource-id='email']" },
  { id: "2", type: "input", locator: "//android.widget.EditText[@resource-id='email']", value: "test@example.com" },
  { id: "3", type: "tap", locator: "//android.widget.EditText[@resource-id='password']" },
  { id: "4", type: "input", locator: "//android.widget.EditText[@resource-id='password']", value: "password123" },
  { id: "5", type: "tap", locator: "//android.widget.Button[@text='Login']" },
  { id: "6", type: "wait", duration: 2000 },
  { id: "7", type: "assert", locator: "//android.widget.TextView[@text='Welcome']" },
];

export default function Recorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [actions, setActions] = useState<RecordedAction[]>([]);
  const [newAction, setNewAction] = useState<Partial<RecordedAction>>({ type: "tap" });
  const [eventSource, setEventSource] = useState<EventSource | null>(null);
  const [showInputDialog, setShowInputDialog] = useState(false);
  const [currentInputAction, setCurrentInputAction] = useState<RecordedAction | null>(null);
  const [inputText, setInputText] = useState("");

  const addAction = () => {
    if (!newAction.type) return;  
    const action: RecordedAction = {
      id: Date.now().toString(),
      type: newAction.type as RecordedAction["type"],
      locator: newAction.locator,
      value: newAction.value,
      duration: newAction.duration,
      direction: newAction.direction as RecordedAction["direction"],
    };
    setActions([...actions, action]);
    setNewAction({ type: "tap" });
    toast.success("Action added");
  };

  const removeAction = (id: string) => {
    setActions(actions.filter((a) => a.id !== id));
  };

  const loadSample = () => {
    setActions(SAMPLE_ACTIONS);
    toast.success("Sample login flow loaded");
  };

  const generateAppiumScript = () => {
    const script = `// Generated Appium Test Script
const { remote } = require('webdriverio');

async function runTest() {
  const driver = await remote({
    hostname: 'localhost',
    port: 4723,
    path: '/wd/hub',
    capabilities: {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:deviceName': 'emulator-5554',
      'appium:app': '/path/to/app.apk'
    }
  });

  try {
${actions.map((a) => {
  switch (a.type) {
    case "tap":
      return `    await driver.$('${a.locator}').click();`;
    case "input":
      return `    await driver.$('${a.locator}').setValue('${a.value || ''}');`;
    case "swipe":
      return `    // Swipe ${a.direction}`;
    case "wait":
      return `    await driver.pause(${a.duration || 1000});`;
    case "assert":
      return `    await expect(driver.$('${a.locator}')).toBeDisplayed();`;
    default:
      return "";
  }
}).join("\n")}
  } finally {
    await driver.deleteSession();
  }
}

runTest();`;
    return script;
  };

  const downloadScript = () => {
    const script = generateAppiumScript();
    const blob = new Blob([script], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "recorded_test.js";
    a.click();
    toast.success("Script downloaded");
  };

  const downloadJSON = () => {
    const json = JSON.stringify({ actions, metadata: { recorded: new Date().toISOString() } }, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "recorded_actions.json";
    a.click();
    toast.success("JSON downloaded");
  };

  const playback = async () => {
    toast.info("Starting playback...");
    try {
      const res = await fetch("http://localhost:3001/api/playback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Playback completed");
      } else {
        toast.error(data.error || "Playback failed");
      }
    } catch {
      toast.error("Backend not connected. Start server to run playback.");
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="container mx-auto max-w-6xl">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <h1 className="text-2xl font-bold">Record & Playback</h1>
          <Badge variant={isRecording ? "destructive" : "secondary"}>
            {isRecording ? "Recording" : "Stopped"}
          </Badge>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Action Builder */}
          <Card>
            <CardHeader>
              <CardTitle>Add Action</CardTitle>
              <CardDescription>Build test actions manually or load a sample</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button
                  variant={isRecording ? "destructive" : "default"}
                  onClick={isRecording ? stopRecording : startRecording}
                  className="flex-1"
                >
                  {isRecording ? <Square className="mr-2 h-4 w-4" /> : <Circle className="mr-2 h-4 w-4" />}
                  {isRecording ? "Stop Recording" : "Start Recording"}
                </Button>
                <Button variant="outline" onClick={loadSample}>
                  Load Sample
                </Button>
              </div>

              <div className="space-y-3 pt-4 border-t">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Action Type</Label>
                    <Select value={newAction.type} onValueChange={(v) => setNewAction({ ...newAction, type: v as any })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tap">Tap</SelectItem>
                        <SelectItem value="input">Input Text</SelectItem>
                        <SelectItem value="swipe">Swipe</SelectItem>
                        <SelectItem value="wait">Wait</SelectItem>
                        <SelectItem value="assert">Assert Visible</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {newAction.type === "swipe" && (
                    <div>
                      <Label>Direction</Label>
                      <Select value={newAction.direction} onValueChange={(v) => setNewAction({ ...newAction, direction: v as any })}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="up">Up</SelectItem>
                          <SelectItem value="down">Down</SelectItem>
                          <SelectItem value="left">Left</SelectItem>
                          <SelectItem value="right">Right</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {(newAction.type === "tap" || newAction.type === "input" || newAction.type === "assert") && (
                  <div>
                    <Label>Locator (XPath or ID)</Label>
                    <Input
                      value={newAction.locator || ""}
                      onChange={(e) => setNewAction({ ...newAction, locator: e.target.value })}
                      placeholder="//android.widget.Button[@text='Submit']"
                    />
                  </div>
                )}

                {newAction.type === "input" && (
                  <div>
                    <Label>Text Value</Label>
                    <Input
                      value={newAction.value || ""}
                      onChange={(e) => setNewAction({ ...newAction, value: e.target.value })}
                      placeholder="Enter text to input"
                    />
                  </div>
                )}

                {newAction.type === "wait" && (
                  <div>
                    <Label>Duration (ms)</Label>
                    <Input
                      type="number"
                      value={newAction.duration || 1000}
                      onChange={(e) => setNewAction({ ...newAction, duration: parseInt(e.target.value) })}
                    />
                  </div>
                )}

                <Button onClick={addAction} className="w-full">
                  <Plus className="mr-2 h-4 w-4" /> Add Action
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Action List */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Recorded Actions</CardTitle>
                  <CardDescription>{actions.length} actions recorded</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={downloadJSON}>
                    <Download className="mr-1 h-3 w-3" /> JSON
                  </Button>
                  <Button variant="outline" size="sm" onClick={downloadScript}>
                    <Download className="mr-1 h-3 w-3" /> Script
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px]">
                {actions.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No actions recorded. Add actions or load sample.</p>
                ) : (
                  <div className="space-y-2">
                    {actions.map((action, idx) => (
                      <div
                        key={action.id}
                        className="flex items-center gap-3 p-3 bg-muted rounded-lg"
                      >
                        <Badge variant="outline" className="shrink-0">
                          {idx + 1}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium capitalize">{action.type}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {action.locator || action.value || `${action.duration}ms` || action.direction}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeAction(action.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>

              <Button
                className="w-full mt-4"
                onClick={playback}
                disabled={actions.length === 0}
              >
                <Play className="mr-2 h-4 w-4" /> Run Playback
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Generated Script Preview */}
        {actions.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Generated Appium Script</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-zinc-950 text-zinc-100 p-4 rounded-lg overflow-x-auto text-sm">
                {generateAppiumScript()}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
