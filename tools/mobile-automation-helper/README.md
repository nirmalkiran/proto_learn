# Mobile Automation Helper

A local Node.js server that provides mobile automation capabilities for Android devices/emulators.

## Features

- **Device Recording**: Capture touch events (taps, swipes) with coordinates and element locators
- **Device Mirroring**: Launch scrcpy for real-time device screen mirroring  
- **UI Element Detection**: Automatically extract element locators using UI Automator
- **Script Generation**: Generate Appium WebDriverIO test scripts from recorded actions
- **Appium Integration**: Start Appium server and launch Appium Inspector

## Prerequisites

Ensure the following are installed and available in PATH:

1. **Node.js** (v18+)
2. **Android SDK** with:
   - ADB (platform-tools)
   - Android Emulator
3. **Appium** (`npm install -g appium`)
4. **scrcpy** (for device mirroring)

Set environment variables:
```bash
export ANDROID_SDK_ROOT=/path/to/android/sdk
# or
export ANDROID_HOME=/path/to/android/sdk
```

## Installation

```bash
cd tools/mobile-automation-helper
npm install
```

## Usage

### Start the Server

```bash
npm start
# or
npm run server
```

The server runs on `http://localhost:3001`

### API Endpoints

#### Health & Status

- `GET /health` - Server health check
- `GET /appium/status` - Check if Appium is running
- `GET /emulator/status` - Check running emulators
- `GET /device/check` - Check connected devices
- `GET /device/info` - Get device information (model, Android version, screen size)

#### Recording

- `POST /recording/start` - Start recording touch events
- `POST /recording/stop` - Stop recording (returns captured steps)
- `GET /recording/status` - Get current recording status
- `GET /recording/steps` - Get all recorded steps
- `GET /recording/events` - SSE endpoint for real-time events
- `POST /recording/replay` - Replay recorded steps

#### Device Control

- `POST /device/mirror` - Launch scrcpy device mirror
- `POST /device/screenshot` - Capture device screenshot
- `POST /terminal` - Execute ADB/Appium commands

#### Tools

- `POST /appium/inspector` - Launch Appium Inspector
- `POST /agent/start` - Start the recording agent

## How Recording Works

1. **Touch Event Capture**: Uses `adb shell getevent` to capture raw touch events
2. **Coordinate Mapping**: Converts raw touch coordinates to screen coordinates
3. **Element Detection**: Uses `uiautomator dump` to get UI hierarchy and find elements
4. **Locator Generation**: Generates XPath locators from element attributes (resource-id, text, content-desc)

### Captured Information

For each touch action, the following is captured:

- **Action Type**: tap, scroll (swipe), input
- **Coordinates**: Screen position (x, y)
- **Element Locator**: XPath selector for the touched element
- **Description**: Human-readable description

## Generated Script Format

```javascript
describe("Recorded Mobile Test", () => {
  it("should replay recorded steps", async () => {
    // Step 1: Tap on "Login"
    await driver.touchAction({ action: 'tap', x: 540, y: 1200 });

    // Step 2: Swipe up
    await driver.touchAction([
      { action: 'press', x: 540, y: 1800 },
      { action: 'moveTo', x: 540, y: 600 },
      { action: 'release' }
    ]);
  });
});
```

## Troubleshooting

### No events captured during recording

1. **Check ADB connection**: Run `adb devices` to verify device is connected
2. **Check event device**: The default is `/dev/input/event4`. You may need to find the correct input device:
   ```bash
   adb shell getevent -l
   ```
   Touch the screen and note which device receives events.

3. **Enable USB debugging**: Make sure USB debugging is enabled on the device

### scrcpy not working

1. Install scrcpy: https://github.com/Genymobile/scrcpy
2. Ensure it's in your PATH
3. Check device connection with `adb devices`

### Appium issues

1. Verify Appium is installed: `appium --version`
2. Install required drivers:
   ```bash
   appium driver install uiautomator2
   ```

## Architecture

```
mobile-automation-helper/
├── server.js           # Express server with API endpoints
├── agent/
│   ├── mobile-agent.js # Core recording logic
│   ├── prereq-check.js # Prerequisites verification
│   └── start-agent.js  # Agent entry point
├── screenshots/        # Captured screenshots
└── package.json
```

## Integration with Lovable

The web app connects to this local server at `http://localhost:3001`. The MobileRecorder component:

1. Establishes SSE connection to `/recording/events`
2. Receives real-time touch events during recording
3. Displays captured actions with locators
4. Generates downloadable test scripts
