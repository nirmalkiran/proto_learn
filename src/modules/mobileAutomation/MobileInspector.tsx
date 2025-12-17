import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, Copy, ChevronRight, ChevronDown } from "lucide-react";
import { toast } from "sonner";

interface UINode {
  class: string;
  resourceId?: string;
  text?: string;
  contentDesc?: string;
  bounds?: string;
  clickable?: boolean;
  children?: UINode[];
}

const SAMPLE_HIERARCHY: UINode = {
  class: "android.widget.FrameLayout",
  children: [
    {
      class: "android.widget.LinearLayout",
      children: [
        {
          class: "android.widget.ImageView",
          resourceId: "com.example:id/logo",
          contentDesc: "App Logo",
          bounds: "[0,100][1080,400]",
          clickable: false,
        },
        {
          class: "android.widget.EditText",
          resourceId: "com.example:id/email",
          text: "",
          bounds: "[50,450][1030,550]",
          clickable: true,
        },
        {
          class: "android.widget.EditText",
          resourceId: "com.example:id/password",
          text: "",
          bounds: "[50,570][1030,670]",
          clickable: true,
        },
        {
          class: "android.widget.Button",
          resourceId: "com.example:id/loginBtn",
          text: "Login",
          bounds: "[50,700][1030,800]",
          clickable: true,
        },
        {
          class: "android.widget.TextView",
          text: "Forgot Password?",
          bounds: "[350,830][730,880]",
          clickable: true,
        },
      ],
    },
  ],
};

export default function MobileInspector() {
  const [hierarchy, setHierarchy] = useState<UINode | null>(null);
  const [selectedNode, setSelectedNode] = useState<UINode | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchHierarchy = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("http://localhost:3001/api/hierarchy");
      const data = await res.json();
      if (data.hierarchy) {
        setHierarchy(data.hierarchy);
        toast.success("Hierarchy loaded");
      }
    } catch {
      setHierarchy(SAMPLE_HIERARCHY);
      toast.info("Demo mode: Loaded sample hierarchy");
    } finally {
      setIsLoading(false);
    }
  };

  const generateLocators = (node: UINode) => {
    const locators: { type: string; value: string; confidence: string }[] = [];

    if (node.resourceId) {
      locators.push({
        type: "ID",
        value: `driver.findElement(By.id("${node.resourceId}"))`,
        confidence: "high",
      });
      locators.push({
        type: "XPath (ID)",
        value: `//*[@resource-id='${node.resourceId}']`,
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

    if (node.contentDesc) {
      locators.push({
        type: "Accessibility ID",
        value: `driver.findElement(By.accessibilityId("${node.contentDesc}"))`,
        confidence: "high",
      });
    }

    locators.push({
      type: "XPath (class)",
      value: `//${node.class}`,
      confidence: "low",
    });

    return locators;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const TreeNode = ({ node, depth = 0 }: { node: UINode; depth?: number }) => {
    const [expanded, setExpanded] = useState(depth < 2);
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = selectedNode === node;

    return (
      <div style={{ marginLeft: depth * 16 }}>
        <div
          className={`flex items-center gap-2 py-1 px-2 rounded cursor-pointer hover:bg-muted ${
            isSelected ? "bg-primary/10 border border-primary/30" : ""
          }`}
          onClick={() => setSelectedNode(node)}
        >
          {hasChildren ? (
            <button onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <span className="w-4" />
          )}
          <span className="text-sm font-mono">
            {node.class.split(".").pop()}
          </span>
          {node.resourceId && (
            <Badge variant="outline" className="text-xs">
              {node.resourceId.split("/").pop()}
            </Badge>
          )}
          {node.text && (
            <span className="text-xs text-muted-foreground truncate max-w-[150px]">
              "{node.text}"
            </span>
          )}
        </div>
        {expanded && hasChildren && (
          <div>
            {node.children!.map((child, idx) => (
              <TreeNode key={idx} node={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Locator Finder / Inspector</h2>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Hierarchy Tree */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>UI Hierarchy</CardTitle>
                <CardDescription>Click element to see locators</CardDescription>
              </div>
              <Button onClick={fetchHierarchy} disabled={isLoading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                {hierarchy ? "Refresh" : "Load Hierarchy"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px] border rounded-lg p-2">
              {hierarchy ? (
                <TreeNode node={hierarchy} />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <p>Click "Load Hierarchy" to fetch UI tree</p>
                  <p className="text-sm mt-2">Requires connected device & Appium session</p>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Locator Details */}
        <Card>
          <CardHeader>
            <CardTitle>Element Locators</CardTitle>
            <CardDescription>
              {selectedNode ? "Generated locator strategies" : "Select an element to view locators"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedNode ? (
              <div className="space-y-4">
                <div className="bg-muted p-4 rounded-lg space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Class:</span>
                    <span className="text-sm font-mono">{selectedNode.class}</span>
                  </div>
                  {selectedNode.resourceId && (
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Resource ID:</span>
                      <span className="text-sm font-mono">{selectedNode.resourceId}</span>
                    </div>
                  )}
                  {selectedNode.text && (
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Text:</span>
                      <span className="text-sm">{selectedNode.text}</span>
                    </div>
                  )}
                  {selectedNode.bounds && (
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Bounds:</span>
                      <span className="text-sm font-mono">{selectedNode.bounds}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Clickable:</span>
                    <Badge variant={selectedNode.clickable ? "default" : "secondary"}>
                      {selectedNode.clickable ? "Yes" : "No"}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium">Suggested Locators</h4>
                  {generateLocators(selectedNode).map((loc, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 p-3 bg-zinc-950 rounded-lg"
                    >
                      <Badge
                        variant={
                          loc.confidence === "high"
                            ? "default"
                            : loc.confidence === "medium"
                            ? "secondary"
                            : "outline"
                        }
                        className="shrink-0"
                      >
                        {loc.type}
                      </Badge>
                      <code className="flex-1 text-xs text-zinc-300 truncate">
                        {loc.value}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={() => copyToClipboard(loc.value)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                Select an element from the hierarchy
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ADB Commands Reference */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Reference: Manual Hierarchy Dump</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="font-medium mb-2">Using ADB + UIAutomator</h4>
              <pre className="bg-zinc-950 text-zinc-100 p-3 rounded text-xs">
{`# Dump UI hierarchy to device
adb shell uiautomator dump

# Pull to local machine
adb pull /sdcard/window_dump.xml

# View in browser or parse with tool`}
              </pre>
            </div>
            <div>
              <h4 className="font-medium mb-2">Using Appium Inspector</h4>
              <pre className="bg-zinc-950 text-zinc-100 p-3 rounded text-xs">
{`# 1. Start Appium server
appium --port 4723

# 2. Open Appium Inspector app
# 3. Connect with capabilities:
{
  "platformName": "Android",
  "appium:automationName": "UiAutomator2",
  "appium:deviceName": "emulator-5554"
}`}
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
