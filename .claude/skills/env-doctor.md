---
name: env-doctor
description: Diagnose shell and .env credential conflicts. Use when hitting 401 errors, auth failures after switching Twilio accounts, or mysterious environment variable issues.
---

# Environment Doctor

Diagnose shell vs `.env` conflicts that cause mysterious Twilio auth failures. Run this when:
- A new user clones the repo and gets 401 errors
- API calls fail after switching between Twilio accounts or projects
- Regional routing errors appear unexpectedly
- MCP tools return auth failures but CLI works (or vice versa)

## Usage

Run the diagnostic script:

```bash
./scripts/env-doctor.sh
```

## What It Checks

| Check | What It Detects |
|-------|-----------------|
| **1. Project .env** | Missing `.env` file |
| **2. Credential conflicts** | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` mismatch between shell env and `.env` file |
| **3. Regional routing** | Orphaned `TWILIO_REGION`/`TWILIO_EDGE` in shell that silently redirect all API calls to regional endpoints |
| **4. API key auth** | `TWILIO_API_KEY`/`TWILIO_API_SECRET` mismatch between shell and `.env` |
| **5. Environment isolation** | Whether `direnv` is installed and `.envrc` is allowed |

## Common Scenarios

### New user gets 401 after cloning
They have `TWILIO_ACCOUNT_SID` from a previous project in their shell. The `.env` has different credentials. Shell wins → wrong account → 401.

**Fix:** `unset TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN` or install direnv.

### Regional 401 errors
User previously set `TWILIO_REGION=au1` for regional testing. They commented it out in `.env` but the shell still has it. All API calls silently route to AU1 endpoints where US1 credentials fail.

**Fix:** `unset TWILIO_REGION TWILIO_EDGE` — commenting out `.env` lines doesn't unset shell vars.

### MCP tools fail but CLI works
The MCP server inherits env at launch. If shell had stale vars when Claude Code started, MCP uses those. CLI reads `.env` fresh each invocation.

**Fix:** Restart Claude Code entirely after fixing env vars.

## Integration

- Runs automatically before `npm start` (via `prestart` hook in `package.json`)
- Referenced in CLAUDE.md Documentation Protocol section
- Also available via `/preflight` (Check 2.8)

## Exit Codes

- `0` — Clean (or warnings only)
- `1` — Conflicts detected that will cause auth failures

$ARGUMENTS
