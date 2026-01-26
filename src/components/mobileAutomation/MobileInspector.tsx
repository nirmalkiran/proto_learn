import { useState, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, ExternalLink, Smartphone, Download } from "lucide-react";
import { toast } from "sonner";

/* =====================================================
   TYPES
===================================================== */

interface SelectedElement {
  class: string;
  resourceId?: string;
  text?: string;
  contentDesc?: string;
}

const AGENT_URL = "http://localhost:3001";
const projectId = "c4a1b02d-7682-4c28-874b-6e9f9024c0e9";
/* =====================================================
   COMPONENT
===================================================== */

export default function MobileInspector() {
  /* ---------- Inspector ---------- */
  const [selectedNode, setSelectedNode] =
    useState<SelectedElement | null>(null);
  const [opening, setOpening] = useState(false);

  /* ---------- Device Config ---------- */
  const [config, setConfig] = useState({
    appiumHost: "127.0.0.1",
    appiumPort: "4723",
    deviceName: "emulator-5554",
    platformVersion: "14",
    appPath: "", // optional .apk path
    appPackage: "com.example.app",
    appActivity: "com.example.app.MainActivity",
  });

  const updateConfig = (k: string, v: string) =>
    setConfig((p) => ({ ...p, [k]: v }));

  /* =====================================================
     OPEN LOCAL APPIUM INSPECTOR
  ===================================================== */

  const openLocalInspector = async () => {
    try {
      setOpening(true);
      const res = await fetch(`${AGENT_URL}/appium/inspector`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to open inspector");
      }
      toast.success("Local Appium Inspector opened");
    } catch (err: any) {
      console.error("[MobileInspector] Open inspector error:", err);
      toast.error("Failed to open Local Appium Inspector", {
        description: err.message || "Check if Appium server is running"
      });
    } finally {
      setOpening(false);
    }
  };

  /* =====================================================
     LOCATOR GENERATION
  ===================================================== */

  const generateLocators = (node: SelectedElement) => {
    const locators: { type: string; value: string; confidence: string }[] = [];

    if (node.resourceId) {
      locators.push({
        type: "ID (Recommended)",
        value: `By.id("${node.resourceId}")`,
        confidence: "high",
      });
      locators.push({
        type: "XPath (resource-id)",
        value: `//*[@resource-id='${node.resourceId}']`,
        confidence: "high",
      });
    }

    if (node.contentDesc) {
      locators.push({
        type: "Accessibility ID",
        value: `By.accessibilityId("${node.contentDesc}")`,
        confidence: "high",
      });
    }

    if (node.text) {
      locators.push({
        type: "XPath (text)",
        value: `//${node.class}[@text='${node.text}']`,
        confidence: "medium",
      });
    }

    locators.push({
      type: "XPath (fallback)",
      value: `//${node.class}`,
      confidence: "low",
    });

    return locators;
  };

  /* =====================================================
     GENERATED CAPS & ENV
  ===================================================== */

  const capabilities = useMemo(
    () => ({
      platformName: "Android",
      "appium:automationName": "UiAutomator2",
      "appium:deviceName": config.deviceName,
      "appium:platformVersion": config.platformVersion,
      //"appium:app": config.appPath,
      "appium:appPackage": config.appPackage,
      "appium:appActivity": config.appActivity,
      "appium:noReset": true,
      "appium:newCommandTimeout": 300,
    }),
    [config]
  );

  const envFile = useMemo(
    () => `# Mobile Automation Environment
APPIUM_HOST=${config.appiumHost}
APPIUM_PORT=${config.appiumPort}
DEVICE_NAME=${config.deviceName}
PLATFORM_VERSION=${config.platformVersion}
#APP_PATH=${config.appPath}
APP_PACKAGE=${config.appPackage}
APP_ACTIVITY=${config.appActivity}
BACKEND_PORT=3001`,
    [config]
  );

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const download = (content: string, name: string) => {
    const blob = new Blob([content], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
  };

  const saveCapabilities = async () => {
    try {
      await fetch("http://localhost:3001/capabilities/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          capabilities,
        }),
      });

      toast.success("Capabilities saved for this project");
    } catch {
      toast.error("Failed to save capabilities");
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Local Appium Inspector & Configuration</h2>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* LEFT: INSPECTOR */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Local Appium Inspector
            </CardTitle>
            <CardDescription>
              Inspect UI elements from emulator or real device
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              1. Start Appium & Emulator
              <br />
              2. Click button below
              <br />
              3. Inspect element properties
              <br />
              4. Paste values to generate locators
            </p>

            <Button
              variant="outline"
              className="w-full"
              onClick={openLocalInspector}
              disabled={opening}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Open Local Appium Inspector
            </Button>

            <Badge variant="secondary">
              Local • Emulator / Device
            </Badge>
          </CardContent>
        </Card>

        {/* RIGHT: DEVICE CONFIG */}
        <Card>
          <CardHeader>
            <CardTitle>Device Configuration</CardTitle>
            <CardDescription>
              Appium capabilities setup
            </CardDescription>
          </CardHeader>

          <CardContent className="grid grid-cols-2 gap-3">
            {Object.entries(config).map(([k, v]) => (
              <input
                key={k}
                className="border rounded p-2 text-sm"
                value={v}
                onChange={(e) => updateConfig(k, e.target.value)}
                placeholder={k}
              />
            ))}
          </CardContent>
        </Card>
      </div>

      {/* LOCATOR GENERATOR */}
      <Card>
        <CardHeader>
          <CardTitle>Generated Locators</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            className="w-full border rounded p-2 text-sm"
            placeholder="Class (android.widget.Button)"
            onChange={(e) =>
              setSelectedNode((p) => ({ ...p, class: e.target.value }) as any)
            }
          />
          <input
            className="w-full border rounded p-2 text-sm"
            placeholder="Resource ID"
            onChange={(e) =>
              setSelectedNode((p) => ({ ...p, resourceId: e.target.value }) as any)
            }
          />
          <input
            className="w-full border rounded p-2 text-sm"
            placeholder="Accessibility ID"
            onChange={(e) =>
              setSelectedNode((p) => ({ ...p, contentDesc: e.target.value }) as any)
            }
          />
          <input
            className="w-full border rounded p-2 text-sm"
            placeholder="Text"
            onChange={(e) =>
              setSelectedNode((p) => ({ ...p, text: e.target.value }) as any)
            }
          />

          {selectedNode?.class &&
            generateLocators(selectedNode).map((l, i) => (
              <div
                key={i}
                className="flex items-center gap-2 p-3 bg-zinc-950 rounded"
              >
                <Badge>{l.type}</Badge>
                <code className="flex-1 text-xs text-zinc-300 truncate">
                  {l.value}
                </code>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => copyText(l.value, "Locator")}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            ))}
        </CardContent>
      </Card>

      {/* GENERATED CAPS */}
      <Card>
        <CardHeader className="flex flex-row justify-between items-center">
          <CardTitle>Generated Capabilities</CardTitle>
          <div className="flex gap-2">
            <Button onClick={saveCapabilities} variant="outline" className="w-full">
              Save Capabilities
            </Button>
            <Button
              size="icon"
              variant="outline"
              onClick={() =>
                copyText(JSON.stringify(capabilities, null, 2), "Capabilities")
              }
            >

              <Copy className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              onClick={() =>
                download(
                  JSON.stringify(capabilities, null, 2),
                  "capabilities.json"
                )
              }
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <pre className="bg-black text-white p-4 rounded text-xs overflow-x-auto">
            {JSON.stringify(capabilities, null, 2)}
          </pre>
        </CardContent>
      </Card>

      {/* ENV */}
      <Card>
        <CardHeader>
          <CardTitle>Environment File (.env)</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="bg-black text-white p-4 rounded text-xs overflow-x-auto">
            {envFile}
          </pre>
          <Button
            className="mt-3"
            variant="outline"
            onClick={() => download(envFile, ".env")}
          >
            <Download className="mr-2 h-4 w-4" />
            Download .env
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
