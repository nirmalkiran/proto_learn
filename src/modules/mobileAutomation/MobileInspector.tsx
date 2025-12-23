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
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

/**
 * NOTE:
 * UI hierarchy is fetched from BrowserStack Inspector (cloud).
 * We DO NOT fetch raw XML directly in frontend (security + credits).
 */

interface SelectedElement {
  class: string;
  resourceId?: string;
  text?: string;
  contentDesc?: string;
}

export default function MobileInspector() {
  const [selectedNode, setSelectedNode] = useState<SelectedElement | null>(null);

  /**
   * Locator generation logic (kept from your original implementation)
   */
  const generateLocators = (node: SelectedElement) => {
    const locators: { type: string; value: string; confidence: string }[] = [];

    if (node.resourceId) {
      locators.push({
        type: "ID",
        value: `By.id("${node.resourceId}")`,
        confidence: "high",
      });
      locators.push({
        type: "XPath (resource-id)",
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
        value: `By.accessibilityId("${node.contentDesc}")`,
        confidence: "high",
      });
    }

    locators.push({
      type: "XPath (class only)",
      value: `//${node.class}`,
      confidence: "low",
    });

    return locators;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Locator copied");
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Locator Finder / Inspector (Cloud)</h2>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* LEFT: BrowserStack Inspector */}
        <Card>
          <CardHeader>
            <CardTitle>BrowserStack Inspector</CardTitle>
            <CardDescription>
              Inspect live mobile UI running on BrowserStack
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              1. Start a mobile test run  
              <br />
              2. Open BrowserStack Inspector  
              <br />
              3. Click elements to view properties  
              <br />
              4. Manually select element details below
            </p>

            <Button
              variant="outline"
              className="w-full"
              onClick={() =>
                window.open(
                  "https://app-automate.browserstack.com/dashboard/v2/quick-start",
                  "_blank"
                )
              }
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Open BrowserStack Inspector
            </Button>

            <Badge variant="secondary">
              Cloud-based · No local device required
            </Badge>
          </CardContent>
        </Card>

        {/* RIGHT: Locator Generator */}
        <Card>
          <CardHeader>
            <CardTitle>Generated Locators</CardTitle>
            <CardDescription>
              Paste element details from BrowserStack Inspector
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Simple manual input (matches BrowserStack Inspector fields) */}
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
                placeholder="Resource ID (optional)"
                onChange={(e) =>
                  setSelectedNode((prev) => ({
                    ...prev,
                    resourceId: e.target.value,
                  }) as SelectedElement)
                }
              />
              <input
                className="w-full border rounded p-2 text-sm"
                placeholder="Text (optional)"
                onChange={(e) =>
                  setSelectedNode((prev) => ({
                    ...prev,
                    text: e.target.value,
                  }) as SelectedElement)
                }
              />
              <input
                className="w-full border rounded p-2 text-sm"
                placeholder="Accessibility ID (optional)"
                onChange={(e) =>
                  setSelectedNode((prev) => ({
                    ...prev,
                    contentDesc: e.target.value,
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
