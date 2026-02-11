# @twilio-feature-factory/mcp-twilio

MCP server exposing 248+ Twilio API operations as tools for Claude agents.

## Install

```bash
npm install @twilio-feature-factory/mcp-twilio
```

## Usage

```typescript
import { createTwilioMcpServer } from '@twilio-feature-factory/mcp-twilio';

const twilioServer = createTwilioMcpServer({
  accountSid: process.env.TWILIO_ACCOUNT_SID,
  authToken: process.env.TWILIO_AUTH_TOKEN,
  defaultFromNumber: process.env.TWILIO_PHONE_NUMBER,
});
```

With Claude Agent SDK:

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

for await (const message of query({
  prompt: "Send an SMS to +15551234567 saying 'Hello from Claude!'",
  options: {
    mcpServers: { twilio: twilioServer },
    allowedTools: ['mcp__twilio__send_sms'],
  },
})) {
  // Agent autonomously sends the SMS
}
```

## Tool Coverage

248 tools across 25 modules:

| Priority | Modules | Tools |
|----------|---------|-------|
| P0 (Core) | messaging, voice, phone-numbers, verify, sync, taskrouter, debugger | 22 |
| P1 (High Value) | lookups, studio, messaging-services, serverless | 40 |
| P2 (Specialized) | intelligence, video, proxy, trusthub, content, voice-config, regulatory, media | 97 |
| P3 (Edge Cases) | trunking, accounts, iam, pricing, notify, addresses | 61 |
| Validation | deep-validator, comprehensive-validator | 28 |

## Deep Validation

Goes beyond HTTP 200 to verify actual operation success:

```typescript
import { DeepValidator } from '@twilio-feature-factory/mcp-twilio';
import Twilio from 'twilio';

const client = Twilio(accountSid, authToken);
const validator = new DeepValidator(client);

const result = await validator.validateMessage(messageSid, {
  waitForTerminal: true,
  timeout: 30000,
});

if (!result.success) {
  console.error('Errors:', result.errors);
}
```

Validators: `validateMessage`, `validateCall`, `validateVerification`, `validateTask`, `validateConference`, `validateRecording`, `validateTranscript`, `validateDebugger`, `validateTwoWay`, and more.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Yes | Account SID |
| `TWILIO_AUTH_TOKEN` | Yes | Auth Token |
| `TWILIO_PHONE_NUMBER` | Yes | Default from number (E.164) |
| `TWILIO_VERIFY_SERVICE_SID` | For verify | Verify Service SID |
| `TWILIO_SYNC_SERVICE_SID` | For sync | Sync Service SID |
| `TWILIO_TASKROUTER_WORKSPACE_SID` | For taskrouter | Workspace SID |
| `TWILIO_MESSAGING_SERVICE_SID` | For messaging services | Messaging Service SID |

## License

MIT
