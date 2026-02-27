# ABOUTME: Tight 10-minute demo script for the Twilio Feature Factory.
# ABOUTME: Five 2-minute segments with setup, script, actions, and fallbacks.

# Twilio Feature Factory — 10-Minute Demo

**Total time:** 10 minutes (5 segments x 2 minutes)
**Pre-requisites:** Run `./scripts/check-demo-health.sh` before starting

---

## Setup (Before the Demo)

```bash
# 1. Run health check
./scripts/check-demo-health.sh

# 2. Start demo server (if showing local dev)
npm run demo

# 3. Open these tabs:
#    - Terminal with Claude Code open
#    - Twilio Console (optional, for showing recordings)
#    - This script for reference
```

---

## Segment 1: Voice IVR (0:00 - 2:00)

### Context
> "Let me start with traditional Twilio voice — the bread and butter of CPaaS."

### Setup
- Phone ready to call on speaker
- IVR webhook configured on `+12069666002`

### Demo Actions
1. **Call `+12069666002` on speaker**
2. Listen to: "Thank you for calling Valley Dental Clinic..."
3. **Press 1** — hear the appointments response
4. While waiting, briefly show the code:
   - `functions/voice/ivr-welcome.js` — TwiML with `<Gather>` for speech+DTMF
   - Point out: background recording starts automatically via `<Start><Recording>`

### Script
> "This is a standard voice IVR — speech recognition and DTMF input, running on Twilio Functions. It's a deployed serverless function — no infrastructure to manage. Notice the call is automatically recorded in the background for quality assurance."

### Key Talking Point
> "12 lines of TwiML config produces a production-ready IVR with speech recognition."

### If Something Goes Wrong
- If no answer: verify webhook URL in Console, try again
- If busy signal: check ngrok isn't intercepting (IVR should use deployed URL)

---

## Segment 2: MCP Tools + Deep Validation (2:00 - 4:00)

### Context
> "Now let me show how AI agents interact with Twilio. We have 310 MCP tools that Claude Code can use directly."

### Demo Actions
1. In Claude Code, type: **"Send an SMS to +12062021014 saying 'Hello from the Feature Factory demo'"**
2. Watch Claude invoke the `send_sms` MCP tool
3. Point out the message SID in the response
4. Type: **"Now validate that message was delivered"**
5. Watch Claude invoke `validate_message` — show the multi-signal output

### Script
> "310 Twilio tools available to the AI agent — messaging, voice, recordings, conferences, TaskRouter, Sync, Verify, and more. But sending a message is table stakes. What's interesting is deep validation."
>
> "We don't trust HTTP 200. The validator checks debugger logs, delivery status, carrier info, and content quality. If something's wrong, it tells you exactly what."

### Key Talking Point
> "Deep validation catches issues that status codes miss — carrier rejections, content filter blocks, number formatting problems."

### If Something Goes Wrong
- If SMS fails (AU1 region): switch to showing `validate_call` on a recent call SID
- If MCP tools unavailable: show the tool list and validation code instead

---

## Segment 3: ConversationRelay AI Voice (4:00 - 6:00)

### Context
> "This is the most impressive part — real-time voice AI. Not press-1 menus. Natural conversation."

### Setup
- Verify ngrok is active: `curl -s localhost:4040/api/tunnels`
- Phone number webhook should point to ngrok URL + `/conversation-relay/ai-assistant-inbound`

### Demo Actions
1. **Call `+12069666002` on speaker**
2. Have a brief conversation with the AI (pizza ordering, appointment scheduling, etc.)
3. After ~30 seconds, hang up
4. Mention: "Behind the scenes, that call is now being recorded, transcribed, and analyzed."

### Script
> "That's Claude powering a real phone call — bidirectional audio, real-time transcription, natural speech. The caller has no idea they're talking to an AI.
>
> After the call, Twilio automatically records it, Voice Intelligence transcribes it with speaker labels, and operators run sentiment analysis and summarization."

### Key Talking Point
> "Real-time voice AI in production, with full post-call analytics pipeline."

### Tier 1 Fallback (ngrok dies)
- Switch to IVR demo: "Let me show the traditional approach while I reconnect"
- Call `+12069666002` — IVR works from deployed build

### Tier 2 Fallback (no ngrok)
- Show pre-captured transcript: `docs/demo-assets/conversation-relay-transcript.md`
- Walk through the architecture: `docs/demo-assets/demo-flow-diagram.md`

### Tier 3 Fallback (no connectivity)
- Walk through transcript and diagram from files
- Show the validation output example

---

## Segment 4: Quality System (6:00 - 8:00)

### Context
> "AI agents writing code is powerful but risky. Here's how we keep them safe."

### Demo Actions
1. Show the hooks directory: `ls .claude/hooks/`
2. Describe the key hooks:
   - **TDD enforcement**: "Tests must fail first — the agent can't skip straight to implementation"
   - **Credential scanning**: "Hardcoded Account SIDs get blocked at write time"
   - **Coverage gates**: "Deployment requires 80% code coverage"
3. Run tests: `npm test` — show 365 green tests in ~26 seconds
4. Optional: show a hook blocking a bad commit (if time allows)

### Script
> "We have 8 hooks that fire on every tool call — before writes, before bash commands, before commits. They enforce TDD, scan for credentials, gate deployments on coverage, and track documentation drift.
>
> The key insight: these aren't optional. Even in autonomous mode where the agent works unattended, these gates fire. The agent can't `--no-verify` its way past them."

### Key Talking Point
> "365 tests, 92%+ coverage, enforced by hooks that the agent cannot bypass."

### If Something Goes Wrong
- This segment is entirely local — always works. No external dependencies.

---

## Segment 5: Feature Factory / Autonomous Development (8:00 - 10:00)

### Context
> "Everything I've shown can be orchestrated autonomously. You describe what you want, walk away, come back to working code."

### Demo Actions
1. Describe the pipeline: **architect → spec → test-gen → dev → review → docs**
2. Show the CLI: `npx feature-factory --help` (or describe it)
3. Mention key capabilities:
   - 7 specialized agents, each with constrained tools
   - Budget controls and stall detection
   - Git checkpoints for rollback
   - Learning capture — findings from each session feed into the next
4. Close with dogfood results: "We used the factory to build itself — 39 findings across 8 use cases, all resolved"

### Script
> "The Feature Factory is a 7-agent TDD pipeline. You give it a prose description — 'Add SMS verification to the signup flow' — and it runs architect, spec writer, test generator, developer, reviewer, and docs writer in sequence.
>
> Each agent has constrained tools — the test generator can't edit implementation files, the developer can't skip tests. There's a budget cap, stall detection if an agent gets stuck, and git checkpoints for rollback.
>
> We dogfooded this on 8 Twilio use cases — voice IVR, outbound dialing, call tracking, conferencing, ConversationRelay, SMS, verification, TaskRouter. All 8 built successfully. The 39 findings from that process were fed back to improve the tools."

### Key Talking Point
> "Prose in, working Twilio prototype out. With test coverage, documentation, and quality gates enforced throughout."

### If Something Goes Wrong
- This segment is descriptive — always works. No live execution needed.
- If someone asks for a live run: "A full pipeline takes 10-15 minutes. I can kick one off now and we can check on it after."

---

## Closing (if time)

> "310 MCP tools. 365 tests. 42 deployed functions. 8 quality gate hooks. One command to start a demo, one command to build a new feature. Questions?"

---

## Quick Reference

| What | Number |
|------|--------|
| MCP tools | 310 |
| Passing tests | 365 |
| Deployed functions | 42 |
| Quality gate hooks | 8 |
| Dogfood use cases | 8/8 successful |
| Test coverage | 92%+ statements |
| API domains covered | 21/21 |
