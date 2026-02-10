# Documentation Assertion Verification

This skill provides guidance for verifying technical assertions when writing or reviewing documentation about Twilio APIs.

## Why This Matters

Incorrect assertions in documentation cause architectural mistakes. Example: Claiming "TwiML-started recordings cannot be controlled via API" when they actually can - this could lead developers to implement unnecessary workarounds.

## High-Risk Assertion Types

These claim types require verification before writing:

| Type | Example | Risk Level |
|------|---------|------------|
| **Negative behavioral** | "X cannot do Y", "not supported" | Highest |
| **Absolute claims** | "always", "never", "must", "only" | High |
| **Hard limits** | "max 16KB", "up to 4 streams" | High |
| **Timing claims** | "available after 2 minutes" | Medium |
| **Default values** | "default timeout is 30 seconds" | Medium |

## Verification Workflow

### Before Writing a Claim

1. **Identify the claim type** - Is it a limit, behavior, or default?
2. **Search official Twilio docs** at twilio.com/docs
3. **Find authoritative source** - API reference > guides > blog posts
4. **Add citation** or mark as unverified

### Citation Format

```markdown
<!-- verified: https://www.twilio.com/docs/voice/api/recording -->
```

For unverified claims (avoid these when possible):

```markdown
<!-- UNVERIFIED: based on testing, no official source found -->
```

### If No Source Found

Options in order of preference:
1. **Don't make the claim** - safest option
2. **Ask the user to verify** from domain expertise
3. **Mark as UNVERIFIED** with clear explanation
4. **Test and document** the behavior, noting it's observed not documented

## Red Flag Patterns

Words that should trigger verification:

### Negative Assertions (Highest Risk)
- "cannot", "can't", "unable to"
- "not possible", "impossible"
- "not supported", "not available"
- "does not", "doesn't"

### Absolute Claims (High Risk)
- "always", "never"
- "must", "only", "required"
- "guaranteed", "ensures"

### Numeric Limits (High Risk)
- "max", "maximum", "up to"
- "at least", "minimum"
- "limit", "restricted to"
- Specific numbers without source

## Verification Sources (Priority Order)

1. **Twilio API Reference** (twilio.com/docs/api) - Most authoritative
2. **Twilio Product Docs** (twilio.com/docs) - Generally reliable
3. **Twilio Console** - Shows current limits/settings
4. **Twilio SDK Source** (github.com/twilio) - Implementation details
5. **Twilio Community/Blog** - Less authoritative, may be outdated

## Example Verification

**Claim to verify:** "Up to 4 unidirectional streams per call"

**Search:** "twilio media streams limits"

**Found:** twilio.com/docs/voice/media-streams → "You can have up to 4 concurrent Media Streams..."

**Result:** Add citation:
```markdown
- Up to 4 unidirectional `<Start><Stream>` per call <!-- verified: twilio.com/docs/voice/media-streams -->
```

## When Reviewing Documentation

Check for:
- [ ] Negative assertions have citations
- [ ] Numeric limits have citations
- [ ] Absolute claims have citations
- [ ] Any `<!-- UNVERIFIED -->` markers are justified
- [ ] No high-risk claim types without citations

## Integration with Hooks

The `pre-write-validate.sh` hook will warn (not block) when it detects:
- Negative behavioral claims in CLAUDE.md or skill files
- Absolute claims about Twilio APIs
- Numeric limits without citation comments

This is a reminder to verify, not enforcement. The hook cannot determine if claims are actually verified.
