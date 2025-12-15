// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface AutomationRequest {
  frameworkSkeleton?: File;
  frameworkCode?: string;
  screenshots: File[];
  domSourceCode: string;
  programmingLanguage: string;
  userStory?: {
    id: string;
    title: string;
    description: string;
  };
  testCases?: Array<{
    id: string;
    title: string;
    description: string;
    steps: string;
    expectedResult: string;
    priority: string;
    testData: string;
  }>;
  optionalInstructions?: string;
  excelFile?: File;
  azureConfig?: {
    endpoint: string;
    apiKey: string;
    deploymentId: string;
    apiVersion: string;
  };
  // New fields for custom automation generation
  userStoryName?: string;
  htmlDom?: string;
  stepsInNaturalLanguage?: string;
  mockupFiles?: File[];
}

interface AutomationResponse {
  success: boolean;
  generatedCode: string;
  frameworkStructure: any;
  downloadableZip?: string;
  error?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting automation generation process...');
    
    const formData = await req.formData();
    
    // Get project ID and auth
    const projectId = formData.get('projectId') as string;
    const authHeader = req.headers.get('Authorization');
    
    if (!authHeader) {
      throw new Error('Authorization header is required');
    }
    
    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      throw new Error('Invalid authentication');
    }
    
    // Parse the automation request from form data
    const request: AutomationRequest = {
      screenshots: [],
      domSourceCode: formData.get('domSourceCode') as string || '',
      programmingLanguage: formData.get('programmingLanguage') as string,
      optionalInstructions: formData.get('optionalInstructions') as string || '',
      frameworkCode: formData.get('frameworkCode') as string || '',
      // Handle both old and new request formats
      userStoryName: formData.get('userStoryName') as string || '',
      htmlDom: formData.get('htmlDom') as string || '',
      stepsInNaturalLanguage: formData.get('stepsInNaturalLanguage') as string || '',
      mockupFiles: [],
    };

    // Parse userStory and testCases if they exist (legacy format)
    const userStoryData = formData.get('userStory') as string;
    const testCasesData = formData.get('testCases') as string;
    const azureConfigData = formData.get('azureConfig') as string;
    
    if (userStoryData && userStoryData !== '{}') {
      request.userStory = JSON.parse(userStoryData);
    }
    if (testCasesData && testCasesData !== '[]') {
      request.testCases = JSON.parse(testCasesData);
    }
    if (azureConfigData && azureConfigData !== 'null') {
      request.azureConfig = JSON.parse(azureConfigData);
    }

    // Handle framework skeleton file (takes priority over framework code)
    const frameworkFile = formData.get('frameworkSkeleton') as File;
    if (frameworkFile) {
      request.frameworkSkeleton = frameworkFile;
    }

    // Handle multiple screenshot files
    const screenshotFiles = formData.getAll('screenshots') as File[];
    request.screenshots = screenshotFiles;

    // Handle mockup files
    const mockupFiles = [];
    let mockupIndex = 0;
    while (formData.get(`mockupFile${mockupIndex}`) !== null) {
      const mockupFile = formData.get(`mockupFile${mockupIndex}`) as File;
      if (mockupFile) {
        mockupFiles.push(mockupFile);
      }
      mockupIndex++;
    }
    request.mockupFiles = mockupFiles;

    // Handle Excel file
    const excelFile = formData.get('excelFile') as File;
    if (excelFile) {
      request.excelFile = excelFile;
    }

    console.log(`Processing request for language: ${request.programmingLanguage}`);
    console.log(`User story: ${request.userStory?.title || request.userStoryName || 'Custom automation'}`);
    console.log(`Number of test cases: ${request.testCases?.length || 0}`);
    console.log(`Number of screenshots: ${request.screenshots.length}`);
    console.log(`Number of mockup files: ${request.mockupFiles?.length || 0}`);
    console.log(`Steps provided: ${request.stepsInNaturalLanguage ? 'Yes' : 'No'}`);

    // Validate required inputs for both formats
    if (!request.programmingLanguage) {
      throw new Error('Programming language is required');
    }

    // For custom automation, stepsInNaturalLanguage is required
    if (!request.userStory && !request.stepsInNaturalLanguage) {
      throw new Error('Either user story with test cases or steps in natural language are required');
    }

    // Get OpenAI configuration from database
    let openaiConfig = null;
    if (projectId) {
      const { data: configData, error: configError } = await supabase
        .from('integration_configs')
        .select('config, enabled')
        .eq('project_id', projectId)
        .eq('integration_id', 'openai')
        .single();
      
      if (configData && configData.enabled) {
        openaiConfig = configData.config;
        console.log('Found OpenAI config in database:', {
          hasEndpoint: !!openaiConfig.endpoint,
          hasApiKey: !!openaiConfig.apiKey,
          hasDeploymentId: !!openaiConfig.deploymentId,
          endpoint: openaiConfig.endpoint ? openaiConfig.endpoint.substring(0, 30) + '...' : 'N/A'
        });
      }
    }

    // Determine if we're using Azure OpenAI or regular OpenAI
    const isAzureConfig = openaiConfig?.endpoint && openaiConfig?.endpoint.includes('azure.com');
    const useOpenAI = !request.azureConfig?.endpoint && !isAzureConfig;
    
    console.log('AI Configuration Detection:', {
      isAzureConfig,
      useOpenAI,
      hasRequestAzureConfig: !!request.azureConfig?.endpoint,
      configEndpoint: openaiConfig?.endpoint || 'N/A'
    });
    
    if (useOpenAI && !openaiConfig?.apiKey) {
      throw new Error('OpenAI configuration not found in database. Please configure OpenAI in the Integrations module.');
    }
    
    if (isAzureConfig && (!openaiConfig?.endpoint || !openaiConfig?.apiKey)) {
      throw new Error('Azure OpenAI configuration incomplete. Please check endpoint and API key in the Integrations module.');
    }
    
    if (!useOpenAI && !isAzureConfig && (!request.azureConfig?.endpoint || !request.azureConfig?.apiKey || !request.azureConfig?.deploymentId)) {
      throw new Error('Azure OpenAI configuration is required (endpoint, apiKey, and deploymentId)');
    }

    // Build comprehensive AI prompt
    const aiPrompt = await buildAIPrompt(request);
    
    // Call AI service based on configuration type
    let generatedCode: string;
    if (isAzureConfig) {
      console.log('Using Azure OpenAI from database config');
      // Use Azure OpenAI from database config
      generatedCode = await callAzureOpenAI(aiPrompt, {
        endpoint: openaiConfig.endpoint,
        apiKey: openaiConfig.apiKey,
        deploymentId: openaiConfig.deploymentId || openaiConfig.name || 'gpt-4',
        apiVersion: openaiConfig.apiVersion || '2024-02-15-preview'
      });
    } else if (useOpenAI) {
      console.log('Using regular OpenAI from database config');
      // Use regular OpenAI from database config
      generatedCode = await callOpenAIFromDatabase(aiPrompt, openaiConfig);
    } else {
      console.log('Using Azure OpenAI from request (legacy)');
      // Use Azure OpenAI from request (legacy)
      generatedCode = await callAzureOpenAI(aiPrompt, request.azureConfig!);
    }
    
    // Process and integrate code into framework
    const frameworkStructure = processFrameworkStructure(request, generatedCode);
    
    // Generate downloadable ZIP (if framework skeleton provided)
    const downloadableZip = generateDownloadableFramework(request, generatedCode);

    const response: AutomationResponse = {
      success: true,
      generatedCode,
      frameworkStructure,
      downloadableZip
    };

    console.log('Automation generation completed successfully');

    return new Response(
      JSON.stringify(response),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error in automation generation:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorResponse: AutomationResponse = {
      success: false,
      generatedCode: '',
      frameworkStructure: null,
      error: errorMessage
    };

    return new Response(
      JSON.stringify(errorResponse),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

async function callOpenAI(prompt: string, userId?: string, projectId?: string): Promise<string> {
  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAIApiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const startTime = Date.now();
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are an expert test automation engineer. Generate complete, production-ready automation code based on the provided requirements.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 4000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // Log AI usage
    if (userId) {
      const executionTime = Date.now() - startTime;
      const cost = ((data.usage?.prompt_tokens || 0) * 0.00003 / 1000) + ((data.usage?.completion_tokens || 0) * 0.00006 / 1000);
      
      const supabase = createClient(supabaseUrl, supabaseKey);
      try {
        await supabase.from('ai_usage_logs').insert({
          user_id: userId,
          project_id: projectId || null,
          feature_type: 'automation_generation',
          success: true,
          execution_time_ms: executionTime,
          openai_model: data.model || 'gpt-4o',
          openai_tokens_prompt: data.usage?.prompt_tokens || 0,
          openai_tokens_completion: data.usage?.completion_tokens || 0,
          tokens_used: data.usage?.total_tokens || 0,
          openai_cost_usd: cost,
        });
      } catch (logError) {
        console.error('Failed to log AI usage:', logError);
      }
    }
    
    return content;
  } catch (error) {
    console.error('Error calling OpenAI:', error);
    throw error;
  }
}

async function callOpenAIFromDatabase(prompt: string, config: any): Promise<string> {
  if (!config?.apiKey) {
    throw new Error('OpenAI API key not found in database configuration');
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are an expert test automation engineer. Generate complete, production-ready automation code based on the provided requirements.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 4000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Error calling OpenAI from database config:', error);
    throw error;
  }
}

async function buildAIPrompt(request: AutomationRequest): Promise<string> {
  console.log('Building comprehensive AI prompt...');
  
  let prompt = `# Test Automation Code Generation Request

## Project Context
**Programming Language:** ${request.programmingLanguage}
`;

  // Handle both formats - legacy user story format and new custom format
  if (request.userStory && request.testCases) {
    // Legacy format with user story and test cases
    prompt += `**User Story:** ${request.userStory.title}
**Description:** ${request.userStory.description}

## Test Cases to Automate
`;
    
    // Add all test cases
    request.testCases.forEach((testCase, index) => {
      prompt += `
### Test Case ${index + 1}: ${testCase.title}
**Description:** ${testCase.description}
**Steps:** ${testCase.steps}
**Expected Result:** ${testCase.expectedResult}
**Priority:** ${testCase.priority}
**Test Data:** ${testCase.testData}
`;
    });
  } else {
    // New custom format with steps in natural language
    prompt += `**Functionality:** ${request.userStoryName || 'Custom Automation Script'}

## Test Steps (Natural Language)
${request.stepsInNaturalLanguage}
`;
  }

  // Add DOM source code if provided (legacy) or HTML DOM (new format)
  const domContent = request.domSourceCode || request.htmlDom;
  if (domContent && domContent.trim()) {
    prompt += `

## UI Structure (DOM)
\`\`\`html
${domContent}
\`\`\`
`;
  }

  // Add screenshots and mockup files information
  const totalFiles = (request.screenshots?.length || 0) + (request.mockupFiles?.length || 0);
  if (totalFiles > 0) {
    prompt += `

## Visual References
${request.screenshots?.length || 0} screenshot(s) and ${request.mockupFiles?.length || 0} mockup file(s) are included for reference.
`;
  }

  // Add framework code if provided
  if (request.frameworkCode && request.frameworkCode.trim()) {
    prompt += `

## Framework Code Template
\`\`\`${request.programmingLanguage}
${request.frameworkCode}
\`\`\`
`;
  }

  // Add specific guidelines based on programming language
  const languageGuidelines = getLanguageSpecificGuidelines(request.programmingLanguage);
  
  prompt += `

## Requirements

1. **Generate Complete Test Automation Code:**
   - Create comprehensive Page Object Model classes with proper element locators
   - Implement robust Step Definitions/Methods that execute the test scenarios
   - Generate complete Test Classes with proper test methods and assertions
   - Include proper imports, annotations, and framework setup

2. **Code Quality Standards:**
   - Follow industry best practices for test automation
   - Use meaningful variable and method names
   - Add appropriate comments and documentation
   - Implement proper error handling and logging
   - Use robust element locators (prefer ID, CSS selectors, or XPath as appropriate)

3. **Framework Structure:**
   - Organize code into proper packages/modules
   - Separate concerns: Page Objects, Steps, Tests, and Utilities
   - Make code maintainable and reusable
   - Follow the chosen programming language conventions

${languageGuidelines}

## Additional Instructions
${request.optionalInstructions || 'Generate clean, production-ready automation code following best practices.'}

## Output Format
Please provide the complete automation code including:
1. **Page Object Classes** - With proper element locators and page methods
2. **Step Definition Classes** - With methods that implement the test logic
3. **Test Classes** - With complete test methods and proper assertions
4. **Base/Utility Classes** - For common functionality and setup

Generate actual working code, not pseudocode. The code should be ready to run with minimal setup.
`;

  console.log('AI prompt built successfully');
  return prompt;
}

function getLanguageSpecificGuidelines(language: string): string {
  switch (language.toLowerCase()) {
    case 'java':
      return `
**Java Specific Guidelines:**
- Use TestNG or JUnit 5 framework
- Implement Page Object Model with PageFactory
- Use Maven or Gradle build configuration
- Include proper WebDriver management
- Use Selenium WebDriver 4.x features
- Implement proper wait strategies
- Include Allure or ExtentReports for reporting
- Use properties files for configuration
- Implement parallel execution capabilities`;

    case 'python':
      return `
**Python Specific Guidelines:**
- Use pytest framework with fixtures
- Implement Page Object Model with classes
- Use requirements.txt for dependencies
- Include proper WebDriver management with webdriver-manager
- Use Selenium WebDriver with explicit waits
- Implement Allure or HTML reporting
- Use config.py or .env for configuration
- Include proper logging with Python logging module
- Support parallel execution with pytest-xdist`;

    case 'javascript':
      return `
**JavaScript Specific Guidelines:**
- Use WebdriverIO or Cypress framework
- Implement Page Object Model with ES6 classes
- Use package.json with proper scripts
- Include proper async/await patterns
- Use modern JavaScript/TypeScript features
- Implement Allure or Mochawesome reporting
- Use configuration files (wdio.conf.js or cypress.config.js)
- Include proper error handling with try-catch
- Support parallel execution and headless mode`;

    case 'csharp':
      return `
**C# Specific Guidelines:**
- Use NUnit or xUnit framework
- Implement Page Object Model with classes
- Use NuGet packages for dependencies
- Include proper WebDriver management
- Use Selenium WebDriver with explicit waits
- Implement ExtentReports or Allure for reporting
- Use app.config or appsettings.json for configuration
- Include proper logging with NLog or Serilog
- Support parallel execution with NUnit or xUnit`;

    default:
      return `
**General Guidelines:**
- Follow industry best practices for test automation
- Use Page Object Model pattern
- Include proper wait strategies
- Implement comprehensive reporting
- Use configuration files for environment settings
- Include proper error handling and logging`;
  }
}

async function callAzureOpenAI(prompt: string, azureConfig: any): Promise<string> {
  try {
    const url = `${azureConfig.endpoint}/openai/deployments/${azureConfig.deploymentId}/chat/completions?api-version=${azureConfig.apiVersion || '2024-02-15-preview'}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'api-key': azureConfig.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are an expert test automation engineer specializing in creating comprehensive automation frameworks.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 4000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Azure OpenAI API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Error calling Azure OpenAI:', error);
    throw error;
  }
}

function processFrameworkStructure(request: AutomationRequest, generatedCode: string): any {
  const userStoryTitle = request.userStory?.title || request.userStoryName || 'CustomAutomation';
  const mainTestFile = getMainTestFileName(userStoryTitle, request.programmingLanguage);
  
  return {
    language: request.programmingLanguage,
    mainTestFile: mainTestFile,
    testCaseCount: request.testCases?.length || 1,
    framework: getFrameworkName(request.programmingLanguage),
    structure: getGeneratedFileStructure(request.programmingLanguage),
    generatedCodeLength: generatedCode.length
  };
}

function getMainTestFileName(userStoryTitle: string, language: string): string {
  const sanitizedTitle = userStoryTitle.replace(/[^a-zA-Z0-9]/g, '');
  const className = sanitizedTitle.charAt(0).toUpperCase() + sanitizedTitle.slice(1) + 'Test';
  return `${className}.${getFileExtension(language)}`;
}

function getFileExtension(language: string): string {
  switch (language.toLowerCase()) {
    case 'java':
      return 'java';
    case 'python':
      return 'py';
    case 'javascript':
      return 'js';
    case 'csharp':
      return 'cs';
    default:
      return 'txt';
  }
}

function getFrameworkName(language: string): string {
  switch (language.toLowerCase()) {
    case 'java':
      return 'Selenium + TestNG';
    case 'python':
      return 'Selenium + pytest';
    case 'javascript':
      return 'WebdriverIO';
    case 'csharp':
      return 'Selenium + NUnit';
    default:
      return 'Selenium';
  }
}

function getGeneratedFileStructure(language: string): any {
  switch (language.toLowerCase()) {
    case 'java':
      return {
        src: {
          main: {
            java: {
              pages: ['BasePage.java', 'LoginPage.java'],
              utils: ['DriverManager.java', 'TestUtils.java']
            }
          },
          test: {
            java: {
              tests: ['BaseTest.java', 'LoginTest.java'],
              steps: ['LoginSteps.java']
            }
          }
        },
        'pom.xml': 'Maven configuration',
        'testng.xml': 'TestNG suite configuration'
      };

    case 'python':
      return {
        pages: ['__init__.py', 'base_page.py', 'login_page.py'],
        tests: ['__init__.py', 'test_login.py'],
        utils: ['__init__.py', 'driver_manager.py', 'test_utils.py'],
        'requirements.txt': 'Python dependencies',
        'pytest.ini': 'pytest configuration'
      };

    case 'javascript':
      return {
        pages: ['BasePage.js', 'LoginPage.js'],
        tests: ['login.test.js'],
        utils: ['DriverManager.js', 'TestUtils.js'],
        'package.json': 'Node.js dependencies',
        'wdio.conf.js': 'WebdriverIO configuration'
      };

    case 'csharp':
      return {
        Pages: ['BasePage.cs', 'LoginPage.cs'],
        Tests: ['BaseTest.cs', 'LoginTest.cs'],
        Utils: ['DriverManager.cs', 'TestUtils.cs'],
        'packages.config': 'NuGet packages',
        'app.config': 'Application configuration'
      };

    default:
      return {
        pages: ['BasePage', 'LoginPage'],
        tests: ['LoginTest'],
        utils: ['DriverManager', 'TestUtils']
      };
  }
}

function generateDownloadableFramework(request: AutomationRequest, generatedCode: string): string | undefined {
  // This would typically create a ZIP file with the generated framework
  // For now, return a placeholder indicating that ZIP generation would happen here
  return 'framework-with-generated-tests.zip';
}