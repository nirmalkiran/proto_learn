/**
 * Mobile Automation Backend Server
 * 
 * This file should be run locally (not in Lovable):
 *   1. Copy this file to your local project: backend/server.js
 *   2. Run: npm init -y && npm install express cors axios
 *   3. Start: node server.js
 */

const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const APPIUM_URL = process.env.APPIUM_URL || 'http://localhost:4723';
let currentSessionId = null;

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', appiumUrl: APPIUM_URL, sessionId: currentSessionId });
});

// Terminal command execution (ADB commands)
app.post('/api/terminal', (req, res) => {
  const { command } = req.body;
  
  // Security: Only allow specific command prefixes
  const allowedPrefixes = ['adb', 'appium'];
  const isAllowed = allowedPrefixes.some(prefix => command.startsWith(prefix));
  
  if (!isAllowed) {
    return res.json({ success: false, error: 'Command not allowed. Use adb or appium commands.' });
  }

  // Handle Appium commands specially
  if (command.startsWith('appium:')) {
    const action = command.replace('appium:', '');
    handleAppiumCommand(action, res);
    return;
  }

  exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
    if (error) {
      res.json({ success: false, error: stderr || error.message });
    } else {
      res.json({ success: true, output: stdout });
    }
  });
});

// Appium command handler
async function handleAppiumCommand(action, res) {
  try {
    switch (action) {
      case 'status':
        const statusRes = await axios.get(`${APPIUM_URL}/status`);
        res.json({ success: true, output: JSON.stringify(statusRes.data, null, 2) });
        break;
      case 'session':
        res.json({ success: true, output: `Current session: ${currentSessionId || 'none'}` });
        break;
      case 'source':
        if (!currentSessionId) {
          res.json({ success: false, error: 'No active session. Create a session first.' });
          return;
        }
        const sourceRes = await axios.get(`${APPIUM_URL}/session/${currentSessionId}/source`);
        res.json({ success: true, output: sourceRes.data.value });
        break;
      default:
        res.json({ success: false, error: `Unknown appium command: ${action}` });
    }
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
}

// Create Appium session
app.post('/api/session/create', async (req, res) => {
  const { capabilities } = req.body;
  
  const defaultCaps = {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:deviceName': process.env.DEVICE_NAME || 'emulator-5554',
    ...capabilities
  };

  try {
    const response = await axios.post(`${APPIUM_URL}/session`, {
      capabilities: { alwaysMatch: defaultCaps }
    });
    currentSessionId = response.data.value.sessionId;
    res.json({ success: true, sessionId: currentSessionId });
  } catch (error) {
    res.json({ success: false, error: error.response?.data || error.message });
  }
});

// End Appium session
app.delete('/api/session', async (req, res) => {
  if (!currentSessionId) {
    return res.json({ success: false, error: 'No active session' });
  }
  
  try {
    await axios.delete(`${APPIUM_URL}/session/${currentSessionId}`);
    currentSessionId = null;
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Get UI hierarchy
app.get('/api/hierarchy', async (req, res) => {
  if (!currentSessionId) {
    // Try to get hierarchy via ADB if no session
    exec('adb shell uiautomator dump /dev/tty', (error, stdout) => {
      if (error) {
        return res.json({ success: false, error: 'No active session and ADB dump failed' });
      }
      // Parse XML to JSON (simplified)
      res.json({ success: true, hierarchy: { raw: stdout }, note: 'Raw XML from ADB' });
    });
    return;
  }

  try {
    const response = await axios.get(`${APPIUM_URL}/session/${currentSessionId}/source`);
    // In production, parse XML to structured JSON here
    res.json({ success: true, hierarchy: { raw: response.data.value } });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Playback recorded actions
app.post('/api/playback', async (req, res) => {
  const { actions } = req.body;
  
  if (!currentSessionId) {
    return res.json({ success: false, error: 'No active Appium session. Create session first.' });
  }

  const results = [];
  
  for (const action of actions) {
    try {
      switch (action.type) {
        case 'tap':
          const element = await axios.post(`${APPIUM_URL}/session/${currentSessionId}/element`, {
            using: 'xpath',
            value: action.locator
          });
          await axios.post(`${APPIUM_URL}/session/${currentSessionId}/element/${element.data.value.ELEMENT}/click`);
          results.push({ action: 'tap', success: true });
          break;
          
        case 'input':
          const inputEl = await axios.post(`${APPIUM_URL}/session/${currentSessionId}/element`, {
            using: 'xpath',
            value: action.locator
          });
          await axios.post(`${APPIUM_URL}/session/${currentSessionId}/element/${inputEl.data.value.ELEMENT}/value`, {
            text: action.value
          });
          results.push({ action: 'input', success: true });
          break;
          
        case 'wait':
          await new Promise(resolve => setTimeout(resolve, action.duration || 1000));
          results.push({ action: 'wait', success: true });
          break;
          
        case 'assert':
          const assertEl = await axios.post(`${APPIUM_URL}/session/${currentSessionId}/element`, {
            using: 'xpath',
            value: action.locator
          });
          results.push({ action: 'assert', success: !!assertEl.data.value });
          break;
      }
    } catch (error) {
      results.push({ action: action.type, success: false, error: error.message });
    }
  }

  const allSuccess = results.every(r => r.success);
  res.json({ success: allSuccess, results });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Mobile Automation Backend running on http://localhost:${PORT}`);
  console.log(`Appium URL: ${APPIUM_URL}`);
});
