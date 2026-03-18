# Compliance, Language Operators, and Enterprise Considerations

PII redaction, HIPAA, PCI, Language Operators, scaling limits, and HA/DR guidance.

See [SKILL.md](../SKILL.md) for the cross-cutting gotchas summary.

---

## PII Redaction and HIPAA Guidance

### Voice Intelligence PII Redaction

Voice Intelligence supports two levels of PII redaction:

| Type | Scope | Languages | How |
|------|-------|-----------|-----|
| **Text redaction** | Transcript text | All supported | Replaces PII with `[REDACTED]` in transcript sentences |
| **Audio redaction** | Recording audio | `en-US` only | Bleeps out PII segments in the audio file |

Configure via the Intelligence Service settings in Console or API:
- `pii_redaction_enabled: true` — enables text-level redaction
- `audio_redaction_enabled: true` — enables audio-level redaction (en-US only)

### HIPAA Considerations

- **BAA required**: You must have a Business Associate Agreement with Twilio before processing PHI
- **Recording storage**: Use recording encryption and set appropriate TTLs
- **Transcript access**: Restrict API key access to transcripts containing PHI
- **PII in logs**: Twilio debugger logs may contain phone numbers and partial message content; rotate API keys regularly

### PCI DSS

- **Never record card numbers**: Use `<Pay>` verb for payment capture; it handles PCI compliance
- **Recording pause**: If you must take payment during a recorded call, use `<Pause>` recording during payment segment
- **PCI Mode**: Enabling PCI Mode on a Twilio account is IRREVERSIBLE and account-wide

---

## Language Operator Configuration

Language Operators run post-processing on Voice Intelligence transcripts. Configure them on your Intelligence Service.

### Available Operator Types

| Type | Purpose | Example Output |
|------|---------|---------------|
| `text-generation` | Summarize or extract from transcript | Free-text summary |
| `classification` | Categorize into predefined labels | `"billing"`, `"support"`, `"sales"` |
| `extraction` | Pull structured entities | `{"name": "John", "account": "12345"}` |

### Configuration Example

Operators are attached to an Intelligence Service. When a transcript is created under that service, all attached operators run automatically.

```
Intelligence Service (GA...)
  └── Operator: "Call Summary" (text-generation)
  └── Operator: "Topic Classification" (classification, labels: billing/support/sales/other)
  └── Operator: "Entity Extraction" (extraction, entities: name/account/phone)
```

### Validation

Use `validate_language_operator` to verify operator results exist after transcript completion. Check:
- Operator result count matches expected operator count
- Text-generation results have non-empty content
- Classification results return valid labels

---

## Enterprise Considerations

### Scaling Limitations

Twilio Serverless Functions have built-in constraints relevant to production deployments:

| Limit | Value | Impact |
|-------|-------|--------|
| Concurrent executions | 30 per service | Contact centers with >30 simultaneous calls need multiple services or external compute |
| Execution timeout | 10 seconds | Long-running operations (transcription polling, multi-API orchestration) must use callbacks |
| Memory | 256 MB | Large audio processing should happen externally |
| Deployment size | 50 MB | Limit dependencies; use external packages via layers if needed |

### When Functions Aren't Enough

For production contact centers or high-volume voice applications, consider:
- **External compute** (AWS Lambda, GCP Cloud Functions, self-hosted) for webhook handlers
- **Twilio Functions for TwiML only** — keep webhook handlers thin, delegate business logic
- **Flex** for full-featured contact center with agent UI

### HA/DR Guidance

- **Multi-region**: Twilio processes calls in the region closest to the caller by default. For explicit region control, use `TWILIO_EDGE` environment variable
- **Failover webhooks**: Configure `voiceFallbackUrl` and `smsFallbackUrl` on phone numbers for webhook failure recovery
- **Status callbacks**: Always configure `statusCallback` on calls; without it, failures are silent
- **Recording redundancy**: Download recordings to your own storage; Twilio recordings have a default 0-day TTL (kept until manually deleted, but subject to account policies)
