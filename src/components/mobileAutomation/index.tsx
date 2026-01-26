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

import { ActionType, RecordedAction, SelectedDevice } from "./types";

export default function MobileAutomation() {
  /** Project context (can later come from route / selector) */
  const projectId = "c4a1b02d-7682-4c28-874b-6e9f9024c0e9";

  /** Active tab */
  const [activeTab, setActiveTab] = useState("setup");

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
        <TabsList className="grid w-full grid-cols-3">
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
        </TabsList>


        {/* ================= SETUP ================= */}
        <TabsContent value="setup" forceMount className={activeTab !== "setup" ? "hidden" : "mt-6"}>
          <MobileSetupWizard
            setupState={setupState}
            setSetupState={setSetupState}
            selectedDevice={selectedDevice}
            setSelectedDevice={setSelectedDevice}
            setActiveTab={setActiveTab}
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

      </Tabs>
    </div>
  );
}
