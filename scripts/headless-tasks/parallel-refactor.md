<!-- ABOUTME: Prompt template for scope-parallel refactoring using Task subagents. -->
<!-- ABOUTME: Spawns one subagent per domain/package, each self-verifying, coordinator runs full suite. -->

Apply a cross-cutting refactor across this project using parallel sub-agents.

## Step 1: Read the Refactor Spec

Read `.meta/refactor-spec.md` for the refactor description. If that file does not exist, stop and report: "No refactor spec found at .meta/refactor-spec.md — write your refactor description there and re-run."

## Step 2: Identify Affected Scope Units

Scan the codebase to determine which scope units contain files affected by the refactor. The project has these scope units:

**Function domains** (share root `package.json`):

| Domain | Path | Test command |
|--------|------|-------------|
| voice | `functions/voice/` | `npm test -- --testPathPattern=voice` |
| messaging | `functions/messaging/` | `npm test -- --testPathPattern=messaging` |
| callbacks | `functions/callbacks/` | `npm test -- --testPathPattern=callbacks` |
| conversation-relay | `functions/conversation-relay/` | `npm test -- --testPathPattern=conversation-relay` |
| verify | `functions/verify/` | `npm test -- --testPathPattern=verify` |
| sync | `functions/sync/` | `npm test -- --testPathPattern=sync` |
| taskrouter | `functions/taskrouter/` | `npm test -- --testPathPattern=taskrouter` |
| messaging-services | `functions/messaging-services/` | `npm test -- --testPathPattern=messaging-services` |
| helpers | `functions/helpers/` | `npm test -- --testPathPattern=helpers` |

**Agent packages** (independent `package.json`):

| Package | Path | Test command |
|---------|------|-------------|
| feature-factory | `agents/feature-factory/` | `cd agents/feature-factory && npm test` |
| mcp-twilio | `agents/mcp-servers/twilio/` | `cd agents/mcp-servers/twilio && npm test` |
| voice-ai-builder | `agents/voice-ai-builder/` | `cd agents/voice-ai-builder && npm test` |
| doc-generator | `agents/doc-generator/` | `cd agents/doc-generator && npm test` |

Only include scope units that contain files matching the refactor pattern. Skip unaffected ones.

## Step 3: Spawn Parallel Sub-Agents

For each affected scope unit, use the Task tool to spawn a `general-purpose` sub-agent with this prompt template:

> Apply the following refactor to files in `{scope_path}` ONLY. Do NOT edit files outside this directory.
>
> **Refactor:** {refactor description from spec}
>
> After applying changes, verify by running: `{test_command}`
>
> If tests fail, diagnose the failure, fix your changes, and re-run tests (up to 3 attempts).
> Report: files modified, test result (pass/fail), and a one-line summary of changes.

Launch all sub-agents in a single message (parallel execution). Wait for all to complete.

## Step 4: Collect Results and Verify

After all sub-agents report back:

1. Review results — ensure all sub-agents report PASS.
2. If any sub-agent reported FAIL, investigate and fix the remaining issues.
3. Run the full test suite from root: `npm test`
4. Run linting: `npm run lint`
5. If the refactor touched TypeScript agent packages, run: `cd agents/mcp-servers/twilio && npx tsc --noEmit`

## Step 5: Commit

Use `/commit` with a message that lists all modified scope units. Example:

```
refactor: {description}

- functions/voice/: {summary}
- functions/callbacks/: {summary}
- agents/mcp-servers/twilio/: {summary}
```

## Final Report

| Scope | Files Changed | Test Result | Notes |
|-------|--------------|-------------|-------|
| ... | ... | PASS/FAIL | ... |

**Full suite:** PASS/FAIL
**Lint:** PASS/FAIL
