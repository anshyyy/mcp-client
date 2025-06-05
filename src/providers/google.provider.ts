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

      const model = this.client.getGenerativeModel({ model: this.config.model });
      
      const chat = model.startChat({
        history: messages.slice(0, -1).map(msg => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        })),
        generationConfig: {
          temperature: this.config.temperature ?? 0.7,
          maxOutputTokens: this.config.maxTokens,
        },
      });

      const lastMessage = messages[messages.length - 1];
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
}
