/**
 * Mobile Automation Agent Configuration
 */

export const CONFIG = {
  // Server configuration
  HOST: 'localhost',
  PORT: 3001,
  AGENT_PORT: 3001,

  // Service ports
  APPIUM_PORT: 4723,
  //AGENT_PORT: 4724,

  // Timeouts and intervals
  HEARTBEAT_INTERVAL: 30000,
  POLL_INTERVAL: 5000,
  STARTUP_TIMEOUT: 30000,
  COMMAND_TIMEOUT: 10000,

  // Capacities
  MAX_CONCURRENT_JOBS: 1,

  // Paths and commands
  APPIUM_COMMAND: process.platform === 'win32' ? 'appium' : 'appium',
  ADB_COMMAND: 'adb',
  EMULATOR_COMMAND: 'emulator',

  // Android SDK paths (auto-detect)
  ANDROID_SDK_PATHS: [
    process.env.ANDROID_SDK_ROOT,
    process.env.ANDROID_HOME,
    process.env.USERPROFILE ? `${process.env.USERPROFILE}\\AppData\\Local\\Android\\Sdk` : null,
    process.env.USERPROFILE ? `${process.env.USERPROFILE}\\android-sdk` : null,
    process.env.USERPROFILE ? `${process.env.USERPROFILE}\\Android\\Sdk` : null,
    'C:\\Android\\Sdk',
    process.env.HOME ? `${process.env.HOME}\\Android\\Sdk` : null,
    process.env.HOME ? `${process.env.HOME}\\Library\\Android\\sdk` : null,
    '/usr/local/share/android-sdk',
    '/opt/android-sdk',
  ].filter(Boolean),

  // Default capabilities
  DEFAULT_CAPABILITIES: {
    platformName: 'Android',
    platformVersion: '11.0',
    automationName: 'UiAutomator2',
    deviceName: 'emulator-5554',
    appPackage: '',
    appActivity: '',
    noReset: true,
    fullReset: false,
  },

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
};

export default CONFIG;
