import dotenv from 'dotenv';
import * as readline from 'readline';
import { MultiLLMMCPClient } from './core/multi-llm-mcp-client.js';
import { Logger } from './utils/logger.js';
import { LLMConfig, MCPServerConfig, ChatMessage } from './types/index.js';

dotenv.config();

class InteractiveMCPClient {
    private client: MultiLLMMCPClient;
    private logger: Logger;
    private rl: readline.Interface;
    private conversationHistory: ChatMessage[] = [];
    private currentProvider: string = '';

    constructor() {
        this.logger = new Logger();
        this.client = new MultiLLMMCPClient(this.logger);
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
    }

    async initialize(): Promise<void> {
        // Updated configuration with current model names and better error handling
        const llmConfigs: Record<string, LLMConfig> = {
            // 'gpt-4': {
            //     provider: 'openai',
            //     model: 'gpt-4o',
            //     apiKey: process.env.OPENAI_API_KEY!,
            //     temperature: 0.7,
            //     maxTokens: 4000,
            // },
            // 'claude-3-sonnet': {
            //     provider: 'anthropic',
            //     model: 'claude-3-5-sonnet-20241022',
            //     apiKey: process.env.ANTHROPIC_API_KEY!,
            //     temperature: 0.7,
            //     maxTokens: 4000,
            // },
            // Commenting out Google until API key is fixed
            'gemini-pro': {
                provider: 'google',
                model: 'gemini-1.5-pro',
                apiKey: process.env.GOOGLE_API_KEY!,
                temperature: 0.7,
                maxTokens: 8192,
            },
        };

        const mcpConfigs: MCPServerConfig[] = [
            {
                name: 'filesystem',
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()],
            },
            {
                name: 'sqlite',
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-sqlite', './example.db'],
            },
        ];

        // Add LLM providers with individual error handling
        const successfulProviders: string[] = [];
        for (const [name, config] of Object.entries(llmConfigs)) {
            try {
                // Check if API key exists
                if (!config.apiKey || config.apiKey.trim() === '') {
                    this.logger.warn(`Skipping ${name}: API key not found`);
                    continue;
                }

                await this.client.addLLMProvider(name, config);
                successfulProviders.push(name);
                this.logger.info(`✓ Successfully added provider: ${name}`);
            } catch (error) {
                this.logger.error(`✗ Failed to add provider: ${name}`, error as Error);
            }
        }

        // Add MCP servers with individual error handling
        const successfulServers: string[] = [];
        for (const config of mcpConfigs) {
            try {
                await this.client.addMCPServer(config);
                successfulServers.push(config.name);
                this.logger.info(`✓ Successfully connected to MCP server: ${config.name}`);
            } catch (error) {
                this.logger.error(`✗ Failed to connect to MCP server: ${config.name}`, error as Error);
            }
        }

        // Check if we have at least one working provider
        if (successfulProviders.length === 0) {
            this.logger.error('No LLM providers available. Please check your API keys in .env file.');
            process.exit(1);
        }

        // Set default provider
        this.currentProvider = successfulProviders[0];

        // Initialize system message
        this.conversationHistory.push({
            role: 'system',
            content: 'You are a helpful assistant with access to filesystem and database tools. When asked about your capabilities, please describe the tools you have access to in detail.',
        });

        console.log('\n🎉 Multi-LLM MCP Client initialized successfully');
        console.log(`📋 Available providers: ${successfulProviders.join(', ')}`);
        console.log(`🔧 Connected servers: ${successfulServers.join(', ')}`);
        console.log(`🤖 Current provider: ${this.currentProvider}`);
        console.log('\n=== Interactive MCP Client ===');
        console.log('Commands:');
        console.log('  /tools     - Show available tools');
        console.log('  /providers - Show available LLM providers');
        console.log('  /switch    - Switch LLM provider');
        console.log('  /clear     - Clear conversation history');
        console.log('  /quit      - Quit the application');
        console.log('  anything else - Chat with the AI\n');
    }

    private async showTools(): Promise<void> {
        try {
            const tools = await this.client.getAllTools();
            console.log('\n📧 Available Tools:');
            if (tools.length === 0) {
                console.log('  No tools available');
            } else {
                tools.forEach((tool, index) => {
                    console.log(`  ${index + 1}. ${tool.name}`);
                    console.log(`     Description: ${tool.description}`);
                    if (tool.inputSchema?.properties) {
                        console.log(`     Parameters: ${Object.keys(tool.inputSchema.properties).join(', ')}`);
                    }
                    console.log('');
                });
            }
        } catch (error) {
            console.error('Error fetching tools:', error);
        }
    }

    private showProviders(): void {
        const providers = this.client.getAvailableProviders();
        console.log('\n🤖 Available LLM Providers:');
        providers.forEach((provider, index) => {
            const current = provider === this.currentProvider ? ' (current)' : '';
            console.log(`  ${index + 1}. ${provider}${current}`);
        });
    }

    private async switchProvider(): Promise<void> {
        const providers = this.client.getAvailableProviders();
        if (providers.length <= 1) {
            console.log('Only one provider available');
            return;
        }

        console.log('\nSelect a provider:');
        providers.forEach((provider, index) => {
            console.log(`  ${index + 1}. ${provider}`);
        });

        const answer = await this.question('Enter provider number: ');
        const index = parseInt(answer) - 1;
        
        if (index >= 0 && index < providers.length) {
            this.currentProvider = providers[index];
            console.log(`✓ Switched to: ${this.currentProvider}`);
        } else {
            console.log('Invalid selection');
        }
    }

    private async chatWithAI(message: string): Promise<void> {
        try {
            // Add user message to history
            this.conversationHistory.push({
                role: 'user',
                content: message,
            });

            console.log('\n🤔 Thinking...');
            const response = await this.client.chat(this.currentProvider, this.conversationHistory, true);
            
            // Add AI response to history
            this.conversationHistory.push({
                role: 'assistant',
                content: response.content,
            });

            console.log(`\n🤖 ${this.currentProvider}:`);
            console.log(response.content);

            // Handle tool calls if any
            if (response.toolCalls && response.toolCalls.length > 0) {
                console.log(`\n🔧 Executing ${response.toolCalls.length} tool call(s)...`);
                
                for (const toolCall of response.toolCalls) {
                    try {
                        const toolArgs = JSON.parse(toolCall.function.arguments);
                        console.log(`  📋 Using tool: ${toolCall.function.name}`);
                        const result = await this.client.executeToolCall(toolCall.function.name, toolArgs);
                        console.log(`  ✓ Tool result:`, result);
                    } catch (error) {
                        console.error(`  ✗ Tool execution failed: ${toolCall.function.name}`, error);
                    }
                }
            }
        } catch (error) {
            console.error('Chat error:', error);
        }
    }

    private question(prompt: string): Promise<string> {
        return new Promise((resolve) => {
            this.rl.question(prompt, resolve);
        });
    }

    async start(): Promise<void> {
        await this.initialize();

        while (true) {
            const input = await this.question('\n💬 You: ');

            if (input.startsWith('/')) {
                const command = input.toLowerCase().trim();
                
                switch (command) {
                    case '/tools':
                        await this.showTools();
                        break;
                    case '/providers':
                        this.showProviders();
                        break;
                    case '/switch':
                        await this.switchProvider();
                        break;
                    case '/clear':
                        this.conversationHistory = [{
                            role: 'system',
                            content: 'You are a helpful assistant with access to filesystem and database tools. When asked about your capabilities, please describe the tools you have access to in detail.',
                        }];
                        console.log('✓ Conversation history cleared');
                        break;
                    case '/quit':
                        console.log('👋 Goodbye!');
                        await this.client.disconnect();
                        this.rl.close();
                        process.exit(0);
                        break;
                    default:
                        console.log('Unknown command. Type /quit to exit.');
                }
            } else if (input.trim()) {
                await this.chatWithAI(input.trim());
            }
        }
    }
}

async function main(): Promise<void> {
    const interactiveClient = new InteractiveMCPClient();

    // Graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\n\n👋 Shutting down...');
        await interactiveClient['client'].disconnect();
        process.exit(0);
    });

    await interactiveClient.start();
}

// Direct execution for ES modules
main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
});
