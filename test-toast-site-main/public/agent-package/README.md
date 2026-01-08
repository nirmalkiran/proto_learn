# WISPR Self-Hosted Test Execution Agent

A self-hosted agent that connects to WISPR platform and executes automated tests on your local machine using Playwright.

## Prerequisites

- **Node.js 18+** - Download from [nodejs.org](https://nodejs.org/)
- **npm** - Comes with Node.js

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

This will install Playwright and download browser binaries.

### 2. Install Playwright Browsers

```bash
npx playwright install chromium
```

Optional: Install additional browsers:
```bash
npx playwright install firefox webkit
```

### 3. Configure Your API Token

Set your WISPR agent API token:

**Linux/macOS:**
```bash
export WISPR_API_TOKEN="your_api_token_here"
```

**Windows (PowerShell):**
```powershell
$env:WISPR_API_TOKEN="your_api_token_here"
```

**Windows (Command Prompt):**
```cmd
set WISPR_API_TOKEN=your_api_token_here
```

### 4. Start the Agent

```bash
npm start
```

## Configuration

You can configure the agent using environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `WISPR_API_TOKEN` | (required) | Your agent API token from WISPR |
| `HEADLESS` | `true` | Run browser in headless mode (`true`/`false`) |

## Running with Docker

### Build the Docker image:

```bash
docker build -t wispr-agent .
```

### Run the container:

```bash
docker run -e WISPR_API_TOKEN="your_token" wispr-agent
```

## How It Works

1. **Registration**: When you create an agent in WISPR, you receive an API token
2. **Heartbeat**: The agent sends heartbeats every 30 seconds to report its status
3. **Job Polling**: The agent polls for available test jobs every 5 seconds
4. **Execution**: When a job is found, the agent claims it and executes the test steps using Playwright
5. **Results**: After execution, results (including screenshots) are submitted back to WISPR

## Supported Step Types

The agent supports the following no-code test step types:

| Step Type | Description |
|-----------|-------------|
| `goto` / `navigate` | Navigate to a URL |
| `click` | Click on an element |
| `type` / `fill` | Enter text into an input |
| `press` | Press a keyboard key |
| `wait` | Wait for a specified time |
| `waitForSelector` | Wait for an element to appear |
| `screenshot` | Capture a screenshot |
| `select` | Select an option from a dropdown |
| `check` / `uncheck` | Toggle a checkbox |
| `hover` | Hover over an element |
| `scrollTo` | Scroll to an element or position |
| `assertText` | Verify text content |
| `assertVisible` | Verify element visibility |
| `assertUrl` | Verify current URL |
| `evaluate` | Execute custom JavaScript |

## Troubleshooting

### Agent shows "offline" in WISPR

1. Check that your API token is correct
2. Verify the agent is running (`npm start`)
3. Check network connectivity to the WISPR API

### Browser not launching

Run Playwright browser installation:
```bash
npx playwright install chromium --with-deps
```

### Tests failing unexpectedly

1. Run with visible browser: `HEADLESS=false npm start`
2. Check the step selectors are correct
3. Increase wait times for slow-loading pages

## Logs

The agent logs all activity to the console with timestamps:

```
[2024-01-15T10:30:00.000Z] [INFO] WISPR Self-Hosted Agent Starting...
[2024-01-15T10:30:00.100Z] [DEBUG] Heartbeat sent successfully
[2024-01-15T10:30:05.200Z] [INFO] Found 1 available job(s)
[2024-01-15T10:30:05.300Z] [INFO] Job abc123 claimed successfully
```

## Support

For issues and feature requests, contact your WISPR administrator.
