# Operational Gotchas

Cross-cutting gotchas discovered through real debugging sessions. Domain-specific gotchas live in their respective CLAUDE.md files; these are the ones that span multiple domains or have no single home.

## Testing

- **Coverage summary JSON is cached** — `pre-bash-validate.sh` reads `coverage/coverage-summary.json` and considers it fresh if newer than `package.json`. After adding test files, must regenerate: `npx jest --coverage --coverageReporters=json-summary`.

- **`jest.doMock` for Runtime.getFunctions()** — Callback handlers use `Runtime.getFunctions()` at require-time. Use `jest.doMock(path, factory)` + `jest.resetModules()` in `beforeEach()`, not `jest.mock()` (which hoists before variable assignments).

- **`toContainEqual` for asymmetric matchers in arrays** — `toContain(expect.stringContaining())` uses `===` reference equality. Use `toContainEqual()` for deep equality with asymmetric matchers.

- **Newman E2E needs local server** — `npm run test:e2e` hits `localhost:3000`. Start `npm start` (twilio-run) first. Use `--timeout-request 5000` to avoid hangs.

- **`<Start><Recording>` hangs twilio-run locally** — Functions using `twiml.start().recording()` hang indefinitely on the local dev server and never return a response. Affected: ivr-welcome, notification-outbound, outbound-customer-leg, sales-dialer-prospect, call-tracking-inbound, contact-center-welcome. Works fine deployed. E2E tests exclude these for local runs; use `npm run test:e2e:deployed` for full coverage.

## Serverless Runtime

- **Twilio Functions have no built-in scheduler** — Functions are stateless HTTP handlers triggered by webhooks or direct HTTP calls. They cannot run on a cron/timer. For scheduled execution, use an external cron service (GitHub Actions, EasyCron, AWS EventBridge) that calls the Function's HTTP endpoint. Studio Flows with scheduled triggers are an alternative within the Twilio ecosystem. Do not use `setInterval()` or cron libraries inside a Function — they won't persist between invocations.

- **`.protected.js` doesn't work with external cron callers** — Protected functions validate Twilio request signatures, which external cron services cannot provide. For cron-triggered functions, use a public `.js` endpoint with a shared-secret query parameter checked in the handler.

## Deployment

- **CLI `--value` flag double-escapes JSON strings** — `twilio api:...:variables:create --value '{"k":"v"}'` stores escaped JSON. Use `.env` file + redeploy instead for JSON env vars.

- **Inbound leg CallSid differs from outbound API call SID** — When initiating outbound to a tracking number, the function sees a different CallSid (inbound child). Sync docs keyed by inbound SID, recordings on outbound SID.

## Voice Call Routing

- **Empty `voiceUrl` on a Twilio number causes silent instant call failure** — When `make_call` targets a Twilio number that has no voice webhook configured (`voiceUrl: ""`), the call fails instantly with `duration: 0`. Twilio produces ZERO diagnostics: no debugger alerts, no call notifications, no error codes, no Voice Insights errors. The only symptom is `status: failed` with start_time === end_time. This wastes enormous debugging time because it looks identical to auth failures, regional routing issues, or account-level blocks. **Always verify destination number webhooks before troubleshooting call failures.** Use `list_phone_numbers` and check that every number involved in testing has a non-empty `voiceUrl`.

## ConversationRelay & Voice Intelligence

- **`record: true` on make_call is ignored with ConversationRelay** — REST API recording param silently produces no recording when TwiML handler uses `<Connect><ConversationRelay>`. Always use `<Start><Recording>` in TwiML before ConversationRelay.

- **Agent-to-agent ConversationRelay setup is not optional** — It produces the multi-turn transcripts needed to validate topic keywords and conversation quality. Using a generic IVR handler produces meaningless transcripts.

- **Language Operators run automatically on VI transcripts** — Conversation Summary and Sentiment Analysis produce results without explicit invocation if configured as default operators on the Intelligence service.

## Voice SDK / WebRTC

- **Voice SDK 2.x has no CDN** — Must serve `node_modules/@twilio/voice-sdk/dist/twilio.min.js` from own Express server. The 1.x CDN was deprecated April 2025.

- **SDK 2.x API changes from 1.x** — `device.register()` required (no auto-register), events are `'registered'`/`'unregistered'` (not `'ready'`/`'offline'`), `device.connect({ params: { To } })` returns Promise.

- **`Twilio.Response` is serverless-runtime-only** — Not in npm `twilio` package. Tests need MockResponse class. `jwt.AccessToken` IS in npm package.

- **TwiML App SID** (`APxxx`) stored as `TWILIO_VOICE_SDK_APP_SID` in `.env` and serverless env vars.

- **Playwright + Chromium handles WebRTC** — Use `--use-fake-device-for-media-stream` + `--use-fake-ui-for-media-stream`. Server-side validation covers what browser-side can't.

- **CRITICAL: Voice SDK `connected` fires at A-leg, not B-leg bridge** — `device.connect()` reports `connected` when the browser connects to Twilio's WebRTC gateway, BEFORE the TwiML App dials the B-leg and it answers. A test completing in <2s for an outbound PSTN call is a false positive — real bridged calls take 3-5s minimum. Always sanity-check test durations against real-world call setup latency.

- **Never report Twilio E2E test results without checking timing** — Green tests with suspiciously fast durations are likely testing signaling only, not actual media/audio bridging. Verify call duration via REST API or add explicit post-bridge waits + duration assertions.

## Regional API & Authentication

- **Regional URL requires edge location** — `api.{edge}.{region}.twilio.com` (e.g. `api.sydney.au1.twilio.com`). Omitting the edge (e.g. `api.au1.twilio.com`) resolves to US infrastructure where regional API keys return 401.

- **API key auth cannot fetch `/Accounts/{SID}.json`** — The account fetch endpoint requires auth token auth specifically. API keys work for all other endpoints. Use `IncomingPhoneNumbers.json?PageSize=1` as a lightweight auth validation endpoint when using API keys.

- **Auth token rotation invalidates ALL API keys** — When the auth token is rotated/expired, every API key created under it dies. Regional and US keys all fail simultaneously. Only recovery: fresh auth token from Console → create new keys.

- **Twilio Node SDK regional constructor** — `Twilio(apiKeySid, apiKeySecret, { accountSid, region: 'au1', edge: 'sydney' })` for API key auth. `Twilio(accountSid, authToken, { region, edge })` for auth token auth. The MCP server's `createTwilioMcpServer()` supports both via `TWILIO_API_KEY`/`TWILIO_API_SECRET`/`TWILIO_REGION`/`TWILIO_EDGE` env vars.

- **Twilio Node SDK auto-reads `TWILIO_REGION` and `TWILIO_EDGE` from env** — The SDK reads these env vars automatically even when not passed in the constructor options. Setting them in `.env` silently routes ALL API calls to regional infrastructure (`api.{edge}.{region}.twilio.com`). If those calls use a US1 auth token, every request returns 401. Symptoms: cascading auth failures across unrelated tests with no obvious cause. Fix: comment out or unset `TWILIO_REGION`/`TWILIO_EDGE` when not actively testing regional endpoints.

## Claude Code & MCP

- **MCP server requires Claude Code restart after env changes** — The MCP server is a separate process that inherits the shell environment at launch. Mid-session changes to `.env` or exported variables do NOT propagate. Must quit and restart Claude Code entirely.

- **`.mcp.json` env block augments, doesn't replace parent env** — The MCP server subprocess inherits ALL env vars from the parent Claude Code process. The `env` block in `.mcp.json` adds or overrides individual vars but does not isolate the process. To prevent inherited `TWILIO_REGION`/`TWILIO_EDGE` from contaminating the MCP server, explicitly set them to empty strings in `.mcp.json`.

- **`source .env` does not undo commented-out vars** — Shell variables persist in memory after commenting out lines in `.env`. Must explicitly `unset TWILIO_REGION TWILIO_EDGE` etc. before re-sourcing. This interacts badly with MCP (which also needs a restart to pick up the unset).

## Hooks & Documentation Flywheel

- **Hooks receive tool input on stdin as JSON, not env vars** — `CLAUDE_TOOL_INPUT_FILE_PATH`, `CLAUDE_TOOL_INPUT_COMMAND`, `CLAUDE_TOOL_INPUT_CONTENT` don't exist. Parse stdin with `jq`: `FILE_PATH="$(cat | jq -r '.tool_input.file_path // empty')"`. All 4 hooks (pre-bash-validate, pre-write-validate, post-write, post-bash) were silently broken until fixed.

- **Flywheel must exclude its own output files** — Editing `pending-actions.md` triggers post-write, which tracks it in `.session-files`, which the next flywheel run picks up, generating infinite recursive suggestions. Filter out `pending-actions.md`, `.session-files`, `.session-start`, `.last-doc-check` from the file collection.

- **Pending actions auto-clear only works for concrete paths** — Entries with vague targets ("Relevant CLAUDE.md") or gitignored paths (`.meta/todo.md`) never match staged files and accumulate forever. Always use specific file paths in suggestions.

- **Flywheel has 4 sources** — git status (uncommitted), recent commits (since session start), session-tracked files (.session-files), validation failure patterns (pattern-db.json). Source 3 was broken until the stdin fix.

- **Meta-mode hook blocks writes outside project root** — `pre-write-validate.sh` prefix-strips `PROJECT_ROOT/` from `FILE_PATH`. When path is outside the project (e.g., `~/.claude/plans/`), the strip is a no-op, leaving an absolute path that matches no allowed patterns. Fixed: wrapped case block in `if [[ "$RELATIVE_PATH" != "$FILE_PATH" ]]`.
