import { ChatMessage, LLMResponse, MCPTool, Tool } from "../types/index.js";

export interface ILLMProvider {
    chatCompletion(
      messages: readonly ChatMessage[],
      tools?: readonly Tool[]
    ): Promise<LLMResponse>;
    
    formatTools(mcpTools: readonly MCPTool[]): readonly Tool[];
  }