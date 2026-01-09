import { useState } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Smartphone,
  Circle,
  Search,
  Terminal,
  Wand2,
  AlertCircle,
  Settings,
  Cloud,
  History,
} from "lucide-react";

import MobileRecorder from "./MobileRecorder";
import MobileInspector from "./MobileInspector";
import MobileSetupWizard from "./MobileSetupWizard";
import MobileExecutionHistory from "./MobileExecutionHistory";

// Types for lifted state
interface CheckResult {
  status: "pending" | "checking" | "success" | "error";
  message: string;
}

interface SelectedElement {
  class: string;
  resourceId?: string;
  text?: string;
  contentDesc?: string;
}

export type ActionType =
  | "tap"
  | "input"
  | "scroll"
  | "wait"
  | "assert";

export interface RecordedAction {
  id: string;
  type: ActionType;
  description: string;
  locator: string;
  value?: string;
  enabled?: boolean;
  coordinates?: {
    x: number;
    y: number;
    endX?: number;
    endY?: number;
  };
  timestamp?: number;
}

export default function MobileAutomation() {
  /** Project context (can later come from route / selector) */
  const projectId = "mobile-no-code-project";

  /** Active tab */
  const [activeTab, setActiveTab] = useState("overview");

  const [setupState, setSetupState] = useState({
    appium: false,
    emulator: false,
    device: false,
  });

  // Lifted state from MobileSetupWizard
  const [checks, setChecks] = useState<Record<string, CheckResult>>({
    backend: { status: "pending", message: "Not checked" },
    agent: { status: "pending", message: "Not checked" },
    appium: { status: "pending", message: "Not checked" },
    emulator: { status: "pending", message: "Not checked" },
    device: { status: "pending", message: "Not checked" },
  });
  const [agentDetails, setAgentDetails] = useState<any>(null);
  const [availableDevices, setAvailableDevices] = useState<string[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardTab, setWizardTab] = useState<"usb" | "wireless">("usb");
  const [wizardStep, setWizardStep] = useState(1);

  // Lifted state from MobileRecorder
  const [recording, setRecording] = useState(false);
  const [actions, setActions] = useState<RecordedAction[]>([]);
  const [recorderSelectedDevice, setRecorderSelectedDevice] = useState<any>(null);
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [mirrorActive, setMirrorActive] = useState(false);
  const [mirrorImage, setMirrorImage] = useState<string | null>(null);
  const [mirrorError, setMirrorError] = useState<string | null>(null);
  const [mirrorLoading, setMirrorLoading] = useState(false);
  const [captureMode, setCaptureMode] = useState(false);
  const [deviceSize, setDeviceSize] = useState<{w:number;h:number} | null>(null);
  const [inputModalOpen, setInputModalOpen] = useState(false);
  const [inputModalText, setInputModalText] = useState("");
  const [inputModalCoords, setInputModalCoords] = useState<{x:number;y:number} | null>(null);
  const [inputModalPending, setInputModalPending] = useState(false);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const [previewPendingId, setPreviewPendingId] = useState<string | null>(null);
  const [replaying, setReplaying] = useState<boolean>(false);
  const [replayIndex, setReplayIndex] = useState<number | null>(null);

  // Lifted state from MobileInspector
  const [selectedNode, setSelectedNode] = useState<SelectedElement | null>(null);
  const [opening, setOpening] = useState(false);
  const [config, setConfig] = useState({
    appiumHost: "127.0.0.1",
    appiumPort: "4723",
    deviceName: "emulator-5554",
    platformVersion: "14",
    appPath: "", // optional .apk path
    appPackage: "com.example.app",
    appActivity: "com.example.app.MainActivity",
  });

  return (
    <div className="space-y-6">
      
      <div className="flex items-center gap-4">
        <Smartphone className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Mobile No-Code Automation</h1>
          <p className="text-muted-foreground">
            Android automation for QAs
          </p>
        </div>

        <Badge
          variant="outline"
          className="ml-auto flex items-center gap-1"
        >
          <Cloud className="h-3 w-3" />
          Local / Cloud Ready
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>

          <TabsTrigger value="setup">
            <Settings className="mr-2 h-4 w-4" />
            Setup
          </TabsTrigger>

          <TabsTrigger value="recorder">
            <Circle className="mr-2 h-4 w-4" />
            Recorder
          </TabsTrigger>

          <TabsTrigger value="inspector">
            <Search className="mr-2 h-4 w-4" />
            Inspector
          </TabsTrigger>

          <TabsTrigger value="history">
            <History className="mr-2 h-4 w-4" />
            History
          </TabsTrigger>
        </TabsList>

        {/* ================= OVERVIEW ================= */}
        {activeTab === "overview" && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-blue-500" />
                How this works
              </CardTitle>
              <CardDescription>
                Record once, reuse many times — no coding required
              </CardDescription>
            </CardHeader>

            <CardContent>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li>Complete local setup (Appium + Emulator)</li>
                <li>Select device</li>
                <li>Record actions visually</li>
                <li>Replay or generate automation</li>
                <li>Track execution history</li>
              </ol>
            </CardContent>
          </Card>
        )}

        {/* ================= SETUP ================= */}
        {activeTab === "setup" && (
          <div className="mt-6">
            <MobileSetupWizard
              setupState={setupState}
              setSetupState={setSetupState}
              checks={checks}
              setChecks={setChecks}
              agentDetails={agentDetails}
              setAgentDetails={setAgentDetails}
              availableDevices={availableDevices}
              setAvailableDevices={setAvailableDevices}
              selectedDevice={selectedDevice}
              setSelectedDevice={setSelectedDevice}
              wizardOpen={wizardOpen}
              setWizardOpen={setWizardOpen}
              wizardTab={wizardTab}
              setWizardTab={setWizardTab}
              wizardStep={wizardStep}
              setWizardStep={setWizardStep}
            />
          </div>
        )}

        {/* ================= RECORDER ================= */}
        {activeTab === "recorder" && (
          <div className="mt-6">
            <MobileRecorder
              setupState={setupState}
              setSetupState={setSetupState}
              recording={recording}
              setRecording={setRecording}
              actions={actions}
              setActions={setActions}
              selectedDevice={selectedDevice ? {
                device: selectedDevice,
                os_version: "13",
                real_mobile: false
              } : recorderSelectedDevice}
              setSelectedDevice={(device) => {
                setRecorderSelectedDevice(device);
                // Also update the setup wizard's selected device
                if (device) {
                  setSelectedDevice(device.device);
                }
              }}
              connectionStatus={connectionStatus}
              setConnectionStatus={setConnectionStatus}
              mirrorActive={mirrorActive}
              setMirrorActive={setMirrorActive}
              mirrorImage={mirrorImage}
              setMirrorImage={setMirrorImage}
              mirrorError={mirrorError}
              setMirrorError={setMirrorError}
              mirrorLoading={mirrorLoading}
              setMirrorLoading={setMirrorLoading}
              captureMode={captureMode}
              setCaptureMode={setCaptureMode}
              deviceSize={deviceSize}
              setDeviceSize={setDeviceSize}
              inputModalOpen={inputModalOpen}
              setInputModalOpen={setInputModalOpen}
              inputModalText={inputModalText}
              setInputModalText={setInputModalText}
              inputModalCoords={inputModalCoords}
              setInputModalCoords={setInputModalCoords}
              inputModalPending={inputModalPending}
              setInputModalPending={setInputModalPending}
              editingStepId={editingStepId}
              setEditingStepId={setEditingStepId}
              editingValue={editingValue}
              setEditingValue={setEditingValue}
              previewPendingId={previewPendingId}
              setPreviewPendingId={setPreviewPendingId}
              replaying={replaying}
              setReplaying={setReplaying}
              replayIndex={replayIndex}
              setReplayIndex={setReplayIndex}
              selectedDeviceFromSetup={selectedDevice}
            />
          </div>
        )}

        {/* ================= INSPECTOR ================= */}
        {activeTab === "inspector" && (
          <div className="mt-6">
            <MobileInspector />
          </div>
        )}

        {/* ================= HISTORY ================= */}
        {activeTab === "history" && (
          <div className="mt-6">
            <MobileExecutionHistory />
          </div>
        )}
      </Tabs>
    </div>
  );
}
