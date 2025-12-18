import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Smartphone, Circle, Search, Terminal, Wand2, AlertCircle, Settings } from "lucide-react";
import MobileRecorder from "./MobileRecorder";
import MobileInspector from "./MobileInspector";
import MobileTerminal from "./MobileTerminal";
import MobileTestGenerator from "./MobileTestGenerator";
import MobileSetupWizard from "./MobileSetupWizard";

export default function MobileAutomation() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Smartphone className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Mobile No-Code Automation</h1>
          <p className="text-muted-foreground">Android mobile testing with Appium - No coding required</p>
        </div>
        <Badge variant="outline" className="ml-auto">Local Execution</Badge>
      </div>

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

        <TabsContent value="overview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-amber-500" />
                Local Backend Required
              </CardTitle>
              <CardDescription>
                This module requires a local backend server to interact with Appium and connected devices.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-muted p-4 rounded-lg space-y-3">
                <p className="font-medium">Setup Instructions:</p>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li>Install Node.js and npm</li>
                  <li>Create a folder: <code className="bg-background px-1 rounded">mkdir mobile-backend && cd mobile-backend</code></li>
                  <li>Initialize: <code className="bg-background px-1 rounded">npm init -y && npm install express cors axios</code></li>
                  <li>Copy server.js from <code className="bg-background px-1 rounded">public/backend/server.js</code></li>
                  <li>Start server: <code className="bg-background px-1 rounded">node server.js</code></li>
                  <li>Ensure Appium is running: <code className="bg-background px-1 rounded">appium --port 4723</code></li>
                  <li>Connect Android device/emulator via ADB</li>
                </ol>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setActiveTab("recorder")}>
              <CardHeader>
                <Circle className="h-8 w-8 text-red-500 mb-2" />
                <CardTitle className="text-lg">Record & Playback</CardTitle>
                <CardDescription>
                  Build test flows by recording actions or adding them manually. Export as Appium scripts.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setActiveTab("inspector")}>
              <CardHeader>
                <Search className="h-8 w-8 text-blue-500 mb-2" />
                <CardTitle className="text-lg">Locator Finder</CardTitle>
                <CardDescription>
                  Inspect UI hierarchy and generate robust XPath/ID locators for your elements.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setActiveTab("terminal")}>
              <CardHeader>
                <Terminal className="h-8 w-8 text-green-500 mb-2" />
                <CardTitle className="text-lg">Terminal</CardTitle>
                <CardDescription>
                  Execute ADB and Appium commands directly. Debug device connections.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setActiveTab("generator")}>
              <CardHeader>
                <Wand2 className="h-8 w-8 text-purple-500 mb-2" />
                <CardTitle className="text-lg">Test Generator</CardTitle>
                <CardDescription>
                  Generate tests from natural language prompts using built-in templates.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Prerequisites</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <p className="font-medium">Appium Server</p>
                  <p className="text-sm text-muted-foreground">
                    Install via npm: <code className="bg-muted px-1 rounded">npm i -g appium</code>
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="font-medium">Android SDK</p>
                  <p className="text-sm text-muted-foreground">
                    Required for ADB and emulator. Install via Android Studio.
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="font-medium">UiAutomator2 Driver</p>
                  <p className="text-sm text-muted-foreground">
                    Install: <code className="bg-muted px-1 rounded">appium driver install uiautomator2</code>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

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
