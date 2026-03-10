<!-- ABOUTME: Headless sequential voice validation: UC1-UC10 including UC9 PSTN via SIP Lab. -->
<!-- ABOUTME: Deploys functions, runs agent-to-agent calls, deep validates each UC, writes structured results. -->

You are running headless via `claude -p`. You have NO interactive terminal.

**CRITICAL CONSTRAINTS — read these first:**
- Do NOT use `AskUserQuestion` — it blocks forever in headless mode
- Do NOT use the `Skill` tool or slash commands (`/architect`, `/spec`, etc.) — they terminate the headless session prematurely
- Do NOT use `${}` parameter substitution or `$()` command substitution in Bash — the sandbox blocks them
- Do NOT try to create temp directories with `mkdir` — use the Write tool instead (it implicitly creates directories)

**Your job**: Deploy serverless functions, validate all 10 voice use cases (UC1-UC10) via agent-to-agent calls and MCP validation tools, and write structured results.

**Prerequisite**: `--preflight` should have run before this session. Infrastructure (deploy, ngrok, agent servers, SIP Lab) is ready. If not, you may need to do basic setup inline.

## Step 0: Environment Check

Read environment variables to determine resource configuration:
```bash
python3 -c "
import os
vars = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER',
        'TEST_PHONE_NUMBER', 'NGROK_DOMAIN_A', 'NGROK_DOMAIN_B',
        'TWILIO_SYNC_SERVICE_SID', 'TWILIO_VERIFY_SERVICE_SID',
        'TWILIO_TASKROUTER_WORKSPACE_SID', 'TWILIO_TASKROUTER_WORKFLOW_SID',
        'TWILIO_INTELLIGENCE_SERVICE_SID',
        'TWILIO_API_KEY', 'TWILIO_API_SECRET',
        'SIP_LAB_TRUNK_SID', 'SIP_LAB_DROPLET_IP', 'SIP_LAB_READY']
for v in vars:
    val = os.environ.get(v, 'NOT SET')
    masked = val[:4] + '...' + val[-4:] if len(val) > 8 else val
    print(f'{v}: {masked}')
print()
print('SERVERLESS_DOMAIN:', os.environ.get('SERVERLESS_DOMAIN', 'NOT SET'))
print('REGRESSION_REPORT_DIR:', os.environ.get('REGRESSION_REPORT_DIR', 'NOT SET'))
"
```

Required for all UCs: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TEST_PHONE_NUMBER`
Required for voice agent tests: `NGROK_DOMAIN_A`, `NGROK_DOMAIN_B`
Required for UC9 PSTN: `SIP_LAB_TRUNK_SID` (or auto-detect via MCP)

If core vars are NOT SET, stop and report failure.

Record the current timestamp for debugger baseline:
```bash
python3 -c "from datetime import datetime; print(datetime.utcnow().isoformat() + 'Z')"
```
Save as `RUN_START_TIMESTAMP`.

## Step 1: Infrastructure Verification

### 1a: Deploy (if not done by preflight)
Check if serverless is deployed:
```bash
python3 -c "import os; d = os.environ.get('SERVERLESS_DOMAIN', ''); print('deployed' if d else 'not deployed')"
```
If not deployed, run `npm run deploy:dev` and capture the domain.

### 1b: Ngrok Tunnel Health
Verify ngrok tunnels are up:
```bash
python3 -c "
import os, urllib.request
for label, var in [('A', 'NGROK_DOMAIN_A'), ('B', 'NGROK_DOMAIN_B')]:
    domain = os.environ.get(var, '')
    if not domain:
        print(f'Tunnel {label}: NOT CONFIGURED')
        continue
    try:
        req = urllib.request.Request(f'https://{domain}')
        urllib.request.urlopen(req, timeout=5)
        print(f'Tunnel {label}: UP (200)')
    except urllib.error.HTTPError as e:
        print(f'Tunnel {label}: UP ({e.code})')
    except Exception as e:
        print(f'Tunnel {label}: DOWN ({e})')
"
```
502 is expected (no server yet) — tunnel is up. If DOWN, tunnels must be started before voice UCs can run. Mark voice UCs as FAIL if tunnels cannot be established.

### 1c: Agent Server Template
Verify the agent server template exists:
```bash
ls -la __tests__/e2e/agent-server-template.js
```

### 1d: Validate Debugger Baseline
Use `mcp__twilio__validate_debugger` with `lookbackSeconds: 10` as a health check. This confirms the MCP server is routing correctly.

### 1e: Initialize State
Use the Write tool to create the state tracking file at the path from `REGRESSION_REPORT_DIR` (use python3 to read env):
```json
{
  "runId": "seq-val-YYYYMMDD-HHMMSS",
  "startedAt": "ISO timestamp",
  "sharedInfra": {},
  "preservedForUC10": { "recordingSids": [], "sourceUCs": [] },
  "useCases": {}
}
```

## Step 2: Agent Server Management

For each voice UC that needs agent servers, use this pattern:

**Start Agent Server:**
```bash
PORT=8080 AGENT_ROLE=questioner AGENT_SYSTEM_PROMPT="Your prompt here" nohup node __tests__/e2e/agent-server-template.js > /tmp/agent-a.log 2>&1 &
```

```bash
PORT=8081 AGENT_ROLE=answerer AGENT_SYSTEM_PROMPT="Your prompt here" nohup node __tests__/e2e/agent-server-template.js > /tmp/agent-b.log 2>&1 &
```

**Verify running:**
```bash
lsof -i :8080 -i :8081 2>/dev/null | grep LISTEN
```

**Stop between UCs:**
```bash
pkill -f agent-server-template 2>/dev/null || true
```

## UC1: Voice Notifications

**Products**: Voice API (outbound), Say, Gather (speech), Recording, AMD
**Agents**: Agent B only (answerer on port 8081)

1. Start Agent B with system prompt: "You are receiving an appointment reminder call. When asked to confirm, say 'yes I confirm my appointment'. Be cooperative."
2. Configure Agent B phone number webhook to ConversationRelay handler using `mcp__twilio__configure_webhook`
3. Execute outbound call using `mcp__twilio__make_call`:
   - From: TWILIO_PHONE_NUMBER
   - To: TEST_PHONE_NUMBER
   - TwiML: `<Response><Say>This is an appointment reminder for tomorrow at 3 PM.</Say><Record maxLength="30" /></Response>`
   - StatusCallback: deployment URL + "/callbacks/call-status"
4. Wait 15 seconds for call to complete
5. Validate with `mcp__twilio__validate_call` — expect completed, duration >= 5s
6. If recording SID returned, validate with `mcp__twilio__validate_recording`
7. Check debugger: `mcp__twilio__validate_debugger` with startDate = RUN_START_TIMESTAMP
8. Record results (PASS/FAIL), preserve recording SID for UC10
9. Stop Agent B

## UC2: Self-Service Automation (IVR)

**Products**: Voice API (inbound), Say, Gather (speech+DTMF), Recording
**Agents**: Agent A only (questioner on port 8080)

1. Start Agent A with prompt: "You are calling a dental office. When the IVR answers, press 1 or say 'appointments' to check appointment availability."
2. Configure IVR phone number webhook to the incoming-call function
3. Execute: Agent A calls IVR number via `mcp__twilio__make_call` with URL pointing to IVR function
4. Wait 20 seconds
5. Validate: `mcp__twilio__validate_call` — expect completed, duration >= 10s
6. Validate recording if present
7. Check debugger
8. Record results, preserve recording SID
9. Stop Agent A

## UC3: Inbound Contact Center

**Products**: Voice API, TaskRouter, Conference, Recording, Sync
**Agents**: Both — Agent A = customer, Agent B = support agent

1. Start Agent A (port 8080, questioner): "You are a customer calling about a billing issue. Explain your problem clearly."
2. Start Agent B (port 8081, answerer): "You are a support agent. Help the customer with their billing inquiry."
3. Configure inbound number → contact-center function, Agent B phone → ConversationRelay
4. Verify TaskRouter workspace exists: `mcp__twilio__list_workflows` with workspace SID
5. Execute: Agent A calls inbound number → TaskRouter routes → Agent B joins conference
6. Wait 30 seconds
7. Validate: `mcp__twilio__validate_call` for both legs
8. If both calls have recordings, validate with `mcp__twilio__validate_recording`
9. Check debugger, record results, preserve recording SIDs
10. Stop both agents

## UC4: Outbound Contact Center

**Products**: Voice API (outbound), Conference, Participants API, AMD, Recording
**Agents**: Both — Agent A = agent, Agent B = customer

1. Start Agent A (port 8080, answerer): "You are a support agent making a courtesy follow-up call about a recent order."
2. Start Agent B (port 8081, answerer): "You are a customer receiving a courtesy call about your recent order. Be friendly."
3. Execute outbound call to Agent B, then add Agent A to conference
4. Wait 30 seconds
5. Validate both call legs, recording, debugger
6. Record results, preserve recording SIDs
7. Stop both agents

## UC5: AI Agents (ConversationRelay)

**Products**: Voice API, ConversationRelay, Recording, Transcription, Sync, Messaging
**Agents**: Agent A only (questioner — the ConversationRelay app is the B-side)

1. Start Agent A (port 8080, questioner): "You are ordering a large pepperoni pizza. Give your address as 123 Main Street."
2. Configure number → ConversationRelay connect handler
3. Execute: Agent A calls, multi-turn conversation
4. Wait 30 seconds
5. Validate: `mcp__twilio__validate_call` — expect completed, duration >= 15s
6. Validate recording, check for SMS confirmation with `mcp__twilio__validate_message`
7. Check Sync data if applicable
8. Check debugger, record results, preserve recording SID
9. Stop Agent A

## UC6: AI Agents (Media Streams)

**Products**: Voice API, `<Connect><Stream>` (bidirectional), Recording
**Agents**: Agent A only (questioner)

1. Start Agent A (port 8080, questioner): "Ask about today's weather forecast."
2. Configure number → stream-connect function
3. Execute call
4. Wait 20 seconds
5. Validate call, recording, debugger
6. Record results, preserve recording SID
7. Stop Agent A

## UC7: Sales Dialer

**Products**: Voice API (outbound), Conference, AMD, Recording
**Agents**: Both — Agent A = sales rep, Agent B = prospect

1. Start Agent A (port 8080, answerer): "You are a sales representative calling about a free trial of your software product."
2. Start Agent B (port 8081, answerer): "You are a business prospect. Show interest in the product and ask about pricing."
3. Execute outbound dialer flow: call Agent B → AMD → conference → Agent A joins
4. Wait 30 seconds
5. Validate both legs, recording, debugger
6. Record results, preserve recording SIDs
7. Stop both agents

## UC8: Call Tracking

**Products**: Voice API (inbound), Say (whisper), Dial, Recording, Sync
**Agents**: Both — Agent A = caller, Agent B = business

1. Start Agent A (port 8080, questioner): "You are calling about the plumbing services ad you saw online."
2. Start Agent B (port 8081, answerer): "You are a plumbing company receptionist. Help schedule a service appointment."
3. Configure tracking number → call-tracking function, Agent B phone → ConversationRelay
4. Execute: Agent A calls tracking number → whisper → forwarded to Agent B
5. Wait 30 seconds
6. Validate call, recording, Sync doc attribution, debugger
7. Record results, preserve recording SIDs
8. Stop both agents

## UC9: PSTN Connectivity (SIP Lab)

**Products**: Elastic SIP Trunking, Voice API, Recording, Voice Intelligence
**Agents**: None — uses SIP Lab Asterisk PBX

**Prerequisites**: SIP Lab must be ready (preflight handles this). Check:
```bash
python3 -c "import os; print('SIP_LAB_READY:', os.environ.get('SIP_LAB_READY', 'false'))"
```

If SIP_LAB_READY is not "true", attempt auto-detection:
- Use `mcp__twilio__list_sip_trunks` to find a trunk
- If trunk found but no droplet, mark UC9 as FAIL with "SIP Lab droplet not available"
- If no trunk found, mark UC9 as FAIL with "No SIP trunks configured. Provision with infrastructure/sip-lab/scripts/setup-sip-lab.js"
- Do NOT skip UC9 — always report PASS or FAIL

If SIP Lab is ready:
1. Verify trunk configuration: `mcp__twilio__validate_sip` with trunk SID
2. Place outbound call through the SIP trunk to the Asterisk PBX test extension
3. Wait 20 seconds for call to complete
4. Validate: `mcp__twilio__validate_call` — expect completed call through trunk
5. Validate recording if present: `mcp__twilio__validate_recording`
6. Create Voice Intelligence transcript from recording
7. Validate transcript: `mcp__twilio__validate_transcript`
8. Check debugger for SIP-related errors
9. Record results

## UC10: AI/ML Transcription (Post-Call Analysis)

**Products**: Voice Intelligence, Language Operators
**Agents**: None — post-processing of preserved recordings

1. Collect preserved recording SIDs from previous UCs (at least 2 recordings needed)
2. If fewer than 2 recordings, mark UC10 as FAIL with "Insufficient recordings from prior UCs"
3. For each recording, create a Voice Intelligence transcript using `mcp__twilio__create_transcript` with source_sid
4. Wait 90 seconds for transcripts to process. Voice Intelligence queues can take 45-90+ seconds for recordings over 30s. If `validate_transcript` shows "in-progress" after 90s, retry once after another 60 seconds before marking FAIL.
5. Validate each transcript: `mcp__twilio__validate_transcript` — expect completed with sentences
6. Run language operators if available: `mcp__twilio__validate_language_operator`
7. Verify transcript quality: check that sentences contain actual speech (not all silence/music)
8. Record results

## Step 10: Write Results

Write a structured JSON results file using the Write tool:

```json
{
  "runId": "sequential-YYYYMMDD-HHMMSS",
  "timestamp": "ISO timestamp",
  "deploymentUrl": "the-deployed-domain.twil.io",
  "totalChecks": 10,
  "passed": 0,
  "failed": 0,
  "skipped": 0,
  "useCases": [
    {
      "id": "UC1",
      "name": "Voice Notifications",
      "status": "PASS|FAIL",
      "callSids": ["CAxxxx"],
      "recordingSids": ["RExxxx"],
      "transcriptSids": [],
      "duration": "seconds",
      "notes": "Details or error message"
    }
  ],
  "preservedRecordings": ["RExxxx"],
  "debuggerAlerts": 0,
  "recommendations": []
}
```

Write to both:
1. The path from `REGRESSION_REPORT_DIR` env var: use python3 to read and write to `REGRESSION_REPORT_DIR/sequential-results.json`
2. Fallback: `.meta/regression-reports/sequential-results.json`

## Step 11: Capture Learnings

Write a learnings file to the report directory:

Use the Write tool to create `REGRESSION_REPORT_DIR/sequential-learnings.md` (use python3 to get the path):

```markdown
### Sequential Voice Validation Learnings

**Discoveries:**

1. **[Any failed UC — describe what went wrong]**: Root cause or symptom
   - Call SID, error code, or API response that was unexpected
   - Potential fix or documentation gap

2. **[Any API behavior that differs from docs]**: Describe the discrepancy

**Gotchas:**
- [Any Twilio API quirks encountered during voice validation]

**Recommendations:**
- [Top 2-3 actionable items]
```

Only include genuine findings — if all 10 UCs pass, write "All 10 use cases passed. No issues found."

## Step 12: Cleanup

Clean up test artifacts:
- Stop any running agent servers: `pkill -f agent-server-template 2>/dev/null || true`
- Reset phone number webhooks if modified during testing
- Delete test Sync documents created during UCs
- Do NOT delete recordings (preserved for analysis)
- Do NOT delete services, phone numbers, or the deployment

## Step 13: Print Summary

Print a summary table as your final output:

| UC | Status | Call SIDs | Notes |
|----|--------|-----------|-------|
| UC1: Voice Notifications | PASS/FAIL | CAxxxx | ... |
| UC2: Self-Service IVR | PASS/FAIL | CAxxxx | ... |
| UC3: Inbound Contact Center | PASS/FAIL | CAxxxx | ... |
| UC4: Outbound Contact Center | PASS/FAIL | CAxxxx | ... |
| UC5: AI Agents (ConversationRelay) | PASS/FAIL | CAxxxx | ... |
| UC6: AI Agents (Media Streams) | PASS/FAIL | CAxxxx | ... |
| UC7: Sales Dialer | PASS/FAIL | CAxxxx | ... |
| UC8: Call Tracking | PASS/FAIL | CAxxxx | ... |
| UC9: PSTN Connectivity (SIP Lab) | PASS/FAIL | CAxxxx | ... |
| UC10: Post-Call Analysis | PASS/FAIL | — | ... |

**Total**: X/10 passed

## Pacing

You have up to 250 turns. Budget:
- Steps 0-1: 15 turns (env check + infra verification)
- UC1-UC2: 30 turns (15 per UC — simple single-agent)
- UC3-UC4: 40 turns (20 per UC — dual-agent + TaskRouter/Conference)
- UC5-UC6: 30 turns (15 per UC — ConversationRelay/Streams)
- UC7-UC8: 30 turns (15 per UC — sales/tracking)
- UC9: 25 turns (SIP Lab verification + PSTN call)
- UC10: 25 turns (transcript creation + analysis)
- Steps 10-13: 15 turns (results + learnings + cleanup + summary)
- Buffer: 40 turns (retries, debugging)

If any UC takes more than its budget, mark it as FAIL with the reason and move on. Never skip — always report PASS or FAIL.

## Failure Handling

- **First failure per UC**: Retry once with adjusted parameters (longer wait, different TwiML)
- **Second failure**: Mark as FAIL with detailed error, move to next UC
- **Infrastructure failure** (ngrok down, deploy failed): Report FAIL for all affected UCs, do not retry
- All failures must include: call SID (if available), error message, and suggested fix
