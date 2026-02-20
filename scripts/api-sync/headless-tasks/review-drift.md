# API Drift Review — Headless Task

You are reviewing the latest Twilio API drift report and proposing changes to keep our MCP tools current.

## Instructions

1. Read `scripts/api-sync/reports/latest.json` for the full drift report.

2. **Breaking changes** (highest priority):
   - For each breaking change, identify the affected MCP tool file.
   - Open the file and propose the fix.
   - These are urgent — breaking changes mean our current tools may not work correctly.

3. **Parameter drift** (medium priority):
   - For each tool with parameter drift (missing OAI params):
     - Open the tool file listed in `toolFile`.
     - Add the missing parameters to the Zod schema as optional fields.
     - Do NOT change the handler logic — just add the params to the schema and pass them through.
   - Run `tsc --noEmit` in `agents/mcp-servers/twilio/` after each batch of changes.

4. **New endpoints** (informational):
   - List new endpoints that belong to domains with existing MCP tools.
   - Create a summary of suggested new tools (do not implement them).

5. **Update reference docs** (low priority):
   - Read `.claude/references/twilio-cli.md`
   - If the drift report contains new endpoints in `twilio_api_v2010`:
     - Check if corresponding `twilio api:core:*` commands exist
     - Add missing command examples to the relevant section
   - If CLI version changed:
     - Note the version in the Quick Reference section
   - Guard rails:
     - Only append to existing sections (never restructure the file)
     - Only add entries for resources that have MCP tools
     - Keep additions under 20 lines per run
     - Include a comment `<!-- Added by api-drift review YYYY-MM-DD -->` for traceability
     - The file should remain under 1100 lines — run a sanity check

6. **Do NOT use slash commands** — they terminate headless sessions.
7. **Do NOT use AskUserQuestion** — no terminal in headless mode.

## Output

Create a branch `api-drift/v<VERSION>` with your changes and a summary file at
`scripts/api-sync/reports/drift-actions-<VERSION>.md` listing what you changed and what remains.
