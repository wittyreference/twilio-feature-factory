# Proxy Functions Context

This directory contains Twilio Proxy functions for anonymous number masking between participants.

## Files

| File | Access | Description |
|------|--------|-------------|
| `session-manager.protected.js` | Protected | Create/get/close proxy sessions via `action` param |
| `participant-manager.protected.js` | Protected | Add/list/remove participants in sessions via `action` param |
| `intercept-callback.protected.js` | Protected | Intercept webhook — logs and approves proxy interactions |

## What is Twilio Proxy?

Proxy enables anonymous communication between two parties (e.g., rider/driver, buyer/seller) through masked phone numbers. Neither party sees the other's real number.

## Session Flow

```
1. Create session → session-manager action=create
2. Add participant A (rider) → participant-manager action=add
3. Add participant B (driver) → participant-manager action=add
4. Twilio assigns proxy numbers to each participant
5. A calls/texts B's proxy number → routed to B's real number
6. B calls/texts A's proxy number → routed to A's real number
7. Close session when done → session-manager action=close
```

## Intercept Callback

The intercept callback fires before each interaction is connected:
- Return **200** to allow the interaction
- Return **403** to block the interaction
- Use for logging, rate limiting, or business rules

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TWILIO_PROXY_SERVICE_SID` | Yes | Proxy Service SID (starts with KS) |

## Session Modes

| Mode | Description |
|------|-------------|
| `voice-and-message` | Both calls and SMS (default) |
| `voice-only` | Calls only |
| `message-only` | SMS only |

## File Naming Conventions

- `*.protected.js` - Protected endpoints (require valid Twilio signature)
