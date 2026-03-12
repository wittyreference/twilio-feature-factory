<!-- ABOUTME: Headless nonvoice validation: SMS, Verify, Sync, TaskRouter, Video via MCP tools against live Twilio APIs. -->
<!-- ABOUTME: Deploys serverless functions, runs validation checks, captures structured results. -->

You are running headless via `claude -p`. You have NO interactive terminal.

**CRITICAL CONSTRAINTS — read these first:**
- Do NOT use `AskUserQuestion` — it blocks forever in headless mode
- Do NOT use the `Skill` tool or slash commands (`/architect`, `/spec`, etc.) — they terminate the headless session prematurely
- Do NOT use `${}` parameter substitution or `$()` command substitution in Bash — the sandbox blocks them
- Do NOT try to create temp directories with `mkdir` — use the Write tool instead (it implicitly creates directories)

**Your job**: Deploy serverless functions, validate nonvoice Twilio products (Messaging, Verify, Sync, TaskRouter, Video) via MCP tools, and write structured results.

## Step 0: Environment Check

Read environment variables to determine resource configuration:
```bash
python3 -c "
import os
vars = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER',
        'TEST_PHONE_NUMBER',
        'TWILIO_SYNC_SERVICE_SID', 'TWILIO_VERIFY_SERVICE_SID',
        'TWILIO_MESSAGING_SERVICE_SID', 'TWILIO_TASKROUTER_WORKSPACE_SID',
        'TWILIO_TASKROUTER_WORKFLOW_SID',
        'TWILIO_API_KEY', 'TWILIO_API_SECRET']
for v in vars:
    val = os.environ.get(v, 'NOT SET')
    masked = val[:4] + '...' + val[-4:] if len(val) > 8 else val
    print(f'{v}: {masked}')
print()
print('REGRESSION_REPORT_DIR:', os.environ.get('REGRESSION_REPORT_DIR', 'NOT SET'))
"
```

If any required SID is NOT SET, stop and report failure — Lane B resources may not be provisioned.

**CRITICAL**: `TEST_PHONE_NUMBER` MUST be set and MUST be different from `TWILIO_PHONE_NUMBER`. If not set, FAIL immediately — do not skip any checks. Twilio blocks self-send (To=From).

Record the current timestamp for debugger baseline (used by MC3):
```bash
python3 -c "from datetime import datetime; print(datetime.utcnow().isoformat() + 'Z')"
```
Save this as `RUN_START_TIMESTAMP` — MC3 will use it to filter out pre-existing alerts.

## Step 1: Deploy

Deploy the existing serverless functions (they include messaging, callbacks, sync handlers):
```bash
npm run deploy:dev
```

Capture the deployment URLs from output. If deployment fails, report failure and stop.

## Step 2: Messaging Validation (MC1-MC3)

### MC1: Send SMS
Use `mcp__twilio__send_sms` to send a test message from TWILIO_PHONE_NUMBER to TEST_PHONE_NUMBER.

**Validate:**
- Message created successfully (SID returned)
- Use `mcp__twilio__get_message_status` to check delivery
- Use `mcp__twilio__validate_debugger` with 60-second lookback — expect zero 82005 alerts

### MC2: Messaging Service
Use `mcp__twilio__get_messaging_service` with TWILIO_MESSAGING_SERVICE_SID to verify service exists and is configured.

**Validate:**
- Service SID resolves
- Service has at least one phone number (use `mcp__twilio__list_phone_numbers_in_service`)

### MC3: Debugger Clean
Use `mcp__twilio__validate_debugger` with `startDate` set to the `RUN_START_TIMESTAMP` captured in Step 0. This ensures only alerts generated DURING this run are checked — pre-existing historical alerts are ignored.

Record results for each: PASS/FAIL with SIDs and any error messages.

## Step 3: Verify Validation (VC1-VC2)

### VC1: Start Verification
Use `mcp__twilio__start_verification` with:
- Service SID: TWILIO_VERIFY_SERVICE_SID
- To: TWILIO_PHONE_NUMBER
- Channel: "sms"

**Validate:**
- Verification SID returned
- Status is "pending"

### VC2: Check Verification Status
Use `mcp__twilio__get_verification_status` with the service SID and TWILIO_PHONE_NUMBER.

**Validate:**
- Returns status (pending is expected — we can't retrieve the code in headless mode)

Record results.

## Step 4: Sync Validation (SY1-SY4)

### SY1: Create Document
Use `mcp__twilio__create_document` with:
- Service SID: TWILIO_SYNC_SERVICE_SID
- Unique name: "regression-test-TIMESTAMP"
- Data: `{"test": "regression", "timestamp": "now"}`

**Validate:** Document SID returned.

### SY2: Read Document
Use `mcp__twilio__get_document` with the SID from SY1.

**Validate:** Data matches what was written.

### SY3: Update Document
Use `mcp__twilio__update_document` to add a field.

**Validate:** Updated data contains both original and new fields.

### SY4: Create and Read Sync List
Use `mcp__twilio__create_sync_list` to create a list.
Use `mcp__twilio__add_sync_list_item` to add 2 items.
Use `mcp__twilio__list_sync_list_items` to read them back.

**Validate:** 2 items returned with correct data.

Record results for each.

## Step 5: TaskRouter Validation (TR1-TR3)

### TR1: List Workers
Use `mcp__twilio__list_workers` with TWILIO_TASKROUTER_WORKSPACE_SID.

**Validate:** Returns worker list (may be empty — that's OK).

### TR2: List Task Queues
Use `mcp__twilio__list_task_queues` with TWILIO_TASKROUTER_WORKSPACE_SID.

**Validate:** At least one queue exists (default queue from setup).

### TR3: List Workflows
Use `mcp__twilio__list_workflows` with TWILIO_TASKROUTER_WORKSPACE_SID.

**Validate:** At least one workflow exists (default workflow from setup).

Record results.

## Step 5b: Video Validation (VD1-VD3)

**Note**: Video rooms require API Key auth. Check TWILIO_API_KEY and TWILIO_API_SECRET from environment.
If either is NOT SET, SKIP all VD checks and mark them as SKIP with note "API Key credentials not configured".

### VD1: Create Video Room
Use `mcp__twilio__create_video_room` with:
- Unique name: "regression-test-TIMESTAMP" (use python3 to generate)
- Type: "group"
- StatusCallback: deployment URL + "/video/callbacks/room-status"

**Validate:** Room SID returned (starts with RM), status is "in-progress".

### VD2: List Video Rooms
Use `mcp__twilio__list_video_rooms` to verify the created room appears.

**Validate:** Room from VD1 appears in the list with correct unique name and type "group".

### VD3: Complete Room
Use `mcp__twilio__update_room` with the room SID from VD1 to set status to "completed".

**Validate:** Room status is "completed" after update.

Record results for each.

## Step 6: Write Results

Write a structured JSON results file using the Write tool:

```json
{
  "runId": "nonvoice-YYYYMMDD-HHMMSS",
  "timestamp": "ISO timestamp",
  "deploymentUrl": "the-deployed-domain.twil.io",
  "totalChecks": 15,
  "passed": 0,
  "failed": 0,
  "skipped": 0,
  "checks": [
    {
      "id": "MC1",
      "name": "Send SMS",
      "status": "PASS|FAIL|SKIP",
      "sids": ["SMxxxx"],
      "notes": "Details or error message"
    }
  ],
  "debuggerAlerts": 0,
  "recommendations": []
}
```

Write to both:
1. The path from `REGRESSION_REPORT_DIR` env var: `$REGRESSION_REPORT_DIR/nonvoice-results.json`
2. Fallback: `.meta/regression-reports/nonvoice-results.json`

Use `python3` to read the env var for the path.

## Step 7: Capture Learnings

Write a learnings file to the report directory for the documentation flywheel. This file will be consolidated by the orchestrator into `.meta/learnings.md` after all lanes complete.

Use the Write tool to create `$REGRESSION_REPORT_DIR/nonvoice-learnings.md` (use python3 to get the path):

```markdown
### Nonvoice Validation Learnings

**Discoveries:**

1. **[Any failed check — describe what went wrong]**: Root cause or symptom
   - SID, error code, or API response that was unexpected
   - Potential fix or documentation gap

2. **[Any API behavior that differs from docs]**: Describe the discrepancy
   - What we expected vs what happened

**Gotchas:**
- [Any Twilio API quirks encountered during validation]

**Recommendations:**
- [Top 2-3 actionable items]
```

Only include genuine findings — if all 12 checks pass cleanly, write "All 12 checks passed. No issues found." Don't manufacture learnings.

## Step 8: Cleanup

Clean up test artifacts created during validation:
- Delete the Sync document created in SY1 (if you have the SID)
- Delete the Sync list created in SY4
- The Video room from VD1 was already completed in VD3 (no further cleanup needed)

Do NOT delete services, phone numbers, or the deployment — those are shared infrastructure.

## Step 9: Print Summary

Print a summary table as your final output:

| Check | Status | Notes |
|-------|--------|-------|
| MC1: Send SMS | PASS/FAIL | ... |
| MC2: Messaging Service | PASS/FAIL | ... |
| MC3: Debugger Clean | PASS/FAIL | ... |
| VC1: Start Verification | PASS/FAIL | ... |
| VC2: Check Status | PASS/FAIL | ... |
| SY1: Create Document | PASS/FAIL | ... |
| SY2: Read Document | PASS/FAIL | ... |
| SY3: Update Document | PASS/FAIL | ... |
| SY4: Sync List | PASS/FAIL | ... |
| TR1: List Workers | PASS/FAIL | ... |
| TR2: List Queues | PASS/FAIL | ... |
| TR3: List Workflows | PASS/FAIL | ... |
| VD1: Create Video Room | PASS/FAIL/SKIP | ... |
| VD2: List Video Rooms | PASS/FAIL/SKIP | ... |
| VD3: Complete Room | PASS/FAIL/SKIP | ... |

**Total**: X/15 passed

## Pacing

You have up to 120 turns. Budget:
- Steps 0-1: 10 turns (env check + deploy)
- Step 2: 15 turns (messaging — 5 per check)
- Step 3: 10 turns (verify)
- Step 4: 20 turns (sync — 5 per check)
- Step 5: 12 turns (taskrouter)
- Step 5b: 10 turns (video — may SKIP if no API key)
- Steps 6-9: 12 turns (results + learnings + cleanup + summary)

If any step takes more than its budget, skip remaining sub-checks in that step and mark them as SKIP. Move on.
