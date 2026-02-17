# Voice AI Builder

Generates complete voice AI applications using Twilio's ConversationRelay.

## Purpose

The Voice AI Builder creates production-ready voice AI agents by generating:

1. **TwiML Handlers** - Serverless functions that connect calls to ConversationRelay
2. **WebSocket Servers** - Real-time speech processing with LLM integration
3. **LLM Integration** - Anthropic Claude SDK connection code

## Architecture

```
User Request: "Build a customer service agent"
        ↓
voice-ai-architect → Selects template, identifies tools
        ↓
voice-ai-spec → Detailed specification with test scenarios
        ↓
test-gen → Writes failing tests (TDD Red)
        ↓
dev → Implements generators to pass tests (TDD Green)
        ↓
qa → Validates generated code quality
        ↓
review → Security and pattern review
        ↓
docs → Updates documentation
```

## Generators

### twiml-handler.ts

Generates Twilio Functions that return ConversationRelay TwiML:

```javascript
// Generated output
exports.handler = function(context, event, callback) {
  const twiml = new Twilio.twiml.VoiceResponse();
  const connect = twiml.connect();
  connect.conversationRelay({
    url: context.CONVERSATION_RELAY_URL,
    voice: 'Google.en-US-Neural2-F',
    language: 'en-US',
    // ... configured options
  });
  callback(null, twiml);
};
```

### websocket-server.ts

Generates WebSocket server handling ConversationRelay protocol:

```typescript
// Generated output handles:
// - 'setup' message with callSid, from, to
// - 'prompt' message with voicePrompt, confidence, last
// - 'dtmf' message with digit
// - 'interrupt' message when user interrupts
```

### llm-integration.ts

Generates LLM connection code (primary: Anthropic Claude):

```typescript
// Generated output
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  system: systemPrompt,
  messages: conversationHistory,
  tools: toolDefinitions,
});
```

## Use Case Templates

| Template | Description | Default Tools |
|----------|-------------|---------------|
| `basic-assistant` | Simple conversational AI | None |
| `customer-service` | Tool-calling agent with escalation | lookup_account, check_order, transfer |
| `appointment-booking` | Calendar integration | check_availability, book_appointment, cancel |

## ConversationRelay Protocol

### Incoming Messages (from Twilio)

| Type | Fields | Purpose |
|------|--------|---------|
| `setup` | callSid, streamSid, from, to | Initial handshake |
| `prompt` | voicePrompt, confidence, last | User speech |
| `dtmf` | digit | Keypad input |
| `interrupt` | - | User interrupted AI |

### Outgoing Messages (to Twilio)

| Type | Fields | Purpose |
|------|--------|---------|
| `text` | token | Send response (TTS) |
| `end` | - | End conversation |

## Testing

### Unit Tests
- Generator output validation
- Template variable substitution
- Schema validation

### Integration Tests
- WebSocket message handling
- Workflow phase execution

### E2E Tests
- Deploy generated code
- Make test call via MCP tools
- Validate with DeepValidator

## Related Documentation

- [ConversationRelay Protocol](/functions/conversation-relay/CLAUDE.md)
- [Voice Skill](/.claude/skills/voice.md)
- [Feature Factory](/agents/feature-factory/CLAUDE.md)
- [Voice MCP Tools](/agents/mcp-servers/twilio/CLAUDE.md)
