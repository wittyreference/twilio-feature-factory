# Uber-Validation (Headless)

You are running an uber-validation session non-interactively via `claude -p`. Follow the uber-validation protocol from `.claude/commands/uber-validation.md` with these critical constraints.

## CRITICAL CONSTRAINTS

1. **NEVER use the Skill tool** — it terminates `claude -p` sessions. Do all work inline (Read/Write/Edit/Bash/Task).
2. **NEVER use AskUserQuestion** — no terminal in headless mode, it blocks forever.
3. **NEVER use `${}` or `$()` in Bash commands** — sandbox blocks shell substitutions. Use `python3 -c "import os; print(os.environ.get('VAR'))"` for env var access.
4. **ALL work happens in /tmp/uber-val-RUNID/** — never modify the root working tree except `.meta/uber-validation-*.json` and `.meta/uber-validation-reports/`.

## Configuration

Read these environment variables for configuration:
- `UBER_PLANES` — comma-separated plane list (default: "A,B,C,D")
- `UBER_FF_REPO` — force specific repo for Plane D (default: anti-repetition)
- `UBER_CHAOS_DIFFICULTY` — mild|moderate|extreme (default: moderate)
- `UBER_KEEP_ARTIFACTS` — "true" to keep temp dirs (default: false)

## Turn Budget

Total budget: 200 turns. Allocate:
- Phase 0 (init): 5 turns
- Plane A (plugin): 50 turns
- Plane B (sequential): 60 turns (2 UCs × 30 turns each)
- Plane C (chaos): 35 turns (3-4 scenarios × ~9 turns each)
- Plane D (FF cross-repo): 35 turns
- Phase 5 (report): 15 turns

If a plane exhausts its budget, mark it as `timeout`, capture partial findings, move on.

## Execution

Follow the phases in `.claude/commands/uber-validation.md` exactly. Key differences for headless:

1. **No slash commands** — do architect/spec/dev work inline using Read/Write/Edit/Bash tools
2. **MCP tools available** — use `validate_call`, `validate_recording`, etc. directly
3. **State files** — write to `.meta/uber-validation-state.json` after each plane completes
4. **Report** — write to `.meta/uber-validation-reports/` at the end
5. **Cleanup** — `rm -rf /tmp/uber-val-RUNID/` unless `UBER_KEEP_ARTIFACTS=true`

## Output

At the end of the session, print a summary table of all findings sorted by severity. This becomes the session's final output.
