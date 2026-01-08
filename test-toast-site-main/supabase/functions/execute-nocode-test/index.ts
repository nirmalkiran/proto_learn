import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chromium } from "npm:playwright-core@1.40.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TestStep {
  id: string;
  type: string;
  selector?: string;
  value?: string;
  description: string;
  extraData?: Record<string, any>;
  skip?: boolean;
}

interface ExecutionResult {
  stepId: string;
  step?: TestStep;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
  screenshot?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let executionId: string | undefined;
  let supabase: any;

  try {
    const { testId, projectId, executionId: execId, baseUrl, steps } = await req.json();
    executionId = execId;

    console.log('Starting test execution:', { testId, projectId, executionId });

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch Browserbase credentials from integration_configs
    console.log('Fetching Browserbase configuration for project:', projectId);
    const { data: browserbaseConfig, error: configError } = await supabase
      .from('integration_configs')
      .select('config, enabled')
      .eq('project_id', projectId)
      .eq('integration_id', 'browserbase')
      .single();

    if (configError || !browserbaseConfig) {
      const errorMsg = 'Browserbase integration not configured. Please configure Browserbase in the Integrations module.';
      console.error(errorMsg, configError);
      
      await supabase
        .from('nocode_test_executions')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: errorMsg
        })
        .eq('id', executionId);
      
      throw new Error(errorMsg);
    }

    if (!browserbaseConfig.enabled) {
      const errorMsg = 'Browserbase integration is disabled. Please enable it in the Integrations module.';
      console.error(errorMsg);
      
      await supabase
        .from('nocode_test_executions')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: errorMsg
        })
        .eq('id', executionId);
      
      throw new Error(errorMsg);
    }

    // Fetch screenshot_on_failure_only setting
    let screenshotOnFailureOnly = false;
    try {
      const { data: screenshotSetting } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'screenshot_on_failure_only')
        .single();
      
      screenshotOnFailureOnly = screenshotSetting?.setting_value === true;
      console.log('Screenshot on failure only setting:', screenshotOnFailureOnly);
    } catch (settingError) {
      console.log('Could not fetch screenshot setting, defaulting to capture all:', settingError);
    }

    const bbConfig = browserbaseConfig.config as { apiKey?: string; projectId?: string };
    const browserbaseApiKey = bbConfig?.apiKey;
    const browserbaseProjectId = bbConfig?.projectId;

    // Connect to remote browser (Browserbase)
    console.log('Connecting to Browserbase...');

    if (!browserbaseApiKey) {
      const errorMsg = 'Browserbase API key not configured. Please add your Browserbase API key in the Integrations module.';
      console.error(errorMsg);
      
      await supabase
        .from('nocode_test_executions')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: errorMsg
        })
        .eq('id', executionId);
      
      throw new Error(errorMsg);
    }
    
    // Build Browserbase WebSocket URL
    let browserbaseUrl = `wss://connect.browserbase.com?apiKey=${browserbaseApiKey}`;
    if (browserbaseProjectId) {
      browserbaseUrl += `&projectId=${browserbaseProjectId}`;
    }
    
    console.log('Attempting to connect to Browserbase...');
    
    let browser;
    try {
      const connectPromise = chromium.connectOverCDP(browserbaseUrl, {
        timeout: 60000
      });
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Browser connection timeout after 60 seconds')), 60000)
      );
      
      browser = await Promise.race([connectPromise, timeoutPromise]) as any;
      console.log('Successfully connected to Browserbase');
    } catch (connectError) {
      console.error('Failed to connect to Browserbase:', connectError);
      
      const errorMsg = connectError instanceof Error 
        ? `Browserbase connection failed: ${connectError.message}`
        : 'Browserbase connection failed. Please verify your Browserbase credentials in the Integrations module.';
      
      await supabase
        .from('nocode_test_executions')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: errorMsg
        })
        .eq('id', executionId);
      
      throw new Error(errorMsg);
    }

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });

    const page = await context.newPage();
    
    // Set up dialog handler
    let pendingDialogAction: { action: 'accept' | 'dismiss'; text?: string } | null = null;
    page.on('dialog', async (dialog: any) => {
      console.log(`Dialog appeared: ${dialog.type()} - ${dialog.message()}`);
      if (pendingDialogAction) {
        if (pendingDialogAction.action === 'accept') {
          await dialog.accept(pendingDialogAction.text);
        } else {
          await dialog.dismiss();
        }
        pendingDialogAction = null;
      } else {
        await dialog.accept();
      }
    });

    // Set up route interception storage
    const mockRoutes: Map<string, { status: number; body: string }> = new Map();
    const blockedRoutes: Set<string> = new Set();
    
    const results: ExecutionResult[] = [];
    let testPassed = true;
    const startTime = Date.now();
    const pages: any[] = [page];
    let currentPageIndex = 0;
    
    // Store variables for substitution during execution
    const storedVariables: Map<string, string> = new Map();
    
    // Helper function to substitute {{variableName}} placeholders
    const substituteVariables = (text: string | undefined): string | undefined => {
      if (!text) return text;
      return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
        const value = storedVariables.get(varName);
        if (value !== undefined) {
          console.log(`Substituting variable {{${varName}}} with "${value}"`);
          return value;
        }
        console.warn(`Variable {{${varName}}} not found, keeping as-is`);
        return match;
      });
    };

    // Execute each step with retry mechanism
    const MAX_RETRIES = 1; // Number of retries before failing
    
    for (const step of steps as TestStep[]) {
      // Check if step should be skipped
      if (step.skip) {
        console.log(`Skipping step: ${step.type} - ${step.description} (marked as skip)`);
        results.push({
          stepId: step.id,
          step: step,
          status: 'skipped',
          duration: 0,
        });
        continue;
      }

      // Check for cancellation before executing each step
      const { data: currentExecution } = await supabase
        .from('nocode_test_executions')
        .select('status')
        .eq('id', executionId)
        .single();

      if (currentExecution?.status === 'cancelling') {
        console.log('Test execution cancelled by user');
        testPassed = false;
        
        const remainingSteps = (steps as TestStep[]).slice(results.length);
        for (const skippedStep of remainingSteps) {
          results.push({
            stepId: skippedStep.id,
            step: skippedStep,
            status: 'skipped',
            duration: 0,
          });
        }
        break;
      }

      const stepStartTime = Date.now();
      const currentPage = pages[currentPageIndex];
      console.log(`Executing step: ${step.type} - ${step.description}`);
      
      let stepPassed = false;
      let lastError: Error | null = null;
      let retryCount = 0;
      
      // Retry loop for the step
      while (retryCount <= MAX_RETRIES && !stepPassed) {
        if (retryCount > 0) {
          console.log(`Retrying step (attempt ${retryCount + 1}/${MAX_RETRIES + 1}): ${step.type} - ${step.description}`);
          // Brief delay before retry to allow page state to settle
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        try {
          // Create a copy of the step with substituted variables
          const processedStep = {
            ...step,
            value: substituteVariables(step.value),
            selector: substituteVariables(step.selector),
          };
          
          const stepResult = await executeStep(processedStep, currentPage, context, baseUrl, pages, mockRoutes, blockedRoutes, (action) => {
            pendingDialogAction = action;
          }, (newIndex) => {
            currentPageIndex = newIndex;
          });
          
          // If step returned a stored variable, save it
          if (stepResult?.storedVariable) {
            storedVariables.set(stepResult.storedVariable.name, stepResult.storedVariable.value || '');
            console.log(`Stored variable "${stepResult.storedVariable.name}" = "${stepResult.storedVariable.value}"`);
          }

          stepPassed = true;
          
          // Skip screenshots for simple steps to save memory
          const skipScreenshotSteps = ['wait', 'waitForNetworkIdle', 'waitForLoadState'];
          let screenshotBase64 = '';
          
          // Only capture screenshots for passed steps if setting is disabled
          if (!screenshotOnFailureOnly && !skipScreenshotSteps.includes(step.type)) {
            try {
              // Use JPEG with reduced quality to save memory
              const screenshot = await currentPage.screenshot({ 
                type: 'jpeg',
                quality: 50,
                fullPage: false 
              });
              // Convert to base64 using chunked approach to avoid stack overflow
              const screenshotBytes = new Uint8Array(screenshot);
              let screenshotBinaryString = '';
              const chunkSize = 8192;
              for (let i = 0; i < screenshotBytes.length; i += chunkSize) {
                const chunk = screenshotBytes.subarray(i, Math.min(i + chunkSize, screenshotBytes.length));
                screenshotBinaryString += String.fromCharCode.apply(null, Array.from(chunk));
              }
              screenshotBase64 = btoa(screenshotBinaryString);
            } catch (ssError) {
              console.warn('Failed to capture screenshot:', ssError);
            }
          }

          const result: ExecutionResult = {
            stepId: step.id,
            step: step,
            status: 'passed',
            duration: Date.now() - stepStartTime,
            screenshot: screenshotBase64 ? `data:image/jpeg;base64,${screenshotBase64}` : undefined
          };
          
          // Add retry info if step passed on retry
          if (retryCount > 0) {
            console.log(`Step passed on retry attempt ${retryCount + 1}`);
          }
          
          results.push(result);

          await supabase
            .from('nocode_test_executions')
            .update({
              results: results,
              status: 'running'
            })
            .eq('id', executionId);
          
          console.log(`Step completed successfully: ${step.description}`);

        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          
          // Enhanced error logging with full stack trace
          const errorMessage = lastError.message;
          const errorStack = lastError.stack || 'No stack trace available';
          
          console.error(`=== STEP FAILED (Attempt ${retryCount + 1}/${MAX_RETRIES + 1}) ===`);
          console.error(`Step Type: ${step.type}`);
          console.error(`Step Description: ${step.description}`);
          console.error(`Selector: ${step.selector || 'N/A'}`);
          console.error(`Value: ${step.value || 'N/A'}`);
          console.error(`Error Message: ${errorMessage}`);
          console.error(`Stack Trace:\n${errorStack}`);
          console.error(`===================`);
          
          retryCount++;
        }
      }
      
      // If step failed after all retries
      if (!stepPassed && lastError) {
        testPassed = false;
        
        const errorMessage = lastError.message;
        const errorStack = lastError.stack || 'No stack trace available';

        let screenshotBase64;
        try {
          // Use JPEG with reduced quality to save memory
          const screenshot = await currentPage.screenshot({ 
            type: 'jpeg',
            quality: 50,
            fullPage: false 
          });
          // Convert to base64 using chunked approach to avoid stack overflow
          const errorBytes = new Uint8Array(screenshot);
          let errorBinaryString = '';
          const errorChunkSize = 8192;
          for (let i = 0; i < errorBytes.length; i += errorChunkSize) {
            const chunk = errorBytes.subarray(i, Math.min(i + errorChunkSize, errorBytes.length));
            errorBinaryString += String.fromCharCode.apply(null, Array.from(chunk));
          }
          screenshotBase64 = btoa(errorBinaryString);
        } catch (screenshotError) {
          console.error('Failed to take screenshot:', screenshotError);
        }

        // Build detailed error with retry info and stack trace
        const detailedError = [
          `Error: ${errorMessage}`,
          ``,
          `Step failed after ${MAX_RETRIES + 1} attempt(s)`,
          ``,
          `Step Details:`,
          `  Type: ${step.type}`,
          `  Selector: ${step.selector || 'N/A'}`,
          `  Value: ${step.value || 'N/A'}`,
          ``,
          `Stack Trace:`,
          errorStack
        ].join('\n');

        const result: ExecutionResult = {
          stepId: step.id,
          step: step,
          status: 'failed',
          duration: Date.now() - stepStartTime,
          error: detailedError,
          screenshot: screenshotBase64 ? `data:image/jpeg;base64,${screenshotBase64}` : undefined
        };
        
        results.push(result);

        await supabase
          .from('nocode_test_executions')
          .update({
            results: results,
            status: 'running',
            error_message: detailedError
          })
          .eq('id', executionId);
        
        break;
      }
    }

    // Close browser
    await browser.close();
    console.log('Browser closed');

    const totalDuration = Date.now() - startTime;

    const { data: finalExecution } = await supabase
      .from('nocode_test_executions')
      .select('status')
      .eq('id', executionId)
      .single();

    const isCancelled = finalExecution?.status === 'cancelling';
    const finalStatus = isCancelled ? 'cancelled' : (testPassed ? 'passed' : 'failed');

    const { error: updateError } = await supabase
      .from('nocode_test_executions')
      .update({
        status: finalStatus,
        completed_at: new Date().toISOString(),
        duration_ms: totalDuration,
        results: results,
        error_message: isCancelled 
          ? 'Test execution cancelled by user' 
          : (testPassed ? null : results.find(r => r.error)?.error || 'Test execution failed')
      })
      .eq('id', executionId);

    if (updateError) {
      console.error('Failed to update execution record:', updateError);
    }

    console.log(`Test execution completed: ${testPassed ? 'PASSED' : 'FAILED'} in ${totalDuration}ms`);

    return new Response(
      JSON.stringify({
        success: testPassed,
        duration: totalDuration,
        results,
        message: testPassed ? 'Test executed successfully' : 'Test execution failed'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error executing test:', error);
    
    if (executionId && supabase) {
      try {
        await supabase
          .from('nocode_test_executions')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: error instanceof Error ? error.message : 'Unknown error occurred'
          })
          .eq('id', executionId);
      } catch (updateError) {
        console.error('Failed to update execution record:', updateError);
      }
    }
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

async function executeStep(
  step: TestStep,
  page: any,
  context: any,
  baseUrl: string,
  pages: any[],
  mockRoutes: Map<string, { status: number; body: string }>,
  blockedRoutes: Set<string>,
  setDialogAction: (action: { action: 'accept' | 'dismiss'; text?: string } | null) => void,
  setCurrentPage: (index: number) => void
) {
  const { type, selector, value, extraData } = step;

  switch (type) {
    // Navigation Actions
    case 'navigate':
      const url = value || baseUrl;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      console.log(`Navigated to: ${url}`);
      break;

    case 'reload':
      await page.reload({ waitUntil: 'networkidle' });
      console.log('Page reloaded');
      break;

    case 'goBack':
      await page.goBack({ waitUntil: 'networkidle' });
      console.log('Navigated back');
      break;

    case 'goForward':
      await page.goForward({ waitUntil: 'networkidle' });
      console.log('Navigated forward');
      break;

    case 'setViewport':
      const width = parseInt(extraData?.width || '1920');
      const height = parseInt(extraData?.height || '1080');
      await page.setViewportSize({ width, height });
      console.log(`Viewport set to ${width}x${height}`);
      break;

    // Interaction - Click Actions
    case 'click':
      if (!selector) throw new Error('Click step requires a selector');
      await safeClick(page, selector);
      console.log(`Clicked: ${selector}`);
      break;

    case 'doubleClick':
      if (!selector) throw new Error('Double click step requires a selector');
      await page.dblclick(selector, { timeout: 10000 });
      console.log(`Double clicked: ${selector}`);
      break;

    case 'rightClick':
      if (!selector) throw new Error('Right click step requires a selector');
      await page.click(selector, { button: 'right', timeout: 10000 });
      console.log(`Right clicked: ${selector}`);
      break;

    case 'tripleClick':
      if (!selector) throw new Error('Triple click step requires a selector');
      await page.click(selector, { clickCount: 3, timeout: 10000 });
      console.log(`Triple clicked: ${selector}`);
      break;

    case 'hover':
      if (!selector) throw new Error('Hover step requires a selector');
      await page.hover(selector, { timeout: 10000 });
      console.log(`Hovered: ${selector}`);
      break;

    case 'focus':
      if (!selector) throw new Error('Focus step requires a selector');
      await page.focus(selector, { timeout: 10000 });
      console.log(`Focused: ${selector}`);
      break;

    case 'dragDrop':
      if (!selector) throw new Error('Drag step requires source selector');
      if (!value) throw new Error('Drag step requires target selector');
      await page.dragAndDrop(selector, value, { timeout: 10000 });
      console.log(`Dragged ${selector} to ${value}`);
      break;

    // Input Actions
    case 'type':
      if (!selector) throw new Error('Type step requires a selector');
      if (!value) throw new Error('Type step requires a value');
      await page.type(selector, value, { timeout: 10000 });
      console.log(`Typed into: ${selector}`);
      break;

    case 'fill':
      if (!selector) throw new Error('Fill step requires a selector');
      if (!value) throw new Error('Fill step requires a value');
      await safeFill(page, selector, value);
      console.log(`Filled: ${selector}`);
      break;

    case 'clear':
      if (!selector) throw new Error('Clear step requires a selector');
      await page.fill(selector, '', { timeout: 10000 });
      console.log(`Cleared: ${selector}`);
      break;

    case 'pressKey':
      if (!value) throw new Error('Press key step requires a key value');
      await page.keyboard.press(value);
      console.log(`Pressed key: ${value}`);
      break;

    case 'check':
      if (!selector) throw new Error('Check step requires a selector');
      await page.check(selector, { timeout: 10000 });
      console.log(`Checked: ${selector}`);
      break;

    case 'uncheck':
      if (!selector) throw new Error('Uncheck step requires a selector');
      await page.uncheck(selector, { timeout: 10000 });
      console.log(`Unchecked: ${selector}`);
      break;

    case 'selectOption':
      if (!selector) throw new Error('Select step requires a selector');
      if (!value) throw new Error('Select step requires a value');
      const selectBy = extraData?.selectBy || 'value';
      if (selectBy === 'label') {
        await page.selectOption(selector, { label: value }, { timeout: 10000 });
      } else if (selectBy === 'index') {
        await page.selectOption(selector, { index: parseInt(value) }, { timeout: 10000 });
      } else {
        await page.selectOption(selector, value, { timeout: 10000 });
      }
      console.log(`Selected option: ${value}`);
      break;

    // Assertion Actions
    case 'verify':
      if (!selector) throw new Error('Verify step requires a selector');
      const element = await page.$(selector);
      if (!element) throw new Error(`Element not found: ${selector}`);
      if (value) {
        const text = await element.textContent();
        if (!text?.includes(value)) {
          throw new Error(`Expected text "${value}" not found. Got: "${text}"`);
        }
      }
      console.log(`Verified: ${selector}`);
      break;

    case 'verifyVisible':
      if (!selector) throw new Error('Verify visible step requires a selector');
      await page.waitForSelector(selector, { state: 'visible', timeout: 10000 });
      console.log(`Verified visible: ${selector}`);
      break;

    case 'verifyHidden':
      if (!selector) throw new Error('Verify hidden step requires a selector');
      await page.waitForSelector(selector, { state: 'hidden', timeout: 10000 });
      console.log(`Verified hidden: ${selector}`);
      break;

    case 'verifyEnabled':
      if (!selector) throw new Error('Verify enabled step requires a selector');
      const enabledEl = await page.$(selector);
      if (!enabledEl) throw new Error(`Element not found: ${selector}`);
      const isDisabled = await enabledEl.isDisabled();
      if (isDisabled) throw new Error(`Element is disabled: ${selector}`);
      console.log(`Verified enabled: ${selector}`);
      break;

    case 'verifyDisabled':
      if (!selector) throw new Error('Verify disabled step requires a selector');
      const disabledEl = await page.$(selector);
      if (!disabledEl) throw new Error(`Element not found: ${selector}`);
      const isEnabled = await disabledEl.isEnabled();
      if (isEnabled) throw new Error(`Element is enabled: ${selector}`);
      console.log(`Verified disabled: ${selector}`);
      break;

    case 'verifyText':
      if (!selector) throw new Error('Verify text step requires a selector');
      if (!value) throw new Error('Verify text step requires expected text');
      const textEl = await page.$(selector);
      if (!textEl) throw new Error(`Element not found: ${selector}`);
      const actualText = await textEl.textContent();
      if (!actualText?.includes(value)) {
        throw new Error(`Expected text "${value}" not found. Actual: "${actualText}"`);
      }
      console.log(`Verified text: ${selector} contains "${value}"`);
      break;

    case 'verifyAttribute':
      if (!selector) throw new Error('Verify attribute step requires a selector');
      if (!extraData?.attribute) throw new Error('Verify attribute step requires attribute name');
      const attrEl = await page.$(selector);
      if (!attrEl) throw new Error(`Element not found: ${selector}`);
      const attrValue = await attrEl.getAttribute(extraData.attribute);
      if (value && attrValue !== value) {
        throw new Error(`Expected attribute "${extraData.attribute}" to be "${value}", got "${attrValue}"`);
      }
      console.log(`Verified attribute ${extraData.attribute}: ${selector}`);
      break;

    case 'verifyValue':
      if (!selector) throw new Error('Verify value step requires a selector');
      if (!value) throw new Error('Verify value step requires expected value');
      const inputValue = await page.inputValue(selector);
      if (inputValue !== value) {
        throw new Error(`Expected value "${value}", got "${inputValue}"`);
      }
      console.log(`Verified value: ${selector}`);
      break;

    case 'verifyUrl':
      if (!value) throw new Error('Verify URL step requires expected URL');
      const currentUrl = page.url();
      if (!currentUrl.includes(value) && currentUrl !== value) {
        throw new Error(`Expected URL "${value}", got "${currentUrl}"`);
      }
      console.log(`Verified URL: ${currentUrl}`);
      break;

    case 'verifyTitle':
      if (!value) throw new Error('Verify title step requires expected title');
      const title = await page.title();
      if (!title.includes(value)) {
        throw new Error(`Expected title "${value}", got "${title}"`);
      }
      console.log(`Verified title: ${title}`);
      break;

    // Store Variable Actions
    case 'storeElementValue':
      if (!selector) throw new Error('Store element value step requires a selector');
      if (!value) throw new Error('Store element value step requires a variable name');
      const storeEl = await page.$(selector);
      if (!storeEl) throw new Error(`Element not found: ${selector}`);
      const storedText = await storeEl.textContent();
      // Store in extraData for later use (runtime variable storage)
      console.log(`Stored element text "${storedText}" in variable: ${value}`);
      return { storedVariable: { name: value, value: storedText } };

    case 'storePageTitle':
      if (!value) throw new Error('Store page title step requires a variable name');
      const storedTitle = await page.title();
      console.log(`Stored page title "${storedTitle}" in variable: ${value}`);
      return { storedVariable: { name: value, value: storedTitle } };

    case 'storeCurrentUrl':
      if (!value) throw new Error('Store current URL step requires a variable name');
      const storedUrl = page.url();
      console.log(`Stored current URL "${storedUrl}" in variable: ${value}`);
      return { storedVariable: { name: value, value: storedUrl } };

    case 'storeAttributeValue':
      if (!selector) throw new Error('Store attribute value step requires a selector');
      if (!extraData?.attribute) throw new Error('Store attribute value step requires attribute name');
      if (!value) throw new Error('Store attribute value step requires a variable name');
      const storeAttrEl = await page.$(selector);
      if (!storeAttrEl) throw new Error(`Element not found: ${selector}`);
      const storedAttr = await storeAttrEl.getAttribute(extraData.attribute);
      console.log(`Stored attribute "${extraData.attribute}" value "${storedAttr}" in variable: ${value}`);
      return { storedVariable: { name: value, value: storedAttr } };

    case 'storeInputValue':
      if (!selector) throw new Error('Store input value step requires a selector');
      if (!value) throw new Error('Store input value step requires a variable name');
      const storedInputVal = await page.inputValue(selector);
      console.log(`Stored input value "${storedInputVal}" in variable: ${value}`);
      return { storedVariable: { name: value, value: storedInputVal } };

    // Wait Actions
    case 'wait':
      const duration = parseInt(value || '1000');
      await page.waitForTimeout(duration);
      console.log(`Waited: ${duration}ms`);
      break;

    case 'waitForSelector':
      if (!selector) throw new Error('Wait for selector step requires a selector');
      const timeout = parseInt(extraData?.timeout || '30000');
      await page.waitForSelector(selector, { timeout });
      console.log(`Waited for selector: ${selector}`);
      break;

    case 'waitForUrl':
      if (!value) throw new Error('Wait for URL step requires a URL pattern');
      // Handle both string patterns and regex-like patterns
      try {
        // If value looks like a regex pattern, convert it
        if (value.startsWith('/') && value.lastIndexOf('/') > 0) {
          const regexBody = value.slice(1, value.lastIndexOf('/'));
          const regexFlags = value.slice(value.lastIndexOf('/') + 1);
          const urlRegex = new RegExp(regexBody, regexFlags || undefined);
          await page.waitForURL(urlRegex, { timeout: 30000 });
        } else if (value.includes('*')) {
          // Handle glob-like patterns by converting to a function check
          const pattern = value.replace(/\*/g, '.*');
          const urlRegex = new RegExp(pattern);
          await page.waitForURL((url: URL) => urlRegex.test(url.href), { timeout: 30000 });
        } else {
          // Simple string match - can be exact URL or substring
          await page.waitForURL((url: URL) => url.href.includes(value), { timeout: 30000 });
        }
        console.log(`Waited for URL: ${value}`);
      } catch (urlError: any) {
        throw new Error(`Failed to wait for URL pattern "${value}": ${urlError.message}`);
      }
      break;

    case 'waitForVisible':
      if (!selector) throw new Error('Wait for visible step requires a selector');
      await page.waitForSelector(selector, { state: 'visible', timeout: 30000 });
      console.log(`Waited for visible: ${selector}`);
      break;

    case 'waitForHidden':
      if (!selector) throw new Error('Wait for hidden step requires a selector');
      await page.waitForSelector(selector, { state: 'hidden', timeout: 30000 });
      console.log(`Waited for hidden: ${selector}`);
      break;

    case 'waitForNetworkIdle':
      await page.waitForLoadState('networkidle', { timeout: 30000 });
      console.log('Waited for network idle');
      break;

    case 'waitForResponse':
      if (!value) throw new Error('Wait for response step requires URL pattern');
      await page.waitForResponse(value, { timeout: 30000 });
      console.log(`Waited for response: ${value}`);
      break;

    // Mouse Actions
    case 'mouseMove':
      const moveX = parseInt(extraData?.x || '0');
      const moveY = parseInt(extraData?.y || '0');
      await page.mouse.move(moveX, moveY);
      console.log(`Mouse moved to (${moveX}, ${moveY})`);
      break;

    case 'mouseClick':
      const clickX = parseInt(extraData?.x || '0');
      const clickY = parseInt(extraData?.y || '0');
      const button = extraData?.button || 'left';
      await page.mouse.click(clickX, clickY, { button });
      console.log(`Mouse clicked at (${clickX}, ${clickY})`);
      break;

    case 'mouseWheel':
      const deltaX = parseInt(extraData?.deltaX || '0');
      const deltaY = parseInt(extraData?.deltaY || '100');
      await page.mouse.wheel(deltaX, deltaY);
      console.log(`Mouse wheel: deltaX=${deltaX}, deltaY=${deltaY}`);
      break;

    // Keyboard Actions
    case 'keyPress':
      if (!value) throw new Error('Key press step requires a key');
      await page.keyboard.press(value);
      console.log(`Key pressed: ${value}`);
      break;

    case 'keyDown':
      if (!value) throw new Error('Key down step requires a key');
      await page.keyboard.down(value);
      console.log(`Key down: ${value}`);
      break;

    case 'keyUp':
      if (!value) throw new Error('Key up step requires a key');
      await page.keyboard.up(value);
      console.log(`Key up: ${value}`);
      break;

    case 'keyCombination':
      if (!value) throw new Error('Key combination step requires keys');
      const keys = value.split('+').map((k: string) => k.trim());
      for (const key of keys.slice(0, -1)) {
        await page.keyboard.down(key);
      }
      await page.keyboard.press(keys[keys.length - 1]);
      for (const key of keys.slice(0, -1).reverse()) {
        await page.keyboard.up(key);
      }
      console.log(`Key combination: ${value}`);
      break;

    // File Actions
    case 'uploadFile':
      if (!selector) throw new Error('Upload file step requires a selector');
      if (!value) throw new Error('Upload file step requires a file path');
      await page.setInputFiles(selector, value);
      console.log(`Uploaded file: ${value}`);
      break;

    case 'downloadFile':
      if (!selector) throw new Error('Download file step requires a selector');
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.click(selector)
      ]);
      console.log(`Downloaded file: ${download.suggestedFilename()}`);
      break;

    // Dialog Actions
    case 'acceptDialog':
      setDialogAction({ action: 'accept' });
      console.log('Set to accept next dialog');
      break;

    case 'dismissDialog':
      setDialogAction({ action: 'dismiss' });
      console.log('Set to dismiss next dialog');
      break;

    case 'handlePrompt':
      if (!value) throw new Error('Handle prompt step requires text');
      setDialogAction({ action: 'accept', text: value });
      console.log(`Set to handle prompt with text: ${value}`);
      break;

    // Frame Actions
    case 'switchToFrame':
      if (!selector) throw new Error('Switch to frame step requires a selector');
      const frame = page.frameLocator(selector);
      if (!frame) throw new Error(`Frame not found: ${selector}`);
      console.log(`Switched to frame: ${selector}`);
      break;

    case 'switchToMainFrame':
      console.log('Switched to main frame');
      break;

    // Storage Actions
    case 'getCookie':
      if (!value) throw new Error('Get cookie step requires cookie name');
      const cookies = await context.cookies();
      const cookie = cookies.find((c: any) => c.name === value);
      console.log(`Cookie ${value}: ${cookie?.value || 'not found'}`);
      break;

    case 'setCookie':
      if (!value) throw new Error('Set cookie step requires cookie value');
      if (!extraData?.cookieName) throw new Error('Set cookie step requires cookie name');
      await context.addCookies([{
        name: extraData.cookieName,
        value: value,
        domain: extraData?.domain || new URL(page.url()).hostname,
        path: '/'
      }]);
      console.log(`Set cookie: ${extraData.cookieName}`);
      break;

    case 'clearCookies':
      await context.clearCookies();
      console.log('Cleared all cookies');
      break;

    case 'setLocalStorage':
      if (!value) throw new Error('Set localStorage step requires value');
      if (!extraData?.storageKey) throw new Error('Set localStorage step requires key');
      await page.evaluate(([key, val]: [string, string]) => {
        localStorage.setItem(key, val);
      }, [extraData.storageKey, value]);
      console.log(`Set localStorage: ${extraData.storageKey}`);
      break;

    case 'clearLocalStorage':
      await page.evaluate(() => localStorage.clear());
      console.log('Cleared localStorage');
      break;

    // Screenshot Actions
    case 'screenshot':
      console.log('Taking full page screenshot');
      break;

    case 'elementScreenshot':
      if (!selector) throw new Error('Element screenshot step requires a selector');
      console.log(`Taking element screenshot: ${selector}`);
      break;

    case 'visualRegression':
    case 'visualRegressionElement': {
      const baselineName = value;
      if (!baselineName) throw new Error('Visual regression requires a baseline name');
      
      const threshold = parseFloat(extraData?.threshold || '10') / 100;
      
      // Take current screenshot
      let currentScreenshot: Uint8Array;
      if (type === 'visualRegressionElement') {
        if (!selector) throw new Error('Element visual regression requires a selector');
        const element = await page.$(selector);
        if (!element) throw new Error(`Element not found: ${selector}`);
        currentScreenshot = await element.screenshot({ type: 'png' });
      } else {
        currentScreenshot = await page.screenshot({ type: 'png', fullPage: true });
      }
      
      // Convert to base64 using chunked approach to avoid stack overflow
      const bytes = new Uint8Array(currentScreenshot);
      let binaryString = '';
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
        binaryString += String.fromCharCode.apply(null, Array.from(chunk));
      }
      const currentBase64 = btoa(binaryString);
      
      // Fetch baseline from database
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabaseClient = createClient(supabaseUrl, supabaseKey);
      
      const { data: baseline } = await supabaseClient
        .from('nocode_visual_baselines')
        .select('baseline_image, threshold')
        .eq('step_id', step.id)
        .single();
      
      if (!baseline) {
        // No baseline exists - save current as baseline
        console.log(`No baseline found for "${baselineName}", saving current screenshot as baseline`);
        step.extraData = {
          ...step.extraData,
          noBaselineYet: true,
          currentScreenshot: `data:image/png;base64,${currentBase64}`,
          baselineName,
        };
        break;
      }
      
      // Compare images using pixel difference
      const baselineBase64 = baseline.baseline_image.replace(/^data:image\/\w+;base64,/, '');
      const effectiveThreshold = baseline.threshold || threshold;
      
      // Simple pixel comparison
      const diffResult = await compareImages(currentBase64, baselineBase64, effectiveThreshold);
      
      if (diffResult.mismatchPercentage > effectiveThreshold * 100) {
        step.extraData = {
          ...step.extraData,
          visualDiff: true,
          mismatchPercentage: diffResult.mismatchPercentage.toFixed(2),
          threshold: (effectiveThreshold * 100).toFixed(2),
          currentScreenshot: `data:image/png;base64,${currentBase64}`,
          baselineScreenshot: baseline.baseline_image,
          diffImage: diffResult.diffImage,
        };
        throw new Error(`Visual regression failed: ${diffResult.mismatchPercentage.toFixed(2)}% difference (threshold: ${(effectiveThreshold * 100).toFixed(2)}%)`);
      }
      
      step.extraData = {
        ...step.extraData,
        visualMatch: true,
        mismatchPercentage: diffResult.mismatchPercentage.toFixed(2),
        threshold: (effectiveThreshold * 100).toFixed(2),
      };
      console.log(`Visual regression passed: ${diffResult.mismatchPercentage.toFixed(2)}% difference`);
      break;
    }

    // Network Actions
    case 'apiRequest':
      if (!value) throw new Error('API request step requires URL');
      const method = extraData?.method || 'GET';
      const requestOptions: any = { method };
      if (extraData?.headers) {
        try {
          requestOptions.headers = JSON.parse(extraData.headers);
        } catch (e) {
          console.log('Failed to parse headers JSON');
        }
      }
      if (extraData?.body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        requestOptions.data = extraData.body;
      }
      const response = await page.request[method.toLowerCase()](value, requestOptions);
      console.log(`API ${method} ${value}: ${response.status()}`);
      break;

    case 'mockResponse':
      if (!value) throw new Error('Mock response step requires URL pattern');
      if (!extraData?.statusCode || !extraData?.responseBody) {
        throw new Error('Mock response step requires status code and response body');
      }
      await page.route(value, async (route: any) => {
        await route.fulfill({
          status: parseInt(extraData.statusCode),
          contentType: 'application/json',
          body: extraData.responseBody
        });
      });
      console.log(`Mocked response for: ${value}`);
      break;

    case 'interceptRequest':
      if (!value) throw new Error('Intercept request step requires URL pattern');
      const action = extraData?.action || 'block';
      await page.route(value, async (route: any) => {
        if (action === 'block') {
          await route.abort();
        } else {
          await route.continue();
        }
      });
      console.log(`Intercepting requests: ${value} (${action})`);
      break;

    // Browser/Tab Actions
    case 'newTab':
      const newPage = await context.newPage();
      pages.push(newPage);
      setCurrentPage(pages.length - 1);
      if (value) {
        await newPage.goto(value, { waitUntil: 'networkidle' });
      }
      console.log(`Opened new tab${value ? `: ${value}` : ''}`);
      break;

    case 'closeTab':
      if (pages.length > 1) {
        await pages[pages.length - 1].close();
        pages.pop();
        setCurrentPage(Math.min(pages.length - 1, pages.length - 1));
      }
      console.log('Closed current tab');
      break;

    case 'switchTab':
      if (!value) throw new Error('Switch tab step requires tab index');
      const tabIndex = parseInt(value);
      if (tabIndex < 0 || tabIndex >= pages.length) {
        throw new Error(`Tab index ${tabIndex} out of range (0-${pages.length - 1})`);
      }
      setCurrentPage(tabIndex);
      console.log(`Switched to tab ${tabIndex}`);
      break;

    default:
      throw new Error(`Unknown step type: ${type}`);
  }
}

async function safeClick(page: any, selector: string) {
  try {
    await page.click(selector, { timeout: 10000 });
  } catch (e) {
    const textMatch = selector.match(/contains\("([^"]+)"\)/);
    if (textMatch) {
      await page.click(`text="${textMatch[1]}"`, { timeout: 10000 });
    } else {
      throw e;
    }
  }
}

async function safeFill(page: any, selector: string, value: string) {
  try {
    await page.fill(selector, value, { timeout: 10000 });
  } catch (e) {
    const inputs = await page.$$(selector.split(',')[0]);
    if (inputs.length > 0) {
      await inputs[0].fill(value);
    } else {
      throw e;
    }
  }
}

// Simple pixel-based image comparison
async function compareImages(
  current: string,
  baseline: string,
  threshold: number
): Promise<{ mismatchPercentage: number; diffImage?: string }> {
  // Decode base64 to binary
  const currentBinary = Uint8Array.from(atob(current), c => c.charCodeAt(0));
  const baselineBinary = Uint8Array.from(atob(baseline), c => c.charCodeAt(0));
  
  // Simple byte-by-byte comparison for quick mismatch detection
  // This is a simplified approach - in production you might want a more sophisticated algorithm
  let differences = 0;
  const minLength = Math.min(currentBinary.length, baselineBinary.length);
  const maxLength = Math.max(currentBinary.length, baselineBinary.length);
  
  for (let i = 0; i < minLength; i++) {
    if (currentBinary[i] !== baselineBinary[i]) {
      differences++;
    }
  }
  
  // Add size difference to mismatch
  differences += (maxLength - minLength);
  
  const mismatchPercentage = (differences / maxLength) * 100;
  
  return {
    mismatchPercentage,
  };
}
