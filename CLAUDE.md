# CLAUDE.md

> **First session?** Ask the user for their preferred name and update the "Preferred name" field in the Shared Working Agreement section below.
>
> **Preferred name: [Your name here]**

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository contains two distinct but complementary concerns:

### Core Twilio Prototyping (`functions/`)

Production-ready Twilio serverless functions for voice, messaging, verification, and more. Built on Node.js, deployed via Twilio CLI and Serverless Toolkit.

- `functions/voice/` — Voice call handlers (TwiML)
- `functions/messaging/` — SMS/MMS handlers
- `functions/verify/` — Phone verification
- `functions/sync/` — Real-time state synchronization
- `functions/taskrouter/` — Skills-based routing
- `functions/conversation-relay/` — Real-time voice AI
- `functions/callbacks/` — Status callback handlers
- `functions/helpers/` — Shared private utilities

### AI Development Tooling (`agents/`)

Autonomous agent infrastructure built on Claude Agent SDK and MCP. These are AI-assisted development tools, not production Twilio serverless code.

- `agents/mcp-servers/twilio/` — MCP server wrapping Twilio APIs as 351 tools
- `agents/feature-factory/` — Orchestrated development workflows
- `agents/voice-ai-builder/` — Voice AI application generator

### Architecture Separation

**Critical**: These two concerns are intentionally decoupled.

- **Functions do NOT import from agents/** — Serverless functions are standalone
- **Agents do NOT call function webhooks** — Agents use Twilio APIs directly
- **Integration via Twilio services only** — Functions write to Sync, agents read from Sync
- **Independent package.json files** — Each has its own dependencies

See [DESIGN_DECISIONS.md](/DESIGN_DECISIONS.md) for architectural rationale and [.claude/references/tool-boundaries.md](/.claude/references/tool-boundaries.md) for MCP vs CLI vs Functions guidance.

### Meta-Development Mode

When `.meta/` exists at the project root, this is a meta-development environment (gitignored, never ships). You are developing the factory itself, not using it as a shipped product.

**File routing in meta-development mode:** Session-specific files live under `.meta/` instead of at root or `.claude/`:

- **Todo / roadmap**: `.meta/todo.md` in meta-development, `todo.md` otherwise
- **Session learnings**: `.meta/learnings.md` in meta-development, `.claude/learnings.md` otherwise
- **Pending actions**: `.meta/pending-actions.md` in meta-development, `.claude/pending-actions.md` otherwise
- **Archived plans**: `.meta/plans/` in meta-development, `.claude/archive/plans/` otherwise

The hooks in `.claude/hooks/` auto-detect the environment. Claude must also follow this routing — when the user says "todo" or "learnings", use the meta-development paths if `.meta/` exists. See `.meta/CLAUDE.md` for full meta-development documentation.

**NEVER rename or move `.meta/` to bypass hook enforcement.** If a hook is blocking legitimate work, fix the hook in a separate session. Renaming `.meta/` disables all meta-mode routing and leaves session state in the wrong locations.

## MCP Server & Tool Discovery

The project embeds an MCP server at `agents/mcp-servers/twilio/` with 351 Twilio API tools. It is auto-discovered by Claude Code via `.mcp.json` at the project root — no manual registration needed.

- **Tool reference**: `agents/mcp-servers/twilio/REFERENCE.md` — full inventory organized by domain and priority tier
- **Finding the right tool**: See `.claude/rules/self-service.md` for the SID-first lookup hierarchy
- **If tools aren't available**: Verify `agents/mcp-servers/twilio/dist/serve.js` exists. If missing, rebuild: `cd agents/mcp-servers/twilio && npm install && npm run build`
- **After changing `.env` credentials**: Exit and relaunch Claude Code so the MCP server picks up the new values

### MCP Validation Tools (USE THESE!)

Use MCP validation tools instead of CLI commands for Twilio validation. They provide deep validation beyond HTTP 200 — automatic polling, content quality checks, forbidden pattern detection, and unified error reporting.

Available tools: `validate_call`, `validate_message`, `validate_recording`, `validate_transcript`, `validate_debugger`, `validate_environment`, `validate_voice_ai_flow`, `validate_two_way`, `validate_language_operator`, `validate_sync_document`, `validate_sync_list`, `validate_sync_map`, `validate_task`, `validate_sip`, `validate_video_room`. See `agents/mcp-servers/twilio/src/tools/validation.ts` and `environment.ts` for full documentation.

### MCP Tool Loading — IMPORTANT

ALL MCP tools (including P0 tools like `make_call` and `send_sms`) appear in `<available-deferred-tools>`. This is NORMAL — it does NOT mean the MCP server is broken. To use any MCP tool:

1. Call `ToolSearch("select:mcp__twilio__make_call")` to hydrate its schema
2. Then call the tool normally

NEVER say "MCP tools aren't available" or tell the user to restart Claude Code when you can see `mcp__twilio__*` entries in `<available-deferred-tools>`. Their presence means the MCP server IS connected and working.

For tools not visible in the deferred list, use keyword search: `ToolSearch("+twilio video room")`.

### MCP-First Rule for Twilio Operations

When MCP tools are available, ALWAYS use them over Twilio CLI:
- Making calls: `make_call`, NOT `twilio api:core:calls:create`
- Sending SMS: `send_sms`, NOT `twilio api:core:messages:create`
- Querying: `get_call_logs`, NOT `twilio api:core:calls:list`
- All validation: `validate_*` tools

CLI is ONLY for operations with no MCP equivalent:
- `twilio profiles:list` / `twilio profiles:use`
- `twilio serverless:deploy`
- `twilio plugins:install`

If you catch yourself reaching for `twilio api:*`, stop and use the corresponding MCP tool instead.

## Agent Teams

Agent Teams coordinate multiple Claude Code instances for parallel work. Use `/team [workflow] [task]` to launch. See the `agent-teams-guide` skill for configurations, comparison with subagents, and enable/disable instructions.

## Documentation Navigator

See [.claude/references/doc-navigator.md](/.claude/references/doc-navigator.md) for the full topic-to-file lookup table (36 entries covering all domains, skills, and references).

## Your Role as Primary Agent
- **Architecture & Planning**: Lead on system design and specification creation
- **Test-Driven Development**: Primary responsibility for comprehensive test coverage
- **Code Review**: Final validation of complex logic and architectural decisions
- **Documentation**: Maintain and update technical documentation

## Development Pipeline

New serverless functions and significant features MUST use the development pipeline via `/orchestrate` (architect → prototype → spec → test-gen → dev → review → docs). The pre-write hook enforces this — new function files without corresponding tests will be blocked.

**When to use**: New files in `functions/`, new Twilio features, anything touching voice/messaging/verification.
**When NOT needed**: Bug fixes, doc updates, config changes, single-line refactors within existing files.
**When to prototype**: Conditional — when architect identifies unknowns (unfamiliar APIs, ambiguous docs, multi-service interactions not previously tested, real-time protocols with undocumented edge cases). Output is a short "Spike Results" note, not production code.

## Documentation Protocol

This project uses a **doc-first approach**: Check → Act → Record.

- **Before CLI ops**: Read `.claude/references/twilio-cli.md` — CLI flags are presence-based, not `=true`. Check `tool-boundaries.md` before deployment decisions. Run `./scripts/env-doctor.sh` if hitting auth failures.
- **Before code changes**: Read the domain's CLAUDE.md (see Documentation Navigator). For external APIs, check context-hub: `.claude/skills/context-hub.md`.
- **Discovery capture**: Add to learnings file IMMEDIATELY when you learn something unexpected (see [Meta-Development Mode](#meta-development-mode) for path).
- **Before committing**: Check pending-actions file, address or defer suggestions, verify learnings captured.
- Full workflow: see the `doc-flywheel` skill.

# Shared Working Agreement

This section establishes shared language and expectations between human and AI collaborators. These aren't directives to follow — they're principles we both operate under.

## Working Together

- We are collaborators working together on technical problems.
- Communication should be direct, professional, and collegial.
- Mutual respect: neither party is infallible, and we learn from each other.
- It's encouraged to push back with evidence when you disagree.
- Ask questions when something is unclear rather than making assumptions.

## Communication Style

- Get straight to the point. Skip the preamble phrases like "Great idea!", "Good question!", "Absolutely!", "That's a great point!", etc.
- Be direct without being cold. Friendly and professional, not effusive.
- You don't need to validate or congratulate me. Just engage with the content.
- It's fine to disagree, express uncertainty, or say "I don't know" - that's more useful than false confidence or hollow agreement.
- Keep responses concise. If something can be said in fewer words, do that.
- Save enthusiasm for when something is genuinely interesting or well-done, so it means something when you express it.
- Bias toward action over analysis. Start producing deliverables within the first 2-3 messages. If research is needed, do it inline as you write — don't do a separate exploration pass first. When interrupted, take it as a signal to produce output immediately.

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
- **LLM velocity trap**: AI tools can produce plausible-looking code faster than anyone can evaluate it, locking you into an approach that conceals subtle problems. The pipeline enforcement, TDD mandate, and "smallest reasonable changes" principle exist to counteract this — they force validation checkpoints before momentum builds. When you feel the urge to skip ahead, that's the trap working.

# Getting help

- ALWAYS ask for clarification rather than making assumptions.
- If you're having trouble with something, it's ok to stop and ask for help. Especially if it's something your human might be better at.
- Before starting a deliverable (document, audit, plan, analysis), confirm the framing with a 1-2 sentence summary of what you'll produce and what perspective you'll take. "I'll write a [type] from [perspective] covering [scope]." This prevents wasted effort on wrong-format outputs.

# Debugging

- Form a hypothesis and verify it with actual data BEFORE attempting fixes. Do not shotgun-debug by trying random changes.
- Do not switch approaches (e.g., `<Record>` vs `<Dial record>`, polling vs webhooks) without confirming with the user first. The current approach usually exists for a reason.
- When debugging Twilio calls, use the Call Notifications API or MCP `validate_call` tool for deep validation — surface-level debugger checks miss most issues.
- Before deploying Twilio Functions, verify the active CLI profile with `twilio profiles:list`. Multi-account setups are common and deploying to the wrong account is hard to detect.
- Twilio phone number direction matters:
  - **Outbound** (API-initiated): FROM = your Twilio number, TO = the destination
  - **Inbound** (webhook-triggered): FROM = the external caller/sender, TO = your Twilio number
- When a multi-step validation or implementation plan exists, NEVER silently skip steps. If a step cannot be completed, explicitly report it as skipped with the reason. Report completion status for every step, not just the ones that succeeded.
- If authentication or credentials expire mid-session, surface it to the user immediately rather than attempting workarounds or continuing with degraded access.

## When Blocked by a Hook

When a pre-write or pre-bash hook blocks your action, **do not guess at workarounds**. Follow this protocol:

1. **Check `settings.local.json` first.** The permissions list is a record of previously-approved workflows. Search it for the pattern you need — the answer is almost always already there.
2. **Use the established bypass.** For meta-mode write blocks, prepend the env var to a Bash command:
   ```bash
   CLAUDE_ALLOW_PRODUCTION_WRITE=true cat > functions/path/file.js << 'EOF'
   ...
   EOF
   ```
3. **Do NOT** edit hooks, modify `settings.json` env blocks, add paths to allowed lists, or ask the user to set environment variables. These are all wrong.
4. If `settings.local.json` has no prior art and you genuinely don't know the bypass, **ask the user** instead of trying multiple approaches.

## Architectural Invariants

Rules that prevent real debugging time loss. Loaded contextually via `.claude/rules/*-invariants.md` (serverless, environment, voice-protocol). Each rule also lives in its domain CLAUDE.md file. See `.claude/references/operational-gotchas.md` for cross-cutting gotchas.

- **Verify FriendlyName: max 4 total digits** — `POST /v2/Services` returns 60200 ("Invalid parameter") if FriendlyName contains 5+ digit characters total, even non-consecutive. Use alpha-only identifiers for programmatic names (`echo "$TS" | md5 | tr '0-9' 'g-p' | head -c 8`).

# Session discipline

- **Ephemeral branch guard**: Before committing, check the current branch. If it matches `validation-*`, `headless-*`, `uber-val-*`, or `fresh-install-*`, **stop and ask the user** whether to switch to main first. The pre-commit hook warns about this, but you MUST treat that warning as actionable — do not proceed without user confirmation. Feature work should land on main, not on leftover validation branches.
- Prioritize the pipeline over ad-hoc implementation. For tasks that create new functions, always invoke `/orchestrate` or run pipeline phases sequentially. Ad-hoc coding (skipping architect/spec) is only appropriate for bug fixes and small edits to existing files.
- Do not convert lazy/conditional `require()` calls to static `import` statements without verifying the conditional logic still works. Node.js conditional requires exist for a reason (optional dependencies, environment-specific loading).
- Run the full relevant test suite before presenting work as complete. A passing subset is not sufficient — regressions in unrelated tests still need to be caught.
- After modifying TypeScript files, run `tsc --noEmit` in the relevant package to verify compilation before committing.

# Testing

- Tests MUST cover the functionality being implemented.
- NEVER ignore the output of the system or the tests - Logs and messages often contain CRITICAL information.
- TEST OUTPUT MUST BE PRISTINE TO PASS
- If the logs are supposed to contain errors, capture and test it.
- NO EXCEPTIONS POLICY: Under no circumstances should you mark any test type as "not applicable". Every project, regardless of size or complexity, MUST have unit tests, integration tests, AND end-to-end tests. If you believe a test type doesn't apply, you need the human to say exactly "I AUTHORIZE YOU TO SKIP WRITING TESTS THIS TIME"
- We practice TDD: write tests first, make them pass, refactor. The `/dev` subagent verifies failing tests exist before implementing.

# Package Management

## Node.js Development
- Use `npm` for Node.js package management
- Install packages with: `npm install <package>`
- Packages are managed in `package.json`
- Install test dependencies: `npm install --save-dev jest ts-jest @types/jest supertest newman`

# Workflow Requirements

- **Testing**: Make sure all tests pass before marking tasks as done
- **Linting**: Ensure linting passes before completing tasks
- **Todo Management**: Check off completed work in the todo file (see [Meta-Development Mode](#meta-development-mode))
- **GitHub Integration**: Use agent scripts to create issues and sync with todo tasks

Build/dev commands are in `.claude/rules/build-commands.md` (loads when working on functions or tests).

## Function Access Levels

- `*.js` - **Public**: Anyone can call these endpoints
- `*.protected.js` - **Protected**: Require valid Twilio request signature
- `*.private.js` - **Private**: Only callable from other functions

## Slash Commands

See `.claude/rules/slash-commands.md` for the full command reference. Key entry points: `/orchestrate`, `/team`, `/architect`.
