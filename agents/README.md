# Agents

This directory contains autonomous agents built on the Claude Agent SDK and MCP (Model Context Protocol).

## Overview

The agents in this directory provide AI-assisted development tooling that helps developers prototype Twilio applications faster.

**Important**: These agents are development-time tooling. They are NOT part of the core Twilio prototyping functions in `functions/`. See [Architecture Separation](#architecture-separation) below.

## Available Agents

| Agent | Status | Description |
|-------|--------|-------------|
| [Twilio MCP Server](mcp-servers/twilio/) | **Implemented** | MCP server exposing Twilio APIs as tools for Claude agents |
| [Feature Factory](feature-factory/) | **Implemented** | Orchestrates development workflows with specialized subagents |
| [Voice AI Builder](voice-ai-builder/) | **Implemented** | Generates TwiML handlers and WebSocket servers for voice AI |

## When to Use What

| Use Case | Tool | Why |
|----------|------|-----|
| Interactive development | **Claude Code** | Plan mode, approval workflow, invoke commands as needed |
| CI/CD automation | **Feature Factory** | Headless execution, programmatic access |
| Quick Twilio API calls | **MCP Server** | Direct tool access without workflow overhead |

### Claude Code (Recommended for Interactive Work)

When working in the CLI interactively, Claude Code is your orchestrator:

1. Describe what you want
2. Claude Code enters plan mode, explores codebase
3. You approve the plan
4. Claude Code executes using slash commands, MCP tools, skills

### Feature Factory (For Automation)

For CI/CD pipelines or programmatic access:

```bash
npx feature-factory new-feature "add SMS verification"
```

## Feature Factory

**Location**: `feature-factory/`

The Feature Factory is a **headless orchestrator** built on Claude Agent SDK. Use it when you need to run development workflows programmatically—without Claude Code.

### How It Works

```text
npx feature-factory new-feature "add SMS verification"
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  Feature Factory Orchestrator (agentic loop)        │
│  Budget: $5 | Turns: 50 max | Sessions: Persistent  │
└─────────────────────────────────────────────────────┘
         │
         ▼
/architect → /spec → /test-gen → /dev → /review → /docs
```

Each phase invokes a specialized subagent with:

- Claude API access (agentic loop)
- Tool access: Read, Write, Glob, Grep, Bash, MCP tools
- Role-specific prompts and constraints

Human approval gates occur between phases (can be disabled for full automation).

See [feature-factory/CLAUDE.md](feature-factory/CLAUDE.md) for full documentation.

## Twilio MCP Server

**Location**: `mcp-servers/twilio/`

The MCP server exposes Twilio API operations as standardized tools that Claude agents can invoke autonomously.

### Implementation Status

**P0 (Implemented)** - 7 modules:

- **Messaging**: Send SMS/MMS, query message logs and status
- **Voice**: Query call logs, initiate calls, fetch recordings
- **Phone Numbers**: List numbers, configure webhooks, search available
- **Verify**: Start/check verifications, get status
- **Sync**: Create/update/get/list documents for state synchronization
- **TaskRouter**: Create tasks, list workers and workflows
- **Debugger**: Fetch error logs, analyze patterns, get usage records

**P1-P3 (Planned)** - 18 additional modules including:
- Conversations, Studio, Flex, Video, Notify
- Messaging Services, A2P compliance, Regulatory
- Programmable Wireless, Proxy, Voice Intelligence

See [mcp-servers/twilio/CLAUDE.md](mcp-servers/twilio/CLAUDE.md) for full documentation and roadmap.

### Deep Validation

The MCP server includes a deep validation helper (`src/validation/`) that goes beyond checking for 200 OK responses. It validates:

- Resource status transitions (delivered, completed, etc.)
- Debugger alerts related to the operation
- Call events and Voice Insights (for voice)
- Sync callback data (if configured)

See [mcp-servers/twilio/src/validation/CLAUDE.md](mcp-servers/twilio/src/validation/CLAUDE.md) for details.

## Voice AI Builder

**Location**: `voice-ai-builder/`

Generates boilerplate code for voice AI applications using Twilio's Conversation Relay service.

### What It Generates

- **TwiML Handlers**: `<Connect><ConversationRelay>` responses with proper configuration
- **WebSocket Servers**: Backend servers that handle the ConversationRelay protocol
- **Templates**: Pre-built patterns for common voice AI use cases

Use cases include customer service bots, voice-activated IVRs, and real-time transcription apps.

See [voice-ai-builder/CLAUDE.md](voice-ai-builder/CLAUDE.md) for full documentation.

## Architecture Separation

**Critical**: The agents directory is intentionally decoupled from `functions/`:

```text
twilio-feature-factory/
├── functions/              ← TWILIO SERVERLESS (production code)
│   ├── voice/                  Voice call handlers (TwiML)
│   ├── messaging/              SMS/MMS handlers
│   ├── conversation-relay/     Real-time voice AI
│   ├── verify/                 Phone verification
│   ├── sync/                   State synchronization
│   ├── taskrouter/             Skills-based routing
│   ├── callbacks/              Status callback handlers
│   └── helpers/                Shared utilities
│
└── agents/                 ← AI DEVELOPMENT TOOLING
    ├── mcp-servers/twilio/     MCP server wrapping Twilio APIs
    ├── feature-factory/        Orchestrated development workflows
    └── voice-ai-builder/       Voice AI application generator
```

**Coupling rules**:

- Functions do NOT import from agents/
- Agents do NOT call function webhooks directly
- Integration is via Twilio APIs only (functions write to Sync, agents read from Sync)
- Each has independent `package.json` files

This separation ensures that:

1. Core prototyping code remains portable (no agent dependencies)
2. Agents can be developed/tested independently
3. Production functions have no development-time overhead

## Development

### Running MCP Server Locally

```bash
cd mcp-servers/twilio
npm install
npm run build
npm start
```

### Running Tests

```bash
cd mcp-servers/twilio
npm test                    # Unit tests
npm run test:integration    # Integration tests (requires .env)
```

### Environment Setup

The auto-setup script provisions all required Twilio resources:

```bash
npm run setup   # From project root
```

See [scripts/CLAUDE.md](/scripts/CLAUDE.md) for details.

## Implementation Status

All core agents are implemented:

- **Twilio MCP Server**: Complete with P0 tools (messaging, voice, verify, sync, taskrouter, debugger)
- **Feature Factory**: Complete with orchestrator and specialized subagents
- **Voice AI Builder**: Complete with TwiML and WebSocket server generators

See individual agent directories for detailed documentation.
