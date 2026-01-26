// ABOUTME: WebSocket server generator for ConversationRelay voice applications.
// ABOUTME: Generates real-time speech processing servers with LLM integration.

import type { WebSocketGeneratorInput, GeneratedFile, ToolDefinition } from '../types.js';

/**
 * Generates WebSocket server code for ConversationRelay
 * @param input - Configuration for the WebSocket server
 * @returns Array of generated files
 */
export function generateWebSocketServer(input: WebSocketGeneratorInput): GeneratedFile[] {
  const serverCode = generateServerCode(input);

  return [
    {
      path: 'websocket/server.ts',
      content: serverCode,
      type: 'websocket-server',
    },
  ];
}

function generateServerCode(input: WebSocketGeneratorInput): string {
  const {
    llmProvider,
    systemPrompt,
    tools,
    maxTurns,
    contextManagement,
    port = 8080,
    debug = false,
  } = input;

  const lines: string[] = [];

  // ABOUTME comments
  lines.push('// ABOUTME: WebSocket server for ConversationRelay voice AI application.');
  lines.push('// ABOUTME: Handles real-time speech processing with LLM integration.');
  lines.push('');

  // Imports
  lines.push("import { WebSocketServer, WebSocket } from 'ws';");

  if (llmProvider === 'anthropic') {
    lines.push("import Anthropic from '@anthropic-ai/sdk';");
  } else if (llmProvider === 'openai') {
    lines.push("import OpenAI from 'openai';");
  }
  lines.push('');

  // Configuration
  lines.push('// Configuration');
  lines.push(`const PORT = process.env.PORT || ${port};`);
  lines.push(`const MAX_TURNS = ${maxTurns};`);
  lines.push(`const SYSTEM_PROMPT = \`${escapeTemplateString(systemPrompt)}\`;`);
  lines.push('');

  // Tool definitions if provided
  if (tools.length > 0) {
    lines.push('// Tool definitions');
    lines.push('const TOOLS = [');
    for (const tool of tools) {
      lines.push(`  {`);
      lines.push(`    name: '${tool.name}',`);
      lines.push(`    description: '${escapeString(tool.description)}',`);
      lines.push(`    input_schema: ${JSON.stringify(tool.inputSchema, null, 6).split('\n').join('\n    ')},`);
      lines.push(`  },`);
    }
    lines.push('];');
    lines.push('');
  }

  // LLM client initialization
  if (llmProvider === 'anthropic') {
    lines.push('// Initialize Anthropic client');
    lines.push('const anthropic = new Anthropic({');
    lines.push('  apiKey: process.env.ANTHROPIC_API_KEY,');
    lines.push('});');
  } else if (llmProvider === 'openai') {
    lines.push('// Initialize OpenAI client');
    lines.push('const openai = new OpenAI({');
    lines.push('  apiKey: process.env.OPENAI_API_KEY,');
    lines.push('});');
  } else {
    lines.push('// TODO: Initialize custom LLM client');
    lines.push('// const customLLM = initializeCustomProvider();');
  }
  lines.push('');

  // Call context interface
  lines.push('// Call context for each connection');
  lines.push('interface CallContext {');
  lines.push('  callSid: string;');
  lines.push('  streamSid: string;');
  lines.push('  from: string;');
  lines.push('  to: string;');
  lines.push('  messages: Array<{ role: string; content: string }>;');
  lines.push('  turnCount: number;');
  lines.push('}');
  lines.push('');

  // Context management helper
  lines.push('// Context management');
  generateContextManagement(lines, contextManagement);
  lines.push('');

  // LLM interaction function
  lines.push('// Send message to LLM');
  generateLLMFunction(lines, llmProvider, tools.length > 0);
  lines.push('');

  // Tool execution if tools defined
  if (tools.length > 0) {
    lines.push('// Execute tool calls');
    generateToolExecution(lines, tools);
    lines.push('');
  }

  // WebSocket server
  lines.push('// Create WebSocket server');
  lines.push('const wss = new WebSocketServer({ port: Number(PORT) });');
  lines.push('');
  lines.push(`console.log(\`WebSocket server listening on port \${PORT}\`);`);
  lines.push('');

  // Connection handler
  lines.push("wss.on('connection', (ws: WebSocket) => {");
  if (debug) {
    lines.push("  console.log('New connection established');");
  }
  lines.push('  let context: CallContext | null = null;');
  lines.push('');

  // Message handler
  lines.push("  ws.on('message', async (data: Buffer) => {");
  lines.push('    const message = JSON.parse(data.toString());');
  if (debug) {
    lines.push("    console.log('Received message:', message.type);");
  }
  lines.push('');
  lines.push('    switch (message.type) {');

  // Setup handler
  lines.push("      case 'setup':");
  lines.push('        context = {');
  lines.push('          callSid: message.callSid,');
  lines.push('          streamSid: message.streamSid,');
  lines.push('          from: message.from,');
  lines.push('          to: message.to,');
  lines.push('          messages: [],');
  lines.push('          turnCount: 0,');
  lines.push('        };');
  if (debug) {
    lines.push("        console.log('Call setup:', context.callSid);");
  }
  lines.push('        break;');
  lines.push('');

  // Prompt handler
  lines.push("      case 'prompt':");
  lines.push('        if (!context) break;');
  lines.push('        if (message.isFinal && message.voicePrompt) {');
  lines.push('          context.turnCount++;');
  lines.push('          if (context.turnCount > MAX_TURNS) {');
  lines.push("            ws.send(JSON.stringify({ type: 'end' }));");
  lines.push('            break;');
  lines.push('          }');
  lines.push('');
  lines.push("          context.messages.push({ role: 'user', content: message.voicePrompt });");
  lines.push('          const managedMessages = manageContext(context.messages);');
  lines.push('          const response = await sendToLLM(managedMessages);');
  lines.push('');
  lines.push("          context.messages.push({ role: 'assistant', content: response });");
  lines.push("          ws.send(JSON.stringify({ type: 'text', token: response }));");
  lines.push('        }');
  lines.push('        break;');
  lines.push('');

  // DTMF handler
  lines.push("      case 'dtmf':");
  lines.push('        if (!context) break;');
  lines.push('        const digit = message.digit;');
  if (debug) {
    lines.push("        console.log('DTMF received:', digit);");
  }
  lines.push('        // Handle DTMF digit as needed');
  lines.push('        break;');
  lines.push('');

  // Interrupt handler
  lines.push("      case 'interrupt':");
  if (debug) {
    lines.push("        console.log('User interrupted');");
  }
  lines.push('        // Handle interrupt - stop current response');
  lines.push('        break;');
  lines.push('');

  lines.push('      default:');
  if (debug) {
    lines.push("        console.log('Unknown message type:', message.type);");
  }
  lines.push('    }');
  lines.push('  });');
  lines.push('');

  // Close handler
  lines.push("  ws.on('close', () => {");
  if (debug) {
    lines.push("    console.log('Connection closed');");
  }
  lines.push('    context = null;');
  lines.push('  });');
  lines.push('});');

  return lines.join('\n');
}

function generateContextManagement(lines: string[], strategy: string): void {
  lines.push('function manageContext(messages: Array<{ role: string; content: string }>): Array<{ role: string; content: string }> {');

  if (strategy === 'sliding-window') {
    lines.push('  // Sliding window: keep last N messages');
    lines.push('  const WINDOW_SIZE = 20;');
    lines.push('  if (messages.length > WINDOW_SIZE) {');
    lines.push('    return messages.slice(-WINDOW_SIZE);');
    lines.push('  }');
    lines.push('  return messages;');
  } else if (strategy === 'summary') {
    lines.push('  // Summary: summarize old messages when context grows');
    lines.push('  const MAX_MESSAGES = 30;');
    lines.push('  if (messages.length > MAX_MESSAGES) {');
    lines.push('    // TODO: Implement summarization of older messages');
    lines.push('    return messages.slice(-MAX_MESSAGES);');
    lines.push('  }');
    lines.push('  return messages;');
  } else {
    lines.push('  // Full context: return all messages');
    lines.push('  return messages;');
  }

  lines.push('}');
}

function generateLLMFunction(lines: string[], provider: string, hasTools: boolean): void {
  lines.push('async function sendToLLM(messages: Array<{ role: string; content: string }>): Promise<string> {');

  if (provider === 'anthropic') {
    lines.push('  const response = await anthropic.messages.create({');
    lines.push("    model: 'claude-sonnet-4-20250514',");
    lines.push('    max_tokens: 1024,');
    lines.push('    system: SYSTEM_PROMPT,');
    lines.push('    messages: messages,');
    if (hasTools) {
      lines.push('    tools: TOOLS,');
    }
    lines.push('  });');
    lines.push('');
    lines.push('  // Handle tool_use blocks if present');
    lines.push('  for (const block of response.content) {');
    lines.push("    if (block.type === 'tool_use') {");
    lines.push('      const result = await executeTool(block.name, block.input);');
    lines.push('      // Continue conversation with tool result');
    lines.push('      return result;');
    lines.push('    }');
    lines.push("    if (block.type === 'text') {");
    lines.push('      return block.text;');
    lines.push('    }');
    lines.push('  }');
    lines.push("  return '';");
  } else if (provider === 'openai') {
    lines.push('  const response = await openai.chat.completions.create({');
    lines.push("    model: 'gpt-4o',");
    lines.push('    max_tokens: 1024,');
    lines.push('    messages: [');
    lines.push("      { role: 'system', content: SYSTEM_PROMPT },");
    lines.push('      ...messages,');
    lines.push('    ],');
    if (hasTools) {
      lines.push('    tools: TOOLS.map(t => ({ type: "function", function: t })),');
    }
    lines.push('  });');
    lines.push('');
    lines.push('  const choice = response.choices[0];');
    lines.push('  if (choice.message.tool_calls) {');
    lines.push('    const toolCall = choice.message.tool_calls[0];');
    lines.push('    const result = await executeTool(toolCall.function.name, JSON.parse(toolCall.function.arguments));');
    lines.push('    return result;');
    lines.push('  }');
    lines.push("  return choice.message.content || '';");
  } else {
    lines.push('  // TODO: Implement custom LLM call');
    lines.push("  return 'Custom LLM response placeholder';");
  }

  lines.push('}');
}

function generateToolExecution(lines: string[], tools: ToolDefinition[]): void {
  lines.push('async function executeTool(name: string, input: unknown): Promise<string> {');
  lines.push('  switch (name) {');

  for (const tool of tools) {
    lines.push(`    case '${tool.name}':`);
    lines.push(`      // TODO: Implement ${tool.name}`);
    lines.push(`      return 'Tool ${tool.name} executed';`);
  }

  lines.push('    default:');
  lines.push("      return 'Unknown tool';");
  lines.push('  }');
  lines.push('}');
}

function escapeString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

function escapeTemplateString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
}
