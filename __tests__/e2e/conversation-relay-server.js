#!/usr/bin/env node
// ABOUTME: Standalone ConversationRelay WebSocket server for E2E testing.
// ABOUTME: Run with: node __tests__/e2e/conversation-relay-server.js

// Load environment variables from .env
require('dotenv').config();

/**
 * ConversationRelay E2E Test Server
 *
 * This server handles Twilio's ConversationRelay WebSocket protocol
 * and integrates with Claude for AI-powered voice conversations.
 *
 * Usage:
 *   1. Start the server: node __tests__/e2e/conversation-relay-server.js
 *   2. Expose via ngrok: ngrok http 8080
 *   3. Run the E2E test: node __tests__/e2e/conversation-relay-e2e.js
 *
 * Environment Variables:
 *   ANTHROPIC_API_KEY - Required for Claude integration
 *   PORT - Server port (default: 8080)
 *   FINALIZE_URL - URL to POST transcript on call end (optional)
 */

const { WebSocketServer } = require('ws');
const Anthropic = require('@anthropic-ai/sdk');

// Configuration
const PORT = process.env.PORT || 8080;
const MAX_TURNS = 10;
const FINALIZE_URL = process.env.FINALIZE_URL; // e.g., https://your-domain.twil.io/finalize-demo

// System prompt for the AI agent
const SYSTEM_PROMPT = `You are a helpful AI assistant taking a phone call.
You are being tested as part of an E2E test for the Twilio ConversationRelay system.

Important guidelines:
- Keep responses SHORT and conversational (1-2 sentences max)
- This is a VOICE conversation, so be natural and friendly
- When asked to end the call, say goodbye and the conversation will end
- If the user says "test complete", acknowledge and say goodbye

Start by greeting the caller and asking how you can help.`;

// Initialize Anthropic client
let anthropic;
try {
  anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  console.log('Anthropic client initialized');
} catch (error) {
  console.error('Failed to initialize Anthropic client. Set ANTHROPIC_API_KEY.');
  process.exit(1);
}

// Call context for each connection
class CallContext {
  constructor(callSid, streamSid, from, to) {
    this.callSid = callSid;
    this.streamSid = streamSid;
    this.from = from;
    this.to = to;
    this.messages = [];
    this.turnCount = 0;
    this.startTime = Date.now();
  }

  addUserMessage(text) {
    this.messages.push({
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    });
    this.turnCount++;
  }

  addAssistantMessage(text) {
    this.messages.push({
      role: 'assistant',
      content: text,
      timestamp: new Date().toISOString(),
    });
  }

  getMessages() {
    // Sliding window to keep context manageable
    const WINDOW_SIZE = 20;
    return this.messages.slice(-WINDOW_SIZE);
  }

  getDuration() {
    return (Date.now() - this.startTime) / 1000;
  }

  getTranscript() {
    return this.messages.map((m) => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
    }));
  }
}

// Post transcript to finalize endpoint
async function postToFinalize(context) {
  if (!FINALIZE_URL) {
    console.log('[FINALIZE] No FINALIZE_URL configured, skipping transcript POST');
    return;
  }

  try {
    const payload = {
      callSid: context.callSid,
      from: context.from,
      to: context.to,
      transcript: context.getTranscript(),
      duration: context.getDuration(),
      turnCount: context.turnCount,
    };

    console.log(`[FINALIZE] POSTing transcript to ${FINALIZE_URL}`);

    const response = await fetch(FINALIZE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log(`[FINALIZE] Response: ${JSON.stringify(result)}`);
  } catch (error) {
    console.error(`[FINALIZE] Error posting transcript: ${error.message}`);
  }
}

// Send message to Claude
async function sendToLLM(context) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150, // Keep responses short for voice
      system: SYSTEM_PROMPT,
      messages: context.getMessages(),
    });

    for (const block of response.content) {
      if (block.type === 'text') {
        return block.text;
      }
    }
    return "I'm sorry, I didn't catch that. Could you repeat?";
  } catch (error) {
    console.error('LLM error:', error.message);
    return "I'm having trouble processing that. Please try again.";
  }
}

// Create WebSocket server
const wss = new WebSocketServer({ port: Number(PORT) });

console.log(`
=================================================
  ConversationRelay E2E Test Server
=================================================
  Port: ${PORT}
  Finalize URL: ${FINALIZE_URL || '(not configured)'}

  Next steps:
  1. Expose this server via ngrok:
     ngrok http ${PORT}

  2. Copy the ngrok URL (wss://xxx.ngrok.io)

  3. Run the E2E test:
     CONVERSATION_RELAY_URL=wss://xxx.ngrok.io \\
     node __tests__/e2e/conversation-relay-e2e.js

  For full demo with transcript storage and SMS:
     FINALIZE_URL=https://your-domain.twil.io/finalize-demo \\
     node __tests__/e2e/conversation-relay-server.js
=================================================
`);

wss.on('connection', (ws) => {
  console.log('\n[CONNECTION] New WebSocket connection established');
  let context = null;

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      const timestamp = new Date().toISOString().slice(11, 23);

      switch (message.type) {
        case 'setup':
          context = new CallContext(
            message.callSid,
            message.streamSid,
            message.from,
            message.to
          );
          console.log(`[${timestamp}] SETUP - Call ${context.callSid}`);
          console.log(`  From: ${context.from}`);
          console.log(`  To: ${context.to}`);

          // Send initial greeting
          const greeting = await sendToLLM({
            getMessages: () => [{ role: 'user', content: 'Hello, the call has just started. Please greet me.' }]
          });
          console.log(`[${timestamp}] AI GREETING: "${greeting}"`);
          ws.send(JSON.stringify({ type: 'text', token: greeting }));
          context.addAssistantMessage(greeting);
          break;

        case 'prompt':
          if (!context) {
            console.log(`[${timestamp}] PROMPT received but no context`);
            break;
          }

          if (message.isFinal && message.voicePrompt) {
            console.log(`[${timestamp}] USER: "${message.voicePrompt}" (confidence: ${message.confidence?.toFixed(2) || 'N/A'})`);

            // Check turn limit
            if (context.turnCount >= MAX_TURNS) {
              console.log(`[${timestamp}] Max turns reached, ending call`);
              ws.send(JSON.stringify({
                type: 'text',
                token: "We've been chatting for a while. Thank you for testing! Goodbye."
              }));
              setTimeout(() => {
                ws.send(JSON.stringify({ type: 'end' }));
              }, 2000);
              break;
            }

            // Check for end triggers
            const lowerPrompt = message.voicePrompt.toLowerCase();
            if (lowerPrompt.includes('test complete') ||
                lowerPrompt.includes('goodbye') ||
                lowerPrompt.includes('end call') ||
                lowerPrompt.includes('hang up')) {
              console.log(`[${timestamp}] End trigger detected`);
              ws.send(JSON.stringify({
                type: 'text',
                token: "Thank you for testing the ConversationRelay system. Goodbye!"
              }));
              setTimeout(() => {
                ws.send(JSON.stringify({ type: 'end' }));
                console.log(`[${timestamp}] END signal sent`);
              }, 2000);
              break;
            }

            // Add user message and get LLM response
            context.addUserMessage(message.voicePrompt);
            const response = await sendToLLM(context);
            context.addAssistantMessage(response);

            console.log(`[${timestamp}] AI: "${response}"`);
            ws.send(JSON.stringify({ type: 'text', token: response }));
          } else if (!message.isFinal) {
            // Partial transcript - just log it
            console.log(`[${timestamp}] PARTIAL: "${message.voicePrompt || ''}"`);
          }
          break;

        case 'dtmf':
          console.log(`[${timestamp}] DTMF: ${message.digit}`);
          if (context) {
            // Handle specific DTMF digits
            if (message.digit === '0') {
              ws.send(JSON.stringify({
                type: 'text',
                token: "You pressed zero. In a real system, I would transfer you to an operator."
              }));
            } else if (message.digit === '#') {
              ws.send(JSON.stringify({
                type: 'text',
                token: "You pressed pound. Ending the call now. Goodbye!"
              }));
              setTimeout(() => {
                ws.send(JSON.stringify({ type: 'end' }));
              }, 1500);
            }
          }
          break;

        case 'interrupt':
          console.log(`[${timestamp}] INTERRUPT - User interrupted AI speech`);
          // In a more sophisticated implementation, we'd cancel any pending LLM requests
          break;

        default:
          console.log(`[${timestamp}] UNKNOWN message type: ${message.type}`);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', async () => {
    if (context) {
      const duration = context.getDuration().toFixed(1);
      console.log(`\n[CONNECTION] Closed - Call ${context.callSid}`);
      console.log(`  Duration: ${duration}s`);
      console.log(`  Turns: ${context.turnCount}`);

      // Post transcript to finalize endpoint
      await postToFinalize(context);
    } else {
      console.log('\n[CONNECTION] Closed (no call context)');
    }
  });

  ws.on('error', (error) => {
    console.error('[ERROR] WebSocket error:', error.message);
  });
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down server...');
  wss.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
