# WISPR Mobile Agent (Node.js + Appium/ADB)

Purpose: A dedicated mobile agent that heartbeats to WISPR and runs mobile tests via Appium/ADB. This package excludes Selenium/Playwright/Performance files.

## Prerequisites
- Node.js 18+
- Appium 2.x (global): `npm i -g appium`
- Appium drivers for your target (e.g., `appium driver install uiautomator2`)
- ADB in PATH and a device/emulator connected

## How to get your WISPR_API_TOKEN
1) In WISPR UI: **Self-Hosted Agents → Register New Agent → Mobile Agent**.
2) Enter Agent Name/ID, click **Register Agent**, and copy the token shown (it’s displayed only once).
3) When you download the Mobile Agent ZIP, this token is injected automatically. If you redownload later, it will inject the latest token from the UI.

## Quick Start
1) Install deps
```bash
npm install
```
2) Set env (only the token is required if API_BASE_URL is already set in the ZIP):
```bash
export WISPR_API_TOKEN="paste-token-from-registration"   # required if not already injected
export API_BASE_URL="https://<your-project>.supabase.co/functions/v1/agent-api"  # optional override
export APPIUM_HOST="127.0.0.1"
export APPIUM_PORT="4723"
export DEVICE_NAME="emulator-5554"
export PLATFORM_NAME="Android"
```
3) Run
```bash
node mobile-agent.js
```
4) In WISPR → Self-Hosted Agents, confirm the Mobile Agent shows online, then trigger a mobile job.

## Files
- `mobile-agent.js` – heartbeats, polls, and stubs job execution (hook in your Appium code).
- `package.json` – minimal Node setup.
- `Dockerfile` – containerized run option.

## Customize Execution
Edit `executeJob` inside `mobile-agent.js` to:
- Start Appium session with your desired capabilities.
- Execute steps from `job.steps`.
- Capture screenshots/video and attach in the result payload.

## Docker (optional)
```
docker build -t wispr-mobile-agent .
docker run --network host \
  -e WISPR_API_TOKEN="paste-token-from-registration" \
  -e API_BASE_URL="https://<your-project>.supabase.co/functions/v1/agent-api" \
  -e APPIUM_HOST=host.docker.internal \
  -e APPIUM_PORT=4723 \
  wispr-mobile-agent
```

## Troubleshooting
- “Invalid JWT” → redeploy `agent-api` with `verify_jwt=false`, or ensure a valid token is sent.
- Agent stays offline → check `WISPR_API_TOKEN`, reachability to `API_BASE_URL`, and Appium/device availability.
