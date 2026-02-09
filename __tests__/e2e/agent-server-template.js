#!/usr/bin/env node
// ABOUTME: Configurable ConversationRelay WebSocket server for agent-to-agent testing.
// ABOUTME: Can be configured as questioner (Agent A) or answerer (Agent B) role.

require('dotenv').config();

const { WebSocketServer } = require('ws');
const Anthropic = require('@anthropic-ai/sdk');

/**
 * Agent Server Template for Agent-to-Agent Testing
 *
 * This server can be configured to play different roles in automated testing:
 * - QUESTIONER: Initiates conversation, asks questions, validates responses
 * - ANSWERER: Responds to questions, provides information
 *
 * Usage:
 *   AGENT_ROLE=questioner PORT=8080 node agent-server-template.js
 *   AGENT_ROLE=answerer PORT=8081 node agent-server-template.js
 *
 * Environment Variables:
 *   ANTHROPIC_API_KEY - Required for Claude integration
 *   PORT - Server port (default: 8080)
 *   AGENT_ROLE - 'questioner' or 'answerer' (default: answerer)
 *   AGENT_ID - Unique identifier for this agent (default: agent-{role})
 *   SYNC_SERVICE_SID - Twilio Sync Service SID for transcript storage
 *   TEST_SESSION_ID - Unique ID for this test session
 */

// Configuration
const PORT = process.env.PORT || 8080;
const AGENT_ROLE = process.env.AGENT_ROLE || 'answerer';
const AGENT_ID = process.env.AGENT_ID || `agent-${AGENT_ROLE}`;
const SYNC_SERVICE_SID = process.env.TWILIO_SYNC_SERVICE_SID;
const TEST_SESSION_ID = process.env.TEST_SESSION_ID || `test-${Date.now()}`;
const MAX_TURNS = parseInt(process.env.MAX_TURNS || '8', 10);

// System prompts for different roles
const SYSTEM_PROMPTS = {
  questioner: `You are Agent A, the QUESTIONER in an automated test conversation.

Your job is to:
1. Ask 2-3 specific questions to verify the other agent is working correctly
2. Wait for and acknowledge each response
3. Keep track of whether responses are valid
4. End the conversation after the test is complete

Test questions to ask (in order):
1. "Can you tell me what your role is in this test?"
2. "What is two plus two?"
3. "Say 'test successful' if you can hear me clearly."

After all questions are answered, say "Test complete. Thank you for participating."

Keep responses SHORT (1-2 sentences). This is a voice conversation.
Do NOT repeat questions if you've already asked them.`,

  answerer: `You are Agent B, the ANSWERER in an automated test conversation.

Your job is to:
1. Listen to questions from the other agent
2. Provide clear, accurate responses
3. Be helpful and concise

For test verification:
- If asked about your role, say "I am Agent B, the answerer in this test."
- If asked math questions, provide the correct answer
- If asked to say specific phrases, repeat them exactly
- If the questioner says "test complete", say "Acknowledged. Goodbye."

Keep responses SHORT (1-2 sentences). This is a voice conversation.`,
};

// Initialize Anthropic client
let anthropic;
try {
  anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  console.log('Anthropic client initialized');
} catch (_error) {
  console.error('Failed to initialize Anthropic client. Set ANTHROPIC_API_KEY.');
  process.exit(1);
}

// Initialize Twilio client for Sync storage (optional)
let twilioClient;
try {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    const twilio = require('twilio');
    twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    console.log('Twilio client initialized for Sync storage');
  }
} catch (_error) {
  console.log('Twilio client not available (Sync storage disabled)');
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
    this.role = AGENT_ROLE;
    this.agentId = AGENT_ID;
    this.questionsAsked = 0;
    this.testResults = {
      questionsAsked: 0,
      responsesReceived: 0,
      validResponses: 0,
      errors: [],
    };
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
    const WINDOW_SIZE = 20;
    return this.messages.slice(-WINDOW_SIZE).map((m) => ({
      role: m.role,
      content: m.content,
    }));
  }

  getDuration() {
    return (Date.now() - this.startTime) / 1000;
  }

  getTranscript() {
    return {
      sessionId: TEST_SESSION_ID,
      agentId: this.agentId,
      role: this.role,
      callSid: this.callSid,
      from: this.from,
      to: this.to,
      duration: this.getDuration(),
      turnCount: this.turnCount,
      messages: this.messages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      })),
      testResults: this.testResults,
    };
  }
}

// Store transcript to Sync document
async function storeTranscript(context) {
  if (!twilioClient || !SYNC_SERVICE_SID) {
    console.log('[SYNC] Sync storage not configured, skipping transcript storage');
    return;
  }

  try {
    const documentName = `agent-test-${TEST_SESSION_ID}-${context.agentId}`;
    const transcript = context.getTranscript();

    console.log(`[SYNC] Storing transcript to ${documentName}`);

    await twilioClient.sync.v1
      .services(SYNC_SERVICE_SID)
      .documents
      .create({
        uniqueName: documentName,
        data: transcript,
        ttl: 86400, // 24 hour TTL
      })
      .catch(async (err) => {
        // If document exists, update it
        if (err.code === 54301) {
          await twilioClient.sync.v1
            .services(SYNC_SERVICE_SID)
            .documents(documentName)
            .update({ data: transcript });
        } else {
          throw err;
        }
      });

    console.log('[SYNC] Transcript stored successfully');
  } catch (error) {
    console.error(`[SYNC] Error storing transcript: ${error.message}`);
  }
}

// Send message to Claude
async function sendToLLM(context) {
  try {
    const systemPrompt = SYSTEM_PROMPTS[context.role] || SYSTEM_PROMPTS.answerer;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150,
      system: systemPrompt,
      messages: context.getMessages(),
    });

    for (const block of response.content) {
      if (block.type === 'text') {
        return block.text;
      }
    }
    return "I'm having trouble processing that.";
  } catch (error) {
    console.error('LLM error:', error.message);
    context.testResults.errors.push(error.message);
    return "I'm having trouble processing that. Please try again.";
  }
}

// Create WebSocket server
const wss = new WebSocketServer({ port: Number(PORT) });

console.log(`
=================================================
  Agent-to-Agent Test Server
=================================================
  Port: ${PORT}
  Role: ${AGENT_ROLE.toUpperCase()}
  Agent ID: ${AGENT_ID}
  Session ID: ${TEST_SESSION_ID}
  Max Turns: ${MAX_TURNS}
  Sync Storage: ${SYNC_SERVICE_SID ? 'Enabled' : 'Disabled'}

  Ready for connections...
=================================================
`);

wss.on('connection', (ws) => {
  console.log(`\n[CONNECTION] New WebSocket connection (${AGENT_ROLE})`);
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
          console.log(`  From: ${context.from}`);
          console.log(`  To: ${context.to}`);
          console.log(`  Role: ${AGENT_ROLE}`);

          // Initial greeting differs by role
          let greeting;
          if (AGENT_ROLE === 'questioner') {
            greeting = await sendToLLM({
              role: AGENT_ROLE,
              getMessages: () => [
                { role: 'user', content: 'The call has started. Begin your test by greeting the other agent and asking your first question.' }
              ]
            });
            context.questionsAsked = 1;
            context.testResults.questionsAsked = 1;
          } else {
            greeting = await sendToLLM({
              role: AGENT_ROLE,
              getMessages: () => [
                { role: 'user', content: 'Hello, the call has just started. Greet the questioner.' }
              ]
            });
          }

          console.log(`[${timestamp}] ${AGENT_ID}: "${greeting}"`);
          ws.send(JSON.stringify({ type: 'text', token: greeting }));
          context.addAssistantMessage(greeting);
          break;
        }

        case 'prompt':
          if (!context) {
            console.log(`[${timestamp}] PROMPT received but no context`);
            break;
          }

          if (message.last && message.voicePrompt) {
            console.log(`[${timestamp}] RECEIVED: "${message.voicePrompt}"`);
            context.testResults.responsesReceived++;

            // Check turn limit
            if (context.turnCount >= MAX_TURNS) {
              console.log(`[${timestamp}] Max turns reached, ending test`);
              const endMessage = AGENT_ROLE === 'questioner'
                ? 'Test complete due to turn limit. Thank you.'
                : 'Acknowledged. The test has ended.';
              ws.send(JSON.stringify({ type: 'text', token: endMessage }));
              await storeTranscript(context);
              setTimeout(() => {
                ws.send(JSON.stringify({ type: 'end' }));
              }, 2000);
              break;
            }

            // Check for end triggers
            const lowerPrompt = message.voicePrompt.toLowerCase();
            if (lowerPrompt.includes('test complete') ||
                lowerPrompt.includes('goodbye') ||
                lowerPrompt.includes('acknowledged')) {
              console.log(`[${timestamp}] End trigger detected`);
              const endMessage = AGENT_ROLE === 'questioner'
                ? 'Ending the test now. Goodbye.'
                : 'Goodbye. Test ended.';
              ws.send(JSON.stringify({ type: 'text', token: endMessage }));
              await storeTranscript(context);
              setTimeout(() => {
                ws.send(JSON.stringify({ type: 'end' }));
              }, 2000);
              break;
            }

            // Add user message and get LLM response
            context.addUserMessage(message.voicePrompt);
            const response = await sendToLLM(context);
            context.addAssistantMessage(response);

            console.log(`[${timestamp}] ${AGENT_ID}: "${response}"`);
            ws.send(JSON.stringify({ type: 'text', token: response }));
          }
          break;

        case 'interrupt':
          console.log(`[${timestamp}] INTERRUPT`);
          break;

        case 'dtmf':
          console.log(`[${timestamp}] DTMF: ${message.digit}`);
          break;

        default:
          console.log(`[${timestamp}] UNKNOWN: ${message.type}`);
      }
    } catch (error) {
      console.error('Error processing message:', error);
      if (context) {
        context.testResults.errors.push(error.message);
      }
    }
  });

  ws.on('close', async () => {
    if (context) {
      const duration = context.getDuration().toFixed(1);
      console.log(`\n[CONNECTION] Closed - ${AGENT_ID}`);
      console.log(`  Duration: ${duration}s`);
      console.log(`  Turns: ${context.turnCount}`);
      console.log(`  Test Results: ${JSON.stringify(context.testResults)}`);

      await storeTranscript(context);
    } else {
      console.log('\n[CONNECTION] Closed (no call context)');
    }
  });

  ws.on('error', (error) => {
    console.error('[ERROR] WebSocket error:', error.message);
    if (context) {
      context.testResults.errors.push(error.message);
    }
  });
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\nShutting down agent server...');
  wss.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
