---
paths:
  - "functions/**"
  - "__tests__/**"
---

# Serverless Function Invariants

Rules that have each caused real debugging time loss. See domain CLAUDE.md files for full context.

<architectural_invariants>
- **`Twilio.Response.setBody()` requires strings** — Passing objects causes `Buffer.from(object)` TypeError. Always `JSON.stringify()` + Content-Type header. (~29 latent instances across voice/ and conversation-relay/)
- **`console.error()` → 82005 alerts** — Use `console.log()` for operational logging. Only `console.error()` in catch blocks. `console.warn()` → 82004.
- **Env vars can reset on deploy** — `twilio serverless:deploy` doesn't preserve runtime env vars. Always verify after deployment.
- **TwiML: one document controls a call at a time** — Updating a participant's TwiML exits their current state (conference, queue). Exception: `<Start><Stream>`, `<Start><Recording>`, `<Start><Siprec>` fork background processes.
- **`<Start><Recording>` syntax is `.recording()`, not `.record()`** — `twiml.start().recording({...})` is correct.
- **Empty `voiceUrl` on a Twilio number = silent instant call failure** — Calling a number with `voiceUrl: ""` produces `status: failed, duration: 0` with ZERO diagnostics. Always verify destination webhooks via `list_phone_numbers` before debugging call routing.
- **dotenv default mode doesn't override shell vars** — All project dotenv calls use `{ override: true }` so `.env` always wins. New dotenv usage must include `override: true`.
- **`<Pay>` silently ignored on outbound API call legs** — `<Pay>` in inline TwiML on `make_call` produces zero errors, zero callbacks. Must run from a phone number's voice URL webhook.
- **Conference DTMF is per-call, not cross-participant** — `<Play digits>` on one conference participant generates in-band audio. Cannot inject DTMF across conference participants.
- **Conference has no parent/child relationships** — Each participant is an independent call. One disconnecting doesn't affect others (unless `endConferenceOnExit=true`). Contrast with `<Dial>`-created calls where parent/child are coupled.
- **`<Pause>` as first TwiML verb = no-answer** — Webhook must produce audio (`<Say>`) before `<Pause>` to properly answer the call.
</architectural_invariants>
