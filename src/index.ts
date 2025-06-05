import dotenv from 'dotenv';
import { MultiLLMMCPClient } from './core/multi-llm-mcp-client.js';
import { Logger } from './utils/logger.js';
import { LLMConfig, MCPServerConfig } from './types/index.js';


dotenv.config();

async function main(): Promise<void> {
    const logger = new Logger();
    const client = new MultiLLMMCPClient(logger);

    try {
        // Example configuration
        const llmConfigs: Record<string, LLMConfig> = {
            'gpt-4': {
                provider: 'openai',
                model: 'gpt-4',
                apiKey: process.env.OPENAI_API_KEY!,
                temperature: 0.7,
                maxTokens: 2000,
            },
            'claude-3-sonnet': {
                provider: 'anthropic',
                model: 'claude-3-sonnet-20240229',
                apiKey: process.env.ANTHROPIC_API_KEY!,
                temperature: 0.7,
                maxTokens: 2000,
            },
            'gemini-pro': {
                provider: 'google',
                model: 'gemini-pro',
                apiKey: process.env.GOOGLE_API_KEY!,
                temperature: 0.7,
            },
        };

        const mcpConfigs: MCPServerConfig[] = [
            {
                name: 'filesystem',
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/directory'],
            },
            {
                name: 'sqlite',
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-sqlite', '/path/to/database.db'],
            },
        ];

        // Add LLM providers
        for (const [name, config] of Object.entries(llmConfigs)) {
            await client.addLLMProvider(name, config);
        }

        // Add MCP servers
        for (const config of mcpConfigs) {
            try {
                await client.addMCPServer(config);
            } catch (error) {
                logger.error(`Failed to add MCP server: ${config.name}`, error as Error);
            }
        }

        // Example usage
        logger.info('Multi-LLM MCP Client initialized successfully');
        logger.info(`Available providers: ${client.getAvailableProviders().join(', ')}`);
        logger.info(`Connected servers: ${client.getConnectedServers().join(', ')}`);

        // Example chat with tool usage
        const messages = [
            {
                role: 'system' as const,
                content: 'You are a helpful assistant with access to filesystem and database tools.',
            },
            {
                role: 'user' as const,
                content: 'List the files in the current directory and tell me about any database tables available.',
            },
        ];

        try {
            const response = await client.chat('gpt-4', messages, true);
            logger.info('Chat response received', {
                content: response.content.substring(0, 100) + '...',
                toolCalls: response.toolCalls?.length ?? 0,
            });

            // Handle tool calls if any
            if (response.toolCalls && response.toolCalls.length > 0) {
                for (const toolCall of response.toolCalls) {
                    try {
                        const toolArgs = JSON.parse(toolCall.function.arguments);
                        const result = await client.executeToolCall(toolCall.function.name, toolArgs);
                        logger.info(`Tool execution result: ${toolCall.function.name}`, { result });
                    } catch (error) {
                        logger.error(`Tool execution failed: ${toolCall.function.name}`, error as Error);
                    }
                }
            }
        } catch (error) {
            logger.error('Chat request failed', error as Error);
        }

        // Graceful shutdown
        process.on('SIGINT', async () => {
            logger.info('Shutting down...');
            await client.disconnect();
            process.exit(0);
        });

    } catch (error) {
        logger.error('Failed to initialize client', error as Error);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error('Unhandled error:', error);
        process.exit(1);
    });
}
