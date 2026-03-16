# Self-Service Before Asking User

Use MCP tools to verify state before asking the user to check manually. Prefer SID-targeted tools over list-level tools, and MCP over CLI.

## SID-First Lookup Hierarchy

1. **Have a specific resource SID?** → Use the targeted `validate_*` or `get_*` tool:
   - Calls: `validate_call(callSid)` — status + notifications + Voice Insights
   - Messages: `validate_message(messageSid)` — delivery + debugger alerts
   - Recordings: `validate_recording(recordingSid)` — completion + duration
   - Transcripts: `validate_transcript(transcriptSid)` — completion + sentences
   - Tasks: `validate_task(taskSid)` — TaskRouter deep validation
   - Sync: `validate_sync_document(serviceSid, name)` / `validate_sync_list` / `validate_sync_map`
   - Video: `validate_video_room(roomSid)` — room + participants + tracks
   - Debugger (filtered): `validate_debugger(resourceSid: "CA...")` — alerts for one resource
   - SIP: `validate_sip(trunkSid, domainSid)` — infrastructure check
   - Environment: `validate_environment()` — account identity + credentials + service SIDs

2. **Need to discover/list?** → Use MCP list tools (structured JSON):
   - Deployed functions: `list_services`, `list_functions`
   - Phone numbers: `list_phone_numbers`
   - Workers: `list_workers`, `get_queue_statistics`
   - Flows: `list_studio_flows`
   - Debugger (broad): `get_debugger_logs`, `analyze_errors`
   - Rooms: `list_video_rooms`

3. **CLI-only operations** (no MCP equivalent):
   - Profile management: `twilio profiles:list`, `twilio profiles:use`
   - Deployment: `twilio serverless:deploy`

4. **Console-only** — NO REST API:
   - Pay Connectors: This is the one thing you DO need user to verify.

**General rule**: Check `.claude/references/tool-boundaries.md` for the SID-first principle and domain-specific guidance before asking user to verify anything.
