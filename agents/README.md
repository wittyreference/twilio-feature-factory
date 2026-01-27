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

## Twilio MCP Server

**Location**: `mcp-servers/twilio/`

The MCP server exposes Twilio API operations as standardized tools that Claude agents can invoke autonomously. Currently implements P0 (core) tools:

- **Messaging**: Send SMS/MMS, query message logs and status
- **Voice**: Query call logs, initiate calls, fetch recordings
- **Phone Numbers**: List numbers, configure webhooks, search available
- **Verify**: Start/check verifications, get status
- **Sync**: Create/update/get/list documents for state synchronization
- **TaskRouter**: Create tasks, list workers and workflows
- **Debugger**: Fetch error logs, analyze patterns, get usage records

See [mcp-servers/twilio/CLAUDE.md](mcp-servers/twilio/CLAUDE.md) for full documentation.

### Deep Validation

The MCP server includes a deep validation helper (`src/validation/`) that goes beyond checking for 200 OK responses. It validates:

- Resource status transitions (delivered, completed, etc.)
- Debugger alerts related to the operation
- Call events and Voice Insights (for voice)
- Sync callback data (if configured)

See [mcp-servers/twilio/src/validation/CLAUDE.md](mcp-servers/twilio/src/validation/CLAUDE.md) for details.

## Architecture Separation

**Critical**: The agents directory is intentionally decoupled from `functions/`:

```text
twilio-agent-factory/
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
