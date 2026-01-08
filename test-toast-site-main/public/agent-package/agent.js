/**
 * WISPR Self-Hosted Test Execution Agent
 * 
 * This agent connects to WISPR platform and executes automated tests
 * on your local machine using Playwright.
 * 
 * Usage:
 *   1. Set your API token: export WISPR_API_TOKEN="your_token_here"
 *   2. Run: npm start
 */

import { chromium, firefox, webkit } from 'playwright';

// Configuration
const CONFIG = {
  API_TOKEN: process.env.WISPR_API_TOKEN || 'wispr_agent_1f568936b4ed4dab88f8fc1ab50c1a35',
  API_BASE_URL: 'https://lghzmijzfpvrcvogxpew.supabase.co/functions/v1/agent-api',
  HEARTBEAT_INTERVAL: 30000, // 30 seconds
  POLL_INTERVAL: 5000, // 5 seconds
  MAX_CAPACITY: 3,
  BROWSERS: ['chromium'],
};

// Agent state
let isRunning = true;
let activeJobs = 0;
let agentInfo = null;

// Logging utility
function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const dataStr = Object.keys(data).length ? ` ${JSON.stringify(data)}` : '';
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}${dataStr}`);
}

// API request helper
async function apiRequest(endpoint, options = {}) {
  const url = `${CONFIG.API_BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    'x-agent-key': CONFIG.API_TOKEN,
    ...options.headers,
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    
    return data;
  } catch (error) {
    log('error', `API request failed: ${endpoint}`, { error: error.message });
    throw error;
  }
}

// Send heartbeat to server
async function sendHeartbeat() {
  try {
    const systemInfo = {
      platform: process.platform,
      nodeVersion: process.version,
      memory: process.memoryUsage(),
      uptime: process.uptime(),
    };

    await apiRequest('/heartbeat', {
      method: 'POST',
      body: JSON.stringify({
        current_capacity: CONFIG.MAX_CAPACITY - activeJobs,
        max_capacity: CONFIG.MAX_CAPACITY,
        active_jobs: activeJobs,
        system_info: systemInfo,
      }),
    });
    
    log('debug', 'Heartbeat sent successfully');
  } catch (error) {
    log('warn', 'Failed to send heartbeat', { error: error.message });
  }
}

// Poll for available jobs
async function pollForJobs() {
  if (activeJobs >= CONFIG.MAX_CAPACITY) {
    log('debug', 'At max capacity, skipping poll');
    return null;
  }

  try {
    const data = await apiRequest('/jobs/poll', { method: 'GET' });
    
    if (data.jobs && data.jobs.length > 0) {
      log('info', `Found ${data.jobs.length} available job(s)`);
      return data.jobs[0]; // Take the first available job
    }
    
    return null;
  } catch (error) {
    log('warn', 'Failed to poll for jobs', { error: error.message });
    return null;
  }
}

// Claim and start a job
async function startJob(jobId) {
  try {
    const data = await apiRequest(`/jobs/${jobId}/start`, {
      method: 'POST',
    });
    
    log('info', `Job ${jobId} claimed successfully`, { run_id: data.run_id });
    return data;
  } catch (error) {
    log('error', `Failed to claim job ${jobId}`, { error: error.message });
    return null;
  }
}

// Submit job results
async function submitResult(jobId, status, results) {
  try {
    await apiRequest(`/jobs/${jobId}/result`, {
      method: 'POST',
      body: JSON.stringify({
        status,
        result_data: results.result_data || {},
        error_message: results.error_message,
        execution_time_ms: results.execution_time_ms,
        step_results: results.step_results || [],
      }),
    });
    
    log('info', `Results submitted for job ${jobId}`, { status });
  } catch (error) {
    log('error', `Failed to submit results for job ${jobId}`, { error: error.message });
  }
}

// Store dialog handler state
let dialogHandler = null;
let lastDialogMessage = '';

// Execute a single step using Playwright
async function executeStep(page, context, step, stepIndex) {
  const startTime = Date.now();
  const result = {
    step_index: stepIndex,
    step_type: step.type,
    status: 'passed',
    duration_ms: 0,
    error: null,
    screenshot: null,
  };

  try {
    log('debug', `Executing step ${stepIndex + 1}: ${step.type}`, { selector: step.selector });

    switch (step.type) {
      // === NAVIGATION ===
      case 'goto':
      case 'navigate':
        await page.goto(step.url || step.value, { waitUntil: 'networkidle', timeout: 60000 });
        break;

      case 'reload':
        await page.reload({ waitUntil: 'networkidle' });
        break;

      case 'goBack':
        await page.goBack({ waitUntil: 'networkidle' });
        break;

      case 'goForward':
        await page.goForward({ waitUntil: 'networkidle' });
        break;

      case 'setViewport':
        await page.setViewportSize({
          width: parseInt(step.width) || 1280,
          height: parseInt(step.height) || 720,
        });
        break;

      // === INTERACTION - CLICK ===
      case 'click':
        await page.click(step.selector, { timeout: 30000 });
        break;

      case 'doubleClick':
        await page.dblclick(step.selector, { timeout: 30000 });
        break;

      case 'rightClick':
        await page.click(step.selector, { button: 'right', timeout: 30000 });
        break;

      case 'tripleClick':
        await page.click(step.selector, { clickCount: 3, timeout: 30000 });
        break;

      case 'hover':
        await page.hover(step.selector, { timeout: 30000 });
        break;

      case 'focus':
        await page.focus(step.selector, { timeout: 30000 });
        break;

      case 'dragDrop':
        await page.dragAndDrop(step.selector, step.value, { timeout: 30000 });
        break;

      // === INPUT ===
      case 'type':
        await page.type(step.selector, step.value || '', { timeout: 30000 });
        break;

      case 'fill':
        await page.fill(step.selector, step.value || '', { timeout: 30000 });
        break;

      case 'clear':
        await page.fill(step.selector, '', { timeout: 30000 });
        break;

      case 'press':
      case 'pressKey':
        await page.press(step.selector || 'body', step.key || step.value);
        break;

      case 'check':
        await page.check(step.selector, { timeout: 30000 });
        break;

      case 'uncheck':
        await page.uncheck(step.selector, { timeout: 30000 });
        break;

      case 'select':
      case 'selectOption':
        await page.selectOption(step.selector, step.value, { timeout: 30000 });
        break;

      // === ASSERTIONS ===
      case 'verify':
        const exists = await page.locator(step.selector).count();
        if (exists === 0) {
          throw new Error(`Element "${step.selector}" does not exist`);
        }
        break;

      case 'verifyVisible':
      case 'assertVisible':
        const isVisible = await page.isVisible(step.selector);
        if (!isVisible) {
          throw new Error(`Element "${step.selector}" is not visible`);
        }
        break;

      case 'verifyHidden':
        const isHidden = await page.isHidden(step.selector);
        if (!isHidden) {
          throw new Error(`Element "${step.selector}" is not hidden`);
        }
        break;

      case 'verifyEnabled':
      case 'assertEnabled':
        const isEnabled = await page.isEnabled(step.selector);
        if (!isEnabled) {
          throw new Error(`Element "${step.selector}" is not enabled`);
        }
        break;

      case 'verifyDisabled':
        const isDisabled = await page.isDisabled(step.selector);
        if (!isDisabled) {
          throw new Error(`Element "${step.selector}" is not disabled`);
        }
        break;

      case 'verifyText':
      case 'assertText':
        const textContent = await page.textContent(step.selector);
        if (!textContent?.includes(step.value)) {
          throw new Error(`Expected text "${step.value}" not found. Actual: "${textContent}"`);
        }
        break;

      case 'verifyAttribute':
        const attrValue = await page.getAttribute(step.selector, step.attribute);
        if (attrValue !== step.value) {
          throw new Error(`Expected attribute "${step.attribute}" to be "${step.value}". Actual: "${attrValue}"`);
        }
        break;

      case 'verifyValue':
        const inputValue = await page.inputValue(step.selector);
        if (inputValue !== step.value) {
          throw new Error(`Expected input value "${step.value}". Actual: "${inputValue}"`);
        }
        break;

      case 'verifyUrl':
      case 'assertUrl':
        const currentUrl = page.url();
        if (!currentUrl.includes(step.value)) {
          throw new Error(`Expected URL to contain "${step.value}". Actual: "${currentUrl}"`);
        }
        break;

      case 'verifyTitle':
        const title = await page.title();
        if (!title.includes(step.value)) {
          throw new Error(`Expected title to contain "${step.value}". Actual: "${title}"`);
        }
        break;

      // === STORE VARIABLE ACTIONS ===
      case 'storeElementValue':
        const storeEl = await page.locator(step.selector);
        const storedText = await storeEl.textContent();
        log('info', `Stored element text "${storedText}" in variable: ${step.value}`);
        return { storedVariable: { name: step.value, value: storedText } };

      case 'storePageTitle':
        const storedTitle = await page.title();
        log('info', `Stored page title "${storedTitle}" in variable: ${step.value}`);
        return { storedVariable: { name: step.value, value: storedTitle } };

      case 'storeCurrentUrl':
        const storedUrl = page.url();
        log('info', `Stored current URL "${storedUrl}" in variable: ${step.value}`);
        return { storedVariable: { name: step.value, value: storedUrl } };

      case 'storeAttributeValue':
        const storeAttrEl = await page.locator(step.selector);
        const attrName = step.extraData?.attribute || step.attribute;
        const storedAttr = await storeAttrEl.getAttribute(attrName);
        log('info', `Stored attribute "${attrName}" value "${storedAttr}" in variable: ${step.value}`);
        return { storedVariable: { name: step.value, value: storedAttr } };

      case 'storeInputValue':
        const storedInputVal = await page.inputValue(step.selector);
        log('info', `Stored input value "${storedInputVal}" in variable: ${step.value}`);
        return { storedVariable: { name: step.value, value: storedInputVal } };

      // === WAIT ACTIONS ===
      case 'wait':
        await page.waitForTimeout(parseInt(step.value) || 1000);
        break;

      case 'waitForSelector':
        await page.waitForSelector(step.selector, { 
          timeout: parseInt(step.timeout) || 30000 
        });
        break;

      case 'waitForUrl':
        await page.waitForURL(step.value, { timeout: 30000 });
        break;

      case 'waitForVisible':
        await page.locator(step.selector).waitFor({ state: 'visible', timeout: 30000 });
        break;

      case 'waitForHidden':
        await page.locator(step.selector).waitFor({ state: 'hidden', timeout: 30000 });
        break;

      case 'waitForNavigation':
      case 'waitForNetworkIdle':
        await page.waitForLoadState('networkidle', { timeout: 30000 });
        break;

      case 'waitForResponse':
        await page.waitForResponse(resp => resp.url().includes(step.value), { timeout: 30000 });
        break;

      // === MOUSE ACTIONS ===
      case 'mouseMove':
        await page.mouse.move(parseInt(step.x) || 0, parseInt(step.y) || 0);
        break;

      case 'mouseClick':
        await page.mouse.click(
          parseInt(step.x) || 0, 
          parseInt(step.y) || 0, 
          { button: step.button || 'left' }
        );
        break;

      case 'mouseWheel':
        await page.mouse.wheel(parseInt(step.deltaX) || 0, parseInt(step.deltaY) || 100);
        break;

      case 'scrollTo':
        if (step.selector) {
          await page.locator(step.selector).scrollIntoViewIfNeeded();
        } else {
          await page.evaluate(`window.scrollTo(${step.x || 0}, ${step.y || 0})`);
        }
        break;

      // === KEYBOARD ACTIONS ===
      case 'keyPress':
        await page.keyboard.press(step.value);
        break;

      case 'keyDown':
        await page.keyboard.down(step.value);
        break;

      case 'keyUp':
        await page.keyboard.up(step.value);
        break;

      case 'keyCombination':
        // Handle combinations like "Control+Shift+P"
        const keys = step.value.split('+');
        for (const key of keys.slice(0, -1)) {
          await page.keyboard.down(key);
        }
        await page.keyboard.press(keys[keys.length - 1]);
        for (const key of keys.slice(0, -1).reverse()) {
          await page.keyboard.up(key);
        }
        break;

      // === FILE ACTIONS ===
      case 'upload':
      case 'uploadFile':
        await page.setInputFiles(step.selector, step.files || step.value);
        break;

      case 'downloadFile':
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 30000 }),
          page.click(step.selector),
        ]);
        // Wait for download to complete
        await download.path();
        break;

      // === DIALOG ACTIONS ===
      case 'acceptDialog':
        page.once('dialog', async dialog => {
          lastDialogMessage = dialog.message();
          await dialog.accept();
        });
        break;

      case 'dismissDialog':
        page.once('dialog', async dialog => {
          lastDialogMessage = dialog.message();
          await dialog.dismiss();
        });
        break;

      case 'handlePrompt':
        page.once('dialog', async dialog => {
          lastDialogMessage = dialog.message();
          await dialog.accept(step.value || '');
        });
        break;

      // === FRAME ACTIONS ===
      case 'switchToFrame':
        const frame = page.frameLocator(step.selector);
        // Store frame reference for subsequent operations
        page._currentFrame = frame;
        break;

      case 'switchToMainFrame':
        page._currentFrame = null;
        break;

      // === STORAGE ACTIONS ===
      case 'getCookie':
        const cookies = await context.cookies();
        const cookie = cookies.find(c => c.name === step.value);
        log('info', `Cookie "${step.value}": ${cookie?.value || 'not found'}`);
        break;

      case 'setCookie':
        await context.addCookies([{
          name: step.cookieName || step.name,
          value: step.value,
          domain: step.domain || new URL(page.url()).hostname,
          path: '/',
        }]);
        break;

      case 'clearCookies':
        await context.clearCookies();
        break;

      case 'setLocalStorage':
        await page.evaluate(({ key, value }) => {
          localStorage.setItem(key, value);
        }, { key: step.storageKey || step.key, value: step.value });
        break;

      case 'clearLocalStorage':
        await page.evaluate(() => localStorage.clear());
        break;

      // === SCREENSHOT ACTIONS ===
      case 'screenshot':
        // Screenshot is captured at the end of every step, 
        // but for explicit screenshot step, we capture full page
        const screenshotBuffer = await page.screenshot({ fullPage: true });
        result.screenshot = `data:image/png;base64,${screenshotBuffer.toString('base64')}`;
        break;

      case 'elementScreenshot':
        const elementBuffer = await page.locator(step.selector).screenshot();
        result.screenshot = `data:image/png;base64,${elementBuffer.toString('base64')}`;
        break;

      // === VISUAL REGRESSION ===
      case 'visualRegression':
        // Capture current screenshot for comparison
        const vrScreenshot = await page.screenshot({ fullPage: true });
        result.screenshot = `data:image/png;base64,${vrScreenshot.toString('base64')}`;
        result.visualRegressionName = step.value;
        result.threshold = step.threshold || 10;
        // Visual regression comparison would be done server-side or by comparing with baseline
        log('info', `Visual regression captured: ${step.value}`);
        break;

      case 'visualRegressionElement':
        const vrElementBuffer = await page.locator(step.selector).screenshot();
        result.screenshot = `data:image/png;base64,${vrElementBuffer.toString('base64')}`;
        result.visualRegressionName = step.value;
        result.threshold = step.threshold || 10;
        log('info', `Element visual regression captured: ${step.value}`);
        break;

      // === NETWORK ACTIONS ===
      case 'apiRequest':
        const apiResponse = await page.request.fetch(step.value || step.url, {
          method: step.method || 'GET',
          headers: step.headers ? JSON.parse(step.headers) : undefined,
          data: step.body ? JSON.parse(step.body) : undefined,
        });
        result.apiResponse = {
          status: apiResponse.status(),
          body: await apiResponse.text(),
        };
        break;

      case 'mockResponse':
        await page.route(step.value, async route => {
          await route.fulfill({
            status: parseInt(step.statusCode) || 200,
            contentType: 'application/json',
            body: step.responseBody,
          });
        });
        break;

      case 'interceptRequest':
        await page.route(step.value, async route => {
          if (step.action === 'block') {
            await route.abort();
          } else {
            await route.continue();
          }
        });
        break;

      // === BROWSER/TAB ACTIONS ===
      case 'newTab':
        const newPage = await context.newPage();
        await newPage.goto(step.value, { waitUntil: 'networkidle' });
        // Store reference to new page
        context._pages = context._pages || [page];
        context._pages.push(newPage);
        break;

      case 'closeTab':
        await page.close();
        break;

      case 'switchTab':
        const pages = context.pages();
        const tabIndex = parseInt(step.value) || 0;
        if (tabIndex < pages.length) {
          // Return the page to switch to
          result.switchToPage = tabIndex;
        } else {
          throw new Error(`Tab index ${tabIndex} does not exist. Available tabs: ${pages.length}`);
        }
        break;

      // === EVALUATE ===
      case 'evaluate':
        await page.evaluate(step.script || step.value);
        break;

      default:
        log('warn', `Unknown step type: ${step.type}`, step);
        result.status = 'skipped';
        result.error = `Unknown step type: ${step.type}`;
    }

    result.duration_ms = Date.now() - startTime;
    
    // Screenshot capture is now controlled by screenshotOnFailureOnly flag
    // This will be handled by the caller (executeJob) based on the setting
    
    log('debug', `Step ${stepIndex + 1} completed`, { 
      status: result.status, 
      duration: result.duration_ms 
    });

  } catch (error) {
    result.status = 'failed';
    result.error = error.message;
    result.duration_ms = Date.now() - startTime;
    
    // Always capture screenshot on failure (regardless of setting)
    try {
      const screenshotBuffer = await page.screenshot({ fullPage: true });
      result.screenshot = `data:image/png;base64,${screenshotBuffer.toString('base64')}`;
    } catch (screenshotError) {
      log('warn', 'Failed to capture error screenshot', { error: screenshotError.message });
    }
    
    log('error', `Step ${stepIndex + 1} failed`, { 
      error: error.message, 
      step: step.type 
    });
  }

  return result;
}

// Execute a test job
async function executeJob(job) {
  const startTime = Date.now();
  activeJobs++;
  
  log('info', `Starting job execution`, { 
    job_id: job.id, 
    run_id: job.run_id,
    steps_count: job.steps?.length || 0 
  });

  const results = {
    result_data: {},
    step_results: [],
    error_message: null,
    execution_time_ms: 0,
  };

  let browser = null;
  let context = null;
  let page = null;

  try {
    // Fetch screenshot_on_failure_only setting from app_settings
    let screenshotOnFailureOnly = false;
    try {
      const settingResponse = await apiRequest('/settings/screenshot_on_failure_only', { method: 'GET' });
      screenshotOnFailureOnly = settingResponse?.value === true;
      log('info', `Screenshot on failure only setting: ${screenshotOnFailureOnly}`);
    } catch (settingError) {
      log('debug', 'Could not fetch screenshot setting, defaulting to capture all');
    }

    // Launch browser
    const browserType = CONFIG.BROWSERS[0] || 'chromium';
    log('debug', `Launching ${browserType} browser`);
    
    browser = await chromium.launch({
      headless: process.env.HEADLESS !== 'false',
    });
    
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'WISPR-Agent/1.0',
    });
    
    page = await context.newPage();

    // Navigate to base URL if provided
    if (job.base_url) {
      log('debug', `Navigating to base URL: ${job.base_url}`);
      await page.goto(job.base_url, { waitUntil: 'networkidle' });
    }

    // Execute each step
    const steps = job.steps || [];
    let failedSteps = 0;
    let passedSteps = 0;
    
    // Store variables for substitution during execution
    const storedVariables = new Map();
    
    // Helper function to substitute {{variableName}} placeholders
    const substituteVariables = (text) => {
      if (!text) return text;
      return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
        const value = storedVariables.get(varName);
        if (value !== undefined) {
          log('debug', `Substituting variable {{${varName}}} with "${value}"`);
          return value;
        }
        log('warn', `Variable {{${varName}}} not found, keeping as-is`);
        return match;
      });
    };

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      
      // Create a copy of the step with substituted variables
      const processedStep = {
        ...step,
        value: substituteVariables(step.value),
        selector: substituteVariables(step.selector),
        url: substituteVariables(step.url),
      };
      
      const stepResult = await executeStep(page, context, processedStep, i);
      
      // If step returned a stored variable, save it
      if (stepResult.storedVariable) {
        storedVariables.set(stepResult.storedVariable.name, stepResult.storedVariable.value || '');
        log('info', `Stored variable "${stepResult.storedVariable.name}" = "${stepResult.storedVariable.value}"`);
      }
      
      // Capture screenshot for passed steps only if setting allows
      if (stepResult.status === 'passed' && !stepResult.screenshot && !screenshotOnFailureOnly) {
        try {
          const screenshotBuffer = await page.screenshot({ fullPage: false });
          stepResult.screenshot = `data:image/png;base64,${screenshotBuffer.toString('base64')}`;
          log('debug', `Screenshot captured for step ${i + 1}`);
        } catch (screenshotError) {
          log('warn', 'Failed to capture step screenshot', { error: screenshotError.message });
        }
      }
      
      results.step_results.push(stepResult);

      // Handle tab switching if needed
      if (stepResult.switchToPage !== undefined) {
        const pages = context.pages();
        if (stepResult.switchToPage < pages.length) {
          page = pages[stepResult.switchToPage];
        }
      }

      if (stepResult.status === 'failed') {
        failedSteps++;
        // Stop on first failure (can be configured)
        if (step.stopOnFailure !== false) {
          log('warn', 'Stopping execution due to step failure');
          break;
        }
      } else if (stepResult.status === 'passed') {
        passedSteps++;
      }
    }

    results.result_data = {
      total_steps: steps.length,
      passed_steps: passedSteps,
      failed_steps: failedSteps,
      skipped_steps: steps.length - passedSteps - failedSteps,
    };

    results.execution_time_ms = Date.now() - startTime;
    
    const status = failedSteps > 0 ? 'failed' : 'completed';
    await submitResult(job.id, status, results);

    log('info', `Job execution completed`, {
      job_id: job.id,
      status,
      passed: passedSteps,
      failed: failedSteps,
      duration: results.execution_time_ms,
    });

  } catch (error) {
    results.error_message = error.message;
    results.execution_time_ms = Date.now() - startTime;
    
    await submitResult(job.id, 'failed', results);
    
    log('error', `Job execution failed`, {
      job_id: job.id,
      error: error.message,
    });
  } finally {
    // Cleanup
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    
    activeJobs--;
  }
}

// Main agent loop
async function runAgent() {
  log('info', '='.repeat(50));
  log('info', 'WISPR Self-Hosted Agent Starting...');
  log('info', '='.repeat(50));
  log('info', `API Endpoint: ${CONFIG.API_BASE_URL}`);
  log('info', `Max Capacity: ${CONFIG.MAX_CAPACITY}`);
  log('info', `Browsers: ${CONFIG.BROWSERS.join(', ')}`);
  log('info', '='.repeat(50));

  // Start heartbeat interval
  const heartbeatInterval = setInterval(sendHeartbeat, CONFIG.HEARTBEAT_INTERVAL);
  
  // Send initial heartbeat
  await sendHeartbeat();

  // Main polling loop
  while (isRunning) {
    try {
      const job = await pollForJobs();
      
      if (job) {
        const jobData = await startJob(job.id);
        
        if (jobData) {
          // Execute job in background (don't await to allow concurrent jobs)
          executeJob({ ...job, ...jobData }).catch(error => {
            log('error', 'Unhandled job execution error', { error: error.message });
          });
        }
      }
    } catch (error) {
      log('error', 'Error in main loop', { error: error.message });
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, CONFIG.POLL_INTERVAL));
  }

  clearInterval(heartbeatInterval);
  log('info', 'Agent stopped');
}

// Graceful shutdown
process.on('SIGINT', () => {
  log('info', 'Received SIGINT, shutting down...');
  isRunning = false;
});

process.on('SIGTERM', () => {
  log('info', 'Received SIGTERM, shutting down...');
  isRunning = false;
});

// Start the agent
runAgent().catch(error => {
  log('error', 'Agent crashed', { error: error.message });
  process.exit(1);
});
