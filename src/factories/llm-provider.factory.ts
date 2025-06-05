import { ValidationError } from "../errors/index.js";
import { ILLMProvider } from "../interfaces/llm_provider.interface.js";
import { ILogger } from "../interfaces/logger.interface.js";
import { AnthropicProvider } from "../providers/anthropic.provider.js";
import { GoogleProvider } from "../providers/google.provider.js";
import { OpenAIProvider } from "../providers/openai.provider.js";
import { LLMConfig } from "../types/index.js";

export class LLMProviderFactory {
  constructor(private readonly logger: ILogger) {}

  create(config: LLMConfig): ILLMProvider {
    switch (config.provider) {
      case 'openai':
        return new OpenAIProvider(config, this.logger);
      case 'anthropic':
        return new AnthropicProvider(config, this.logger);
      case 'google':
        return new GoogleProvider(config, this.logger);
      default:
        throw new ValidationError(
          `Unsupported LLM provider: ${config.provider}`,
          'provider'
        );
    }
  }
}