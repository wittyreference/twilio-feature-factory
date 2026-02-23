<!-- ABOUTME: Headless-optimized random use case: select UC, build inline, deploy, deep validate, capture learnings. -->
<!-- ABOUTME: Skips infrastructure validation and slash commands (which terminate headless sessions). -->

You are running headless via `claude -p`. You have NO interactive terminal.

**CRITICAL CONSTRAINTS — read these first:**
- Do NOT use `AskUserQuestion` — it blocks forever in headless mode
- Do NOT use the `Skill` tool or slash commands (`/architect`, `/spec`, `/dev`, etc.) — they terminate the headless session prematurely
- Do NOT run infrastructure validation phases (Phases 0-16) — covered by `npm test`
- Do NOT use `${}` parameter substitution or `$()` command substitution in Bash — the sandbox blocks them
- Do NOT try to create temp directories with `mkdir` — use a git branch instead

**Your job**: select a use case, build it end-to-end INLINE (no slash commands), deploy, deep validate with MCP tools, and capture learnings.

## Step 0: Clean Slate (conditional)

Check if the `--clean` flag was used to launch this session:
```bash
python3 -c "import os; print(os.environ.get('VALIDATION_CLEAN', 'not set'))"
```

**If `VALIDATION_CLEAN=true`**: The account was just reset by `validation-reset.sh`. Services were recreated with new SIDs, the serverless deployment was removed, and webhooks were blanked. You need to:

1. Verify `.env` has valid (non-placeholder) SIDs:
```bash
python3 -c "
import os
required = ['TWILIO_SYNC_SERVICE_SID', 'TWILIO_VERIFY_SERVICE_SID',
            'TWILIO_MESSAGING_SERVICE_SID', 'TWILIO_TASKROUTER_WORKSPACE_SID',
            'TWILIO_TASKROUTER_WORKFLOW_SID']
missing = [k for k in required if not os.environ.get(k) or os.environ.get(k,'').startswith('XXX')]
if missing:
    print('FAIL: Missing SIDs: ' + ', '.join(missing))
else:
    print('PASS: All service SIDs present')
"
```

2. Deploy immediately (no serverless service exists):
```bash
npm run deploy:dev
```

3. Verify deployment succeeded before continuing.

**If not set**: Skip this step (backward-compatible — the account is in whatever state the previous run left it).

## Step 1: Select Use Case

Check for a forced use case first:
```bash
python3 -c "import os; print(os.environ.get('FORCE_USE_CASE', 'not set'))"
```

If set (e.g., `UC3`), use that. Otherwise, pick one at random using:
```bash
python3 -c "import random; ucs = ['UC1','UC2','UC3','UC4','UC5','UC6','UC7','UC8']; print(random.choice(ucs))"
```

Use case list:
- UC1: Voice Notifications (outbound call + AMD + Gather + recording + Sync)
- UC2: Self-Service Automation (IVR with DTMF/speech menus)
- UC3: Inbound Contact Center (queue + TaskRouter + agent transfer)
- UC4: Outbound Contact Center (predictive dial + agent connect)
- UC5: AI Agents — ConversationRelay (native voice AI)
- UC6: AI Agents — Media Streams (3PP integration via WebSocket)
- UC7: Sales Dialer (click-to-call + recording + disposition)
- UC8: Call Tracking (tracking numbers + whisper + recording + Sync)

## Step 2: Read the Catalog

Read `.meta/random-validation.md` and find the catalog entry for your selected use case. Note the Scenario Prompt, Expected Functions, Validators, and Dynamic Exit Criteria.

## Step 3: Set Up Working Branch

Work on a dedicated branch (no temp clone — the sandbox blocks it):
```bash
git checkout -b validation-ucN-YYYYMMDD
```

## Step 4: Architecture Review (INLINE — no /architect)

Read the relevant domain CLAUDE.md files for your use case:
- `functions/voice/CLAUDE.md` for voice UCs
- `functions/messaging/CLAUDE.md` for messaging UCs
- `functions/conversation-relay/CLAUDE.md` for UC5
- `functions/callbacks/CLAUDE.md` for status callbacks
- `functions/sync/CLAUDE.md` if Sync is involved

Then read 1-2 existing functions in the same domain to understand patterns.

Design the architecture yourself. Decide:
- Which functions to create (file names, access levels, directories)
- Call flow / message flow
- TwiML verbs and attributes
- Environment variables needed
- Callback URLs

Write a brief architecture summary as text output, then IMMEDIATELY proceed to Step 5. Do not stop here.

## Step 5: Write Code (INLINE — no /spec, /test-gen, /dev)

Write the implementation files directly using the Write tool:

1. **Write the function files** in the appropriate `functions/` subdirectory
   - Include ABOUTME comments at the top
   - Follow patterns from existing functions in the same directory
   - Use `context.getTwilioClient()` for API calls
   - Use `callback(null, twiml)` or `callback(null, response)` for returns

2. **Write basic tests** in `__tests__/` that verify:
   - The handler function exists and is callable
   - TwiML output contains expected verbs
   - Error cases return appropriate responses

3. **Run tests** to verify:
```bash
npm test -- --testPathPattern="your-test-file" --bail
```

4. **Commit working code**:
```bash
git add functions/your-files __tests__/your-tests
git commit -m "feat: Add UCN functions for validation run"
```

## Step 6: Deploy

```bash
npm run deploy:dev
```

Verify deployment succeeded by checking the output for function URLs.

## Step 7: Configure Webhooks (if needed)

For inbound UCs (UC2, UC3, UC5, UC6, UC8), configure the phone number webhook to point to the deployed function URL. Use MCP tools:
- `mcp__twilio__list_phone_numbers` to find available numbers
- `mcp__twilio__configure_webhook` to set the voice/SMS URL

## Step 8: Live Validation with MCP Tools

Place a test call or send a test message using MCP tools:
- `mcp__twilio__make_call` for voice UCs
- `mcp__twilio__send_sms` for messaging UCs

Then run deep validation:
1. `mcp__twilio__validate_debugger` — Check for zero alerts
2. `mcp__twilio__validate_call` — Validate call completed, check duration
3. `mcp__twilio__validate_recording` — Verify recording has media URL
4. `mcp__twilio__validate_transcript` — Verify transcription with topic keywords
5. `mcp__twilio__validate_two_way` — For multi-party UCs (UC3, UC4, UC7, UC8)

Record all SIDs (Call SID, Recording SID, Transcript SID) as you go.

## Step 9A: Capture Twilio Learnings

Write Twilio-specific discoveries to `.meta/learnings.md` (use absolute path). Append to the file using the Edit tool:

```markdown
## [DATE] Random Validation — UCN: Name (Headless)

**Run ID**: validation-YYYYMMDD-ucN
**Mode**: Headless (`claude -p`)

**Discoveries:**

1. **Finding**: What was learned
   - Context: Which phase, which product
   - Impact: How it affects future runs
```

## Step 9B: Capture System Tooling Observations

In the same learnings entry, add a "System Tooling" sub-heading for observations about the
development infrastructure itself. This is where most system tooling issues surface — 6 of 8
headless gotchas in `scripts/CLAUDE.md` were discovered during headless runs.

Observe and record:

| Category | What to Check | Notes |
|----------|--------------|-------|
| MCP tools | Did all validation tools (`validate_call`, etc.) respond? Any timeouts or crashes? | Record tool name + error if any |
| Sandbox behavior | Were any Bash commands blocked? Which substitutions failed? | `${}`, `$()`, `printenv` are known blocked |
| Hook behavior | Did post-write track files? Did flywheel fire? Any unexpected blocks? | Check `.meta/.session-files` if accessible |
| Skill loading | Were any skills referenced in output? Did they contain accurate info? | N/A in headless (skills loaded via Skill tool, which is forbidden) |
| Git operations | Did branch creation, commits work? Any git errors? | Record if sandbox blocked git ops |
| Turn budget | How many turns used vs budget? Where was time spent? | Record: setup/code/deploy/validate split |

Add to the learnings entry:

```markdown
**System Tooling:**

| Observation | Category | Impact |
|-------------|----------|--------|
| [What happened] | [MCP/Sandbox/Hook/Git/Budget] | [How it affects future runs] |
```

If a system tooling issue is blocking (prevents completion), record it but do not spend
more than 5 turns trying to work around it. Move to the next step.

## Step 10: Report Results

Print a summary table as your final output:

| Step | Status | Notes |
|------|--------|-------|
| Use Case Selection | UC? | ... |
| Architecture | PASS/FAIL | ... |
| Code Written | PASS/FAIL | files created |
| Tests | PASS/FAIL | X passing, Y failing |
| Deploy | PASS/FAIL | URLs |
| Live Validation | PASS/FAIL | SIDs |
| Learnings Captured | YES/NO | ... |

## Pacing

You have up to 120 turns. Budget roughly:
- Step 0: 5 turns (clean slate, only if VALIDATION_CLEAN=true)
- Steps 1-3: 5 turns (setup)
- Step 4: 5 turns (architecture)
- Step 5: 30 turns (code + tests)
- Step 6-7: 10 turns (deploy + configure)
- Step 8: 15 turns (validation)
- Steps 9-10: 5 turns (learnings + report)

Do NOT spend more than 10 turns on any setup/infrastructure issue. If something is blocked, adapt and move on.
