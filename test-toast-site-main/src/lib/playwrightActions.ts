// Comprehensive Playwright Action Types for No-Code Automation

export type ActionCategory = 
  | 'navigation'
  | 'interaction'
  | 'input'
  | 'assertion'
  | 'variable'
  | 'wait'
  | 'mouse'
  | 'keyboard'
  | 'file'
  | 'dialog'
  | 'frame'
  | 'storage'
  | 'screenshot'
  | 'network'
  | 'browser';

export type ActionType = 
  // Navigation
  | 'navigate'
  | 'reload'
  | 'goBack'
  | 'goForward'
  | 'setViewport'
  // Interaction - Click
  | 'click'
  | 'doubleClick'
  | 'rightClick'
  | 'tripleClick'
  | 'hover'
  | 'focus'
  // Interaction - Drag
  | 'dragDrop'
  // Input
  | 'type'
  | 'fill'
  | 'clear'
  | 'pressKey'
  | 'check'
  | 'uncheck'
  | 'selectOption'
  // Assertions
  | 'verify'
  | 'verifyVisible'
  | 'verifyHidden'
  | 'verifyEnabled'
  | 'verifyDisabled'
  | 'verifyText'
  | 'verifyAttribute'
  | 'verifyValue'
  | 'verifyUrl'
  | 'verifyTitle'
  // Store Variable Actions
  | 'storeElementValue'
  | 'storePageTitle'
  | 'storeCurrentUrl'
  | 'storeAttributeValue'
  | 'storeInputValue'
  // Wait
  | 'wait'
  | 'waitForSelector'
  | 'waitForUrl'
  | 'waitForVisible'
  | 'waitForHidden'
  | 'waitForNetworkIdle'
  | 'waitForResponse'
  // Mouse
  | 'mouseMove'
  | 'mouseClick'
  | 'mouseWheel'
  // Keyboard
  | 'keyPress'
  | 'keyDown'
  | 'keyUp'
  | 'keyCombination'
  // File
  | 'uploadFile'
  | 'downloadFile'
  // Dialog
  | 'acceptDialog'
  | 'dismissDialog'
  | 'handlePrompt'
  // Frame/iFrame
  | 'switchToFrame'
  | 'switchToMainFrame'
  // Storage
  | 'getCookie'
  | 'setCookie'
  | 'clearCookies'
  | 'setLocalStorage'
  | 'clearLocalStorage'
  // Screenshot
  | 'screenshot'
  | 'elementScreenshot'
  // Visual Regression
  | 'visualRegression'
  | 'visualRegressionElement'
  // Network
  | 'apiRequest'
  | 'mockResponse'
  | 'interceptRequest'
  // Browser
  | 'newTab'
  | 'closeTab'
  | 'switchTab';

export interface ActionDefinition {
  type: ActionType;
  label: string;
  description: string;
  category: ActionCategory;
  icon: string;
  requiresSelector: boolean;
  requiresValue: boolean;
  valueLabel?: string;
  valuePlaceholder?: string;
  extraFields?: {
    name: string;
    label: string;
    type: 'text' | 'number' | 'select' | 'checkbox';
    placeholder?: string;
    options?: { value: string; label: string }[];
    required?: boolean;
  }[];
}

export const ACTION_CATEGORIES: { id: ActionCategory; label: string; icon: string }[] = [
  { id: 'navigation', label: 'Navigation', icon: '🌐' },
  { id: 'interaction', label: 'Click & Interaction', icon: '👆' },
  { id: 'input', label: 'Input & Forms', icon: '⌨️' },
  { id: 'assertion', label: 'Assertions', icon: '✓' },
  { id: 'variable', label: 'Store Variables', icon: '📦' },
  { id: 'wait', label: 'Wait Actions', icon: '⏱️' },
  { id: 'mouse', label: 'Mouse Actions', icon: '🖱️' },
  { id: 'keyboard', label: 'Keyboard Actions', icon: '⌨️' },
  { id: 'file', label: 'File Actions', icon: '📁' },
  { id: 'dialog', label: 'Dialog Handling', icon: '💬' },
  { id: 'frame', label: 'Frames/iFrames', icon: '🖼️' },
  { id: 'storage', label: 'Cookies & Storage', icon: '🗄️' },
  { id: 'screenshot', label: 'Screenshots', icon: '📸' },
  { id: 'network', label: 'Network/API', icon: '🌍' },
  { id: 'browser', label: 'Browser/Tabs', icon: '🪟' },
];

export const ACTIONS: ActionDefinition[] = [
  // Navigation Actions
  {
    type: 'navigate',
    label: 'Navigate to URL',
    description: 'Go to a specific URL',
    category: 'navigation',
    icon: '🌐',
    requiresSelector: false,
    requiresValue: true,
    valueLabel: 'URL',
    valuePlaceholder: 'https://example.com',
  },
  {
    type: 'reload',
    label: 'Reload Page',
    description: 'Refresh the current page',
    category: 'navigation',
    icon: '🔄',
    requiresSelector: false,
    requiresValue: false,
  },
  {
    type: 'goBack',
    label: 'Go Back',
    description: 'Navigate to the previous page',
    category: 'navigation',
    icon: '⬅️',
    requiresSelector: false,
    requiresValue: false,
  },
  {
    type: 'goForward',
    label: 'Go Forward',
    description: 'Navigate to the next page',
    category: 'navigation',
    icon: '➡️',
    requiresSelector: false,
    requiresValue: false,
  },
  {
    type: 'setViewport',
    label: 'Set Viewport Size',
    description: 'Set the browser viewport dimensions',
    category: 'navigation',
    icon: '📐',
    requiresSelector: false,
    requiresValue: false,
    extraFields: [
      { name: 'width', label: 'Width (px)', type: 'number', placeholder: '1920', required: true },
      { name: 'height', label: 'Height (px)', type: 'number', placeholder: '1080', required: true },
    ],
  },

  // Interaction - Click Actions
  {
    type: 'click',
    label: 'Click Element',
    description: 'Single click on an element',
    category: 'interaction',
    icon: '👆',
    requiresSelector: true,
    requiresValue: false,
  },
  {
    type: 'doubleClick',
    label: 'Double Click',
    description: 'Double click on an element',
    category: 'interaction',
    icon: '👆👆',
    requiresSelector: true,
    requiresValue: false,
  },
  {
    type: 'rightClick',
    label: 'Right Click',
    description: 'Right click (context menu) on an element',
    category: 'interaction',
    icon: '🖱️',
    requiresSelector: true,
    requiresValue: false,
  },
  {
    type: 'tripleClick',
    label: 'Triple Click',
    description: 'Triple click to select text',
    category: 'interaction',
    icon: '👆👆👆',
    requiresSelector: true,
    requiresValue: false,
  },
  {
    type: 'hover',
    label: 'Hover Over Element',
    description: 'Move mouse over an element',
    category: 'interaction',
    icon: '🎯',
    requiresSelector: true,
    requiresValue: false,
  },
  {
    type: 'focus',
    label: 'Focus Element',
    description: 'Focus on an element',
    category: 'interaction',
    icon: '🎯',
    requiresSelector: true,
    requiresValue: false,
  },
  {
    type: 'dragDrop',
    label: 'Drag and Drop',
    description: 'Drag element to another element',
    category: 'interaction',
    icon: '↔️',
    requiresSelector: true,
    requiresValue: true,
    valueLabel: 'Target Selector',
    valuePlaceholder: '#drop-zone',
  },

  // Input Actions
  {
    type: 'type',
    label: 'Type Text',
    description: 'Type text character by character',
    category: 'input',
    icon: '⌨️',
    requiresSelector: true,
    requiresValue: true,
    valueLabel: 'Text to Type',
    valuePlaceholder: 'Enter text...',
  },
  {
    type: 'fill',
    label: 'Fill Input',
    description: 'Fill an input field instantly',
    category: 'input',
    icon: '📝',
    requiresSelector: true,
    requiresValue: true,
    valueLabel: 'Value',
    valuePlaceholder: 'Enter value...',
  },
  {
    type: 'clear',
    label: 'Clear Input',
    description: 'Clear the input field content',
    category: 'input',
    icon: '🗑️',
    requiresSelector: true,
    requiresValue: false,
  },
  {
    type: 'pressKey',
    label: 'Press Key',
    description: 'Press a specific key',
    category: 'input',
    icon: '⏎',
    requiresSelector: false,
    requiresValue: true,
    valueLabel: 'Key',
    valuePlaceholder: 'Enter, Tab, Escape, ArrowDown...',
  },
  {
    type: 'check',
    label: 'Check Checkbox',
    description: 'Check a checkbox',
    category: 'input',
    icon: '☑️',
    requiresSelector: true,
    requiresValue: false,
  },
  {
    type: 'uncheck',
    label: 'Uncheck Checkbox',
    description: 'Uncheck a checkbox',
    category: 'input',
    icon: '☐',
    requiresSelector: true,
    requiresValue: false,
  },
  {
    type: 'selectOption',
    label: 'Select Dropdown Option',
    description: 'Select an option from a dropdown',
    category: 'input',
    icon: '📋',
    requiresSelector: true,
    requiresValue: true,
    valueLabel: 'Option Value/Text',
    valuePlaceholder: 'Option value or text...',
    extraFields: [
      {
        name: 'selectBy',
        label: 'Select By',
        type: 'select',
        options: [
          { value: 'value', label: 'By Value' },
          { value: 'label', label: 'By Label Text' },
          { value: 'index', label: 'By Index' },
        ],
      },
    ],
  },

  // Assertion Actions
  {
    type: 'verify',
    label: 'Verify Element Exists',
    description: 'Verify an element exists on the page',
    category: 'assertion',
    icon: '✓',
    requiresSelector: true,
    requiresValue: false,
  },
  {
    type: 'verifyVisible',
    label: 'Verify Element Visible',
    description: 'Verify an element is visible',
    category: 'assertion',
    icon: '👁️',
    requiresSelector: true,
    requiresValue: false,
  },
  {
    type: 'verifyHidden',
    label: 'Verify Element Hidden',
    description: 'Verify an element is hidden',
    category: 'assertion',
    icon: '🙈',
    requiresSelector: true,
    requiresValue: false,
  },
  {
    type: 'verifyEnabled',
    label: 'Verify Element Enabled',
    description: 'Verify an element is enabled',
    category: 'assertion',
    icon: '✅',
    requiresSelector: true,
    requiresValue: false,
  },
  {
    type: 'verifyDisabled',
    label: 'Verify Element Disabled',
    description: 'Verify an element is disabled',
    category: 'assertion',
    icon: '🚫',
    requiresSelector: true,
    requiresValue: false,
  },
  {
    type: 'verifyText',
    label: 'Verify Text Content',
    description: 'Verify element contains specific text',
    category: 'assertion',
    icon: '📄',
    requiresSelector: true,
    requiresValue: true,
    valueLabel: 'Expected Text',
    valuePlaceholder: 'Text to verify...',
  },
  {
    type: 'verifyAttribute',
    label: 'Verify Attribute',
    description: 'Verify element attribute value',
    category: 'assertion',
    icon: '🏷️',
    requiresSelector: true,
    requiresValue: true,
    valueLabel: 'Expected Value',
    valuePlaceholder: 'Attribute value...',
    extraFields: [
      { name: 'attribute', label: 'Attribute Name', type: 'text', placeholder: 'href, class, data-id...', required: true },
    ],
  },
  {
    type: 'verifyValue',
    label: 'Verify Input Value',
    description: 'Verify input field value',
    category: 'assertion',
    icon: '📊',
    requiresSelector: true,
    requiresValue: true,
    valueLabel: 'Expected Value',
    valuePlaceholder: 'Input value...',
  },
  {
    type: 'verifyUrl',
    label: 'Verify URL',
    description: 'Verify current page URL',
    category: 'assertion',
    icon: '🔗',
    requiresSelector: false,
    requiresValue: true,
    valueLabel: 'Expected URL (or pattern)',
    valuePlaceholder: 'https://example.com/path',
  },
  {
    type: 'verifyTitle',
    label: 'Verify Page Title',
    description: 'Verify page title',
    category: 'assertion',
    icon: '📰',
    requiresSelector: false,
    requiresValue: true,
    valueLabel: 'Expected Title',
    valuePlaceholder: 'Page title...',
  },

  // Store Variable Actions
  {
    type: 'storeElementValue',
    label: 'Store Element Text',
    description: 'Get element text content and store in a variable',
    category: 'variable',
    icon: '📦',
    requiresSelector: true,
    requiresValue: true,
    valueLabel: 'Variable Name',
    valuePlaceholder: 'myVariable',
  },
  {
    type: 'storePageTitle',
    label: 'Store Page Title',
    description: 'Get current page title and store in a variable',
    category: 'variable',
    icon: '📰',
    requiresSelector: false,
    requiresValue: true,
    valueLabel: 'Variable Name',
    valuePlaceholder: 'pageTitleVar',
  },
  {
    type: 'storeCurrentUrl',
    label: 'Store Current URL',
    description: 'Get current page URL and store in a variable',
    category: 'variable',
    icon: '🔗',
    requiresSelector: false,
    requiresValue: true,
    valueLabel: 'Variable Name',
    valuePlaceholder: 'currentUrlVar',
  },
  {
    type: 'storeAttributeValue',
    label: 'Store Attribute Value',
    description: 'Get element attribute value and store in a variable',
    category: 'variable',
    icon: '🏷️',
    requiresSelector: true,
    requiresValue: true,
    valueLabel: 'Variable Name',
    valuePlaceholder: 'attrValueVar',
    extraFields: [
      { name: 'attribute', label: 'Attribute Name', type: 'text', placeholder: 'href, data-id, class...', required: true },
    ],
  },
  {
    type: 'storeInputValue',
    label: 'Store Input Value',
    description: 'Get input field value and store in a variable',
    category: 'variable',
    icon: '📝',
    requiresSelector: true,
    requiresValue: true,
    valueLabel: 'Variable Name',
    valuePlaceholder: 'inputValueVar',
  },

  // Wait Actions
  {
    type: 'wait',
    label: 'Wait (Fixed Time)',
    description: 'Wait for a specific duration',
    category: 'wait',
    icon: '⏱️',
    requiresSelector: false,
    requiresValue: true,
    valueLabel: 'Duration (ms)',
    valuePlaceholder: '1000',
  },
  {
    type: 'waitForSelector',
    label: 'Wait for Element',
    description: 'Wait for element to appear',
    category: 'wait',
    icon: '⏳',
    requiresSelector: true,
    requiresValue: false,
    extraFields: [
      { name: 'timeout', label: 'Timeout (ms)', type: 'number', placeholder: '30000' },
    ],
  },
  {
    type: 'waitForUrl',
    label: 'Wait for URL',
    description: 'Wait for URL to match pattern',
    category: 'wait',
    icon: '🔗',
    requiresSelector: false,
    requiresValue: true,
    valueLabel: 'URL Pattern',
    valuePlaceholder: '**/success',
  },
  {
    type: 'waitForVisible',
    label: 'Wait for Visible',
    description: 'Wait for element to be visible',
    category: 'wait',
    icon: '👁️',
    requiresSelector: true,
    requiresValue: false,
  },
  {
    type: 'waitForHidden',
    label: 'Wait for Hidden',
    description: 'Wait for element to be hidden',
    category: 'wait',
    icon: '🙈',
    requiresSelector: true,
    requiresValue: false,
  },
  {
    type: 'waitForNetworkIdle',
    label: 'Wait for Network Idle',
    description: 'Wait until no network requests',
    category: 'wait',
    icon: '🌐',
    requiresSelector: false,
    requiresValue: false,
  },
  {
    type: 'waitForResponse',
    label: 'Wait for API Response',
    description: 'Wait for specific API response',
    category: 'wait',
    icon: '📡',
    requiresSelector: false,
    requiresValue: true,
    valueLabel: 'URL Pattern',
    valuePlaceholder: '**/api/users',
  },

  // Mouse Actions
  {
    type: 'mouseMove',
    label: 'Move Mouse',
    description: 'Move mouse to coordinates',
    category: 'mouse',
    icon: '🖱️',
    requiresSelector: false,
    requiresValue: false,
    extraFields: [
      { name: 'x', label: 'X Coordinate', type: 'number', placeholder: '100', required: true },
      { name: 'y', label: 'Y Coordinate', type: 'number', placeholder: '200', required: true },
    ],
  },
  {
    type: 'mouseClick',
    label: 'Mouse Click at Position',
    description: 'Click at specific coordinates',
    category: 'mouse',
    icon: '🎯',
    requiresSelector: false,
    requiresValue: false,
    extraFields: [
      { name: 'x', label: 'X Coordinate', type: 'number', placeholder: '100', required: true },
      { name: 'y', label: 'Y Coordinate', type: 'number', placeholder: '200', required: true },
      {
        name: 'button',
        label: 'Mouse Button',
        type: 'select',
        options: [
          { value: 'left', label: 'Left' },
          { value: 'right', label: 'Right' },
          { value: 'middle', label: 'Middle' },
        ],
      },
    ],
  },
  {
    type: 'mouseWheel',
    label: 'Scroll with Mouse Wheel',
    description: 'Scroll using mouse wheel',
    category: 'mouse',
    icon: '🔄',
    requiresSelector: false,
    requiresValue: false,
    extraFields: [
      { name: 'deltaX', label: 'Horizontal Scroll', type: 'number', placeholder: '0' },
      { name: 'deltaY', label: 'Vertical Scroll', type: 'number', placeholder: '100', required: true },
    ],
  },

  // Keyboard Actions
  {
    type: 'keyPress',
    label: 'Key Press',
    description: 'Press and release a key',
    category: 'keyboard',
    icon: '⌨️',
    requiresSelector: false,
    requiresValue: true,
    valueLabel: 'Key',
    valuePlaceholder: 'Enter, Tab, a, A...',
  },
  {
    type: 'keyDown',
    label: 'Key Down',
    description: 'Press and hold a key',
    category: 'keyboard',
    icon: '⬇️',
    requiresSelector: false,
    requiresValue: true,
    valueLabel: 'Key',
    valuePlaceholder: 'Control, Shift, Alt...',
  },
  {
    type: 'keyUp',
    label: 'Key Up',
    description: 'Release a held key',
    category: 'keyboard',
    icon: '⬆️',
    requiresSelector: false,
    requiresValue: true,
    valueLabel: 'Key',
    valuePlaceholder: 'Control, Shift, Alt...',
  },
  {
    type: 'keyCombination',
    label: 'Key Combination',
    description: 'Press multiple keys together (Ctrl+C)',
    category: 'keyboard',
    icon: '🎹',
    requiresSelector: false,
    requiresValue: true,
    valueLabel: 'Key Combination',
    valuePlaceholder: 'Control+Shift+P',
  },

  // File Actions
  {
    type: 'uploadFile',
    label: 'Upload File',
    description: 'Upload a file to input',
    category: 'file',
    icon: '📤',
    requiresSelector: true,
    requiresValue: true,
    valueLabel: 'File Path',
    valuePlaceholder: '/path/to/file.pdf',
  },
  {
    type: 'downloadFile',
    label: 'Download File',
    description: 'Click to download and wait for file',
    category: 'file',
    icon: '📥',
    requiresSelector: true,
    requiresValue: false,
  },

  // Dialog Actions
  {
    type: 'acceptDialog',
    label: 'Accept Dialog',
    description: 'Accept alert/confirm dialog',
    category: 'dialog',
    icon: '✅',
    requiresSelector: false,
    requiresValue: false,
  },
  {
    type: 'dismissDialog',
    label: 'Dismiss Dialog',
    description: 'Dismiss/cancel dialog',
    category: 'dialog',
    icon: '❌',
    requiresSelector: false,
    requiresValue: false,
  },
  {
    type: 'handlePrompt',
    label: 'Handle Prompt Dialog',
    description: 'Enter text in prompt dialog',
    category: 'dialog',
    icon: '💬',
    requiresSelector: false,
    requiresValue: true,
    valueLabel: 'Prompt Text',
    valuePlaceholder: 'Text to enter in prompt...',
  },

  // Frame Actions
  {
    type: 'switchToFrame',
    label: 'Switch to Frame',
    description: 'Switch context to an iframe',
    category: 'frame',
    icon: '🖼️',
    requiresSelector: true,
    requiresValue: false,
  },
  {
    type: 'switchToMainFrame',
    label: 'Switch to Main Frame',
    description: 'Return to main page from iframe',
    category: 'frame',
    icon: '🏠',
    requiresSelector: false,
    requiresValue: false,
  },

  // Storage Actions
  {
    type: 'getCookie',
    label: 'Get Cookie',
    description: 'Get cookie value (logged)',
    category: 'storage',
    icon: '🍪',
    requiresSelector: false,
    requiresValue: true,
    valueLabel: 'Cookie Name',
    valuePlaceholder: 'session_id',
  },
  {
    type: 'setCookie',
    label: 'Set Cookie',
    description: 'Set a cookie value',
    category: 'storage',
    icon: '🍪',
    requiresSelector: false,
    requiresValue: true,
    valueLabel: 'Cookie Value',
    valuePlaceholder: 'cookie_value',
    extraFields: [
      { name: 'cookieName', label: 'Cookie Name', type: 'text', placeholder: 'session_id', required: true },
      { name: 'domain', label: 'Domain', type: 'text', placeholder: '.example.com' },
    ],
  },
  {
    type: 'clearCookies',
    label: 'Clear All Cookies',
    description: 'Clear all browser cookies',
    category: 'storage',
    icon: '🗑️',
    requiresSelector: false,
    requiresValue: false,
  },
  {
    type: 'setLocalStorage',
    label: 'Set Local Storage',
    description: 'Set a localStorage item',
    category: 'storage',
    icon: '💾',
    requiresSelector: false,
    requiresValue: true,
    valueLabel: 'Value',
    valuePlaceholder: 'Storage value',
    extraFields: [
      { name: 'storageKey', label: 'Key', type: 'text', placeholder: 'user_token', required: true },
    ],
  },
  {
    type: 'clearLocalStorage',
    label: 'Clear Local Storage',
    description: 'Clear all localStorage',
    category: 'storage',
    icon: '🗑️',
    requiresSelector: false,
    requiresValue: false,
  },

  // Screenshot Actions
  {
    type: 'screenshot',
    label: 'Take Full Page Screenshot',
    description: 'Capture full page screenshot',
    category: 'screenshot',
    icon: '📸',
    requiresSelector: false,
    requiresValue: false,
  },
  {
    type: 'elementScreenshot',
    label: 'Take Element Screenshot',
    description: 'Capture specific element',
    category: 'screenshot',
    icon: '🎯',
    requiresSelector: true,
    requiresValue: false,
  },
  {
    type: 'visualRegression',
    label: 'Visual Regression (Full Page)',
    description: 'Compare full page screenshot against baseline',
    category: 'screenshot',
    icon: '🔍',
    requiresSelector: false,
    requiresValue: true,
    valueLabel: 'Baseline Name',
    valuePlaceholder: 'homepage-baseline',
    extraFields: [
      { name: 'threshold', label: 'Threshold (%)', type: 'number', placeholder: '10' },
    ],
  },
  {
    type: 'visualRegressionElement',
    label: 'Visual Regression (Element)',
    description: 'Compare element screenshot against baseline',
    category: 'screenshot',
    icon: '🔎',
    requiresSelector: true,
    requiresValue: true,
    valueLabel: 'Baseline Name',
    valuePlaceholder: 'button-baseline',
    extraFields: [
      { name: 'threshold', label: 'Threshold (%)', type: 'number', placeholder: '10' },
    ],
  },

  // Network Actions
  {
    type: 'apiRequest',
    label: 'Make API Request',
    description: 'Send HTTP request',
    category: 'network',
    icon: '🌍',
    requiresSelector: false,
    requiresValue: true,
    valueLabel: 'URL',
    valuePlaceholder: 'https://api.example.com/users',
    extraFields: [
      {
        name: 'method',
        label: 'HTTP Method',
        type: 'select',
        options: [
          { value: 'GET', label: 'GET' },
          { value: 'POST', label: 'POST' },
          { value: 'PUT', label: 'PUT' },
          { value: 'DELETE', label: 'DELETE' },
          { value: 'PATCH', label: 'PATCH' },
        ],
        required: true,
      },
      { name: 'body', label: 'Request Body (JSON)', type: 'text', placeholder: '{"key": "value"}' },
      { name: 'headers', label: 'Headers (JSON)', type: 'text', placeholder: '{"Authorization": "Bearer ..."}' },
    ],
  },
  {
    type: 'mockResponse',
    label: 'Mock API Response',
    description: 'Intercept and mock API response',
    category: 'network',
    icon: '🎭',
    requiresSelector: false,
    requiresValue: true,
    valueLabel: 'URL Pattern',
    valuePlaceholder: '**/api/users',
    extraFields: [
      { name: 'statusCode', label: 'Status Code', type: 'number', placeholder: '200', required: true },
      { name: 'responseBody', label: 'Response Body (JSON)', type: 'text', placeholder: '{"data": []}', required: true },
    ],
  },
  {
    type: 'interceptRequest',
    label: 'Intercept Request',
    description: 'Block or modify requests',
    category: 'network',
    icon: '🛑',
    requiresSelector: false,
    requiresValue: true,
    valueLabel: 'URL Pattern',
    valuePlaceholder: '**/tracking/**',
    extraFields: [
      {
        name: 'action',
        label: 'Action',
        type: 'select',
        options: [
          { value: 'block', label: 'Block Request' },
          { value: 'continue', label: 'Continue' },
        ],
        required: true,
      },
    ],
  },

  // Browser/Tab Actions
  {
    type: 'newTab',
    label: 'Open New Tab',
    description: 'Open a new browser tab',
    category: 'browser',
    icon: '➕',
    requiresSelector: false,
    requiresValue: true,
    valueLabel: 'URL',
    valuePlaceholder: 'https://example.com',
  },
  {
    type: 'closeTab',
    label: 'Close Current Tab',
    description: 'Close the current tab',
    category: 'browser',
    icon: '❌',
    requiresSelector: false,
    requiresValue: false,
  },
  {
    type: 'switchTab',
    label: 'Switch to Tab',
    description: 'Switch to another tab by index',
    category: 'browser',
    icon: '🔀',
    requiresSelector: false,
    requiresValue: true,
    valueLabel: 'Tab Index',
    valuePlaceholder: '0 (first tab), 1 (second tab)...',
  },
];

export const getActionsByCategory = (category: ActionCategory): ActionDefinition[] => {
  return ACTIONS.filter(action => action.category === category);
};

export const getActionDefinition = (type: ActionType): ActionDefinition | undefined => {
  return ACTIONS.find(action => action.type === type);
};

export const getActionIcon = (type: ActionType): string => {
  const action = getActionDefinition(type);
  return action?.icon || '❓';
};

export const getActionLabel = (type: ActionType): string => {
  const action = getActionDefinition(type);
  return action?.label || type;
};
