import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Wand2, Copy, Download } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

const TEMPLATES: Record<string, { actions: any[]; description: string }> = {
  login: {
    description: "User authentication flow",
    actions: [
      { type: "tap", locator: "//android.widget.EditText[@resource-id='*email*']", comment: "Tap email field" },
      { type: "input", locator: "//android.widget.EditText[@resource-id='*email*']", value: "${email}", comment: "Enter email" },
      { type: "tap", locator: "//android.widget.EditText[@resource-id='*password*']", comment: "Tap password field" },
      { type: "input", locator: "//android.widget.EditText[@resource-id='*password*']", value: "${password}", comment: "Enter password" },
      { type: "tap", locator: "//android.widget.Button[contains(@text,'Login') or contains(@text,'Sign')]", comment: "Tap login button" },
      { type: "wait", duration: 2000, comment: "Wait for navigation" },
      { type: "assert", locator: "//android.widget.TextView[contains(@text,'Welcome') or contains(@text,'Home')]", comment: "Verify login success" },
    ],
  },
  signup: {
    description: "User registration flow",
    actions: [
      { type: "tap", locator: "//android.widget.Button[contains(@text,'Sign Up') or contains(@text,'Register')]", comment: "Tap signup" },
      { type: "input", locator: "//android.widget.EditText[@resource-id='*name*']", value: "${name}", comment: "Enter name" },
      { type: "input", locator: "//android.widget.EditText[@resource-id='*email*']", value: "${email}", comment: "Enter email" },
      { type: "input", locator: "//android.widget.EditText[@resource-id='*password*']", value: "${password}", comment: "Enter password" },
      { type: "tap", locator: "//android.widget.Button[contains(@text,'Create') or contains(@text,'Submit')]", comment: "Submit form" },
    ],
  },
  navigation: {
    description: "Basic app navigation",
    actions: [
      { type: "tap", locator: "//android.widget.ImageButton[@content-desc='Navigate up']", comment: "Open menu" },
      { type: "tap", locator: "//android.widget.TextView[@text='${menuItem}']", comment: "Select menu item" },
      { type: "wait", duration: 1000, comment: "Wait for screen load" },
    ],
  },
  search: {
    description: "Search functionality",
    actions: [
      { type: "tap", locator: "//*[contains(@resource-id,'search')]", comment: "Tap search" },
      { type: "input", locator: "//android.widget.EditText", value: "${searchQuery}", comment: "Enter search term" },
      { type: "tap", locator: "//android.widget.TextView[@text='Search'] | //android.widget.ImageView[contains(@resource-id,'search')]", comment: "Execute search" },
      { type: "wait", duration: 2000, comment: "Wait for results" },
    ],
  },
  scroll: {
    description: "Scroll and find element",
    actions: [
      { type: "swipe", direction: "up", comment: "Scroll down" },
      { type: "wait", duration: 500 },
      { type: "swipe", direction: "up", comment: "Scroll more" },
      { type: "tap", locator: "//android.widget.TextView[@text='${targetText}']", comment: "Tap target element" },
    ],
  },
};

export default function TestGenerator() {
  const [prompt, setPrompt] = useState("");
  const [generatedActions, setGeneratedActions] = useState<any[] | null>(null);
  const [generatedScript, setGeneratedScript] = useState<string>("");
  const [matchedTemplate, setMatchedTemplate] = useState<string>("");

  const parsePrompt = (input: string): { template: string; params: Record<string, string> } => {
    const lower = input.toLowerCase();
    let template = "";
    const params: Record<string, string> = {};

    // Match templates based on keywords
    if (lower.includes("login") || lower.includes("sign in") || lower.includes("authenticate")) {
      template = "login";
    } else if (lower.includes("register") || lower.includes("sign up") || lower.includes("create account")) {
      template = "signup";
    } else if (lower.includes("navigate") || lower.includes("menu") || lower.includes("go to")) {
      template = "navigation";
    } else if (lower.includes("search") || lower.includes("find") || lower.includes("look for")) {
      template = "search";
    } else if (lower.includes("scroll") || lower.includes("swipe")) {
      template = "scroll";
    }

    // Extract parameters from prompt
    const emailMatch = input.match(/email[:\s]+([^\s,]+)/i);
    if (emailMatch) params.email = emailMatch[1];

    const passwordMatch = input.match(/password[:\s]+([^\s,]+)/i);
    if (passwordMatch) params.password = passwordMatch[1];

    const searchMatch = input.match(/search(?:\s+for)?[:\s]+["']?([^"',]+)["']?/i);
    if (searchMatch) params.searchQuery = searchMatch[1].trim();

    return { template, params };
  };

  const generateScript = (actions: any[]) => {
    return `// Auto-generated Appium Test
const { remote } = require('webdriverio');

describe('Generated Test', () => {
  let driver;

  before(async () => {
    driver = await remote({
      hostname: 'localhost',
      port: 4723,
      path: '/wd/hub',
      capabilities: {
        platformName: 'Android',
        'appium:automationName': 'UiAutomator2',
        'appium:deviceName': 'emulator-5554',
        'appium:app': process.env.APP_PATH || '/path/to/app.apk'
      }
    });
  });

  after(async () => {
    if (driver) await driver.deleteSession();
  });

  it('should execute generated test flow', async () => {
${actions.map((a) => {
  const comment = a.comment ? `    // ${a.comment}\n` : "";
  switch (a.type) {
    case "tap":
      return `${comment}    await driver.$(\`${a.locator}\`).click();`;
    case "input":
      return `${comment}    await driver.$(\`${a.locator}\`).setValue('${a.value}');`;
    case "swipe":
      return `${comment}    // TODO: Implement swipe ${a.direction}`;
    case "wait":
      return `${comment}    await driver.pause(${a.duration || 1000});`;
    case "assert":
      return `${comment}    await expect(driver.$(\`${a.locator}\`)).toBeDisplayed();`;
    default:
      return "";
  }
}).join("\n")}
  });
});`;
  };

  const handleGenerate = () => {
    if (!prompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }

    const { template, params } = parsePrompt(prompt);

    if (!template || !TEMPLATES[template]) {
      toast.error("Could not match template. Try: login, signup, search, navigate, scroll");
      return;
    }

    setMatchedTemplate(template);

    // Clone and substitute parameters
    let actions = JSON.parse(JSON.stringify(TEMPLATES[template].actions));
    actions = actions.map((action: any) => {
      if (action.value) {
        Object.keys(params).forEach((key) => {
          action.value = action.value.replace(`\${${key}}`, params[key]);
        });
      }
      if (action.locator) {
        Object.keys(params).forEach((key) => {
          action.locator = action.locator.replace(`\${${key}}`, params[key]);
        });
      }
      return action;
    });

    setGeneratedActions(actions);
    setGeneratedScript(generateScript(actions));
    toast.success(`Generated ${template} flow with ${actions.length} actions`);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const downloadScript = () => {
    const blob = new Blob([generatedScript], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "generated_test.spec.js";
    a.click();
    toast.success("Script downloaded");
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="container mx-auto max-w-4xl">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <h1 className="text-2xl font-bold">Test Generator</h1>
          <Badge variant="secondary">Template-based (No API)</Badge>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Generate from Prompt</CardTitle>
            <CardDescription>
              Describe your test scenario in natural language. Uses local templates - no LLM credits needed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Example: Login with email test@example.com and password secret123"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
            />
            <div className="flex flex-wrap gap-2">
              <span className="text-sm text-muted-foreground">Try:</span>
              {["Login with email user@test.com", "Search for 'coffee shops'", "Navigate to Settings", "Scroll and find Submit button"].map((example) => (
                <Button
                  key={example}
                  variant="outline"
                  size="sm"
                  onClick={() => setPrompt(example)}
                >
                  {example}
                </Button>
              ))}
            </div>
            <Button onClick={handleGenerate} className="w-full">
              <Wand2 className="mr-2 h-4 w-4" /> Generate Test
            </Button>
          </CardContent>
        </Card>

        {/* Available Templates */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Available Templates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-3">
              {Object.entries(TEMPLATES).map(([key, val]) => (
                <div
                  key={key}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    matchedTemplate === key ? "border-primary bg-primary/5" : "hover:border-primary/50"
                  }`}
                  onClick={() => setPrompt(`${key} flow`)}
                >
                  <p className="font-medium capitalize">{key}</p>
                  <p className="text-xs text-muted-foreground">{val.description}</p>
                  <Badge variant="outline" className="mt-2 text-xs">
                    {val.actions.length} steps
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Generated Output */}
        {generatedActions && (
          <>
            <Card className="mb-6">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Generated Actions (JSON)</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard(JSON.stringify(generatedActions, null, 2))}>
                    <Copy className="mr-1 h-3 w-3" /> Copy
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="bg-zinc-950 text-zinc-100 p-4 rounded-lg overflow-x-auto text-sm max-h-[300px]">
                  {JSON.stringify(generatedActions, null, 2)}
                </pre>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Generated Test Script</CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => copyToClipboard(generatedScript)}>
                      <Copy className="mr-1 h-3 w-3" /> Copy
                    </Button>
                    <Button variant="outline" size="sm" onClick={downloadScript}>
                      <Download className="mr-1 h-3 w-3" /> Download
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="bg-zinc-950 text-zinc-100 p-4 rounded-lg overflow-x-auto text-sm max-h-[400px]">
                  {generatedScript}
                </pre>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
