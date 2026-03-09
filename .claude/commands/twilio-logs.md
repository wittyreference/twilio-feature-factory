# Twilio Logs Analyzer

Fetch and analyze Twilio debugger logs to identify issues. Uses MCP tools for structured, SID-targeted analysis.

## Strategy: SID-First

Always start with the most targeted tool available:

### Have a specific resource SID?

Use the domain-specific validation tool for deep analysis:

| Resource | Tool | What You Get |
|----------|------|-------------|
| Call (`CA...`) | `validate_call(callSid)` | Status + notifications + Voice Insights + recordings |
| Message (`SM...`) | `validate_message(messageSid)` | Delivery status + debugger alerts |
| Recording (`RE...`) | `validate_recording(recordingSid)` | Completion status + duration |
| Transcript (`GT...`) | `validate_transcript(transcriptSid)` | Completion + sentences |
| Any resource SID | `validate_debugger(resourceSid: "XX...")` | Debugger alerts filtered to that resource |

### Investigating a time window?

- `get_debugger_logs(limit, startDate, endDate)` — list alerts in a window
- `analyze_errors` — automatic pattern detection and error grouping

### General health check?

- `validate_debugger(lookbackSeconds: 300)` — recent alerts across the account

### CLI fallback (human debugging only)

```bash
twilio debugger:logs:list --limit 20
twilio debugger:logs:list --limit 50 --start-date "YYYY-MM-DD"
```

Use CLI only for interactive human debugging sessions, not agent workflows.

## Analysis Focus

### Error Categories
1. **Authentication Errors**: Invalid credentials, expired tokens
2. **Webhook Failures**: Unreachable URLs, timeouts, invalid TwiML
3. **Rate Limiting**: Too many requests
4. **Invalid Parameters**: Malformed phone numbers, missing required fields
5. **Account Issues**: Insufficient funds, suspended numbers

### For Each Error Found

Provide:
- **Timestamp**: When the error occurred
- **Error Code**: Twilio error code
- **Error Message**: Description of the error
- **Resource**: What was being accessed (call, message, etc.)
- **Likely Cause**: What probably caused this
- **Suggested Fix**: How to resolve it

## Common Twilio Error Codes

| Code | Meaning | Common Fix |
|------|---------|------------|
| 11200 | HTTP retrieval failure | Check webhook URL is accessible |
| 11205 | HTTP connection failure | Verify server is running |
| 11750 | TwiML parse error | Validate TwiML syntax |
| 20003 | Authentication error | Check credentials |
| 21211 | Invalid phone number | Use E.164 format |
| 21408 | Permission denied | Check geo permissions |
| 30003 | Unreachable destination | Verify recipient number |

## Report Format

### Summary
- Total errors found
- Error breakdown by type
- Time range of logs

### Critical Issues
Errors that need immediate attention

### Warnings
Non-critical issues to be aware of

### Recommendations
Actionable steps to improve reliability

## Additional Context

<user_request>
$ARGUMENTS
</user_request>
