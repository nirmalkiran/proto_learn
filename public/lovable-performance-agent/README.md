# WISPR Performance Testing Agent

A self-hosted agent that connects to WISPR platform and executes JMeter performance tests on your local machine.

## Prerequisites

- **Node.js 18+** - Download from [nodejs.org](https://nodejs.org/)
- **Apache JMeter 5.x** - Download from [jmeter.apache.org](https://jmeter.apache.org/download_jmeter.cgi)

## Quick Start

### 1. Download Agent Files

Create a new directory and create the following files:

**Option A - Manual Setup:**

```bash
mkdir wispr-performance-agent
cd wispr-performance-agent
```

Create `package.json`:
```json
{
  "name": "wispr-performance-agent",
  "version": "1.0.0",
  "description": "WISPR Self-Hosted Performance Testing Agent for JMeter execution",
  "main": "run-agent.js",
  "type": "module",
  "scripts": {
    "start": "node run-agent.js"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "dependencies": {}
}
```

Then download `run-agent.js` from your WISPR project's GitHub repository or copy it from the WISPR documentation.

**Option B - Clone from GitHub:**

If your project is connected to GitHub, clone the repository and navigate to `public/lovable-performance-agent/`.

### 2. Install JMeter

Download and extract Apache JMeter:

**Linux/macOS:**
```bash
wget https://dlcdn.apache.org/jmeter/binaries/apache-jmeter-5.6.3.tgz
tar -xzf apache-jmeter-5.6.3.tgz
export JMETER_HOME=$(pwd)/apache-jmeter-5.6.3
export PATH=$JMETER_HOME/bin:$PATH
```

**Windows:**
1. Download the ZIP file from Apache JMeter website
2. Extract to `C:\apache-jmeter`
3. Set environment variable: `JMETER_HOME=C:\apache-jmeter`

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
| `JMETER_HOME` | (auto-detect) | Path to JMeter installation |

## Running with Docker

### Build the Docker image:

```bash
docker build -t wispr-performance-agent .
```

### Run the container:

```bash
docker run -e WISPR_API_TOKEN="your_token" wispr-performance-agent
```

## How It Works

1. **Registration**: When you create a performance agent in WISPR, you receive an API token
2. **Heartbeat**: The agent sends heartbeats every 60 seconds to report its status
3. **Job Polling**: The agent polls for available performance jobs every 10 seconds
4. **Execution**: When a job is found, the agent:
   - Claims the job
   - Decodes the JMX file from base64
   - Executes JMeter in non-GUI mode
   - Collects results (JTL file)
5. **Results**: After execution, results including summary statistics are submitted back to WISPR

## JMeter Configuration

The agent supports the following JMeter properties that can be overridden:

| Property | Description |
|----------|-------------|
| `threads` | Number of virtual users (thread count) |
| `rampup` | Ramp-up period in seconds |
| `duration` | Test duration in seconds |

Your JMX file should use these properties for dynamic configuration:
```xml
<ThreadGroup>
  <stringProp name="ThreadGroup.num_threads">${__P(threads,10)}</stringProp>
  <stringProp name="ThreadGroup.ramp_time">${__P(rampup,30)}</stringProp>
  <boolProp name="ThreadGroup.scheduler">true</boolProp>
  <stringProp name="ThreadGroup.duration">${__P(duration,60)}</stringProp>
</ThreadGroup>
```

## Troubleshooting

### Agent shows "offline" in WISPR

1. Check that your API token is correct
2. Verify the agent is running (`npm start`)
3. Check network connectivity to the WISPR API

### JMeter not found

1. Install Apache JMeter from the official website
2. Set the `JMETER_HOME` environment variable
3. Or add JMeter's `bin` directory to your `PATH`

### Tests failing unexpectedly

1. Check the JMX file is valid
2. Verify target URLs are accessible from the agent machine
3. Check the agent logs for detailed error messages

## Logs

The agent logs all activity to the console with timestamps:

```
[2024-01-15T10:30:00.000Z] [INFO] WISPR Performance Testing Agent Starting...
[2024-01-15T10:30:00.100Z] [INFO] JMeter found: /opt/apache-jmeter/bin/jmeter
[2024-01-15T10:30:00.200Z] [DEBUG] Heartbeat sent successfully
[2024-01-15T10:30:05.300Z] [INFO] Found 1 available performance job(s)
[2024-01-15T10:30:05.400Z] [INFO] Performance job abc123 claimed successfully
[2024-01-15T10:30:05.500Z] [INFO] Starting JMeter test
```

## Support

For issues and feature requests, contact your WISPR administrator.
