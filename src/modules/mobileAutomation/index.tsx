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

import { ActionType, RecordedAction, SelectedDevice } from "./types";

export default function MobileAutomation() {
  /** Project context (can later come from route / selector) */
  const projectId = "mobile-no-code-project";

  /** Active tab */
  const [activeTab, setActiveTab] = useState("overview");

  // Standardized shared state
  const [setupState, setSetupState] = useState({
    appium: false,
    emulator: false,
    device: false,
  });

  const [selectedDevice, setSelectedDevice] = useState<SelectedDevice | null>(null);

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
          Local
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
        <TabsContent value="overview" forceMount className={activeTab !== "overview" ? "hidden" : "mt-6"}>
          <Card>
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
        </TabsContent>

        {/* ================= SETUP ================= */}
        <TabsContent value="setup" forceMount className={activeTab !== "setup" ? "hidden" : "mt-6"}>
          <MobileSetupWizard
            setupState={setupState}
            setSetupState={setSetupState}
            selectedDevice={selectedDevice?.device || ""}
            setSelectedDevice={(id) => setSelectedDevice({
              device: id,
              os_version: "13",
              real_mobile: false
            })}
          />
        </TabsContent>

        {/* ================= RECORDER ================= */}
        <TabsContent value="recorder" forceMount className={activeTab !== "recorder" ? "hidden" : "mt-6"}>
          <MobileRecorder
            setupState={setupState}
            setSetupState={setSetupState}
            selectedDevice={selectedDevice}
            setSelectedDevice={setSelectedDevice}
            selectedDeviceFromSetup={selectedDevice?.device}
          />
        </TabsContent>

        {/* ================= INSPECTOR ================= */}
        <TabsContent value="inspector" forceMount className={activeTab !== "inspector" ? "hidden" : "mt-6"}>
          <MobileInspector />
        </TabsContent>

        {/* ================= HISTORY ================= */}
        <TabsContent value="history" forceMount className={activeTab !== "history" ? "hidden" : "mt-6"}>
          <MobileExecutionHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}
