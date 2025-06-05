import Anthropic from '@anthropic-ai/sdk';
import { LLMResponse, MCPTool, Tool } from '../types/index.js';
import { ILogger } from '../interfaces/logger.interface.js';
import { ILLMProvider } from '../interfaces/llm_provider.interface.js';
import { ChatMessage } from '../types/index.js';
import { LLMConfig } from '../types/index.js';
import { LLMProviderError } from '../errors/index.js';


export class AnthropicProvider implements ILLMProvider {
  private readonly client: Anthropic;

  constructor(
    private readonly config: LLMConfig,
    private readonly logger: ILogger
  ) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
  }

  async chatCompletion(
    messages: readonly ChatMessage[],
    tools?: readonly Tool[]
  ): Promise<LLMResponse> {
    try {
      this.logger.debug('Anthropic chat completion request', {
        model: this.config.model,
        messageCount: messages.length,
        toolCount: tools?.length ?? 0,
      });

      const systemMessage = messages.find(m => m.role === 'system');
      const conversationMessages = messages.filter(m => m.role !== 'system');

      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens ?? 1024,
        temperature: this.config.temperature ?? 0.7,
        system: systemMessage?.content,
        messages: conversationMessages.map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
        tools: tools ? this.formatAnthropicTools(tools) : undefined,
      });

      const content = response.content[0];
      if (content?.type !== 'text') {
        throw new LLMProviderError('Unexpected response format from Anthropic', 'anthropic');
      }

      return {
        content: content.text,
        finishReason: this.mapFinishReason(response.stop_reason),
        usage: response.usage ? {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        } : undefined,
      };
    } catch (error) {
      this.logger.error('Anthropic chat completion failed', error as Error);
      throw new LLMProviderError(
        `Anthropic request failed: ${(error as Error).message}`,
        'anthropic',
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

  private formatAnthropicTools(tools: readonly Tool[]) {
    return tools.map(tool => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: {
        type: 'object' as const,
        ...tool.function.parameters,
      },
    }));
  }

  private mapFinishReason(reason: string | null): LLMResponse['finishReason'] {
    switch (reason) {
      case 'end_turn': return 'stop';
      case 'max_tokens': return 'length';
      case 'stop_sequence': return 'stop';
      default: return 'stop';
    }
  }
}
