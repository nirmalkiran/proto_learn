import JSZip from 'jszip';

export interface ExtensionConfig {
  sessionId: string;
  appOrigin: string;
}

// Browser API compatibility layer (works in Firefox, Chrome, Edge)
const browserApiPolyfill = `
// Cross-browser API compatibility
const browserAPI = (function() {
  if (typeof browser !== 'undefined' && browser.runtime) {
    return browser;
  }
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    return chrome;
  }
  throw new Error('No browser extension API available');
})();
`;

export const generateRecorderExtension = async (config: ExtensionConfig): Promise<Blob> => {
  const zip = new JSZip();

  // Manifest V2 for Firefox (also works in older Chrome/Edge)
  const manifestV2 = {
    manifest_version: 2,
    name: "Wispr Test Recorder",
    version: "1.0.0",
    description: "Record browser interactions for automated testing",
    permissions: ["activeTab", "storage", "<all_urls>"],
    browser_action: {
      default_popup: "popup.html",
      default_icon: {
        "16": "icons/icon16.png",
        "48": "icons/icon48.png",
        "128": "icons/icon128.png"
      }
    },
    icons: {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    },
    background: {
      scripts: ["background.js"],
      persistent: false
    },
    content_scripts: [{
      matches: ["<all_urls>"],
      js: ["content.js"],
      run_at: "document_start"
    }],
    browser_specific_settings: {
      gecko: {
        id: "wispr-test-recorder@wispr.dev",
        strict_min_version: "57.0"
      }
    }
  };

  // Manifest V3 for Chrome/Edge
  const manifestV3 = {
    manifest_version: 3,
    name: "Wispr Test Recorder",
    version: "1.0.0",
    description: "Record browser interactions for automated testing",
    permissions: ["activeTab", "scripting", "storage"],
    host_permissions: ["<all_urls>"],
    action: {
      default_popup: "popup.html",
      default_icon: {
        "16": "icons/icon16.png",
        "48": "icons/icon48.png",
        "128": "icons/icon128.png"
      }
    },
    icons: {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    },
    background: {
      service_worker: "background.js"
    },
    content_scripts: [{
      matches: ["<all_urls>"],
      js: ["content.js"],
      run_at: "document_start"
    }]
  };

  // Create both versions
  const chromeFolder = zip.folder("chrome-edge")!;
  const firefoxFolder = zip.folder("firefox")!;

  chromeFolder.file("manifest.json", JSON.stringify(manifestV3, null, 2));
  firefoxFolder.file("manifest.json", JSON.stringify(manifestV2, null, 2));

  // Background script (compatible with both MV2 and MV3)
  const backgroundJs = `${browserApiPolyfill}
// Background script for Wispr Test Recorder
let recordingState = {
  isRecording: false,
  isPaused: false,
  actions: [],
  tabId: null,
  sessionId: "${config.sessionId}"
};

// Listen for messages from popup and content scripts
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_STATE") {
    sendResponse(recordingState);
    return true;
  }
  
  if (message.type === "START_RECORDING") {
    recordingState.isRecording = true;
    recordingState.isPaused = false;
    recordingState.actions = [];
    recordingState.tabId = message.tabId;
    
    // Notify content script
    browserAPI.tabs.sendMessage(message.tabId, { type: "START_RECORDING" });
    sendResponse({ success: true });
    return true;
  }
  
  if (message.type === "STOP_RECORDING") {
    recordingState.isRecording = false;
    recordingState.isPaused = false;
    
    if (recordingState.tabId) {
      browserAPI.tabs.sendMessage(recordingState.tabId, { type: "STOP_RECORDING" });
    }
    
    const actions = [...recordingState.actions];
    recordingState.actions = [];
    recordingState.tabId = null;
    
    sendResponse({ success: true, actions });
    return true;
  }
  
  if (message.type === "TOGGLE_PAUSE") {
    recordingState.isPaused = !recordingState.isPaused;
    
    if (recordingState.tabId) {
      browserAPI.tabs.sendMessage(recordingState.tabId, { 
        type: "PAUSE_STATE_CHANGED", 
        isPaused: recordingState.isPaused 
      });
    }
    
    sendResponse({ success: true, isPaused: recordingState.isPaused });
    return true;
  }
  
  if (message.type === "RECORD_ACTION") {
    if (recordingState.isRecording && !recordingState.isPaused) {
      recordingState.actions.push(message.action);
    }
    sendResponse({ success: true, count: recordingState.actions.length });
    return true;
  }
  
  if (message.type === "GET_ACTIONS") {
    sendResponse({ actions: recordingState.actions });
    return true;
  }
});

// Handle tab updates
browserAPI.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (recordingState.isRecording && tabId === recordingState.tabId && changeInfo.status === 'complete') {
    // Re-inject content script after navigation
    browserAPI.tabs.sendMessage(tabId, { 
      type: "INIT_RECORDING",
      isPaused: recordingState.isPaused
    }).catch(() => {
      // Content script not ready yet, it will request state on load
    });
  }
});
`;

  chromeFolder.file("background.js", backgroundJs);
  firefoxFolder.file("background.js", backgroundJs);

  // Content script (compatible with both browsers)
  const contentJs = `${browserApiPolyfill}
// Content script for Wispr Test Recorder
(function() {
  let isRecording = false;
  let isPaused = false;
  let indicator = null;

  function getSelector(el) {
    if (!el || el === document.body || el === document.documentElement) return 'body';
    
    // Priority: data-testid > id > name > aria-label > placeholder > class
    if (el.getAttribute('data-testid')) return \`[data-testid="\${el.getAttribute('data-testid')}"]\`;
    if (el.id && !el.id.includes('wispr-')) return \`#\${el.id}\`;
    if (el.getAttribute('name')) return \`[name="\${el.getAttribute('name')}"]\`;
    if (el.getAttribute('aria-label')) return \`[aria-label="\${el.getAttribute('aria-label')}"]\`;
    if (el.placeholder) return \`[placeholder="\${el.placeholder}"]\`;
    
    if (el.className && typeof el.className === 'string') {
      const classes = el.className.split(' ')
        .filter(c => c && !c.includes('hover') && !c.includes('wispr') && !c.includes('active'))
        .slice(0, 2);
      if (classes.length) return el.tagName.toLowerCase() + '.' + classes.join('.');
    }
    
    // Fallback to nth-child
    const parent = el.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(el) + 1;
        const parentSelector = getSelector(parent);
        return \`\${parentSelector} > \${el.tagName.toLowerCase()}:nth-of-type(\${index})\`;
      }
    }
    
    return el.tagName.toLowerCase();
  }

  function getDescription(el) {
    const text = (el.textContent || '').trim().substring(0, 40);
    return text || el.placeholder || el.getAttribute('aria-label') || el.tagName;
  }

  function isRecordingUI(el) {
    if (!el) return false;
    let current = el;
    while (current) {
      if (current.id && current.id.includes('wispr-')) return true;
      if (current.className && typeof current.className === 'string' && current.className.includes('wispr-')) return true;
      current = current.parentElement;
    }
    return false;
  }

  function recordAction(action) {
    browserAPI.runtime.sendMessage({ type: 'RECORD_ACTION', action }, (response) => {
      if (response && indicator) {
        updateIndicator(response.count);
      }
    });
  }

  function createIndicator() {
    if (indicator) return;
    
    indicator = document.createElement('div');
    indicator.id = 'wispr-rec-indicator';
    indicator.style.cssText = 'position:fixed;top:10px;right:10px;z-index:2147483647;font-family:system-ui,-apple-system,sans-serif;';
    
    indicator.innerHTML = \`
      <div style="background:#ef4444;color:white;padding:10px 16px;border-radius:25px;font-size:14px;box-shadow:0 4px 15px rgba(0,0,0,0.3);display:flex;align-items:center;gap:10px;">
        <span id="wispr-indicator-dot" style="width:12px;height:12px;background:white;border-radius:50%;animation:wispr-blink 1s infinite;"></span>
        <span id="wispr-counter">Recording (0)</span>
        <button id="wispr-pause-btn" style="background:rgba(255,255,255,0.2);color:white;border:1px solid rgba(255,255,255,0.5);padding:4px 10px;border-radius:15px;cursor:pointer;font-weight:500;">Pause</button>
        <button id="wispr-stop-btn" style="background:white;color:#ef4444;border:none;padding:4px 12px;border-radius:15px;cursor:pointer;font-weight:600;">Stop</button>
      </div>
      <style>
        @keyframes wispr-blink { 0%,100%{opacity:1} 50%{opacity:0.4} }
      </style>
    \`;
    
    document.body.appendChild(indicator);
    
    // Attach event handlers
    document.getElementById('wispr-pause-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      browserAPI.runtime.sendMessage({ type: 'TOGGLE_PAUSE' }, (response) => {
        if (response) {
          isPaused = response.isPaused;
          updatePauseState();
        }
      });
    });
    
    document.getElementById('wispr-stop-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      stopRecording();
    });
  }

  function removeIndicator() {
    if (indicator) {
      indicator.remove();
      indicator = null;
    }
  }

  function updateIndicator(count) {
    const counter = document.getElementById('wispr-counter');
    if (counter) {
      counter.textContent = isPaused ? \`Paused (\${count})\` : \`Recording (\${count})\`;
    }
  }

  function updatePauseState() {
    const dot = document.getElementById('wispr-indicator-dot');
    const pauseBtn = document.getElementById('wispr-pause-btn');
    const counter = document.getElementById('wispr-counter');
    
    if (dot) dot.style.background = isPaused ? '#f59e0b' : 'white';
    if (pauseBtn) pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
    
    browserAPI.runtime.sendMessage({ type: 'GET_ACTIONS' }, (response) => {
      if (response && counter) {
        counter.textContent = isPaused ? \`Paused (\${response.actions.length})\` : \`Recording (\${response.actions.length})\`;
      }
    });
  }

  function stopRecording() {
    isRecording = false;
    isPaused = false;
    removeIndicator();
    removeEventListeners();
    
    browserAPI.runtime.sendMessage({ type: 'STOP_RECORDING' }, (response) => {
      if (response && response.actions) {
        const data = JSON.stringify(response.actions);
        navigator.clipboard.writeText(data).then(() => {
          alert(\`Recording stopped! \${response.actions.length} actions copied to clipboard.\\n\\nGo back to Wispr and paste (Ctrl+V) in the text area, then click Import.\`);
        }).catch(() => {
          prompt(\`Recording stopped! \${response.actions.length} actions captured.\\n\\nCopy this data and paste it in Wispr:\`, data);
        });
      }
    });
  }

  function handleClick(e) {
    if (!isRecording || isPaused) return;
    if (isRecordingUI(e.target)) return;
    
    const el = e.target;
    recordAction({
      id: Date.now().toString(),
      type: 'click',
      selector: getSelector(el),
      description: 'Click on ' + getDescription(el)
    });
  }

  function handleInput(e) {
    if (!isRecording || isPaused) return;
    if (isRecordingUI(e.target)) return;
    
    const el = e.target;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      // Debounce typing - update last action if same element
      browserAPI.runtime.sendMessage({ type: 'GET_ACTIONS' }, (response) => {
        if (response && response.actions.length > 0) {
          const last = response.actions[response.actions.length - 1];
          if (last.type === 'type' && last.selector === getSelector(el)) {
            // Update existing type action
            last.value = el.value;
            last.description = 'Type "' + el.value.substring(0, 30) + '" into ' + getDescription(el);
            return;
          }
        }
        
        recordAction({
          id: Date.now().toString(),
          type: 'type',
          selector: getSelector(el),
          value: el.value,
          description: 'Type "' + el.value.substring(0, 30) + '" into ' + getDescription(el)
        });
      });
    }
  }

  function handleChange(e) {
    if (!isRecording || isPaused) return;
    if (isRecordingUI(e.target)) return;
    
    const el = e.target;
    if (el.tagName === 'SELECT') {
      const text = el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : el.value;
      recordAction({
        id: Date.now().toString(),
        type: 'selectOption',
        selector: getSelector(el),
        value: el.value,
        description: 'Select "' + text + '"'
      });
    }
  }

  function handleKeydown(e) {
    if (e.key === 'Escape' && isRecording) {
      e.preventDefault();
      e.stopPropagation();
      stopRecording();
    }
    if (e.key === ' ' && e.ctrlKey && isRecording) {
      e.preventDefault();
      e.stopPropagation();
      browserAPI.runtime.sendMessage({ type: 'TOGGLE_PAUSE' }, (response) => {
        if (response) {
          isPaused = response.isPaused;
          updatePauseState();
        }
      });
    }
  }

  function addEventListeners() {
    document.addEventListener('click', handleClick, true);
    document.addEventListener('input', handleInput, true);
    document.addEventListener('change', handleChange, true);
    document.addEventListener('keydown', handleKeydown, true);
  }

  function removeEventListeners() {
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('input', handleInput, true);
    document.removeEventListener('change', handleChange, true);
    document.removeEventListener('keydown', handleKeydown, true);
  }

  // Listen for messages from background
  browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'START_RECORDING') {
      isRecording = true;
      isPaused = false;
      createIndicator();
      addEventListeners();
      sendResponse({ success: true });
    }
    
    if (message.type === 'STOP_RECORDING') {
      isRecording = false;
      isPaused = false;
      removeIndicator();
      removeEventListeners();
      sendResponse({ success: true });
    }
    
    if (message.type === 'PAUSE_STATE_CHANGED') {
      isPaused = message.isPaused;
      updatePauseState();
      sendResponse({ success: true });
    }
    
    if (message.type === 'INIT_RECORDING') {
      isRecording = true;
      isPaused = message.isPaused || false;
      createIndicator();
      addEventListeners();
      updatePauseState();
      sendResponse({ success: true });
    }
    
    return true;
  });

  // Check if we should be recording (page reload case)
  browserAPI.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
    if (response && response.isRecording) {
      isRecording = true;
      isPaused = response.isPaused;
      createIndicator();
      addEventListeners();
      updatePauseState();
    }
  });
})();
`;

  chromeFolder.file("content.js", contentJs);
  firefoxFolder.file("content.js", contentJs);

  // Popup HTML
  const popupHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 320px;
      font-family: system-ui, -apple-system, sans-serif;
      background: linear-gradient(135deg, #1e1e2e 0%, #2d2d44 100%);
      color: white;
      padding: 20px;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 20px;
    }
    .header img { width: 32px; height: 32px; }
    .header h1 { font-size: 16px; font-weight: 600; }
    .status {
      background: rgba(255,255,255,0.1);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 16px;
      text-align: center;
    }
    .status-indicator {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      margin-bottom: 8px;
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #6b7280;
    }
    .dot.recording { background: #ef4444; animation: pulse 1s infinite; }
    .dot.paused { background: #f59e0b; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
    .count { font-size: 24px; font-weight: 700; }
    .count-label { font-size: 12px; color: rgba(255,255,255,0.6); }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    button {
      width: 100%;
      padding: 12px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    button:hover { transform: translateY(-1px); }
    button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .btn-primary { background: #8b5cf6; color: white; }
    .btn-primary:hover:not(:disabled) { background: #7c3aed; }
    .btn-secondary { background: rgba(255,255,255,0.1); color: white; }
    .btn-secondary:hover:not(:disabled) { background: rgba(255,255,255,0.2); }
    .btn-danger { background: #ef4444; color: white; }
    .btn-danger:hover:not(:disabled) { background: #dc2626; }
    .instructions {
      margin-top: 16px;
      padding: 12px;
      background: rgba(255,255,255,0.05);
      border-radius: 8px;
      font-size: 12px;
      color: rgba(255,255,255,0.7);
    }
    .instructions ul { padding-left: 16px; margin-top: 8px; }
    .instructions li { margin-bottom: 4px; }
  </style>
</head>
<body>
  <div class="header">
    <img src="icons/icon48.png" alt="Wispr">
    <h1>Wispr Test Recorder</h1>
  </div>
  
  <div class="status">
    <div class="status-indicator">
      <span id="status-dot" class="dot"></span>
      <span id="status-text">Ready</span>
    </div>
    <div class="count" id="action-count">0</div>
    <div class="count-label">actions recorded</div>
  </div>
  
  <div class="actions">
    <button id="start-btn" class="btn-primary">Start Recording</button>
    <button id="pause-btn" class="btn-secondary" disabled>Pause</button>
    <button id="stop-btn" class="btn-danger" disabled>Stop & Copy</button>
  </div>
  
  <div class="instructions">
    <strong>How to use:</strong>
    <ul>
      <li>Click "Start Recording" on the page you want to test</li>
      <li>Interact with the page - clicks, typing, and selections are captured</li>
      <li>Press Ctrl+Space to pause/resume</li>
      <li>Press ESC or click "Stop" when done</li>
      <li>Paste the copied data in Wispr</li>
    </ul>
  </div>

  <script src="popup.js"></script>
</body>
</html>`;

  chromeFolder.file("popup.html", popupHtml);
  firefoxFolder.file("popup.html", popupHtml);

  // Popup JS (compatible with both browsers)
  const popupJs = `${browserApiPolyfill}
document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('start-btn');
  const pauseBtn = document.getElementById('pause-btn');
  const stopBtn = document.getElementById('stop-btn');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const actionCount = document.getElementById('action-count');

  function updateUI(state) {
    const count = state.actions ? state.actions.length : 0;
    actionCount.textContent = count;
    
    if (state.isRecording) {
      startBtn.disabled = true;
      pauseBtn.disabled = false;
      stopBtn.disabled = false;
      
      if (state.isPaused) {
        statusDot.className = 'dot paused';
        statusText.textContent = 'Paused';
        pauseBtn.textContent = 'Resume';
      } else {
        statusDot.className = 'dot recording';
        statusText.textContent = 'Recording...';
        pauseBtn.textContent = 'Pause';
      }
    } else {
      startBtn.disabled = false;
      pauseBtn.disabled = true;
      stopBtn.disabled = true;
      statusDot.className = 'dot';
      statusText.textContent = 'Ready';
      pauseBtn.textContent = 'Pause';
    }
  }

  function getState() {
    browserAPI.runtime.sendMessage({ type: 'GET_STATE' }, updateUI);
  }

  startBtn.addEventListener('click', async () => {
    const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (tab) {
      browserAPI.runtime.sendMessage({ type: 'START_RECORDING', tabId: tab.id }, () => {
        getState();
      });
    }
  });

  pauseBtn.addEventListener('click', () => {
    browserAPI.runtime.sendMessage({ type: 'TOGGLE_PAUSE' }, () => {
      getState();
    });
  });

  stopBtn.addEventListener('click', () => {
    browserAPI.runtime.sendMessage({ type: 'STOP_RECORDING' }, (response) => {
      if (response && response.actions) {
        const data = JSON.stringify(response.actions);
        navigator.clipboard.writeText(data).then(() => {
          alert('Recording stopped! ' + response.actions.length + ' actions copied to clipboard.');
        });
      }
      getState();
    });
  });

  // Initial state
  getState();
  
  // Poll for updates
  setInterval(getState, 1000);
});
`;

  chromeFolder.file("popup.js", popupJs);
  firefoxFolder.file("popup.js", popupJs);

  // Create PNG icons
  const createPngIcon = (size: number): string => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    
    // Background circle (purple)
    ctx.fillStyle = '#8b5cf6';
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/2 - 1, 0, Math.PI * 2);
    ctx.fill();
    
    // Inner circle (red for recording)
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/4, 0, Math.PI * 2);
    ctx.fill();
    
    return canvas.toDataURL('image/png').split(',')[1];
  };

  // Add icons to both folders
  const chromeIcons = chromeFolder.folder("icons")!;
  const firefoxIcons = firefoxFolder.folder("icons")!;
  
  const icon16 = createPngIcon(16);
  const icon48 = createPngIcon(48);
  const icon128 = createPngIcon(128);

  chromeIcons.file("icon16.png", icon16, { base64: true });
  chromeIcons.file("icon48.png", icon48, { base64: true });
  chromeIcons.file("icon128.png", icon128, { base64: true });
  
  firefoxIcons.file("icon16.png", icon16, { base64: true });
  firefoxIcons.file("icon48.png", icon48, { base64: true });
  firefoxIcons.file("icon128.png", icon128, { base64: true });

  // Generate README
  const readme = `# Wispr Test Recorder Extension

Cross-browser compatible extension for recording test scripts.

## Supported Browsers
- Google Chrome
- Microsoft Edge
- Mozilla Firefox

## Installation

### Chrome / Edge
1. Open \`chrome://extensions\` (Chrome) or \`edge://extensions\` (Edge)
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the **chrome-edge** folder from this ZIP

### Firefox
1. Open \`about:debugging#/runtime/this-firefox\`
2. Click "Load Temporary Add-on"
3. Navigate to the **firefox** folder and select the \`manifest.json\` file

**Note:** For permanent Firefox installation, the extension needs to be signed by Mozilla.

## Usage

1. Navigate to the website you want to test
2. Click the Wispr extension icon in your browser toolbar
3. Click "Start Recording"
4. Interact with the page - clicks, typing, and selections are captured
5. Use Ctrl+Space to pause/resume recording
6. Press ESC or click "Stop & Copy" when done
7. Go back to Wispr and paste the copied data

## Keyboard Shortcuts

- **Ctrl+Space**: Pause/Resume recording
- **ESC**: Stop recording and copy data

## Troubleshooting

- Make sure the extension has permission to access the page
- If recording doesn't start, try refreshing the page
- Check the browser console for any errors
- For Firefox, temporary add-ons are removed when Firefox restarts
`;

  zip.file("README.md", readme);

  return await zip.generateAsync({ type: 'blob' });
};

export const downloadExtension = async (config: ExtensionConfig): Promise<void> => {
  const blob = await generateRecorderExtension(config);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'wispr-test-recorder-extension.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
