#!/usr/bin/env node
// ABOUTME: ConversationRelay WebSocket server for the Customer Agent in payment testing.
// ABOUTME: Portrays a customer who provides test card details when prompted by the Payment Agent.

require('dotenv').config({ override: true });

const { WebSocketServer } = require('ws');
const Anthropic = require('@anthropic-ai/sdk');

// Configuration
const PORT = process.env.CUSTOMER_AGENT_PORT || 8081;
const MAX_TURNS = 20;
const SCENARIO = process.env.PAYMENT_SCENARIO || 'success';

// Scenario-specific card details
const SCENARIOS = {
  success: {
    cardNumber: '4242 4242 4242 4242',
    expiration: '12/28',
    securityCode: '123',
    zipCode: '10001',
    amount: '49.99',
    description: 'You want to pay your monthly subscription of $49.99.',
  },
  decline: {
    cardNumber: '4000 0000 0000 0002',
    expiration: '12/28',
    securityCode: '123',
    zipCode: '10001',
    amount: '49.99',
    description: 'You want to pay your monthly subscription of $49.99.',
  },
  expired: {
    cardNumber: '4000 0000 0000 0069',
    expiration: '01/20',
    securityCode: '456',
    zipCode: '90210',
    amount: '25.00',
    description: 'You want to pay a balance of $25.00.',
  },
};

const scenario = SCENARIOS[SCENARIO] || SCENARIOS.success;

const SYSTEM_PROMPT = `You are a customer on a phone call with a payment agent. ${scenario.description}

When the agent asks for your payment details, provide them ONE AT A TIME when asked:
- Card number: ${scenario.cardNumber}
- Expiration date: ${scenario.expiration}
- Security code: ${scenario.securityCode}
- ZIP code: ${scenario.zipCode}

Important:
- Keep responses SHORT (1-2 sentences max). This is a voice call.
- Be natural and conversational — you're a real person
- Only provide information when specifically asked for it
- When asked about the card number, read it in groups of four digits
- Confirm the payment amount when the agent tells you
- If the payment fails, say "Oh no, let me check my card" and then say goodbye
- If the agent offers a receipt, say "Yes please, send it to my phone"
- When the agent says goodbye, say "Thank you, have a great day. Goodbye."`;

// Initialize Anthropic client
let anthropic;
try {
  anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  console.log('Anthropic client initialized');
} catch (_error) {
  console.log('Failed to initialize Anthropic client. Set ANTHROPIC_API_KEY.');
  process.exit(1);
}

// Call context (no tool use — simple conversation)
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
    this.messages.push({ role: 'user', content: text });
    this.turnCount++;
  }

  addAssistantMessage(text) {
    this.messages.push({ role: 'assistant', content: text });
  }

  getMessages() {
    const WINDOW_SIZE = 20;
    return this.messages.slice(-WINDOW_SIZE).map((m) => ({
      role: m.role,
      content: m.content,
    }));
  }

  getDuration() {
    return (Date.now() - this.startTime) / 1000;
  }
}

// Send message to Claude (no tools)
async function sendToLLM(context) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150,
      system: SYSTEM_PROMPT,
      messages: context.getMessages(),
    });

    for (const block of response.content) {
      if (block.type === 'text') {
        return block.text;
      }
    }
    return 'Sorry, could you repeat that?';
  } catch (error) {
    console.log('LLM error:', error.message);
    return "I'm sorry, I didn't catch that.";
  }
}

// Create WebSocket server
const wss = new WebSocketServer({ port: Number(PORT) });

console.log(`
=================================================
  Customer Agent ConversationRelay Server
=================================================
  Port: ${PORT}
  Scenario: ${SCENARIO}
  Card: ...${scenario.cardNumber.slice(-4)}
  Amount: $${scenario.amount}

  Next steps:
  1. Expose via ngrok: ngrok http ${PORT}
  2. Set CUSTOMER_AGENT_RELAY_URL to the wss:// URL
  3. Start the payment test
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
        case 'setup': {
          context = new CallContext(
            message.callSid,
            message.streamSid,
            message.from,
            message.to
          );
          console.log(`[${timestamp}] SETUP - Call ${context.callSid}`);

          // Customer initiates — say hello and state their need
          context.addUserMessage('The call has just connected. Introduce yourself and say you need to make a payment.');
          const greeting = await sendToLLM(context);
          console.log(`[${timestamp}] CUSTOMER: "${greeting}"`);
          ws.send(JSON.stringify({ type: 'text', token: greeting }));
          break;
        }

        case 'prompt':
          if (!context) {break;}

          if (message.last && message.voicePrompt) {
            console.log(`[${timestamp}] AGENT SAYS: "${message.voicePrompt}"`);

            if (context.turnCount >= MAX_TURNS) {
              ws.send(JSON.stringify({
                type: 'text',
                token: 'I need to go now. Thank you. Goodbye.',
              }));
              setTimeout(() => ws.send(JSON.stringify({ type: 'end' })), 2000);
              break;
            }

            // Check for end triggers from the agent
            const lower = message.voicePrompt.toLowerCase();
            if (lower.includes('goodbye') || lower.includes('have a great day')) {
              ws.send(JSON.stringify({
                type: 'text',
                token: 'Thank you, have a great day. Goodbye.',
              }));
              setTimeout(() => ws.send(JSON.stringify({ type: 'end' })), 2000);
              break;
            }

            context.addUserMessage(message.voicePrompt);
            const response = await sendToLLM(context);
            console.log(`[${timestamp}] CUSTOMER: "${response}"`);
            ws.send(JSON.stringify({ type: 'text', token: response }));
          }
          break;

        case 'dtmf':
          console.log(`[${timestamp}] DTMF: ${message.digit}`);
          break;

        case 'interrupt':
          console.log(`[${timestamp}] INTERRUPT`);
          break;

        default:
          console.log(`[${timestamp}] UNKNOWN: ${message.type}`);
      }
    } catch (error) {
      console.log('Error processing message:', error.message);
    }
  });

  ws.on('close', () => {
    if (context) {
      console.log(`\n[CONNECTION] Closed - Call ${context.callSid}`);
      console.log(`  Duration: ${context.getDuration().toFixed(1)}s`);
      console.log(`  Turns: ${context.turnCount}`);
    }
  });

  ws.on('error', (error) => {
    console.log('[ERROR] WebSocket error:', error.message);
  });
});

process.on('SIGINT', () => {
  console.log('\n\nShutting down customer agent server...');
  wss.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
