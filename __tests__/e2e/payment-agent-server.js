#!/usr/bin/env node
// ABOUTME: ConversationRelay Payment Agent with automated agent-assisted payment flow.
// ABOUTME: Orchestrates create_payment/update_payment via Twilio API, driven by Sync status callbacks.

require('dotenv').config({ override: true });

const { WebSocketServer } = require('ws');
const Anthropic = require('@anthropic-ai/sdk');
const twilio = require('twilio');

// Configuration
const PORT = process.env.PAYMENT_AGENT_PORT || 8080;
const MAX_TURNS = 30;
const SYNC_POLL_INTERVAL = 1500; // ms between Sync polls
const SYNC_POLL_TIMEOUT = 30000; // max wait per field

// Twilio client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
const SYNC_SERVICE_SID = process.env.TWILIO_SYNC_SERVICE_SID;
const STATUS_CALLBACK_URL = `${process.env.TWILIO_CALLBACK_BASE_URL}/pay/payment-status-sync`;
const PAYMENT_CONNECTOR = process.env.PAYMENT_CONNECTOR || 'Default';

// The customer's call SID is written to this Sync doc by the demo script
const SESSION_DOC = 'payment-demo-session';

const SYSTEM_PROMPT = `You are a payment processing agent on a phone call. You help customers make payments.

IMPORTANT — How payment collection works:
- This is an AGENT-ASSISTED payment system
- You guide the customer through the process conversationally
- When it's time to collect card details, the customer enters them on their PHONE KEYPAD (DTMF), NOT by speaking them
- You will NEVER hear or see the actual card digits — this is PCI compliant
- The system will notify you when each field is captured successfully
- Your job is to tell the customer WHAT to enter and WHEN

Payment flow:
1. Confirm the payment amount with the customer
2. When ready, say "I'm now setting up secure payment. Please enter your 16-digit card number on your phone's keypad."
3. After card is captured, say "Got your card. Now please enter your 4-digit expiration date — month and year."
4. After expiry is captured, say "Now please enter your 3-digit security code from the back of your card."
5. After CVV is captured, say "Last step — please enter your 5-digit ZIP code."
6. After all fields captured, the payment processes automatically
7. Tell the customer the result

Rules:
- Keep responses SHORT (1-2 sentences). This is a voice call.
- NEVER ask the customer to SAY their card number out loud
- If the customer tries to speak their card number, tell them to use their phone's keypad instead
- If a field fails to capture, ask them to try entering it again on their keypad
- Use the start_payment tool when the customer is ready to pay`;

// Tool: start the payment collection flow
const TOOLS = [
  {
    name: 'start_payment',
    description: 'Start the secure payment collection process. Call this when the customer has confirmed the amount and is ready to pay. The system will handle DTMF capture automatically.',
    input_schema: {
      type: 'object',
      properties: {
        amount: { type: 'string', description: 'Payment amount (e.g., "49.99")' },
      },
      required: ['amount'],
    },
  },
];

// Initialize Anthropic
let anthropic;
try {
  anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
} catch (_error) {
  log('ERROR', 'Failed to initialize Anthropic client. Set ANTHROPIC_API_KEY.');
  process.exit(1);
}

// ============================================
// STRUCTURED LOGGING
// ============================================

function log(category, message, data) {
  const ts = new Date().toISOString().slice(11, 23);
  const prefix = {
    'CUSTOMER': `[${ts}] 🎤 CUSTOMER`,
    'AGENT': `[${ts}] 🤖 AGENT`,
    'PAYMENT': `[${ts}] 💳 PAYMENT`,
    'DTMF': `[${ts}] 🔢 DTMF`,
    'SYSTEM': `[${ts}] ⚙️  SYSTEM`,
    'ERROR': `[${ts}] ❌ ERROR`,
    'SUCCESS': `[${ts}] ✅ SUCCESS`,
  }[category] || `[${ts}] ${category}`;

  if (data) {
    console.log(`${prefix}: ${message} — ${JSON.stringify(data)}`);
  } else {
    console.log(`${prefix}: ${message}`);
  }
}

// ============================================
// SYNC HELPERS
// ============================================

async function readSyncDoc(docName) {
  try {
    const doc = await twilioClient.sync.v1
      .services(SYNC_SERVICE_SID)
      .documents(docName)
      .fetch();
    return doc.data;
  } catch (e) {
    if (e.code === 20404) {return null;}
    throw e;
  }
}

async function writeSyncDoc(docName, data) {
  try {
    await twilioClient.sync.v1
      .services(SYNC_SERVICE_SID)
      .documents(docName)
      .update({ data });
  } catch (e) {
    if (e.code === 20404) {
      await twilioClient.sync.v1
        .services(SYNC_SERVICE_SID)
        .documents
        .create({ uniqueName: docName, data, ttl: 86400 });
    } else {
      throw e;
    }
  }
}

// Poll Sync doc until a condition is met
async function waitForSyncUpdate(docName, condition, timeoutMs = SYNC_POLL_TIMEOUT) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const data = await readSyncDoc(docName);
    if (data && condition(data)) {return data;}
    await new Promise((r) => setTimeout(r, SYNC_POLL_INTERVAL));
  }
  return null; // timeout
}

// ============================================
// PAYMENT ORCHESTRATION
// ============================================

const CAPTURE_FIELDS = [
  { field: 'payment-card-number', prompt: "Please enter your 16-digit card number on your phone's keypad now.", waitMs: 18000 },
  { field: 'expiration-date', prompt: 'Got it. Now enter your 4-digit expiration date — month then year. For example, 1-2-2-8 for December 2028.', waitMs: 12000 },
  { field: 'security-code', prompt: 'Now enter the 3-digit security code from the back of your card.', waitMs: 10000 },
  { field: 'postal-code', prompt: 'Last step — enter your ZIP code, then press the pound key to confirm.', waitMs: 12000 },
];

async function runPaymentFlow(customerCallSid, amount, ws) {
  log('PAYMENT', `Starting payment flow: $${amount} on call ${customerCallSid}`);

  // Reset the Sync doc with all fields in "required" so polling doesn't false-positive on stale data
  await writeSyncDoc('payment-session-active', {
    status: 'starting',
    required: 'payment-card-number,expiration-date,security-code,postal-code',
    capture: null,
    result: null,
    paymentCardNumber: null,
    paymentCardType: null,
    lastUpdated: new Date().toISOString(),
  });

  // Step 1: Create payment session
  log('PAYMENT', 'create_payment...');
  let payment;
  try {
    payment = await twilioClient.calls(customerCallSid).payments.create({
      idempotencyKey: `demo-${Date.now()}`,
      statusCallback: STATUS_CALLBACK_URL,
      paymentConnector: PAYMENT_CONNECTOR,
    });
  } catch (e) {
    log('ERROR', `create_payment failed: ${e.message}`);
    return { success: false, error: e.message };
  }
  log('PAYMENT', `Payment session created: ${payment.sid}`);

  // Step 2: Capture each field — poll Sync for the Required field to confirm capture
  for (const { field, prompt } of CAPTURE_FIELDS) {
    // Tell customer what to enter
    log('AGENT', prompt);
    ws.send(JSON.stringify({ type: 'text', token: prompt }));

    // Brief pause for TTS to start playing, then request capture
    await new Promise((r) => setTimeout(r, 2000));

    // Record timestamp BEFORE the update_payment call so we can ignore stale Sync data
    const captureRequestedAt = new Date().toISOString();

    log('PAYMENT', `update_payment: Capture=${field}`);
    try {
      await twilioClient.calls(customerCallSid).payments(payment.sid).update({
        idempotencyKey: `demo-${Date.now()}-${field}`,
        capture: field,
        statusCallback: STATUS_CALLBACK_URL,
      });
    } catch (e) {
      log('ERROR', `update_payment(${field}) failed: ${e.message}`);
      return { success: false, error: e.message };
    }

    // Poll Sync until a FRESH callback (after our update_payment) shows this field captured.
    // "Captured" means: Required doesn't include this field, OR Required is null/empty (all done).
    log('PAYMENT', `Waiting for ${field} to be captured (polling Required)...`);
    const captured = await waitForSyncUpdate('payment-session-active', (data) => {
      // Ignore stale data from before our update_payment call
      if (!data.lastUpdated || data.lastUpdated <= captureRequestedAt) {return false;}
      // Required is null/empty = all fields captured (last field case)
      if (data.required === null || data.required === '') {return true;}
      // Required still present but our field dropped off = this field captured
      if (typeof data.required === 'string') {return !data.required.includes(field);}
      return false;
    }, 45000); // 45s timeout — generous for DTMF entry

    if (captured) {
      log('SUCCESS', `${field} captured ✓ (remaining: ${captured.required || 'none'})`);
    } else {
      log('ERROR', `Timeout waiting for ${field} — customer may not have entered digits`);
      ws.send(JSON.stringify({ type: 'text', token: `I didn't receive your ${field.replace(/-/g, ' ')}. Please try entering it on your keypad again.` }));
    }
  }

  // Step 3: Complete payment
  log('PAYMENT', 'Completing payment...');
  try {
    await twilioClient.calls(customerCallSid).payments(payment.sid).update({
      idempotencyKey: `demo-${Date.now()}-complete`,
      status: 'complete',
      statusCallback: STATUS_CALLBACK_URL,
    });
  } catch (e) {
    log('ERROR', `Payment completion failed: ${e.message}`);
    return { success: false, error: e.message };
  }

  // Wait for final result in Sync
  await new Promise((r) => setTimeout(r, 3000));
  const finalStatus = await readSyncDoc('payment-session-active');
  log('PAYMENT', 'Final status', finalStatus);

  if (finalStatus && finalStatus.result === 'success') {
    log('SUCCESS', `Payment of $${amount} succeeded!`);
    return { success: true, result: finalStatus };
  } else {
    const errMsg = finalStatus?.result || finalStatus?.errorMessage || 'unknown error';
    log('ERROR', `Payment failed: ${errMsg}`);
    return { success: false, error: errMsg, result: finalStatus };
  }
}

// ============================================
// CALL CONTEXT
// ============================================

class CallContext {
  constructor(callSid, streamSid, from, to) {
    this.callSid = callSid;
    this.streamSid = streamSid;
    this.from = from;
    this.to = to;
    this.messages = [];
    this.turnCount = 0;
    this.startTime = Date.now();
    this.paymentInProgress = false;
    this.customerCallSid = null; // set from Sync doc
  }

  addUserMessage(text) {
    this.messages.push({ role: 'user', content: text });
    this.turnCount++;
  }

  addAssistantMessage(content) {
    if (typeof content === 'string') {
      this.messages.push({ role: 'assistant', content });
    } else {
      this.messages.push({ role: 'assistant', content });
    }
  }

  addToolResult(toolUseId, result) {
    this.messages.push({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUseId, content: JSON.stringify(result) }],
    });
  }

  getMessages() {
    return this.messages.slice(-30);
  }

  getDuration() {
    return (Date.now() - this.startTime) / 1000;
  }
}

// ============================================
// LLM + TOOL USE
// ============================================

async function sendToLLM(context, ws) {
  try {
    log('SYSTEM', `Sending ${context.getMessages().length} messages to Claude...`);
    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: context.getMessages(),
      tools: TOOLS,
    });
    log('SYSTEM', `Claude response: stop_reason=${response.stop_reason}, blocks=${response.content.map((b) => b.type).join(',')}, usage=${JSON.stringify(response.usage)}`);
    if (response.content.length === 0) {
      log('ERROR', `Empty response from Claude! Full response: ${JSON.stringify({ stop_reason: response.stop_reason, model: response.model, content: response.content })}`);
      log('SYSTEM', `Messages sent: ${JSON.stringify(context.getMessages().map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content.slice(0, 80) : '[blocks]' })))}`);
    }

    while (response.stop_reason === 'tool_use') {
      const toolBlock = response.content.find((b) => b.type === 'tool_use');
      if (!toolBlock) {break;}

      log('SYSTEM', `Claude called tool: ${toolBlock.name}`, toolBlock.input);
      context.addAssistantMessage(response.content);

      if (toolBlock.name === 'start_payment') {
        context.paymentInProgress = true;

        // Read customer call SID from Sync
        if (!context.customerCallSid) {
          const session = await readSyncDoc(SESSION_DOC);
          if (session && session.customerCallSid) {
            context.customerCallSid = session.customerCallSid;
            log('SYSTEM', `Customer call SID: ${context.customerCallSid}`);
          } else {
            log('ERROR', 'No customer call SID found in Sync');
            context.addToolResult(toolBlock.id, { success: false, error: 'Customer call SID not found' });
            context.paymentInProgress = false;
            response = await anthropic.messages.create({
              model: 'claude-sonnet-4-20250514', max_tokens: 300,
              system: SYSTEM_PROMPT, messages: context.getMessages(), tools: TOOLS,
            });
            continue;
          }
        }

        const payResult = await runPaymentFlow(context.customerCallSid, toolBlock.input.amount, ws);
        context.paymentInProgress = false;
        context.addToolResult(toolBlock.id, payResult);
      } else {
        context.addToolResult(toolBlock.id, { error: `Unknown tool: ${toolBlock.name}` });
      }

      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514', max_tokens: 300,
        system: SYSTEM_PROMPT, messages: context.getMessages(), tools: TOOLS,
      });
    }

    const textBlock = response.content.find((b) => b.type === 'text');
    const text = textBlock?.text || "I'm processing your request.";
    if (response.stop_reason !== 'tool_use') {
      context.addAssistantMessage(text);
    }
    return text;
  } catch (error) {
    log('ERROR', `LLM error: ${error.message}`);
    return "I'm having trouble processing that. Please try again.";
  }
}

// ============================================
// WEBSOCKET SERVER
// ============================================

const wss = new WebSocketServer({ port: Number(PORT) });

console.log(`
╔══════════════════════════════════════════════════╗
║  Payment Agent — ConversationRelay Server        ║
║  Port: ${PORT}                                         ║
║  Connector: ${PAYMENT_CONNECTOR}                              ║
║  Status CB: ${STATUS_CALLBACK_URL.slice(0, 40)}...  ║
╠══════════════════════════════════════════════════╣
║  Waiting for connection...                       ║
╚══════════════════════════════════════════════════╝
`);

wss.on('connection', (ws) => {
  log('SYSTEM', 'WebSocket connection established');
  let context = null;

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'setup': {
          context = new CallContext(message.callSid, message.streamSid, message.from, message.to);
          log('SYSTEM', `Call setup — SID: ${context.callSid}, From: ${context.from}, To: ${context.to}`);

          context.addUserMessage('The call has just started. Greet the customer and ask how you can help.');
          const greeting = await sendToLLM(context, ws);
          log('AGENT', greeting);
          ws.send(JSON.stringify({ type: 'text', token: greeting }));
          break;
        }

        case 'prompt':
          if (!context) {break;}
          if (!message.last || !message.voicePrompt) {break;}
          if (context.paymentInProgress) {
            // During payment, ignore speech — DTMF is being captured
            log('SYSTEM', `(ignored during payment) "${message.voicePrompt}"`);
            break;
          }

          log('CUSTOMER', `"${message.voicePrompt}"`);

          if (context.turnCount >= MAX_TURNS) {
            ws.send(JSON.stringify({ type: 'text', token: "We've been on for a while. Thank you for calling. Goodbye." }));
            setTimeout(() => ws.send(JSON.stringify({ type: 'end' })), 2000);
            break;
          }

          context.addUserMessage(message.voicePrompt);

          const lower = message.voicePrompt.toLowerCase();
          if (lower.includes('goodbye') || lower.includes('end call')) {
            ws.send(JSON.stringify({ type: 'text', token: 'Thank you for calling. Have a great day!' }));
            setTimeout(() => ws.send(JSON.stringify({ type: 'end' })), 2000);
            break;
          }

          const response = await sendToLLM(context, ws);
          log('AGENT', response);
          ws.send(JSON.stringify({ type: 'text', token: response }));
          break;

        case 'dtmf':
          log('DTMF', `Digit: ${message.digit}`);
          break;

        case 'interrupt':
          log('SYSTEM', 'Interrupt received');
          break;

        default:
          log('SYSTEM', `Unknown message type: ${message.type}`);
      }
    } catch (error) {
      log('ERROR', `Message processing error: ${error.message}`);
    }
  });

  ws.on('close', () => {
    if (context) {
      log('SYSTEM', `Call ended — Duration: ${context.getDuration().toFixed(1)}s, Turns: ${context.turnCount}`);
    }
  });

  ws.on('error', (error) => {
    log('ERROR', `WebSocket error: ${error.message}`);
  });
});

process.on('SIGINT', () => {
  console.log('\nShutting down...');
  wss.close(() => process.exit(0));
});
