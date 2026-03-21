# ABOUTME: Development workflow patterns — which pipeline phases to run for each task type.
# ABOUTME: Reference doc extracted from the former /orchestrate command.

# Development Workflow Patterns

Claude Code is the orchestrator. It reads the project docs, sequences phases, tracks state, handles errors, and asks clarifying questions natively. No separate orchestration tool is needed — just follow the phase sequences below.

## Workflow Selection

| Request Type | Workflow | First Phase |
|--------------|----------|-------------|
| "Implement...", "Add...", "Create..." | New Feature | `/architect` |
| "Fix...", "Debug...", "Resolve..." | Bug Fix | `/twilio-logs` |
| "Refactor...", "Clean up...", "Improve..." | Refactor | `/test` |
| "Document...", "Update docs..." | Documentation | `/docs` |
| "Audit...", "Check security..." | Security Audit | `/review` |

## Phase Sequences

### New Feature

```
/architect ──► /prototype (if unknowns) ──► /spec ──► /test-gen ──► /dev ──► /review ──► /test ──► /docs
```

**Use when**: Building new functionality from scratch.

**Prototype step**: If `/architect` identifies unknowns (unfamiliar APIs, ambiguous behavior, multi-service interactions), run `/prototype` to spike the unknowns before writing a spec. Skip if you have prior experience with all involved APIs.

### Bug Fix

```
/twilio-logs ──► /architect (diagnose) ──► /test-gen (regression) ──► /dev ──► /review ──► /test
```

**Use when**: Fixing broken functionality, addressing errors.

### Refactor

```
/test ──► /architect ──► /dev ──► /review ──► /test
```

**Use when**: Improving code structure without changing behavior.

### Documentation

```
/docs
```

**Use when**: Updating README, CLAUDE.md, or API documentation.

### Security Audit

```
/review (security focus) ──► /dev (if fixes needed) ──► /test
```

**Use when**: Auditing for vulnerabilities, credential exposure, input validation.

## Terminal Steps

All workflows that produce code changes should end with `/commit` to stage and commit with validation. If the work is ready for remote, follow with `/push`. These are optional — the user may prefer to commit/push manually.

## Context Handoff Between Phases

When moving between phases, carry forward key context using XML tags:

- `<prior_phase source="architect">` — Architecture decisions, selected patterns
- `<prior_phase source="spec">` — Specification summary, acceptance criteria
- `<prior_phase source="test-gen">` — Test file paths, key test cases
- `<user_request>` — Original user request (preserve through entire pipeline)

## Phase Handoff Suggestions

Each subagent suggests the next logical step:

| After | Suggests |
|-------|----------|
| `/architect` | `/prototype` (if unknowns) or `/spec` (if no unknowns) |
| `/prototype` | `/spec` for detailed specification |
| `/spec` | `/test-gen` for test generation |
| `/test-gen` | `/dev` for implementation |
| `/dev` | `/review` for code review |
| `/review` (APPROVED) | `/test` for final validation |
| `/review` (NEEDS_CHANGES) | `/dev` for fixes |
| `/test` | `/docs` for documentation |
