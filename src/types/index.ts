export interface ChatMessage {
    readonly role: 'user' | 'assistant' | 'system';
    readonly content: string;
    readonly toolCalls?: readonly ToolCall[];
    readonly toolCallId?: string;
  }
  
  export interface ToolCall {
    readonly id: string;
    readonly type: 'function';
    readonly function: {
      readonly name: string;
      readonly arguments: string;
    };
  }
  
  export interface Tool {
    readonly type: 'function';
    readonly function: {
      readonly name: string;
      readonly description: string;
      readonly parameters: Record<string, unknown>;
    };
  }
  
  export interface LLMResponse {
    readonly content: string;
    readonly toolCalls?: readonly ToolCall[];
    readonly finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
    readonly usage?: {
      readonly promptTokens: number;
      readonly completionTokens: number;
      readonly totalTokens: number;
    };
  }
  
  export interface LLMConfig {
    readonly provider: 'openai' | 'anthropic' | 'google';
    readonly model: string;
    readonly apiKey: string;
    readonly baseUrl?: string;
    readonly maxTokens?: number;
    readonly temperature?: number;
  }
  
  export interface MCPServerConfig {
    readonly name: string;
    readonly command: string;
    readonly args: readonly string[];
    readonly env?: Record<string, string>;
  }
  
  export interface MCPTool {
    readonly name: string;
    readonly description: string;
    readonly inputSchema: Record<string, unknown>;
  }