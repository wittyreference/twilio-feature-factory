<!-- ABOUTME: Headless-optimized random use case: select UC, build via slash commands, deploy, deep validate, capture learnings. -->
<!-- ABOUTME: Skips infrastructure validation (covered by npm test) and goes straight to building. -->

You are running headless via `claude -p`. You have NO interactive terminal. Do NOT use AskUserQuestion — it will block forever. Do NOT run infrastructure validation phases (Phases 0-16 from real-world-validation.md) — those are covered by `npm test`.

Your job: select a random use case, build it end-to-end using slash commands, deploy, deep validate with MCP tools, and capture learnings.

## Step 1: Select Use Case

Pick a random use case from this list (or honor `FORCE_USE_CASE` env var if set):

- UC1: Voice Notifications
- UC2: Self-Service Automation (IVR)
- UC3: Inbound Contact Center
- UC4: Outbound Contact Center
- UC5: AI Agents (Buy/Native)
- UC6: AI Agents (Build/3PP)
- UC7: Sales Dialer
- UC8: Call Tracking

Check the env var first:
```bash
printenv FORCE_USE_CASE || echo "not set"
```

If `FORCE_USE_CASE` is set (e.g., `UC3`), use that. Otherwise, pick one at random.

## Step 2: Read the Use Case Catalog

Read `.meta/random-validation.md` and find the catalog entry for your selected use case. Note:
- The **Scenario Prompt** (you'll pass this to `/architect`)
- The **Expected Functions** (what should be built)
- The **Validators** (which MCP tools to run)
- The **Agent-to-Agent Architecture** and **System Prompts** (for live testing)
- The **Dynamic Exit Criteria** (what must pass)

## Step 3: Create Temp Working Directory

All build work happens in a temp clone, NOT the main repo:

```bash
RUN_ID="validation-$(date +%Y%m%d-%H%M%S)-${UC_ID,,}"
VALIDATION_DIR=".validation-temp/${RUN_ID}"
mkdir -p "$VALIDATION_DIR"
git clone --local . "$VALIDATION_DIR"
cp .env "$VALIDATION_DIR/.env"
cd "$VALIDATION_DIR"
npm install
```

**CRITICAL**: Verify you are in the temp clone before building:
```bash
pwd  # Must show .validation-temp/
```

## Step 4: Build via Slash Commands (Paradigm 1)

Run the full build lifecycle using slash commands. Pass the Scenario Prompt from the catalog entry.

1. `/architect <scenario prompt>` — Design the architecture
2. `/spec` — Create detailed specification from architect output
3. `/test-gen` — Write failing tests (TDD Red Phase)
4. `/dev` — Implement to pass tests (TDD Green Phase)
5. `/review` — Code review and security audit
6. `/docs` — Update documentation

After each step, verify it completed without errors before proceeding.

## Step 5: Deploy

```bash
npm run deploy:dev
```

Verify deployment succeeded by checking the output for function URLs.

## Step 6: Deep Validation with MCP Tools

Run the validators listed in the use case catalog entry. Common pattern:

1. **validate_debugger** — Check for zero alerts in the validation window
2. **validate_call** — If a call was placed, validate completion and duration
3. **validate_recording** — Verify recording completed with media URL
4. **validate_transcript** — Verify transcription with topic keywords
5. **validate_two_way** — For multi-party UCs (UC3, UC4, UC7, UC8)
6. **validate_message** — For UC5 (SMS confirmation)

If MCP validation tools are not available, fall back to Twilio CLI:
```bash
twilio api:core:calls:fetch --sid <CALL_SID>
twilio api:core:recordings:list --call-sid <CALL_SID>
twilio debugger:logs:list --start-date $(date -u +%Y-%m-%dT%H:%M:%SZ -d '30 minutes ago')
```

## Step 7: Capture Learnings

Write discoveries to the MAIN repo's `.meta/learnings.md` (not the temp clone). Use absolute paths:

```markdown
## [DATE] Random Validation — UCN: Name (Headless)

**Run ID**: validation-YYYYMMDD-HHMMSS-ucN
**Mode**: Headless (`claude -p`)

**Discoveries:**

1. **Finding**: What was learned
   - Context: Which phase, which product
   - Impact: How it affects future runs
```

## Step 8: Report Results

Print a summary table:

| Step | Status | Notes |
|------|--------|-------|
| Use Case Selection | UC? | ... |
| Architect | PASS/FAIL | ... |
| Spec | PASS/FAIL | ... |
| Test-Gen | PASS/FAIL | ... |
| Dev | PASS/FAIL | ... |
| Review | PASS/FAIL | ... |
| Deploy | PASS/FAIL | ... |
| Deep Validation | PASS/FAIL | ... |
| Learnings Captured | YES/NO | ... |

## Step 9: Cleanup

```bash
cd /  # Leave the temp clone
rm -rf "$VALIDATION_DIR"
```

## Constraints

- **Do NOT use AskUserQuestion** — you are running headless with no terminal
- **Do NOT run infrastructure validation** — those phases burn turns without building anything
- **Do NOT build in the main repo** — always use the temp clone
- **Do NOT skip steps** — if a step fails, report it and continue to the next
- **Commit working code** in the temp clone as you go using `/commit`

**Recommended invocation:** `--max-turns 120` (default 30 is insufficient for full build lifecycle).
