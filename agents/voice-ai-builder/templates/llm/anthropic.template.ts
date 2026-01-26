// ABOUTME: Template LLM integration module for Anthropic Claude.
// ABOUTME: Provides sendMessage function for voice AI conversations.

import Anthropic from '@anthropic-ai/sdk';

// Message types
export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  text: string;
  toolCall?: { name: string; input: unknown };
}

// Initialize Anthropic client
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Tool definitions (customize for your use case)
// const tools = [
//   {
//     name: 'lookup_account',
//     description: 'Look up customer account by ID or phone number',
//     input_schema: {
//       type: 'object',
//       properties: {
//         accountId: { type: 'string', description: 'Account ID' },
//         phone: { type: 'string', description: 'Phone number' },
//       },
//     },
//   },
// ];

// Conversation history management
let conversationHistory: Message[] = [];

export function addMessage(message: Message): void {
  conversationHistory.push(message);
}

export function getHistory(): Message[] {
  return [...conversationHistory];
}

export function clearHistory(): void {
  conversationHistory = [];
}

// Send message to LLM
export async function sendMessage(
  userMessage: string,
  systemPrompt: string,
  onToken?: (token: string) => void
): Promise<LLMResponse> {
  addMessage({ role: 'user', content: userMessage });

  // Use streaming for real-time voice responses
  const stream = await client.messages.stream({
    model: '{{MODEL}}',  // e.g., 'claude-sonnet-4-20250514'
    max_tokens: {{MAX_TOKENS}},
    system: systemPrompt,
    messages: conversationHistory,
    // tools: tools,  // Uncomment to enable tool calling
  });

  let fullText = '';
  let toolCall: { name: string; input: unknown } | undefined;

  // Handle streaming tokens
  stream.on('text', (text) => {
    fullText += text;
    if (onToken) onToken(text);
  });

  const finalMessage = await stream.finalMessage();

  // Check for tool calls
  for (const block of finalMessage.content) {
    if (block.type === 'tool_use') {
      toolCall = { name: block.name, input: block.input };
    }
  }

  addMessage({ role: 'assistant', content: fullText });

  return { text: fullText, toolCall };
}

// Non-streaming alternative (for batch processing)
export async function sendMessageSync(
  userMessage: string,
  systemPrompt: string
): Promise<LLMResponse> {
  addMessage({ role: 'user', content: userMessage });

  const response = await client.messages.create({
    model: '{{MODEL}}',
    max_tokens: {{MAX_TOKENS}},
    system: systemPrompt,
    messages: conversationHistory,
  });

  let text = '';
  let toolCall: { name: string; input: unknown } | undefined;

  for (const block of response.content) {
    if (block.type === 'text') {
      text = block.text;
    } else if (block.type === 'tool_use') {
      toolCall = { name: block.name, input: block.input };
    }
  }

  addMessage({ role: 'assistant', content: text });

  return { text, toolCall };
}
