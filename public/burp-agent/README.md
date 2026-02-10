# Burp Suite Self-Hosted Agent

This agent connects your local Burp Suite Professional instance to the platform for orchestrated security testing.

## Prerequisites

1. **Burp Suite Professional** (v2024.1 or later)
2. **Node.js** 18+ or **Bun** runtime
3. Burp Suite REST API enabled

## Enabling Burp Suite REST API

1. Open Burp Suite Professional
2. Go to **Settings** → **Suite** → **REST API**
3. Enable the REST API
4. Set the port (default: 1337)
5. Generate an API key and save it securely
6. Optionally enable TLS for secure communication

## Installation

```bash
# Clone or copy this folder to your machine
cd burp-agent

# Install dependencies
npm install
# or
bun install
```

## Configuration

Create a `.env` file with your settings:

```env
# Platform Connection
SUPABASE_URL=https://lghzmijzfpvrcvogxpew.supabase.co
SUPABASE_ANON_KEY=your_anon_key

# Agent Configuration
AGENT_ID=your_agent_id
PROJECT_ID=your_project_id
AGENT_TOKEN=your_agent_token

# Burp Suite Connection
BURP_API_URL=http://127.0.0.1:1337
BURP_API_KEY=your_burp_api_key

# Optional: Polling intervals (seconds)
POLL_INTERVAL=5
HEARTBEAT_INTERVAL=30
```

## Running the Agent

```bash
# Start the agent
npm start
# or
bun run agent.js
```

## Agent Capabilities

The agent supports:

- **Traffic Interception**: Proxy HTTP/HTTPS/WebSocket traffic
- **Crawling**: Automatic attack surface discovery
- **Passive Scanning**: Continuous passive vulnerability detection
- **Active Scanning**: Targeted active vulnerability testing
- **DOM Analysis**: Client-side JavaScript security testing
- **Intruder Attacks**: Fuzzing and brute-force testing
- **OAST (Collaborator)**: Out-of-band vulnerability detection
- **Report Generation**: HTML, JSON, SARIF outputs

## Security Considerations

- Store API keys securely (use environment variables, never commit)
- Run the agent on a secure network
- Enable TLS for Burp REST API in production
- Review scope restrictions before scanning
- Never run destructive tests on production systems without approval

## Architecture

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   Platform UI   │◄────►│  Supabase Edge   │◄────►│  Burp Agent     │
│  (Browser)      │      │  Functions       │      │  (This Script)  │
└─────────────────┘      └──────────────────┘      └────────┬────────┘
                                                            │
                                                            ▼
                                                   ┌─────────────────┐
                                                   │  Burp Suite     │
                                                   │  Professional   │
                                                   │  (REST API)     │
                                                   └─────────────────┘
```

## Troubleshooting

### Agent won't connect
- Verify Burp Suite is running with REST API enabled
- Check firewall rules
- Verify API key is correct

### Scans not starting
- Check agent status in the platform
- Verify project membership
- Review scan configuration

### Missing vulnerabilities
- Increase crawl depth
- Enable active scanning
- Check scope configuration

## Support

For issues and feature requests, contact your platform administrator.
