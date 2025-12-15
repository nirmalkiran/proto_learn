import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TestCase {
  id: string;
  title: string;
  description: string;
  steps: Array<{ type: string; content: string }> | string;
  expectedResult: string;
  priority: string;
}

interface GeneratedFiles {
  pageFile: string;
  stepFile: string;
  testFile: string;
  pageClassName: string;
  stepClassName: string;
  testClassName: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    // Get user from auth
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { testCase, projectId }: { testCase: TestCase, projectId: string } = await req.json();
    
    console.log('Generating Selenium automation for test case:', testCase.title);

    const generatedFiles = generateJavaAutomationFiles(testCase);

    // Log AI usage for automation generation
    try {
      await supabase.from('ai_usage_logs').insert({
        user_id: user.id,
        project_id: projectId,
        feature_type: 'selenium_automation_generation',
        tokens_used: 0, // This is template-based, not AI model-based
        execution_time_ms: Date.now() - startTime,
        success: true
      });
    } catch (logError) {
      console.error('Failed to log AI usage:', logError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        ...generatedFiles
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error generating Selenium automation:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

function sanitizeClassName(title: string): string {
  return title
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^[0-9]/, 'Test$&') // Ensure class name doesn't start with number
    + 'Test';
}

function extractFieldName(stepContent: string): string {
  // Extract field name from patterns like: "Fill in the 'Test Name' field"
  const singleQuoteMatch = stepContent.match(/'([^']+)'/);
  if (singleQuoteMatch) return singleQuoteMatch[1];
  
  const doubleQuoteMatch = stepContent.match(/"([^"]+)"/);
  if (doubleQuoteMatch) return doubleQuoteMatch[1];
  
  // Try to extract from patterns like "Enter Test Name" or "Click Submit Button"
  const words = stepContent.split(' ');
  const actionWords = ['fill', 'enter', 'type', 'click', 'press', 'select', 'verify', 'check', 'navigate', 'open', 'input'];
  const filteredWords = words.filter(w => !actionWords.includes(w.toLowerCase()) && !['in', 'the', 'field', 'with', 'valid', 'data', 'button', 'on', 'to'].includes(w.toLowerCase()));
  
  return filteredWords.join(' ') || 'element';
}

function toCamelCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^[^a-zA-Z]/, '');
}

interface StepMetadata {
  type: 'navigate' | 'click' | 'input' | 'verify' | 'other';
  fieldName: string;
  camelCaseName: string;
  content: string;
}

function analyzeSteps(steps: Array<{ type: string; content: string }>): StepMetadata[] {
  return steps.map(step => {
    const content = step.content.toLowerCase();
    const fieldName = extractFieldName(step.content);
    const camelCaseName = toCamelCase(fieldName);
    
    let type: StepMetadata['type'] = 'other';
    
    if (content.includes('navigate') || content.includes('open')) {
      type = 'navigate';
    } else if (content.includes('click') || content.includes('press')) {
      type = 'click';
    } else if (content.includes('fill') || content.includes('enter') || content.includes('type') || content.includes('input')) {
      type = 'input';
    } else if (content.includes('verify') || content.includes('check')) {
      type = 'verify';
    }
    
    return {
      type,
      fieldName,
      camelCaseName,
      content: step.content
    };
  });
}

function generateJavaAutomationFiles(testCase: TestCase): GeneratedFiles {
  const pageClassName = sanitizeClassName(testCase.title) + 'Page';
  const stepClassName = sanitizeClassName(testCase.title) + 'Steps';
  const testClassName = sanitizeClassName(testCase.title) + 'Test';
  
  // Parse steps
  const steps = typeof testCase.steps === 'string' 
    ? JSON.parse(testCase.steps) 
    : testCase.steps;
  
  const stepMetadata = analyzeSteps(steps);
  
  const pageFile = generatePageFile(testCase, pageClassName, stepMetadata);
  const stepFile = generateStepFile(testCase, stepClassName, pageClassName, stepMetadata);
  const testFile = generateTestFile(testCase, testClassName, stepClassName, stepMetadata);
  
  return {
    pageFile,
    stepFile,
    testFile,
    pageClassName,
    stepClassName,
    testClassName
  };
}

function generatePageFile(testCase: TestCase, className: string, stepMetadata: StepMetadata[]): string {
  let elements = '';
  let methods = '';
  
  stepMetadata.forEach((meta) => {
    if (meta.type === 'click') {
      elements += `    @FindBy(xpath = "//button[contains(text(),'${meta.fieldName}')]")\n    private WebElement ${meta.camelCaseName}Button;\n\n`;
      methods += `    public void click${meta.camelCaseName.charAt(0).toUpperCase() + meta.camelCaseName.slice(1)}Button() {\n        wait.until(ExpectedConditions.elementToBeClickable(${meta.camelCaseName}Button));\n        ${meta.camelCaseName}Button.click();\n    }\n\n`;
    } else if (meta.type === 'input') {
      elements += `    @FindBy(id = "${meta.camelCaseName}Input")\n    private WebElement ${meta.camelCaseName}Input;\n\n`;
      methods += `    public void enter${meta.camelCaseName.charAt(0).toUpperCase() + meta.camelCaseName.slice(1)}Input(String text) {\n        wait.until(ExpectedConditions.visibilityOf(${meta.camelCaseName}Input));\n        ${meta.camelCaseName}Input.clear();\n        ${meta.camelCaseName}Input.sendKeys(text);\n    }\n\n`;
    } else if (meta.type === 'verify') {
      elements += `    @FindBy(xpath = "//*[contains(text(),'${meta.fieldName}')]")\n    private WebElement ${meta.camelCaseName}Element;\n\n`;
      methods += `    public boolean is${meta.camelCaseName.charAt(0).toUpperCase() + meta.camelCaseName.slice(1)}Displayed() {\n        wait.until(ExpectedConditions.visibilityOf(${meta.camelCaseName}Element));\n        return ${meta.camelCaseName}Element.isDisplayed();\n    }\n\n`;
    }
  });
  
  return `package com.testautomation.pages;

import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;
import org.openqa.selenium.support.PageFactory;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.openqa.selenium.support.ui.ExpectedConditions;
import java.time.Duration;

/**
 * Page Object for: ${testCase.title}
 * Description: ${testCase.description}
 */
public class ${className} {
    
    private WebDriver driver;
    private WebDriverWait wait;
    
${elements}
    public ${className}(WebDriver driver) {
        this.driver = driver;
        this.wait = new WebDriverWait(driver, Duration.ofSeconds(10));
        PageFactory.initElements(driver, this);
    }
    
    public void navigateToPage(String url) {
        driver.get(url);
    }
    
${methods}
}`;
}

function generateStepFile(testCase: TestCase, className: string, pageClassName: string, stepMetadata: StepMetadata[]): string {
  let stepMethods = '';
  
  stepMetadata.forEach((meta) => {
    if (meta.type === 'navigate') {
      stepMethods += `    @Step("${meta.content}")\n    public void navigateToApplication() {\n        page.navigateToPage("https://your-application-url.com");\n    }\n\n`;
    } else if (meta.type === 'click') {
      stepMethods += `    @Step("${meta.content}")\n    public void click${meta.camelCaseName.charAt(0).toUpperCase() + meta.camelCaseName.slice(1)}Button() {\n        page.click${meta.camelCaseName.charAt(0).toUpperCase() + meta.camelCaseName.slice(1)}Button();\n    }\n\n`;
    } else if (meta.type === 'input') {
      stepMethods += `    @Step("${meta.content}")\n    public void enter${meta.camelCaseName.charAt(0).toUpperCase() + meta.camelCaseName.slice(1)}Input(String text) {\n        page.enter${meta.camelCaseName.charAt(0).toUpperCase() + meta.camelCaseName.slice(1)}Input(text);\n    }\n\n`;
    } else if (meta.type === 'verify') {
      stepMethods += `    @Step("${meta.content}")\n    public void verify${meta.camelCaseName.charAt(0).toUpperCase() + meta.camelCaseName.slice(1)}IsDisplayed() {\n        Assert.assertTrue(page.is${meta.camelCaseName.charAt(0).toUpperCase() + meta.camelCaseName.slice(1)}Displayed(), "${meta.fieldName} should be displayed");\n    }\n\n`;
    } else {
      stepMethods += `    @Step("${meta.content}")\n    public void perform${meta.camelCaseName.charAt(0).toUpperCase() + meta.camelCaseName.slice(1)}() {\n        // TODO: Implement step - ${meta.content}\n    }\n\n`;
    }
  });
  
  return `package com.testautomation.steps;

import com.testautomation.pages.${pageClassName};
import io.qameta.allure.Step;
import org.openqa.selenium.WebDriver;
import org.testng.Assert;

/**
 * Step definitions for: ${testCase.title}
 * Description: ${testCase.description}
 */
public class ${className} {
    
    private ${pageClassName} page;
    
    public ${className}(WebDriver driver) {
        this.page = new ${pageClassName}(driver);
    }
    
${stepMethods}
}`;
}

function generateTestFile(testCase: TestCase, className: string, stepClassName: string, stepMetadata: StepMetadata[]): string {
  let testStepCalls = '';
  
  stepMetadata.forEach((meta) => {
    if (meta.type === 'navigate') {
      testStepCalls += `        steps.navigateToApplication();\n`;
    } else if (meta.type === 'click') {
      testStepCalls += `        steps.click${meta.camelCaseName.charAt(0).toUpperCase() + meta.camelCaseName.slice(1)}Button();\n`;
    } else if (meta.type === 'input') {
      testStepCalls += `        steps.enter${meta.camelCaseName.charAt(0).toUpperCase() + meta.camelCaseName.slice(1)}Input("test_data");\n`;
    } else if (meta.type === 'verify') {
      testStepCalls += `        steps.verify${meta.camelCaseName.charAt(0).toUpperCase() + meta.camelCaseName.slice(1)}IsDisplayed();\n`;
    } else {
      testStepCalls += `        steps.perform${meta.camelCaseName.charAt(0).toUpperCase() + meta.camelCaseName.slice(1)}();\n`;
    }
  });
  
  // Convert priority to TestNG priority number (High=1, Medium=2, Low=3)
  const priorityMap: { [key: string]: number } = {
    'High': 1,
    'high': 1,
    'Medium': 2,
    'medium': 2,
    'Low': 3,
    'low': 3
  };
  const priorityValue = priorityMap[testCase.priority] || 2;
  
  return `package com.testautomation.tests;

import com.testautomation.steps.${stepClassName};
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.testng.annotations.AfterClass;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

/**
 * Test class for: ${testCase.title}
 * Description: ${testCase.description}
 * Priority: ${testCase.priority}
 * Expected Result: ${testCase.expectedResult}
 */
public class ${className} {
    
    private WebDriver driver;
    private ${stepClassName} steps;
    
    @BeforeClass
    public void setUp() {
        driver = new ChromeDriver();
        driver.manage().window().maximize();
        steps = new ${stepClassName}(driver);
    }
    
    @Test(description = "${testCase.id} | ${testCase.description}", priority = ${priorityValue})
    public void test${className.replace('Test', '')}() {
${testStepCalls}
    }
    
    @AfterClass
    public void tearDown() {
        if (driver != null) {
            driver.quit();
        }
    }
}`;
}
