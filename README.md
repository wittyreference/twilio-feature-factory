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
    ┌───────────────┬─────────┼─────────┬─────────────────┐
    │               │         │         │                 │
    ▼               ▼         ▼         ▼                 ▼
┌─────────────┐ ┌─────────┐ ┌─────────────┐ ┌─────────────────┐
│ Slash Cmds  │ │  Agent  │ │ MCP Server  │ │ Voice AI Builder│
│ ────────────│ │  Teams  │ │ ────────────│ │ ────────────────│
│ /architect  │ │ ────────│ │ Twilio APIs │ │ Code generators │
│ /spec       │ │ /team   │ │ as tools    │ │ for voice apps  │
│ /test-gen   │ │ Parallel│ │             │ │                 │
│ /dev        │ │ multi-  │ │ • Send SMS  │ │ • TwiML handlers│
│ /review     │ │ agent   │ │ • Make calls│ │ • WebSocket svrs│
│ /docs       │ │ work    │ │ • Query logs│ │ • Templates     │
└─────────────┘ └─────────┘ └─────────────┘ └─────────────────┘
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

4. **Export environment variables**

   The Twilio MCP server needs your `.env` variables exported into the shell. The easiest way is [direnv](https://direnv.net/):

   ```bash
   brew install direnv
   echo 'eval "$(direnv hook zsh)"' >> ~/.zshrc  # or ~/.bashrc for bash
   source ~/.zshrc
   echo 'dotenv' > .envrc
   direnv allow
   ```

   This auto-loads `.env` whenever you `cd` into the project. Without this, the MCP server will fail to start because it can't read your Twilio credentials.

   **Alternative** (no install required):
   ```bash
   set -a && source .env && set +a
   ```
   Run this before launching Claude Code each session.

5. **Start development server**

   ```bash
   npm start
   ```

6. **Build your first app**

   In Claude Code, start by referencing the brainstorm template:

   ```
   "Using .claude/references/brainstorm.md, help me brainstorm
   a voice IVR that routes callers to sales or support"
   ```

   Claude Code will help you develop the concept, then enter plan mode to create the implementation plan. Once approved, autonomous agents will build it.

   See [WALKTHROUGH.md](WALKTHROUGH.md) for a detailed guided tutorial.

## Available Tools

### Workflow Commands

| Command | What It Does |
|---------|--------------|
| `/orchestrate [workflow] [task]` | Run full development pipelines |
| `/team [workflow] [task]` | Coordinate parallel multi-agent work |

### Development Subagents

| Command | What It Does |
|---------|--------------|
| `/architect [topic]` | Design review and pattern selection |
| `/spec [feature]` | Create technical specifications |
| `/test-gen [feature]` | Generate failing tests (TDD Red Phase) |
| `/dev [task]` | Implement to pass tests (TDD Green Phase) |
| `/review [target]` | Code review and security audit |
| `/test [scope]` | Execute and validate test suites |
| `/docs [scope]` | Update documentation |

### Utility Commands

| Command | What It Does |
|---------|--------------|
| `/commit [scope]` | Git commit with pre-commit checks and conventional messages |
| `/push` | Push to remote with test verification |
| `/preflight` | Environment verification (CLI profile, env vars, auth) |
| `/deploy [env]` | Deploy with validation checks |
| `/e2e-test [scope]` | E2E tests against live Twilio |
| `/validate [type] [SID]` | Deep validation of individual Twilio resources |
| `/context [action]` | Context optimization (summarize, load, analyze) |
| `/twilio-docs [topic]` | Search Twilio documentation |
| `/twilio-logs` | Analyze Twilio debugger logs |

### Agent Teams (Experimental)

Coordinate multiple Claude Code instances for parallel work:

- `/team new-feature [desc]` — Parallel qa + review after sequential build
- `/team bug-fix [issue]` — 3 parallel investigators with hypothesis challenging
- `/team code-review [scope]` — Security + performance + test reviewers in parallel
- `/team refactor [target]` — Parallel analysis, then implementation, then parallel review

Disable by removing `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` from `.claude/settings.json`.

### MCP Server

Twilio APIs exposed as tools Claude Code can invoke:

- **Messaging**: Send SMS/MMS, query logs
- **Voice**: Call logs, initiate calls, recordings
- **Phone Numbers**: List, configure webhooks, search
- **Verify**: Start/check verifications
- **Sync**: Documents for state synchronization
- **TaskRouter**: Create tasks, list workers
- **Debugger**: Error logs, usage records

## Feature Factory

The Feature Factory runs development workflows autonomously with three execution modes:

- **Interactive CLI** — Standard Claude Code session with `/orchestrate`
- **Autonomous mode** — `--dangerously-autonomous` with sandbox isolation (on by default)
- **Headless** — `scripts/run-headless.sh` for CI/CD pipelines, no TTY required

Built-in safeguards:
- Stall detection and automatic phase retry
- Git checkpoints at each pipeline stage
- Quality gates always enforced (TDD, lint, coverage, credential safety)

```bash
# Headless example
./scripts/run-headless.sh "add SMS verification to the login flow"
```

See [agents/feature-factory/CLAUDE.md](agents/feature-factory/CLAUDE.md) for architecture and [scripts/CLAUDE.md](scripts/CLAUDE.md) for runner details.

## What's Implemented

**Development Tools**
- 18 slash commands across workflow, development, and utility categories
- MCP Server with 248 Twilio API tools across 25 modules
- Voice AI Builder with TwiML and WebSocket generators
- Feature Factory with autonomous mode, stall detection, and sandbox isolation

**Serverless Functions**
- Voice, Messaging, Verify, Sync, TaskRouter, Conversation Relay

**Coordination**
- Agent Teams with 4 pre-configured workflows (new-feature, bug-fix, code-review, refactor)
- 16 safety and quality hooks
- Work discovery and background polling in Feature Factory

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
│   ├── feature-factory/     # Autonomous workflow orchestration
│   ├── doc-generator/       # Documentation generation
│   └── voice-ai-builder/    # Voice AI app generator
├── .claude/                 # Claude Code configuration
│   ├── commands/            # Slash command definitions (18)
│   ├── hooks/               # Safety and quality hooks (16)
│   ├── rules/               # Declarative agent rules
│   ├── skills/              # Context engineering skills
│   └── workflows/           # Workflow definitions
└── __tests__/               # Test suites
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run setup` | First-time project setup |
| `npm start` | Start local development server |
| `npm run start:ngrok` | Start with ngrok tunnel |
| `npm test` | Run unit and integration tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run test:e2e` | Run Newman E2E tests |
| `npm run test:all` | Run all tests (unit + integration + E2E) |
| `npm run lint` | Check for linting errors |
| `npm run lint:fix` | Auto-fix linting errors |
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

16 Claude Code hooks protect your code automatically:

**Security**
- Credential blocking (hardcoded SIDs, tokens, API keys)
- Git safety (blocks `--no-verify`, force push to main)

**Quality**
- ABOUTME enforcement on new files
- Auto-lint with ESLint on save
- Deploy validation (tests + lint before deployment)

**Session Management**
- Session start logging and checklist verification
- Context compaction summaries

**Documentation Flywheel**
- Post-write change tracking
- Doc suggestion generation from code changes

**Agent Coordination**
- Teammate idle check and task completion gates
- Subagent activity logging

## Prerequisites

- Node.js 20 or 22 (Twilio Serverless requirement)
- Twilio CLI (`npm install -g twilio-cli`)
- Twilio Serverless plugin (`twilio plugins:install @twilio-labs/plugin-serverless`)
- Claude Code

## Resources

- [WALKTHROUGH.md](WALKTHROUGH.md) - Build your first app (start here!)
- [CLAUDE.md](CLAUDE.md) - Project standards and conventions
- [agents/README.md](agents/README.md) - Agent architecture details
- [Twilio Functions Docs](https://www.twilio.com/docs/serverless/functions-assets/functions)
- [Claude Code](https://claude.ai/code)

## Attribution

This CLAUDE.md structure and many of the interaction patterns were inspired by:

- **Harper Reed's dotfiles**: [github.com/harperreed/dotfiles/.claude/CLAUDE.md](https://github.com/harperreed/dotfiles/blob/master/.claude/CLAUDE.md) - The foundational approach to Claude Code configuration, relationship framing, and coding principles.

- **Agent Skills for Context Engineering**: [github.com/muratcankoylan/Agent-Skills-for-Context-Engineering](https://github.com/muratcankoylan/Agent-Skills-for-Context-Engineering) - Context engineering skills adapted for Twilio development workflows.

Thank you to these developers for sharing their work openly.

## License

MIT
