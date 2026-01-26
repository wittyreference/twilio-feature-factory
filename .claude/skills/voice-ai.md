# Voice AI Builder Skill

Building voice AI applications with Twilio ConversationRelay and the Voice AI Builder generators. Load this skill when designing or implementing voice AI agents.

---

## ConversationRelay Architecture

ConversationRelay connects phone calls to WebSocket servers for real-time voice AI:

```
Phone Call → Twilio → TwiML Handler → <Connect><ConversationRelay>
                                              ↓
                            WebSocket Server ← → LLM (Claude/OpenAI)
                                              ↓
                                       Speech Synthesis
```

**Key Components:**
1. **TwiML Handler** - Twilio Function returning `<Connect><ConversationRelay>` TwiML
2. **WebSocket Server** - Handles speech-to-text, LLM calls, text-to-speech coordination
3. **LLM Integration** - Anthropic Claude or OpenAI for conversation intelligence

---

## Use Case Templates

### basic-assistant

Simple conversational AI without tools. Best for information queries and basic customer interaction.

```typescript
const basicAssistantConfig: UseCaseConfig = {
  name: 'basic-assistant',
  description: 'Simple conversational AI without tool calling',
  systemPromptTemplate: `You are a helpful voice assistant. Be concise and conversational.
Keep responses short (1-2 sentences) since this is a phone conversation.
If you don't know something, say so honestly.`,
  defaultVoice: 'Polly.Matthew',
  defaultLanguage: 'en-US',
  defaultTools: [],
  escalationTriggers: [],
  maxTurns: 20,
};
```

### customer-service (Recommended for Testing)

Tool-calling agent with account lookup, order status, and human escalation.

```typescript
const customerServiceConfig: UseCaseConfig = {
  name: 'customer-service',
  description: 'Customer service agent with tool calling and escalation',
  systemPromptTemplate: `You are a customer service agent for {{COMPANY_NAME}}.
You can help customers with:
- Looking up their account information
- Checking order status
- Answering general questions

If the customer asks for something you cannot help with, offer to transfer them to a human agent.
Keep responses concise for phone conversation.`,
  defaultVoice: 'Polly.Matthew',
  defaultLanguage: 'en-US',
  defaultTools: [
    {
      name: 'lookup_account',
      description: 'Look up customer account by phone number or account ID',
      inputSchema: {
        type: 'object',
        properties: {
          phoneNumber: { type: 'string', description: 'Customer phone number' },
          accountId: { type: 'string', description: 'Account ID' },
        },
      },
    },
    {
      name: 'check_order_status',
      description: 'Check the status of a customer order',
      inputSchema: {
        type: 'object',
        properties: {
          orderId: { type: 'string', description: 'Order ID' },
        },
        required: ['orderId'],
      },
    },
    {
      name: 'transfer_to_agent',
      description: 'Transfer the call to a human agent',
      inputSchema: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Reason for transfer' },
          department: { type: 'string', enum: ['billing', 'technical', 'general'] },
        },
        required: ['reason'],
      },
    },
  ],
  escalationTriggers: [
    'talk to a human',
    'agent please',
    'speak to someone',
    'real person',
    'supervisor',
    'manager',
  ],
  maxTurns: 30,
};
```

### appointment-booking

Calendar integration for scheduling, availability checking, and confirmations.

```typescript
const appointmentBookingConfig: UseCaseConfig = {
  name: 'appointment-booking',
  description: 'Appointment scheduling agent with calendar integration',
  systemPromptTemplate: `You are an appointment scheduling assistant for {{COMPANY_NAME}}.
You can help callers:
- Check available appointment times
- Book new appointments
- Cancel or reschedule existing appointments

Always confirm appointment details before booking.
Keep responses concise for phone conversation.`,
  defaultVoice: 'Polly.Joanna',
  defaultLanguage: 'en-US',
  defaultTools: [
    {
      name: 'check_availability',
      description: 'Check available appointment slots',
      inputSchema: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Date to check (YYYY-MM-DD)' },
          serviceType: { type: 'string', description: 'Type of service/appointment' },
        },
        required: ['date'],
      },
    },
    {
      name: 'book_appointment',
      description: 'Book an appointment',
      inputSchema: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Appointment date (YYYY-MM-DD)' },
          time: { type: 'string', description: 'Appointment time (HH:MM)' },
          customerName: { type: 'string', description: 'Customer name' },
          customerPhone: { type: 'string', description: 'Customer phone' },
          serviceType: { type: 'string', description: 'Type of service' },
        },
        required: ['date', 'time', 'customerName'],
      },
    },
    {
      name: 'cancel_appointment',
      description: 'Cancel an existing appointment',
      inputSchema: {
        type: 'object',
        properties: {
          appointmentId: { type: 'string', description: 'Appointment ID' },
          reason: { type: 'string', description: 'Cancellation reason' },
        },
        required: ['appointmentId'],
      },
    },
  ],
  escalationTriggers: [
    'talk to someone',
    'speak to a person',
    'human please',
  ],
  maxTurns: 25,
};
```

---

## ConversationRelay Protocol

### Incoming Messages (from Twilio)

| Type | Fields | Purpose |
|------|--------|---------|
| `setup` | callSid, streamSid, from, to, customParameters | Initial handshake when call connects |
| `prompt` | voicePrompt, confidence, isFinal, language | User speech (partial or final) |
| `dtmf` | digit | Keypad input (0-9, *, #) |
| `interrupt` | - | User interrupted AI speech |

### Outgoing Messages (to Twilio)

| Type | Fields | Purpose |
|------|--------|---------|
| `text` | token | Send response text for TTS |
| `end` | - | End the conversation/call |

### Example Message Handling

```typescript
ws.on('message', async (data: Buffer) => {
  const message = JSON.parse(data.toString());

  switch (message.type) {
    case 'setup':
      // Initialize call context
      context = {
        callSid: message.callSid,
        from: message.from,
        to: message.to,
        messages: [],
        turnCount: 0,
      };
      break;

    case 'prompt':
      // Handle user speech (only process final transcripts)
      if (message.isFinal && message.voicePrompt) {
        context.messages.push({ role: 'user', content: message.voicePrompt });
        const response = await sendToLLM(context.messages);
        context.messages.push({ role: 'assistant', content: response });
        ws.send(JSON.stringify({ type: 'text', token: response }));
      }
      break;

    case 'dtmf':
      // Handle keypad input (e.g., '0' for operator)
      if (message.digit === '0') {
        // Transfer to human
      }
      break;

    case 'interrupt':
      // User interrupted - stop current response
      break;
  }
});
```

---

## Voice Configuration

### Recommended Voices

| Voice | Provider | Gender | Best For |
|-------|----------|--------|----------|
| `Polly.Matthew` | Amazon | Male | General assistant, professional |
| `Polly.Joanna` | Amazon | Female | Customer service, friendly |
| `Polly.Amy` | Amazon | Female | UK English |
| `Google.en-US-Neural2-D` | Google | Male | Natural, premium |
| `Google.en-US-Neural2-F` | Google | Female | Natural, premium |

### Transcription Providers

| Provider | Best For |
|----------|----------|
| `google` | Default, good accuracy, wide language support |
| `deepgram` | Noisy environments, faster latency |

### Speech Models

| Model | Best For |
|-------|----------|
| `telephony` | Phone calls (recommended - optimized for 8kHz audio) |
| `default` | General purpose |

### TwiML Configuration

```javascript
connect.conversationRelay({
  url: 'wss://your-server.com/relay',
  voice: 'Polly.Matthew',
  language: 'en-US',
  transcriptionProvider: 'google',
  speechModel: 'telephony',
  dtmfDetection: 'true',
  interruptible: 'true',
  interruptByDtmf: 'true',
  // profanityFilter: 'true', // Optional
});
```

---

## Generator Inputs

### TwiML Handler Generator

```typescript
interface TwimlGeneratorInput {
  useCaseType: 'basic-assistant' | 'customer-service' | 'appointment-booking' | 'custom';
  relayUrl: string;           // WebSocket server URL (wss://)
  voiceOptions: {
    voice: string;            // e.g., 'Polly.Matthew'
    language: string;         // e.g., 'en-US'
  };
  transcriptionProvider: 'google' | 'deepgram';
  speechModel: 'telephony' | 'default';
  dtmfEnabled: boolean;
  interruptible: boolean;
  welcomeGreeting?: string;   // Optional greeting before ConversationRelay
}
```

### WebSocket Server Generator

```typescript
interface WebSocketGeneratorInput {
  useCaseType: 'basic-assistant' | 'customer-service' | 'appointment-booking' | 'custom';
  llmProvider: 'anthropic' | 'openai';
  systemPrompt: string;
  tools?: ToolDefinition[];
  contextStrategy: 'sliding-window' | 'full-history' | 'summarize';
  maxTurns: number;
}
```

### LLM Integration Generator

```typescript
interface LLMIntegrationInput {
  provider: 'anthropic' | 'openai';
  model: string;              // e.g., 'claude-sonnet-4-20250514', 'gpt-4o'
  streamingEnabled: boolean;
  toolCalling: boolean;
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
}
```

---

## LLM Provider Details

### Anthropic Claude (Recommended)

```typescript
// Streaming (for real-time voice)
const stream = await client.messages.stream({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  system: systemPrompt,
  messages: conversationHistory,
  tools: toolDefinitions,
});

stream.on('text', (text) => {
  // Send partial response to TTS
  ws.send(JSON.stringify({ type: 'text', token: text }));
});

// Non-streaming (for batch processing)
const response = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  system: systemPrompt,
  messages: conversationHistory,
});
```

**Recommended Models:**
- `claude-sonnet-4-20250514` - Best balance of quality and latency
- `claude-haiku-3-5-20241022` - Fastest, good for simple interactions

### OpenAI

```typescript
const response = await client.chat.completions.create({
  model: 'gpt-4o',
  max_tokens: 1024,
  stream: true,
  messages: [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
  ],
  tools: toolDefinitions,
});
```

**Recommended Models:**
- `gpt-4o` - Best quality
- `gpt-4o-mini` - Faster, lower cost

---

## Context Management Strategies

### Sliding Window (Recommended for Voice)

Keep only the last N messages to prevent context overflow:

```typescript
function manageContext(messages: Message[]): Message[] {
  const WINDOW_SIZE = 20;
  return messages.length > WINDOW_SIZE
    ? messages.slice(-WINDOW_SIZE)
    : messages;
}
```

### Full History

Keep all messages (risk of context overflow on long calls):

```typescript
function manageContext(messages: Message[]): Message[] {
  return messages;
}
```

### Summarize

Periodically summarize conversation and replace history:

```typescript
async function manageContext(messages: Message[]): Promise<Message[]> {
  if (messages.length > 30) {
    const summary = await summarizeConversation(messages.slice(0, -10));
    return [
      { role: 'system', content: `Previous conversation summary: ${summary}` },
      ...messages.slice(-10),
    ];
  }
  return messages;
}
```

---

## Testing Voice AI

### Unit Tests
- Generator output validation
- Template variable substitution
- Voice config validation

### Integration Tests (use customer-service template)
- WebSocket message handling
- LLM response formatting
- Tool execution flow

### E2E Tests
1. Deploy generated code to Twilio Functions
2. Start WebSocket server
3. Make test call via `make_call` MCP tool
4. Validate with DeepValidator
5. Check Voice Insights for quality metrics

---

## Related Documentation

- [ConversationRelay Protocol](/functions/conversation-relay/CLAUDE.md) - Full protocol reference
- [Voice Skill](/.claude/skills/voice.md) - Voice development decision guide
- [Voice AI Builder](/agents/voice-ai-builder/CLAUDE.md) - Generator documentation
- [Voice MCP Tools](/agents/mcp-servers/twilio/CLAUDE.md) - Voice API tools
