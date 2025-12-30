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
import MobileTerminal from "./MobileTerminal";
import MobileTestGenerator from "./MobileTestGenerator";
import MobileSetupWizard from "./MobileSetupWizard";
import MobileExecutionHistory from "./MobileExecutionHistory";

export default function MobileAutomation() {
  /** Project context (can later come from route / selector) */
  const projectId = "mobile-no-code-project";

  /** Active tab */
  const [activeTab, setActiveTab] = useState("overview");

  /**
   * ✅ SHARED SETUP STATE
   * This persists across tabs and is the single source of truth
   */
  const [setupState, setSetupState] = useState({
    appium: false,
    emulator: false,
    device: false,
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
        <TabsList className="grid w-full grid-cols-7">
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

          <TabsTrigger value="terminal">
            <Terminal className="mr-2 h-4 w-4" />
            Terminal
          </TabsTrigger>

          <TabsTrigger value="generator">
            <Wand2 className="mr-2 h-4 w-4" />
            Generator
          </TabsTrigger>

          <TabsTrigger value="history">
            <History className="mr-2 h-4 w-4" />
            History
          </TabsTrigger>
        </TabsList>

        {/* ================= OVERVIEW ================= */}
        <TabsContent value="overview" className="space-y-6">
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
        <TabsContent value="setup">
          <MobileSetupWizard
            setupState={setupState}
            setSetupState={setSetupState}
          />
        </TabsContent>

        {/* ================= RECORDER ================= */}
        <TabsContent value="recorder" >
          <MobileRecorder
            setupState={setupState}
          />
        </TabsContent>

        {/* ================= INSPECTOR ================= */}
        <TabsContent value="inspector" >
          <MobileInspector />
        </TabsContent>

        {/* ================= TERMINAL ================= */}
        <TabsContent value="terminal">
          <MobileTerminal projectId={projectId} />
        </TabsContent>

        {/* ================= GENERATOR ================= */}
        <TabsContent value="generator">
          <MobileTestGenerator />
        </TabsContent>

        {/* ================= HISTORY ================= */}
        <TabsContent value="history">
          <MobileExecutionHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}
