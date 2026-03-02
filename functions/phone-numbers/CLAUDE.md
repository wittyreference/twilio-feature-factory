# Phone Numbers Functions Context

This directory contains Twilio phone number management functions for searching and managing owned numbers.

## Files

| File | Access | Description |
|------|--------|-------------|
| `search-numbers.protected.js` | Protected | Search available numbers by country, area code, capabilities |
| `manage-number.protected.js` | Protected | List/configure/release owned numbers via `action` param |

## Search Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `countryCode` | string | `US` | ISO country code (US, GB, AU, etc.) |
| `areaCode` | string | — | Area code to search within |
| `contains` | string | — | Pattern to match in number |
| `smsEnabled` | string | — | `true` to filter SMS-capable |
| `voiceEnabled` | string | — | `true` to filter voice-capable |
| `limit` | string | `10` | Max results (1-30) |

## Manage Actions

| Action | Required Params | Description |
|--------|----------------|-------------|
| `list` | — | List all owned numbers with webhook URLs |
| `configure` | `phoneNumberSid` + at least one URL | Update voice/SMS/status webhooks |
| `release` | `phoneNumberSid` | Release (delete) a phone number |

## Purchasing Numbers

Number purchasing is intentionally not included as a serverless function. Buying numbers has cost implications and should be done via the Twilio Console or CLI:

```bash
twilio api:core:incoming-phone-numbers:create --phone-number "+15551234567"
```

## File Naming Conventions

- `*.protected.js` - Protected endpoints (require valid Twilio signature)
