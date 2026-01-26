// ABOUTME: LLM integration generator for voice AI applications.
// ABOUTME: Generates SDK connection code for Anthropic Claude and OpenAI.

import type { LLMIntegrationInput, GeneratedFile, ToolDefinition } from '../types.js';

/**
 * Generates LLM integration code
 * @param input - Configuration for the LLM integration
 * @returns Array of generated files
 */
export function generateLLMIntegration(input: LLMIntegrationInput): GeneratedFile[] {
  const integrationCode = generateIntegrationCode(input);

  return [
    {
      path: 'lib/llm.ts',
      content: integrationCode,
      type: 'llm-integration',
    },
  ];
}

function generateIntegrationCode(input: LLMIntegrationInput): string {
  const {
    provider,
    model,
    streamingEnabled,
    toolCalling,
    tools = [],
    maxTokens = 1024,
    temperature,
  } = input;

  const lines: string[] = [];

  // ABOUTME comments
  lines.push(`// ABOUTME: LLM integration module for ${provider} ${model}.`);
  lines.push(`// ABOUTME: Provides sendMessage function for voice AI conversations.`);
  lines.push('');

  // Imports
  if (provider === 'anthropic') {
    lines.push("import Anthropic from '@anthropic-ai/sdk';");
    if (streamingEnabled) {
      lines.push("import type { Stream } from '@anthropic-ai/sdk/streaming';");
    }
  } else {
    lines.push("import OpenAI from 'openai';");
  }
  lines.push('');

  // Types
  lines.push('// Message types');
  lines.push('export interface Message {');
  lines.push("  role: 'user' | 'assistant';");
  lines.push('  content: string;');
  lines.push('}');
  lines.push('');

  lines.push('export interface LLMResponse {');
  lines.push('  text: string;');
  lines.push('  toolCall?: { name: string; input: unknown };');
  lines.push('}');
  lines.push('');

  // Client initialization
  if (provider === 'anthropic') {
    lines.push('// Initialize Anthropic client');
    lines.push('const client = new Anthropic({');
    lines.push('  apiKey: process.env.ANTHROPIC_API_KEY,');
    lines.push('});');
  } else {
    lines.push('// Initialize OpenAI client');
    lines.push('const client = new OpenAI({');
    lines.push('  apiKey: process.env.OPENAI_API_KEY,');
    lines.push('});');
  }
  lines.push('');

  // Tool definitions if tool calling is enabled
  if (toolCalling && tools.length > 0) {
    lines.push('// Tool definitions');
    if (provider === 'anthropic') {
      lines.push('const tools = [');
      for (const tool of tools) {
        lines.push('  {');
        lines.push(`    name: '${tool.name}',`);
        lines.push(`    description: '${escapeString(tool.description)}',`);
        lines.push(`    input_schema: ${JSON.stringify(tool.inputSchema, null, 4).split('\n').join('\n    ')},`);
        lines.push('  },');
      }
      lines.push('];');
    } else {
      lines.push('const tools = [');
      for (const tool of tools) {
        lines.push('  {');
        lines.push("    type: 'function' as const,");
        lines.push('    function: {');
        lines.push(`      name: '${tool.name}',`);
        lines.push(`      description: '${escapeString(tool.description)}',`);
        lines.push(`      parameters: ${JSON.stringify(tool.inputSchema, null, 6).split('\n').join('\n      ')},`);
        lines.push('    },');
        lines.push('  },');
      }
      lines.push('];');
    }
    lines.push('');
  }

  // Conversation history
  lines.push('// Conversation history management');
  lines.push('let conversationHistory: Message[] = [];');
  lines.push('');
  lines.push('export function addMessage(message: Message): void {');
  lines.push('  conversationHistory.push(message);');
  lines.push('}');
  lines.push('');
  lines.push('export function getHistory(): Message[] {');
  lines.push('  return [...conversationHistory];');
  lines.push('}');
  lines.push('');
  lines.push('export function clearHistory(): void {');
  lines.push('  conversationHistory = [];');
  lines.push('}');
  lines.push('');

  // Send message function
  lines.push('// Send message to LLM');
  if (streamingEnabled && provider === 'anthropic') {
    generateAnthropicStreamingFunction(lines, model, maxTokens, temperature, toolCalling, tools.length > 0);
  } else if (streamingEnabled && provider === 'openai') {
    generateOpenAIStreamingFunction(lines, model, maxTokens, temperature, toolCalling, tools.length > 0);
  } else if (provider === 'anthropic') {
    generateAnthropicNonStreamingFunction(lines, model, maxTokens, temperature, toolCalling, tools.length > 0);
  } else {
    generateOpenAINonStreamingFunction(lines, model, maxTokens, temperature, toolCalling, tools.length > 0);
  }

  return lines.join('\n');
}

function generateAnthropicStreamingFunction(
  lines: string[],
  model: string,
  maxTokens: number,
  temperature: number | undefined,
  toolCalling: boolean,
  hasTools: boolean
): void {
  lines.push('export async function sendMessage(');
  lines.push('  userMessage: string,');
  lines.push('  systemPrompt: string,');
  lines.push('  onToken?: (token: string) => void');
  lines.push('): Promise<LLMResponse> {');
  lines.push("  addMessage({ role: 'user', content: userMessage });");
  lines.push('');
  lines.push('  const stream = await client.messages.stream({');
  lines.push(`    model: '${model}',`);
  lines.push(`    max_tokens: ${maxTokens},`);
  if (temperature !== undefined) {
    lines.push(`    temperature: ${temperature},`);
  }
  lines.push('    system: systemPrompt,');
  lines.push('    messages: conversationHistory,');
  if (toolCalling && hasTools) {
    lines.push('    tools: tools,');
  }
  lines.push('  });');
  lines.push('');
  lines.push('  let fullText = "";');
  lines.push('  let toolCall: { name: string; input: unknown } | undefined;');
  lines.push('');
  lines.push("  stream.on('text', (text) => {");
  lines.push('    fullText += text;');
  lines.push('    if (onToken) onToken(text);');
  lines.push('  });');
  lines.push('');
  lines.push('  const finalMessage = await stream.finalMessage();');
  lines.push('');
  lines.push('  for (const block of finalMessage.content) {');
  lines.push("    if (block.type === 'tool_use') {");
  lines.push('      toolCall = { name: block.name, input: block.input };');
  lines.push('    }');
  lines.push('  }');
  lines.push('');
  lines.push("  addMessage({ role: 'assistant', content: fullText });");
  lines.push('');
  lines.push('  return { text: fullText, toolCall };');
  lines.push('}');
}

function generateAnthropicNonStreamingFunction(
  lines: string[],
  model: string,
  maxTokens: number,
  temperature: number | undefined,
  toolCalling: boolean,
  hasTools: boolean
): void {
  lines.push('export async function sendMessage(');
  lines.push('  userMessage: string,');
  lines.push('  systemPrompt: string');
  lines.push('): Promise<LLMResponse> {');
  lines.push("  addMessage({ role: 'user', content: userMessage });");
  lines.push('');
  lines.push('  const response = await client.messages.create({');
  lines.push(`    model: '${model}',`);
  lines.push(`    max_tokens: ${maxTokens},`);
  if (temperature !== undefined) {
    lines.push(`    temperature: ${temperature},`);
  }
  lines.push('    system: systemPrompt,');
  lines.push('    messages: conversationHistory,');
  if (toolCalling && hasTools) {
    lines.push('    tools: tools,');
  }
  lines.push('  });');
  lines.push('');
  lines.push('  let text = "";');
  lines.push('  let toolCall: { name: string; input: unknown } | undefined;');
  lines.push('');
  lines.push('  for (const block of response.content) {');
  lines.push("    if (block.type === 'text') {");
  lines.push('      text = block.text;');
  lines.push("    } else if (block.type === 'tool_use') {");
  lines.push('      toolCall = { name: block.name, input: block.input };');
  lines.push('    }');
  lines.push('  }');
  lines.push('');
  lines.push("  addMessage({ role: 'assistant', content: text });");
  lines.push('');
  lines.push('  return { text, toolCall };');
  lines.push('}');
}

function generateOpenAIStreamingFunction(
  lines: string[],
  model: string,
  maxTokens: number,
  temperature: number | undefined,
  toolCalling: boolean,
  hasTools: boolean
): void {
  lines.push('export async function sendMessage(');
  lines.push('  userMessage: string,');
  lines.push('  systemPrompt: string,');
  lines.push('  onToken?: (token: string) => void');
  lines.push('): Promise<LLMResponse> {');
  lines.push("  addMessage({ role: 'user', content: userMessage });");
  lines.push('');
  lines.push('  const stream = await client.chat.completions.create({');
  lines.push(`    model: '${model}',`);
  lines.push(`    max_tokens: ${maxTokens},`);
  if (temperature !== undefined) {
    lines.push(`    temperature: ${temperature},`);
  }
  lines.push('    stream: true,');
  lines.push('    messages: [');
  lines.push("      { role: 'system', content: systemPrompt },");
  lines.push('      ...conversationHistory,');
  lines.push('    ],');
  if (toolCalling && hasTools) {
    lines.push('    tools: tools,');
  }
  lines.push('  });');
  lines.push('');
  lines.push('  let fullText = "";');
  lines.push('  let toolCall: { name: string; input: unknown } | undefined;');
  lines.push('');
  lines.push('  for await (const chunk of stream) {');
  lines.push('    const delta = chunk.choices[0]?.delta;');
  lines.push('    if (delta?.content) {');
  lines.push('      fullText += delta.content;');
  lines.push('      if (onToken) onToken(delta.content);');
  lines.push('    }');
  lines.push('    if (delta?.tool_calls?.[0]) {');
  lines.push('      const tc = delta.tool_calls[0];');
  lines.push('      if (tc.function?.name) {');
  lines.push('        toolCall = { name: tc.function.name, input: JSON.parse(tc.function.arguments || "{}") };');
  lines.push('      }');
  lines.push('    }');
  lines.push('  }');
  lines.push('');
  lines.push("  addMessage({ role: 'assistant', content: fullText });");
  lines.push('');
  lines.push('  return { text: fullText, toolCall };');
  lines.push('}');
}

function generateOpenAINonStreamingFunction(
  lines: string[],
  model: string,
  maxTokens: number,
  temperature: number | undefined,
  toolCalling: boolean,
  hasTools: boolean
): void {
  lines.push('export async function sendMessage(');
  lines.push('  userMessage: string,');
  lines.push('  systemPrompt: string');
  lines.push('): Promise<LLMResponse> {');
  lines.push("  addMessage({ role: 'user', content: userMessage });");
  lines.push('');
  lines.push('  const response = await client.chat.completions.create({');
  lines.push(`    model: '${model}',`);
  lines.push(`    max_tokens: ${maxTokens},`);
  if (temperature !== undefined) {
    lines.push(`    temperature: ${temperature},`);
  }
  lines.push('    messages: [');
  lines.push("      { role: 'system', content: systemPrompt },");
  lines.push('      ...conversationHistory,');
  lines.push('    ],');
  if (toolCalling && hasTools) {
    lines.push('    tools: tools,');
  }
  lines.push('  });');
  lines.push('');
  lines.push('  const choice = response.choices[0];');
  lines.push("  const text = choice.message.content || '';");
  lines.push('  let toolCall: { name: string; input: unknown } | undefined;');
  lines.push('');
  lines.push('  if (choice.message.tool_calls?.[0]) {');
  lines.push('    const tc = choice.message.tool_calls[0];');
  lines.push('    toolCall = { name: tc.function.name, input: JSON.parse(tc.function.arguments) };');
  lines.push('  }');
  lines.push('');
  lines.push("  addMessage({ role: 'assistant', content: text });");
  lines.push('');
  lines.push('  return { text, toolCall };');
  lines.push('}');
}

function escapeString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}
