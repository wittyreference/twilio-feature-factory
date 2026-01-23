# Agents

This directory contains autonomous agents built on the Claude Agent SDK and MCP (Model Context Protocol).

## Overview

The agents in this directory are part of the **Twilio Agent Factory** meta-project - tooling that helps developers prototype Twilio applications faster using AI assistance.

**Important**: These agents are development-time tooling. They are NOT part of the core Twilio prototyping functions in `functions/`. See [Architecture Separation](#architecture-separation) below.

## Available Agents

| Agent | Status | Description |
|-------|--------|-------------|
| [Twilio MCP Server](mcp-servers/twilio/) | **Implemented** | MCP server exposing Twilio APIs as tools for Claude agents |
| Feature Factory | Planned (Phase 2) | Orchestrates development workflows with specialized subagents |
| QA Agent | Planned (Phase 3) | Automated testing, coverage analysis, and security validation |
| Voice AI Builder | Planned (Phase 4) | Generates TwiML handlers and WebSocket servers for voice AI |
| Doc Generator | Planned (Phase 5) | Generates API docs and architecture diagrams |

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
├── functions/          ← CORE TWILIO PROTOTYPING (production code)
│   ├── voice/              Serverless handlers that run on Twilio
│   ├── messaging/          infrastructure. These are standalone.
│   └── callbacks/
│
└── agents/             ← META-PROJECT (Agent Factory)
    └── mcp-servers/twilio/   Development tooling that helps BUILD
                              the functions. NOT deployed to Twilio.
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

## Roadmap

See [todo.md](/todo.md) for the full implementation roadmap:

- **Phase 1** (Current): Twilio MCP Server - P0 tools complete, P1-P3 in progress
- **Phase 2**: Feature Factory - Orchestrated development workflows
- **Phase 3**: QA Agent - Automated testing and validation
- **Phase 4**: Voice AI Builder - Voice application scaffolding
- **Phase 5**: Documentation & Polish
