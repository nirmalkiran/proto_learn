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
} from "lucide-react";

import MobileRecorder from "./MobileRecorder";
import MobileInspector from "./MobileInspector";
import MobileTerminal from "./MobileTerminal";
import MobileTestGenerator from "./MobileTestGenerator";
import MobileSetupWizard from "./MobileSetupWizard";

export default function MobileAutomation() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex items-center gap-4">
        <Smartphone className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">
            Mobile No-Code Automation
          </h1>
          <p className="text-muted-foreground">
            Cloud-based Android automation using BrowserStack App Automate
          </p>
        </div>

        <Badge
          variant="outline"
          className="ml-auto flex items-center gap-1"
        >
          <Cloud className="h-3 w-3" />
          Cloud Execution
        </Badge>
      </div>

      {/* TABS */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6">
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
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-blue-500" />
                Cloud-Based Execution (BrowserStack)
              </CardTitle>
              <CardDescription>
                Mobile automation runs entirely on BrowserStack devices.
                No local Appium, ADB, or emulator setup required.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <div className="bg-muted p-4 rounded-lg space-y-3">
                <p className="font-medium">How it works:</p>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li>Configure BrowserStack credentials</li>
                  <li>Upload APK/IPA to BrowserStack</li>
                  <li>Record actions in the UI</li>
                  <li>Scripts are generated automatically</li>
                  <li>Tests run on real cloud devices</li>
                </ol>
              </div>
            </CardContent>
          </Card>

          {/* FEATURE CARDS */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setActiveTab("recorder")}
            >
              <CardHeader>
                <Circle className="h-8 w-8 text-red-500 mb-2" />
                <CardTitle className="text-lg">
                  Record & Playback
                </CardTitle>
                <CardDescription>
                  Capture real user actions and auto-generate reusable scripts.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setActiveTab("inspector")}
            >
              <CardHeader>
                <Search className="h-8 w-8 text-blue-500 mb-2" />
                <CardTitle className="text-lg">
                  Locator Finder
                </CardTitle>
                <CardDescription>
                  Inspect UI hierarchy and generate stable locators.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setActiveTab("terminal")}
            >
              <CardHeader>
                <Terminal className="h-8 w-8 text-green-500 mb-2" />
                <CardTitle className="text-lg">
                  Cloud Terminal
                </CardTitle>
                <CardDescription>
                  Execute cloud-safe commands and manage sessions.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setActiveTab("generator")}
            >
              <CardHeader>
                <Wand2 className="h-8 w-8 text-purple-500 mb-2" />
                <CardTitle className="text-lg">
                  Test Generator
                </CardTitle>
                <CardDescription>
                  Generate automation from natural language prompts.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>

          {/* PREREQUISITES */}
          <Card>
            <CardHeader>
              <CardTitle>Prerequisites</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <p className="font-medium">BrowserStack Account</p>
                  <p className="text-sm text-muted-foreground">
                    App Automate enabled
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="font-medium">App Upload</p>
                  <p className="text-sm text-muted-foreground">
                    APK / AAB uploaded to BrowserStack
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="font-medium">Environment Variables</p>
                  <p className="text-sm text-muted-foreground">
                    VITE_BS_USERNAME & ACCESS_KEY
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* OTHER TABS */}
        <TabsContent value="setup">
          <MobileSetupWizard />
        </TabsContent>

        <TabsContent value="recorder">
          <MobileRecorder />
        </TabsContent>

        <TabsContent value="inspector">
          <MobileInspector />
        </TabsContent>

        <TabsContent value="terminal">
          <MobileTerminal />
        </TabsContent>

        <TabsContent value="generator">
          <MobileTestGenerator />
        </TabsContent>
      </Tabs>
    </div>
  );
}
