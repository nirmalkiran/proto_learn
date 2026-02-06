/**
 * Purpose:
 * Main entry point for the Mobile No-Code Automation module.
 * Manages the high-level navigation (Tabs) between Setup, Recorder, and AI Assistant,
 * while maintaining shared connection state.
 */
import { useState } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Smartphone,
  Circle,
  Wand2,
  Settings,
  Cloud,
} from "lucide-react";

import MobileRecorder from "./MobileRecorder";
import MobileSetupWizard from "./MobileSetupWizard";
import MobileAIAssistant from "./MobileAIAssistant";

import { SelectedDevice } from "./types";

const DEFAULT_PROJECT_ID = "c4a1b02d-7682-4c28-874b-6e9f9024c0e9";

interface MobileAutomationProps {
  projectId?: string;
}

export default function MobileAutomation({ projectId = DEFAULT_PROJECT_ID }: MobileAutomationProps) {

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

          <TabsTrigger value="assistant">
            <Wand2 className="mr-2 h-4 w-4" />
            AI Assistant
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

        {/* ================= AI ASSISTANT ================= */}
        <TabsContent value="assistant" forceMount className={activeTab !== "assistant" ? "hidden" : "mt-6"}>
          <MobileAIAssistant
            projectId={projectId}
            setupState={setupState}
            selectedDevice={selectedDevice}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
