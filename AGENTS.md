# AGENTS.md

Universal guidance for AI coding agents working in this repository. This file is tool-agnostic — it works with Claude Code, Codex CLI, Cursor, GitHub Copilot, and other AI coding assistants.

## Project Overview

Twilio CPaaS prototyping template with production-ready serverless functions and AI development tooling.

### Structure

```
functions/          # Twilio serverless functions (Node.js)
  voice/            # Voice call handlers (TwiML)
  messaging/        # SMS/MMS handlers
  verify/           # Phone verification
  sync/             # Real-time state synchronization
  taskrouter/       # Skills-based routing
  conversation-relay/ # Real-time voice AI
  callbacks/        # Status callback handlers
  helpers/          # Shared private utilities
agents/             # AI development tooling (NOT serverless code)
  mcp-servers/twilio/ # MCP server wrapping Twilio APIs
  feature-factory/  # Orchestrated development workflows
  voice-ai-builder/ # Voice AI application generator
__tests__/          # Test suites
  unit/             # Unit tests (mirrors functions/ structure)
  integration/      # Integration tests (require real credentials)
  e2e/              # End-to-end tests
scripts/            # Development and deployment scripts
```

### Architecture Separation

These two concerns are intentionally decoupled:

- **Functions do NOT import from agents/** — serverless functions are standalone
- **Agents do NOT call function webhooks** — agents use Twilio APIs directly
- **Integration via Twilio services only** — functions write to Sync, agents read from Sync
- **Independent package.json files** — each has its own dependencies

## Build & Test Commands

```bash
# Install dependencies
npm install

# Run unit + integration tests
npm test

# Run tests with coverage
npm run test:coverage

# Run E2E tests (requires deployed functions)
npm run test:e2e

# Lint
npm run lint
npm run lint:fix

# Start local dev server
npm start

# Deploy
npm run deploy:dev
npm run deploy:prod
```

## Coding Conventions

- Simple, clean, maintainable solutions over clever or performant ones
- Match the style of surrounding code — consistency within a file over external standards
- Make the smallest reasonable changes to achieve the outcome
- All code files start with a 2-line ABOUTME comment:
  ```javascript
  // ABOUTME: What this file does — action-oriented
  // ABOUTME: Additional context — key behaviors, dependencies
  ```
- Never name things as 'improved', 'new', 'enhanced' — use evergreen descriptive names
- Never remove code comments unless they are provably false
- Never hardcode Twilio credentials (Account SID, Auth Token, API Keys) — use environment variables
- Twilio magic test numbers (+15005550xxx) belong only in test files

## Function Access Levels

- `*.js` — **Public**: Anyone can call these endpoints
- `*.protected.js` — **Protected**: Require valid Twilio request signature
- `*.private.js` — **Private**: Only callable from other functions

## Testing Requirements

- **TDD enforced**: Write failing tests first, then implement
- Test files go in `__tests__/unit/<domain>/<name>.test.js` mirroring `functions/<domain>/<name>.js`
- New function files without corresponding tests will be blocked by pre-write hooks
- Never implement mock mode — always use real data and real APIs
- Coverage threshold: 80%
- All test types required: unit, integration, and end-to-end

## Development Pipeline

New serverless functions and significant features follow this pipeline:

1. **Architect** — Design review, pattern selection, unknowns identification
2. **Prototype** (conditional) — Quick spike when unknowns exist
3. **Spec** — Detailed technical specification
4. **Test-Gen** — Write failing tests (TDD Red phase)
5. **Dev** — Implement to make tests pass (TDD Green phase)
6. **Review** — Code review, security audit
7. **Docs** — Documentation updates

**When to use**: New files in `functions/`, new Twilio features, anything touching voice/messaging/verification.
**When NOT needed**: Bug fixes, doc updates, config changes, single-line refactors within existing files.

## Debugging

- Form a hypothesis and verify with data before attempting fixes
- Twilio phone number direction matters:
  - **Outbound** (API-initiated): FROM = your Twilio number, TO = the destination
  - **Inbound** (webhook-triggered): FROM = the external caller/sender, TO = your Twilio number
- Verify the active Twilio CLI profile before deploying: `twilio profiles:list`
- Never silently skip steps in a multi-step plan — report every step's status

## Architectural Invariants

- **Verify FriendlyName: max 4 total digits** — Twilio's `POST /v2/Services` returns 60200 if FriendlyName contains 5+ digit characters
- **jq is a prerequisite** — Safety hooks require it. Install via `brew install jq`
- **No --no-verify on git commits** — Pre-commit hooks exist for a reason
- **No force push to main** — Feature work on branches

## Key Design Decisions

See [DESIGN_DECISIONS.md](DESIGN_DECISIONS.md) for architectural rationale.
