import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TestCase {
  id: string;
  title: string;
  description: string;
  steps: string[];
  testData?: string;
  expectedResult: string;
  priority: string;
  status: string;
  userStoryId: string;
  userStoryTitle: string;
  projectId?: string;
  readableId?: string;
}

interface GeneratedFiles {
  pageFile: string;
  stepFile: string;
  testFile: string;
  basePageFile?: string;
  baseStepsFile?: string;
  driverInitFile?: string;
  testngXmlFile?: string;
  pageClassName: string;
  stepClassName: string;
  testClassName: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    // Get user from request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));

    if (authError || !user) {
      throw new Error("Authentication failed");
    }

    const requestBody = await req.json();
    console.log("Received request body keys:", Object.keys(requestBody));
    console.log(
      "mockupImages type:",
      typeof requestBody.mockupImages,
      "isArray:",
      Array.isArray(requestBody.mockupImages),
    );

    const {
      testCase,
      testCases,
      userStoryTitle,
      projectName,
      projectId,
      saveToRepository = false,
      mockupImages = null,
      htmlDom = null,
      appUrl = null,
      selectedElements = null,
    } = requestBody;

    // Fetch Azure OpenAI configuration from integration_configs table
    let azureConfig = null;
    if (projectId) {
      const { data: configData, error: configError } = await supabase
        .from("integration_configs")
        .select("config, enabled")
        .eq("project_id", projectId)
        .eq("integration_id", "openai")
        .single();

      if (configData && configData.enabled && configData.config) {
        const config = configData.config;
        // Check if it's Azure OpenAI (has endpoint with azure.com)
        if (config.endpoint && config.endpoint.includes("azure.com")) {
          azureConfig = {
            endpoint: config.endpoint,
            apiKey: config.apiKey,
            deploymentName: config.deploymentId || config.name || "gpt-4",
            apiVersion: config.apiVersion || "2024-02-15-preview",
          };
          console.log("Loaded Azure OpenAI config from integration_configs:", {
            hasEndpoint: !!azureConfig.endpoint,
            hasApiKey: !!azureConfig.apiKey,
            deploymentName: azureConfig.deploymentName,
          });
        } else {
          console.log("OpenAI config found but not Azure OpenAI (regular OpenAI)");
        }
      } else {
        console.log("No Azure OpenAI integration config found or not enabled");
      }
    }

    if (!projectName || (!testCase && !testCases)) {
      throw new Error("Project name and test case(s) are required");
    }

    console.log("Generating Java automation files for:", testCase?.title || `${testCases?.length} test cases`);
    if (mockupImages) {
      if (Array.isArray(mockupImages)) {
        console.log(
          `Processing ${mockupImages.length} mockup image(s), first image length: ${mockupImages[0]?.length || 0}`,
        );
      } else {
        console.log("mockupImages is not an array:", mockupImages);
      }
    } else {
      console.log("No mockupImages provided (null/undefined)");
    }

    let generatedFiles;
    let storyName;

    if (testCases && userStoryTitle) {
      // Generate files for multiple test cases (story level)
      storyName = sanitizeClassName(userStoryTitle);
      generatedFiles = await generateJavaAutomationFilesForStory(
        testCases,
        userStoryTitle,
        projectName,
        mockupImages,
        htmlDom,
        appUrl,
        selectedElements,
        azureConfig,
      );
    } else {
      // Generate files for single test case (individual test case)
      storyName = sanitizeClassName(testCase.userStoryTitle);
      generatedFiles = await generateJavaAutomationFiles(
        testCase,
        projectName,
        mockupImages,
        htmlDom,
        appUrl,
        selectedElements,
        azureConfig,
      );
    }

    // If saveToRepository is true, save files to git_files table
    if (saveToRepository && projectId) {
      const projectPackage = sanitizeClassName(projectName).toLowerCase();
      const basePath = `src/test/java/com.${projectPackage}`;

      // Check if DriverInit.java already exists
      const driverInitPath = `${basePath}/DriverInit.java`;
      const { data: existingDriverInit } = await supabase
        .from("git_files")
        .select("id")
        .eq("project_id", projectId)
        .eq("file_path", driverInitPath)
        .single();

      const filesToSave = [
        // Always save Page, Step, and Test files (update if exist)
        {
          path: `${basePath}/pages/${generatedFiles.pageClassName}.java`,
          content: generatedFiles.pageFile,
          type: "java",
        },
        {
          path: `${basePath}/steps/${generatedFiles.stepClassName}.java`,
          content: generatedFiles.stepFile,
          type: "java",
        },
        {
          path: `${basePath}/tests/${generatedFiles.testClassName}.java`,
          content: generatedFiles.testFile,
          type: "java",
        },
      ];

      // Add BasePage if doesn't exist
      if (generatedFiles.basePageFile) {
        const basePagePath = `${basePath}/BasePage.java`;
        const { data: existingBasePage } = await supabase
          .from("git_files")
          .select("id")
          .eq("project_id", projectId)
          .eq("file_path", basePagePath)
          .single();

        if (!existingBasePage) {
          filesToSave.push({
            path: basePagePath,
            content: generatedFiles.basePageFile,
            type: "java",
          });
        }
      }

      // Add BaseSteps if doesn't exist
      if (generatedFiles.baseStepsFile) {
        const baseStepsPath = `${basePath}/steps/BaseSteps.java`;
        const { data: existingBaseSteps } = await supabase
          .from("git_files")
          .select("id")
          .eq("project_id", projectId)
          .eq("file_path", baseStepsPath)
          .single();

        if (!existingBaseSteps) {
          filesToSave.push({
            path: `${basePath}/steps/BaseSteps.java`,
            content: generatedFiles.baseStepsFile,
            type: "java",
          });
        }
      }

      // Add DriverInit only if it doesn't already exist
      if (generatedFiles.driverInitFile && !existingDriverInit) {
        console.log("DriverInit.java not found in repository, adding it");
        filesToSave.push({
          path: driverInitPath,
          content: generatedFiles.driverInitFile,
          type: "java",
        });
      } else if (existingDriverInit) {
        console.log("DriverInit.java already exists in repository, skipping generation");
      }

      // Add TestNG XML if doesn't exist
      if (generatedFiles.testngXmlFile) {
        const testngPath = `testng.xml`;
        const { data: existingTestng } = await supabase
          .from("git_files")
          .select("id")
          .eq("project_id", projectId)
          .eq("file_path", testngPath)
          .single();

        if (!existingTestng) {
          filesToSave.push({
            path: testngPath,
            content: generatedFiles.testngXmlFile,
            type: "xml",
          });
        }
      }

      // Save files to git_files table
      for (const file of filesToSave) {
        // Check if file already exists
        const { data: existingFile } = await supabase
          .from("git_files")
          .select("id")
          .eq("project_id", projectId)
          .eq("file_path", file.path)
          .single();

        if (existingFile) {
          // Update existing file
          const { error: updateError } = await supabase
            .from("git_files")
            .update({
              file_content: file.content,
              file_type: file.type,
              last_modified: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingFile.id);

          if (updateError) throw updateError;
          console.log(`Updated existing file: ${file.path}`);
        } else {
          // Insert new file
          const { error: insertError } = await supabase.from("git_files").insert({
            project_id: projectId,
            file_path: file.path,
            file_content: file.content,
            file_type: file.type,
            last_modified: new Date().toISOString(),
          });

          if (insertError) throw insertError;
          console.log(`Created new file: ${file.path}`);
        }
      }

      console.log(
        "Files saved to repository:",
        filesToSave.map((f) => f.path),
      );
    }

    // Log AI usage to analytics (aggregated for all OpenAI calls in this generation)
    const executionTime = Date.now() - Date.now(); // We don't have startTime, so just log 0
    try {
      await supabase.from('ai_usage_logs').insert({
        user_id: user.id,
        project_id: projectId || null,
        feature_type: 'java_automation_generation',
        success: true,
        execution_time_ms: 0, // Not tracking individual timing for this complex multi-call function
        openai_model: azureConfig ? 'azure-gpt-4o' : 'gpt-4o',
        tokens_used: 0, // Individual token counts not tracked
        openai_cost_usd: 0, // Cost not individually tracked
      });
    } catch (logError) {
      console.error('Failed to log AI usage:', logError);
    }

    // Log usage to analytics
    await supabase.from("usage_logs").insert({
      user_id: user.id,
      action: "generate_java_automation_files",
      details: {
        test_case_id: testCase?.id || "multiple",
        test_case_title: testCase?.title || `${testCases?.length} test cases`,
        user_story: testCase?.userStoryTitle || userStoryTitle,
        project_name: projectName,
        saved_to_repository: saveToRepository,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        files: generatedFiles,
        savedToRepository: saveToRepository,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in generate-java-automation-files function:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

function sanitizeClassName(name: string): string {
  // Remove special characters and spaces, capitalize first letter
  const sanitized = name
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");

  // Ensure it doesn't start with a number
  return /^[0-9]/.test(sanitized) ? "Test" + sanitized : sanitized;
}

async function generateJavaAutomationFiles(
  testCase: TestCase,
  projectName: string,
  mockupImages?: string[],
  htmlDom?: string,
  appUrl?: string,
  selectedElements?: Array<{ name: string; xpath: string; tagName: string; locatorStrategy?: string }>,
  azureConfig?: any,
): Promise<GeneratedFiles> {
  const userStoryName = sanitizeClassName(testCase.userStoryTitle);
  const projectPackage = sanitizeClassName(projectName).toLowerCase();

  const pageClassName = `${userStoryName}Page`;
  const stepClassName = `${userStoryName}Step`;
  const testClassName = `${userStoryName}Test`;

  // Analyze mockup images using OpenAI vision API if provided
  let aiAnalyzedElements: Element[] = [];

  // If user selected specific elements, use those with converted quotes
  if (selectedElements && Array.isArray(selectedElements) && selectedElements.length > 0) {
    console.log(`Using ${selectedElements.length} user-selected elements from UI`);
    aiAnalyzedElements = selectedElements.map((sel) => ({
      name: sel.name || "element",
      type: getElementType(sel.tagName || "element"),
      step: "",
      // Convert single quotes to double quotes in locator strategy
      locator: (sel.locatorStrategy || sel.xpath || "").replace(/'/g, '"'),
    }));
  } else if (mockupImages && Array.isArray(mockupImages) && mockupImages.length > 0) {
    console.log(`Analyzing ${mockupImages.length} mockup images with AI to generate accurate xpaths...`);
    aiAnalyzedElements = await analyzeImagesForElements(mockupImages, testCase.steps, htmlDom);
    console.log(`AI analysis completed, found ${aiAnalyzedElements.length} elements`);
  } else {
    console.log("Skipping AI analysis - no valid mockup images provided");
  }

  // Analyze test steps to extract elements and actions
  const elements = extractElementsFromSteps(testCase.steps, htmlDom, aiAnalyzedElements);
  const actions = extractActionsFromSteps(testCase.steps);

  // Generate BasePage and DriverInit files
  const basePageFile = generateBasePageFile(projectPackage);
  const driverInitFile = generateDriverInitFile(projectPackage);
  const baseStepsFile = generateBaseStepsFile(projectPackage);

  // Generate Page Object Model file using OpenAI/Azure OpenAI with DOM and images
  const pageFile = await generatePageFile(
    pageClassName,
    projectPackage,
    elements,
    actions,
    htmlDom,
    appUrl,
    mockupImages,
    azureConfig,
  );

  // Generate Step file with @Step methods using OpenAI/Azure OpenAI
  const stepFile = await generateStepFile(
    stepClassName,
    pageClassName,
    projectPackage,
    testCase,
    actions,
    elements,
    appUrl,
    azureConfig,
    pageFile,
  );

  // Generate Test file with JUnit tests using OpenAI/Azure OpenAI
  const testFile = await generateTestFile(
    testClassName,
    stepClassName,
    projectPackage,
    testCase,
    azureConfig,
    stepFile,
  );

  // Generate TestNG XML file
  const testngXmlFile = generateTestNgXml(projectPackage, testClassName);

  return {
    pageFile,
    stepFile,
    testFile,
    basePageFile,
    baseStepsFile,
    driverInitFile,
    testngXmlFile,
    pageClassName,
    stepClassName,
    testClassName,
  };
}

interface Element {
  name: string;
  type: string;
  step?: string;
  locator?: string;
}

interface Action {
  step: string;
  type: string;
  methodName: string;
  description: string;
  testData?: string[];
}

function extractElementsFromSteps(steps: string[], htmlDom?: string, aiAnalyzedElements?: Element[]): Element[] {
  const elements: Element[] = [];

  // Prioritize AI-analyzed elements from mockup images (most accurate)
  if (aiAnalyzedElements && aiAnalyzedElements.length > 0) {
    console.log(`Using ${aiAnalyzedElements.length} AI-analyzed elements from mockup images`);
    elements.push(...aiAnalyzedElements);
  }

  // If HTML DOM is provided, extract specific elements from it
  if (htmlDom) {
    const domElements = extractElementsFromHtml(htmlDom);
    elements.push(...domElements);
  }

  const elementPatterns = [
    // Common UI elements
    { pattern: /click.*button/i, element: "Button", type: "button" },
    { pattern: /click.*login/i, element: "LoginButton", type: "button" },
    { pattern: /click.*submit/i, element: "SubmitButton", type: "button" },
    { pattern: /click.*search/i, element: "SearchButton", type: "button" },
    { pattern: /enter.*username|input.*username|type.*username/i, element: "UsernameField", type: "input" },
    { pattern: /enter.*password|input.*password|type.*password/i, element: "PasswordField", type: "input" },
    { pattern: /enter.*email|input.*email|type.*email/i, element: "EmailField", type: "input" },
    { pattern: /select.*dropdown|choose.*option|select.*from/i, element: "DropdownMenu", type: "select" },
    { pattern: /check.*checkbox|select.*checkbox/i, element: "CheckboxOption", type: "checkbox" },
    { pattern: /navigate.*page|open.*page|go.*to/i, element: "NavigationLink", type: "link" },
    { pattern: /verify.*text|check.*text|assert.*text/i, element: "TextElement", type: "text" },
    { pattern: /click.*link/i, element: "ActionLink", type: "link" },
  ];

  steps.forEach((step, index) => {
    elementPatterns.forEach(({ pattern, element, type }) => {
      if (pattern.test(step)) {
        const elementName = `${element}${index + 1}`;
        if (!elements.some((el) => el.name === elementName)) {
          elements.push({ name: elementName, type, step });
        }
      }
    });
  });

  // Add some default elements if none found and no HTML DOM provided
  if (elements.length === 0) {
    elements.push(
      { name: "MainContent", type: "text", step: "Main page content" },
      { name: "ActionButton", type: "button", step: "Primary action button" },
      { name: "InputField", type: "input", step: "Main input field" },
    );
  }

  return elements;
}

// Helper function to extract elements from HTML DOM
// Helper function to check if an element name indicates it's a styling/formatting element
function isStylingElementByName(elementName: string): boolean {
  const stylingKeywords = [
    "bold",
    "italic",
    "underline",
    "strikethrough",
    "subscript",
    "superscript",
    "font",
    "color",
    "highlight",
    "background",
    "foreground",
    "align",
    "alignleft",
    "aligncenter",
    "alignright",
    "justify",
    "indent",
    "outdent",
    "undo",
    "redo",
    "fontsize",
    "fontfamily",
    "fontweight",
    "fontstyle",
    "textcolor",
    "backgroundcolor",
    "fillcolor",
    "borderstyle",
    "borderwidth",
    "bordercolor",
    "padding",
    "margin",
    "spacing",
    "lineheight",
    "opacity",
    "visibility",
    "display",
  ];

  const lowerName = elementName.toLowerCase();
  return stylingKeywords.some((keyword) => lowerName.includes(keyword));
}

// Helper function to check if an element is purely for styling
function isStylingElement(tag: string, elementHtml: string): boolean {
  // Exclude pure styling tags
  const stylingTags = ["b", "i", "strong", "em", "mark", "small", "del", "ins", "sub", "sup", "u", "strike"];
  if (stylingTags.includes(tag.toLowerCase())) {
    return true;
  }

  // Exclude elements that only have aria attributes (no id, data-testid, name, or actionable attributes)
  const hasActionableAttribute =
    /id\s*=\s*["']/.test(elementHtml) ||
    /data-testid\s*=\s*["']/.test(elementHtml) ||
    /name\s*=\s*["']/.test(elementHtml) ||
    /onclick\s*=\s*["']/.test(elementHtml) ||
    /href\s*=\s*["']/.test(elementHtml);

  const hasOnlyAriaAttributes = /aria-[a-z]+\s*=\s*["']/.test(elementHtml) && !hasActionableAttribute;

  // Exclude span/div elements with only aria or style attributes
  if ((tag.toLowerCase() === "span" || tag.toLowerCase() === "div") && hasOnlyAriaAttributes) {
    return true;
  }

  return false;
}

function extractElementsFromHtml(htmlDom: string): Element[] {
  const elements: Element[] = [];

  // Extract elements with IDs
  const idMatches = htmlDom.match(/<[^>]+id\s*=\s*["']([^"']+)["'][^>]*>/g);
  if (idMatches) {
    idMatches.forEach((match) => {
      const idMatch = match.match(/id\s*=\s*["']([^"']+)["']/);
      const tagMatch = match.match(/<(\w+)/);
      if (idMatch && tagMatch) {
        const id = idMatch[1];
        const tag = tagMatch[1].toLowerCase();

        // Skip styling elements by tag or by name
        if (isStylingElement(tag, match) || isStylingElementByName(id)) {
          return;
        }

        const elementName = toCamelCase(id);
        const type = getElementType(tag);
        elements.push({
          name: elementName,
          type: type,
          step: `Element with ID: ${id}`,
          locator: `id = "${id}"`,
        });
      }
    });
  }

  // Extract elements with data-testid
  const testIdMatches = htmlDom.match(/<[^>]+data-testid\s*=\s*["']([^"']+)["'][^>]*>/g);
  if (testIdMatches) {
    testIdMatches.forEach((match) => {
      const testIdMatch = match.match(/data-testid\s*=\s*["']([^"']+)["']/);
      const tagMatch = match.match(/<(\w+)/);
      if (testIdMatch && tagMatch) {
        const testId = testIdMatch[1];
        const tag = tagMatch[1].toLowerCase();

        // Skip styling elements by tag or by name
        if (isStylingElement(tag, match) || isStylingElementByName(testId)) {
          return;
        }

        const elementName = toCamelCase(testId);
        const type = getElementType(tag);
        elements.push({
          name: elementName,
          type: type,
          step: `Element with test ID: ${testId}`,
          locator: `css = "[data-testid='${testId}']"`,
        });
      }
    });
  }

  // Extract buttons and inputs with names
  const nameMatches = htmlDom.match(/<(button|input)[^>]+name\s*=\s*["']([^"']+)["'][^>]*>/g);
  if (nameMatches) {
    nameMatches.forEach((match) => {
      const nameMatch = match.match(/name\s*=\s*["']([^"']+)["']/);
      const tagMatch = match.match(/<(\w+)/);
      if (nameMatch && tagMatch) {
        const name = nameMatch[1];
        const tag = tagMatch[1].toLowerCase();

        // Skip styling elements by tag or by name
        if (isStylingElement(tag, match) || isStylingElementByName(name)) {
          return;
        }

        const elementName = toCamelCase(name);
        const type = getElementType(tag);
        elements.push({
          name: elementName,
          type: type,
          step: `${tag} with name: ${name}`,
          locator: `name = "${name}"`,
        });
      }
    });
  }

  return elements;
}

// Helper function to determine element type from HTML tag
function getElementType(tag: string): string {
  switch (tag.toLowerCase()) {
    case "button":
      return "button";
    case "input":
      return "input";
    case "select":
      return "select";
    case "textarea":
      return "input";
    case "a":
      return "link";
    case "span":
    case "div":
    case "p":
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return "text";
    default:
      return "element";
  }
}

// Helper function to convert strings to camelCase
function toCamelCase(str: string): string {
  return str
    .replace(/[-_]/g, " ")
    .replace(/\s+(.)/g, (_, letter) => letter.toUpperCase())
    .replace(/^\w/, (letter) => letter.toLowerCase());
}

// Analyze mockup images using OpenAI vision API to extract UI elements
async function analyzeImagesForElements(
  mockupImages: string[],
  testSteps: string[],
  htmlDom?: string,
): Promise<Element[]> {
  const openAIApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openAIApiKey) {
    console.error("OpenAI API key not found, skipping image analysis");
    return [];
  }

  console.log(`Starting image analysis for ${mockupImages.length} images`);

  try {
    // Create content array with text and all images
    const content: any[] = [
      {
        type: "text",
        text: `You are a Selenium automation expert. Analyze these UI mockup/design images carefully and extract ALL visible interactive elements.

IMPORTANT INSTRUCTIONS:
1. Look at EVERY image provided and identify ALL UI elements
2. Match elements to the test steps below
3. Generate accurate, production-ready Selenium locators
4. PRIORITIZE locator strategies in this order:
   a) id attribute (most reliable)
   b) data-testid attribute
   c) name attribute
   d) unique class names
   e) XPath (only as last resort)

Test Steps to implement:
${testSteps.map((step, i) => `${i + 1}. ${step}`).join("\n")}

${htmlDom ? `\nHTML DOM Context (use this for accurate locators):\n${htmlDom}\n` : ""}

For EACH interactive element you see in the images (buttons, inputs, dropdowns, links, checkboxes, etc.):
1. Create a descriptive camelCase name (e.g., "loginButton", "emailInputField", "submitButton")
2. Determine the element type: button, input, link, select, checkbox, text, or element
3. Generate the BEST possible locator in Selenium format:
   - id = "element-id" (if ID is visible or in HTML)
   - css = "[data-testid='value']" (if data-testid is present)
   - name = "element-name" (for form inputs)
   - css = ".unique-class-name" (for unique classes)
   - xpath = "//tag[@attribute='value']" (ONLY if no better option)

CRITICAL: Analyze ALL uploaded images thoroughly. Extract at least 5-10 elements per image if they're UI mockups.

Return ONLY a valid JSON array of elements (no markdown, no extra text):
[
  {
    "name": "emailInputField",
    "type": "input",
    "locator": "id = \\"email\\"",
    "description": "Email input field on login page"
  },
  {
    "name": "passwordInputField",
    "type": "input",
    "locator": "id = \\"password\\"",
    "description": "Password input field"
  },
  {
    "name": "loginButton",
    "type": "button",
    "locator": "css = \\"button[type='submit']\\"",
    "description": "Submit button for login form"
  }
]`,
      },
    ];

    // Add all mockup images to the content
    for (const imageBase64 of mockupImages) {
      content.push({
        type: "image_url",
        image_url: {
          url: imageBase64,
        },
      });
    }

    console.log(`Sending ${mockupImages.length} images to OpenAI vision API (gpt-4o) for analysis...`);
    console.log(`Total content items: ${content.length} (1 text prompt + ${mockupImages.length} images)`);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAIApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: content,
          },
        ],
        max_tokens: 4000,
        temperature: 0.1, // Lower temperature for more deterministic output
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", response.status, errorText);
      return [];
    }

    const data = await response.json();
    const analysisText = data.choices[0].message.content;

    console.log("OpenAI vision analysis raw response:", analysisText.substring(0, 500) + "...");

    // Parse the JSON response
    const jsonMatch = analysisText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("No valid JSON array found in OpenAI response");
      return [];
    }

    const analyzedElements = JSON.parse(jsonMatch[0]);
    console.log(`Successfully analyzed ${analyzedElements.length} elements from mockup images`);

    // Convert to Element format
    return analyzedElements.map((el: any) => ({
      name: el.name,
      type: el.type,
      step: el.description,
      locator: el.locator,
    }));
  } catch (error) {
    console.error("Error analyzing mockup images:", error);
    return [];
  }
}

// Helper function to extract quoted strings from a step
function extractQuotedStrings(step: string): string[] {
  const matches = step.match(/["']([^"']+)["']/g);
  if (!matches) return [];
  return matches.map((match) => match.replace(/["']/g, ""));
}

function extractActionsFromSteps(steps: string[]): Action[] {
  return steps.map((step, index) => {
    let actionType = "action";

    if (step.toLowerCase().includes("click")) actionType = "click";
    else if (
      step.toLowerCase().includes("enter") ||
      step.toLowerCase().includes("type") ||
      step.toLowerCase().includes("input")
    )
      actionType = "input";
    else if (
      step.toLowerCase().includes("select") ||
      step.toLowerCase().includes("choose") ||
      step.toLowerCase().includes("pick")
    )
      actionType = "select";
    else if (
      step.toLowerCase().includes("verify") ||
      step.toLowerCase().includes("check") ||
      step.toLowerCase().includes("assert")
    )
      actionType = "verify";
    else if (
      step.toLowerCase().includes("navigate") ||
      step.toLowerCase().includes("go to") ||
      step.toLowerCase().includes("open")
    )
      actionType = "navigate";

    // Extract test data from quoted strings
    const testData = extractQuotedStrings(step);

    return {
      step: step,
      type: actionType,
      methodName: `step${index + 1}${actionType.charAt(0).toUpperCase() + actionType.slice(1)}`,
      description: step,
      testData: testData.length > 0 ? testData : undefined,
    };
  });
}

async function generatePageFile(
  className: string,
  packageName: string,
  elements: Element[],
  actions: Action[],
  htmlDom?: string,
  appUrl?: string,
  mockupImages?: string[],
  azureConfig?: any,
): Promise<string> {
  const openAIApiKey = Deno.env.get("OPENAI_API_KEY");

  // Prefer Azure OpenAI if config is provided
  const useAzure = azureConfig?.endpoint && azureConfig?.apiKey && azureConfig?.deploymentName;

  if (!openAIApiKey && !useAzure) {
    console.error("No AI API key found, falling back to template-based generation");
    return generatePageFileTemplate(className, packageName, elements, actions, htmlDom, appUrl);
  }

  try {
    // Deduplicate elements
    const uniqueElements = new Map<string, Element>();
    elements.forEach((el) => {
      const varName = el.name.toLowerCase();
      if (!uniqueElements.has(varName)) {
        uniqueElements.set(varName, el);
      }
    });
    const uniqueElementsArray = Array.from(uniqueElements.values());

    // Use vision API if mockup images are provided
    if (mockupImages && Array.isArray(mockupImages) && mockupImages.length > 0) {
      console.log(`Using OpenAI Vision API to analyze ${mockupImages.length} mockup images for Page class generation`);

      const content: any[] = [
        {
          type: "text",
          text: `You are a Selenium automation expert. Analyze the provided UI mockup images and HTML DOM to generate a highly accurate Selenium Page Object Model class.

CLASS DETAILS:
- Class name: ${className}
- Package: com.${packageName}.pages
- Must extend BasePage
- Page URL: ${appUrl || "application-url"}

EXTRACTED ELEMENTS (${uniqueElementsArray.length} total):
${uniqueElementsArray.map((el, i) => `${i + 1}. ${el.name} (${el.type})${el.locator ? ` - Locator: ${el.locator}` : ""}${el.step ? ` - Description: ${el.step}` : ""}`).join("\n")}

${htmlDom ? `HTML DOM STRUCTURE:\n${htmlDom.substring(0, 5000)}\n\n` : ""}

CRITICAL IMPORT STATEMENT REQUIREMENTS:
- MUST include: package com.${packageName}.pages;
- MUST include: import com.${packageName}.BasePage;
- MUST include: import org.openqa.selenium.WebDriver;
- MUST include: import org.openqa.selenium.WebElement;
- MUST include: import org.openqa.selenium.support.FindBy;
- MUST include: import org.openqa.selenium.support.PageFactory;
- MUST include: import org.apache.logging.log4j.LogManager;
- MUST include: import org.apache.logging.log4j.Logger;

CRITICAL INSTRUCTIONS FOR BASECLASS INTEGRATION:
1. This class MUST extend BasePage which provides these reusable methods:
   - click(WebElement element) - for clicking buttons/links
   - sendKeys(WebElement element, String value) - for entering text in inputs
   - scrollIntoView(WebElement element) - for scrolling to elements
   - waitForPageToLoad() - wait utilities
   - navigateToPage(String url) - for navigation

2. ANALYZE THE IMAGES AND DOM CAREFULLY to identify all interactive UI elements
3. Generate ACCURATE @FindBy locators by examining the actual DOM structure
4. Prioritize locator strategies: id > data-testid > name > css selector > xpath

5. For each UI element, create:
   a) WebElement field with @FindBy annotation using the MOST RELIABLE locator from DOM
   b) Corresponding action methods that USE BasePage methods:
      - For buttons/links: click{ElementName}() { click(elementVariable); }
      - For inputs: enter{ElementName}(String value) { sendKeys(elementVariable, value); }
      - For text elements: get{ElementName}Text() { return elementVariable.getText(); }
      
6. Include these required methods:
   - navigateToPage() calling super.navigateToPage(url)
   - waitForPageToLoad() calling super.sleepForDuration()
   
7. DO NOT include styling elements (bold, italic, align, undo, redo, etc.)
8. Element variable names must be camelCase (lowercase first letter)
9. Use EXACT locators from the DOM - do NOT guess or use generic patterns
10. ALWAYS call BasePage methods in your implementation - never duplicate wait/click/sendKeys logic

IMPORTANT:
- Cross-reference the images with the HTML DOM to ensure locators match actual elements
- If an element has an id attribute, use @FindBy(id = "value") with double quotes
- If an element has data-testid, use @FindBy(css = "[data-testid='value']") with double quotes
- For buttons without id/data-testid, analyze the DOM for unique attributes
- CRITICAL: ALL @FindBy attribute values MUST use double quotes ("), not single quotes (')
- CRITICAL: className strategy only accepts SINGLE class name. If multiple classes exist (space-separated), use CSS selector instead: @FindBy(css = ".class1.class2.class3")
- Generate production-ready, maintainable code with accurate locators

Generate ONLY the complete Java class code, no explanations.`,
        },
      ];

      // Add all mockup images
      mockupImages.forEach((img, idx) => {
        content.push({
          type: "image_url",
          image_url: {
            url: img,
          },
        });
      });

      const apiUrl = useAzure
        ? `${azureConfig.endpoint}/openai/deployments/${azureConfig.deploymentName}/chat/completions?api-version=2024-02-15-preview`
        : "https://api.openai.com/v1/chat/completions";

      const headers = useAzure
        ? { "api-key": azureConfig.apiKey, "Content-Type": "application/json" }
        : { Authorization: `Bearer ${openAIApiKey}`, "Content-Type": "application/json" };

      const response = await fetch(apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: useAzure ? undefined : "gpt-4o",
          messages: [
            {
              role: "system",
              content:
                "You are a Selenium automation expert specializing in creating accurate Page Object Model classes with precise locators based on visual and DOM analysis. CRITICAL: ALL @FindBy annotation attribute values MUST use double quotes, not single quotes. ALWAYS extend BasePage and use its methods (click, sendKeys, scrollIntoView, etc.) instead of implementing your own. Never duplicate base functionality. ALWAYS include all required import statements (BasePage, WebDriver, WebElement, @FindBy, PageFactory, Logger).",
            },
            { role: "user", content },
          ],
          max_completion_tokens: 4000,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`${useAzure ? "Azure OpenAI" : "OpenAI"} Vision API error:`, response.status, errorText);
        // Fall back to text-only generation
      } else {
        const data = await response.json();
        const generatedCode = data.choices[0].message.content;

        const codeMatch =
          generatedCode.match(/```java\n([\s\S]*?)\n```/) || generatedCode.match(/```\n([\s\S]*?)\n```/);
        const finalCode = codeMatch ? codeMatch[1] : generatedCode;

        console.log(`Successfully generated Page class with ${useAzure ? "Azure OpenAI" : "OpenAI"} Vision API`);
        return finalCode.trim();
      }
    }

    // Fallback to text-only analysis if no images or vision API failed
    const prompt = `Generate a Selenium Page Object Model class in Java with the following specifications:

CLASS DETAILS:
- Class name: ${className}
- Package: com.${packageName}.pages
- Must extend BasePage
- Page URL: ${appUrl || "application-url"}

EXTRACTED ELEMENTS (${uniqueElementsArray.length} total):
${uniqueElementsArray.map((el, i) => `${i + 1}. ${el.name} (${el.type})${el.locator ? ` - Locator: ${el.locator}` : ""}${el.step ? ` - Description: ${el.step}` : ""}`).join("\n")}

${htmlDom ? `HTML DOM STRUCTURE (Analyze carefully for accurate locators):\n${htmlDom.substring(0, 5000)}\n\n` : ""}

CRITICAL IMPORT STATEMENT REQUIREMENTS:
- MUST include: package com.${packageName}.pages;
- MUST include: import com.${packageName}.BasePage;
- MUST include: import org.openqa.selenium.WebDriver;
- MUST include: import org.openqa.selenium.WebElement;
- MUST include: import org.openqa.selenium.support.FindBy;
- MUST include: import org.openqa.selenium.support.PageFactory;
- MUST include: import org.apache.logging.log4j.LogManager;
- MUST include: import org.apache.logging.log4j.Logger;

CRITICAL INSTRUCTIONS FOR BASECLASS INTEGRATION:
1. This class MUST extend BasePage which provides these reusable methods:
   - click(WebElement element) - for clicking buttons/links  
   - sendKeys(WebElement element, String value) - for entering text in inputs
   - scrollIntoView(WebElement element) - for scrolling to elements
   - waitForPageToLoad() - wait utilities
   - navigateToPage(String url) - for navigation

2. CRITICAL CONSTRUCTOR REQUIREMENTS:
   - Constructor MUST NOT have any parameters (no WebDriver parameter)
   - Constructor MUST NOT call super(driver)
   - Constructor should ONLY call: PageFactory.initElements(driver, this);
   
3. ANALYZE THE HTML DOM CAREFULLY to generate ACCURATE @FindBy locators
4. Prioritize locator strategies: id > data-testid > name > css selector > xpath
5. Cross-reference the provided elements with the DOM structure

6. For each UI element, create:
   a) WebElement field with @FindBy annotation using the MOST RELIABLE locator from DOM
   b) Corresponding action methods that USE BasePage methods:
      - For buttons/links: click{ElementName}() { scrollIntoView(element); click(element); }
      - For inputs: enter{ElementName}(String value) { scrollIntoView(element); sendKeys(element, value); }
      - For text elements: get{ElementName}Text() { return element.getText(); }
      
7. Include these required methods:
   - navigateToPage() calling navigateToPage(url)
   - waitForPageToLoad() calling sleepForDuration()
   
8. DO NOT include styling elements (bold, italic, align, undo, redo, etc.)
9. Element variable names must be camelCase (lowercase first letter)
10. Use EXACT locators from the DOM - do NOT use generic xpath patterns
11. ALWAYS call BasePage methods in your implementation - never duplicate wait/click/sendKeys logic

IMPORTANT:
- Extract locators directly from the HTML DOM structure provided
- If element has id, use @FindBy(id = "exact_id") - double quotes required
- If element has data-testid, use @FindBy(css = "[data-testid='exact_value']") - double quotes required
- If element has unique name, use @FindBy(name = "exact_name") - double quotes required
- For xpath: @FindBy(xpath = "//tag[@attr='value']") - double quotes outside, single quotes inside
- Only use xpath as last resort, and make it specific and reliable
- CRITICAL: ALL @FindBy attribute values MUST be enclosed in double quotes (")
- CRITICAL: className strategy only accepts SINGLE class name. If element has multiple classes (space-separated like "class1 class2 class3"), use CSS selector instead: @FindBy(css = ".class1.class2.class3")
- Generate production-ready code with accurate, maintainable locators

Generate ONLY the complete Java class code, no explanations.`;

    const apiUrl = useAzure
      ? `${azureConfig.endpoint}/openai/deployments/${azureConfig.deploymentName}/chat/completions?api-version=2024-02-15-preview`
      : "https://api.openai.com/v1/chat/completions";

    const headers = useAzure
      ? { "api-key": azureConfig.apiKey, "Content-Type": "application/json" }
      : { Authorization: `Bearer ${openAIApiKey}`, "Content-Type": "application/json" };

    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: useAzure ? undefined : "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "You are a Selenium automation expert. Generate clean, production-ready Java Page Object Model classes with accurate locators based on DOM analysis. CRITICAL: ALL @FindBy annotation attribute values MUST use double quotes, not single quotes. Always extend BasePage and use its helper methods. ALWAYS include all required import statements (BasePage, WebDriver, WebElement, @FindBy, PageFactory, Logger). CRITICAL: Constructor must NOT have WebDriver parameter and must NOT call super(driver). Constructor should only call PageFactory.initElements(driver, this).",
          },
          { role: "user", content: prompt },
        ],
        max_completion_tokens: 4000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${useAzure ? "Azure OpenAI" : "OpenAI"} API error:`, response.status, errorText);
      return generatePageFileTemplate(className, packageName, elements, actions, htmlDom, appUrl);
    }

    const data = await response.json();
    const generatedCode = data.choices[0].message.content;

    const codeMatch = generatedCode.match(/```java\n([\s\S]*?)\n```/) || generatedCode.match(/```\n([\s\S]*?)\n```/);
    const finalCode = codeMatch ? codeMatch[1] : generatedCode;

    console.log(`Successfully generated Page class with ${useAzure ? "Azure OpenAI" : "OpenAI"}`);
    return finalCode.trim();
  } catch (error) {
    console.error(`Error generating page file with ${useAzure ? "Azure OpenAI" : "OpenAI"}:`, error);
    return generatePageFileTemplate(className, packageName, elements, actions, htmlDom, appUrl);
  }
}

// Helper function to clean element names (remove type suffixes in parentheses)
function cleanElementName(name: string): string {
  return name.replace(/\s*\([^)]*\)/g, "").trim();
}

// Template-based fallback function
function generatePageFileTemplate(
  className: string,
  packageName: string,
  elements: Element[],
  actions: Action[],
  htmlDom?: string,
  appUrl?: string,
): string {
  const uniqueElements = new Map<string, any>();
  const uniqueClickMethods = new Map<string, string>();
  const uniqueInputMethods = new Map<string, string>();
  const uniqueGetTextMethods = new Map<string, string>();

  elements.forEach((el) => {
    const cleanName = cleanElementName(el.name);
    const varName = cleanName.toLowerCase();
    if (!uniqueElements.has(varName)) {
      uniqueElements.set(varName, { ...el, name: cleanName });
    }
  });

  const uniqueElementsArray = Array.from(uniqueElements.values());

  uniqueElementsArray
    .filter((el) => el.type === "button" || el.type === "link")
    .forEach((el) => {
      const cleanName = cleanElementName(el.name);
      const methodName = `click${cleanName}`;
      if (!uniqueClickMethods.has(methodName)) {
        uniqueClickMethods.set(
          methodName,
          `    public void ${methodName}() {\n        click(${cleanName.toLowerCase()});\n    }`,
        );
      }
    });

  uniqueElementsArray
    .filter((el) => el.type === "input")
    .forEach((el) => {
      const cleanName = cleanElementName(el.name);
      const methodName = `enter${cleanName}`;
      if (!uniqueInputMethods.has(methodName)) {
        uniqueInputMethods.set(
          methodName,
          `    public void ${methodName}(String value) {\n        sendKeys(${cleanName.toLowerCase()}, value);\n    }`,
        );
      }
    });

  uniqueElementsArray
    .filter((el) => el.type === "text" || el.type === "element")
    .forEach((el) => {
      const cleanName = cleanElementName(el.name);
      const methodName = `get${cleanName}Text`;
      if (!uniqueGetTextMethods.has(methodName)) {
        uniqueGetTextMethods.set(
          methodName,
          `    public String ${methodName}() {\n        return getText(${cleanName.toLowerCase()});\n    }`,
        );
      }
    });

  // Helper function to parse xpath and extract simpler locator strategy
  const parseLocatorStrategy = (locator: string): string => {
    // Valid Selenium @FindBy strategies
    const validStrategies = ["id", "name", "className", "css", "xpath", "linkText", "partialLinkText", "tagName"];

    // First check if locator is already in "strategy = value" format and extract just the value
    const alreadyFormattedMatch = locator.match(/^(\w+)\s*=\s*"(.+)"$/);
    if (alreadyFormattedMatch) {
      const [, strategy, value] = alreadyFormattedMatch;
      // If it's a valid Selenium strategy, return the value part only for that strategy
      if (validStrategies.includes(strategy)) {
        return `${strategy}="${value}"`;
      }
      // If it's a custom attribute, convert to xpath
      return `xpath="//*[@${strategy}='${value}']"`;
    }

    // Check for compact format: attribute="value" (for custom attributes)
    const compactMatch = locator.match(/^(\w+)="([^"]+)"$/);
    if (compactMatch) {
      const [, attribute, value] = compactMatch;
      // If it's a valid strategy, use it directly
      if (validStrategies.includes(attribute)) {
        return `${attribute}="${value}"`;
      }
      // If it's a custom attribute (formcontrolname, data-testid, etc.), convert to xpath
      return `xpath="//*[@${attribute}='${value}']"`;
    }

    // Parse xpath to extract id, name, or class if possible
    const idMatch = locator.match(/\[@id=['"]([^'"]+)['"]\]/);
    if (idMatch) {
      return `id="${idMatch[1]}"`;
    }

    const nameMatch = locator.match(/\[@name=['"]([^'"]+)['"]\]/);
    if (nameMatch) {
      return `name="${nameMatch[1]}"`;
    }

    const classMatch = locator.match(/\[@class=['"]([^'"]+)['"]\]/);
    if (classMatch) {
      const classValue = classMatch[1];
      // If multiple classes (space-separated), use CSS selector instead
      if (classValue.includes(" ")) {
        const cssSelector = `.${classValue.split(/\s+/).join(".")}`;
        return `css="${cssSelector}"`;
      }
      return `className="${classValue}"`;
    }

    // If no simple strategy found, use xpath as-is
    // Make sure xpath starts with // or /
    const xpathValue = locator.startsWith("/") ? locator : `//*[contains(text(),'${locator}')]`;
    return `xpath="${xpathValue}"`;
  };

  const findByAnnotations = uniqueElementsArray.map((el) => {
    const cleanName = cleanElementName(el.name).toLowerCase();
    if (el.locator) {
      const locatorStrategy = parseLocatorStrategy(el.locator);
      return `    @FindBy(${locatorStrategy})\n    WebElement ${cleanName};`;
    }
    return `    @FindBy(xpath = "//button[contains(text(),'${el.name}')] | //input[@placeholder='${el.name}'] | //*[contains(@class,'${cleanName}')]")\n    WebElement ${cleanName};`;
  });

  return `package com.${packageName}.pages;

import com.${packageName}.BasePage;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;
import org.openqa.selenium.support.PageFactory;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

public class ${className} extends BasePage {
    private static final Logger logger = LogManager.getLogger(${className}.class);
    private static final String PAGE_URL = "${appUrl || "application-url"}";

    public ${className}() {
        PageFactory.initElements(driver, this);
    }

    // WebElement declarations
${findByAnnotations.join("\n")}

    public void waitForPageToLoad() {
        sleepForDuration();
    }

    public void navigateToPage() {
        navigateToPage(PAGE_URL);
    }

    // Click methods for buttons and links (using BasePage.click)
${Array.from(uniqueClickMethods.values()).join("\n\n")}

    // Input methods for form fields (using BasePage.sendKeys)
${Array.from(uniqueInputMethods.values()).join("\n\n")}

    // Get text methods for text elements (using BasePage.getText)
${Array.from(uniqueGetTextMethods.values()).join("\n\n")}
}`;
}

async function generateStepFile(
  className: string,
  pageClassName: string,
  packageName: string,
  testCase: TestCase,
  actions: Action[],
  elements: Element[],
  appUrl?: string,
  azureConfig?: any,
  pageFile?: string,
): Promise<string> {
  const openAIApiKey = Deno.env.get("OPENAI_API_KEY");

  // Prefer Azure OpenAI if config is provided
  const useAzure = azureConfig?.endpoint && azureConfig?.apiKey && azureConfig?.deploymentName;

  if (!openAIApiKey && !useAzure) {
    console.error("No AI API key found, falling back to template-based generation");
    return generateStepFileTemplate(
      className,
      pageClassName,
      packageName,
      testCase,
      actions,
      elements,
      appUrl,
      pageFile,
    );
  }

  try {
    // Deduplicate elements
    const uniqueElements = new Map<string, Element>();
    elements.forEach((el) => {
      const cleanName = cleanElementName(el.name);
      const varName = cleanName.toLowerCase();
      if (!uniqueElements.has(varName)) {
        uniqueElements.set(varName, { ...el, name: cleanName });
      }
    });
    const uniqueElementsArray = Array.from(uniqueElements.values());

    const prompt = `Generate a Selenium Step class in Java with the following specifications:

CLASS DETAILS:
- Class name: ${className}
- Package: com.${packageName}.steps
- Must extend BaseSteps
- Page class: ${pageClassName} (instance variable: ${pageClassName.toLowerCase()})

TEST CASE: ${testCase.title}
Description: ${testCase.description}

ACTUAL PAGE CLASS CODE (EXTRACT METHOD NAMES FROM THIS):
${pageFile || "Page class not available"}

TEST STEPS TO IMPLEMENT:
${testCase.steps.map((step, i) => `${i + 1}. ${step}`).join("\n")}

CRITICAL IMPORT STATEMENT REQUIREMENTS:
- MUST include: package com.${packageName}.steps;
- MUST include: import com.${packageName}.steps.BaseSteps;
- MUST include: import com.${packageName}.pages.${pageClassName};
- MUST include: import io.qameta.allure.Step;
- MUST include: import static org.testng.Assert.*;

REQUIREMENTS FOR INTELLIGENT STEP MAPPING:
1. This class MUST extend BaseSteps which provides:
   - logMessageWithScreenshot(String message) - for logging with screenshots
   - logMessagewithoutscreenshot(String message) - for logging without screenshots

2. CRITICAL - Extract ALL method names from the Page class code above:
   - Parse the Page class to find ALL public methods (click, enter, select, verify, wait, get, etc.)
   - Generate a step method for EVERY SINGLE public method found in the Page class
   - Use ONLY the exact method names that exist in the Page class
   - DO NOT skip any methods - create step methods for ALL of them
   - DO NOT invent or create new method names
   
3. INTELLIGENTLY map test steps to the ACTUAL Page class methods:
   - "Set Start Date" → if Page has "enterTestStartDate()", call that exact method
   - "Select activities" → if Page has "selectActivities()", call that exact method
   - Match test step intent to the semantically similar Page method
   
4. Generate @Step annotated methods that:
   a) Have descriptive @Step("...") messages matching the test step
   b) Call the appropriate Page class method
   c) Call logMessageWithScreenshot() after the action
   d) For inputs, accept String parameters and pass to Page methods
   
5. Method naming convention (CRITICAL):
   - Extract and use EXACT method names from Page class code above
   - If Page has enterTestStartDate(), Step must call enterTestStartDate() - not setStartDate()
   - If Page has clickSubmitButton(), Step must call clickSubmitButton() - not clickSubmit()
   - Use ${pageClassName.toLowerCase()} to call page class methods
   
6. Required utility methods:
   - navigateToPage() - calls page.navigateToPage()
   - waitForPageToLoad() - calls page.waitForPageToLoad()
   - verifyFunctionality() - performs assertions
   
7. Each step method structure:
   @Step("Step description")
   public void methodName(parameters) {
       ${pageClassName.toLowerCase()}.pageMethod(parameters);
       logMessageWithScreenshot("Action completed");
   }

CRITICAL - COMPREHENSIVE METHOD GENERATION:
- First, parse the Page class code above to extract ALL public method names and signatures
- Generate a step method for EVERY SINGLE public method found (no exceptions)
- Include methods like: click*, enter*, select*, verify*, wait*, get*, validate*, check*, etc.
- Use the EXACT method name and parameters from the Page class - DO NOT modify or invent names
- Preserve method return types and parameters exactly as in Page class
- Then, map each test step to the semantically closest Page method
- Example: If Page has "enterTestStartDate(String date)", Step must have enterTestStartDate(String date)
- Example: If Page has "verifyPageTitle()", Step must have verifyPageTitle()

Generate ONLY the complete Java class code, no explanations.`;

    const apiUrl = useAzure
      ? `${azureConfig.endpoint}/openai/deployments/${azureConfig.deploymentName}/chat/completions?api-version=2024-02-15-preview`
      : "https://api.openai.com/v1/chat/completions";

    const headers = useAzure
      ? { "api-key": azureConfig.apiKey, "Content-Type": "application/json" }
      : { Authorization: `Bearer ${openAIApiKey}`, "Content-Type": "application/json" };

    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: useAzure ? undefined : "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "You are a Selenium automation expert. Generate clean, production-ready Java Step classes with proper @Step annotations. CRITICAL REQUIREMENT: Parse the provided Page class code to extract ALL public methods (every single one) and generate a corresponding step method for EACH of them. Do not skip any methods - include click, enter, select, verify, wait, get, validate, check, and all other methods. Step classes extend BaseSteps and call Page class methods using the exact names and signatures from the Page class. Preserve return types and parameters exactly. Always use logMessageWithScreenshot() from BaseSteps. ALWAYS include all required import statements (BaseSteps, Page class, @Step, assertions).",
          },
          { role: "user", content: prompt },
        ],
        max_completion_tokens: 4000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${useAzure ? "Azure OpenAI" : "OpenAI"} API error:`, response.status, errorText);
      return generateStepFileTemplate(className, pageClassName, packageName, testCase, actions, elements, appUrl);
    }

    const data = await response.json();
    const generatedCode = data.choices[0].message.content;

    const codeMatch = generatedCode.match(/```java\n([\s\S]*?)\n```/) || generatedCode.match(/```\n([\s\S]*?)\n```/);
    const finalCode = codeMatch ? codeMatch[1] : generatedCode;

    console.log(`Successfully generated Step class with ${useAzure ? "Azure OpenAI" : "OpenAI"}`);
    return finalCode.trim();
  } catch (error) {
    console.error(`Error generating step file with ${useAzure ? "Azure OpenAI" : "OpenAI"}:`, error);
    return generateStepFileTemplate(
      className,
      pageClassName,
      packageName,
      testCase,
      actions,
      elements,
      appUrl,
      pageFile,
    );
  }
}

// Template-based fallback function
function generateStepFileTemplate(
  className: string,
  pageClassName: string,
  packageName: string,
  testCase: TestCase,
  actions: Action[],
  elements: Element[],
  appUrl?: string,
  pageFile?: string,
): string {
  const stepMethods = generateStepMethodsFromPageClass(elements, pageClassName.toLowerCase(), pageFile);

  const navigationStep = `
    @Step("Navigate to page")
    public void navigateToPage() {
        ${pageClassName.toLowerCase()}.navigateToPage();
        logMessageWithScreenshot("Navigate to page");
    }`;

  const waitForPageLoadStep = `
    @Step("Wait for page to load")
    public void waitForPageToLoad() {
        ${pageClassName.toLowerCase()}.waitForPageToLoad();
        logMessageWithScreenshot("Wait for page to load");
    }`;

  return `package com.${packageName}.steps;

import com.${packageName}.pages.${pageClassName};
import io.qameta.allure.Step;
import static org.testng.Assert.*;

public class ${className} extends BaseSteps {
    private ${pageClassName} ${pageClassName.toLowerCase()};

    public ${className}() {
        this.${pageClassName.toLowerCase()} = new ${pageClassName}();
    }

    // Step methods that call corresponding page class methods
${stepMethods}
${navigationStep}
${waitForPageLoadStep}

    @Step("Verify functionality")
    public void verifyFunctionality() {
        String pageTitle = ${pageClassName.toLowerCase()}.validatePageTitle();
        assertNotNull(pageTitle, "Page title should not be null");
        logMessageWithScreenshot("Verify functionality");
    }
}`;
}

// Helper function to parse page class and extract all public method signatures
function extractPageClassMethods(
  pageClassCode: string,
): Array<{ name: string; returnType: string; parameters: string }> {
  const methods: Array<{ name: string; returnType: string; parameters: string }> = [];

  // Regex to match public methods: public returnType methodName(params) {
  const methodRegex = /public\s+(\w+(?:<[^>]+>)?)\s+(\w+)\s*\(([^)]*)\)/g;

  let match;
  while ((match = methodRegex.exec(pageClassCode)) !== null) {
    const returnType = match[1];
    const methodName = match[2];
    const parameters = match[3].trim();

    // Skip constructors and common inherited methods
    if (methodName !== "equals" && methodName !== "hashCode" && methodName !== "toString") {
      methods.push({ name: methodName, returnType, parameters });
    }
  }

  return methods;
}

// Helper function to generate step methods based on page class methods
function generateStepMethodsFromPageClass(elements: Element[], pageObjectName: string, pageClassCode?: string): string {
  const stepMethods: string[] = [];
  const processedMethods = new Set<string>();

  // If page class code is provided, parse it to extract ALL methods
  if (pageClassCode) {
    const pageMethods = extractPageClassMethods(pageClassCode);

    pageMethods.forEach((method) => {
      if (processedMethods.has(method.name)) return;
      processedMethods.add(method.name);

      // Generate descriptive step name from method name
      const stepDescription = method.name
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (str) => str.toUpperCase())
        .trim();

      // Generate step method based on return type and parameters
      if (method.returnType === "void") {
        if (method.parameters) {
          // Method with parameters
          stepMethods.push(`
    @Step("${stepDescription}: {0}")
    public void ${method.name}(${method.parameters}) {
        ${pageObjectName}.${method.name}(${method.parameters
          .split(",")
          .map((p) => p.trim().split(" ")[1])
          .join(", ")});
        logMessageWithScreenshot("${stepDescription}");
    }`);
        } else {
          // Method without parameters
          stepMethods.push(`
    @Step("${stepDescription}")
    public void ${method.name}() {
        ${pageObjectName}.${method.name}();
        logMessageWithScreenshot("${stepDescription}");
    }`);
        }
      } else {
        // Method with return value
        if (method.parameters) {
          stepMethods.push(`
    @Step("${stepDescription}: {0}")
    public ${method.returnType} ${method.name}(${method.parameters}) {
        ${method.returnType} result = ${pageObjectName}.${method.name}(${method.parameters
          .split(",")
          .map((p) => p.trim().split(" ")[1])
          .join(", ")});
        logMessageWithScreenshot("${stepDescription}: " + result);
        return result;
    }`);
        } else {
          stepMethods.push(`
    @Step("${stepDescription}")
    public ${method.returnType} ${method.name}() {
        ${method.returnType} result = ${pageObjectName}.${method.name}();
        logMessageWithScreenshot("${stepDescription}: " + result);
        return result;
    }`);
        }
      }
    });

    return stepMethods.join("\n");
  }

  // Fallback: Generate based on elements if page class code not available
  const uniqueElements = new Map<string, Element>();
  elements.forEach((el) => {
    const varName = el.name.toLowerCase();
    if (!uniqueElements.has(varName)) {
      uniqueElements.set(varName, el);
    }
  });

  const uniqueElementsArray = Array.from(uniqueElements.values());

  uniqueElementsArray.forEach((el) => {
    const elementName = el.name;

    if (el.type === "button" || el.type === "link") {
      const clickMethodName = `click${elementName}`;
      if (!processedMethods.has(clickMethodName)) {
        processedMethods.add(clickMethodName);
        stepMethods.push(`
    @Step("Click ${elementName}")
    public void ${clickMethodName}() {
        ${pageObjectName}.${clickMethodName}();
        logMessageWithScreenshot("Click ${elementName}");
    }`);
      }
    }

    if (el.type === "input") {
      const enterMethodName = `enter${elementName}`;
      if (!processedMethods.has(enterMethodName)) {
        processedMethods.add(enterMethodName);
        stepMethods.push(`
    @Step("Enter {0} in ${elementName}")
    public void ${enterMethodName}(String value) {
        ${pageObjectName}.${enterMethodName}(value);
        logMessageWithScreenshot("Enter " + value + " in ${elementName}");
    }`);
      }
    }

    if (el.type === "text" || el.type === "element") {
      const getTextMethodName = `get${elementName}Text`;
      if (!processedMethods.has(getTextMethodName)) {
        processedMethods.add(getTextMethodName);
        stepMethods.push(`
    @Step("Get text from ${elementName}")
    public String ${getTextMethodName}() {
        String text = ${pageObjectName}.${getTextMethodName}();
        logMessageWithScreenshot("Get text from ${elementName}: " + text);
        return text;
    }`);
      }
    }

    if (
      el.type === "select" ||
      el.name.toLowerCase().includes("select") ||
      el.name.toLowerCase().includes("dropdown")
    ) {
      const selectMethodName = `select${elementName}`;
      if (!processedMethods.has(selectMethodName)) {
        processedMethods.add(selectMethodName);
        stepMethods.push(`
    @Step("Select {0} from ${elementName}")
    public void ${selectMethodName}(String option) {
        ${pageObjectName}.${selectMethodName}(option);
        logMessageWithScreenshot("Select " + option + " from ${elementName}");
    }`);
      }
    }
  });

  return stepMethods.join("\n");
}

function generateBaseStepsFile(packageName: string): string {
  return `package com.${packageName}.steps;

import Utility.LogCollector;
import com.${packageName}.DriverInit;
import io.qameta.allure.Allure;
import io.qameta.allure.Attachment;
import org.openqa.selenium.OutputType;
import org.openqa.selenium.TakesScreenshot;

public class BaseSteps {

    public static void logMessagewithoutscreenshot(String message) {
        Allure.step(message);
        LogCollector.addLog(message);
    }

    public static void logMessageWithScreenshot(String message) {
        Allure.step(message, () -> {
            LogCollector.addLog(message);
            return attachScreenshot();

        });
    }

    @Attachment(value = "Screenshot", type = "image/png")
    public static byte[] attachScreenshot() {
        if (DriverInit.getDriverThread() instanceof TakesScreenshot) {
            try {
                return ((TakesScreenshot) DriverInit.getDriverThread()).getScreenshotAs(OutputType.BYTES);
            } catch (Exception e) {
                // Optionally log the error
            }
        }
        // Optionally log a warning if screenshot is not available
        return new byte[0];
    }
}`;
}

async function generateTestFile(
  className: string,
  stepClassName: string,
  packageName: string,
  testCase: TestCase,
  azureConfig?: any,
  stepFile?: string,
): Promise<string> {
  const openAIApiKey = Deno.env.get("OPENAI_API_KEY");

  // Prefer Azure OpenAI if config is provided
  const useAzure = azureConfig?.endpoint && azureConfig?.apiKey && azureConfig?.deploymentName;

  if (!openAIApiKey && !useAzure) {
    console.error("No AI API key found, falling back to template-based generation");
    return generateTestFileTemplate(className, stepClassName, packageName, testCase);
  }

  try {
    const prompt = `Generate a TestNG test class in Java with the following specifications:

CLASS DETAILS:
- Class name: ${className}
- Package: com.${packageName}.tests
- Step class: ${stepClassName} (instance variable: ${stepClassName.toLowerCase()})

TEST CASE: ${testCase.title}
Description: ${testCase.description}
Priority: ${testCase.priority}
Expected Result: ${testCase.expectedResult}

TEST STEPS:
${testCase.steps.map((step, i) => `${i + 1}. ${step}`).join("\n")}

ACTUAL STEP CLASS CODE (USE ONLY THESE EXACT METHOD NAMES):
\`\`\`java
${stepFile || "Step class not available"}
\`\`\`

CRITICAL IMPORT STATEMENT REQUIREMENTS:
- MUST include: package com.${packageName}.tests;
- MUST include: import com.${packageName}.steps.${stepClassName};
- MUST include: import com.${packageName}.DriverInit;
- MUST include: import org.testng.annotations.BeforeClass;
- MUST include: import org.testng.annotations.Test;
- MUST include: import org.testng.annotations.AfterClass;
- MUST include: import org.testng.annotations.AfterMethod;
- MUST include: import org.openqa.selenium.WebDriver;
- MUST include: import static org.testng.Assert.assertEquals;

REQUIREMENTS FOR INTELLIGENT TEST IMPLEMENTATION:
1. Use TestNG annotations (@BeforeClass, @Test, @AfterClass, @AfterMethod)

2. Setup and Teardown:
   - @BeforeClass setUp() MUST use this exact pattern:
     DriverInit.initialization();
     driver = DriverInit.getDriverThread();
   - Create ${stepClassName} instance WITHOUT passing driver: new ${stepClassName}()
   - Step class gets driver internally from DriverInit
   - @AfterClass tearDown() must call DriverInit.quitDriver()
   
3. Test method structure:
   @Test(description = "...", priority = N)
   public void test${sanitizeClassName(testCase.title)}() {
       // Step 1: Navigate
       ${stepClassName.toLowerCase()}.navigateToPage();
       
       // Step 2-N: Call step methods:
       // CRITICAL: Parse the provided Step class code to extract ALL method names
       // Use ONLY the exact method names that exist in the Step class above
       // NEVER invent or guess method names
       // Map test step descriptions to the semantically closest actual Step class method
       // Example: If Step class has "enterTestStartDate()", call that exact method, NOT "setStartDate()"
       
       // Final: Verify
       ${stepClassName.toLowerCase()}.verifyFunctionality();
   }
   
4. Intelligent method calling:
   - CRITICAL: Extract EXACT method names from the Step class code above
   - Parse the Step class to find all public methods
   - Use ONLY the exact method names that exist in the Step class
   - DO NOT invent method names that don't exist in the Step class
   - Match test step descriptions to the semantically closest actual Step class method
   - Pass test data as parameters for input actions
   - Add descriptive System.out.println before each major action
   
5. Test priority mapping:
   - high priority → priority = 1
   - medium priority → priority = 2
   - low priority → priority = 3

Generate ONLY the complete Java class code, no explanations.`;

    const apiUrl = useAzure
      ? `${azureConfig.endpoint}/openai/deployments/${azureConfig.deploymentName}/chat/completions?api-version=2024-02-15-preview`
      : "https://api.openai.com/v1/chat/completions";

    const headers = useAzure
      ? { "api-key": azureConfig.apiKey, "Content-Type": "application/json" }
      : { Authorization: `Bearer ${openAIApiKey}`, "Content-Type": "application/json" };

    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: useAzure ? undefined : "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              'You are a Selenium automation expert. Generate clean, production-ready TestNG test classes. CRITICAL: When calling Step class methods - First parse the provided Step class code to identify ALL available methods, then use ONLY the exact method names that exist in the Step class. NEVER invent method names that don\'t exist in the Step class. Match test step descriptions to the semantically closest actual Step class method. Example: If Step class has "enterTestStartDate()", call that, NOT "setStartDate()". CRITICAL @BeforeClass pattern: In setUp() method you MUST use this exact two-line pattern: First line: DriverInit.initialization(); Second line: driver = DriverInit.getDriverThread(); - Do NOT combine these into one line or use assignment. Step class instantiation WITHOUT driver parameter: new StepClassName(). ALWAYS include all required import statements (DriverInit, Step class, TestNG annotations, WebDriver).',
          },
          { role: "user", content: prompt },
        ],
        max_completion_tokens: 4000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${useAzure ? "Azure OpenAI" : "OpenAI"} API error:`, response.status, errorText);
      return generateTestFileTemplate(className, stepClassName, packageName, testCase);
    }

    const data = await response.json();
    const generatedCode = data.choices[0].message.content;

    const codeMatch = generatedCode.match(/```java\n([\s\S]*?)\n```/) || generatedCode.match(/```\n([\s\S]*?)\n```/);
    const finalCode = codeMatch ? codeMatch[1] : generatedCode;

    console.log(`Successfully generated Test class with ${useAzure ? "Azure OpenAI" : "OpenAI"}`);
    return finalCode.trim();
  } catch (error) {
    console.error(`Error generating test file with ${useAzure ? "Azure OpenAI" : "OpenAI"}:`, error);
    return generateTestFileTemplate(className, stepClassName, packageName, testCase);
  }
}

// Template-based fallback function
function generateTestFileTemplate(
  className: string,
  stepClassName: string,
  packageName: string,
  testCase: TestCase,
): string {
  const testMethodName = `test${sanitizeClassName(testCase.title)}`;
  const testCaseActions = extractActionsFromSteps(testCase.steps);
  const elements = extractElementsFromSteps(testCase.steps);

  return `package com.${packageName}.tests;

import com.${packageName}.steps.${stepClassName};
import com.${packageName}.DriverInit;
import org.testng.annotations.*;
import org.openqa.selenium.WebDriver;
import static org.testng.Assert.assertEquals;

public class ${className} {
    private WebDriver driver;
    private ${stepClassName} ${stepClassName.toLowerCase()};

    @BeforeClass
    public void setUp() {
        // Initialize driver using DriverInit
        DriverInit.initialization();
        driver = DriverInit.getDriverThread();
        
        ${stepClassName.toLowerCase()} = new ${stepClassName}();
    }

    @Test(description = "${testCase.title}", priority = ${testCase.priority === "high" ? "1" : testCase.priority === "medium" ? "2" : "3"})
    public void ${testMethodName}() {
        // Test Description: ${testCase.description}
        // Priority: ${testCase.priority}
        
        ${stepClassName.toLowerCase()}.navigateToPage();
        
        // Test Data:
        ${testCase.testData ? `// ${testCase.testData.split("\n").join("\n        // ")}` : "// No test data specified"}
        
        // Execute test steps using step methods:
${testCaseActions
  .map((action, index) => {
    const stepInfo = generateStepImplementationWithParams(action, "page", elements, index);
    const paramCall = stepInfo.parameterValues ? stepInfo.parameterValues : "";
    return `        // Step ${index + 1}: ${action.step}\n        ${stepClassName.toLowerCase()}.${action.methodName}(${paramCall});`;
  })
  .join("\n")}
        
        // Verify expected result
        ${stepClassName.toLowerCase()}.verifyFunctionality();
        
        // Expected Result: ${testCase.expectedResult}
        
        System.out.println("Test completed successfully: ${testCase.title}");
    }

    @AfterClass
    public void tearDown() {
        DriverInit.quitDriver();
    }

    @AfterMethod
    public void afterMethod() {
        // Add any cleanup needed after each test method
        System.out.println("Test method completed: " + this.getClass().getSimpleName());
    }
}`;
}

async function generateJavaAutomationFilesForStory(
  testCases: TestCase[],
  userStoryTitle: string,
  projectName: string,
  mockupImages?: string[],
  htmlDom?: string,
  appUrl?: string,
  selectedElements?: Array<{ name: string; xpath: string; tagName: string }>,
  azureConfig?: any,
): Promise<GeneratedFiles> {
  const userStoryName = sanitizeClassName(userStoryTitle);
  const projectPackage = sanitizeClassName(projectName).toLowerCase();

  const pageClassName = `${userStoryName}Page`;
  const stepClassName = `${userStoryName}Step`;
  const testClassName = `${userStoryName}Test`;

  // Analyze mockup images using OpenAI vision API if provided
  let aiAnalyzedElements: Element[] = [];
  if (mockupImages && mockupImages.length > 0) {
    console.log("Analyzing mockup images with AI for story-level generation...");
    const allSteps = testCases.flatMap((tc) => tc.steps);
    aiAnalyzedElements = await analyzeImagesForElements(mockupImages, allSteps, htmlDom);
  }

  // Collect all elements and actions from all test cases
  const allElements: Element[] = [];
  const allActions: Action[] = [];

  testCases.forEach((testCase) => {
    const elements = extractElementsFromSteps(testCase.steps, htmlDom, aiAnalyzedElements);
    const actions = extractActionsFromSteps(testCase.steps);

    allElements.push(...elements);
    allActions.push(...actions);
  });

  // Remove duplicates
  let uniqueElements = allElements.filter(
    (element, index, self) => index === self.findIndex((e) => e.name === element.name),
  );

  // If user has selected specific elements, filter to only those
  if (selectedElements && selectedElements.length > 0) {
    console.log(`Filtering to ${selectedElements.length} user-selected elements`);
    uniqueElements = selectedElements.map((selected) => {
      // Try to find matching element from extracted elements
      const cleanSelectedName = cleanElementName(selected.name);
      const matchingElement = uniqueElements.find(
        (el) =>
          cleanElementName(el.name).toLowerCase() === cleanSelectedName.toLowerCase() || el.locator === selected.xpath,
      );

      // If found, use it; otherwise create from selected with locatorStrategy
      return (
        matchingElement || {
          name: cleanSelectedName,
          type: getElementType(selected.tagName),
          // Convert single quotes to double quotes in locator strategy
          locator: ((selected as any).locatorStrategy || selected.xpath || "").replace(/'/g, '"'),
          step: `User-selected element: ${cleanSelectedName}`,
        }
      );
    });
    console.log(`Filtered elements: ${uniqueElements.map((e) => e.name).join(", ")}`);
  }

  // Generate BasePage and DriverInit files
  const basePageFile = generateBasePageFile(projectPackage);
  const driverInitFile = generateDriverInitFile(projectPackage);
  const baseStepsFile = generateBaseStepsFile(projectPackage);

  // Generate Page Object Model file with all elements using OpenAI/Azure OpenAI
  const pageFile = await generatePageFile(
    pageClassName,
    projectPackage,
    uniqueElements,
    allActions,
    htmlDom,
    appUrl,
    mockupImages,
    azureConfig,
  );

  // Generate Step file with all actions using OpenAI/Azure OpenAI (pass uniqueElements to match page class)
  const stepFile = await generateStepFileForStory(
    stepClassName,
    pageClassName,
    projectPackage,
    testCases,
    allActions,
    uniqueElements,
    appUrl,
    azureConfig,
    pageFile,
  );

  // Generate Test file with multiple test methods using OpenAI/Azure OpenAI
  const testFile = await generateTestFileForStory(
    testClassName,
    stepClassName,
    projectPackage,
    testCases,
    azureConfig,
    stepFile,
  );

  // Generate TestNG XML file
  const testngXmlFile = generateTestNgXml(projectPackage, testClassName);

  return {
    pageFile,
    stepFile,
    testFile,
    basePageFile,
    baseStepsFile,
    driverInitFile,
    testngXmlFile,
    pageClassName,
    stepClassName,
    testClassName,
  };
}

async function generateStepFileForStory(
  className: string,
  pageClassName: string,
  packageName: string,
  testCases: TestCase[],
  actions: Action[],
  elements: Element[],
  appUrl?: string,
  azureConfig?: any,
  pageFile?: string,
): Promise<string> {
  const openAIApiKey = Deno.env.get("OPENAI_API_KEY");

  // Prefer Azure OpenAI if config is provided
  const useAzure = azureConfig?.endpoint && azureConfig?.apiKey && azureConfig?.deploymentName;

  if (!openAIApiKey && !useAzure) {
    console.error("No AI API key found, falling back to template-based generation");
    return generateStepFileForStoryTemplate(
      className,
      pageClassName,
      packageName,
      testCases,
      actions,
      elements,
      appUrl,
      pageFile,
    );
  }

  try {
    const allSteps = testCases.flatMap((tc) => tc.steps);
    const uniqueElements = new Map<string, Element>();
    elements.forEach((el) => {
      const varName = el.name.toLowerCase();
      if (!uniqueElements.has(varName)) {
        uniqueElements.set(varName, el);
      }
    });
    const uniqueElementsArray = Array.from(uniqueElements.values());

    const prompt = `Generate a Selenium Step class in Java with the following specifications:

CLASS DETAILS:
- Class name: ${className}
- Package: com.${packageName}.steps
- Must extend BaseSteps
- Page class: ${pageClassName} (instance variable: ${pageClassName.toLowerCase()})

USER STORY WITH MULTIPLE TEST CASES:
${testCases.map((tc, i) => `Test Case ${i + 1}: ${tc.title}\n${tc.steps.map((s, j) => `  ${j + 1}. ${s}`).join("\n")}`).join("\n\n")}

ACTUAL PAGE CLASS CODE (EXTRACT METHOD NAMES FROM THIS):
${pageFile || "Page class not available"}

CRITICAL IMPORT STATEMENT REQUIREMENTS:
- MUST include: package com.${packageName}.steps;
- MUST include: import com.${packageName}.steps.BaseSteps;
- MUST include: import com.${packageName}.pages.${pageClassName};
- MUST include: import io.qameta.allure.Step;
- MUST include: import static org.testng.Assert.*;

REQUIREMENTS FOR INTELLIGENT STEP MAPPING (MULTIPLE TEST CASES):
1. This class MUST extend BaseSteps which provides:
   - logMessageWithScreenshot(String message) - for logging with screenshots
   - logMessagewithoutscreenshot(String message) - for logging without screenshots

2. CRITICAL - Extract ALL method names from the Page class code above:
   - Parse the Page class to find ALL public methods (click, enter, select, verify, wait, get, etc.)
   - Generate a step method for EVERY SINGLE public method found in the Page class
   - Use ONLY the exact method names that exist in the Page class
   - DO NOT skip any methods - create step methods for ALL of them
   - DO NOT invent or create new method names
   
3. INTELLIGENTLY map test steps across all test cases to the ACTUAL Page class methods:
   - "Set Start Date" → if Page has "enterTestStartDate()", call that exact method
   - "Select activities" → if Page has "selectActivities()", call that exact method
   - Match test step intent to the semantically similar Page method
   
4. Generate @Step annotated methods that:
   a) Have descriptive @Step("...") messages matching the test step
   b) Call the appropriate Page class method
   c) Call logMessageWithScreenshot() after the action
   d) For inputs, accept String parameters and pass to Page methods
   
5. Method naming convention (CRITICAL):
   - Extract and use EXACT method names from Page class code above
   - If Page has enterTestStartDate(), Step must call enterTestStartDate() - not setStartDate()
   - If Page has clickSubmitButton(), Step must call clickSubmitButton() - not clickSubmit()
   - Use ${pageClassName.toLowerCase()} to call page class methods
   
6. Required utility methods:
   - navigateToPage() - calls page.navigateToPage()
   - waitForPageToLoad() - calls page.waitForPageToLoad()
   - verifyFunctionality() - performs assertions
   
7. Create comprehensive step methods covering all actions from all test cases
8. Avoid duplicate methods - consolidate similar actions into reusable methods

CRITICAL - COMPREHENSIVE METHOD GENERATION:
- First, parse the Page class code above to extract ALL public method names and signatures
- Generate a step method for EVERY SINGLE public method found (no exceptions)
- Include methods like: click*, enter*, select*, verify*, wait*, get*, validate*, check*, etc.
- Use the EXACT method name and parameters from the Page class - DO NOT modify or invent names
- Preserve method return types and parameters exactly as in Page class
- Then, map each test step to the semantically closest Page method
- Example: If Page has "enterTestStartDate(String date)", Step must have enterTestStartDate(String date)
- Example: If Page has "verifyPageTitle()", Step must have verifyPageTitle()

Generate ONLY the complete Java class code, no explanations.`;

    const apiUrl = useAzure
      ? `${azureConfig.endpoint}/openai/deployments/${azureConfig.deploymentName}/chat/completions?api-version=2024-02-15-preview`
      : "https://api.openai.com/v1/chat/completions";

    const headers = useAzure
      ? { "api-key": azureConfig.apiKey, "Content-Type": "application/json" }
      : { Authorization: `Bearer ${openAIApiKey}`, "Content-Type": "application/json" };

    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: useAzure ? undefined : "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "You are a Selenium automation expert. Generate clean, production-ready Java Step classes with proper @Step annotations. CRITICAL REQUIREMENT: Parse the provided Page class code to extract ALL public methods (every single one) and generate a corresponding step method for EACH of them. Do not skip any methods - include click, enter, select, verify, wait, get, validate, check, and all other methods. Step classes extend BaseSteps and call Page class methods using the exact names and signatures from the Page class. Preserve return types and parameters exactly. Intelligently map test step descriptions across multiple test cases to appropriate page methods. Always use logMessageWithScreenshot() from BaseSteps. ALWAYS include all required import statements (BaseSteps, Page class, @Step, assertions).",
          },
          { role: "user", content: prompt },
        ],
        max_completion_tokens: 4000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${useAzure ? "Azure OpenAI" : "OpenAI"} API error:`, response.status, errorText);
      return generateStepFileForStoryTemplate(
        className,
        pageClassName,
        packageName,
        testCases,
        actions,
        elements,
        appUrl,
      );
    }

    const data = await response.json();
    const generatedCode = data.choices[0].message.content;

    const codeMatch = generatedCode.match(/```java\n([\s\S]*?)\n```/) || generatedCode.match(/```\n([\s\S]*?)\n```/);
    const finalCode = codeMatch ? codeMatch[1] : generatedCode;

    console.log(`Successfully generated Step class for story with ${useAzure ? "Azure OpenAI" : "OpenAI"}`);
    return finalCode.trim();
  } catch (error) {
    console.error(`Error generating step file for story with ${useAzure ? "Azure OpenAI" : "OpenAI"}:`, error);
    return generateStepFileForStoryTemplate(
      className,
      pageClassName,
      packageName,
      testCases,
      actions,
      elements,
      appUrl,
      pageFile,
    );
  }
}

function generateStepFileForStoryTemplate(
  className: string,
  pageClassName: string,
  packageName: string,
  testCases: TestCase[],
  actions: Action[],
  elements: Element[],
  appUrl?: string,
  pageFile?: string,
): string {
  const stepMethods = generateStepMethodsFromPageClass(elements, pageClassName.toLowerCase(), pageFile);

  // Navigation step using page class method
  const navigationStep = appUrl
    ? `
    @Step("Navigate to page")
    public void navigateToPage() {
        ${pageClassName.toLowerCase()}.navigateToPage();
        logMessageWithScreenshot("Navigate to page");
    }`
    : `
    @Step("Navigate to page")
    public void navigateToPage() {
        driver.get("application-url");
        logMessageWithScreenshot("Navigate to page");
    }`;

  const waitForPageLoadStep = `
    @Step("Wait for page to load")
    public void waitForPageToLoad() {
        ${pageClassName.toLowerCase()}.waitForPageToLoad();
        logMessageWithScreenshot("Wait for page to load");
    }`;

  return `package com.${packageName}.steps;

import com.${packageName}.pages.${pageClassName};
import io.qameta.allure.Step;
import org.openqa.selenium.WebDriver;
import static org.testng.Assert.*;

public class ${className} extends BaseSteps {
    private ${pageClassName} ${pageClassName.toLowerCase()};

    public ${className}() {
        this.${pageClassName.toLowerCase()} = new ${pageClassName}();
    }

    // Step methods that call corresponding page class methods
${stepMethods}
${navigationStep}
${waitForPageLoadStep}

    @Step("Verify functionality")
    public void verifyFunctionality() {
        String pageTitle = ${pageClassName.toLowerCase()}.validatePageTitle();
        assertNotNull(pageTitle, "Page title should not be null");
        logMessageWithScreenshot("Verify functionality");
    }
}`;
}

// Helper function to generate step implementation with parameters
function generateStepImplementationWithParams(
  action: Action,
  pageObjectName: string,
  elements: Element[],
  index: number,
): { implementation: string; parameters: string; parameterValues: string } {
  const actionLower = action.step.toLowerCase();
  const actionWords = actionLower.split(/\s+/).filter((w) => w.length > 0);

  // Enhanced element matching with better scoring algorithm
  const findBestMatchingElement = (type: string): Element | undefined => {
    let bestMatch: Element | undefined;
    let bestScore = 0;

    for (const el of elements) {
      if (el.type !== type) continue;

      let score = 0;
      const elementNameLower = el.name.toLowerCase();
      const elementDescLower = (el.step || "").toLowerCase();

      // Score based on exact element name match in action
      if (actionLower.includes(elementNameLower)) {
        score += 100;
      }

      // Score based on element description matching action
      if (el.step && actionLower.includes(elementDescLower)) {
        score += 80;
      }

      // Score based on word overlap between action and element name
      const elementWords = elementNameLower
        .replace(/([A-Z])/g, " $1")
        .toLowerCase()
        .split(/\s+/);
      for (const word of actionWords) {
        if (word.length > 3) {
          if (elementWords.some((ew) => ew.includes(word) || word.includes(ew))) {
            score += 20;
          }
        }
      }

      // Extract key terms from action step for better matching
      const keyTerms = extractKeyTerms(action.step);
      for (const term of keyTerms) {
        if (elementNameLower.includes(term.toLowerCase())) {
          score += 30;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = el;
      }
    }

    // If no good match found, return first element of matching type
    return bestMatch || elements.find((el) => el.type === type);
  };

  // Helper to extract key terms from action step (nouns, specific identifiers)
  const extractKeyTerms = (step: string): string[] => {
    // Extract words in quotes
    const quotedTerms = step.match(/["']([^"']+)["']/g)?.map((m) => m.replace(/["']/g, "")) || [];

    // Extract capitalized words (likely UI element names)
    const capitalizedTerms = step.match(/\b[A-Z][a-z]+\b/g) || [];

    // Common UI element terms
    const actionVerbs = ["click", "enter", "type", "select", "verify", "check", "press", "tap", "navigate", "open"];
    const terms = step
      .split(/\s+/)
      .filter((word) => word.length > 3 && !actionVerbs.includes(word.toLowerCase()))
      .map((word) => word.replace(/[^a-zA-Z0-9]/g, ""));

    return [...new Set([...quotedTerms, ...capitalizedTerms, ...terms])];
  };

  // For click actions - call specific click method from page class
  if (action.type === "click") {
    const buttonElement = findBestMatchingElement("button") || findBestMatchingElement("link");

    if (buttonElement) {
      // Ensure proper method name casing
      const elementName = buttonElement.name.charAt(0).toUpperCase() + buttonElement.name.slice(1);
      const methodName = `click${elementName}`;
      return {
        implementation: `${pageObjectName}.${methodName}();`,
        parameters: "",
        parameterValues: "",
      };
    }

    // Fallback: try to extract button/element name from step
    const keyTerms = extractKeyTerms(action.step);
    if (keyTerms.length > 0) {
      const elementName = sanitizeClassName(keyTerms[0]);
      return {
        implementation: `${pageObjectName}.click${elementName}();`,
        parameters: "",
        parameterValues: "",
      };
    }

    return {
      implementation: `// TODO: Map this click action to correct page method\n        // ${action.step}\n        ${pageObjectName}.waitForPageToLoad();`,
      parameters: "",
      parameterValues: "",
    };
  }

  // For input actions - call specific enter method from page class with parameter
  if (action.type === "input") {
    const inputElement = findBestMatchingElement("input");

    if (inputElement) {
      // Extract test data from action
      let testData = "test-data";
      if (action.testData && action.testData.length > 0) {
        testData = action.testData[0];
      } else {
        // Try to extract from step text in quotes
        const testDataMatch = action.step.match(/["']([^"']+)["']/);
        if (testDataMatch) {
          testData = testDataMatch[1];
        }
      }

      // Ensure proper method name casing
      const elementName = inputElement.name.charAt(0).toUpperCase() + inputElement.name.slice(1);
      const methodName = `enter${elementName}`;
      return {
        implementation: `${pageObjectName}.${methodName}(value);`,
        parameters: "String value",
        parameterValues: `"${testData}"`,
      };
    }

    // Fallback: try to extract field name from step
    const keyTerms = extractKeyTerms(action.step);
    if (keyTerms.length > 0) {
      const fieldName = sanitizeClassName(keyTerms[keyTerms.length - 1]);
      const testValue = action.testData?.[0] || "test-value";
      return {
        implementation: `${pageObjectName}.enter${fieldName}(value);`,
        parameters: "String value",
        parameterValues: `"${testValue}"`,
      };
    }

    return {
      implementation: `// TODO: Map this input action to correct page method\n        // ${action.step}\n        ${pageObjectName}.waitForPageToLoad();`,
      parameters: "",
      parameterValues: "",
    };
  }

  // For verify actions - call specific getText method from page class
  if (action.type === "verify") {
    const textElement = findBestMatchingElement("text") || findBestMatchingElement("element");

    if (textElement) {
      // Ensure proper method name casing
      const elementName = textElement.name.charAt(0).toUpperCase() + textElement.name.slice(1);
      const methodName = `get${elementName}Text`;
      return {
        implementation: `String actualText = ${pageObjectName}.${methodName}();\n        assertNotNull(actualText, "Expected text element should be visible");\n        // TODO: Add specific text assertion based on expected value`,
        parameters: "",
        parameterValues: "",
      };
    }

    // Fallback: try to extract element name from step
    const keyTerms = extractKeyTerms(action.step);
    if (keyTerms.length > 0) {
      const elementName = sanitizeClassName(keyTerms[0]);
      return {
        implementation: `String actualText = ${pageObjectName}.get${elementName}Text();\n        assertNotNull(actualText, "${elementName} should be visible");`,
        parameters: "",
        parameterValues: "",
      };
    }

    return {
      implementation: `// TODO: Map this verification to correct page method\n        // ${action.step}\n        ${pageObjectName}.waitForPageToLoad();`,
      parameters: "",
      parameterValues: "",
    };
  }

  // For select/dropdown actions
  if (action.type === "select") {
    const selectElement = findBestMatchingElement("select");

    if (selectElement) {
      let optionValue = "option-value";
      if (action.testData && action.testData.length > 0) {
        optionValue = action.testData[0];
      } else {
        const quotedMatch = action.step.match(/["']([^"']+)["']/);
        if (quotedMatch) optionValue = quotedMatch[1];
      }

      // Ensure proper method name casing
      const elementName = selectElement.name.charAt(0).toUpperCase() + selectElement.name.slice(1);
      const methodName = `select${elementName}`;
      return {
        implementation: `${pageObjectName}.${methodName}(option);`,
        parameters: "String option",
        parameterValues: `"${optionValue}"`,
      };
    }
  }

  // For navigate actions - use navigateToPage method
  if (action.type === "navigate") {
    return {
      implementation: `${pageObjectName}.navigateToPage();`,
      parameters: "",
      parameterValues: "",
    };
  }

  // Default: try to generate a generic implementation
  return {
    implementation: `// TODO: Implement step logic by calling appropriate page methods\n        // ${action.step}\n        ${pageObjectName}.waitForPageToLoad();`,
    parameters: "",
    parameterValues: "",
  };
}

// Generate step method call from step class based on action
function generateStepMethodCall(action: Action, stepObjectName: string, elements: Element[], index: number): string {
  // Helper to find best matching element
  const findBestMatchingElement = (type: string): Element | null => {
    const actionLower = action.step.toLowerCase();
    const actionWords = actionLower.split(/\s+/);

    let bestMatch: Element | null = null;
    let bestScore = 0;

    for (const el of elements.filter((e) => e.type === type)) {
      let score = 0;
      const elementNameLower = el.name.toLowerCase();

      // Score based on exact element name match in action
      if (actionLower.includes(elementNameLower)) {
        score += 100;
      }

      // Score based on word overlap
      const elementWords = elementNameLower
        .replace(/([A-Z])/g, " $1")
        .toLowerCase()
        .split(/\s+/);
      for (const word of actionWords) {
        if (word.length > 3) {
          if (elementWords.some((ew) => ew.includes(word) || word.includes(ew))) {
            score += 20;
          }
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = el;
      }
    }

    return bestMatch || elements.find((el) => el.type === type) || null;
  };

  // For click actions - call click method from step class
  if (action.type === "click") {
    const buttonElement = findBestMatchingElement("button") || findBestMatchingElement("link");

    if (buttonElement) {
      const elementName = buttonElement.name.charAt(0).toUpperCase() + buttonElement.name.slice(1);
      const methodName = `click${elementName}`;
      return `${stepObjectName}.${methodName}();`;
    }

    return `// TODO: Map click action to step method\n        // ${action.step}\n        ${stepObjectName}.waitForPageToLoad();`;
  }

  // For input actions - call enter method from step class with test data
  if (action.type === "input") {
    const inputElement = findBestMatchingElement("input");

    if (inputElement) {
      const elementName = inputElement.name.charAt(0).toUpperCase() + inputElement.name.slice(1);
      const methodName = `enter${elementName}`;

      // Extract test data from action
      let testData = "test-data";
      if (action.testData && action.testData.length > 0) {
        testData = action.testData[0];
      } else {
        // Try to extract from step description
        const matches = action.step.match(/["']([^"']+)["']/);
        if (matches && matches[1]) {
          testData = matches[1];
        }
      }

      return `${stepObjectName}.${methodName}("${testData}");`;
    }

    return `// TODO: Map input action to step method\n        // ${action.step}`;
  }

  // For select actions - call select method from step class
  if (action.type === "select") {
    const selectElement =
      findBestMatchingElement("select") ||
      elements.find((el) => el.name.toLowerCase().includes("select") || el.name.toLowerCase().includes("dropdown"));

    if (selectElement) {
      const elementName = selectElement.name.charAt(0).toUpperCase() + selectElement.name.slice(1);
      const methodName = `select${elementName}`;

      // Extract test data
      let testData = "option-value";
      if (action.testData && action.testData.length > 0) {
        testData = action.testData[0];
      } else {
        const matches = action.step.match(/["']([^"']+)["']/);
        if (matches && matches[1]) {
          testData = matches[1];
        }
      }

      return `${stepObjectName}.${methodName}("${testData}");`;
    }

    return `// TODO: Map select action to step method\n        // ${action.step}`;
  }

  // For verify actions - call getText or verification method
  if (action.type === "verify") {
    const textElement = findBestMatchingElement("text") || findBestMatchingElement("element");

    if (textElement) {
      const elementName = textElement.name.charAt(0).toUpperCase() + textElement.name.slice(1);
      const methodName = `get${elementName}Text`;

      // Extract expected value from step
      const matches = action.step.match(/["']([^"']+)["']/);
      const expectedValue = matches && matches[1] ? matches[1] : "expected-value";

      return `String actualText = ${stepObjectName}.${methodName}();\n        assertTrue(actualText.contains("${expectedValue}"), "Verification failed for ${textElement.name}");`;
    }

    return `${stepObjectName}.verifyFunctionality();\n        // ${action.step}`;
  }

  // Default: add comment with original step
  return `// TODO: Implement step\n        // ${action.step}\n        ${stepObjectName}.waitForPageToLoad();`;
}

// Legacy function kept for backward compatibility
function generateStepImplementation(
  action: Action,
  pageObjectName: string,
  elements: Element[],
  index: number,
): string {
  return generateStepImplementationWithParams(action, pageObjectName, elements, index).implementation;
}

async function generateTestFileForStory(
  className: string,
  stepClassName: string,
  packageName: string,
  testCases: TestCase[],
  azureConfig?: any,
  stepFile?: string,
): Promise<string> {
  const openAIApiKey = Deno.env.get("OPENAI_API_KEY");

  // Prefer Azure OpenAI if config is provided
  const useAzure = azureConfig?.endpoint && azureConfig?.apiKey && azureConfig?.deploymentName;

  if (!openAIApiKey && !useAzure) {
    console.error("No AI API key found, falling back to template-based generation");
    return generateTestFileForStoryTemplate(className, stepClassName, packageName, testCases);
  }

  try {
    const prompt = `Generate a TestNG test class in Java with the following specifications:

CLASS DETAILS:
- Class name: ${className}
- Package: com.${packageName}.tests
- Step class: ${stepClassName} (instance variable: ${stepClassName.toLowerCase()})

MULTIPLE TEST CASES FOR USER STORY:
${testCases
  .map(
    (tc, i) => `
Test Case ${i + 1}: ${tc.title}
- Description: ${tc.description}
- Priority: ${tc.priority}
- Expected Result: ${tc.expectedResult}
- Test ID: ${tc.readableId || tc.id}
- Steps:
${tc.steps.map((s, j) => `  ${j + 1}. ${s}`).join("\n")}
${tc.testData ? `- Test Data: ${tc.testData}` : ""}
`,
  )
  .join("\n")}

ACTUAL STEP CLASS CODE (USE ONLY THESE EXACT METHOD NAMES):
\`\`\`java
${stepFile || "Step class not available"}
\`\`\`

CRITICAL IMPORT STATEMENT REQUIREMENTS:
- MUST include: package com.${packageName}.tests;
- MUST include: import com.${packageName}.steps.${stepClassName};
- MUST include: import com.${packageName}.DriverInit;
- MUST include: import org.testng.annotations.BeforeClass;
- MUST include: import org.testng.annotations.Test;
- MUST include: import org.testng.annotations.AfterClass;
- MUST include: import org.testng.annotations.AfterMethod;
- MUST include: import org.openqa.selenium.WebDriver;
- MUST include: import static org.testng.Assert.assertEquals;

REQUIREMENTS FOR INTELLIGENT TEST IMPLEMENTATION (MULTIPLE TEST CASES):
1. Use TestNG annotations (@BeforeClass, @Test, @AfterClass, @AfterMethod)

2. Setup and Teardown:
   - @BeforeClass setUp() MUST use this exact pattern:
     DriverInit.initialization();
     driver = DriverInit.getDriverThread();
   - Create ${stepClassName} instance WITHOUT passing driver: new ${stepClassName}()
   - Step class gets driver internally from DriverInit
   - @AfterClass tearDown() must call DriverInit.quitDriver()
   
3. Create separate @Test method for each test case above with structure:
   @Test(description = "...", priority = N)
   public void testMethodName() {
       // Step 1: Navigate
       ${stepClassName.toLowerCase()}.navigateToPage();
       
       // Step 2-N: Call step methods:
       // CRITICAL: Parse the provided Step class code to extract ALL method names
       // Use ONLY the exact method names that exist in the Step class above
       // NEVER invent or guess method names
       // Map test step descriptions to the semantically closest actual Step class methods
       // Example: If Step class has "enterTestStartDate()", call that exact method, NOT "setStartDate()"
       
       // Final: Verify
       ${stepClassName.toLowerCase()}.verifyFunctionality();
   }
   
4. Intelligent method calling:
   - CRITICAL: Extract EXACT method names from the Step class code above
   - Parse the Step class to find all public methods
   - Use ONLY the exact method names that exist in the Step class
   - DO NOT invent method names that don't exist in the Step class
   - Match test step descriptions to the semantically closest actual Step class methods
   - Pass test data as parameters for input actions
   - Add descriptive System.out.println before each major action
   
5. Test priority mapping:
   - high priority → priority = 1
   - medium priority → priority = 2
   - low priority → priority = 3
   
6. Add meaningful comments for each test case showing test ID and description

Generate ONLY the complete Java class code, no explanations.`;

    const apiUrl = useAzure
      ? `${azureConfig.endpoint}/openai/deployments/${azureConfig.deploymentName}/chat/completions?api-version=2024-02-15-preview`
      : "https://api.openai.com/v1/chat/completions";

    const headers = useAzure
      ? { "api-key": azureConfig.apiKey, "Content-Type": "application/json" }
      : { Authorization: `Bearer ${openAIApiKey}`, "Content-Type": "application/json" };

    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: useAzure ? undefined : "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              'You are a Selenium automation expert. Generate clean, production-ready TestNG test classes with multiple test methods. CRITICAL: When calling Step class methods - First parse the provided Step class code to identify ALL available methods, then use ONLY the exact method names that exist in the Step class. NEVER invent method names that don\'t exist in the Step class. Match test step descriptions to the semantically closest actual Step class methods. Example: If Step class has "enterTestStartDate()", call that, NOT "setStartDate()". CRITICAL @BeforeClass pattern: In setUp() method you MUST use this exact two-line pattern: First line: DriverInit.initialization(); Second line: driver = DriverInit.getDriverThread(); - Do NOT combine these into one line or use assignment. Step class instantiation WITHOUT driver parameter: new StepClassName(). ALWAYS include all required import statements (DriverInit, Step class, TestNG annotations, WebDriver).',
          },
          { role: "user", content: prompt },
        ],
        max_completion_tokens: 4000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${useAzure ? "Azure OpenAI" : "OpenAI"} API error:`, response.status, errorText);
      return generateTestFileForStoryTemplate(className, stepClassName, packageName, testCases);
    }

    const data = await response.json();
    const generatedCode = data.choices[0].message.content;

    const codeMatch = generatedCode.match(/```java\n([\s\S]*?)\n```/) || generatedCode.match(/```\n([\s\S]*?)\n```/);
    const finalCode = codeMatch ? codeMatch[1] : generatedCode;

    console.log(`Successfully generated Test class for story with ${useAzure ? "Azure OpenAI" : "OpenAI"}`);
    return finalCode.trim();
  } catch (error) {
    console.error(`Error generating test file for story with ${useAzure ? "Azure OpenAI" : "OpenAI"}:`, error);
    return generateTestFileForStoryTemplate(className, stepClassName, packageName, testCases);
  }
}

function generateTestFileForStoryTemplate(
  className: string,
  stepClassName: string,
  packageName: string,
  testCases: TestCase[],
): string {
  // Generate test methods for each test case
  const testMethods = testCases.map((testCase, index) => {
    const testMethodName = `test${sanitizeClassName(testCase.title)}`;
    const testCaseActions = extractActionsFromSteps(testCase.steps);
    const elements = extractElementsFromSteps(testCase.steps);

    // Generate actual step method calls based on actions
    const stepCalls = testCaseActions
      .map((action, actionIndex) => {
        const stepMethodCall = generateStepMethodCall(action, stepClassName.toLowerCase(), elements, actionIndex);
        return `        // Step ${actionIndex + 1}: ${action.step}\n        ${stepMethodCall}`;
      })
      .join("\n");

    return `
    @Test(description = "${testCase.title}", priority = ${testCase.priority === "high" ? "1" : testCase.priority === "medium" ? "2" : "3"})
    public void ${testMethodName}() {
        // Test Description: ${testCase.description}
        // Priority: ${testCase.priority}
        // Test ID: ${testCase.readableId || testCase.id}
        
        ${stepClassName.toLowerCase()}.navigateToPage();
        
        // Test Data:
        ${testCase.testData ? `// ${testCase.testData.split("\n").join("\n        // ")}` : "// No test data specified"}
        
        // Execute test steps:
${stepCalls}
        
        // Verify expected result
        ${stepClassName.toLowerCase()}.verifyFunctionality();
        
        // Expected Result: ${testCase.expectedResult}
        
        System.out.println("Test completed successfully: ${testCase.title}");
    }`;
  });

  return `package com.${packageName}.tests;

import com.${packageName}.steps.${stepClassName};
import com.${packageName}.DriverInit;
import org.testng.annotations.*;
import org.openqa.selenium.WebDriver;
import static org.testng.Assert.assertEquals;

public class ${className} {
    private WebDriver driver;
    private ${stepClassName} ${stepClassName.toLowerCase()};

    @BeforeClass
    public void setUp() {
        // Initialize driver using DriverInit
        DriverInit.initialization();
        driver = DriverInit.getDriverThread();
        
        ${stepClassName.toLowerCase()} = new ${stepClassName}();
    }

    // Test methods for all test cases in this user story
${testMethods.join("\n")}

    @AfterClass
    public void tearDown() {
        DriverInit.quitDriver();
    }

    @AfterMethod
    public void afterMethod() {
        // Add any cleanup needed after each test method
        System.out.println("Test method completed: " + this.getClass().getSimpleName());
    }
}`;
}

function generateBasePageFile(packageName: string): string {
  return `package com.${packageName};

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.openqa.selenium.*;
import org.openqa.selenium.interactions.Actions;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;
import java.util.*;

public class BasePage {

    protected WebDriver driver;
    public WebDriverWait wait;
    public static final String DIR = System.getProperty("user.dir");
    private static final Logger logger = LogManager.getLogger(BasePage.class);
    public static int explicitWaitInSeconds = 60;
    public static int sleepDurationInMiliSeconds = 5000;
    int secondsForPageLoad = 90;

    public BasePage() {
        driver = DriverInit.getDriverThread();
        this.wait = new WebDriverWait(driver, Duration.ofSeconds(explicitWaitInSeconds));
    }

    public String validatePageTitle() {
        sleepForDuration();
        return driver.getTitle();
    }

    public void navigateToPage(String pageURL) {
        sleepForDuration();
        driver.get(pageURL);
    }
    
    public void sleepForDuration() {
        try {
            Thread.sleep(sleepDurationInMiliSeconds);
            logger.debug("Waiting for the next operation.");
        } catch (Exception ex) {
            logger.warn(ex.fillInStackTrace().getLocalizedMessage());
        }
    }

    public void scrollIntoView(WebElement element) {
        JavascriptExecutor jsExecutor = (JavascriptExecutor) driver;
        jsExecutor.executeScript("arguments[0].style.border = '3px solid blue'", element);
        jsExecutor.executeScript("arguments[0].scrollIntoView({behavior: \\"auto\\", block: \\"center\\", inline: \\"center\\"});", element);
    }

    public void highlightElement(WebElement element) {
        JavascriptExecutor jsExecutor = (JavascriptExecutor) driver;
        jsExecutor.executeScript("arguments[0].style.border = '3px solid blue'", element);
    }

    protected void jsClick(WebElement element) {
        JavascriptExecutor js = (JavascriptExecutor) driver;
        js.executeScript("arguments[0].style.border = '3px solid red'", element);
        js.executeScript("arguments[0].click();", element);
    }


    protected void click(WebElement element) {
        wait = new WebDriverWait(driver, Duration.ofSeconds(explicitWaitInSeconds));
        wait.until(ExpectedConditions.elementToBeClickable(element));
        scrollIntoView(element);
        element.click();
        logger.debug("we click element " + element);
    }

    protected void dynamicClick(String element) {
        wait = new WebDriverWait(driver, Duration.ofSeconds(explicitWaitInSeconds));
        WebElement SeleniumElement = wait.until(ExpectedConditions.elementToBeClickable(driver.findElement(By.xpath(element))));
        scrollIntoView(SeleniumElement);
        SeleniumElement.click();
        logger.debug("we click element " + element);
    }

    public void WaitTillGeneratingContract(WebElement element) {
        try {
            scrollIntoView(element);
            wait = new WebDriverWait(driver, Duration.ofSeconds(explicitWaitInSeconds));
            wait.until(ExpectedConditions.invisibilityOf(element));
        } catch (Exception e) {
            logger.debug(e.getLocalizedMessage());
        }
    }

    protected void sendKeys(WebElement element, String val) {
        wait = new WebDriverWait(driver, Duration.ofSeconds(explicitWaitInSeconds));
        wait.until(ExpectedConditions.elementToBeClickable(element));
        scrollIntoView(element);
        element.clear();
        element.sendKeys(val);
        logger.debug("we sent following string " + val + " to element " + element);
    }

    protected void sendSpecialKeys(WebElement element, Keys val) {
        scrollIntoView(element);
        element.sendKeys(val);
        logger.debug("we sent following key " + val + " to element " + element);
    }

    protected void clickbyTextindex(String element, String data, int index) {
        wait = new WebDriverWait(driver, Duration.ofSeconds(explicitWaitInSeconds));
        WebElement SeleniumElement = wait.until(ExpectedConditions.elementToBeClickable(driver.findElement(
                By.xpath("(" + element + "[text()='" + data + "'])[" + index + "]"))));
        scrollIntoView(SeleniumElement);
        SeleniumElement.click();
        logger.debug("we click element " + SeleniumElement);
    }

    protected String getTitleofPage() {
        String title = driver.getTitle();
        logger.debug("Title of page is " + title);
        return title;
    }

    protected void clickByText(String element, String data) {
        WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(explicitWaitInSeconds));
        try {
            String xpathExpression = element + "[text()='" + data + "']";
            WebElement seleniumElement = wait.until(ExpectedConditions.elementToBeClickable(By.xpath(xpathExpression)));
            scrollIntoView(seleniumElement);
            seleniumElement.click();
            logger.debug("Clicked on element with text '{}': {}", data, seleniumElement);
        } catch (Exception e) {
            logger.error("An error occurred while clicking on element with text '{}'. Error: {}", data, e.getMessage());
            throw e;
        }
    }

    protected WebElement findVisibleAndClickableElement(String xpath) {
        logger.debug("Looking for elements with xpath " + xpath);
        List<WebElement> elements = driver.findElements(By.xpath(xpath));

        for (WebElement element : elements) {
            boolean isD = element.isDisplayed();
            boolean isCl = isClickable(element, 2);
            if (isD && isCl) {
                return element;
            } else {
                logger.debug("element is not visible/clicable " + isD + " / " + isCl + " /" + element);
            }
        }
        return null;
    }

    protected boolean isClickable(WebElement element, int timeout) {
        try {
            WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(timeout));
            wait.until(ExpectedConditions.elementToBeClickable(element));
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    protected void switchtoiframe(String frame) {
        driver.switchTo().frame(frame);
        logger.debug("Switched to frame " + frame);
    }

    protected void switchtoiframe(WebElement frame) {
        driver.switchTo().frame(frame);
        logger.debug("Switched to frame " + frame);
    }

    public void switchToIframeByNameOrId(String expectedNameOrId) {
        wait = new WebDriverWait(driver, Duration.ofSeconds(explicitWaitInSeconds));
        List<WebElement> iframes = wait.until(ExpectedConditions.presenceOfAllElementsLocatedBy(By.tagName("iframe")));

        for (WebElement iframe : iframes) {
            if (expectedNameOrId.equals(iframe.getAttribute("name")) || expectedNameOrId.equals(iframe.getAttribute("id"))) {
                driver.switchTo().frame(iframe);
                logger.debug("Switched to frame " + iframe);
            }
        }
        logger.error("No matching iframe was found.");
    }

    protected void switchtodefault() {
        driver.switchTo().defaultContent();
        logger.debug("Switched to default content");
    }

    protected String getText(WebElement element) {
        highlightElement(element);
        String str = element.getText();
        logger.debug("Get element string " + element + " String = " + str);
        return str;
    }

    protected String getValue(WebElement element) {
        highlightElement(element);
        String str = element.getAttribute("value");
        logger.debug("Get element string " + element + " String = " + str);
        return str;
    }

    protected void waitForVisiblityofobject(String element, String data) {
        wait = new WebDriverWait(driver, Duration.ofSeconds(explicitWaitInSeconds));
        WebElement SeleniumElement = wait.until(ExpectedConditions.visibilityOf(driver.findElement(
                By.xpath(element + "[text()='" + data + "']"))));
        logger.debug("element Visible " + SeleniumElement);
    }

    public boolean isElementPresentAndVisible(String locator) {
        try {
            WebElement element = driver.findElement(By.xpath(locator));
            return element.isDisplayed();
        } catch (org.openqa.selenium.NoSuchElementException e) {
            return false;
        }
    }

    protected void waitForElementBecameVisible(WebElement element) {
        WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(explicitWaitInSeconds));
        wait.until(ExpectedConditions.visibilityOf(element));
        logger.debug("element Visible " + element);
    }

    protected void waitForPageToLoad(WebElement... elements) {
        Duration dur = Duration.ofSeconds(secondsForPageLoad);
        new WebDriverWait(driver, dur).until(webDriver ->
                ((JavascriptExecutor) webDriver).executeScript("return document.readyState").equals("complete"));

        try {
            new WebDriverWait(driver, dur).until(webDriver ->
                    ((JavascriptExecutor) webDriver).executeScript("return jQuery.active").toString().equals("0"));
        } catch (Exception ex) {
        }

        for (WebElement element : elements) {
            new WebDriverWait(driver, dur).until(ExpectedConditions.elementToBeClickable(element));
        }
    }

    protected void waitForElement(WebElement webElement) {
        Duration dur = Duration.ofSeconds(explicitWaitInSeconds);

        new WebDriverWait(driver, dur).until(webDriver ->
                ((JavascriptExecutor) webDriver).executeScript("return document.readyState").equals("complete"));

        try {
            new WebDriverWait(driver, dur).until(webDriver ->
                    ((JavascriptExecutor) webDriver).executeScript("return jQuery.active").toString().equals("0"));
        } catch (Exception ex) {
        }

        new WebDriverWait(driver, dur).until(ExpectedConditions.elementToBeClickable(webElement));
    }

    protected void waitForTextToDisappear(String text) {
        try {
            Duration duration = Duration.ofSeconds(explicitWaitInSeconds * 3L);
            wait = new WebDriverWait(driver, duration);
            wait.until(ExpectedConditions.invisibilityOfElementLocated(By.xpath("//*[text()=\\"" + text + "\\"]")));
            logger.debug("Waiting for the " + text + " to disappear from the page.");
        } catch (Exception e) {
            logger.error("An error occurred while waiting for the " + text + " to disappear from the page. Error: {}", e.getMessage());
            sleepForDuration();
            sleepForDuration();
        }
    }

    protected void waitForTextToAppear(String expectedText) {
        Duration duration = Duration.ofSeconds(explicitWaitInSeconds);
        wait = new WebDriverWait(driver, duration);
        wait.until(ExpectedConditions.visibilityOfElementLocated(By.xpath("//*[text()=\\"" + expectedText + "\\"]")));
        logger.debug("Waiting for the text '" + expectedText + "' to appear on the page.");
    }

    protected WebElement findElementByExactText(String text) {
        return driver.findElement(By.xpath("//*[text()=\\"" + text + "\\"]"));
    }

    protected WebElement[] getElementsByXPath(String xpath) {
        List<WebElement> elements = driver.findElements(By.xpath(xpath));
        WebElement[] elementsArray = new WebElement[elements.size()];
        elements.toArray(elementsArray);
        return elementsArray;
    }

    public void switchToNewTab() {
        Set<String> allWindows = driver.getWindowHandles();
        List<String> windowList = new ArrayList<>(allWindows);
        driver.switchTo().window(windowList.get(windowList.size() - 1));
        sleepForDuration();
    }

    public void actions(WebElement element) {
        Actions a = new Actions(driver);
        a.moveToElement(element).perform();
    }

    public void closebrowser() {
        driver.close();
    }
}`;
}

function generateDriverInitFile(packageName: string): string {
  return `package com.${packageName};

import org.openqa.selenium.PageLoadStrategy;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import java.util.concurrent.TimeUnit;

public class DriverInit {

    final static Logger logger = LogManager.getLogger(DriverInit.class);

    private static final ThreadLocal<WebDriver> driverThread = new ThreadLocal<>();
    public static ChromeOptions options;

    public static synchronized void initialization() {
        if (driverThread.get() == null) {
            logger.debug("Driver init " + Thread.currentThread().getName());
            options = new ChromeOptions();
            options.setPageLoadStrategy(PageLoadStrategy.NORMAL);
            driverThread.set(new ChromeDriver(options));
            driverThread.get().manage().window().maximize();
            driverThread.get().manage().deleteAllCookies();
            driverThread.get().manage().timeouts().pageLoadTimeout(80, TimeUnit.SECONDS);
            logger.debug("Driver init done" + Thread.currentThread().getName());
        }
    }

    public static synchronized WebDriver getDriverThread() {
        logger.debug("Driver get " + Thread.currentThread().getName());
        if (driverThread.get() == null) {
            logger.error("!!!!no driver available !!! " + Thread.currentThread().getName());
        }
        return driverThread.get();
    }

    public static synchronized void quitDriver() {
        logger.debug("Driver close" + Thread.currentThread().getName());
        driverThread.get().quit();
        driverThread.remove();
    }
}`;
}

function generateTestNgXml(packageName: string, testClassName: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE suite SYSTEM "https://testng.org/testng-1.0.dtd">
<suite name="Automation Test Suite" parallel="false">
    <listeners>
        <listener class-name="com.${packageName}.Utility.JsonTestReportListener"></listener>
    </listeners>
    
    <test verbose="2" preserve-order="true" name="All Tests">
        <classes>
            <class name="com.${packageName}.tests.${testClassName}"/>
        </classes>
    </test>
</suite>`;
}

function generateLogCollectorFile(packageName: string): string {
  return `package com.${packageName}.Utility;

import java.util.ArrayList;
import java.util.List;

public class LogCollector {
    private static final ThreadLocal<List<String>> logs = ThreadLocal.withInitial(ArrayList::new);

    public static void addLog(String message) {
        logs.get().add(message);
    }

    public static List<String> getLogs() {
        return new ArrayList<>(logs.get());
    }

    public static void clearLogs() {
        logs.get().clear();
    }

    public static void remove() {
        logs.remove();
    }
}`;
}

function generateListenerFile(packageName: string): string {
  return `package com.${packageName}.Utility;

import com.${packageName}.DriverInit;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.qameta.allure.Allure;
import org.openqa.selenium.OutputType;
import org.openqa.selenium.TakesScreenshot;
import org.openqa.selenium.WebDriver;
import org.testng.ITestContext;
import org.testng.ITestListener;
import org.testng.ITestResult;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.*;

public class JsonTestReportListener implements ITestListener {
    private final List<Map<String, Object>> testResults = new ArrayList<>();
    private final String reportDir = "test-output/json-reports";
    private long suiteStartTime;

    @Override
    public void onStart(ITestContext context) {
        suiteStartTime = System.currentTimeMillis();
        new File(reportDir).mkdirs();
        System.out.println("Test Suite Started: " + context.getName());
    }

    @Override
    public void onTestStart(ITestResult result) {
        System.out.println("Test Started: " + result.getName());
    }

    @Override
    public void onTestSuccess(ITestResult result) {
        captureTestResult(result, "PASSED");
        captureScreenshot(result, "Test Passed");
    }

    @Override
    public void onTestFailure(ITestResult result) {
        captureTestResult(result, "FAILED");
        captureScreenshot(result, "Test Failed");
    }

    @Override
    public void onTestSkipped(ITestResult result) {
        captureTestResult(result, "SKIPPED");
    }

    @Override
    public void onFinish(ITestContext context) {
        long suiteEndTime = System.currentTimeMillis();
        generateJsonReport(context, suiteEndTime);
        System.out.println("Test Suite Finished: " + context.getName());
    }

    private void captureTestResult(ITestResult result, String status) {
        Map<String, Object> testData = new LinkedHashMap<>();
        testData.put("testName", result.getName());
        testData.put("status", status);
        testData.put("duration", (result.getEndMillis() - result.getStartMillis()) + "ms");
        testData.put("startTime", new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new Date(result.getStartMillis())));
        testData.put("endTime", new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new Date(result.getEndMillis())));
        
        if (result.getThrowable() != null) {
            testData.put("errorMessage", result.getThrowable().getMessage());
            testData.put("stackTrace", Arrays.toString(result.getThrowable().getStackTrace()));
        }

        // Add logs from LogCollector
        testData.put("logs", LogCollector.getLogs());
        LogCollector.clearLogs();

        testResults.add(testData);
    }

    private void captureScreenshot(ITestResult result, String message) {
        try {
            WebDriver driver = DriverInit.getDriverThread();
            if (driver instanceof TakesScreenshot) {
                byte[] screenshot = ((TakesScreenshot) driver).getScreenshotAs(OutputType.BYTES);
                Allure.addAttachment(
                    message + " - " + result.getName(),
                    "image/png",
                    new ByteArrayInputStream(screenshot),
                    "png"
                );
            }
        } catch (Exception e) {
            System.err.println("Failed to capture screenshot: " + e.getMessage());
        }
    }

    private void generateJsonReport(ITestContext context, long suiteEndTime) {
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("suiteName", context.getName());
        report.put("totalTests", context.getAllTestMethods().length);
        report.put("passed", context.getPassedTests().size());
        report.put("failed", context.getFailedTests().size());
        report.put("skipped", context.getSkippedTests().size());
        report.put("duration", (suiteEndTime - suiteStartTime) + "ms");
        report.put("startTime", new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new Date(suiteStartTime)));
        report.put("endTime", new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new Date(suiteEndTime)));
        report.put("tests", testResults);

        try {
            ObjectMapper mapper = new ObjectMapper();
            String timestamp = new SimpleDateFormat("yyyyMMdd_HHmmss").format(new Date());
            String fileName = reportDir + "/test-report-" + timestamp + ".json";
            
            FileWriter fileWriter = new FileWriter(fileName);
            mapper.writerWithDefaultPrettyPrinter().writeValue(fileWriter, report);
            fileWriter.close();
            
            System.out.println("JSON Report generated: " + fileName);
        } catch (IOException e) {
            System.err.println("Failed to generate JSON report: " + e.getMessage());
            e.printStackTrace();
        }
    }
}`;
}
