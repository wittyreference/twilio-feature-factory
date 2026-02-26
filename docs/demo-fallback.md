# ABOUTME: Three-tier demo fallback strategy for ConversationRelay and other live demos.
# ABOUTME: Ensures a smooth demo even when ngrok, external APIs, or connectivity fail.

# Demo Fallback Strategy

ConversationRelay is the most impressive demo feature — and the most fragile. It requires ngrok + Anthropic API key + speech provider + Twilio Functions all working simultaneously.

## Pre-Demo Checklist

Run the health check before any demo:

```bash
./scripts/check-demo-health.sh
```

## Three-Tier Fallback

### Tier 1: ngrok Dies Mid-Demo

**Symptoms:** Call connects but AI doesn't respond, or call drops after connecting.

**Recovery (30 seconds):**
1. Switch to the IVR demo: "Let me show you the traditional voice IVR while I reconnect"
2. Call the Twilio number — IVR works from the *deployed* build (no ngrok needed)
3. Restart ngrok in another terminal: `ngrok http 3000`
4. Update the ConversationRelay webhook URL if needed

**Why IVR works without ngrok:** The IVR is served from the deployed Twilio Functions service, not from localhost.

### Tier 2: No ngrok / No External API Access

**Symptoms:** Can't establish ngrok tunnel, or Anthropic/Deepgram APIs unreachable.

**Recovery:**
1. Show the MCP validation tools on *previous* call/recording data:
   - `validate_call` on a recent call SID from the account
   - Show the multi-signal validation output (Voice Insights, debugger, notifications)
2. Show a recording + transcript from a previous ConversationRelay session
3. Walk through the architecture: "Here's what happens when a call connects..."

**Artifacts to have ready:**
- A recent Call SID that has a recording and transcript
- The demo transcript at `docs/demo-assets/conversation-relay-transcript.md`

### Tier 3: No Twilio Connectivity At All

**Symptoms:** Can't reach Twilio APIs, account issue, or network down.

**Recovery:**
1. Walk through `docs/demo-assets/conversation-relay-transcript.md` — annotated conversation
2. Show `docs/demo-assets/demo-flow-diagram.md` — the call flow architecture
3. Run the test suite: `npm test` — 365 tests pass without Twilio connectivity
4. Show the MCP server tool count and validation code

**Talking point:** "The system has 365 passing tests covering all function handlers, deep validation, and integration flows. Here's what a live session produces..."

## Key Demo Phone Number

```
+12069666002
```

- **Voice webhook:** Deployed IVR (works without ngrok)
- **For ConversationRelay:** Webhook must point to ngrok URL + `/conversation-relay/ai-assistant-inbound`

## Common Failure Modes

| Failure | Detection | Impact | Recovery Time |
|---------|-----------|--------|---------------|
| ngrok tunnel drops | Health check fails | ConversationRelay stops, IVR still works | 30 sec (restart) |
| Anthropic API key expired | Health check fails | AI doesn't respond to speech | Need new key |
| Twilio auth expired | Health check fails | All API calls fail | Re-auth via CLI |
| Port 3000 in use | Server won't start | Nothing works locally | Kill process, restart |
| Speech provider down | Call connects, no transcription | AI can't hear caller | Switch provider in config |
