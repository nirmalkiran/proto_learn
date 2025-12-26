import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, ExternalLink, Smartphone } from "lucide-react";
import { toast } from "sonner";

/**
 * LOCAL APPIUM INSPECTOR
 * - Works with local Appium + Emulator / Real Device
 * - Inspector is opened via local agent
 * - QA pastes inspected values to generate locators
 */

interface SelectedElement {
  class: string;
  resourceId?: string;
  text?: string;
  contentDesc?: string;
}

const AGENT_URL = "http://localhost:3001";

export default function MobileInspector() {
  const [selectedNode, setSelectedNode] = useState<SelectedElement | null>(null);
  const [opening, setOpening] = useState(false);

  /* =====================================================
   * 🔹 OPEN LOCAL APPIUM INSPECTOR
   * ===================================================== */
  const openLocalInspector = async () => {
    try {
      setOpening(true);
      const res = await fetch(`${AGENT_URL}/appium/inspector`, {
        method: "POST",
      });
      const data = await res.json();

      if (!data.success) throw new Error();

      toast.success("Local Appium Inspector opened");
    } catch {
      toast.error("Failed to open Local Appium Inspector");
    } finally {
      setOpening(false);
    }
  };

  /* =====================================================
   * 🔹 LOCATOR GENERATION (STABLE-FIRST)
   * ===================================================== */
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Locator copied");
  };

  /* =====================================================
   * 🔹 UI
   * ===================================================== */
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">
        Local Appium Inspector
      </h2>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* LEFT: LOCAL INSPECTOR */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Open Local Appium Inspector
            </CardTitle>
            <CardDescription>
              Inspect UI elements from your local emulator or real device
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              How to use:
              <br />
              1. Start Appium & Emulator from Setup tab  
              <br />
              2. Click the button below  
              <br />
              3. Inspect element properties in Appium Inspector  
              <br />
              4. Paste values on the right to generate locators
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
              Local • Emulator / Real Device
            </Badge>
          </CardContent>
        </Card>

        {/* RIGHT: LOCATOR GENERATOR */}
        <Card>
          <CardHeader>
            <CardTitle>Generated Locators</CardTitle>
            <CardDescription>
              Paste element details from Local Appium Inspector
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-2">
              <input
                className="w-full border rounded p-2 text-sm"
                placeholder="Class (e.g. android.widget.Button)"
                onChange={(e) =>
                  setSelectedNode((prev) => ({
                    ...prev,
                    class: e.target.value,
                  }) as SelectedElement)
                }
              />

              <input
                className="w-full border rounded p-2 text-sm"
                placeholder="Resource ID (best option)"
                onChange={(e) =>
                  setSelectedNode((prev) => ({
                    ...prev,
                    resourceId: e.target.value,
                  }) as SelectedElement)
                }
              />

              <input
                className="w-full border rounded p-2 text-sm"
                placeholder="Accessibility ID (content-desc)"
                onChange={(e) =>
                  setSelectedNode((prev) => ({
                    ...prev,
                    contentDesc: e.target.value,
                  }) as SelectedElement)
                }
              />

              <input
                className="w-full border rounded p-2 text-sm"
                placeholder="Visible text (optional)"
                onChange={(e) =>
                  setSelectedNode((prev) => ({
                    ...prev,
                    text: e.target.value,
                  }) as SelectedElement)
                }
              />
            </div>

            {selectedNode?.class ? (
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
                    >
                      {loc.type}
                    </Badge>

                    <code className="flex-1 text-xs text-zinc-300 truncate">
                      {loc.value}
                    </code>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyToClipboard(loc.value)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Enter element details to generate locators
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
