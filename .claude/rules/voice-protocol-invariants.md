---
paths:
  - "functions/conversation-relay/**"
  - "functions/voice/**"
  - "functions/pay/**"
---

# Voice & ConversationRelay Protocol Invariants

Rules that have each caused real debugging time loss. See domain CLAUDE.md files for full context.

<architectural_invariants>
- **ConversationRelay uses `last`, not `isFinal`** — Protocol sends `{ last: true }`. Checking `isFinal` silently drops all follow-up utterances.
- **Google Neural voices for ConversationRelay** — Polly voices may be blocked (error 64101). Use `Google.en-US-Neural2-F` as default.
- **Voice Intelligence: `source_sid`, not `media_url`** — Use Recording SID for transcript creation. `media_url` requires auth the Intelligence API can't provide.
</architectural_invariants>
