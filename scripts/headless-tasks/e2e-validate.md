<!-- ABOUTME: Prompt file for autonomous E2E validation against live Twilio services. -->
<!-- ABOUTME: Deploys, places real calls, validates callbacks, diagnoses failures, retries up to 3x per phase. -->

Run the full E2E validation plan autonomously. Execute each phase in order, retrying up to 3 times per phase on failure. Do NOT skip any phase — every phase requires real Twilio API calls.

## Phase 1: Pre-flight & Deploy

1. Run `/preflight` to verify CLI profile, env vars, and auth.
2. Run `npm test --bail` to confirm tests pass before deploying.
3. Run `npm run deploy:dev` to deploy serverless functions.
4. Verify deployment succeeded (check output for function URLs).
5. If any step fails: read error output, diagnose, fix, and retry this phase.

## Phase 2: Live Call Validation

1. Place a test call using `/e2e-test voice` or the agent-to-agent testing infrastructure.
2. Wait 30 seconds for the async pipeline to settle (recording, transcription, callbacks).
3. Use the `validate_call` MCP tool to deep-validate the call (status, duration, recording).
4. Use `validate_recording` to verify recording completed with media URL.
5. Use `validate_debugger` to check for zero 82005/82004 alerts.
6. If any step fails: read debugger logs with `/twilio-logs`, diagnose root cause, apply fix, redeploy with `npm run deploy:dev`, and retry this phase.

## Phase 3: Callback & SMS Verification

1. Verify recording callbacks fired by checking Sync documents for the call SID.
2. Use `validate_message` to verify SMS summary was sent to the test number.
3. Run `validate_debugger` again to confirm zero new alerts since Phase 2.
4. If any step fails: read callback handler code, check Sync state, fix the handler, redeploy, and retry this phase.

## Final: Report & Commit

After all phases pass (or exhaust retries), generate a summary:

| Phase | Status | Retries | Notes |
|-------|--------|---------|-------|
| Pre-flight & Deploy | PASS/FAIL | 0-3 | ... |
| Live Call | PASS/FAIL | 0-3 | ... |
| Callback & SMS | PASS/FAIL | 0-3 | ... |

If any fixes were applied, use `/commit` to commit them with a conventional message.

**Recommended invocation:** `--max-turns 80` (default 30 is insufficient for E2E with retries).
