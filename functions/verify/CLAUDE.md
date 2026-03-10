<!-- ABOUTME: Essential context for Twilio Verify functions — OTP verification across channels. -->
<!-- ABOUTME: Covers file inventory, API reference, channels, status values, and FriendlyName gotcha. -->

# Verify Functions Context

This directory contains Twilio Verify API functions for phone number and email verification.

**For complete reference, see [REFERENCE.md](./REFERENCE.md).**

## Files

| File | Access | Description |
|------|--------|-------------|
| `start-verification.protected.js` | Protected | Sends a one-time passcode via SMS, voice, or email |
| `check-verification.protected.js` | Protected | Validates a user-submitted verification code |

## What is Twilio Verify?

Twilio Verify provides a complete solution for sending and verifying one-time passcodes (OTPs) across multiple channels:
- SMS
- Voice calls
- Email
- WhatsApp
- TOTP (authenticator apps)

## Quick API Reference

```javascript
const client = context.getTwilioClient();

// Start verification
const verification = await client.verify.v2
  .services(context.TWILIO_VERIFY_SERVICE_SID)
  .verifications.create({ to: '+1234567890', channel: 'sms' });

// Check verification
const check = await client.verify.v2
  .services(context.TWILIO_VERIFY_SERVICE_SID)
  .verificationChecks.create({ to: '+1234567890', code: '123456' });
```

## Channels

| Channel | Description | Destination Format |
|---------|-------------|-------------------|
| `sms` | SMS text message | E.164 phone number |
| `call` | Voice phone call | E.164 phone number |
| `email` | Email message | Email address |
| `whatsapp` | WhatsApp message | E.164 phone number |

## Verification Status Values

| Status | Meaning |
|--------|---------|
| `pending` | Code sent, awaiting verification |
| `approved` | Code correct, verification successful |
| `canceled` | Verification was canceled |
| `max_attempts_reached` | Too many incorrect attempts |
| `expired` | Verification code has expired |

## Key Error Codes

| Code | Description |
|------|-------------|
| `60200` | Invalid parameter (also: FriendlyName has 5+ total digits) |
| `60202` | Max send attempts reached |
| `60203` | Max check attempts reached |
| `60212` | Verification expired |
| `60223` | Phone number not valid |

See [REFERENCE.md](./REFERENCE.md) for full error handling patterns and code samples.

## Environment Variables

```
TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Best Practices

1. **Use Rate Limiting**: Prevent abuse by limiting verification attempts per phone number
2. **Implement Retry Logic**: Offer voice fallback after SMS failures
3. **Handle Timeouts**: Codes expire; inform users clearly
4. **Secure Endpoints**: Use `.protected.js` for all verification endpoints
5. **Log Attempts**: Track verification attempts for security monitoring

## Gotchas

- **Verify Service FriendlyName rejects 5+ total digits** -- The Verify API returns error 60200 ("Invalid parameter: FriendlyName") if the name contains 5 or more digit characters total, even if non-consecutive. Names like `my-service-12345` or `svc-1a2b3c4d5e` will fail. Use alpha-only suffixes for programmatic names: `echo "$TIMESTAMP" | md5 | tr '0-9' 'g-p' | head -c 8`
