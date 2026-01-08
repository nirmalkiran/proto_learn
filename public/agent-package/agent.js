/**
 * WISPR Self-Hosted Test Execution Agent
 * Usage: npm install && npx playwright install chromium && npm start
 */

import { chromium } from 'playwright';

const CONFIG = {
  API_TOKEN: process.env.WISPR_API_TOKEN || "YOUR_API_TOKEN_HERE",
  API_BASE_URL: "https://lwlqfrsqwyvwqveqksuz.supabase.co/functions/v1/agent-api",
  HEARTBEAT_INTERVAL: 30000,
  POLL_INTERVAL: 5000,
  MAX_CAPACITY: 3,
};

let isRunning = true, activeJobs = 0;

const log = (l, m, d = {}) => console.log(`[${new Date().toISOString()}] [${l.toUpperCase()}] ${m}`, Object.keys(d).length ? d : "");

async function apiRequest(endpoint, opts = {}) {
  const res = await fetch(CONFIG.API_BASE_URL + endpoint, {
    ...opts,
    headers: { "Content-Type": "application/json", "x-agent-key": CONFIG.API_TOKEN, ...opts.headers }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function sendHeartbeat() {
  try {
    await apiRequest("/heartbeat", {
      method: "POST",
      body: JSON.stringify({
        current_capacity: CONFIG.MAX_CAPACITY - activeJobs,
        max_capacity: CONFIG.MAX_CAPACITY,
        active_jobs: activeJobs,
        system_info: { platform: process.platform, nodeVersion: process.version }
      })
    });
    log("debug", "Heartbeat sent");
  } catch (e) { log("warn", "Heartbeat failed", { error: e.message }); }
}

async function pollForJobs() {
  if (activeJobs >= CONFIG.MAX_CAPACITY) return null;
  try {
    const data = await apiRequest("/jobs/poll", { method: "GET" });
    if (data.jobs?.length > 0) { log("info", `Found ${data.jobs.length} job(s)`); return data.jobs[0]; }
    return null;
  } catch (e) { log("warn", "Poll failed", { error: e.message }); return null; }
}

async function startJob(jobId) {
  try { return await apiRequest(`/jobs/${jobId}/start`, { method: "POST" }); }
  catch (e) { log("error", `Failed to claim job ${jobId}`, { error: e.message }); return null; }
}

async function submitResult(jobId, status, results) {
  try {
    await apiRequest(`/jobs/${jobId}/result`, { method: "POST", body: JSON.stringify({ status, ...results }) });
    log("info", `Results submitted for job ${jobId}`, { status });
  } catch (e) { log("error", "Failed to submit results", { error: e.message }); }
}

async function executeStep(page, step, idx) {
  const start = Date.now();
  const result = { step_index: idx, step_type: step.type, status: "passed", duration_ms: 0, error: null };
  try {
    switch (step.type) {
      case "goto": case "navigate": await page.goto(step.url || step.value, { waitUntil: "networkidle" }); break;
      case "click": await page.click(step.selector, { timeout: 30000 }); break;
      case "type": case "fill": await page.fill(step.selector, step.value || ""); break;
      case "wait": await page.waitForTimeout(parseInt(step.value) || 1000); break;
      case "waitForSelector": await page.waitForSelector(step.selector, { timeout: 30000 }); break;
      case "screenshot": await page.screenshot({ fullPage: step.fullPage }); break;
      case "select": await page.selectOption(step.selector, step.value); break;
      case "assertText": case "verifyText": {
        const txt = await page.textContent(step.selector);
        if (!txt?.includes(step.value)) throw new Error(`Expected "${step.value}" not found`);
        break;
      }
      case "assertVisible": if (!(await page.isVisible(step.selector))) throw new Error("Element not visible"); break;
      default: log("warn", `Unknown step: ${step.type}`);
    }
    result.duration_ms = Date.now() - start;
  } catch (e) { result.status = "failed"; result.error = e.message; result.duration_ms = Date.now() - start; }
  return result;
}

async function executeJob(job) {
  const start = Date.now(); activeJobs++;
  log("info", "Starting job", { job_id: job.id, steps: job.steps?.length || 0 });
  const results = { result_data: {}, step_results: [], error_message: null, execution_time_ms: 0 };
  let browser = null;
  try {
    browser = await chromium.launch({ headless: process.env.HEADLESS !== "false" });
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    if (job.base_url) await page.goto(job.base_url, { waitUntil: "networkidle" });
    let passed = 0, failed = 0;
    for (let i = 0; i < (job.steps || []).length; i++) {
      const r = await executeStep(page, job.steps[i], i);
      results.step_results.push(r);
      if (r.status === "failed") { failed++; break; } else passed++;
    }
    results.result_data = { total_steps: job.steps?.length || 0, passed_steps: passed, failed_steps: failed };
    results.execution_time_ms = Date.now() - start;
    await submitResult(job.id, failed > 0 ? "failed" : "completed", results);
  } catch (e) {
    results.error_message = e.message; results.execution_time_ms = Date.now() - start;
    await submitResult(job.id, "failed", results);
  } finally { if (browser) await browser.close().catch(() => {}); activeJobs--; }
}

async function runAgent() {
  log("info", "=".repeat(50));
  log("info", "WISPR Self-Hosted Agent Starting...");
  log("info", "=".repeat(50));
  const hb = setInterval(sendHeartbeat, CONFIG.HEARTBEAT_INTERVAL);
  await sendHeartbeat();
  while (isRunning) {
    try {
      const job = await pollForJobs();
      if (job) { const jd = await startJob(job.id); if (jd) executeJob({ ...job, ...jd }).catch(e => log("error", "Job error", { error: e.message })); }
    } catch (e) { log("error", "Main loop error", { error: e.message }); }
    await new Promise(r => setTimeout(r, CONFIG.POLL_INTERVAL));
  }
  clearInterval(hb); log("info", "Agent stopped");
}

process.on("SIGINT", () => { isRunning = false; });
process.on("SIGTERM", () => { isRunning = false; });
runAgent().catch(e => { log("error", "Agent crashed", { error: e.message }); process.exit(1); });