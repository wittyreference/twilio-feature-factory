# Helper Functions

This directory contains shared private utilities used by other serverless functions.

## Functions

| Function | Purpose |
|----------|---------|
| `twilio-client.private.js` | Shared Twilio client initialization with API Key/Secret or Auth Token fallback |

## Access Level

All helpers use the `.private.js` suffix, meaning they are only callable from other Functions — never directly via HTTP.

## Usage

```javascript
const { getTwilioClient } = require(Runtime.getFunctions()['helpers/twilio-client'].path);

const client = getTwilioClient(context);
```

## Authentication Priority

`getTwilioClient` prefers API Key/Secret credentials over Account SID/Auth Token:

1. If `TWILIO_API_KEY` and `TWILIO_API_SECRET` are set, uses those (recommended for production)
2. Falls back to `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`
