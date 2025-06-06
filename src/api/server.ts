import express from 'express';
import cors from 'cors';
import { MultiLLMMCPClient } from '../core/multi-llm-mcp-client.js';
import { Logger } from '../utils/logger.js';
import { LLMConfig, MCPServerConfig, ChatMessage } from '../types/index.js';
import { ConfigManager } from './config-manager.js';

export class MCPApiServer {
  private app: express.Application;
  private client: MultiLLMMCPClient;
  private logger: Logger;
  private configManager: ConfigManager;
  private isInitialized: boolean = false;

  constructor(private port: number = 3001) {
    this.app = express();
    this.logger = new Logger();
    this.client = new MultiLLMMCPClient(this.logger);
    this.configManager = new ConfigManager(this.logger);
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // CORS - Allow all localhost origins for development
    this.app.use(cors({
      origin: function (origin, callback) {
        console.log('CORS Origin check:', origin);
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        // Allow all localhost origins
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
          return callback(null, true);
        }

        // Allow chrome extensions
        if (origin.startsWith('chrome-extension://')) {
          return callback(null, true);
        }

        // For development, allow all origins (you can restrict this in production)
        return callback(null, true);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'X-Requested-With', 'Accept'],
      optionsSuccessStatus: 200
    }));

    this.app.use(express.json({ limit: '10mb' }));

    // API key validation middleware
    this.app.use('/api', (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid authorization header' });
      }

      const token = authHeader.substring(7);
      if (!this.configManager.validateApiToken(token)) {
        return res.status(401).json({ error: 'Invalid API token' });
      }

      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', initialized: this.isInitialized });
    });

    // Generate new API token
    this.app.post('/generate-token', (req, res) => {
      const newToken = this.configManager.generateNewAuthToken();
      res.json({ token: newToken });
    });

    // Initialize the MCP client
    this.app.post('/api/initialize', async (req, res) => {
      try {
        await this.initializeClient();
        res.json({ success: true, message: 'MCP client initialized' });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Get available providers
    this.app.get('/api/providers', (req, res) => {
      const providers = this.client.getAvailableProviders();
      res.json({ providers });
    });

    // Get available tools
    this.app.get('/api/tools', async (req, res) => {
      try {
        const tools = await this.client.getAllTools();
        // Mark all backend tools as such
        const backendTools = tools.map(tool => ({
          ...tool,
          context: 'backend'
        }));
        res.json({ tools: backendTools });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Get tools by context (backend/frontend)
    this.app.get('/api/tools/:context', async (req, res) => {
      try {
        const { context } = req.params;

        if (context === 'backend') {
          const tools = await this.client.getAllTools();
          const backendTools = tools.map(tool => ({
            ...tool,
            context: 'backend'
          }));
          res.json({ tools: backendTools, context: 'backend' });
        } else if (context === 'frontend') {
          // Frontend tools are managed by the client
          res.json({
            tools: [],
            context: 'frontend',
            message: 'Frontend tools are managed by the client-side MCP servers'
          });
        } else {
          res.status(400).json({ error: 'Invalid context. Use "backend" or "frontend"' });
        }
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Chat endpoint
    this.app.post('/api/chat', async (req, res) => {
      try {
        const { provider, messages, includeTools = true } = req.body;

        if (!provider || !messages) {
          return res.status(400).json({ error: 'Provider and messages are required' });
        }

        const response = await this.client.chat(provider, messages, includeTools);
        res.json(response);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Execute tool call
    this.app.post('/api/tools/execute', async (req, res) => {
      try {
        const { name, arguments: args } = req.body;

        if (!name || !args) {
          return res.status(400).json({ error: 'Tool name and arguments are required' });
        }

        const result = await this.client.executeToolCall(name, args);
        res.json({ result });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Configuration endpoints
    this.app.get('/api/config/providers', async (req, res) => {
      try {
        const providers = await this.configManager.getProviders();
        // Remove API keys from response
        const safeProviders = providers.map(p => ({
          name: p.name,
          provider: p.config.provider,
          model: p.config.model,
          hasApiKey: !!p.config.apiKey
        }));
        res.json({ providers: safeProviders });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    this.app.post('/api/config/providers', async (req, res) => {
      try {
        const { name, config } = req.body;
        await this.configManager.addProvider(name, config);
        await this.client.addLLMProvider(name, config);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    this.app.get('/api/config/servers', async (req, res) => {
      try {
        const servers = await this.configManager.getServers();
        res.json({ servers });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    this.app.post('/api/config/servers', async (req, res) => {
      try {
        const serverConfig: MCPServerConfig = req.body;
        await this.configManager.addServer(serverConfig);
        await this.client.addMCPServer(serverConfig);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });
  }

  private async initializeClient(): Promise<void> {
    try {
      // Load configurations
      const providers = await this.configManager.getProviders();
      const servers = await this.configManager.getServers();

      // Add providers
      for (const { name, config } of providers) {
        try {
          await this.client.addLLMProvider(name, config);
          this.logger.info(`✓ Added provider: ${name}`);
        } catch (error) {
          this.logger.error(`✗ Failed to add provider: ${name}`, error as Error);
        }
      }

      // Add MCP servers
      for (const serverConfig of servers) {
        try {
          await this.client.addMCPServer(serverConfig);
          this.logger.info(`✓ Connected to MCP server: ${serverConfig.name}`);
        } catch (error) {
          this.logger.error(`✗ Failed to connect to MCP server: ${serverConfig.name}`, error as Error);
        }
      }

      this.isInitialized = true;
    } catch (error) {
      this.logger.error('Failed to initialize client', error as Error);
      throw error;
    }
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.port, 'localhost', () => {
        this.logger.info(`🚀 MCP API Server running on http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    await this.client.disconnect();
  }
} 