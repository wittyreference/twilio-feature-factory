# Preflight Environment Verification

Verify that the local environment is ready for Twilio development before starting real work. Catches expired tokens, wrong CLI profiles, and missing env vars early.

## Checks to Run

Run these 4 checks in order and report results in a summary table.

### Check 1: Twilio CLI Profile

```bash
twilio profiles:list
```

- **PASS**: Active profile exists and its Account SID matches `$TWILIO_ACCOUNT_SID`
- **WARN**: Active profile exists but its SID doesn't match `$TWILIO_ACCOUNT_SID` (wrong profile?)
- **FAIL**: No profiles configured or no active profile

### Check 2: Environment Variables

Load from `.env` file if present. Check each variable:

**Required (FAIL if missing or malformed):**

| Variable | Format |
|----------|--------|
| `TWILIO_ACCOUNT_SID` | Must start with `AC`, 34 chars |
| `TWILIO_AUTH_TOKEN` | Must be non-empty |
| `TWILIO_PHONE_NUMBER` | Must start with `+` |

**Optional (INFO if missing):**

| Variable | Expected Prefix | Feature |
|----------|----------------|---------|
| `TWILIO_API_KEY` | `SK` | API key auth |
| `TWILIO_API_SECRET` | — | API key auth |
| `TWILIO_VERIFY_SERVICE_SID` | `VA` | Phone verification |
| `TWILIO_SYNC_SERVICE_SID` | `IS` | Real-time state sync |
| `TWILIO_TASKROUTER_WORKSPACE_SID` | `WS` | Skills-based routing |
| `TWILIO_TASKROUTER_WORKFLOW_SID` | `WW` | Task routing |
| `TWILIO_MESSAGING_SERVICE_SID` | `MG` | Sender pools |
| `TEST_PHONE_NUMBER` | `+` | E2E testing |

For variables with a known prefix, **WARN** if the value is set but doesn't match the expected prefix.

### Check 2.5: Regional Configuration

Check for regional env vars that silently redirect all API traffic:

```bash
# Check shell environment
echo "TWILIO_REGION=${TWILIO_REGION:-}" "TWILIO_EDGE=${TWILIO_EDGE:-}"
# Check .env file for uncommented regional vars
grep -E '^TWILIO_(REGION|EDGE|AU1_API|IE1_API)' .env
# Check callback URL
grep '^TWILIO_CALLBACK_BASE_URL' .env
```

- **PASS**: TWILIO_REGION and TWILIO_EDGE are not set in env, no uncommented regional API keys in .env, callback URL points to `.twil.io` (US1)
- **WARN**: TWILIO_REGION or TWILIO_EDGE is set — all API calls route to regional endpoints
- **WARN**: TWILIO_CALLBACK_BASE_URL contains `.au1.` or `.ie1.` — callbacks point to regional deployment
- **WARN**: Uncommented `TWILIO_AU1_API_KEY` or `TWILIO_IE1_API_KEY` in .env — SDK may pick up regional credentials

### Check 2.6: MCP Server Health

Verify the MCP server is running and routing to the correct region:

```bash
# Test MCP connectivity — use validate_debugger as a lightweight health check
# If it returns "Endpoint is not supported in realm 'au1'" or similar,
# the MCP server is routing to the wrong region and needs a restart.
```

Use MCP tool `validate_debugger` with `lookbackSeconds: 10`. Interpret:

- **PASS**: Returns successfully with `success: true` — MCP server is live and routing correctly
- **FAIL**: Returns regional endpoint error — MCP server inherited stale TWILIO_REGION/TWILIO_EDGE from a previous env state. Fix: restart Claude Code to relaunch MCP server with clean environment.
- **FAIL**: Connection refused or timeout — MCP server is not running. Fix: check `.mcp.json` config and restart Claude Code.

**Why this matters**: The MCP server is a separate process that inherits env vars at launch. Changing `.env` or unsetting shell vars does NOT affect the running MCP server. A restart is required after any regional configuration change.

### Check 3: Auth Validity

```bash
twilio api:core:accounts:fetch --sid $TWILIO_ACCOUNT_SID -o json
```

- **PASS**: Returns account data (report friendly name and status)
- **FAIL**: Auth error, expired OAuth token, network failure, or account suspended

This is the most important check — it proves credentials actually work right now.

### Check 4: Deployment Status (only with `--verbose`)

```bash
twilio serverless:list --properties serviceName,dateUpdated
```

- **INFO**: Shows last deploy date and service name
- **WARN**: No deployments found (first deploy, or different profile)

Skip this check unless `--verbose` is passed.

## Output Format

Present results as a markdown table:

```
## Preflight Check Results

| Check | Status | Detail |
|-------|--------|--------|
| CLI Profile | PASS | Active: my-project (AC1234...5678) |
| Env: TWILIO_ACCOUNT_SID | PASS | AC1234...5678 |
| Env: TWILIO_AUTH_TOKEN | PASS | Set (32 chars) |
| Env: TWILIO_PHONE_NUMBER | PASS | +1234567890 |
| Env: TWILIO_VERIFY_SERVICE_SID | INFO | Not configured (verification features unavailable) |
| Auth Validity | PASS | Account active, friendly name: "My Project" |

Result: READY (6 passed, 0 failed, 1 info)
```

**Status meanings:**
- **PASS** — Check succeeded
- **FAIL** — Blocking problem, must fix before proceeding
- **WARN** — Potential issue, investigate but not blocking
- **INFO** — Optional item not configured, noted for awareness

**Overall result:**
- **READY** — No FAILs
- **NOT READY** — One or more FAILs (list what to fix)

## Failure Guidance

When checks fail, provide actionable next steps:

| Failure | Fix |
|---------|-----|
| No CLI profile | `twilio login` to authenticate |
| Expired OAuth token | `twilio login` to re-authenticate |
| Wrong profile active | `twilio profiles:use <profile-name>` |
| SID mismatch | Update `.env` or switch profile |
| Missing TWILIO_ACCOUNT_SID | Add to `.env`: `TWILIO_ACCOUNT_SID=ACxxxxxxx` |
| Missing TWILIO_AUTH_TOKEN | Add to `.env`: `TWILIO_AUTH_TOKEN=your_token` |
| Missing TWILIO_PHONE_NUMBER | Add to `.env`: `TWILIO_PHONE_NUMBER=+1xxxxxxxxxx` |
| Auth failure | Check token hasn't expired, account isn't suspended |

## Security Notes

- Never print full auth tokens or API secrets — show length only (e.g., "Set (32 chars)")
- Mask SIDs in output: show first 6 and last 4 characters (e.g., `AC1234...5678`)
- Do not log credentials to any file

$ARGUMENTS
