# MCP Client Chrome Extension Setup Guide

## Architecture Overview

```
┌─────────────────────────────────────┐
│         Chrome Extension            │
│  ┌─────────────────────────────────┐ │
│  │       Your UI (React/JS)        │ │
│  └─────────────────────────────────┘ │
│  ┌─────────────────────────────────┐ │
│  │     MCPClient.js (API Lib)      │ │
│  └─────────────────────────────────┘ │
└─────────────────────────────────────┘
            │ HTTP Requests
            ▼
┌─────────────────────────────────────┐
│     Local API Server (Node.js)     │
│   ┌─────────────────────────────┐   │
│   │    Express.js API Layer     │   │
│   └─────────────────────────────┘   │
│   ┌─────────────────────────────┐   │
│   │  Your MCP Client Library    │   │
│   └─────────────────────────────┘   │
└─────────────────────────────────────┘
            │ IPC/Child Process
            ▼
┌─────────────────────────────────────┐
│          MCP Servers                │
│  (Filesystem, SQLite, Custom...)    │
└─────────────────────────────────────┘
```

## Security Features

### 🔐 API Key Protection
- **Encrypted Storage**: API keys are encrypted using AES-256-GCM before storage
- **Local-Only**: Keys never leave your machine
- **File Permissions**: Config files have restricted permissions (owner-only)
- **Authentication**: API server uses bearer tokens for authentication

### 🛡️ Network Security
- **Localhost Only**: API server only binds to localhost
- **CORS Protection**: Restricted to Chrome extension origins
- **No External Access**: API keys and data never sent to external servers

## Installation & Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the API Server

```bash
# Development mode (auto-restart)
npm run api:dev

# Production mode
npm run api:start
```

The server will start on `http://localhost:3001` and display:
- Available API endpoints
- 🔑 **Authentication token** (copy this for step 4)

### 3. Configure API Keys (First Time)

The server will look for API keys in these locations:
1. Environment variables (`.env` file)
2. Encrypted configuration files

Create a `.env` file:
```bash
# Optional: API keys (will be encrypted and stored securely)
OPENAI_API_KEY=your_openai_key_here
ANTHROPIC_API_KEY=your_anthropic_key_here
GOOGLE_API_KEY=your_google_key_here

# Optional: Custom API server port
API_PORT=3001
```

### 4. Chrome Extension Integration

#### Copy the Client Library
Copy `chrome-extension-client/mcp-client.js` to your Chrome extension folder.

#### Add to Your Manifest
```json
{
  "host_permissions": [
    "http://localhost:*"
  ],
  "permissions": [
    "storage"
  ]
}
```

#### Basic Usage in Your Extension

```javascript
// In your Chrome extension's popup.js or content script
const mcpClient = new MCPClient();

// Initialize (will load saved auth token)
await mcpClient.initialize();

// Set the auth token (from server startup logs)
mcpClient.setAuthToken('your_token_from_server_logs');

// Simple chat
const result = await mcpClient.simplifiedChat(
  'gemini-pro', 
  'List files in the current directory'
);
console.log(result.response.content);

// Manual chat with tool handling
const response = await mcpClient.chat('gpt-4', [
  { role: 'user', content: 'What files are in /home/user?' }
]);

if (response.toolCalls) {
  const toolResults = await mcpClient.handleToolCalls(response.toolCalls);
  // Handle results...
}
```

## API Endpoints

### Health & Initialization
- `GET /health` - Check server status
- `POST /api/initialize` - Initialize MCP client

### Chat & Tools
- `POST /api/chat` - Send messages to LLM
- `GET /api/tools` - List available MCP tools
- `POST /api/tools/execute` - Execute a specific tool

### Configuration Management
- `GET /api/providers` - List available LLM providers
- `GET /api/config/providers` - Get provider configs (no API keys)
- `POST /api/config/providers` - Add/update provider
- `GET /api/config/servers` - Get MCP server configs
- `POST /api/config/servers` - Add/update MCP server

## Adding New LLM Providers

### Via API (Recommended for Extensions)
```javascript
await mcpClient.addProvider('my-provider', {
  provider: 'openai',
  model: 'gpt-4-turbo',
  apiKey: 'your-api-key',
  temperature: 0.7,
  maxTokens: 4000
});
```

### Via Environment Variables
```bash
# Add to .env file
MY_CUSTOM_OPENAI_KEY=your_key
```

Then update the server configuration to load it.

## Adding New MCP Servers

### Built-in Servers
```javascript
// Filesystem server
await mcpClient.addServer({
  name: 'filesystem',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/directory']
});

// SQLite server
await mcpClient.addServer({
  name: 'sqlite',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-sqlite', './database.db']
});
```

### Custom Servers
```javascript
await mcpClient.addServer({
  name: 'my-custom-server',
  command: 'node',
  args: ['./my-mcp-server.js'],
  env: {
    'CUSTOM_CONFIG': 'value'
  }
});
```

## Chrome Extension Integration Examples

### Simple Chat Interface
```javascript
// popup.js
document.getElementById('send-button').addEventListener('click', async () => {
  const message = document.getElementById('message-input').value;
  const provider = document.getElementById('provider-select').value;
  
  try {
    const result = await mcpClient.simplifiedChat(provider, message);
    displayMessage('Assistant', result.response.content);
  } catch (error) {
    displayError('Error: ' + error.message);
  }
});
```

### Provider Management UI
```javascript
// options.js
async function loadProviders() {
  const { providers } = await mcpClient.getProviderConfigs();
  
  providers.forEach(provider => {
    addProviderToUI(provider.name, provider.model, provider.hasApiKey);
  });
}

async function addNewProvider(name, config) {
  await mcpClient.addProvider(name, config);
  loadProviders(); // Refresh UI
}
```

### Tool Execution with UI Feedback
```javascript
async function chatWithProgress(message) {
  const response = await mcpClient.chat('gpt-4', [
    { role: 'user', content: message }
  ]);
  
  if (response.toolCalls) {
    showStatus('Executing tools...');
    
    for (const toolCall of response.toolCalls) {
      showStatus(`Running ${toolCall.function.name}...`);
      // Tool execution handled automatically by simplifiedChat
    }
    
    const finalResult = await mcpClient.simplifiedChat('gpt-4', message);
    return finalResult.response.content;
  }
  
  return response.content;
}
```

## Troubleshooting

### Common Issues

1. **"MCP API server is not running"**
   - Make sure you started the server with `npm run api:dev`
   - Check if port 3001 is available

2. **"No authentication token found"**
   - Copy the token from server startup logs
   - Use `mcpClient.setAuthToken('your-token')`

3. **"Invalid API token"**
   - Restart the server to generate a new token
   - Update your extension with the new token

4. **CORS errors**
   - Make sure your extension has `http://localhost:*` permissions
   - Check the server logs for CORS configuration

### Debug Mode
Enable detailed logging:
```javascript
// In your extension
mcpClient.debug = true;
```

### Server Logs
The API server provides detailed logs including:
- API requests and responses
- MCP server connections
- Tool executions
- Error details

## File Structure

```
your-project/
├── src/
│   ├── api/
│   │   ├── server.ts          # Express API server
│   │   ├── config-manager.ts  # Encrypted config storage
│   │   └── index.ts          # Server entry point
│   ├── core/
│   │   └── multi-llm-mcp-client.ts  # Your existing MCP client
│   └── ...your existing files
├── chrome-extension-client/
│   └── mcp-client.js         # Chrome extension client library
├── ~/.mcp-client/            # Config directory (auto-created)
│   ├── .key                  # Encryption key
│   ├── providers.json        # Encrypted API keys
│   └── servers.json          # MCP server configs
└── package.json
```

## Next Steps

1. **Start the API server**: `npm run api:dev`
2. **Copy the auth token**: From server startup logs
3. **Integrate with your extension**: Use the provided `MCPClient` class
4. **Configure providers**: Add your API keys securely
5. **Add MCP servers**: Configure the tools you need

The architecture is designed to be:
- **Secure**: API keys encrypted, localhost-only access
- **Scalable**: Easy to add new providers and MCP servers
- **Flexible**: Works with any Chrome extension UI framework
- **Production-Ready**: Proper error handling and logging 