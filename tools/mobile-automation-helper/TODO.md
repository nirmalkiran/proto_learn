# TODO: Implement One-Tap Start for Mobile Automation Helper

## Steps to Complete

- [x] Add process state variables in server.js to track running processes (emulator, appium, agent).
- [x] Add helper functions for checking service statuses and starting services if not running.
- [x] Implement POST /setup/auto endpoint to start missing services (emulator, appium, agent).
- [x] Implement GET /setup/status endpoint to aggregate and return status of all services.
- [x] Improve Android Emulator detection and startup (added multiple SDK paths, AVD listing, better status checking).
- [x] Create standalone launcher scripts (start-everything.bat, launcher.js) for complete automation.
- [x] Add proper error handling for when server is not running, with clear user instructions.
- [ ] Verify that existing manual startup flows (npm start, npm run agent, etc.) still work.
- [ ] Test one-tap start to ensure no crashes or duplicate processes.
- [ ] Confirm cross-platform compatibility (Windows PowerShell, macOS, Linux).
