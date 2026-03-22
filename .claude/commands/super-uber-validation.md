---
description: Exhaustive validation — ALL 10 UCs, ALL 7 chaos archetypes, ALL 6 FF repos in one run. ~70-90 min. Use for pre-release sweeps or after major refactors.
model: opus
---

# Super-Uber-Validation

Exhaustive cross-repo validation that tests ALL 10 voice use cases, ALL 7 chaos archetypes, and ALL 6 FF target repos in a single run. This is the comprehensive variant of `/uber-validation` — run it before major releases or after significant refactors.

## Overview

Seven subagents across two sequential batches, plus chaos and FF cross-repo:

| Subagent | What It Tests | UCs | Isolation |
|----------|--------------|-----|-----------|
| **S1** | Simple UCs (no prototype needed) | UC1, UC2, UC8 | `/tmp/super-uber-RUN_ID/s1/` (clone) |
| **S2** | Conference/TaskRouter/AMD UCs | UC3, UC4, UC7 | `/tmp/super-uber-RUN_ID/s2/` (clone) |
| **S3** | AI/Intelligence UCs | UC5, UC6, UC10 | `/tmp/super-uber-RUN_ID/s3/` (clone) |
| **S4** | Infra-only (SIP) | UC9 | `/tmp/super-uber-RUN_ID/s4/` (clone) |
| **C** | Chaos — all 7 archetypes × 10 UC framings | N/A | `/tmp/super-uber-RUN_ID/chaos/` (clone) |
| **D1** | FF cross-repo batch 1 | N/A | `/tmp/super-uber-RUN_ID/d1/` |
| **D2** | FF cross-repo batch 2 | N/A | `/tmp/super-uber-RUN_ID/d2/` |

**CRITICAL**: All subagents run in `/tmp/` directories. The root working tree is NEVER modified except `.meta/validation-reports/` state files.

**CWD GUARD**: Same as uber-validation — always use absolute `/tmp/super-uber-RUN_ID/...` paths. Never relative.

## Arguments

<user_request>
$ARGUMENTS
</user_request>

Parse arguments for flags:
- `--resume` — resume from last incomplete run
- `--create-issues` — create GitHub issues for BLOCKING/MAJOR findings
- `--chaos-difficulty mild|moderate|extreme` — chaos scenario difficulty (default: moderate)
- `--keep-artifacts` — don't delete `/tmp/super-uber-RUN_ID/` after run
- `--skip-chaos` — skip chaos plane to save time
- `--skip-ff` — skip FF cross-repo planes to save time

## Phase 0: Initialize

1. **Generate run ID**: `YYYY-MM-DD-HHMMSS`
2. **Read history**: `.meta/validation-reports/state/uber-validation-history.json` (create if absent)
3. **If `--resume`**: read `.meta/validation-reports/state/super-uber-validation-state.json`, skip completed batches
4. **Run `/preflight`** in the root repo (read-only environment check)
5. **Read UC descriptions**: Read `.claude/skills/voice-use-case-map/SKILL.md` and the 3 reference files (`references/use-cases-1-4.md`, `references/use-cases-5-6.md`, `references/use-cases-7-10.md`) for all 10 UC details.

### Step 6: Randomized Persona Assignment (10 UCs, 7 personas)

All 7 personas must be used at least once. 3 personas used twice (10 UCs, 7 personas). Assignments are randomized using anti-repetition history.

**Personas:**
- **Weekend Hacker**: casual, skips details, wants it to "just work"
- **Enterprise Architect**: over-specifies, adds unnecessary HA/DR requirements
- **Vague Requester**: omits key technical details, describes outcomes not inputs
- **Platform Migrator**: uses competitor terminology (Vonage, AWS Connect)
- **Copy-Paste Dev**: references deprecated APIs or outdated patterns
- **Compliance Officer**: frames everything in regulatory terms
- **Non-Technical Founder**: business language only, no technical vocabulary

**Algorithm:**

1. Load `uber-validation-history.json` → build a UC×Persona pair matrix from all prior runs (both `uber` and `super-uber` types). For each (UC, persona) pair, record `lastUsedRunIndex` (how many runs ago it was used, or `never`).
2. For each of the 10 UCs, score each persona by novelty:
   - **Never paired before** → score 3
   - **Paired 3+ runs ago** → score 2
   - **Paired 2 runs ago** → score 1
   - **Paired in the last run** → score 0
3. Shuffle UCs randomly. Then greedily assign:
   - For each UC (in shuffled order), pick the highest-scoring **available** persona (break ties randomly)
   - A persona is "available" if it has been assigned fewer than its max (1 for the first 7 assignments, then 2 for the remaining 3)
   - After all 7 personas have been assigned once, the remaining 3 UCs pick from the full 7 again, preferring highest novelty score, max 2 uses per persona, break ties randomly
4. Record all 10 (UC, persona) assignments in the state file

**Constraints:**
- All 7 personas appear at least once
- No persona appears more than twice
- Maximize UC×persona pair novelty across run history

### Step 7: Randomized Chaos Assignments (10 scenarios, 7 archetypes)

10 chaos scenarios, each framed around a specific UC's domain. All 7 archetypes used, 3 repeated.

**UC framings** (always all 10):
Notifications, IVR, Inbound CC, Outbound CC, ConversationRelay, Media Streams, Sales Dialer, Call Tracking, PSTN, Transcription

**Algorithm:**

1. Load `knownFindingFingerprints` from history. Extract prior chaos archetype×UC-framing pairs from fingerprint patterns.
2. Create 10 slots (one per UC framing)
3. Shuffle the 7 archetypes, assign one to each of the first 7 slots
4. For the remaining 3 slots, pick 3 archetypes (max 2 per archetype total) prioritizing:
   - Archetype×UC-framing pairs never tested before
   - Least-used archetypes in `chaosArchetypesUsed`
   - Break ties randomly
5. Shuffle the final 10 assignments so scenario order is random
6. Record in state file

### Step 8: Randomized FF Repo Batching

All 6 repos always tested. Split into 2 batches of 3.

**Repo pool:**

| Name | GitHub | Language |
|------|--------|----------|
| fastify | fastify/fastify | JavaScript |
| flask | pallets/flask | Python |
| gin | gin-gonic/gin | Go |
| glow | charmbracelet/glow | Go |
| httpie | httpie/cli | Python |
| ripgrep | BurntSushi/ripgrep | Rust |

**Algorithm:**
1. Shuffle the 6 repos randomly
2. Assign first 3 to D1, last 3 to D2
3. Validate language diversity — each batch must cover at least 2 different languages. If a batch is mono-language (or only has 1 language), swap one repo between batches.
4. Record in state file

### Step 9: Generate Persona Rewrites

For each of the 10 UC×persona assignments from Step 6:
- Read the full UC description from the reference files
- Rewrite the UC description as that persona would describe it
- The rewrite MUST preserve the core product requirements (so the UC is still buildable) but should be messy, incomplete, or oddly framed
- Record all 10 rewrites in the state file

### Step 10: Create Temp Directories & State File

```bash
mkdir -p /tmp/super-uber-RUN_ID/{s1,s2,s3,s4,chaos,d1,d2}
```

Initialize state file: `.meta/validation-reports/state/super-uber-validation-state.json` with run config, all assignments, persona rewrites, subagent statuses all `pending`.

## Phase 1: Batch 1 — Launch 4 Subagents in Parallel

Launch these 4 subagents simultaneously:

### S1: Simple UCs (UC1, UC2, UC8)

**Setup:**
```bash
git clone --depth=1 $FACTORY_ROOT /tmp/super-uber-RUN_ID/s1/
cp $FACTORY_ROOT/.env /tmp/super-uber-RUN_ID/s1/
cd /tmp/super-uber-RUN_ID/s1/ && npm install
```

**For each UC (UC1, UC2, UC8):**
1. Use the persona-rewritten description from Phase 0. Do NOT look up the original UC.
2. Read the voice use case map skill to identify the UC
3. Read relevant voice skill docs for implementation patterns
4. Design the architecture (which Twilio products needed)
5. Write tests first (TDD red phase)
6. Implement functions to make tests pass (TDD green phase)
7. All files MUST start with 2-line ABOUTME comment
8. Run new UC tests to verify they pass

**After all 3 UCs:** Run the FULL test suite to check for regressions. Record baseline and final test counts.

### S2: Conference/TaskRouter/AMD UCs (UC3, UC4, UC7)

Same setup and per-UC flow as S1. These UCs are more complex:
- UC3 (Inbound CC): Check existing implementations in `functions/voice/` and `functions/taskrouter/` before building
- UC4 (Outbound CC): Conference + Participants API + AMD pattern
- UC7 (Sales Dialer): Parallel/power dialing + AMD + Conference

### C: Chaos Validation (10 scenarios)

**Setup:**
```bash
git clone --depth=1 $FACTORY_ROOT /tmp/super-uber-RUN_ID/chaos/
cp $FACTORY_ROOT/.env /tmp/super-uber-RUN_ID/chaos/
cd /tmp/super-uber-RUN_ID/chaos/ && npm install
```

**For each of the 10 scenarios** (from Phase 0 Step 7):
1. Read skill files from the clone
2. Present the scenario to the architect skill's analysis framework
3. Score 5 dimensions (0-5 each): Detection, Response quality, Cascade depth, Recovery, Learning capture
4. Calculate average resilience score

**Scoring → findings:**
- Resilience < 2 → `RESILIENCE-FAILURE` / `BLOCKING`
- Resilience 2-3 → `RESILIENCE-FAILURE` / `MAJOR`
- Resilience 3-4 → `RESILIENCE-SUCCESS` / `MINOR`
- Resilience >= 4 → `RESILIENCE-SUCCESS` / `INFO`

### D1: FF Cross-Repo Batch 1 (3 repos)

**For each repo** (from Phase 0 Step 8, batch D1):
```bash
git clone --depth=1 https://github.com/{org}/{repo}.git /tmp/super-uber-RUN_ID/d1/{repo}/
$FACTORY_ROOT/../feature-factory/scripts/init.sh /tmp/super-uber-RUN_ID/d1/{repo}/
```

Run per-repo:
- Hook test suite: `.claude/hooks/__tests__/test-all-hooks.sh`
- Leakage check: `.claude/hooks/__tests__/test-no-leakage.sh`
- Drift check
- 16-system scorecard

**Wait for all 4 subagents to complete before proceeding to Phase 2.**

## Phase 2: Batch 2 — Launch 3 Subagents in Parallel

### S3: AI/Intelligence UCs (UC5, UC6, UC10)

Same setup as S1. Special handling:
- UC5 (ConversationRelay): architect→spec→test-gen→dev, **skip deploy/live-validate** (WebSocket server requirement)
- UC6 (Media Streams): architect→spec→test-gen→dev, **skip deploy/live-validate** (raw audio WebSocket requirement)
- UC10 (Transcription): Full pipeline. If recording SIDs are available from S1/S2 results, use them for batch transcription testing.

### S4: Infrastructure-Only UC (UC9)

**Setup:**
```bash
git clone --depth=1 $FACTORY_ROOT /tmp/super-uber-RUN_ID/s4/
cp $FACTORY_ROOT/.env /tmp/super-uber-RUN_ID/s4/
cd /tmp/super-uber-RUN_ID/s4/ && npm install
```

UC9 (PSTN Connectivity) is infrastructure-only — **no Functions to write**. Pipeline is:
1. Use persona-rewritten description from Phase 0
2. Read the voice use case map to identify as UC9
3. Architect phase: design SIP Trunking infrastructure
4. Spec phase: document trunk configuration, origination URIs, ACLs
5. Write architecture validation tests (not functional tests)
6. If MCP SIP tools are available, create and validate a trunk configuration

### D2: FF Cross-Repo Batch 2 (3 repos)

Same flow as D1, but for the second batch of 3 repos.

**Wait for all 3 subagents to complete before proceeding to Phase 3.**

## Phase 3: Report Generation

1. Collect all findings from all 7 subagents (S1, S2, S3, S4, C, D1, D2)
2. Assign sequential IDs: `SUV-001`, `SUV-002`, ... (SUV prefix to distinguish from UV)
3. Deduplicate: check finding fingerprints against `uber-validation-history.json` `knownFindingFingerprints`. Mark repeats as `seenBefore: true`.
4. Sort: BLOCKING first, then MAJOR, MINOR, INFO. Within severity, sort by subagent.
5. Generate markdown report: `.meta/validation-reports/YYYY-MM-DD-HHMMSS-super-uber.md`

   Report structure:
   ```
   # Super-Uber-Validation Report
   Run ID, date, duration, status, summary table
   Coverage: ALL 10 UCs, ALL 7 archetypes, ALL 6 FF repos

   ## Priority Action Items (BLOCKING, MAJOR, MINOR — detailed)

   ## UC Coverage Matrix
   Table: UC × (persona, batch, tests, findings count, status)

   ## S1 Details — Simple UCs (UC1, UC2, UC8)
   ## S2 Details — Conference/TaskRouter UCs (UC3, UC4, UC7)
   ## S3 Details — AI/Intelligence UCs (UC5, UC6, UC10)
   ## S4 Details — Infrastructure UC (UC9)

   ## Chaos Details — 10 Scenarios
   Per-scenario analysis + UC-framing resilience scores + archetype resilience scores

   ## FF Cross-Repo Details — 6 Repos
   Side-by-side scorecard comparison table (6 repos × 16 systems)

   ## Persona Effectiveness Matrix
   Which personas caused most/least friction, by UC

   ## Cross-Run Trends
   Compared against all prior uber-val and super-uber runs
   ```

6. If `--create-issues`: for each BLOCKING finding, `gh issue create --title "[SUV-NNN] title" --body "description" --label super-uber-validation,blocking`
7. Update `.meta/validation-reports/state/uber-validation-history.json`:
   - Add run to `runs` array with `"type": "super-uber"`, all 10 UC assignments, all 10 chaos scenarios
   - Update `ffRepoUsage` (all 6 repos), `chaosArchetypesUsed`, `personaUsage`, `pluginUCUsage` (all 10 UCs)
   - Add `ucPersonaPairs` array to the run entry for cross-run pair tracking
   - Add new finding fingerprints to `knownFindingFingerprints`
8. Update `.meta/validation-reports/state/super-uber-validation-state.json` with `completedAt` and final status
9. Cleanup: `rm -rf /tmp/super-uber-RUN_ID/` unless `--keep-artifacts`
10. Print summary to stdout:
    ```
    SUPER-UBER-VALIDATION COMPLETE
    UCs: 10/10 tested | Chaos: 10 scenarios (7 archetypes) | FF: 6/6 repos
    Findings: X total (N blocking, N major, N minor, N info)
    New findings: Y | Seen before: Z
    Resilience: N.N/5.0 | FF Scorecard: avg N.N/16
    Report: .meta/validation-reports/YYYY-MM-DD-HHMMSS-super-uber.md
    ```

## Finding Categories Reference

Same as uber-validation — see `/uber-validation` for the full table.

## Severity Levels

Same as uber-validation — see `/uber-validation` for the full table.

## Relationship to Uber-Validation

- **Uber-validation** (`/uber-validation`): Standard tool for frequent quality checks. Tests 3-4 UCs, 4 chaos scenarios, 1 FF repo. ~50 min. Run often.
- **Super-uber-validation** (`/super-uber-validation`): Exhaustive sweep. Tests ALL 10 UCs, 10 chaos scenarios, 6 FF repos. ~70-90 min. Run before releases or after major refactors.

Both share the same history file (`uber-validation-history.json`) and anti-repetition rotation. Super-uber runs are tagged with `"type": "super-uber"` in history.
