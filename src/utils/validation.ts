import { z } from 'zod';

export const LLMConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'google']),
  model: z.string().min(1),
  apiKey: z.string().min(1),
  baseUrl: z.string().url().optional(),
  maxTokens: z.number().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export const MCPServerConfigSchema = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()),
  env: z.record(z.string()).optional(),
});

export const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  toolCalls: z.array(z.object({
    id: z.string(),
    type: z.literal('function'),
    function: z.object({
      name: z.string(),
      arguments: z.string(),
    }),
  })).optional(),
  toolCallId: z.string().optional(),
});