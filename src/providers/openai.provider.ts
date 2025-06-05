import OpenAI from 'openai';
import { ILogger } from '../interfaces/logger.interface.js';
import { ILLMProvider } from '../interfaces/llm_provider.interface.js';
import { LLMConfig, LLMResponse, Tool } from '../types/index.js';
import { LLMProviderError } from '../errors/index.js';
import { ChatMessage } from '../types/index.js';
import { MCPTool } from '../types/index.js';

export class OpenAIProvider implements ILLMProvider {
  private readonly client: OpenAI;

  constructor(
    private readonly config: LLMConfig,
    private readonly logger: ILogger
  ) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
  }

  async chatCompletion(
    messages: readonly ChatMessage[],
    tools?: readonly Tool[]
  ): Promise<LLMResponse> {
    try {
      this.logger.debug('OpenAI chat completion request', {
        model: this.config.model,
        messageCount: messages.length,
        toolCount: tools?.length ?? 0,
      });

      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: messages.map(msg => {
          const baseMessage: any = {
            role: msg.role,
            content: msg.content,
          };
          
          if (msg.toolCalls) {
            baseMessage.tool_calls = msg.toolCalls;
          }
          
          if (msg.toolCallId) {
            baseMessage.tool_call_id = msg.toolCallId;
          }
          
          return baseMessage;
        }),
        tools: tools ? [...tools] : undefined,
        tool_choice: tools ? 'auto' : undefined,
        temperature: this.config.temperature ?? 0.7,
        max_tokens: this.config.maxTokens,
      });

      const choice = response.choices[0];
      if (!choice) {
        throw new LLMProviderError('No response from OpenAI', 'openai');
      }

      return {
        content: choice.message.content ?? '',
        toolCalls: choice.message.tool_calls?.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })),
        finishReason: this.mapFinishReason(choice.finish_reason),
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        } : undefined,
      };
    } catch (error) {
      this.logger.error('OpenAI chat completion failed', error as Error);
      throw new LLMProviderError(
        `OpenAI request failed: ${(error as Error).message}`,
        'openai',
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

  private mapFinishReason(reason: string | null): LLMResponse['finishReason'] {
    switch (reason) {
      case 'stop': return 'stop';
      case 'length': return 'length';
      case 'tool_calls': return 'tool_calls';
      case 'content_filter': return 'content_filter';
      default: return 'stop';
    }
  }
}