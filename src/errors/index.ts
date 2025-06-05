export class MCPClientError extends Error {
    constructor(message: string, public readonly cause?: Error) {
      super(message);
      this.name = 'MCPClientError';
    }
  }
  
  export class LLMProviderError extends Error {
    constructor(message: string, public readonly provider: string, public readonly cause?: Error) {
      super(message);
      this.name = 'LLMProviderError';
    }
  }
  
  export class ValidationError extends Error {
    constructor(message: string, public readonly field: string) {
      super(message);
      this.name = 'ValidationError';
    }
  }