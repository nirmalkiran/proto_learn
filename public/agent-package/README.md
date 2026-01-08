# Agent Package

A comprehensive AI-powered agent package for automated testing, analysis, and reporting in software development workflows.

## Features

- **Automated Test Execution**: Run tests across multiple environments and frameworks
- **Data Analysis**: Intelligent analysis of test results and performance metrics
- **Report Generation**: Automated generation of detailed test and performance reports
- **Real-time Monitoring**: Live tracking of test execution and system health
- **Event-driven Architecture**: Extensible event system for custom integrations
- **Docker Support**: Containerized deployment for easy scaling

## Installation

### Using npm
```bash
npm install agent-package
```

### Using Docker
```bash
docker pull wispr/agent-package
docker run -p 3000:3000 wispr/agent-package
```

## Usage

### Basic Setup

```javascript
const AgentPackage = require('agent-package');

const agent = new AgentPackage({
  apiUrl: 'https://your-api-endpoint.com',
  timeout: 30000,
  retries: 3
});

// Initialize the agent
await agent.initialize();

// Execute a test task
const result = await agent.executeTask('test_execution', {
  testSuite: 'regression',
  environment: 'staging'
});

console.log('Test result:', result);
```

### Advanced Usage

```javascript
// Listen to events
agent.on('task:complete', (data) => {
  console.log('Task completed:', data.taskId);
});

agent.on('error', (error) => {
  console.error('Agent error:', error);
});

// Execute multiple tasks
const tasks = [
  { id: 'test_execution', params: { suite: 'smoke' } },
  { id: 'data_analysis', params: { type: 'performance' } },
  { id: 'report_generation', params: { format: 'pdf' } }
];

for (const task of tasks) {
  await agent.executeTask(task.id, task.params);
}
```

## API Reference

### AgentPackage Class

#### Constructor Options
- `apiUrl` (string): Backend API endpoint URL
- `timeout` (number): Request timeout in milliseconds (default: 30000)
- `retries` (number): Number of retry attempts (default: 3)

#### Methods

##### `initialize()`
Initializes the agent and establishes connection to backend services.

##### `executeTask(taskId, parameters)`
Executes a specific task with given parameters.

**Parameters:**
- `taskId` (string): Identifier for the task type
- `parameters` (object): Task-specific parameters

**Returns:** Promise resolving to task result

##### `getTaskStatus(taskId)`
Retrieves the status of a specific task.

##### `getAllTasks()`
Returns all active and completed tasks.

##### `on(event, callback)`
Registers an event listener.

##### `destroy()`
Cleans up resources and destroys the agent instance.

## Supported Task Types

- `test_execution`: Execute automated tests
- `data_analysis`: Analyze test data and metrics
- `report_generation`: Generate reports and documentation

## Events

- `task:start`: Emitted when a task begins execution
- `task:complete`: Emitted when a task completes successfully
- `task:error`: Emitted when a task encounters an error
- `error`: Emitted for general agent errors

## Configuration

Create a configuration file or pass options to the constructor:

```javascript
const config = {
  apiUrl: process.env.API_URL,
  timeout: 45000,
  retries: 5,
  customOptions: {
    // Additional configuration
  }
};

const agent = new AgentPackage(config);
```

## Development

### Prerequisites
- Node.js 18+
- Docker (for containerized development)

### Setup
```bash
git clone https://github.com/wispr/agent-package.git
cd agent-package
npm install
```

### Running Tests
```bash
npm test
```

### Building
```bash
npm run build
```

### Docker Development
```bash
docker build -t agent-package .
docker run -p 3000:3000 agent-package
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

For support and questions:
- GitHub Issues: [Create an issue](https://github.com/wispr/agent-package/issues)
- Documentation: [Full API Docs](https://docs.wispr.ai/agent-package)
- Community: [Discord Server](https://discord.gg/wispr)

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and updates.
