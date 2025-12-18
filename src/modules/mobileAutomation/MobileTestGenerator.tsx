import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wand2, Copy, Download, FileText, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface UserStory {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  project_id: string;
}

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
  form: {
    description: "Fill and submit form",
    actions: [
      { type: "tap", locator: "//android.widget.EditText[1]", comment: "Tap first field" },
      { type: "input", locator: "//android.widget.EditText[1]", value: "${field1}", comment: "Enter first field value" },
      { type: "tap", locator: "//android.widget.EditText[2]", comment: "Tap second field" },
      { type: "input", locator: "//android.widget.EditText[2]", value: "${field2}", comment: "Enter second field value" },
      { type: "tap", locator: "//android.widget.Button[contains(@text,'Submit') or contains(@text,'Save')]", comment: "Submit form" },
      { type: "wait", duration: 2000, comment: "Wait for response" },
    ],
  },
};

export default function MobileTestGenerator() {
  const [prompt, setPrompt] = useState("");
  const [generatedActions, setGeneratedActions] = useState<any[] | null>(null);
  const [generatedScript, setGeneratedScript] = useState<string>("");
  const [matchedTemplate, setMatchedTemplate] = useState<string>("");
  const [scriptLang, setScriptLang] = useState<"javascript" | "python">("javascript");
  
  // User Stories
  const [userStories, setUserStories] = useState<UserStory[]>([]);
  const [selectedStoryId, setSelectedStoryId] = useState<string>("");
  const [isLoadingStories, setIsLoadingStories] = useState(false);
  const [activeSource, setActiveSource] = useState<"prompt" | "story">("prompt");

  useEffect(() => {
    fetchUserStories();
  }, []);

  const fetchUserStories = async () => {
    setIsLoadingStories(true);
    try {
      const { data, error } = await supabase
        .from("user_stories")
        .select("id, title, description, status, project_id")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setUserStories(data || []);
    } catch (error) {
      console.error("Error fetching user stories:", error);
    } finally {
      setIsLoadingStories(false);
    }
  };

  const parsePrompt = (input: string): { template: string; params: Record<string, string> } => {
    const lower = input.toLowerCase();
    let template = "";
    const params: Record<string, string> = {};

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
    } else if (lower.includes("form") || lower.includes("fill") || lower.includes("submit") || lower.includes("input")) {
      template = "form";
    }

    const emailMatch = input.match(/email[:\s]+([^\s,]+)/i);
    if (emailMatch) params.email = emailMatch[1];

    const passwordMatch = input.match(/password[:\s]+([^\s,]+)/i);
    if (passwordMatch) params.password = passwordMatch[1];

    const searchMatch = input.match(/search(?:\s+for)?[:\s]+["']?([^"',]+)["']?/i);
    if (searchMatch) params.searchQuery = searchMatch[1].trim();

    return { template, params };
  };

  const generateJavaScriptScript = (actions: any[]) => {
    return `// Auto-generated Appium Test (JavaScript)
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

  const generatePythonScript = (actions: any[]) => {
    return `# Auto-generated Appium Test (Python/Pytest)
import pytest
from appium import webdriver
from appium.options.android import UiAutomator2Options
from appium.webdriver.common.appiumby import AppiumBy
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time

class TestMobileApp:
    @pytest.fixture(autouse=True)
    def setup(self):
        options = UiAutomator2Options()
        options.platform_name = "Android"
        options.device_name = "emulator-5554"
        options.app = "/path/to/app.apk"
        
        self.driver = webdriver.Remote(
            "http://localhost:4723",
            options=options
        )
        self.wait = WebDriverWait(self.driver, 10)
        yield
        self.driver.quit()

    def test_generated_flow(self):
        """Auto-generated test from ${activeSource === "story" ? "user story" : "prompt"}"""
${actions.map((a) => {
  const comment = a.comment ? `        # ${a.comment}\n` : "";
  switch (a.type) {
    case "tap":
      return `${comment}        self.wait.until(EC.element_to_be_clickable((AppiumBy.XPATH, "${a.locator}"))).click()`;
    case "input":
      return `${comment}        self.wait.until(EC.presence_of_element_located((AppiumBy.XPATH, "${a.locator}"))).send_keys("${a.value}")`;
    case "swipe":
      return `${comment}        # Swipe ${a.direction}`;
    case "wait":
      return `${comment}        time.sleep(${(a.duration || 1000) / 1000})`;
    case "assert":
      return `${comment}        assert self.wait.until(EC.visibility_of_element_located((AppiumBy.XPATH, "${a.locator}")))`;
    default:
      return "";
  }
}).join("\n")}

# Run with: pytest test_generated.py -v
`;
  };

  const generateScript = (actions: any[]) => {
    return scriptLang === "python" ? generatePythonScript(actions) : generateJavaScriptScript(actions);
  };

  const handleGenerate = () => {
    if (!prompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }

    const { template, params } = parsePrompt(prompt);

    if (!template || !TEMPLATES[template]) {
      toast.error("Could not match template. Try: login, signup, search, navigate, scroll, form");
      return;
    }

    setMatchedTemplate(template);

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

  const handleGenerateFromStory = () => {
    const story = userStories.find((s) => s.id === selectedStoryId);
    if (!story) {
      toast.error("Please select a user story");
      return;
    }

    // Combine title and description for parsing
    const fullText = `${story.title} ${story.description || ""}`;
    const { template, params } = parsePrompt(fullText);

    if (!template || !TEMPLATES[template]) {
      // Try to find the best match based on keywords
      const keywords: Record<string, string[]> = {
        login: ["login", "sign in", "authenticate", "credentials", "password"],
        signup: ["register", "sign up", "create account", "new user"],
        navigation: ["navigate", "menu", "go to", "open", "click on"],
        search: ["search", "find", "look for", "query"],
        scroll: ["scroll", "swipe", "list", "browse"],
        form: ["form", "fill", "submit", "input", "enter"],
      };

      const lower = fullText.toLowerCase();
      let bestMatch = "";
      let maxMatches = 0;

      for (const [key, words] of Object.entries(keywords)) {
        const matches = words.filter((w) => lower.includes(w)).length;
        if (matches > maxMatches) {
          maxMatches = matches;
          bestMatch = key;
        }
      }

      if (!bestMatch) {
        toast.error("Could not determine test type from story. Using form template.");
        bestMatch = "form";
      }

      setMatchedTemplate(bestMatch);
      const actions = JSON.parse(JSON.stringify(TEMPLATES[bestMatch].actions));
      actions[0].comment = `Test for: ${story.title}`;
      setGeneratedActions(actions);
      setGeneratedScript(generateScript(actions));
      toast.success(`Generated ${bestMatch} flow from user story`);
      return;
    }

    setMatchedTemplate(template);
    let actions = JSON.parse(JSON.stringify(TEMPLATES[template].actions));
    actions = actions.map((action: any) => {
      if (action.value) {
        Object.keys(params).forEach((key) => {
          action.value = action.value.replace(`\${${key}}`, params[key]);
        });
      }
      return action;
    });
    actions[0].comment = `Test for: ${story.title}`;

    setGeneratedActions(actions);
    setGeneratedScript(generateScript(actions));
    toast.success(`Generated ${template} flow from user story with ${actions.length} actions`);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const downloadScript = () => {
    const ext = scriptLang === "python" ? "py" : "spec.js";
    const blob = new Blob([generatedScript], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `generated_test.${ext}`;
    a.click();
    toast.success("Script downloaded");
  };

  // Update script when language changes
  useEffect(() => {
    if (generatedActions) {
      setGeneratedScript(generateScript(generatedActions));
    }
  }, [scriptLang, generatedActions]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold">Test Generator</h2>
        <Badge variant="secondary">Template-based (No API)</Badge>
      </div>

      <Tabs value={activeSource} onValueChange={(v) => setActiveSource(v as "prompt" | "story")}>
        <TabsList>
          <TabsTrigger value="prompt">From Prompt</TabsTrigger>
          <TabsTrigger value="story">
            <FileText className="mr-2 h-4 w-4" />
            From User Story
          </TabsTrigger>
        </TabsList>

        <TabsContent value="prompt">
          <Card>
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
                {["Login with email user@test.com", "Search for 'coffee shops'", "Navigate to Settings", "Fill form and submit"].map((example) => (
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
        </TabsContent>

        <TabsContent value="story">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Generate from User Story</CardTitle>
                  <CardDescription>
                    Select a user story from your database to generate a mobile test.
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={fetchUserStories} disabled={isLoadingStories}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingStories ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {userStories.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No user stories found.</p>
                  <p className="text-sm">Create user stories in the User Stories section first.</p>
                </div>
              ) : (
                <>
                  <Select value={selectedStoryId} onValueChange={setSelectedStoryId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a user story..." />
                    </SelectTrigger>
                    <SelectContent>
                      {userStories.map((story) => (
                        <SelectItem key={story.id} value={story.id}>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {story.status || "draft"}
                            </Badge>
                            <span className="truncate max-w-[300px]">{story.title}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {selectedStoryId && (
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="font-medium">
                        {userStories.find((s) => s.id === selectedStoryId)?.title}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {userStories.find((s) => s.id === selectedStoryId)?.description || "No description"}
                      </p>
                    </div>
                  )}

                  <Button onClick={handleGenerateFromStory} className="w-full" disabled={!selectedStoryId}>
                    <Wand2 className="mr-2 h-4 w-4" /> Generate from Story
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Available Templates */}
      <Card>
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
                onClick={() => {
                  setActiveSource("prompt");
                  setPrompt(`${key} flow`);
                }}
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
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Generated Actions (JSON)</CardTitle>
                <Button variant="outline" size="sm" onClick={() => copyToClipboard(JSON.stringify(generatedActions, null, 2))}>
                  <Copy className="mr-1 h-3 w-3" /> Copy
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[200px]">
                <pre className="bg-zinc-950 text-zinc-100 p-4 rounded-lg overflow-x-auto text-sm">
                  {JSON.stringify(generatedActions, null, 2)}
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Generated Test Script</CardTitle>
                <div className="flex gap-2">
                  <Tabs value={scriptLang} onValueChange={(v) => setScriptLang(v as "javascript" | "python")}>
                    <TabsList className="h-8">
                      <TabsTrigger value="javascript" className="text-xs">JavaScript</TabsTrigger>
                      <TabsTrigger value="python" className="text-xs">Python</TabsTrigger>
                    </TabsList>
                  </Tabs>
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
              <ScrollArea className="h-[400px]">
                <pre className="bg-zinc-950 text-zinc-100 p-4 rounded-lg overflow-x-auto text-sm">
                  {generatedScript}
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
