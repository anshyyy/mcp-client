import { GoogleGenerativeAI } from '@google/generative-ai';
import { ILLMProvider } from '../interfaces/llm_provider.interface.js';
import { ILogger } from '../interfaces/logger.interface.js';
import { LLMConfig, LLMResponse, Tool } from '../types/index.js';
import { LLMProviderError } from '../errors/index.js';
import { ChatMessage } from '../types/index.js';
import { MCPTool } from '../types/index.js';


export class GoogleProvider implements ILLMProvider {
  private readonly client: GoogleGenerativeAI;

  constructor(
    private readonly config: LLMConfig,
    private readonly logger: ILogger
  ) {
    this.client = new GoogleGenerativeAI(config.apiKey);
  }

  async chatCompletion(
    messages: readonly ChatMessage[],
    tools?: readonly Tool[]
  ): Promise<LLMResponse> {
    try {
      this.logger.debug('Google chat completion request', {
        model: this.config.model,
        messageCount: messages.length,
        toolCount: tools?.length ?? 0,
      });

      const model = this.client.getGenerativeModel({ 
        model: this.config.model
      });
      
      // Add tool descriptions to the system message if tools are available
      let enhancedMessages = [...messages];
      if (tools && tools.length > 0) {
        const toolDescriptions = this.formatToolsAsPrompt(tools);
        const systemMessage = enhancedMessages.find(m => m.role === 'system');
        if (systemMessage) {
          enhancedMessages = enhancedMessages.map(m => 
            m.role === 'system' 
              ? { ...m, content: `${m.content}\n\n${toolDescriptions}` }
              : m
          );
        } else {
          enhancedMessages = [
            { role: 'system', content: toolDescriptions },
            ...enhancedMessages
          ];
        }
      }
      
      const chat = model.startChat({
        history: enhancedMessages.slice(0, -1).map(msg => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        })),
        generationConfig: {
          temperature: this.config.temperature ?? 0.7,
          maxOutputTokens: this.config.maxTokens,
        },
      });

      const lastMessage = enhancedMessages[enhancedMessages.length - 1];
      if (!lastMessage) {
        throw new LLMProviderError('No messages provided', 'google');
      }

      const result = await chat.sendMessage(lastMessage.content);
      const response = result.response;
      
      return {
        content: response.text(),
        finishReason: 'stop',
        usage: response.usageMetadata ? {
          promptTokens: response.usageMetadata.promptTokenCount ?? 0,
          completionTokens: response.usageMetadata.candidatesTokenCount ?? 0,
          totalTokens: response.usageMetadata.totalTokenCount ?? 0,
        } : undefined,
      };
    } catch (error) {
      this.logger.error('Google chat completion failed', error as Error);
      throw new LLMProviderError(
        `Google request failed: ${(error as Error).message}`,
        'google',
        error as Error
      );
    }
  }

  formatTools(mcpTools: readonly MCPTool[]): readonly Tool[] {
    return mcpTools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }

  private formatToolsAsPrompt(tools: readonly Tool[]): string {
    const toolList = tools.map(tool => 
      `- ${tool.function.name}: ${tool.function.description}`
    ).join('\n');
    
    return `Available tools:\n${toolList}\n\nWhen you need to use a tool, mention it clearly in your response.`;
  }
}
