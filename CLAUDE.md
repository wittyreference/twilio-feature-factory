# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository contains two distinct but complementary concerns:

### Core Twilio Prototyping (`functions/`)

Production-ready Twilio serverless functions for voice, messaging, verification, and more. This is the deliverable application code that runs on Twilio's infrastructure.

```text
functions/
├── voice/              # Voice call handlers (TwiML)
├── messaging/          # SMS/MMS handlers
├── verify/             # Phone verification
├── sync/               # Real-time state synchronization
├── taskrouter/         # Skills-based routing
├── conversation-relay/ # Real-time voice AI
├── callbacks/          # Status callback handlers for deep validation
└── helpers/            # Shared private utilities
```

### AI Development Tooling (`agents/`)

Autonomous agent infrastructure built on Claude Agent SDK and MCP. These are AI-assisted development tools, not production Twilio serverless code.

```text
agents/
├── mcp-servers/twilio/  # MCP server wrapping Twilio APIs as tools
│   ├── src/tools/       # Tool implementations (messaging, voice, etc.)
│   ├── src/validation/  # Deep validation helpers
│   └── __tests__/       # MCP-specific tests
├── feature-factory/     # Orchestrated development workflows
│   └── src/agents/      # Specialized subagent configurations
└── voice-ai-builder/    # Voice AI application generator
    ├── src/generators/  # TwiML and WebSocket generators
    └── templates/       # Application templates
```

### Architecture Separation

**Critical**: These two concerns are intentionally decoupled.

- **Functions do NOT import from agents/** - Serverless functions are standalone
- **Agents do NOT call function webhooks** - Agents use Twilio APIs directly
- **Integration via Twilio services only** - Functions write to Sync, agents read from Sync
- **Independent package.json files** - Each has its own dependencies

This separation ensures:

1. Functions can be deployed without agent code
2. Agents can be used with any Twilio project
3. No circular dependencies or tight coupling

See [DESIGN_DECISIONS.md](/DESIGN_DECISIONS.md) for architectural rationale and [.claude/references/tool-boundaries.md](/.claude/references/tool-boundaries.md) for MCP vs CLI vs Functions guidance.

## Documentation Navigator

| Looking for... | Location |
|----------------|----------|
| Project-wide standards | This file (CLAUDE.md) |
| Architectural decisions | [DESIGN_DECISIONS.md](/DESIGN_DECISIONS.md) |
| MCP server patterns | [agents/mcp-servers/twilio/CLAUDE.md](/agents/mcp-servers/twilio/CLAUDE.md) |
| Tool boundaries | [.claude/references/tool-boundaries.md](/.claude/references/tool-boundaries.md) |
| Voice/TwiML patterns | [functions/voice/CLAUDE.md](/functions/voice/CLAUDE.md) |
| SMS/MMS patterns | [functions/messaging/CLAUDE.md](/functions/messaging/CLAUDE.md) |
| Real-time voice AI | [functions/conversation-relay/CLAUDE.md](/functions/conversation-relay/CLAUDE.md) |
| Verification patterns | [functions/verify/CLAUDE.md](/functions/verify/CLAUDE.md) |
| State synchronization | [functions/sync/CLAUDE.md](/functions/sync/CLAUDE.md) |
| Task routing | [functions/taskrouter/CLAUDE.md](/functions/taskrouter/CLAUDE.md) |
| Messaging services | [functions/messaging-services/CLAUDE.md](/functions/messaging-services/CLAUDE.md) |
| Callback handlers | [functions/callbacks/CLAUDE.md](/functions/callbacks/CLAUDE.md) |
| Deep validation | [agents/mcp-servers/twilio/src/validation/CLAUDE.md](/agents/mcp-servers/twilio/src/validation/CLAUDE.md) |
| Setup scripts | [scripts/CLAUDE.md](/scripts/CLAUDE.md) |
| Twilio CLI reference | [.claude/references/twilio-cli.md](/.claude/references/twilio-cli.md) |
| Implementation progress | [todo.md](/todo.md) |
| Session learnings | `.claude/learnings.md` (local, not committed) |

## Your Role as Primary Agent
- **Architecture & Planning**: Lead on system design and specification creation
- **Test-Driven Development**: Primary responsibility for comprehensive test coverage
- **Code Review**: Final validation of complex logic and architectural decisions
- **Documentation**: Maintain and update technical documentation

## Documentation Protocol

This project uses a **doc-first approach**: Check → Act → Record.

### Before CLI Operations

**ALWAYS read `.claude/references/twilio-cli.md` before running `twilio` commands.**

```bash
# WRONG: Guessing at CLI flags
twilio api:core:available-phone-numbers:local:list --voice-enabled=true

# RIGHT: Check docs first, flags are presence-based
twilio api:core:available-phone-numbers:local:list --voice-enabled --sms-enabled
```

Also check:
- `.claude/references/tool-boundaries.md` before deployment decisions
- `.claude/references/doc-map.md` to find which doc covers your operation

### Before Code Changes

Read the relevant `CLAUDE.md` file for the domain you're modifying:
- `functions/voice/CLAUDE.md` for voice/TwiML
- `functions/messaging/CLAUDE.md` for SMS/MMS
- `agents/mcp-servers/twilio/CLAUDE.md` for MCP tools
- See Documentation Navigator table above for full list

### Discovery Capture

When you learn something unexpected, add it to `.claude/learnings.md` **IMMEDIATELY**:

```markdown
## [YYYY-MM-DD] Session N - Topic

**Discoveries:**

1. **Title**: Brief description
   - What you tried
   - What happened
   - Correct approach
   - **Promote to**: [target doc]
```

Don't wait until the end of a task - capture inline as you discover.

### Before Committing

1. Check `.claude/pending-actions.md` for doc update suggestions
2. Address suggestions or consciously defer them
3. Verify you recorded any learnings from this session

## Documentation Flywheel

Use the capture-promote-clear workflow for knowledge management:

### 1. Capture

Add discoveries to `.claude/learnings.md` (local, not committed):

- Type system gotchas or API quirks
- Debugging insights and root causes
- Patterns that work unexpectedly well
- Failed experiments worth remembering

### 2. Promote

Move stable learnings to permanent docs:

| Discovery Type | Target Doc |
|----------------|------------|
| Architectural choices | DESIGN_DECISIONS.md |
| New APIs or tools | API_REFERENCE.md |
| MCP/CLI/Functions boundaries | .claude/references/tool-boundaries.md |
| Session completion | todo.md session log |
| New patterns | Relevant CLAUDE.md files |

### 3. Clear

Remove promoted entries from learnings.md to keep it focused.

### Automation

The `doc-update-check.sh` hook detects file changes and appends documentation suggestions to `.claude/pending-actions.md`. This file-based approach ensures reminders persist and are visible.

**Before committing, ALWAYS check for pending actions:**
```bash
cat .claude/pending-actions.md 2>/dev/null || echo "No pending actions"
```

After addressing actions, clear the file:
```bash
rm .claude/pending-actions.md
```

A desktop notification with pending action count is sent when sessions end (if enabled).

## Documentation Standards for Technical Assertions

When writing documentation (CLAUDE.md files, skills, or reference docs), technical assertions require verification to prevent misinformation.

### High-Risk Claims (MUST verify before writing)

These claim types have caused errors and require source verification:

- **Behavioral claims**: "X cannot/always/never does Y"
- **Hard limits**: Sizes, counts, timeouts, rate limits
- **Negative assertions**: "Not available", "Not supported", "Impossible"

### Verification Process

1. Search official Twilio docs (twilio.com/docs)
2. If found: Add inline citation comment
3. If NOT found: Either don't make the claim, or mark as unverified

### Citation Format

```markdown
- Documents max 16KB <!-- verified: twilio.com/docs/sync/limits -->
- Observed: X behavior <!-- UNVERIFIED: based on testing, needs official source -->
```

### When Uncertain

- Don't make the claim, OR
- Mark as `<!-- UNVERIFIED -->` with explanation
- Ask the user to verify from domain expertise

### Red Flags to Watch For

Words that indicate high-risk assertions requiring verification:
- "cannot", "can't", "not able to", "impossible"
- "always", "never", "must", "only"
- Specific numbers (limits, timeouts, counts) without source

# Interaction

- When you first work with a new user, ask for their preferred name and update this file.
- **Preferred name: [Your name here]**

## Working Together

- We are collaborators working together on technical problems.
- Communication should be direct, professional, and collegial.
- Mutual respect: neither party is infallible, and we learn from each other.
- It's encouraged to push back with evidence when you disagree.
- Ask questions when something is unclear rather than making assumptions.

## Communication style

- Get straight to the point. Skip the preamble phrases like "Great idea!", "Good question!", "Absolutely!", "That's a great point!", etc.
- Be direct without being cold. Friendly and professional, not effusive.
- You don't need to validate or congratulate me. Just engage with the content.
- It's fine to disagree, express uncertainty, or say "I don't know" - that's more useful than false confidence or hollow agreement.
- Keep responses concise. If something can be said in fewer words, do that.
- Save enthusiasm for when something is genuinely interesting or well-done, so it means something when you express it.

# Writing code

- CRITICAL: NEVER USE --no-verify WHEN COMMITTING CODE
- We prefer simple, clean, maintainable solutions over clever or complex ones, even if the latter are more concise or performant. Readability and maintainability are primary concerns.
- Make the smallest reasonable changes to get to the desired outcome. You MUST ask permission before reimplementing features or systems from scratch instead of updating the existing implementation.
- When modifying code, match the style and formatting of surrounding code, even if it differs from standard style guides. Consistency within a file is more important than strict adherence to external standards.
- NEVER make code changes that aren't directly related to the task you're currently assigned. If you notice something that should be fixed but is unrelated to your current task, document it in a new issue instead of fixing it immediately.
- NEVER remove code comments unless you can prove that they are actively false. Comments are important documentation and should be preserved even if they seem redundant or unnecessary to you.
- All code files should start with a brief 2 line comment explaining what the file does. Each line of the comment should start with the string "ABOUTME: " commented out in whatever the file's comment syntax is to make it easy to grep for.
- When writing comments, avoid referring to temporal context about refactors or recent changes. Comments should be evergreen and describe the code as it is, not how it evolved or was recently changed.
- NEVER implement a mock mode for testing or for any purpose. We always use real data and real APIs, never mock implementations.
- When you are trying to fix a bug or compilation error or any other issue, YOU MUST NEVER throw away the old implementation and rewrite without explicit permission from the user. If you are going to do this, YOU MUST STOP and get explicit permission from the user.
- NEVER name things as 'improved' or 'new' or 'enhanced', etc. Code naming should be evergreen. What is new today will be "old" someday.
- Commit your work regularly using git. Commit whenever you complete an atomic unit of functionality — a discrete feature, bug fix, or substantial logical chunk — regardless of how many files changed. Each commit should represent a coherent, working state. Write clear, descriptive commit messages in imperative mood. Don't wait until everything is done; commit incrementally as you complete meaningful pieces.

# Getting help

- ALWAYS ask for clarification rather than making assumptions.
- If you're having trouble with something, it's ok to stop and ask for help. Especially if it's something your human might be better at.

# Testing

- Tests MUST cover the functionality being implemented.
- NEVER ignore the output of the system or the tests - Logs and messages often contain CRITICAL information.
- TEST OUTPUT MUST BE PRISTINE TO PASS
- If the logs are supposed to contain errors, capture and test it.
- NO EXCEPTIONS POLICY: Under no circumstances should you mark any test type as "not applicable". Every project, regardless of size or complexity, MUST have unit tests, integration tests, AND end-to-end tests. If you believe a test type doesn't apply, you need the human to say exactly "I AUTHORIZE YOU TO SKIP WRITING TESTS THIS TIME"

## Testing Frameworks

- **Jest**: For Node.js/JavaScript unit and integration tests
  - Run tests: `npm test`
  - Watch mode: `npm run test:watch`
  - Coverage: `npm run test:coverage`
- **Newman**: For API/end-to-end test validation
  - Run collections: `newman run postman/collection.json`
  - With environment: `newman run postman/collection.json -e postman/environment.json`
  - With config file: `newman run --config newman.config.json`
  - Install globally: `npm install -g newman`

## We practice TDD. That means:

- Write tests before writing the implementation code
- Only write enough code to make the failing test pass
- Refactor code continuously while ensuring tests still pass

### TDD Implementation Process

- Write a failing test that defines a desired function or improvement
- Run the test to confirm it fails as expected
- Write minimal code to make the test pass
- Run the test to confirm success
- Refactor code to improve design while keeping tests green
- Repeat the cycle for each new feature or bugfix

## Tools we use

- Most of the time, we're working with Twilio's CPaaS APIs, so you should be familiar with their APIs and how to use them.
- Whenever possible, we build on top of Twilio's serverless functions to eliminate latency and improve performance. Please familiarize yourself with Twilio's serverless functions and how to use them: https://www.twilio.com/docs/serverless/functions-assets/functions
- Twilio serverless Functions are written in Node.js, so we should write our code in Node.js unless specifically indicated otherwise. Here's Twilio's helper library: https://github.com/twilio/twilio-node. Please familiarize yourself with it.
- You must use the Twilio CLI to deploy code instead of interacting directly with Twilio's Console. Please familiarize yourself with the Twilio CLI: https://www.twilio.com/docs/twilio-cli.
- Additionally, Twilio provides a toolkit for building serverless applications: https://github.com/twilio-labs/serverless-toolkit.
- **Important:** For complete setup instructions regarding Node.js installation, Twilio CLI, serverless functions, and environment variable configuration, please refer to the [README.md](../../README.md) file.
- When working with Twilio's APIs, always refer to the official documentation for the most accurate and up-to-date information.

## Claude Code Specific Guidelines

- Our goal is to use the latest and most effective practices for developers protoyping with Twilio technologies using Claude Code.
- We want leverage Claude Code's capabilities to automate repetitive tasks, generate boilerplate code, and assist with documentation.
- This includes:
  - Using Claude Code to generate initial project scaffolding based on specifications
  - Automating test generation for new features
  - Assisting with code reviews by identifying potential issues or improvements
  - Generating and maintaining technical documentation
  - Using Plan Mode to create structured development plans and task lists
  - Managing context effectively with prompt caching
  - Using Claude.md hierarchy with user-level instructions, repo-level instructions at repo root, and sub-repo instructions in specific directories
  - Custom slash commands for things like checking Twilio docs and pulling Twilio logs
  - Using Claude Code Skills to encapsulate and extend functionality
  - Using Subagents for specialized tasks within the development workflow; e.g. a developer subagent for coding tasks, a code reviewer subagent for reviewing code and making comments and suggestions, a lead developer/architect subagent for ensuring overall project consistency and adherence to Claude Code best practices and Twilio's APIs and serverless functionality, a tester subagent for testing tasks, etc. 

# Package Management

## Node.js Development  
- Use `npm` for Node.js package management
- Install packages with: `npm install <package>`
- Packages are managed in `package.json`
- Install test dependencies: `npm install --save-dev jest ts-jest @types/jest supertest newman`

# Agent-Assisted Pipeline

This repository uses an agent-assisted pipeline with structured workflows:

- **Brainstorming**: Use `.github/prompts/brainstorm.md` with chat models for idea generation
- **Specification**: Create detailed software specs in `spec.md`
- **Planning**: Use `.github/prompts/plan.md` with reasoning models to generate `prompt_plan.md`
- **Task Management**: Maintain task tracking in `todo.md` - always check off completed work
- **Execution**: Follow prompts in `.github/prompts/` for code generation, GitHub issues, and task completion

# Workflow Requirements

- **Testing**: Make sure all tests pass before marking tasks as done
- **Linting**: Ensure linting passes before completing tasks
- **Todo Management**: If `todo.md` exists, check off any completed work
- **GitHub Integration**: Use agent scripts to create issues and sync with todo tasks

## Build and Development Commands

```bash
# Install dependencies
npm install

# Run local development server
npm start                    # Start on port 3000
npm run start:ngrok          # Start with ngrok tunnel

# Testing
npm test                     # Run unit and integration tests
npm run test:watch           # Run tests in watch mode
npm run test:coverage        # Run tests with coverage report
npm run test:e2e             # Run Newman E2E tests
npm run test:all             # Run all tests

# Linting
npm run lint                 # Check for linting errors
npm run lint:fix             # Auto-fix linting errors

# Deployment
npm run deploy:dev           # Deploy to dev environment
npm run deploy:prod          # Deploy to production
```

## Architecture

### Directory Structure

```text
twilio-agent-factory/
├── .claude/commands/        # Custom slash commands for subagents
├── .github/
│   ├── prompts/             # Agent-assisted pipeline prompts
│   └── workflows/           # GitHub Actions CI/CD
├── functions/               # Twilio serverless functions
│   ├── voice/               # Voice call handlers
│   ├── messaging/           # SMS/MMS handlers
│   ├── conversation-relay/  # Real-time voice AI
│   ├── verify/              # Phone verification
│   ├── sync/                # Real-time state synchronization
│   ├── taskrouter/          # Task routing to workers
│   ├── messaging-services/  # Sender pools, compliance
│   ├── callbacks/           # Status callback handlers
│   └── helpers/             # Shared private functions
├── agents/                  # AI development tooling
│   ├── mcp-servers/twilio/  # MCP server for Twilio APIs
│   ├── feature-factory/     # Development workflow orchestration
│   └── voice-ai-builder/    # Voice AI app generator
├── assets/                  # Static assets
├── __tests__/
│   ├── unit/                # Unit tests
│   ├── integration/         # Integration tests
│   └── e2e/                 # E2E tests
└── postman/                 # Newman E2E collections
```

### Function Access Levels

- `*.js` - **Public**: Anyone can call these endpoints
- `*.protected.js` - **Protected**: Require valid Twilio request signature
- `*.private.js` - **Private**: Only callable from other functions

### CLAUDE.md Hierarchy

This project uses a hierarchical CLAUDE.md structure:

1. **Root CLAUDE.md** (this file): Project-wide standards and commands
2. **Subdirectory CLAUDE.md files**: API-specific context
   - `functions/voice/CLAUDE.md` - Voice TwiML and webhook reference
   - `functions/messaging/CLAUDE.md` - SMS/MMS patterns and parameters
   - `functions/conversation-relay/CLAUDE.md` - WebSocket protocol and LLM integration
   - `functions/verify/CLAUDE.md` - Verification API and error handling
   - `functions/sync/CLAUDE.md` - Real-time state synchronization (Documents, Lists, Maps, Streams)
   - `functions/taskrouter/CLAUDE.md` - Task routing to workers and agents
   - `functions/messaging-services/CLAUDE.md` - Sender pools, geographic routing, compliance
3. **Reference Documents**: Quick-reference material for CLI and tools
   - `.claude/references/twilio-cli.md` - Comprehensive Twilio CLI command reference

## Custom Slash Commands

The following slash commands are available for specialized tasks:

### Workflow Commands

| Command | Description |
|---------|-------------|
| `/orchestrate [workflow] [task]` | Workflow coordinator - runs full development pipelines |

### Development Subagents

| Command | Description |
|---------|-------------|
| `/architect [topic]` | Architect - design review, pattern selection, CLAUDE.md maintenance |
| `/spec [feature]` | Specification writer - creates detailed technical specifications |
| `/test-gen [feature]` | Test generator - TDD Red Phase, writes failing tests first |
| `/dev [task]` | Developer - TDD Green Phase, implements to pass tests |
| `/review [target]` | Senior developer - code review, security audit, approval authority |
| `/test [scope]` | Test runner - executes and validates test suites |
| `/docs [scope]` | Technical writer - documentation updates and maintenance |

### Utility Commands

| Command | Description |
|---------|-------------|
| `/twilio-docs [topic]` | Searches Twilio documentation |
| `/twilio-logs` | Fetches and analyzes Twilio debugger logs |
| `/deploy [env]` | Deployment helper with pre/post checks |
| `/context [action]` | Context optimization - summarize, load, or analyze context |

## Context Engineering Skills

This template includes context engineering skills in `.claude/skills/`:

| Skill | Purpose |
|-------|---------|
| `context-fundamentals.md` | Core context management principles for Twilio development |
| `context-compression.md` | Techniques for summarizing TwiML, webhooks, and test output |
| `multi-agent-patterns.md` | Orchestration and coordination patterns for subagents |
| `memory-systems.md` | State tracking across sessions and webhook invocations |

### When to Use Skills

- **Starting long sessions**: Load `context-fundamentals.md` for principles
- **Context getting cluttered**: Run `/context summarize` to compress
- **Complex multi-step features**: Reference `multi-agent-patterns.md`
- **Tracking state across webhooks**: Use patterns from `memory-systems.md`

### Accessing Skills

Skills can be accessed via:

1. **Direct read**: Load skill file when starting relevant work
2. **Context command**: Run `/context [action]` for guided optimization
3. **Subagent reference**: Orchestrator and Architect load skills automatically

## Subagent Workflows

This project uses specialized subagents that can work standalone or be orchestrated together.

### New Feature Pipeline

```text
/architect ──► /spec ──► /test-gen ──► /dev ──► /review ──► /test ──► /docs
```

Run with: `/orchestrate new-feature [description]`

### Bug Fix Pipeline

```text
/twilio-logs ──► /architect ──► /test-gen ──► /dev ──► /review ──► /test
```

Run with: `/orchestrate bug-fix [issue]`

### Refactor Pipeline

```text
/test ──► /architect ──► /dev ──► /review ──► /test
```

Run with: `/orchestrate refactor [target]`

### TDD Enforcement

1. **Red Phase** (`/test-gen`): Write failing tests first
2. **Green Phase** (`/dev`): Write minimal code to pass tests
3. **Refactor**: Improve code while keeping tests green

The `/dev` subagent verifies failing tests exist before implementing. See `.claude/workflows/README.md` for detailed workflow documentation.

## Claude Code Hooks

This project uses Claude Code hooks to automate enforcement of coding standards. Hooks are configured in `.claude/settings.json`.

### Active Hooks

| Hook | Event | Purpose |
|------|-------|---------|
| `pre-write-validate.sh` | PreToolUse (Write/Edit) | Blocks hardcoded credentials, enforces ABOUTME |
| `pre-bash-validate.sh` | PreToolUse (Bash) | Blocks --no-verify, validates before deploy |
| `post-write.sh` | PostToolUse (Write/Edit) | Auto-lints JS files with ESLint |
| `post-bash.sh` | PostToolUse (Bash) | Logs deploy/test completions |
| `subagent-log.sh` | SubagentStop | Logs workflow activity |
| `notify-ready.sh` | Stop | Desktop notification when done |

### What Gets Blocked (Exit Code 2)

- Hardcoded Twilio credentials (`AC...`, `SK...`, auth tokens)
- `git commit --no-verify` or `git commit -n`
- `git push --force` to main/master
- Deployment when tests fail
- Deployment when linting fails
- New function files without ABOUTME comments

### Hook Scripts Location

All hook scripts are in `.claude/hooks/` and can be modified to adjust behavior.

## Environment Variables

Required environment variables (see `.env.example`):

| Variable | Description |
|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Your Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Your Twilio Auth Token |
| `TWILIO_API_KEY` | API Key (recommended for production) |
| `TWILIO_API_SECRET` | API Secret (recommended for production) |
| `TWILIO_PHONE_NUMBER` | Your Twilio phone number (E.164) |
| `TWILIO_VERIFY_SERVICE_SID` | Verify Service SID (for verification features) |
| `TWILIO_SYNC_SERVICE_SID` | Sync Service SID (for real-time state sync) |
| `TWILIO_TASKROUTER_WORKSPACE_SID` | TaskRouter Workspace SID |
| `TWILIO_TASKROUTER_WORKFLOW_SID` | TaskRouter Workflow SID |
| `TWILIO_MESSAGING_SERVICE_SID` | Messaging Service SID (for sender pools) |
| `TEST_PHONE_NUMBER` | Test recipient number for E2E tests (E.164) |
| `TWILIO_STATUS_CALLBACK_URL` | Webhook URL for status callbacks |
| `TWILIO_FALLBACK_URL` | Fallback URL when primary webhook fails |

## CI/CD Pipeline

GitHub Actions workflows:

- **CI** (`ci.yml`): Runs on push/PR to main/develop - tests and lints
- **Deploy Dev** (`deploy-dev.yml`): Deploys to dev on push to develop
- **Deploy Prod** (`deploy-prod.yml`): Deploys to production on push to main

Required GitHub Secrets:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_API_KEY`
- `TWILIO_API_SECRET`
- `TWILIO_PHONE_NUMBER`
- `TWILIO_VERIFY_SERVICE_SID`
- `TEST_PHONE_NUMBER`

---

## Attribution

This CLAUDE.md structure and many of the interaction patterns were inspired by:

- **Harper Reed's dotfiles**: [github.com/harperreed/dotfiles/.claude/CLAUDE.md](https://github.com/harperreed/dotfiles/blob/master/.claude/CLAUDE.md) - The foundational approach to Claude Code configuration, relationship framing, and coding principles.

- **Agent Skills for Context Engineering**: [github.com/muratcankoylan/Agent-Skills-for-Context-Engineering](https://github.com/muratcankoylan/Agent-Skills-for-Context-Engineering) - Context engineering skills adapted for Twilio development workflows.

Thank you to these developers for sharing their work openly.
