// ABOUTME: MCP stdio server entry point for Claude Code integration.
// ABOUTME: Bridges createTwilioMcpServer() tool format to MCP JSON-RPC protocol over stdin/stdout.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createTwilioMcpServer } from './index.js';
import type { z } from 'zod';

async function main() {
  // Create the Twilio MCP tool definitions (custom format)
  const twilioServer = createTwilioMcpServer();

  // Create standard MCP server
  const mcp = new McpServer(
    { name: twilioServer.name, version: twilioServer.version },
    { capabilities: { tools: {} } }
  );

  // Register each tool with the MCP server.
  // Our tools use { name, description, inputSchema: z.ZodObject, handler }.
  // McpServer.registerTool accepts inputSchema as AnySchema (which z.ZodObject satisfies).
  for (const tool of twilioServer.tools) {
    const zodSchema = tool.inputSchema as z.ZodObject<z.ZodRawShape>;

    mcp.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: zodSchema,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (args: any) => {
        try {
          return await tool.handler(args);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            content: [{ type: 'text' as const, text: `Error: ${message}` }],
            isError: true,
          };
        }
      }
    );
  }

  // Connect to stdio transport and start serving
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
}

main().catch((error) => {
  process.stderr.write(`MCP server error: ${error}\n`);
  process.exit(1);
});
