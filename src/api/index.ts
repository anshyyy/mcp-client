import dotenv from 'dotenv';
import { MCPApiServer } from './server.js';

dotenv.config();

async function main() {
  const port = parseInt(process.env.API_PORT || '3001', 10);
  const server = new MCPApiServer(port);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });

  try {
    await server.start();
    console.log(`🎉 MCP API Server is running!`);
    console.log(`📋 Available endpoints:`);
    console.log(`   GET  /health                    - Health check`);
    console.log(`   POST /api/initialize            - Initialize MCP client`);
    console.log(`   GET  /api/providers             - Get available LLM providers`);
    console.log(`   GET  /api/tools                 - Get available MCP tools`);
    console.log(`   POST /api/chat                  - Chat with LLM`);
    console.log(`   POST /api/tools/execute         - Execute MCP tool`);
    console.log(`   GET  /api/config/providers      - Get provider configurations`);
    console.log(`   POST /api/config/providers      - Add/update provider`);
    console.log(`   GET  /api/config/servers        - Get MCP server configurations`);
    console.log(`   POST /api/config/servers        - Add/update MCP server`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main().catch(console.error); 