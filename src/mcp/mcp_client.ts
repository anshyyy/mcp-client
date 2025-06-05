import { spawn, ChildProcess } from 'child_process';
import { IMCPClient } from '../interfaces/mcp_client.interface.js';
import { MCPServerConfig, MCPTool } from '../types/index.js';
import { ILogger } from '../interfaces/logger.interface.js';
import { MCPClientError } from '../errors/index.js';

export class MCPClient implements IMCPClient {
  private process?: ChildProcess;
  private connected = false;
  private messageId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();

  constructor(
    private readonly config: MCPServerConfig,
    private readonly logger: ILogger
  ) {}

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      this.logger.info(`Connecting to MCP server: ${this.config.name}`);
      
      this.process = spawn(this.config.command, this.config.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...this.config.env },
      });

      this.process.on('error', (error) => {
        this.logger.error(`MCP server process error: ${this.config.name}`, error);
        this.connected = false;
      });

      this.process.on('exit', (code) => {
        this.logger.info(`MCP server exited: ${this.config.name}`, { code });
        this.connected = false;
      });

      if (this.process.stdout) {
        this.process.stdout.on('data', (data) => {
          this.handleMessage(data.toString());
        });
      }

      // Initialize connection
      await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {
          roots: { listChanged: true },
          sampling: {},
        },
        clientInfo: {
          name: 'multi-llm-mcp-client',
          version: '1.0.0',
        },
      });

      this.connected = true;
      this.logger.info(`Connected to MCP server: ${this.config.name}`);
    } catch (error) {
      throw new MCPClientError(
        `Failed to connect to MCP server: ${this.config.name}`,
        error as Error
      );
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected || !this.process) {
      return;
    }

    this.logger.info(`Disconnecting from MCP server: ${this.config.name}`);
    
    this.process.kill();
    this.connected = false;
    this.pendingRequests.clear();
  }

  async listTools(): Promise<readonly MCPTool[]> {
    if (!this.connected) {
      throw new MCPClientError('Not connected to MCP server');
    }

    const response = await this.sendRequest('tools/list', {}) as {
      tools: Array<{
        name: string;
        description: string;
        inputSchema: Record<string, unknown>;
      }>;
    };

    return response.tools;
  }

  async callTool(name: string, arguments_: Record<string, unknown>): Promise<unknown> {
    if (!this.connected) {
      throw new MCPClientError('Not connected to MCP server');
    }

    return this.sendRequest('tools/call', {
      name,
      arguments: arguments_,
    });
  }

  isConnected(): boolean {
    return this.connected;
  }

  private async sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      const message = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      this.pendingRequests.set(id, { resolve, reject });

      if (this.process?.stdin) {
        this.process.stdin.write(JSON.stringify(message) + '\n');
      } else {
        reject(new MCPClientError('No stdin available'));
      }

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new MCPClientError('Request timeout'));
        }
      }, 30000);
    });
  }

  private handleMessage(data: string): void {
    try {
      const lines = data.trim().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        
        const message = JSON.parse(line);
        
        if (message.id && this.pendingRequests.has(message.id)) {
          const { resolve, reject } = this.pendingRequests.get(message.id)!;
          this.pendingRequests.delete(message.id);
          
          if (message.error) {
            reject(new MCPClientError(message.error.message));
          } else {
            resolve(message.result);
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to parse MCP message', error as Error, { data });
    }
  }
}