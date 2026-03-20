---
paths:
  - ".env*"
  - "scripts/**"
  - ".mcp.json"
  - "agents/**"
  - ".claude/**"
---

# Environment & Auth Invariants

Rules that have each caused real debugging time loss. See `.claude/references/operational-gotchas.md` for full context.

<architectural_invariants>
- **CLI profile and `.env` are independent** — CLI profile can point to main account while `.env` has subaccount SID. Check both before operations.
- **MCP server inherits env at launch, not runtime** — Changing `.env` or exporting variables mid-session does NOT update MCP tools. Must restart Claude Code entirely.
- **`source .env` doesn't undo commented-out vars** — Shell retains values after commenting out lines. Must explicitly `unset` each variable before re-sourcing.
- **SDK auto-reads `TWILIO_REGION`/`TWILIO_EDGE` from env** — Setting these in `.env` silently routes all API calls to regional endpoints. US1 auth tokens fail with 401 on regional endpoints. Comment out when not actively testing regions.
- **dotenv default mode doesn't override shell vars** — `require('dotenv').config()` skips vars already in `process.env`. All project dotenv calls use `{ override: true }` so `.env` always wins.
- **jq is required, not optional** — All 4 hook scripts (pre-write, pre-bash, post-write, post-bash) silently skip ALL validation when jq is absent. bootstrap.sh enforces jq installation. If a user reports that hooks aren't catching credential leaks or `--no-verify`, check jq first.
</architectural_invariants>
