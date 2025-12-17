# Mobile Automation Control Panel

A web-based control panel for Android mobile automation using Appium.

## Features

- **Terminal Panel**: Execute ADB and Appium commands
- **Record & Playback**: Build and run automated test sequences
- **Locator Finder**: Inspect UI hierarchy and generate locators
- **Test Generator**: Create tests from natural language prompts
- **Configuration**: Manage capabilities and environment settings

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Web Control Panel                     │
│              (React + Tailwind - Lovable)               │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTP (localhost:3001)
┌─────────────────────▼───────────────────────────────────┐
│                   Backend Server                         │
│                (Node.js + Express)                       │
└─────────────────────┬───────────────────────────────────┘
                      │
          ┌───────────┴───────────┐
          │                       │
┌─────────▼─────────┐   ┌────────▼────────┐
│   Appium Server   │   │       ADB       │
│   (localhost:4723)│   │    (CLI tool)   │
└─────────┬─────────┘   └────────┬────────┘
          │                      │
          └──────────┬───────────┘
                     │
          ┌──────────▼──────────┐
          │   Android Device    │
          │  (Emulator/Physical)│
          └─────────────────────┘
```

## Quick Start

### Prerequisites Checklist

- [ ] Java JDK 11+ (`java -version`)
- [ ] Android SDK with platform-tools (`echo $ANDROID_HOME`)
- [ ] Node.js 18+ (`node --version`)
- [ ] Appium 2.x (`npm install -g appium`)
- [ ] UIAutomator2 driver (`appium driver install uiautomator2`)

### 1. Start Android Emulator

```bash
# List available AVDs
emulator -list-avds

# Start emulator
emulator -avd Pixel_6_API_33 &

# Verify device connected
adb devices
```

### 2. Start Appium Server

```bash
appium --port 4723 --allow-cors
```

### 3. Start Backend Server

```bash
# Copy backend files to local project
mkdir -p backend
cp public/backend/* backend/

# Install dependencies
cd backend
npm install

# Start server
node server.js
# Server runs on http://localhost:3001
```

### 4. Use Web Control Panel

Open the Lovable app in browser and navigate through:
- `/` - Dashboard
- `/terminal` - Execute commands
- `/recorder` - Build test sequences
- `/inspector` - Find locators
- `/generator` - Generate tests from prompts
- `/config` - Setup and configuration

## API Endpoints

### Backend Server (localhost:3001)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Server health check |
| `/api/terminal` | POST | Execute ADB/Appium commands |
| `/api/session/create` | POST | Create Appium session |
| `/api/session` | DELETE | End Appium session |
| `/api/hierarchy` | GET | Get UI hierarchy |
| `/api/playback` | POST | Run recorded actions |

### Sample cURL Commands

```bash
# Check health
curl http://localhost:3001/api/health

# Execute ADB command
curl -X POST http://localhost:3001/api/terminal \
  -H "Content-Type: application/json" \
  -d '{"command": "adb devices"}'

# Create Appium session
curl -X POST http://localhost:3001/api/session/create \
  -H "Content-Type: application/json" \
  -d '{"capabilities": {"appium:app": "/path/to/app.apk"}}'

# Get UI hierarchy
curl http://localhost:3001/api/hierarchy

# Run playback
curl -X POST http://localhost:3001/api/playback \
  -H "Content-Type: application/json" \
  -d @samples/recorded_login.json
```

## Useful ADB Commands

```bash
# Device management
adb devices                              # List devices
adb -s emulator-5554 shell              # Open shell

# App management
adb install app.apk                      # Install APK
adb uninstall com.example.app           # Uninstall app
adb shell pm list packages | grep app   # Find package
adb shell dumpsys window | grep Focus   # Get current activity

# UI inspection
adb shell uiautomator dump              # Dump UI hierarchy
adb pull /sdcard/window_dump.xml        # Pull to local
adb shell screencap /sdcard/screen.png  # Screenshot
adb pull /sdcard/screen.png             # Pull screenshot

# Get app info
aapt dump badging app.apk               # Package/activity info
```

## Recorded Action JSON Format

```json
{
  "metadata": {
    "name": "Test Name",
    "recorded": "2024-01-15T10:30:00Z"
  },
  "actions": [
    {
      "type": "tap",
      "locator": "//android.widget.Button[@text='Login']"
    },
    {
      "type": "input",
      "locator": "//android.widget.EditText[@resource-id='email']",
      "value": "test@example.com"
    },
    {
      "type": "wait",
      "duration": 2000
    },
    {
      "type": "assert",
      "locator": "//android.widget.TextView[@text='Welcome']"
    },
    {
      "type": "swipe",
      "direction": "up"
    }
  ]
}
```

## CI/CD Integration

See `ci/github-actions.yml` for a complete GitHub Actions workflow that:
- Sets up Android emulator
- Installs Appium
- Runs mobile tests
- Uploads test artifacts

## Credit Optimization Plan

This framework is designed to minimize API/LLM credit usage:

1. **One-time generation**: All templates and code generated in single response
2. **Local templates**: Test generator uses local pattern matching, no API calls
3. **Offline-first**: All recording, playback, and inspection work offline
4. **Template reuse**: Modify generated templates locally without regeneration

## Project Structure

```
mobile-automation/
├── src/
│   └── pages/
│       ├── Dashboard.tsx      # Main control panel
│       ├── TerminalPanel.tsx  # Command execution
│       ├── Recorder.tsx       # Record & playback
│       ├── Inspector.tsx      # UI hierarchy viewer
│       ├── TestGenerator.tsx  # Prompt-based generation
│       └── Config.tsx         # Configuration
├── public/
│   ├── backend/
│   │   ├── server.js          # Express backend
│   │   └── package.json
│   ├── samples/
│   │   ├── recorded_login.json
│   │   └── login_test.spec.js
│   └── ci/
│       └── github-actions.yml
└── README.md
```

## Troubleshooting

### Emulator not detected
```bash
adb kill-server
adb start-server
adb devices
```

### Appium connection failed
```bash
# Check Appium status
curl http://localhost:4723/status

# Restart with verbose logging
appium --port 4723 --allow-cors --log-level debug
```

### Element not found
1. Use Inspector to verify locator
2. Add explicit wait before interaction
3. Try alternative locator strategy (ID > accessibility > xpath)

## Future Enhancements

- [ ] Visual element selector (click-to-locate)
- [ ] Real-time device mirroring
- [ ] Test result history and analytics
- [ ] LLM-powered smart locator suggestions
- [ ] Multi-device parallel execution
- [ ] Cloud device farm integration
