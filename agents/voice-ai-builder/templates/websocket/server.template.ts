// ABOUTME: Template WebSocket server for ConversationRelay voice AI application.
// ABOUTME: Handles real-time speech processing with LLM integration.

import { WebSocketServer, WebSocket } from 'ws';
import Anthropic from '@anthropic-ai/sdk';

// Configuration
const PORT = process.env.PORT || 8080;
const MAX_TURNS = {{MAX_TURNS}};
const SYSTEM_PROMPT = `{{SYSTEM_PROMPT}}`;

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Call context for each connection
interface CallContext {
  callSid: string;
  streamSid: string;
  from: string;
  to: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  turnCount: number;
}

// Context management: sliding window
function manageContext(
  messages: Array<{ role: string; content: string }>
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const WINDOW_SIZE = 20;
  const sliced = messages.length > WINDOW_SIZE ? messages.slice(-WINDOW_SIZE) : messages;
  return sliced as Array<{ role: 'user' | 'assistant'; content: string }>;
}

// Send message to LLM
async function sendToLLM(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: messages,
  });

  for (const block of response.content) {
    if (block.type === 'text') {
      return block.text;
    }
  }
  return '';
}

// Create WebSocket server
const wss = new WebSocketServer({ port: Number(PORT) });
console.log(`WebSocket server listening on port ${PORT}`);

wss.on('connection', (ws: WebSocket) => {
  console.log('New connection established');
  let context: CallContext | null = null;

  ws.on('message', async (data: Buffer) => {
    const message = JSON.parse(data.toString());
    console.log('Received message:', message.type);

    switch (message.type) {
      case 'setup':
        // Initialize call context
        context = {
          callSid: message.callSid,
          streamSid: message.streamSid,
          from: message.from,
          to: message.to,
          messages: [],
          turnCount: 0,
        };
        console.log('Call setup:', context.callSid);
        break;

      case 'prompt':
        // Handle user speech
        if (!context) break;
        if (message.isFinal && message.voicePrompt) {
          context.turnCount++;

          // Check turn limit
          if (context.turnCount > MAX_TURNS) {
            ws.send(JSON.stringify({ type: 'end' }));
            break;
          }

          // Add user message and get LLM response
          context.messages.push({ role: 'user', content: message.voicePrompt });
          const managedMessages = manageContext(context.messages);
          const response = await sendToLLM(managedMessages);

          // Send response back
          context.messages.push({ role: 'assistant', content: response });
          ws.send(JSON.stringify({ type: 'text', token: response }));
        }
        break;

      case 'dtmf':
        // Handle keypad input
        if (!context) break;
        const digit = message.digit;
        console.log('DTMF received:', digit);
        // Handle DTMF digit as needed (e.g., '0' for operator)
        break;

      case 'interrupt':
        // User interrupted AI speech
        console.log('User interrupted');
        // Stop current response processing if needed
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  });

  ws.on('close', () => {
    console.log('Connection closed');
    context = null;
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});
