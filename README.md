# Twilio Agent Factory

Build Twilio applications with AI-assisted development using Claude Code.

## What This Is

Twilio Agent Factory is an **AI-powered development system** for building Twilio applications. You brainstorm your idea with Claude Code, approve an implementation plan, and autonomous agents build it for you.

## The Development Workflow

```text
┌─────────────────────────────────────────────────────────────────┐
│  1. BRAINSTORM                                                  │
│     Reference .claude/references/brainstorm.md                  │
│     Develop your concept iteratively with Claude Code           │
│     Save output as concept.md                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. PLAN                                                        │
│     Claude Code enters plan mode automatically                  │
│     Explores codebase, creates detailed implementation plan     │
│     You review and approve                                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  3. EXECUTE                                                     │
│     Autonomous agents run the pipeline:                         │
│     /architect → /spec → /test-gen → /dev → /review → /docs    │
│     Human approval gates at key checkpoints                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  4. VERIFY                                                      │
│     Deep validation beyond HTTP 200                             │
│     Test coverage enforcement (80%)                             │
│     Documentation pipeline updates                              │
└─────────────────────────────────────────────────────────────────┘
```

**Extended Thinking**: This project configures `MAX_THINKING_TOKENS=63999` for deep reasoning during complex planning. See [CLAUDE.md](CLAUDE.md) for details.

## The Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│  Claude Code (Interactive Orchestrator)                         │
│  ───────────────────────────────────────────────────────────────│
│  Plan mode → User approval → Execution                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                    invokes as needed
                              │
    ┌─────────────────────────┼─────────────────────────┐
    │                         │                         │
    ▼                         ▼                         ▼
┌─────────────┐       ┌─────────────┐       ┌─────────────────┐
│ Slash Cmds  │       │ MCP Server  │       │ Voice AI Builder│
│ ────────────│       │ ────────────│       │ ────────────────│
│ /architect  │       │ Twilio APIs │       │ Code generators │
│ /spec       │       │ as tools    │       │ for voice apps  │
│ /test-gen   │       │             │       │                 │
│ /dev        │       │ • Send SMS  │       │ • TwiML handlers│
│ /review     │       │ • Make calls│       │ • WebSocket svrs│
│ /docs       │       │ • Query logs│       │ • Templates     │
└─────────────┘       └─────────────┘       └─────────────────┘
```

### What Agents Use

During execution, autonomous agents have access to:

- **Slash commands** (`/architect`, `/dev`, etc.) - Specialized development roles
- **MCP tools** - Twilio API operations (send SMS, query logs, etc.)
- **Skills** - Domain knowledge (voice patterns, context management)
- **Hooks** - Quality enforcement (TDD, security, credentials)
- **CLAUDE.md hierarchy** - Context for each domain

## Quick Start

1. **Clone the repository**

   ```bash
   git clone https://github.com/wittyreference/twilio-agent-factory.git
   cd twilio-agent-factory
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment**

   ```bash
   cp .env.example .env
   ```

   Add your Twilio credentials to `.env`:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_PHONE_NUMBER`

4. **Start development server**

   ```bash
   npm start
   ```

5. **Build your first app**

   In Claude Code, start by referencing the brainstorm template:

   ```
   "Using .claude/references/brainstorm.md, help me brainstorm
   a voice IVR that routes callers to sales or support"
   ```

   Claude Code will help you develop the concept, then enter plan mode to create the implementation plan. Once approved, autonomous agents will build it.

   See [WALKTHROUGH.md](WALKTHROUGH.md) for a detailed guided tutorial.

## Available Tools

### Development Commands

Specialized agents for different development phases:

| Command | What It Does |
|---------|--------------|
| `/architect [topic]` | Design review and pattern selection |
| `/spec [feature]` | Create technical specifications |
| `/test-gen [feature]` | Generate failing tests (TDD Red Phase) |
| `/dev [task]` | Implement to pass tests (TDD Green Phase) |
| `/review` | Code review and security audit |
| `/docs` | Update documentation |

### Utility Commands

| Command | What It Does |
|---------|--------------|
| `/twilio-docs [topic]` | Search Twilio documentation |
| `/twilio-logs` | Analyze Twilio debugger logs |
| `/deploy [env]` | Deploy with validation checks |

### MCP Server

Twilio APIs exposed as tools Claude Code can invoke:

- **Messaging**: Send SMS/MMS, query logs
- **Voice**: Call logs, initiate calls, recordings
- **Phone Numbers**: List, configure webhooks, search
- **Verify**: Start/check verifications
- **Sync**: Documents for state synchronization
- **TaskRouter**: Create tasks, list workers
- **Debugger**: Error logs, usage records

## Headless Automation

For CI/CD pipelines or programmatic access, the **Feature Factory** can run workflows without Claude Code:

```bash
npx feature-factory new-feature "add SMS verification"
```

This is useful for:
- Automated development pipelines
- Scheduled code generation
- Integration with other tools

See [agents/README.md](agents/README.md) for details.

## What's Implemented vs Planned

### Implemented ✓

**Development Tools**
- 7 specialized slash commands (architect, spec, test-gen, dev, qa, review, docs)
- MCP Server with 220+ Twilio API tools (P0-P3 complete)
- Voice AI Builder with TwiML and WebSocket generators

**Serverless Functions**
- Voice, Messaging, Verify, Sync, TaskRouter, Conversation Relay

### Planned 🚧

**Additional Workflows**
- `bug-fix` workflow (logs → architect → test → dev → review)
- `refactor` workflow (test → architect → dev → review)

**Autonomous Workers**
- Event-driven agents that respond to validation failures
- Background workers for continuous verification

## Project Structure

```text
twilio-agent-factory/
├── functions/               # Twilio serverless functions
│   ├── voice/               # Voice call handlers (TwiML)
│   ├── messaging/           # SMS/MMS handlers
│   ├── conversation-relay/  # Real-time voice AI
│   ├── verify/              # Phone verification
│   ├── sync/                # State synchronization
│   ├── taskrouter/          # Skills-based routing
│   └── callbacks/           # Status callback handlers
├── agents/                  # AI development tooling
│   ├── mcp-servers/twilio/  # MCP server for Twilio APIs
│   ├── feature-factory/     # Headless workflow orchestration
│   └── voice-ai-builder/    # Voice AI app generator
├── .claude/                 # Claude Code configuration
│   ├── commands/            # Slash command definitions
│   ├── hooks/               # Automation hooks
│   └── skills/              # Context engineering skills
└── __tests__/               # Test suites
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start local development server |
| `npm test` | Run unit and integration tests |
| `npm run lint` | Check for linting errors |
| `npm run deploy:dev` | Deploy to dev environment |
| `npm run deploy:prod` | Deploy to production |

## Testing

### Unit and Integration Tests

```bash
npm test                 # Run all tests
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Run tests with coverage report
```

### E2E Testing (ConversationRelay)

End-to-end testing for ConversationRelay requires a real phone call and ngrok tunnel.

**Prerequisites:**
- ngrok installed and configured
- Real phone to answer test calls
- Twilio phone number configured

**Manual E2E Process:**

1. Start WebSocket server locally:
   ```bash
   node __tests__/e2e/conversation-relay-server.js
   ```

2. Expose via ngrok:
   ```bash
   ngrok http 8080
   ```

3. Update `.env` with ngrok URL:
   ```bash
   CONVERSATION_RELAY_URL=wss://abc123.ngrok.io/relay
   ```

4. Start serverless with ngrok:
   ```bash
   npm run start:ngrok
   ```

5. Run E2E test:
   ```bash
   node __tests__/e2e/conversation-relay-e2e.js
   ```

6. Answer the incoming call and test the conversation

## Safety Features

Claude Code hooks protect your code automatically:

- **Credential blocking** - Prevents hardcoded Twilio SIDs and tokens
- **ABOUTME enforcement** - Requires documentation comments on new functions
- **Auto-lint** - Runs ESLint with auto-fix on save
- **Deploy validation** - Runs tests and lint before deployment
- **Git safety** - Blocks `--no-verify` and force push to main

## Prerequisites

- Node.js 18-22 (Twilio Serverless requirement)
- Twilio CLI (`npm install -g twilio-cli`)
- Twilio Serverless plugin (`twilio plugins:install @twilio-labs/plugin-serverless`)
- Claude Code

## Resources

- [WALKTHROUGH.md](WALKTHROUGH.md) - Build your first app (start here!)
- [CLAUDE.md](CLAUDE.md) - Project standards and conventions
- [agents/README.md](agents/README.md) - Agent architecture details
- [Twilio Functions Docs](https://www.twilio.com/docs/serverless/functions-assets/functions)
- [Claude Code](https://claude.ai/code)

## License

MIT
