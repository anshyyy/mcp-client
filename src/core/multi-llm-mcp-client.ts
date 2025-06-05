import { LLMProviderFactory } from "../factories/llm-provider.factory.js";
import { ILLMProvider } from "../interfaces/llm_provider.interface.js";
import { ILogger } from "../interfaces/logger.interface.js";
import { IMCPClient } from "../interfaces/mcp_client.interface.js";
import { MCPClient } from "../mcp/mcp_client.js";
import { ChatMessage, LLMConfig, LLMResponse, MCPServerConfig, MCPTool } from "../types/index.js";

export class MultiLLMMCPClient {
  private readonly llmProviders = new Map<string, ILLMProvider>();
  private readonly mcpClients = new Map<string, IMCPClient>();
  private readonly llmFactory: LLMProviderFactory;

  constructor(private readonly logger: ILogger) {
    this.llmFactory = new LLMProviderFactory(logger);
  }

  async addLLMProvider(name: string, config: LLMConfig): Promise<void> {
    const provider = this.llmFactory.create(config);
    this.llmProviders.set(name, provider);
    this.logger.info(`Added LLM provider: ${name}`, { provider: config.provider, model: config.model });
  }

  async addMCPServer(config: MCPServerConfig): Promise<void> {
    const client = new MCPClient(config, this.logger);
    await client.connect();
    this.mcpClients.set(config.name, client);
    this.logger.info(`Added MCP server: ${config.name}`);
  }

  async chat(
    providerName: string,
    messages: readonly ChatMessage[],
    includeTools = true
  ): Promise<LLMResponse> {
    const provider = this.llmProviders.get(providerName);
    if (!provider) {
      throw new Error(`LLM provider not found: ${providerName}`);
    }

    let tools: MCPTool[] = [];
    if (includeTools) {
      tools = await this.getAllTools();
    }

    const formattedTools = provider.formatTools(tools);
    return provider.chatCompletion(messages, formattedTools);
  }

  async executeToolCall(name: string, arguments_: Record<string, unknown>): Promise<unknown> {
    for (const [serverName, client] of this.mcpClients) {
      try {
        const tools = await client.listTools();
        const tool = tools.find(t => t.name === name);
        if (tool) {
          this.logger.info(`Executing tool: ${name} on server: ${serverName}`);
          return await client.callTool(name, arguments_);
        }
      } catch (error) {
        this.logger.error(`Failed to execute tool on server: ${serverName}`, error as Error);
      }
    }
    
    throw new Error(`Tool not found: ${name}`);
  }

  async getAllTools(): Promise<MCPTool[]> {
    const allTools: MCPTool[] = [];
    
    for (const [serverName, client] of this.mcpClients) {
      try {
        const tools = await client.listTools();
        allTools.push(...tools);
      } catch (error) {
        this.logger.error(`Failed to list tools from server: ${serverName}`, error as Error);
      }
    }
    
    return allTools;
  }

  async disconnect(): Promise<void> {
    const disconnectPromises: Promise<void>[] = [];
    
    for (const client of this.mcpClients.values()) {
      disconnectPromises.push(client.disconnect());
    }
    
    await Promise.allSettled(disconnectPromises);
    this.mcpClients.clear();
    this.logger.info('Disconnected all MCP clients');
  }

  getAvailableProviders(): string[] {
    return Array.from(this.llmProviders.keys());
  }

  getConnectedServers(): string[] {
    return Array.from(this.mcpClients.keys());
  }
}