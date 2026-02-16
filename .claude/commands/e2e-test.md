# E2E Test Runner

Run end-to-end tests against live Twilio services. Complements `/test` (unit/integration suite) and `/validate` (single-resource deep validation).

## Pre-Flight

Before running E2E tests, verify the environment. Do NOT skip any of these steps — report each as PASS or FAIL.

### 1. Twilio CLI Profile

```bash
twilio profiles:list
```

Confirm the active profile matches the intended test account. If ambiguous, ask the user which account to target.

### 2. Environment Variables

Verify these are set and valid:

| Variable | Required | Format |
|----------|----------|--------|
| `TWILIO_ACCOUNT_SID` | Yes | Starts with `AC`, 34 chars |
| `TWILIO_PHONE_NUMBER` | Yes | E.164 (`+1...`) |
| `TEST_PHONE_NUMBER` | Yes | E.164 — must be a REAL number, never a magic test number |

### 3. Deployment Status

Check that functions are deployed and current:

```bash
twilio serverless:list --properties serviceName,dateUpdated
```

If the last deploy is stale or functions were modified since, suggest deploying first with `/deploy`.

## Test Execution

Use REAL phone numbers for all operations. NEVER use Twilio magic test numbers (`+15005550006` etc.) — those bypass the carrier network and miss real-world failures.

### Place Test Calls/Messages

Use the Twilio CLI or MCP tools to initiate real calls and messages. Record every resource SID.

### Validate Results

Use MCP deep validation tools (NOT surface-level debugger checks):

- **Calls**: `validate_call` with `validateContent: true`
- **Messages**: `validate_message` with `waitForTerminal: true`
- **Voice AI flows**: `validate_voice_ai_flow`
- **Debugger**: `validate_debugger` with lookback covering the test window

See `/validate` for full MCP tool reference and options.

## Reporting

NEVER skip a phase silently. If a step cannot be completed, report it explicitly with the reason.

### Results Format

```
## E2E Test Results

### Environment
- Account: <friendly name> (<masked SID>)
- Profile: <profile name>
- Service: <service name>, last deployed <date>

### Tests Run

| Test | Resource SID | Status | Detail |
|------|-------------|--------|--------|
| Outbound call | CA... | PASS | Completed, 45s, no errors |
| Inbound SMS | SM... | PASS | Delivered in 2.1s |
| Voice AI flow | CA... | FAIL | Transcript contained "application error" |

### Validation Summary
- Debugger alerts: <count> in test window
- Deep validation: <pass count>/<total count> passed

### Failures
[For each failure:]
- Resource SID
- What was expected
- What actually happened
- Relevant notification or debugger alert details
```

## Scope

$ARGUMENTS
