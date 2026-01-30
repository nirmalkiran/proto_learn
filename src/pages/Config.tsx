import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Copy, Download, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

export default function Config() {
  const [config, setConfig] = useState({
    appiumHost: "localhost",
    appiumPort: "4723",
    deviceName: "",
    platformVersion: "13",
    appPath: "/path/to/app.apk",
    appPackage: "com.example.app",
    appActivity: "com.example.app.MainActivity",
  });

  const generateCapabilities = () => {
    return {
      platformName: "Android",
      "appium:automationName": "UiAutomator2",
      "appium:deviceName": config.deviceName,
      "appium:platformVersion": config.platformVersion,
      "appium:app": config.appPath,
      "appium:appPackage": config.appPackage,
      "appium:appActivity": config.appActivity,
      "appium:noReset": true,
    };
  };

  const generateEnvFile = () => {
    return `# Mobile Automation Environment
APPIUM_HOST=${config.appiumHost}
APPIUM_PORT=${config.appiumPort}
DEVICE_NAME=${config.deviceName}
PLATFORM_VERSION=${config.platformVersion}
APP_PATH=${config.appPath}
APP_PACKAGE=${config.appPackage}
APP_ACTIVITY=${config.appActivity}
BACKEND_PORT=3001`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    toast.success(`${filename} downloaded`);
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="container mx-auto max-w-4xl">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <h1 className="text-2xl font-bold">Configuration</h1>
        </div>

        <Tabs defaultValue="setup">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="setup">Setup Guide</TabsTrigger>
            <TabsTrigger value="config">Capabilities</TabsTrigger>
            <TabsTrigger value="commands">Commands</TabsTrigger>
          </TabsList>

          <TabsContent value="setup">
            <Card>
              <CardHeader>
                <CardTitle>Environment Setup Checklist</CardTitle>
                <CardDescription>Complete these steps to run the automation framework</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {[
                  {
                    title: "1. Install Java JDK 11+",
                    cmd: "java -version",
                    note: "Download from adoptium.net",
                  },
                  {
                    title: "2. Install Android SDK",
                    cmd: "echo $ANDROID_HOME",
                    note: "Set ANDROID_HOME environment variable",
                  },
                  {
                    title: "3. Install Node.js 18+",
                    cmd: "node --version",
                    note: "Download from nodejs.org",
                  },
                  {
                    title: "4. Install Appium 2.x",
                    cmd: "npm install -g appium\nappium driver install uiautomator2",
                    note: "Global installation",
                  },
                  {
                    title: "5. Start Android Emulator",
                    cmd: "emulator -avd Pixel_6_API_33 &",
                    note: "Or connect physical device with USB debugging",
                  },
                  {
                    title: "6. Start Appium Server",
                    cmd: "appium --port 4723 --allow-cors",
                    note: "Keep running in separate terminal",
                  },
                  {
                    title: "7. Start Backend Server",
                    cmd: "cd backend && npm install && node server.js",
                    note: "Runs on port 3001",
                  },
                ].map((step, idx) => (
                  <div key={idx} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium">{step.title}</h4>
                      <Badge variant="outline">{step.note}</Badge>
                    </div>
                    <pre className="bg-zinc-950 text-zinc-100 p-3 rounded text-sm">
                      {step.cmd}
                    </pre>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="config">
            <Card>
              <CardHeader>
                <CardTitle>Device Configuration</CardTitle>
                <CardDescription>Configure Appium capabilities for your device</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Appium Host</Label>
                    <Input
                      value={config.appiumHost}
                      onChange={(e) => setConfig({ ...config, appiumHost: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Appium Port</Label>
                    <Input
                      value={config.appiumPort}
                      onChange={(e) => setConfig({ ...config, appiumPort: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Device Name</Label>
                    <Input
                      value={config.deviceName}
                      onChange={(e) => setConfig({ ...config, deviceName: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Platform Version</Label>
                    <Input
                      value={config.platformVersion}
                      onChange={(e) => setConfig({ ...config, platformVersion: e.target.value })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>App Path (APK)</Label>
                    <Input
                      value={config.appPath}
                      onChange={(e) => setConfig({ ...config, appPath: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>App Package</Label>
                    <Input
                      value={config.appPackage}
                      onChange={(e) => setConfig({ ...config, appPackage: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>App Activity</Label>
                    <Input
                      value={config.appActivity}
                      onChange={(e) => setConfig({ ...config, appActivity: e.target.value })}
                    />
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">Generated Capabilities</h4>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(JSON.stringify(generateCapabilities(), null, 2))}
                      >
                        <Copy className="mr-1 h-3 w-3" /> Copy
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadFile(JSON.stringify(generateCapabilities(), null, 2), "capabilities.json")}
                      >
                        <Download className="mr-1 h-3 w-3" /> Download
                      </Button>
                    </div>
                  </div>
                  <pre className="bg-zinc-950 text-zinc-100 p-4 rounded-lg text-sm overflow-x-auto">
                    {JSON.stringify(generateCapabilities(), null, 2)}
                  </pre>
                </div>

                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">Environment File (.env)</h4>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadFile(generateEnvFile(), ".env")}
                    >
                      <Download className="mr-1 h-3 w-3" /> Download
                    </Button>
                  </div>
                  <pre className="bg-zinc-950 text-zinc-100 p-4 rounded-lg text-sm">
                    {generateEnvFile()}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="commands">
            <Card>
              <CardHeader>
                <CardTitle>Useful Commands</CardTitle>
                <CardDescription>Common ADB and Appium commands for mobile automation</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  {
                    category: "Device Management",
                    commands: [
                      { cmd: "adb devices", desc: "List connected devices" },
                      { cmd: "adb -s DEVICE_ID shell", desc: "Open device shell" },
                      { cmd: "adb reboot", desc: "Reboot device" },
                    ],
                  },
                  {
                    category: "App Management",
                    commands: [
                      { cmd: "adb install app.apk", desc: "Install APK" },
                      { cmd: "adb uninstall com.example.app", desc: "Uninstall app" },
                      { cmd: "adb shell pm list packages | grep example", desc: "Find package name" },
                      { cmd: "adb shell dumpsys window | grep mCurrentFocus", desc: "Get current activity" },
                    ],
                  },
                  {
                    category: "UI Inspection",
                    commands: [
                      { cmd: "adb shell uiautomator dump", desc: "Dump UI hierarchy" },
                      { cmd: "adb pull /sdcard/window_dump.xml", desc: "Pull hierarchy file" },
                      { cmd: "adb shell screencap /sdcard/screen.png", desc: "Take screenshot" },
                    ],
                  },
                  {
                    category: "Appium Server",
                    commands: [
                      { cmd: "appium --port 4723 --allow-cors", desc: "Start Appium with CORS" },
                      { cmd: "appium driver list --installed", desc: "List installed drivers" },
                      { cmd: "curl http://localhost:4723/status", desc: "Check server status" },
                    ],
                  },
                ].map((cat) => (
                  <div key={cat.category} className="border rounded-lg p-4">
                    <h4 className="font-medium mb-3">{cat.category}</h4>
                    <div className="space-y-2">
                      {cat.commands.map((c) => (
                        <div
                          key={c.cmd}
                          className="flex items-center justify-between bg-muted p-2 rounded"
                        >
                          <div>
                            <code className="text-sm font-mono">{c.cmd}</code>
                            <p className="text-xs text-muted-foreground">{c.desc}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => copyToClipboard(c.cmd)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
