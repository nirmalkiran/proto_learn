# Mobile No-Code Automation Module

This module provides Android mobile testing capabilities using Appium, integrated into the TestCraft AI platform.

## Features

- **Record & Playback**: Build test flows by recording actions or adding them manually
- **Locator Finder/Inspector**: Inspect UI hierarchy and generate robust XPath/ID locators
- **Terminal**: Execute ADB and Appium commands directly
- **Test Generator**: Generate tests from natural language prompts

## Architecture

```
src/modules/mobileAutomation/
├── index.tsx              # Main module entry with tabs
├── MobileRecorder.tsx     # Record/playback UI
├── MobileInspector.tsx    # UI hierarchy inspector
├── MobileTerminal.tsx     # ADB/Appium terminal
├── MobileTestGenerator.tsx # Prompt-based test generation
└── README.md              # This file
```

## Local Backend Setup

The mobile automation features require a local backend server to interface with Appium and connected devices.

### Prerequisites

1. **Node.js** (v18+)
2. **Appium** - `npm install -g appium`
3. **UiAutomator2 Driver** - `appium driver install uiautomator2`
4. **Android SDK** - Install via Android Studio
5. **Android Device/Emulator** - Connected via ADB

### Backend Server Setup

1. Create a new folder for the backend:
   ```bash
   mkdir mobile-automation-backend
   cd mobile-automation-backend
   ```

2. Initialize and install dependencies:
   ```bash
   npm init -y
   npm install express cors axios
   ```

3. Copy the server file from `public/backend/server.js` to this folder

4. Start the server:
   ```bash
   node server.js
   ```

5. The server runs at `http://localhost:3001`

### Starting Appium

```bash
appium --port 4723
```

### Connecting a Device

```bash
# List connected devices
adb devices

# For emulator, start from Android Studio or:
emulator -avd <avd_name>
```

## Usage

### Record & Playback

1. Navigate to the "Recorder" tab
2. Add actions manually or load a sample flow
3. Export as JSON or JavaScript Appium script
4. Run playback (requires backend connection)

### Locator Finder

1. Navigate to the "Inspector" tab
2. Click "Load Hierarchy" to fetch the current UI tree
3. Click any element to see suggested locators
4. Copy locators for use in your tests

### Terminal

1. Navigate to the "Terminal" tab
2. Run `connect` to test backend connection
3. Execute ADB commands: `adb devices`, `adb shell ...`
4. Execute Appium commands: `appium:status`, `appium:session`

### Test Generator

1. Navigate to the "Generator" tab
2. Enter a natural language prompt (e.g., "Login with email user@test.com")
3. The system matches your prompt to a template
4. Download the generated test script

## API Endpoints (Backend)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/terminal` | POST | Execute ADB/Appium commands |
| `/api/session/create` | POST | Create Appium session |
| `/api/session` | DELETE | End Appium session |
| `/api/hierarchy` | GET | Get UI hierarchy |
| `/api/playback` | POST | Execute recorded actions |

## Security Notes

- The backend only allows `adb` and `appium` command prefixes
- All execution happens locally - no cloud services required
- No credentials are stored or transmitted

## Troubleshooting

### Backend Not Connecting
- Ensure server is running on port 3001
- Check CORS settings if using different ports

### Appium Not Responding
- Verify Appium is running: `curl http://localhost:4723/status`
- Check that UiAutomator2 driver is installed

### Device Not Found
- Run `adb devices` to verify connection
- Restart ADB: `adb kill-server && adb start-server`
