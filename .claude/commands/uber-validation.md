---
description: Comprehensive cross-repo quality validation. Use for full validation sweeps across all quality dimensions with prioritized findings report.
model: opus
---

# Uber-Validation

Unified cross-repo validation that tests all quality dimensions in isolated temp directories, captures findings into a prioritized report, and rotates test targets to avoid repetition.

## Overview

Four validation planes, each testing a different dimension:

| Plane | What It Tests | Isolation |
|-------|--------------|-----------|
| **A** | Plugin dogfooding — build a UC using only the plugin | `/tmp/uber-val-YYYY-MM-DD-HHMMSS/plane-a/` |
| **B** | Sequential validation — voice UCs build + deploy + deep validate | `/tmp/uber-val-YYYY-MM-DD-HHMMSS/plane-b/` (clone of this repo) |
| **C** | Chaos validation — toolchain resilience to bad/novel input | `/tmp/uber-val-YYYY-MM-DD-HHMMSS/plane-c/` (clone of this repo) |
| **D** | FF cross-repo — generic patterns work on open-source projects | `/tmp/uber-val-YYYY-MM-DD-HHMMSS/plane-d/` (clone of target repo) |

**Path variables** (set these before running):
```bash
FACTORY_ROOT="$(git rev-parse --show-toplevel)"   # this repo
PLUGIN_ROOT="${FACTORY_ROOT}/../twilio-claude-plugin"  # sibling checkout
```

**CRITICAL**: All planes run in `/tmp/` directories. The root working tree is NEVER modified. No test files, no built functions, no deployed artifacts, no branch pollution. Findings and reports are written back to `.meta/` in the root repo only.

**CWD GUARD**: Shell working directory resets to the root repo after bash operations like `npm install`, `git clone`, and other commands. You MUST `cd` to the absolute `/tmp/uber-val-YYYY-MM-DD-HHMMSS/plane-X/` path before EVERY bash command that reads or writes files. Never use relative paths — always use the full `/tmp/uber-val-YYYY-MM-DD-HHMMSS/...` absolute path. If you see yourself writing to `.meta/uber-val-*` or any path under the root repo that isn't `.meta/validation-reports/`, STOP — your cwd has drifted.

## Arguments

<user_request>
$ARGUMENTS
</user_request>

Parse arguments for flags:
- `--planes A,B,C,D` — which planes to run (default: all)
- `--resume` — resume from last incomplete run
- `--create-issues` — create GitHub issues for MAJOR+ findings (use `--create-issues=all` for actionable MINOR too)
- `--ff-repo NAME` — force specific repo for Plane D (default: anti-repetition selection)
- `--chaos-difficulty mild|moderate|extreme` — chaos scenario difficulty (default: moderate)
- `--keep-artifacts` — don't delete `/tmp/uber-val-YYYY-MM-DD-HHMMSS/` after run

## Phase 0: Initialize

1. **Generate run ID**: `YYYY-MM-DD-HHMMSS` (e.g., `2026-03-20-143052`)
2. **Read history**: `.meta/validation-reports/state/uber-validation-history.json` (create if absent)
3. **If `--resume`**: read `.meta/validation-reports/state/uber-validation-state.json`, skip completed planes, resume from first pending/timeout plane
4. **Run `/preflight`** in the root repo (read-only environment check)
5. **Anti-repetition selection**:
   - **Plane A UC**: Pick from UC1-UC8, least recently used in history
   - **Plane B UCs**: Pick 2-3 UCs not used in the last 2 Plane B runs
   - **Plane C archetypes**: Exclude top-3 most-used from generation prompt
   - **Plane D repo**: Pick from pool (fastify, flask, gin, glow, httpie, ripgrep) — least-used, ties broken by oldest lastUsed
6. **Persona rewrite** (Planes A and B only):
   - Pick a random chaos persona for each selected UC (from the 7 archetypes below)
   - Avoid the persona used for the same plane in the last run
   - For Plane B with multiple UCs, use a different persona for each
   - Read the full UC description from `.claude/skills/voice-use-case-map/SKILL.md` (detail in `references/` subdirectory)
   - Rewrite the UC description as that persona would describe it:
     - **Weekend Hacker**: casual, skips details, wants it to "just work"
     - **Enterprise Architect**: over-specifies, adds unnecessary HA/DR requirements
     - **Vague Requester**: omits key technical details, describes outcomes not inputs
     - **Platform Migrator**: uses competitor terminology (Vonage, AWS Connect)
     - **Copy-Paste Dev**: references deprecated APIs or outdated patterns
     - **Compliance Officer**: frames everything in regulatory terms
     - **Non-Technical Founder**: business language only, no technical vocabulary
   - The rewrite MUST preserve the core product requirements (so the UC is still buildable) but the description should be messy, incomplete, or oddly framed
   - Record the persona and rewritten description in the state file
7. **Create temp directory structure**: `mkdir -p /tmp/uber-val-YYYY-MM-DD-HHMMSS/{plane-a,plane-b,plane-c,plane-d}`
8. **Initialize state file**: `.meta/validation-reports/state/uber-validation-state.json` with run config, plane statuses all `pending`, persona rewrites

**Repo pool for Plane D**:

| Name | GitHub | Language |
|------|--------|----------|
| fastify | fastify/fastify | JavaScript |
| flask | pallets/flask | Python |
| gin | gin-gonic/gin | Go |
| glow | charmbracelet/glow | Go |
| httpie | httpie/cli | Python |
| ripgrep | BurntSushi/ripgrep | Rust |

## Phase 1: Plane A — Plugin Dogfooding (60 min budget)

**Purpose**: Validate the twilio-claude-plugin works as a developer would use it.

1. Mark Plane A as `in_progress` in state file
2. Create fresh project:
   ```bash
   cd /tmp/uber-val-YYYY-MM-DD-HHMMSS/plane-a/
   npm init -y
   cp $FACTORY_ROOT/.env .
   ```
3. Install the plugin (if `claude plugin add` is available, use it; otherwise copy `.mcp.json` from `$PLUGIN_ROOT`)
4. Use the persona-rewritten UC description from Phase 0 step 6. Do NOT look up the original UC — work from the rewritten description only. The description may be vague, use wrong terminology, or miss details. This is intentional — handle it the way the toolchain would for a real user.
5. Build the UC end-to-end using only plugin-provided tools:
   - Read the relevant skill(s) based on what the description implies (not the UC ID)
   - Create the function files following plugin patterns
   - Write tests
   - Deploy and validate with MCP tools (if time permits)
6. Capture findings using these categories:
   - `WORKS-WELL` — something worked as expected
   - `SKILL-QUALITY` — skill document had inaccurate/incomplete info
   - `DOCS-GAP` — missing documentation
   - `MCP-ISSUE` — MCP tool wrong schema, missing param, error
   - `UX-FRICTION` — workflow friction that doesn't prevent success
   - `PLUGIN-GAP` — something missing from plugin distribution
   - `INVARIANT-SAVE` — architectural invariant prevented a bug
7. Mark Plane A as `completed` or `failed` in state file

## Phase 2: Plane B — Sequential Validation (90 min budget)

**Purpose**: Validate voice UCs build, deploy, and pass deep validation.

1. Mark Plane B as `in_progress`
2. Clone this repo:
   ```bash
   git clone --depth=1 $FACTORY_ROOT /tmp/uber-val-YYYY-MM-DD-HHMMSS/plane-b/
   cp $FACTORY_ROOT/.env /tmp/uber-val-YYYY-MM-DD-HHMMSS/plane-b/
   cd /tmp/uber-val-YYYY-MM-DD-HHMMSS/plane-b/ && npm install
   ```
3. Select 2-3 UCs from rotation, using their persona-rewritten descriptions from Phase 0 step 6. Do NOT look up the original UCs — work from the rewritten descriptions only.
4. For each UC, follow the sequential validation lifecycle:
   - `/architect` — design review
   - `/spec` — technical specification
   - `/test-gen` — write failing tests
   - `/dev` — implement to pass tests
   - `/review` — code review
   - Deploy: `twilio serverless:deploy --environment dev`
   - Deep validate with MCP tools: `validate_call`, `validate_recording`, `validate_transcript`
   - Capture SIDs and validation results
   - Teardown: clean up deployed functions
5. Convert validation pass/fail into unified findings:
   - Deploy failure → `BUG` / `BLOCKING`
   - MCP validation failure → `BUG` / `MAJOR`
   - Pipeline worked correctly → `WORKS-WELL` / `INFO`
   - New pattern discovered → `PATTERN-DISCOVERED` / `INFO`
6. Copy findings to root state file
7. Mark Plane B as `completed` or `failed`

## Phase 3: Plane C — Chaos Validation (45 min budget)

**Purpose**: Test toolchain resilience to bad, vague, or conflicting input.

1. Mark Plane C as `in_progress`
2. Clone this repo:
   ```bash
   git clone --depth=1 $FACTORY_ROOT /tmp/uber-val-YYYY-MM-DD-HHMMSS/plane-c/
   cp $FACTORY_ROOT/.env /tmp/uber-val-YYYY-MM-DD-HHMMSS/plane-c/
   cd /tmp/uber-val-YYYY-MM-DD-HHMMSS/plane-c/ && npm install
   ```
3. Read `.meta/validation-reports/state/uber-validation-history.json` for archetype exclusions
4. Generate 3-4 novel chaos scenarios:
   - Each scenario is a developer request that's intentionally problematic
   - Difficulty level from `--chaos-difficulty` (default: moderate)
   - Categories: C1 (Vague), C2 (Wrong Product), C3 (Missing Reqs), C4 (Conflicting), C5 (Scope Mismatch), C6 (Beginner), C7 (Toolchain Edge)
   - Archetypes: Vague Requester, Platform Migrator, Copy-Paste Dev, Enterprise Architect, Weekend Hacker, Compliance Officer, Non-Technical Founder
   - Exclude top-3 most-used archetypes from history
5. For each scenario:
   - Present to `/architect` for design review
   - Score 5 dimensions (0-5 each):
     - **Detection**: Did the toolchain identify the problem?
     - **Response quality**: Was the clarification/pushback appropriate?
     - **Cascade depth**: Did the bad input cause downstream failures?
     - **Recovery**: Could the session recover after the bad input?
     - **Learning capture**: Was the issue documented for future prevention?
   - Average resilience score = mean of 5 dimensions
6. Convert scores to unified findings:
   - Resilience < 2 → `RESILIENCE-FAILURE` / `BLOCKING`
   - Resilience 2-3 → `RESILIENCE-FAILURE` / `MAJOR`
   - Resilience 3-4 → `RESILIENCE-SUCCESS` / `MINOR` (room for improvement)
   - Resilience >= 4 → `RESILIENCE-SUCCESS` / `INFO`
7. Copy findings to root state file
8. Mark Plane C as `completed` or `failed`

## Phase 4: Plane D — FF Cross-Repo Validation (45 min budget)

**Purpose**: Validate generic Feature Factory patterns work on non-Twilio projects.

1. Mark Plane D as `in_progress`
2. Clone target repo (selected in Phase 0):
   ```bash
   git clone --depth=1 https://github.com/{org}/{repo}.git /tmp/uber-val-YYYY-MM-DD-HHMMSS/plane-d/
   ```
3. Install Feature Factory:
   ```bash
   $FACTORY_ROOT/scripts/init.sh /tmp/uber-val-YYYY-MM-DD-HHMMSS/plane-d/
   ```
4. Run automated checks:
   - Hook test suite: `.claude/hooks/__tests__/test-all-hooks.sh`
   - Leakage check: `.claude/hooks/__tests__/test-no-leakage.sh`
   - Drift check: `$FACTORY_ROOT/scripts/ff-drift-check.sh`
5. Score 16-system scorecard (from the validation protocol):
   - Flywheel: generates suggestions, no platform paths
   - Quality gates: credential detection, --no-verify, force-push, pending actions
   - Session tracking: .session-start, .session-files
   - Meta-mode: blocks production, allows .claude/
   - ABOUTME: enforced on source, skipped on docs
   - Credential safety: blocks AWS/OpenAI keys, passes env refs
   - Platform leakage: 11/11 checks
6. (Time permitting) Build a small feature using TDD pipeline
7. Convert scorecard to unified findings:
   - Test failure → `BUG` / `MAJOR`
   - Leakage detected → `LEAKAGE` / `BLOCKING`
   - Init.sh failure → `BUG` / `BLOCKING`
   - All pass → `WORKS-WELL` / `INFO`
   - Language-specific issue → `PLATFORM-SPECIFIC` / `MINOR`
8. Mark Plane D as `completed` or `failed`

## Phase 5: Report Generation

1. Collect all findings from all planes
2. Assign sequential IDs: `UV-001`, `UV-002`, ...
3. Deduplicate: check finding fingerprints against `.meta/validation-reports/state/uber-validation-history.json` `knownFindingFingerprints`. Mark repeats as `seenBefore: true`.
4. Sort: BLOCKING first, then MAJOR, MINOR, INFO. Within severity, sort by plane.
5. Generate markdown report: `.meta/validation-reports/YYYY-MM-DD-HHMMSS.md`

   Report structure:
   ```
   # Uber-Validation Report
   Run ID, date, duration, status, summary table
   ## Priority Action Items (BLOCKING, MAJOR, MINOR — detailed)
   ## Plane A Details (findings table + narrative)
   ## Plane B Details
   ## Plane C Details
   ## Plane D Details
   ## Cross-Run Trends (findings seen across multiple runs)
   ```

6. If `--create-issues`:
   a. **Threshold:** Default = BLOCKING + MAJOR. With `--create-issues=all` = also include actionable MINOR. INFO always excluded.
   b. **Actionability filter for MINOR:** Include if category is `doc-gap`, `FF-LEAKAGE`, `FF-INSTALL`, `FF-DRIFT`, `RESILIENCE-FAILURE`, `misconception`. Exclude if category is `doc-strength`, `persona-identification`, `existing-code-reuse`, `product-selection` (observational), `test-results`.
   c. **Dedup:** For each qualifying finding, check `issueMappings` in history file for existing open issue with same fingerprint.
      - If open issue exists: `gh issue comment $ISSUE_NUM --repo wittyreference/twilio-feature-factory -b "Re-confirmed in run $RUN_ID (severity: $SEV)"`
      - If no issue or closed: create new issue (see template below), record in `issueMappings`
   d. **Labels:** Always `validation` + category-based:
      - `ff-*` fingerprint or Plane D source → add `ff`
      - `doc-gap` / `misconception` category → add `doc-gap`
      - Chaos source (Plane C) → add `chaos`
      - UC-related (Plane A/B) → add `voice`
   e. **Issue body template:**
      ```
      ## [UV-NNN] Title
      **Severity:** MAJOR/MINOR | **Source:** Plane A/UC3 | **Run:** RUN_ID (uber)
      **Fingerprint:** `fingerprint-string`
      ### Description
      [Full description from findings]
      ### Recommendation
      [Recommendation text if available]
      ### Context
      - Report: `.meta/validation-reports/RUN_ID.md`
      - UC/Persona: (if applicable)
      - Chaos Score: N.N/5.0 (if from chaos plane)
      ---
      _Auto-created by `/uber-validation --create-issues`_
      ```
   f. **Record:** Update `issueMappings` in history file: `{ "fingerprint": { "issue": N, "state": "open" } }`
7. Update `.meta/validation-reports/state/uber-validation-history.json`:
   - Add run to `runs` array (include `persona` and `rewrite` for each Plane A/B UC in `selections`)
   - Update `ffRepoUsage`, `chaosArchetypesUsed`, `personaUsage` (increment persona count per use)
   - Add new finding fingerprints to `knownFindingFingerprints`
8. Update `.meta/validation-reports/state/uber-validation-state.json` with `completedAt` and final status
9. Cleanup: `rm -rf /tmp/uber-val-YYYY-MM-DD-HHMMSS/` unless `--keep-artifacts`
10. Print summary to stdout:
    ```
    UBER-VALIDATION COMPLETE
    Planes: 4/4 passed
    Findings: X total (N blocking, N major, N minor, N info)
    New findings: Y | Seen before: Z
    Report: .meta/validation-reports/YYYY-MM-DD-HHMMSS.md
    ```

## Finding Categories Reference

| Category | Description | Typical Planes |
|----------|-------------|----------------|
| `WORKS-WELL` | Something works as designed | A, B, C, D |
| `BUG` | Code defect causing incorrect behavior | A, B, C, D |
| `DOCS-GAP` | Missing or inaccurate documentation | A, B, D |
| `PATTERN-DISCOVERED` | New reusable pattern found | A, B, C, D |
| `REGRESSION` | Previously working feature now fails | A, B, D |
| `QUALITY-ISSUE` | Code quality concern (not a bug) | A, B, C, D |
| `SKILL-QUALITY` | Skill document inaccurate or incomplete | A |
| `MCP-ISSUE` | MCP tool wrong schema, missing param | A, B |
| `UX-FRICTION` | Workflow friction, doesn't prevent success | A, D |
| `PLUGIN-GAP` | Missing from plugin distribution | A |
| `INVARIANT-SAVE` | Architectural invariant prevented a bug | A, B |
| `RESILIENCE-FAILURE` | Toolchain failed to handle bad input | C |
| `RESILIENCE-SUCCESS` | Toolchain correctly handled bad input | C |
| `LEAKAGE` | Platform-specific content in generic FF | D |
| `DRIFT` | Source and target out of sync | D |
| `PLATFORM-SPECIFIC` | Issue only on certain OS/runtime/language | D |

## Severity Levels

| Level | Criteria | Auto-Issue |
|-------|----------|------------|
| `BLOCKING` | Prevents plane completion, crash, security, resilience < 2 | Yes (with `--create-issues`) |
| `MAJOR` | Wrong behavior, missing critical docs, resilience 2-3 | Optional |
| `MINOR` | UX friction, cosmetic, non-blocking gap | No |
| `INFO` | Works-well, pattern discovered, invariant save | No |
