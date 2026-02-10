/**
 * WISPR Performance Testing Agent
 * 
 * This agent connects to WISPR platform and executes JMeter performance tests
 * on your local machine.
 * 
 * Prerequisites:
 *   - JMeter installed and available in PATH (or set JMETER_HOME)
 *   - Node.js 18+
 * 
 * Usage:
 *   1. Set your API token: export WISPR_API_TOKEN="your_token_here"
 *   2. Run: npm start
 */

import { spawn, exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Configuration (defaults, will be updated from server settings)
const CONFIG = {
  API_TOKEN: process.env.WISPR_API_TOKEN || 'wispr_agent_placeholder',
  API_BASE_URL: 'https://lghzmijzfpvrcvogxpew.supabase.co/functions/v1/agent-api',
  HEARTBEAT_INTERVAL: 60000, // 60 seconds
  POLL_INTERVAL: 10000, // 10 seconds
  MAX_CAPACITY: 1, // Performance tests are resource intensive
  JMETER_HOME: process.env.JMETER_HOME || '',
};

// Agent state
let isRunning = true;
let activeJobs = 0;
let settingsFetched = false;

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
      agentType: 'performance',
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

// Poll for available performance jobs
async function pollForPerformanceJobs() {
  if (activeJobs >= CONFIG.MAX_CAPACITY) {
    log('debug', 'At max capacity, skipping poll');
    return null;
  }

  try {
    const data = await apiRequest('/performance/jobs/poll', { method: 'GET' });
    
    if (data.jobs && data.jobs.length > 0) {
      log('info', `Found ${data.jobs.length} available performance job(s)`);
      return data.jobs[0]; // Take the first available job
    }
    
    return null;
  } catch (error) {
    log('warn', 'Failed to poll for performance jobs', { error: error.message });
    return null;
  }
}

// Claim and start a performance job
async function startPerformanceJob(jobId) {
  try {
    const data = await apiRequest(`/performance/jobs/${jobId}/start`, {
      method: 'POST',
    });
    
    log('info', `Performance job ${jobId} claimed successfully`);
    return data;
  } catch (error) {
    log('error', `Failed to claim performance job ${jobId}`, { error: error.message });
    return null;
  }
}

// Submit performance job results
async function submitPerformanceResult(jobId, status, results) {
  try {
    await apiRequest(`/performance/jobs/${jobId}/result`, {
      method: 'POST',
      body: JSON.stringify({
        status,
        summary: results.summary || {},
        jtl_base64: results.jtl_base64,
        report_base64: results.report_base64,
        error_message: results.error_message,
      }),
    });
    
    log('info', `Results submitted for performance job ${jobId}`, { status });
  } catch (error) {
    log('error', `Failed to submit results for performance job ${jobId}`, { error: error.message });
  }
}

// Find JMeter executable
async function findJMeterPath() {
  // Check JMETER_HOME first
  if (CONFIG.JMETER_HOME) {
    const jmeterBin = path.join(CONFIG.JMETER_HOME, 'bin', process.platform === 'win32' ? 'jmeter.bat' : 'jmeter');
    try {
      await fs.access(jmeterBin);
      return jmeterBin;
    } catch {
      log('warn', `JMeter not found at JMETER_HOME: ${CONFIG.JMETER_HOME}`);
    }
  }

  // Check common locations
  const commonPaths = process.platform === 'win32' 
    ? [
        'C:\\apache-jmeter\\bin\\jmeter.bat',
        'C:\\Program Files\\Apache JMeter\\bin\\jmeter.bat',
        'C:\\jmeter\\bin\\jmeter.bat',
      ]
    : [
        '/opt/apache-jmeter/bin/jmeter',
        '/usr/local/apache-jmeter/bin/jmeter',
        '/usr/share/jmeter/bin/jmeter',
        '/opt/jmeter/bin/jmeter',
        path.join(os.homedir(), 'apache-jmeter', 'bin', 'jmeter'),
      ];

  for (const jmeterPath of commonPaths) {
    try {
      await fs.access(jmeterPath);
      log('info', `Found JMeter at: ${jmeterPath}`);
      return jmeterPath;
    } catch {
      // Continue checking
    }
  }

  // Try 'which' or 'where' command
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32' ? 'where jmeter' : 'which jmeter';
    exec(cmd, (error, stdout) => {
      if (error) {
        resolve(null);
      } else {
        const jmeterPath = stdout.trim().split('\n')[0];
        if (jmeterPath) {
          log('info', `Found JMeter in PATH: ${jmeterPath}`);
          resolve(jmeterPath);
        } else {
          resolve(null);
        }
      }
    });
  });
}

// Execute JMeter test
async function executeJMeterTest(jmxPath, config, workDir) {
  const jmeterPath = await findJMeterPath();
  
  if (!jmeterPath) {
    throw new Error('JMeter not found. Please install JMeter and set JMETER_HOME environment variable.');
  }

  const jtlPath = path.join(workDir, 'results.jtl');
  const reportDir = path.join(workDir, 'report');
  
  // Build JMeter command arguments
  const args = [
    '-n', // Non-GUI mode
    '-t', jmxPath, // Test plan
    '-l', jtlPath, // Results file
    '-e', // Generate report
    '-o', reportDir, // Report output directory
  ];

  // Add property overrides if provided
  if (config.virtualUsers) {
    args.push('-Jthreads=' + config.virtualUsers);
  }
  if (config.rampUp !== undefined) {
    args.push('-Jrampup=' + config.rampUp);
  }
  if (config.duration) {
    args.push('-Jduration=' + config.duration);
  }

  log('info', 'Starting JMeter test', { 
    jmeterPath, 
    jmxPath, 
    args: args.join(' '),
    config 
  });

  return new Promise((resolve, reject) => {
    const jmeter = spawn(jmeterPath, args, {
      cwd: workDir,
      shell: process.platform === 'win32',
    });

    let stdout = '';
    let stderr = '';

    jmeter.stdout.on('data', (data) => {
      stdout += data.toString();
      log('debug', `JMeter: ${data.toString().trim()}`);
    });

    jmeter.stderr.on('data', (data) => {
      stderr += data.toString();
      log('warn', `JMeter stderr: ${data.toString().trim()}`);
    });

    jmeter.on('close', async (code) => {
      log('info', `JMeter process exited with code ${code}`);
      
      if (code === 0) {
        try {
          // Read JTL results
          let jtlContent = '';
          try {
            jtlContent = await fs.readFile(jtlPath, 'utf8');
          } catch {
            log('warn', 'Could not read JTL file');
          }

          // Parse summary from JTL
          const summary = parseJTLSummary(jtlContent);

          resolve({
            success: true,
            jtlPath,
            reportDir,
            jtlContent,
            summary,
            stdout,
          });
        } catch (error) {
          resolve({
            success: true,
            jtlPath,
            reportDir,
            summary: {},
            stdout,
          });
        }
      } else {
        reject(new Error(`JMeter exited with code ${code}. stderr: ${stderr}`));
      }
    });

    jmeter.on('error', (error) => {
      reject(new Error(`Failed to start JMeter: ${error.message}`));
    });
  });
}

// Parse JTL file to extract summary statistics
function parseJTLSummary(jtlContent) {
  if (!jtlContent) return {};

  const lines = jtlContent.trim().split('\n');
  if (lines.length < 2) return {};

  // Check if it's CSV format (has header row)
  const header = lines[0].toLowerCase();
  const isCSV = header.includes('timestamp') || header.includes('elapsed');

  if (!isCSV) return {};

  const headers = lines[0].split(',');
  const data = lines.slice(1);

  let totalRequests = 0;
  let successCount = 0;
  let errorCount = 0;
  let responseTimes = [];
  let bytes = [];

  const elapsedIdx = headers.findIndex(h => h.toLowerCase() === 'elapsed');
  const successIdx = headers.findIndex(h => h.toLowerCase() === 'success');
  const bytesIdx = headers.findIndex(h => h.toLowerCase() === 'bytes');

  for (const line of data) {
    if (!line.trim()) continue;
    
    const cols = line.split(',');
    totalRequests++;

    if (elapsedIdx >= 0) {
      const elapsed = parseInt(cols[elapsedIdx]);
      if (!isNaN(elapsed)) responseTimes.push(elapsed);
    }

    if (successIdx >= 0) {
      const success = cols[successIdx]?.toLowerCase() === 'true';
      if (success) {
        successCount++;
      } else {
        errorCount++;
      }
    }

    if (bytesIdx >= 0) {
      const byteVal = parseInt(cols[bytesIdx]);
      if (!isNaN(byteVal)) bytes.push(byteVal);
    }
  }

  const sortedTimes = responseTimes.sort((a, b) => a - b);
  const avgResponseTime = responseTimes.length > 0 
    ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) 
    : 0;
  const minResponseTime = sortedTimes[0] || 0;
  const maxResponseTime = sortedTimes[sortedTimes.length - 1] || 0;
  const p90 = sortedTimes[Math.floor(sortedTimes.length * 0.9)] || 0;
  const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)] || 0;
  const p99 = sortedTimes[Math.floor(sortedTimes.length * 0.99)] || 0;

  return {
    totalRequests,
    successCount,
    errorCount,
    errorRate: totalRequests > 0 ? (errorCount / totalRequests * 100).toFixed(2) : 0,
    avgResponseTime,
    minResponseTime,
    maxResponseTime,
    p90ResponseTime: p90,
    p95ResponseTime: p95,
    p99ResponseTime: p99,
    totalBytes: bytes.reduce((a, b) => a + b, 0),
  };
}

// Execute a performance job
async function executePerformanceJob(job) {
  activeJobs++;
  const startTime = Date.now();
  
  // Create temporary working directory
  const workDir = path.join(os.tmpdir(), `wispr-perf-${job.id}`);
  
  try {
    await fs.mkdir(workDir, { recursive: true });
    log('info', `Executing performance job ${job.id}`, { workDir });

    // Decode JMX from base64 and write to file
    let jmxContent;
    try {
      jmxContent = Buffer.from(job.jmx_base64, 'base64').toString('utf8');
    } catch (e) {
      throw new Error('Failed to decode JMX file from base64');
    }

    const jmxPath = path.join(workDir, 'test.jmx');
    await fs.writeFile(jmxPath, jmxContent);
    log('info', 'JMX file written', { path: jmxPath, size: jmxContent.length });

    // Execute JMeter
    const config = {
      virtualUsers: job.threads,
      rampUp: job.rampup,
      duration: job.duration,
    };

    const result = await executeJMeterTest(jmxPath, config, workDir);

    // Prepare results
    const executionTime = Date.now() - startTime;
    
    // Read and encode JTL file
    let jtlBase64 = '';
    if (result.jtlContent) {
      jtlBase64 = Buffer.from(result.jtlContent).toString('base64');
    }

    // Create a simple report summary
    const reportContent = `
# JMeter Performance Test Report

## Test Summary
- **Job ID**: ${job.id}
- **Execution Time**: ${executionTime}ms
- **Virtual Users**: ${config.virtualUsers || 'Default'}
- **Ramp Up**: ${config.rampUp || 'Default'}s
- **Duration**: ${config.duration || 'Default'}s

## Results
- **Total Requests**: ${result.summary.totalRequests || 0}
- **Successful**: ${result.summary.successCount || 0}
- **Failed**: ${result.summary.errorCount || 0}
- **Error Rate**: ${result.summary.errorRate || 0}%

## Response Times
- **Average**: ${result.summary.avgResponseTime || 0}ms
- **Min**: ${result.summary.minResponseTime || 0}ms
- **Max**: ${result.summary.maxResponseTime || 0}ms
- **90th Percentile**: ${result.summary.p90ResponseTime || 0}ms
- **95th Percentile**: ${result.summary.p95ResponseTime || 0}ms
- **99th Percentile**: ${result.summary.p99ResponseTime || 0}ms

## Data Transfer
- **Total Bytes**: ${result.summary.totalBytes || 0}
    `.trim();

    const reportBase64 = Buffer.from(reportContent).toString('base64');

    await submitPerformanceResult(job.id, 'completed', {
      summary: result.summary,
      jtl_base64: jtlBase64,
      report_base64: reportBase64,
    });

    log('info', `Performance job ${job.id} completed successfully`, {
      duration: executionTime,
      summary: result.summary,
    });

  } catch (error) {
    log('error', `Performance job ${job.id} failed`, { error: error.message });
    
    await submitPerformanceResult(job.id, 'failed', {
      error_message: error.message,
      summary: {},
    });
  } finally {
    // Cleanup
    try {
      await fs.rm(workDir, { recursive: true, force: true });
    } catch {
      log('warn', `Failed to cleanup work directory: ${workDir}`);
    }
    
    activeJobs--;
  }
}

// Fetch settings from server
async function fetchSettings() {
  try {
    log('info', 'Fetching agent settings from server...');
    
    // Fetch poll interval
    const pollData = await apiRequest('/settings/agent_poll_interval_seconds', { method: 'GET' });
    if (pollData.value?.value) {
      CONFIG.POLL_INTERVAL = pollData.value.value * 1000;
      log('info', `Poll interval set to ${pollData.value.value} seconds`);
    }
    
    // Fetch heartbeat interval
    const heartbeatData = await apiRequest('/settings/agent_heartbeat_interval_seconds', { method: 'GET' });
    if (heartbeatData.value?.value) {
      CONFIG.HEARTBEAT_INTERVAL = heartbeatData.value.value * 1000;
      log('info', `Heartbeat interval set to ${heartbeatData.value.value} seconds`);
    }
    
    settingsFetched = true;
    log('info', 'Settings fetched successfully');
  } catch (error) {
    log('warn', 'Failed to fetch settings, using defaults', { error: error.message });
  }
}

// Verify JMeter installation
async function verifyJMeter() {
  const jmeterPath = await findJMeterPath();
  if (!jmeterPath) {
    log('error', '='.repeat(50));
    log('error', 'JMeter NOT FOUND!');
    log('error', 'Please install Apache JMeter and either:');
    log('error', '  1. Add it to your PATH, or');
    log('error', '  2. Set JMETER_HOME environment variable');
    log('error', '='.repeat(50));
    return false;
  }
  log('info', `JMeter found: ${jmeterPath}`);
  return true;
}

// Main agent loop
async function runAgent() {
  log('info', '='.repeat(50));
  log('info', 'WISPR Performance Testing Agent Starting...');
  log('info', '='.repeat(50));
  log('info', `API Endpoint: ${CONFIG.API_BASE_URL}`);
  log('info', `Max Capacity: ${CONFIG.MAX_CAPACITY}`);
  log('info', '='.repeat(50));

  // Verify JMeter installation
  const jmeterOk = await verifyJMeter();
  if (!jmeterOk) {
    log('warn', 'Continuing without JMeter verification - tests may fail');
  }

  // Fetch settings from server before starting
  await fetchSettings();
  
  log('info', `Poll Interval: ${CONFIG.POLL_INTERVAL / 1000}s`);
  log('info', `Heartbeat Interval: ${CONFIG.HEARTBEAT_INTERVAL / 1000}s`);
  log('info', '='.repeat(50));

  // Start heartbeat interval
  const heartbeatInterval = setInterval(sendHeartbeat, CONFIG.HEARTBEAT_INTERVAL);
  
  // Send initial heartbeat
  await sendHeartbeat();

  // Main polling loop
  while (isRunning) {
    try {
      const job = await pollForPerformanceJobs();
      
      if (job) {
        const jobData = await startPerformanceJob(job.id);
        
        if (jobData) {
          // Execute job (await because performance tests are sequential)
          await executePerformanceJob({ ...job, ...jobData });
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
